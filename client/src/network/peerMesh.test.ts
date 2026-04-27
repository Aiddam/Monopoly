import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerMesh } from './peerMesh';
import type { RoomPlayer, SignalPayload } from './roomClient';

const createdPeers: FakePeerConnection[] = [];

class FakeDataChannel {
  readyState: RTCDataChannelState = 'open';
  onopen: ((this: RTCDataChannel, ev: Event) => unknown) | null = null;
  onclose: ((this: RTCDataChannel, ev: Event) => unknown) | null = null;
  onmessage: ((this: RTCDataChannel, ev: MessageEvent) => unknown) | null = null;

  send = vi.fn();

  close = vi.fn(() => {
    this.readyState = 'closed';
  });
}

class FakePeerConnection {
  signalingState: RTCSignalingState = 'stable';
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) => unknown) | null = null;
  onconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  ondatachannel: ((this: RTCPeerConnection, ev: RTCDataChannelEvent) => unknown) | null = null;
  readonly setRemoteDescriptionCalls: RTCSessionDescriptionInit[] = [];

  constructor(_configuration?: RTCConfiguration) {
    createdPeers.push(this);
  }

  createDataChannel(_label: string) {
    return new FakeDataChannel() as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'local-offer' };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'local-answer' };
  }

  async setLocalDescription(description?: RTCLocalSessionDescriptionInit | null): Promise<void> {
    if (!description?.type) return;
    const nextDescription = { type: description.type, sdp: description.sdp } satisfies RTCSessionDescriptionInit;
    this.localDescription = nextDescription;
    if (nextDescription.type === 'offer') this.signalingState = 'have-local-offer';
    if (nextDescription.type === 'answer') this.signalingState = 'stable';
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.setRemoteDescriptionCalls.push(description);
    if (description.type === 'offer' && this.signalingState !== 'stable') {
      throw new Error(`offer in wrong state: ${this.signalingState}`);
    }
    if (description.type === 'answer' && this.signalingState !== 'have-local-offer') {
      throw new Error(`answer in wrong state: ${this.signalingState}`);
    }

    this.remoteDescription = description;
    if (description.type === 'offer') this.signalingState = 'have-remote-offer';
    if (description.type === 'answer') this.signalingState = 'stable';
  }

  async addIceCandidate(_candidate?: RTCIceCandidateInit): Promise<void> {}

  close(): void {
    this.signalingState = 'closed';
    this.connectionState = 'closed';
  }
}

describe('PeerMesh signaling', () => {
  beforeEach(() => {
    createdPeers.length = 0;
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers an incoming offer', async () => {
    const sentSignals: SignalPayload[] = [];
    const mesh = new PeerMesh('b', async (toPeerId, kind, payload) => {
      sentSignals.push({ fromPeerId: 'b', toPeerId, kind, payload });
    });
    const offer = { type: 'offer', sdp: 'remote-offer' } satisfies RTCSessionDescriptionInit;

    await mesh.handleSignal({ fromPeerId: 'a', toPeerId: 'b', kind: 'offer', payload: offer });

    expect(createdPeers[0].remoteDescription).toEqual(offer);
    expect(createdPeers[0].signalingState).toBe('stable');
    expect(sentSignals).toMatchObject([{ toPeerId: 'a', kind: 'answer' }]);
  });

  it('ignores duplicate or stale answers after the peer is already stable', async () => {
    const mesh = new PeerMesh('a', async () => undefined);
    await mesh.syncPeers([player('a'), player('b')]);
    const peer = createdPeers[0];
    const acceptedAnswer = { type: 'answer', sdp: 'remote-answer-1' } satisfies RTCSessionDescriptionInit;
    const staleAnswer = { type: 'answer', sdp: 'remote-answer-2' } satisfies RTCSessionDescriptionInit;

    await mesh.handleSignal({ fromPeerId: 'b', toPeerId: 'a', kind: 'answer', payload: acceptedAnswer });
    await expect(mesh.handleSignal({ fromPeerId: 'b', toPeerId: 'a', kind: 'answer', payload: acceptedAnswer })).resolves.toBeUndefined();
    await expect(mesh.handleSignal({ fromPeerId: 'b', toPeerId: 'a', kind: 'answer', payload: staleAnswer })).resolves.toBeUndefined();

    expect(peer.signalingState).toBe('stable');
    expect(peer.setRemoteDescriptionCalls).toEqual([acceptedAnswer]);
  });

  it('ignores answers that arrive before this peer has made an offer', async () => {
    const mesh = new PeerMesh('b', async () => undefined);
    const orphanAnswer = { type: 'answer', sdp: 'orphan-answer' } satisfies RTCSessionDescriptionInit;

    await expect(mesh.handleSignal({ fromPeerId: 'a', toPeerId: 'b', kind: 'answer', payload: orphanAnswer })).resolves.toBeUndefined();

    expect(createdPeers[0].signalingState).toBe('stable');
    expect(createdPeers[0].setRemoteDescriptionCalls).toHaveLength(0);
  });
});

const player = (id: string): RoomPlayer => ({
  id,
  name: id,
  isHost: id === 'a',
  ready: true,
  joinedAt: '2026-04-27T00:00:00.000Z',
  online: true,
});
