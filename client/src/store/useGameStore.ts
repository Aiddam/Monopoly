import { create } from 'zustand';
import { createInitialGame, MAX_PLAYERS, MIN_PLAYERS, reduceGame } from '../engine/gameEngine';
import type { GameAction, GameState } from '../engine/types';
import { PeerMesh, type PeerMessage } from '../network/peerMesh';
import {
  isRoomConnectionNotReadyError,
  RoomClient,
  type RoomPlayer,
  type RoomSnapshot,
  type SignalPayload,
} from '../network/roomClient';

type Screen = 'home' | 'lobby' | 'game' | 'finished';

interface ConnectionState {
  signalr: 'idle' | 'connecting' | 'connected' | 'error';
  p2p: Record<string, boolean>;
  error?: string;
}

interface GameStore {
  screen: Screen;
  localPlayerId?: string;
  playerName?: string;
  room?: RoomSnapshot;
  roomClient?: RoomClient;
  peerMesh?: PeerMesh;
  connection: ConnectionState;
  game?: GameState;
  resumeSavedSession: () => Promise<void>;
  createRoom: (playerName: string, testMode?: boolean) => Promise<void>;
  joinRoom: (code: string, playerName: string) => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  startLocalDemo: () => void;
  startRoomGame: () => void;
  dispatch: (action: GameAction, fromPeer?: boolean) => void;
  applyRemoteMessage: (message: PeerMessage, fromPeerId: string) => void;
  leaveRoom: () => Promise<void>;
}

interface SavedSession {
  version: 1;
  mode: 'local' | 'room';
  screen: Screen;
  localPlayerId?: string;
  playerName?: string;
  room?: RoomSnapshot;
  game?: GameState;
  savedAt: number;
}

const SESSION_STORAGE_KEY = 'ukraine-monopoly-session-v1';
const ROOM_NOT_FOUND_MESSAGE = 'Кімнату не знайдено. Якщо сервер Render перезапустився, створіть нову кімнату.';

function readSavedSession(): SavedSession | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SavedSession;
    if (parsed.version !== 1) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

const savedSession = readSavedSession();

export const useGameStore = create<GameStore>((set, get) => ({
  screen: savedSession?.screen ?? 'home',
  localPlayerId: savedSession?.localPlayerId,
  playerName: savedSession?.playerName,
  room: savedSession?.room,
  game: savedSession?.game,
  connection: { signalr: 'idle', p2p: {} },

  async resumeSavedSession() {
    const saved = readSavedSession();
    if (!saved) return;

    if (saved.mode === 'local') {
      set({
        screen: saved.screen,
        localPlayerId: saved.localPlayerId,
        playerName: saved.playerName,
        game: saved.game,
        room: undefined,
        connection: { signalr: 'idle', p2p: {} },
      });
      return;
    }

    if (!saved.room || !saved.localPlayerId) return;
    const roomClient = configureRoomClient();
    set({
      screen: saved.game ? 'game' : 'lobby',
      localPlayerId: saved.localPlayerId,
      playerName: saved.playerName,
      room: saved.room,
      game: saved.game,
      roomClient,
      connection: { signalr: 'connecting', p2p: {} },
    });

    try {
      const room = await roomClient.joinRoom(saved.room.code, saved.playerName ?? 'Гравець', saved.localPlayerId);
      const localPlayerId = resolveLocalPlayerId(room, saved.localPlayerId);
      const peerMesh = configurePeerMesh(localPlayerId, roomClient, room.code);
      await peerMesh.syncPeers(room.players);
      const nextScreen = saved.game ? 'game' : 'lobby';
      set({ screen: nextScreen, room, localPlayerId, peerMesh, connection: { signalr: 'connected', p2p: {} } });
      saveSession({ ...saved, screen: nextScreen, localPlayerId, room });

      window.setTimeout(() => peerMesh.broadcast({ type: 'sync:request' }), 800);
      window.setTimeout(() => peerMesh.broadcast({ type: 'sync:request' }), 2_000);
    } catch (error) {
      if (isRoomNotFoundError(error)) {
        clearSavedSession();
        set({
          screen: 'home',
          room: undefined,
          game: undefined,
          connection: { signalr: 'error', p2p: {}, error: ROOM_NOT_FOUND_MESSAGE },
        });
        return;
      }
      set({ connection: { signalr: 'error', p2p: {}, error: errorMessage(error) } });
    }
  },

  async createRoom(playerName, testMode = false) {
    const localPlayerId = createStablePlayerId();
    const roomClient = configureRoomClient();
    set({ connection: { signalr: 'connecting', p2p: {} }, roomClient, playerName, localPlayerId });
    try {
      const room = await roomClient.createRoom(playerName, testMode, localPlayerId);
      const resolvedLocalPlayerId = resolveLocalPlayerId(room, localPlayerId);
      const peerMesh = configurePeerMesh(resolvedLocalPlayerId, roomClient, room.code);
      await peerMesh.syncPeers(room.players);
      set({ screen: 'lobby', room, localPlayerId: resolvedLocalPlayerId, peerMesh, connection: { signalr: 'connected', p2p: {} } });
      persistCurrentSession(get());
    } catch (error) {
      set({ connection: { signalr: 'error', p2p: {}, error: errorMessage(error) } });
    }
  },

  async joinRoom(code, playerName) {
    const localPlayerId = createStablePlayerId();
    const roomClient = configureRoomClient();
    set({ connection: { signalr: 'connecting', p2p: {} }, roomClient, playerName, localPlayerId });
    try {
      const room = await roomClient.joinRoom(code, playerName, localPlayerId);
      const resolvedLocalPlayerId = resolveLocalPlayerId(room, localPlayerId, room.players.at(-1)?.id);
      const peerMesh = configurePeerMesh(resolvedLocalPlayerId, roomClient, room.code);
      await peerMesh.syncPeers(room.players);
      set({ screen: 'lobby', room, localPlayerId: resolvedLocalPlayerId, peerMesh, connection: { signalr: 'connected', p2p: {} } });
      persistCurrentSession(get());
    } catch (error) {
      if (isRoomNotFoundError(error)) {
        clearSavedSession();
        set({ connection: { signalr: 'error', p2p: {}, error: ROOM_NOT_FOUND_MESSAGE } });
        return;
      }
      set({ connection: { signalr: 'error', p2p: {}, error: errorMessage(error) } });
    }
  },

  async setReady(ready) {
    const { room, roomClient } = get();
    try {
      if (room) await roomClient?.setReady(room.code, ready);
    } catch (error) {
      setConnectionError(error);
    }
  },

  startLocalDemo() {
    const game = createInitialGame(['Олена', 'Тарас', 'Марія'], 'local-demo');
    set({ screen: 'game', localPlayerId: game.currentPlayerId, playerName: 'Олена', room: undefined, game });
    persistCurrentSession(get());
  },

  startRoomGame() {
    const { room, localPlayerId, peerMesh, roomClient } = get();
    if (!room || !localPlayerId) return;
    const localPlayer = room.players.find((player) => player.id === localPlayerId);
    if (!localPlayer?.isHost) return;
    const game = createInitialGame(room.players.map((player) => player.name), `room-${room.code}`);
    const remapped = {
      ...game,
      players: game.players.map((player, index) => ({ ...player, id: room.players[index].id })),
      currentPlayerId: room.players[0].id,
    };
    broadcastRoomMessage(room, roomClient, peerMesh, { type: 'game:init', state: remapped });
    set({ game: remapped, screen: 'game' });
    persistCurrentSession(get());
  },

  dispatch(action, fromPeer = false) {
    const { game, peerMesh, room, roomClient, localPlayerId } = get();
    if (!game) return;
    const isHost = !room || room.players.find((player) => player.id === localPlayerId)?.isHost;

    if (!isHost && !fromPeer) {
      broadcastRoomMessage(room, roomClient, peerMesh, { type: 'game:action', action });
      return;
    }

    try {
      const next = reduceGame(game, action);
      broadcastRoomMessage(room, roomClient, peerMesh, { type: 'game:state', state: next });
      set({ game: next, screen: next.phase === 'finished' ? 'finished' : 'game' });
      persistCurrentSession(get());
    } catch (error) {
      set({ connection: { ...get().connection, error: errorMessage(error) } });
    }
  },

  applyRemoteMessage(message, _fromPeerId) {
    const { game, room, localPlayerId, peerMesh } = get();
    const isHost = room?.players.find((player) => player.id === localPlayerId)?.isHost;
    if (message.type === 'game:init' || message.type === 'game:state') {
      set({ game: message.state, screen: message.state.phase === 'finished' ? 'finished' : 'game' });
      persistCurrentSession(get());
    }
    if (message.type === 'game:action' && isHost) {
      get().dispatch(message.action, true);
    }
    if (message.type === 'sync:request' && isHost && game) {
      broadcastRoomMessage(room, get().roomClient, peerMesh, { type: 'sync:response', state: game });
    }
    if (message.type === 'sync:response') {
      set({ game: message.state, screen: 'game' });
      persistCurrentSession(get());
    }
  },

  async leaveRoom() {
    const { room, roomClient, peerMesh } = get();
    peerMesh?.close();
    try {
      await roomClient?.leaveRoom(room?.code);
    } catch {
      // If SignalR is already gone, local cleanup still needs to complete.
    }
    set({
      screen: 'home',
      room: undefined,
      game: undefined,
      localPlayerId: undefined,
      playerName: undefined,
      peerMesh: undefined,
      connection: { signalr: 'idle', p2p: {} },
    });
    clearSavedSession();
  },
}));

const configureRoomClient = () => {
  const roomClient = new RoomClient();
  roomClient.onConnectionState((status, error) => {
    const connection = useGameStore.getState().connection;
    if (status === 'connected') {
      useGameStore.setState({ connection: { signalr: 'connected', p2p: connection.p2p } });
      return;
    }
    if (status === 'connecting' || status === 'reconnecting') {
      useGameStore.setState({ connection: { signalr: 'connecting', p2p: connection.p2p } });
      return;
    }
    useGameStore.setState({
      connection: {
        signalr: 'error',
        p2p: connection.p2p,
        error: error ? errorMessage(error) : 'Зʼєднання з кімнатою втрачено.',
      },
    });
  });
  roomClient.onReconnected(() => {
    void rejoinCurrentRoom(roomClient);
  });
  roomClient.on('RoomSnapshot', (room) => {
    const { peerMesh } = useGameStore.getState();
    void peerMesh?.syncPeers(room.players);
    useGameStore.setState({ room });
    persistCurrentSession(useGameStore.getState());
  });
  roomClient.on('PeerLeft', (playerId) => {
    useGameStore.getState().peerMesh?.removePeer(playerId);
  });
  roomClient.on('SignalReceived', (signal: SignalPayload) => {
    void useGameStore
      .getState()
      .peerMesh?.handleSignal(signal)
      .catch((error) => {
        if (!isRoomConnectionNotReadyError(error)) setConnectionError(error);
      });
  });
  roomClient.on('GameMessage', (fromPeerId, message) => {
    useGameStore.getState().applyRemoteMessage(message as PeerMessage, fromPeerId);
  });
  roomClient.on('HostChanged', (hostPeerId) => {
    const { room } = useGameStore.getState();
    if (!room) return;
    useGameStore.setState({
      room: {
        ...room,
        players: room.players.map((player) => ({ ...player, isHost: player.id === hostPeerId })),
      },
    });
    persistCurrentSession(useGameStore.getState());
  });
  roomClient.on('RoomClosed', () => {
    useGameStore.setState({ screen: 'home', room: undefined, game: undefined });
    clearSavedSession();
  });
  roomClient.on('ErrorMessage', (message) => {
    useGameStore.setState({ connection: { ...useGameStore.getState().connection, error: message } });
  });
  return roomClient;
};

const rejoinCurrentRoom = async (roomClient: RoomClient) => {
  const { room, localPlayerId, playerName, peerMesh, game } = useGameStore.getState();
  if (!room || !localPlayerId) return;

  try {
    const nextRoom = await roomClient.joinRoom(room.code, playerName ?? 'Гравець', localPlayerId);
    const nextPeerMesh = peerMesh ?? configurePeerMesh(localPlayerId, roomClient, nextRoom.code);
    await nextPeerMesh.syncPeers(nextRoom.players);
    useGameStore.setState({
      room: nextRoom,
      peerMesh: nextPeerMesh,
      connection: { signalr: 'connected', p2p: useGameStore.getState().connection.p2p },
    });
    persistCurrentSession(useGameStore.getState());

    const localPlayer = nextRoom.players.find((player) => player.id === localPlayerId);
    if (localPlayer?.isHost && game) {
      broadcastRoomMessage(nextRoom, roomClient, nextPeerMesh, { type: 'game:state', state: game });
    }
  } catch (error) {
    setConnectionError(isRoomNotFoundError(error) ? new Error(ROOM_NOT_FOUND_MESSAGE) : error);
  }
};

const configurePeerMesh = (localPlayerId: string, roomClient: RoomClient, roomCode: string) => {
  const peerMesh = new PeerMesh(localPlayerId, (toPeerId, kind, payload) =>
    roomClient.relaySignal(roomCode, toPeerId, kind, payload),
  );
  peerMesh.onMessage((message, fromPeerId) => useGameStore.getState().applyRemoteMessage(message, fromPeerId));
  peerMesh.onStatus((peerId, connected) => {
    const connection = useGameStore.getState().connection;
    useGameStore.setState({ connection: { ...connection, p2p: { ...connection.p2p, [peerId]: connected } } });
  });
  return peerMesh;
};

const broadcastRoomMessage = (
  room: RoomSnapshot | undefined,
  roomClient: RoomClient | undefined,
  peerMesh: PeerMesh | undefined,
  message: PeerMessage,
) => {
  if (room && roomClient) {
    if (!roomClient.isConnected) {
      peerMesh?.broadcast(message);
      const connection = useGameStore.getState().connection;
      useGameStore.setState({ connection: { signalr: 'connecting', p2p: connection.p2p } });
      return;
    }

    void roomClient.broadcastGameMessage(room.code, message).catch((error) => {
      peerMesh?.broadcast(message);
      if (isRoomConnectionNotReadyError(error)) {
        const connection = useGameStore.getState().connection;
        useGameStore.setState({ connection: { signalr: 'connecting', p2p: connection.p2p } });
        return;
      }
      setConnectionError(error);
    });
    return;
  }

  peerMesh?.broadcast(message);
};

const resolveLocalPlayerId = (room: RoomSnapshot, preferredId: string, fallbackId?: string): string =>
  room.players.some((player) => player.id === preferredId) ? preferredId : fallbackId ?? room.players[0]?.id ?? preferredId;

const createStablePlayerId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const saveSession = (session: Omit<SavedSession, 'version' | 'savedAt'>) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        ...session,
        version: 1,
        savedAt: Date.now(),
      } satisfies SavedSession),
    );
  } catch {
    // localStorage can be unavailable in private browsing; the game still works without reload restore.
  }
};

const persistCurrentSession = (state: GameStore) => {
  if (state.room && state.localPlayerId) {
    saveSession({
      mode: 'room',
      screen: state.screen,
      localPlayerId: state.localPlayerId,
      playerName: state.playerName,
      room: state.room,
      game: state.game,
    });
    return;
  }

  if (state.game) {
    saveSession({
      mode: 'local',
      screen: state.screen,
      localPlayerId: state.localPlayerId,
      playerName: state.playerName,
      game: state.game,
    });
  }
};

const clearSavedSession = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
};

const setConnectionError = (error: unknown) => {
  const connection = useGameStore.getState().connection;
  useGameStore.setState({
    connection: {
      signalr: isRoomConnectionNotReadyError(error) ? 'connecting' : connection.signalr,
      p2p: connection.p2p,
      error: errorMessage(error),
    },
  });
};

const isRoomNotFoundError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes('Кімнату не знайдено') || error.message.includes("Failed to invoke 'JoinRoom' due to an error on the server"));

export const canStartRoom = (players: RoomPlayer[]) =>
  players.length >= MIN_PLAYERS &&
  players.length <= MAX_PLAYERS &&
  players.every((player) => player.online !== false && (player.ready || player.isHost));

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Невідома помилка.');
