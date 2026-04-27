import type { GameAction, GameState } from '../engine/types';
import type { RoomPlayer, SignalPayload } from './roomClient';

export type PeerMessage =
  | { type: 'game:init'; state: GameState }
  | { type: 'game:action'; action: GameAction }
  | { type: 'game:state'; state: GameState }
  | { type: 'sync:request' }
  | { type: 'sync:response'; state: GameState }
  | { type: 'presence:ping'; at: number }
  | { type: 'emote'; playerId: string; emoteId: string; createdAt: number };

type SendSignal = (toPeerId: string, kind: SignalPayload['kind'], payload: unknown) => Promise<void>;
type MessageHandler = (message: PeerMessage, fromPeerId: string) => void;
type StatusHandler = (peerId: string, connected: boolean) => void;

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export class PeerMesh {
  private readonly peers = new Map<string, RTCPeerConnection>();
  private readonly channels = new Map<string, RTCDataChannel>();
  private readonly pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>();
  private readonly signalQueues = new Map<string, Promise<void>>();
  private readonly activePeerIds = new Set<string>();
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
    const otherPlayers = players.filter((player) => player.id !== this.selfPeerId && player.online !== false);
    this.activePeerIds.clear();
    otherPlayers.forEach((player) => this.activePeerIds.add(player.id));

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
        this.pendingIceCandidates.delete(peerId);
        this.signalQueues.delete(peerId);
      }
    });
  }

  async handleSignal(signal: SignalPayload) {
    const peerId = signal.fromPeerId;
    const previous = this.signalQueues.get(peerId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.processSignal(signal));
    const queued = next.finally(() => {
      if (this.signalQueues.get(peerId) === queued) {
        this.signalQueues.delete(peerId);
      }
    });
    this.signalQueues.set(peerId, queued);
    await next;
  }

  private async processSignal(signal: SignalPayload) {
    const peerId = signal.fromPeerId;
    this.activePeerIds.add(peerId);
    const peer = this.peers.get(peerId) ?? (await this.createPeer(peerId, false));
    if (peer.signalingState === 'closed') return;

    if (signal.kind === 'offer') {
      await this.handleOffer(peerId, peer, signal.payload as RTCSessionDescriptionInit);
      return;
    }

    if (signal.kind === 'answer') {
      await this.handleAnswer(peerId, peer, signal.payload as RTCSessionDescriptionInit);
      return;
    }

    if (signal.kind === 'ice') {
      await this.addOrQueueIceCandidate(peerId, peer, signal.payload as RTCIceCandidateInit);
    }
  }

  private async handleOffer(peerId: string, peer: RTCPeerConnection, description: RTCSessionDescriptionInit) {
    if (this.hasRemoteDescription(peer, description)) return;
    if (peer.signalingState !== 'stable') return;

    await peer.setRemoteDescription(description);
    await this.flushPendingIceCandidates(peerId, peer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await this.sendSignalIfActive(peerId, peer, 'answer', answer);
  }

  private async handleAnswer(peerId: string, peer: RTCPeerConnection, description: RTCSessionDescriptionInit) {
    if (this.hasRemoteDescription(peer, description)) return;
    if (peer.signalingState !== 'have-local-offer') return;

    await peer.setRemoteDescription(description);
    await this.flushPendingIceCandidates(peerId, peer);
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

  removePeer(peerId: string) {
    this.activePeerIds.delete(peerId);
    this.channels.get(peerId)?.close();
    this.peers.get(peerId)?.close();
    this.channels.delete(peerId);
    this.peers.delete(peerId);
    this.pendingIceCandidates.delete(peerId);
    this.signalQueues.delete(peerId);
    this.onStatusHandlers.forEach((handler) => handler(peerId, false));
  }

  close() {
    this.channels.forEach((channel) => channel.close());
    this.peers.forEach((peer) => peer.close());
    this.channels.clear();
    this.peers.clear();
    this.pendingIceCandidates.clear();
    this.signalQueues.clear();
    this.activePeerIds.clear();
  }

  private async createPeer(peerId: string, initiator: boolean) {
    const peer = new RTCPeerConnection(rtcConfig);
    this.peers.set(peerId, peer);

    peer.onicecandidate = (event) => {
      if (event.candidate) void this.sendSignalIfActive(peerId, peer, 'ice', event.candidate.toJSON());
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
      await this.sendSignalIfActive(peerId, peer, 'offer', offer);
    }

    return peer;
  }

  private async sendSignalIfActive(
    peerId: string,
    peer: RTCPeerConnection,
    kind: SignalPayload['kind'],
    payload: unknown,
  ) {
    if (this.peers.get(peerId) !== peer || !this.activePeerIds.has(peerId)) return;
    await this.sendSignal(peerId, kind, payload).catch(() => undefined);
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

  private async addOrQueueIceCandidate(peerId: string, peer: RTCPeerConnection, candidate: RTCIceCandidateInit) {
    if (!peer.remoteDescription) {
      const pending = this.pendingIceCandidates.get(peerId) ?? [];
      pending.push(candidate);
      this.pendingIceCandidates.set(peerId, pending);
      return;
    }

    await this.safeAddIceCandidate(peer, candidate);
  }

  private async flushPendingIceCandidates(peerId: string, peer: RTCPeerConnection) {
    const pending = this.pendingIceCandidates.get(peerId);
    if (!pending?.length) return;

    this.pendingIceCandidates.delete(peerId);
    for (const candidate of pending) {
      await this.safeAddIceCandidate(peer, candidate);
    }
  }

  private async safeAddIceCandidate(peer: RTCPeerConnection, candidate: RTCIceCandidateInit) {
    try {
      if (!peer.remoteDescription) return;
      await peer.addIceCandidate(candidate);
    } catch {
      // ICE can arrive during renegotiation or just after a peer closes. SignalR state sync is the source of truth.
    }
  }

  private hasRemoteDescription(peer: RTCPeerConnection, description: RTCSessionDescriptionInit) {
    return peer.remoteDescription?.type === description.type && peer.remoteDescription.sdp === description.sdp;
  }
}
