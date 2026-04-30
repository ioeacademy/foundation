// Thin wrapper around RTCPeerConnection. Uses non-trickle ICE: we wait until
// gathering completes, then return the final SDP — simpler for QR/textarea signaling.

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export class Peer {
  constructor() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.dataChannel = null;
    this._dcResolvers = [];
    this.pc.ondatachannel = (ev) => {
      this.dataChannel = ev.channel;
      this._wireChannel();
      this._dcResolvers.forEach(r => r(this.dataChannel));
      this._dcResolvers = [];
    };
  }

  createDataChannel(label = 'bundle') {
    this.dataChannel = this.pc.createDataChannel(label, { ordered: true });
    this._wireChannel();
    return this.dataChannel;
  }

  _wireChannel() {
    const dc = this.dataChannel;
    dc.binaryType = 'arraybuffer';
  }

  awaitDataChannel() {
    if (this.dataChannel) return Promise.resolve(this.dataChannel);
    return new Promise(resolve => this._dcResolvers.push(resolve));
  }

  awaitOpen() {
    return new Promise((resolve, reject) => {
      const dc = this.dataChannel;
      if (!dc) return reject(new Error('no datachannel'));
      if (dc.readyState === 'open') return resolve();
      dc.onopen = () => resolve();
      dc.onerror = (e) => reject(e);
    });
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return this._waitIce();
  }

  async createAnswer(remoteOffer) {
    await this.pc.setRemoteDescription(remoteOffer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return this._waitIce();
  }

  async acceptAnswer(remoteAnswer) {
    await this.pc.setRemoteDescription(remoteAnswer);
  }

  async _waitIce() {
    if (this.pc.iceGatheringState === 'complete') return this.pc.localDescription;
    return new Promise(resolve => {
      const check = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', check);
          resolve(this.pc.localDescription);
        }
      };
      this.pc.addEventListener('icegatheringstatechange', check);
      // Also resolve on null candidate event (some browsers).
      this.pc.addEventListener('icecandidate', (ev) => {
        if (!ev.candidate && this.pc.iceGatheringState === 'complete') {
          resolve(this.pc.localDescription);
        }
      });
      // Hard timeout: give up after 5s and use whatever we have.
      setTimeout(() => resolve(this.pc.localDescription), 5000);
    });
  }

  close() {
    try { this.dataChannel?.close(); } catch (_) {}
    try { this.pc.close(); } catch (_) {}
  }
}
