import * as signalR from '@microsoft/signalr';

export const SIGNALR_SERVER_URL = import.meta.env.VITE_SIGNALR_URL ?? 'http://localhost:5109';

export interface RoomPlayer {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  joinedAt: string;
  online?: boolean;
}

export interface RoomSnapshot {
  code: string;
  players: RoomPlayer[];
  testMode: boolean;
}

interface RoomJoinResult {
  room?: RoomSnapshot | null;
  error?: string | null;
}

export interface SignalPayload {
  fromPeerId: string;
  toPeerId: string;
  kind: 'offer' | 'answer' | 'ice';
  payload: unknown;
}

type RoomHandlerMap = {
  RoomSnapshot: (room: RoomSnapshot) => void;
  PeerJoined: (player: RoomPlayer) => void;
  PeerLeft: (playerId: string) => void;
  SignalReceived: (signal: SignalPayload) => void;
  GameMessage: (fromPeerId: string, message: unknown) => void;
  HostChanged: (hostPeerId: string) => void;
  RoomClosed: () => void;
  ErrorMessage: (message: string) => void;
};

export type RoomConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type ConnectionStateHandler = (status: RoomConnectionStatus, error?: Error) => void;

const ROOM_CONNECTION_NOT_READY_MESSAGE = 'Немає підключення до кімнати. Зачекайте перепідключення.';
const RECONNECT_DELAYS_MS = [0, 2_000, 5_000, 10_000, 30_000, 60_000];
const MANUAL_RECONNECT_DELAYS_MS = [1_000, 3_000, 8_000, 15_000, 30_000];

export class RoomClient {
  private connection?: signalR.HubConnection;
  private connectPromise?: Promise<void>;
  private manualReconnectTimer?: number;
  private manualReconnectAttempt = 0;
  private intentionallyStopped = false;
  private readonly handlers: Partial<{ [K in keyof RoomHandlerMap]: RoomHandlerMap[K][] }> = {};
  private readonly connectionStateHandlers: ConnectionStateHandler[] = [];
  private readonly reconnectedHandlers: Array<() => void> = [];

  constructor(private readonly serverUrl = SIGNALR_SERVER_URL) {}

  get connectionId() {
    return this.connection?.connectionId;
  }

  get isConnected() {
    return this.connection?.state === signalR.HubConnectionState.Connected;
  }

  on<K extends keyof RoomHandlerMap>(event: K, handler: RoomHandlerMap[K]) {
    this.handlers[event] = [...(this.handlers[event] ?? []), handler] as typeof this.handlers[K];
  }

  off<K extends keyof RoomHandlerMap>(event: K, handler: RoomHandlerMap[K]) {
    this.handlers[event] = (this.handlers[event] ?? []).filter((candidate) => candidate !== handler) as typeof this.handlers[K];
  }

  onConnectionState(handler: ConnectionStateHandler) {
    this.connectionStateHandlers.push(handler);
  }

  onReconnected(handler: () => void) {
    this.reconnectedHandlers.push(handler);
  }

  async connect() {
    if (this.connection?.state === signalR.HubConnectionState.Connected) return;
    if (this.connectPromise) return this.connectPromise;
    this.intentionallyStopped = false;
    if (
      this.connection?.state === signalR.HubConnectionState.Connecting ||
      this.connection?.state === signalR.HubConnectionState.Reconnecting
    ) {
      throw new Error(ROOM_CONNECTION_NOT_READY_MESSAGE);
    }

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${this.serverUrl}/hubs/rooms`)
      .withAutomaticReconnect(RECONNECT_DELAYS_MS)
      .build();
    this.connection.serverTimeoutInMilliseconds = 60_000;
    this.connection.keepAliveIntervalInMilliseconds = 15_000;

    this.connection.onreconnecting((error) => this.emitConnectionState('reconnecting', error));
    this.connection.onreconnected(() => {
      this.emitConnectionState('connected');
      this.reconnectedHandlers.forEach((handler) => handler());
    });
    this.connection.onclose((error) => this.emitConnectionState('disconnected', error));

    (Object.keys(this.handlers) as (keyof RoomHandlerMap)[]).forEach((event) => {
      this.connection?.on(event, (...args: unknown[]) => {
        this.handlers[event]?.forEach((handler) => {
          (handler as (...received: unknown[]) => void)(...args);
        });
      });
    });

    this.emitConnectionState('connecting');
    this.connectPromise = this.connection
      .start()
      .then(() => this.emitConnectionState('connected'))
      .finally(() => {
        this.connectPromise = undefined;
      });
    return this.connectPromise;
  }

  async createRoom(playerName: string, testMode = false, playerId?: string) {
    await this.connect();
    try {
      return await this.connection!.invoke<RoomSnapshot>('CreateRoom', playerName, testMode, playerId);
    } catch (error) {
      if (!isHubInvokeVersionError(error) || !playerId) throw error;
      return this.connection!.invoke<RoomSnapshot>('CreateRoom', playerName, testMode);
    }
  }

  async restoreRoom(previousRoom: RoomSnapshot, playerName: string, playerId: string) {
    await this.connect();
    return this.connection!.invoke<RoomSnapshot>('RestoreRoom', previousRoom, playerName, playerId);
  }

  async joinRoom(code: string, playerName: string, playerId?: string) {
    await this.connect();
    const roomCode = normalizeRoomCode(code);
    try {
      const result = await this.connection!.invoke<RoomJoinResult>('TryJoinRoom', roomCode, playerName, playerId);
      return unwrapRoomJoinResult(result);
    } catch (error) {
      if (!isHubInvokeVersionError(error)) throw error;
      return this.joinRoomLegacy(roomCode, playerName, playerId);
    }
  }

  async setReady(code: string, ready: boolean) {
    await this.invokeConnected('SetReady', normalizeRoomCode(code), ready);
  }

  async relaySignal(code: string, toPeerId: string, kind: SignalPayload['kind'], payload: unknown) {
    await this.invokeConnected('RelaySignal', normalizeRoomCode(code), toPeerId, kind, payload);
  }

  async broadcastGameMessage(code: string, message: unknown) {
    await this.invokeConnected('BroadcastGameMessage', normalizeRoomCode(code), message);
  }

  async leaveRoom(code?: string) {
    if (code) {
      await this.invokeConnected('LeaveRoom', normalizeRoomCode(code));
    }
    this.intentionallyStopped = true;
    this.clearManualReconnectTimer();
  }

  async closeRoom(code: string) {
    await this.invokeConnected('CloseRoom', normalizeRoomCode(code));
  }

  private async invokeConnected<T = void>(methodName: string, ...args: unknown[]): Promise<T> {
    if (!this.connection || !this.isConnected) {
      throw new Error(ROOM_CONNECTION_NOT_READY_MESSAGE);
    }
    return this.connection.invoke<T>(methodName, ...args);
  }

  private async joinRoomLegacy(roomCode: string, playerName: string, playerId?: string) {
    try {
      return await this.connection!.invoke<RoomSnapshot>('JoinRoom', roomCode, playerName, playerId);
    } catch (error) {
      if (!isHubInvokeVersionError(error) || !playerId) throw error;
      return this.connection!.invoke<RoomSnapshot>('JoinRoom', roomCode, playerName);
    }
  }

  private emitConnectionState(status: RoomConnectionStatus, error?: Error) {
    this.connectionStateHandlers.forEach((handler) => handler(status, error));
    if (status === 'connected') {
      this.manualReconnectAttempt = 0;
      this.clearManualReconnectTimer();
      return;
    }
    if (status === 'disconnected' && !this.intentionallyStopped) {
      this.scheduleManualReconnect();
    }
  }

  private scheduleManualReconnect() {
    if (this.manualReconnectTimer !== undefined) return;

    const delay =
      MANUAL_RECONNECT_DELAYS_MS[Math.min(this.manualReconnectAttempt, MANUAL_RECONNECT_DELAYS_MS.length - 1)];
    this.manualReconnectAttempt += 1;
    this.manualReconnectTimer = window.setTimeout(() => {
      this.manualReconnectTimer = undefined;
      this.connect().catch(() => this.scheduleManualReconnect());
    }, delay);
  }

  private clearManualReconnectTimer() {
    if (this.manualReconnectTimer === undefined) return;
    window.clearTimeout(this.manualReconnectTimer);
    this.manualReconnectTimer = undefined;
  }
}

export const isRoomConnectionNotReadyError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message === ROOM_CONNECTION_NOT_READY_MESSAGE ||
    error.message.includes("Cannot send data if the connection is not in the 'Connected' State"));

export const isTransientSignalRDisconnect = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes('WebSocket closed with status code: 1006') ||
    error.message.includes('Server timeout elapsed') ||
    error.message.includes('Connection disconnected with error'));

const normalizeRoomCode = (code: string) => code.trim().toUpperCase();

const unwrapRoomJoinResult = (result: RoomJoinResult): RoomSnapshot => {
  if (result.room) return result.room;
  throw new Error(result.error || 'Не вдалося приєднатися до кімнати.');
};

const isHubInvokeVersionError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes('Invocation provides') ||
    error.message.includes('could not be resolved') ||
    error.message.includes('does not exist'));
