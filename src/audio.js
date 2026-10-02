// Sonido sintetizado con WebAudio: sin archivos externos.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.crowd = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startCrowd();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  startCrowd() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0.05;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this.crowd = { g, bp };
  }

  swell(amount = 1, dur = 1.2) {
    if (!this.crowd) return;
    const t = this.ctx.currentTime;
    const g = this.crowd.g.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.05 + 0.12 * amount, t + 0.08);
    g.exponentialRampToValueAtTime(0.05, t + dur);
  }

  tone(freq, { t = 0, dur = 0.12, type = 'sine', vol = 0.25, slide = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    const at = c.currentTime + t;
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  noiseBurst({ t = 0, dur = 0.3, freq = 1000, q = 1, vol = 0.3, sweep = 1 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    const at = c.currentTime + t;
    f.frequency.setValueAtTime(freq, at);
    f.frequency.exponentialRampToValueAtTime(freq * sweep, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(at, Math.random());
    s.stop(at + dur + 0.05);
  }

  collect(bonus, mode) {
    const base = mode === 'boca' ? 660 : 590;
    this.tone(base, { dur: 0.1, type: 'triangle', vol: 0.22 });
    this.tone(base * 1.5, { t: 0.07, dur: 0.16, type: 'triangle', vol: 0.2 });
    if (bonus) [2, 2.5, 3].forEach((m, i) => this.tone(base * m, { t: 0.15 + i * 0.07, dur: 0.18, type: 'square', vol: 0.08 }));
    if (mode === 'river') this.tone(300, { t: 0.02, dur: 0.35, type: 'sine', vol: 0.08, slide: 1.6 });
    this.swell(bonus ? 1.6 : 0.8);
  }

  death() {
    this.tone(180, { dur: 0.5, type: 'sawtooth', vol: 0.18, slide: 0.3 });
    this.noiseBurst({ dur: 0.25, freq: 200, q: 0.7, vol: 0.5 });
    this.noiseBurst({ t: 0.15, dur: 1.4, freq: 500, q: 0.8, vol: 0.18, sweep: 0.6 });
    this.swell(1.5, 2);
  }

  whoosh() {
    this.noiseBurst({ dur: 0.5, freq: 400, q: 2, vol: 0.12, sweep: 4 });
  }

  bounce(k = 1) {
    this.tone(140 * (1 + Math.random() * 0.3), { dur: 0.12, type: 'sine', vol: 0.18 * k, slide: 0.6 });
  }

  click() {
    this.tone(880, { dur: 0.04, type: 'triangle', vol: 0.06 });
  }
}
