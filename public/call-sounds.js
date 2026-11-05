// Original synthesized tones; no recordings or external requests.
export class CallSounds {
  constructor({
    AudioContextClass = globalThis.AudioContext ||
      globalThis.webkitAudioContext,
    enabled = true,
  } = {}) {
    this.AudioContextClass = AudioContextClass;
    this.enabled = enabled;
    this.nodes = new Set();
  }
  async unlock() {
    if (!this.enabled || !this.AudioContextClass) return false;
    try {
      this.context ||= new this.AudioContextClass();
      if (this.context.state !== "running") await this.context.resume();
      if (this.mode && !this.interval) this.schedule();
      return this.context.state === "running";
    } catch {
      return false;
    }
  }
  play(mode) {
    this.stop();
    if (!this.enabled) return false;
    this.mode = mode;
    if (this.context?.state !== "running") return false;
    this.schedule();
    return true;
  }
  schedule() {
    if (!this.mode || !this.enabled || this.context?.state !== "running")
      return;
    const pattern =
      this.mode === "outgoing"
        ? [
            [0, 425, 0.9],
            [1.15, 425, 0.9],
          ]
        : [
            [0, 659.25, 0.17],
            [0.22, 783.99, 0.17],
            [0.44, 987.77, 0.24],
            [0.82, 783.99, 0.17],
            [1.04, 659.25, 0.28],
          ];
    const cycle = () =>
      pattern.forEach(([delay, frequency, duration]) =>
        this.note(frequency, delay, duration),
      );
    cycle();
    this.interval = setInterval(cycle, this.mode === "outgoing" ? 4500 : 3000);
  }
  note(frequency, delay, duration) {
    const ctx = this.context,
      oscillator = ctx.createOscillator(),
      gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    oscillator.type = this.mode === "outgoing" ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      this.mode === "outgoing" ? 0.035 : 0.045,
      start + 0.02,
    );
    gain.gain.setValueAtTime(
      this.mode === "outgoing" ? 0.035 : 0.045,
      start + Math.max(0.03, duration - 0.06),
    );
    gain.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    this.nodes.add(oscillator);
    oscillator.onended = () => {
      this.nodes.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
  stop() {
    clearInterval(this.interval);
    this.interval = null;
    this.mode = null;
    for (const oscillator of this.nodes) {
      try {
        oscillator.stop();
        oscillator.disconnect();
      } catch {}
    }
    this.nodes.clear();
  }
  setEnabled(value) {
    this.enabled = value;
    if (!value) this.stop();
    else return this.unlock();
  }
}
