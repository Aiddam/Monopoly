import type { GameAction, GameState } from '../engine/types';
import type { RoomPlayer, SignalPayload } from './roomClient';

export type PeerMessage =
  | { type: 'game:init'; state: GameState }
  | { type: 'game:action'; action: GameAction }
  | { type: 'game:state'; state: GameState }
  | { type: 'sync:request' }
  | { type: 'sync:response'; state: GameState }
  | { type: 'presence:ping'; at: number };

type SendSignal = (toPeerId: string, kind: SignalPayload['kind'], payload: unknown) => Promise<void>;
type MessageHandler = (message: PeerMessage, fromPeerId: string) => void;
type StatusHandler = (peerId: string, connected: boolean) => void;

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export class PeerMesh {
  private readonly peers = new Map<string, RTCPeerConnection>();
  private readonly channels = new Map<string, RTCDataChannel>();
  private readonly onMessageHandlers: MessageHandler[] = [];
  private readonly onStatusHandlers: StatusHandler[] = [];

  constructor(
    private readonly selfPeerId: string,
    private readonly sendSignal: SendSignal,
  ) {}

  onMessage(handler: MessageHandler) {
    this.onMessageHandlers.push(handler);
  }

  onStatus(handler: StatusHandler) {
    this.onStatusHandlers.push(handler);
  }

  async syncPeers(players: RoomPlayer[]) {
    const otherPlayers = players.filter((player) => player.id !== this.selfPeerId);
    for (const player of otherPlayers) {
      if (!this.peers.has(player.id) && this.selfPeerId < player.id) {
        await this.createPeer(player.id, true);
      }
    }
    [...this.peers.keys()].forEach((peerId) => {
      if (!otherPlayers.some((player) => player.id === peerId)) {
        this.peers.get(peerId)?.close();
        this.peers.delete(peerId);
        this.channels.delete(peerId);
      }
    });
  }

  async handleSignal(signal: SignalPayload) {
    const peerId = signal.fromPeerId;
    const peer = this.peers.get(peerId) ?? (await this.createPeer(peerId, false));

    if (signal.kind === 'offer') {
      await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await this.sendSignal(peerId, 'answer', answer);
    }

    if (signal.kind === 'answer') {
      await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
    }

    if (signal.kind === 'ice') {
      await peer.addIceCandidate(signal.payload as RTCIceCandidateInit);
    }
  }

  broadcast(message: PeerMessage) {
    const serialized = JSON.stringify(message);
    this.channels.forEach((channel) => {
      if (channel.readyState === 'open') channel.send(serialized);
    });
  }

  send(peerId: string, message: PeerMessage) {
    const channel = this.channels.get(peerId);
    if (channel?.readyState === 'open') {
      channel.send(JSON.stringify(message));
    }
  }

  close() {
    this.channels.forEach((channel) => channel.close());
    this.peers.forEach((peer) => peer.close());
    this.channels.clear();
    this.peers.clear();
  }

  private async createPeer(peerId: string, initiator: boolean) {
    const peer = new RTCPeerConnection(rtcConfig);
    this.peers.set(peerId, peer);

    peer.onicecandidate = (event) => {
      if (event.candidate) void this.sendSignal(peerId, 'ice', event.candidate.toJSON());
    };
    peer.onconnectionstatechange = () => {
      this.onStatusHandlers.forEach((handler) => handler(peerId, peer.connectionState === 'connected'));
    };
    peer.ondatachannel = (event) => this.bindChannel(peerId, event.channel);

    if (initiator) {
      const channel = peer.createDataChannel('ukraine-monopoly');
      this.bindChannel(peerId, channel);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await this.sendSignal(peerId, 'offer', offer);
    }

    return peer;
  }

  private bindChannel(peerId: string, channel: RTCDataChannel) {
    this.channels.set(peerId, channel);
    channel.onopen = () => this.onStatusHandlers.forEach((handler) => handler(peerId, true));
    channel.onclose = () => this.onStatusHandlers.forEach((handler) => handler(peerId, false));
    channel.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as PeerMessage;
      this.onMessageHandlers.forEach((handler) => handler(message, peerId));
    };
  }
}
