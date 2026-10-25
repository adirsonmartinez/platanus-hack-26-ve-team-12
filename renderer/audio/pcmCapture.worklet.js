// The microphone for Grok Voice (renderer/models/grokSession.js, docs/features/llamada/VOZ.md): gathers
// ~100 ms blocks of the first input channel as 16-bit PCM at the AudioContext's rate and posts each one
// with its loudness ({ pcm: ArrayBuffer, rms }), so the window sends few, small messages. It is a file of
// its own (not a blob) so the window's CSP needs no blob:.
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const ms = Number(options?.processorOptions?.chunkMs) || 100;
    this.size = Math.max(128, Math.round((sampleRate * ms) / 1000)); // sampleRate: the worklet scope's global
    this.block = new Int16Array(this.size);
    this.filled = 0;
    this.energy = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      const v = Math.max(-1, Math.min(1, channel[i]));
      this.energy += v * v;
      this.block[this.filled++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.filled === this.size) {
        const pcm = this.block.buffer;
        this.port.postMessage({ pcm, rms: Math.sqrt(this.energy / this.size) }, [pcm]);
        this.block = new Int16Array(this.size);
        this.filled = 0;
        this.energy = 0;
      }
    }
    return true; // keep running while the call lasts
  }
}

registerProcessor('pcm-capture', PcmCapture);
