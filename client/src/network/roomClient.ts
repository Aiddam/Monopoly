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
  HostChanged: (hostPeerId: string) => void;
  RoomClosed: () => void;
  ErrorMessage: (message: string) => void;
};

export class RoomClient {
  private connection?: signalR.HubConnection;
  private readonly handlers: Partial<{ [K in keyof RoomHandlerMap]: RoomHandlerMap[K][] }> = {};

  constructor(private readonly serverUrl = SIGNALR_SERVER_URL) {}

  get connectionId() {
    return this.connection?.connectionId;
  }

  on<K extends keyof RoomHandlerMap>(event: K, handler: RoomHandlerMap[K]) {
    this.handlers[event] = [...(this.handlers[event] ?? []), handler] as typeof this.handlers[K];
  }

  off<K extends keyof RoomHandlerMap>(event: K, handler: RoomHandlerMap[K]) {
    this.handlers[event] = (this.handlers[event] ?? []).filter((candidate) => candidate !== handler) as typeof this.handlers[K];
  }

  async connect() {
    if (this.connection?.state === signalR.HubConnectionState.Connected) return;

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${this.serverUrl}/hubs/rooms`)
      .withAutomaticReconnect()
      .build();

    (Object.keys(this.handlers) as (keyof RoomHandlerMap)[]).forEach((event) => {
      this.connection?.on(event, (...args: unknown[]) => {
        this.handlers[event]?.forEach((handler) => {
          (handler as (...received: unknown[]) => void)(...args);
        });
      });
    });

    await this.connection.start();
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

  async joinRoom(code: string, playerName: string, playerId?: string) {
    await this.connect();
    try {
      return await this.connection!.invoke<RoomSnapshot>('JoinRoom', code.toUpperCase(), playerName, playerId);
    } catch (error) {
      if (!isHubInvokeVersionError(error) || !playerId) throw error;
      return this.connection!.invoke<RoomSnapshot>('JoinRoom', code.toUpperCase(), playerName);
    }
  }

  async setReady(code: string, ready: boolean) {
    await this.connection?.invoke('SetReady', code.toUpperCase(), ready);
  }

  async relaySignal(code: string, toPeerId: string, kind: SignalPayload['kind'], payload: unknown) {
    await this.connection?.invoke('RelaySignal', code.toUpperCase(), toPeerId, kind, payload);
  }

  async leaveRoom(code?: string) {
    if (code) {
      await this.connection?.invoke('LeaveRoom', code.toUpperCase());
    }
  }

  async closeRoom(code: string) {
    await this.connection?.invoke('CloseRoom', code.toUpperCase());
  }
}

const isHubInvokeVersionError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("Failed to invoke");
