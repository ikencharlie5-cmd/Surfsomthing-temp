// All audio is synthesized with WebAudio: no asset files.
//  - wind that rises with speed, a hiss while touching a ramp
//  - UI / gameplay blips
//  - a procedural synthwave track (drums, bass, arp, pads)

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.vol = { master: 0.8, music: 0.55, sfx: 0.8 };
  }

  /** Must be called from a user gesture. */
  start() {
    if (this.started) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.started = true;
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(c.destination);
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.reverb = c.createConvolver();
    this.reverb.buffer = impulse(c, 2.8, 2.2);
    this.reverbSend = c.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb).connect(this.musicBus);
    this.noise = noiseBuffer(c, 2);
    this._setupWind();
    this.music = new Synthwave(this);
    this.applyVolumes();
  }

  setVolumes(master, music, sfx) {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }

  _setupWind() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    this.windFilter = c.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 400; this.windFilter.Q.value = 0.7;
    this.windGain = c.createGain(); this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.sfxBus);
    // ramp hiss
    const src2 = c.createBufferSource();
    src2.buffer = this.noise; src2.loop = true; src2.playbackRate.value = 0.7;
    this.hissFilter = c.createBiquadFilter();
    this.hissFilter.type = 'highpass'; this.hissFilter.frequency.value = 2500;
    this.hissGain = c.createGain(); this.hissGain.gain.value = 0;
    src2.connect(this.hissFilter).connect(this.hissGain).connect(this.sfxBus);
    src.start(); src2.start();
  }

  /** Called every frame with current speed (u/s) and whether we're on a ramp. */
  updateMotion(speed, surfing, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = active ? Math.min(1, speed / 3000) : 0;
    this.windGain.gain.setTargetAtTime(0.02 + s * s * 0.5 * (active ? 1 : 0), t, 0.15);
    this.windFilter.frequency.setTargetAtTime(250 + s * 1600, t, 0.2);
    this.hissGain.gain.setTargetAtTime(surfing && active ? 0.05 + s * 0.12 : 0, t, 0.06);
    this.hissFilter.frequency.setTargetAtTime(1800 + s * 3000, t, 0.1);
  }

  play(name) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const out = this.sfxBus;
    switch (name) {
      case 'click': blip(c, out, t, 880, 0.04, 'square', 0.06); break;
      case 'hover': blip(c, out, t, 1320, 0.025, 'sine', 0.03); break;
      case 'start': [440, 660].forEach((f, i) => blip(c, out, t + i * 0.06, f, 0.08, 'triangle', 0.15)); break;
      case 'stage': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(c, out, t + i * 0.05, f, 0.16, 'triangle', 0.16)); whoosh(c, out, t, this.noise, 0.5, 0.25); break;
      case 'teleport': whoosh(c, out, t, this.noise, 0.6, 0.35); break;
      case 'reset': sweep(c, out, t, 600, 120, 0.35, 'sawtooth', 0.1); break;
      case 'land': blip(c, out, t, 90, 0.08, 'sine', 0.2); break;
      case 'jump': blip(c, out, t, 300, 0.05, 'sine', 0.04); break;
      case 'finish':
        [261.63, 329.63, 392.0, 523.25].forEach((f) => blip(c, out, t, f, 1.4, 'sawtooth', 0.05, 2000));
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => blip(c, out, t + 0.08 * i, f, 0.3, 'triangle', 0.12));
        break;
      case 'record':
        [392, 523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => blip(c, out, t + 0.07 * i, f, 0.35, 'square', 0.07, 3000));
        break;
      case 'over': sweep(c, out, t, 400, 60, 1.0, 'sawtooth', 0.14); break;
      default: break;
    }
  }

  musicOn(on) {
    if (!this.music) return;
    if (on) this.music.play(); else this.music.stop();
  }
  setMusicIntensity(x) { if (this.music) this.music.intensity = x; }
}

// ---------------------------------------------------------------------------

function noiseBuffer(c, seconds) {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function impulse(c, seconds, decay) {
  const len = c.sampleRate * seconds;
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

function blip(c, out, t, freq, dur, type = 'sine', vol = 0.1, lp = 0) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
  node.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

function sweep(c, out, t, f0, f1, dur, type, vol) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500;
  o.connect(f).connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

function whoosh(c, out, t, noise, dur, vol) {
  const s = c.createBufferSource(); s.buffer = noise;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(4000, t + dur * 0.6);
  f.frequency.exponentialRampToValueAtTime(800, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t); s.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------------------
// Procedural synthwave
// ---------------------------------------------------------------------------

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// A minor: Am - F - C - G, then Am - F - G - Em
const PROGRESSIONS = [
  [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
  [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],
];

class Synthwave {
  constructor(engine) {
    this.e = engine;
    this.c = engine.ctx;
    this.bpm = 104;
    this.step = 0;
    this.bar = 0;
    this.timer = null;
    this.nextTime = 0;
    this.intensity = 0.5; // 0 = chill (menu), 1 = full (gameplay)
    const c = this.c;
    this.out = c.createGain();
    this.out.gain.value = 1;
    this.out.connect(engine.musicBus);
    // arp delay
    this.delay = c.createDelay(1.0);
    this.delay.delayTime.value = (60 / this.bpm) * 0.75;
    this.fb = c.createGain(); this.fb.gain.value = 0.38;
    this.delay.connect(this.fb).connect(this.delay);
    this.delayOut = c.createGain(); this.delayOut.gain.value = 0.45;
    this.delay.connect(this.delayOut).connect(this.out);
    // pad bus (ducked by kick)
    this.padBus = c.createGain();
    this.padBus.connect(this.out);
    this.padBus.connect(engine.reverbSend);
  }

  play() {
    if (this.timer) return;
    this.nextTime = this.c.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 25);
  }
  stop() { clearInterval(this.timer); this.timer = null; }

  _schedule() {
    const spb = 60 / this.bpm / 4; // 16th note
    while (this.nextTime < this.c.currentTime + 0.15) {
      this._playStep(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  _playStep(s, t, spb) {
    const c = this.c;
    const prog = PROGRESSIONS[Math.floor(this.bar / 4) % 2];
    const chord = prog[this.bar % 4];
    const full = this.intensity > 0.6;
    const section = Math.floor(this.bar / 8) % 4; // vary arrangement

    // pads on bar start
    if (s === 0) {
      for (const n of chord) {
        for (const det of [-7, 7]) {
          const o = c.createOscillator(); o.type = 'sawtooth';
          o.frequency.value = midi(n); o.detune.value = det;
          const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + this.intensity * 900; f.Q.value = 0.5;
          const g = c.createGain();
          const dur = spb * 16;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.028, t + 0.5);
          g.gain.setValueAtTime(0.028, t + dur - 0.3);
          g.gain.linearRampToValueAtTime(0, t + dur + 0.2);
          o.connect(f).connect(g).connect(this.padBus);
          o.start(t); o.stop(t + dur + 0.3);
        }
      }
    }
    // kick: four on the floor (sparser when chill)
    const kickOn = full ? s % 4 === 0 : s === 0 || s === 8;
    if (kickOn) {
      this._kick(t);
      // sidechain duck
      this.padBus.gain.cancelScheduledValues(t);
      this.padBus.gain.setValueAtTime(0.35, t);
      this.padBus.gain.linearRampToValueAtTime(1, t + spb * 3);
    }
    if (full && (s === 4 || s === 12)) this._snare(t);
    if (s % 2 === 1 && (full || section > 0)) this._hat(t, s % 4 === 2 ? 0.05 : 0.03);
    if (full && s % 4 === 2) this._hat(t, 0.05);

    // bass: driving 8ths on the root, octave jumps
    if (s % 2 === 0) {
      const root = chord[0] - 24;
      const n = s % 8 === 6 ? root + 12 : root;
      this._bass(t, midi(n), spb * 1.8);
    }
    // arp: 16ths through chord tones up two octaves
    if (this.intensity > 0.3 || section % 2 === 1) {
      const pattern = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3];
      const tones = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12];
      const n = tones[pattern[s]] + 12;
      this._arp(t, midi(n), spb * 0.9);
    }
    // lead hook every other 4-bar phrase when full
    if (full && section >= 2 && (s === 0 || s === 6 || s === 10)) {
      const n = chord[(s / 2) % 3] + 24;
      this._lead(t, midi(n), spb * (s === 10 ? 6 : 4));
    }
  }

  _kick(t) {
    const c = this.c;
    const o = c.createOscillator(); const g = c.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + 0.4);
  }
  _snare(t) {
    const c = this.c;
    const s = c.createBufferSource(); s.buffer = this.e.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    s.connect(f).connect(g).connect(this.out);
    g.connect(this.e.reverbSend);
    s.start(t, Math.random()); s.stop(t + 0.25);
    const o = c.createOscillator(); const og = c.createGain();
    o.frequency.value = 190; og.gain.setValueAtTime(0.12, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og).connect(this.out); o.start(t); o.stop(t + 0.12);
  }
  _hat(t, vol) {
    const c = this.c;
    const s = c.createBufferSource(); s.buffer = this.e.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random()); s.stop(t + 0.06);
  }
  _bass(t, freq, dur) {
    const c = this.c;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = freq / 2;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(1400 * (0.5 + this.intensity * 0.5), t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.4;
    o.connect(f); o2.connect(g2).connect(f);
    f.connect(g).connect(this.out);
    o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  }
  _arp(t, freq, dur) {
    const c = this.c;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g);
    g.connect(this.out); g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.02);
  }
  _lead(t, freq, dur) {
    const c = this.c;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const lfo = c.createOscillator(); lfo.frequency.value = 5.5;
    const lg = c.createGain(); lg.gain.value = 6;
    lfo.connect(lg).connect(o.detune);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.03);
    g.gain.setValueAtTime(0.05, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g);
    g.connect(this.out); g.connect(this.e.reverbSend); g.connect(this.delay);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
}
