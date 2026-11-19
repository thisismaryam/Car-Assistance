// Captures mic audio, downsamples to 16 kHz mono PCM16 and posts ~100 ms frames to the main thread.
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.target = (options.processorOptions && options.processorOptions.targetRate) || 16000;
    this.ratio = sampleRate / this.target; // input samples per output sample
    this.pos = 0;                          // read position relative to the current block
    this.prev = 0;                         // last sample of the previous block
    this.frameSize = Math.round(this.target * 0.1);
    this.out = new Int16Array(this.frameSize);
    this.n = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;
    let pos = this.pos;
    while (Math.floor(pos) + 1 < ch.length) {
      const i0 = Math.floor(pos);
      const f = pos - i0;
      const a = i0 < 0 ? this.prev : ch[i0];
      const v = a * (1 - f) + ch[i0 + 1] * f;
      const s = Math.max(-1, Math.min(1, v));
      this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.frameSize) {
        this.port.postMessage(this.out.buffer, [this.out.buffer]);
        this.out = new Int16Array(this.frameSize);
        this.n = 0;
      }
      pos += this.ratio;
    }
    this.pos = pos - ch.length;
    this.prev = ch[ch.length - 1];
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
