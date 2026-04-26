import { create } from 'zustand';
import { createInitialGame, MAX_PLAYERS, MIN_PLAYERS, reduceGame } from '../engine/gameEngine';
import type { GameAction, GameState } from '../engine/types';
import { PeerMesh, type PeerMessage } from '../network/peerMesh';
import { RoomClient, type RoomPlayer, type RoomSnapshot, type SignalPayload } from '../network/roomClient';

type Screen = 'home' | 'lobby' | 'game' | 'finished';

interface ConnectionState {
  signalr: 'idle' | 'connecting' | 'connected' | 'error';
  p2p: Record<string, boolean>;
  error?: string;
}

interface GameStore {
  screen: Screen;
  localPlayerId?: string;
  room?: RoomSnapshot;
  roomClient?: RoomClient;
  peerMesh?: PeerMesh;
  connection: ConnectionState;
  game?: GameState;
  createRoom: (playerName: string, testMode?: boolean) => Promise<void>;
  joinRoom: (code: string, playerName: string) => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  startLocalDemo: () => void;
  startRoomGame: () => void;
  dispatch: (action: GameAction, fromPeer?: boolean) => void;
  applyRemoteMessage: (message: PeerMessage, fromPeerId: string) => void;
  leaveRoom: () => Promise<void>;
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'home',
  connection: { signalr: 'idle', p2p: {} },

  async createRoom(playerName, testMode = false) {
    const roomClient = configureRoomClient();
    set({ connection: { signalr: 'connecting', p2p: {} }, roomClient });
    try {
      const room = await roomClient.createRoom(playerName, testMode);
      const localPlayerId = roomClient.connectionId ?? room.players[0].id;
      const peerMesh = configurePeerMesh(localPlayerId, roomClient, room.code);
      await peerMesh.syncPeers(room.players);
      set({ screen: 'lobby', room, localPlayerId, peerMesh, connection: { signalr: 'connected', p2p: {} } });
    } catch (error) {
      set({ connection: { signalr: 'error', p2p: {}, error: errorMessage(error) } });
    }
  },

  async joinRoom(code, playerName) {
    const roomClient = configureRoomClient();
    set({ connection: { signalr: 'connecting', p2p: {} }, roomClient });
    try {
      const room = await roomClient.joinRoom(code, playerName);
      const localPlayerId = roomClient.connectionId ?? room.players.at(-1)?.id;
      if (!localPlayerId) throw new Error('Не вдалося визначити локального гравця.');
      const peerMesh = configurePeerMesh(localPlayerId, roomClient, room.code);
      await peerMesh.syncPeers(room.players);
      set({ screen: 'lobby', room, localPlayerId, peerMesh, connection: { signalr: 'connected', p2p: {} } });
    } catch (error) {
      set({ connection: { signalr: 'error', p2p: {}, error: errorMessage(error) } });
    }
  },

  async setReady(ready) {
    const { room, roomClient } = get();
    if (room) await roomClient?.setReady(room.code, ready);
  },

  startLocalDemo() {
    const game = createInitialGame(['Олена', 'Тарас', 'Марія'], 'local-demo');
    set({ screen: 'game', localPlayerId: game.currentPlayerId, room: undefined, game });
  },

  startRoomGame() {
    const { room, localPlayerId, peerMesh } = get();
    if (!room || !localPlayerId) return;
    const localPlayer = room.players.find((player) => player.id === localPlayerId);
    if (!localPlayer?.isHost) return;
    const game = createInitialGame(room.players.map((player) => player.name), `room-${room.code}`);
    const remapped = {
      ...game,
      players: game.players.map((player, index) => ({ ...player, id: room.players[index].id })),
      currentPlayerId: room.players[0].id,
    };
    peerMesh?.broadcast({ type: 'game:init', state: remapped });
    set({ game: remapped, screen: 'game' });
  },

  dispatch(action, fromPeer = false) {
    const { game, peerMesh, room, localPlayerId } = get();
    if (!game) return;
    const isHost = !room || room.players.find((player) => player.id === localPlayerId)?.isHost;

    if (!isHost && !fromPeer) {
      peerMesh?.broadcast({ type: 'game:action', action });
      return;
    }

    try {
      const next = reduceGame(game, action);
      peerMesh?.broadcast({ type: 'game:state', state: next });
      set({ game: next, screen: next.phase === 'finished' ? 'finished' : 'game' });
    } catch (error) {
      set({ connection: { ...get().connection, error: errorMessage(error) } });
    }
  },

  applyRemoteMessage(message, fromPeerId) {
    const { game, room, localPlayerId, peerMesh } = get();
    const isHost = room?.players.find((player) => player.id === localPlayerId)?.isHost;
    if (message.type === 'game:init' || message.type === 'game:state') {
      set({ game: message.state, screen: message.state.phase === 'finished' ? 'finished' : 'game' });
    }
    if (message.type === 'game:action' && isHost) {
      get().dispatch(message.action, true);
    }
    if (message.type === 'sync:request' && isHost && game) {
      peerMesh?.send(fromPeerId, { type: 'sync:response', state: game });
    }
    if (message.type === 'sync:response') {
      set({ game: message.state, screen: 'game' });
    }
  },

  async leaveRoom() {
    const { room, roomClient, peerMesh } = get();
    peerMesh?.close();
    await roomClient?.leaveRoom(room?.code);
    set({
      screen: 'home',
      room: undefined,
      game: undefined,
      localPlayerId: undefined,
      peerMesh: undefined,
      connection: { signalr: 'idle', p2p: {} },
    });
  },
}));

const configureRoomClient = () => {
  const roomClient = new RoomClient();
  roomClient.on('RoomSnapshot', (room) => {
    const { peerMesh } = useGameStore.getState();
    void peerMesh?.syncPeers(room.players);
    useGameStore.setState({ room });
  });
  roomClient.on('SignalReceived', (signal: SignalPayload) => {
    void useGameStore.getState().peerMesh?.handleSignal(signal);
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
  });
  roomClient.on('RoomClosed', () => {
    useGameStore.setState({ screen: 'home', room: undefined, game: undefined });
  });
  roomClient.on('ErrorMessage', (message) => {
    useGameStore.setState({ connection: { ...useGameStore.getState().connection, error: message } });
  });
  return roomClient;
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

export const canStartRoom = (players: RoomPlayer[]) =>
  players.length >= MIN_PLAYERS && players.length <= MAX_PLAYERS && players.every((player) => player.ready || player.isHost);

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Невідома помилка.');
