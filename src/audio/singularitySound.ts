import { AudioSystem } from './AudioSystem';
import { TIMELINE, range } from '../galaxy/title/singularity/timeline';
import type { Cue } from '../galaxy/title/singularity/timeline';

/**
 * The black hole's sound (galaxy/title/singularity/singularity.ts), synthesized like everything else
 * in the game. It follows the event's own clock: the beds are set from it every frame (frame), the hits
 * play on its cues (cue), so when a slow frame or a hurry changes the pace the sound keeps step.
 *
 * Click: the music stops dead (TitleScreen) and a dull thunk is all that answers. A thin ringing and a
 * sub-bass fade up in the quiet; the corner readouts glitch out. The point inhales (a rising band of
 * noise), then the birth: a falling sub drop and a roar of saturated noise into a long, dark reverb.
 * Under the feeding, a rumble that opens up, a saw cluster climbing an octave and more, sparks of
 * accretion crackling across the stereo field, the ship's engines on the right until they sputter, a
 * whoosh as each piece of the menu goes, two low tones beating once the camera is caught, and a high
 * blue-shifted shimmer in the fall. At the horizon every layer cuts at once. A quarter of a second of
 * silence, then one deep, soft impact that rings out in the dark while the game loads.
 */
export interface SingularitySound {
  cue(c: Cue): void;
  frame(t: number): void;
  /** A piece of the menu torn away: `pan` -1..1, `size` 0..1. */
  whoosh(pan: number, size: number): void;
  /** Lets the tail ring out, then frees everything. */
  stop(): void;
}

const SILENT: SingularitySound = { cue() {}, frame() {}, whoosh() {}, stop() {} };

function noiseBuffer(c: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const length = Math.floor(c.sampleRate * seconds);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    } else data[i] = w;
  }
  return buffer;
}

/** A dark hall: stereo noise under an exponential decay (-60 dB over its length), the high end dying first. */
function impulse(c: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(c.sampleRate * seconds);
  const buffer = c.createBuffer(2, length, c.sampleRate);
  const fall = Math.pow(0.001, 1 / length);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    let env = 1;
    for (let i = 0; i < length; i++) {
      lp += (Math.random() * 2 - 1 - lp) * (0.5 - (0.42 * i) / length);
      data[i] = lp * env;
      env *= fall;
    }
  }
  return buffer;
}

/** The buffers, made once per page while the title waits (prepareSingularitySound): ~0.6 M samples. */
let made: { ctx: AudioContext; white: AudioBuffer; brown: AudioBuffer; hall: AudioBuffer } | null = null;
function buffers(c: AudioContext) {
  if (made?.ctx !== c) made = { ctx: c, white: noiseBuffer(c, 2.5, false), brown: noiseBuffer(c, 3, true), hall: impulse(c, 3.8) };
  return made;
}

/**
 * Makes the noise and the reverb ahead, when the browser is idle, once sound is on (the title's first
 * gesture): made at the click they were ~60 ms of the click's frame on an Intel UHD laptop.
 */
export function prepareSingularitySound(): void {
  const run = () => {
    const out = AudioSystem.effectsOutput();
    if (out) buffers(out.ctx);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 500);
}

export function startSingularitySound(): SingularitySound {
  const out = AudioSystem.effectsOutput();
  if (!out) return SILENT;
  const { ctx: c, bus } = out;
  const T = TIMELINE;
  const nodes: AudioScheduledSourceNode[] = [];

  const master = c.createGain();
  master.connect(bus);
  const glue = c.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.ratio.value = 5;
  glue.attack.value = 0.004;
  glue.release.value = 0.3;
  glue.connect(master);
  const dry = c.createGain();
  dry.connect(glue);
  const { white, brown, hall } = buffers(c);
  const verb = c.createConvolver();
  verb.buffer = hall;
  const verbOut = c.createGain();
  verbOut.gain.value = 0.6;
  verb.connect(verbOut);
  verbOut.connect(glue);
  const send = c.createGain();
  send.connect(verb);

  const loop = (buffer: AudioBuffer) => {
    const s = c.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.start();
    nodes.push(s);
    return s;
  };
  const osc = (type: OscillatorType, freq: number) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start();
    nodes.push(o);
    return o;
  };
  const gain = (to: AudioNode, value = 0) => {
    const g = c.createGain();
    g.gain.value = value;
    g.connect(to);
    return g;
  };
  const filter = (type: BiquadFilterType, freq: number, q = 0.7) => {
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  };

  // The beds, all silent until frame() raises them.
  const sub = gain(dry);
  osc('sine', 34).connect(sub);
  const rumbleLp = filter('lowpass', 70);
  const rumble = gain(dry);
  loop(brown).connect(rumbleLp);
  rumbleLp.connect(rumble);
  const rumbleSend = gain(send, 0.25);
  rumble.connect(rumbleSend);
  const riseLp = filter('lowpass', 300, 1.2);
  const rise = gain(dry);
  riseLp.connect(rise);
  rise.connect(gain(send, 0.5));
  const riserBase = [55, 82.4, 110.6, 164.8];
  const risers = riserBase.map((f, i) => {
    const o = osc('sawtooth', f);
    o.detune.value = (i - 1.5) * 7;
    o.connect(riseLp);
    return o;
  });
  const tinnitus = gain(dry);
  osc('sine', 3150).connect(tinnitus);
  const groanLp = filter('lowpass', 190);
  const groan = gain(dry);
  osc('sawtooth', 41).connect(groanLp);
  osc('sawtooth', 43.7).connect(groanLp);
  groanLp.connect(groan);
  const shimmer = gain(dry);
  shimmer.connect(gain(send, 0.8));
  for (const f of [1760, 2349.3, 2637]) osc('sine', f).connect(shimmer);
  const engineBand = filter('bandpass', 900, 0.9);
  const enginePan = c.createStereoPanner();
  enginePan.pan.value = 0.45;
  const engine = gain(dry);
  loop(white).connect(engineBand);
  engineBand.connect(enginePan);
  enginePan.connect(engine);

  /** A one-shot noise burst through a filter whose frequency sweeps, panned. */
  const burst = (at: number, dur: number, opts: { from: number; to: number; type?: BiquadFilterType; q?: number; vol: number; attack?: number; pan?: number; wet?: number; shape?: boolean }) => {
    const s = c.createBufferSource();
    s.buffer = white;
    const f = filter(opts.type ?? 'bandpass', opts.from, opts.q ?? 1);
    f.frequency.setValueAtTime(opts.from, at);
    f.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
    const g = c.createGain();
    const attack = opts.attack ?? 0.01;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(opts.vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node: AudioNode = f;
    s.connect(f);
    if (opts.shape) {
      const ws = c.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 2 - 1;
        curve[i] = Math.tanh(x * 3);
      }
      ws.curve = curve;
      f.connect(ws);
      node = ws;
    }
    const p = c.createStereoPanner();
    p.pan.value = opts.pan ?? 0;
    node.connect(g);
    g.connect(p);
    p.connect(dry);
    if (opts.wet) p.connect(gain(send, opts.wet));
    s.start(at, Math.random() * 1.5);
    s.stop(at + dur + 0.05);
  };
  /** A one-shot tone with a pitch sweep. */
  const sweep = (at: number, dur: number, from: number, to: number, vol: number, opts: { type?: OscillatorType; attack?: number; wet?: number } = {}) => {
    const o = c.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + dur * 0.7);
    const g = c.createGain();
    const attack = opts.attack ?? 0.008;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(dry);
    if (opts.wet) g.connect(gain(send, opts.wet));
    o.start(at);
    o.stop(at + dur + 0.05);
  };

  // The click: a dull thunk.
  const now0 = c.currentTime;
  sweep(now0, 0.5, 90, 46, 0.22);
  burst(now0, 0.09, { from: 1800, to: 300, type: 'lowpass', vol: 0.05 });

  let lastTime = c.currentTime;
  let cut = false;
  const set = (p: AudioParam, v: number, tc = 0.05) => p.setTargetAtTime(v, c.currentTime, tc);

  return {
    cue(cue) {
      const at = c.currentTime + 0.005;
      switch (cue) {
        case 'warn':
          // The readouts lose the signal: three glitches of static.
          for (const [d, f] of [[0, 2400], [0.12, 1500], [0.27, 3100]]) burst(at + d, 0.06, { from: f, to: f * 0.7, q: 6, vol: 0.035, pan: 0.6 });
          break;
        case 'implode': {
          // The inhale: noise and a tone rising into the point.
          const dur = T.birth - T.implode;
          burst(at, dur, { from: 220, to: 5200, q: 1.4, vol: 0.12, attack: dur * 0.95, wet: 0.6 });
          sweep(at, dur, 160, 1500, 0.035, { attack: dur * 0.9, wet: 0.4 });
          break;
        }
        case 'birth':
          // The drop and the roar.
          sweep(at, 3.0, 130, 26, 0.7, { wet: 0.9 });
          sweep(at, 1.2, 62, 31, 0.35, { type: 'triangle' });
          burst(at, 1.8, { from: 2200, to: 140, type: 'lowpass', vol: 0.5, shape: true, wet: 1.1 });
          burst(at, 0.07, { from: 6000, to: 2500, type: 'highpass', vol: 0.18 });
          break;
        case 'horizon': {
          // Everything stops; then one impact in the dark.
          cut = true;
          for (const g of [sub, rumble, rise, tinnitus, groan, shimmer, engine]) {
            g.gain.cancelScheduledValues(at);
            g.gain.setTargetAtTime(0, at, 0.006);
          }
          const hit = at + 0.26;
          sweep(hit, 4.2, 54, 22, 0.55, { attack: 0.03, wet: 1.4 });
          burst(hit, 1.4, { from: 400, to: 60, type: 'lowpass', vol: 0.14, attack: 0.02, wet: 1.2 });
          break;
        }
        default:
          break;
      }
    },

    frame(t) {
      if (cut) return;
      const now = c.currentTime;
      const dt = Math.min(now - lastTime, 0.1);
      lastTime = now;
      const born = t >= T.birth;
      const grow = range(t, T.birth, T.plunge);
      const plunge = range(t, T.plunge, T.horizon);
      set(sub.gain, born ? 0.12 + 0.08 * grow + 0.1 * plunge : 0.06 * range(t, 0, 1));
      set(rumbleLp.frequency, 70 + 520 * grow + 2600 * Math.pow(plunge, 1.5));
      set(rumble.gain, born ? 0.08 + 0.22 * grow + 0.3 * plunge : 0.02 * range(t, 0.3, 1.1));
      const octaves = 1.1 * grow + 1.3 * plunge;
      risers.forEach((o, i) => set(o.frequency, riserBase[i] * Math.pow(2, octaves), 0.08));
      set(riseLp.frequency, 300 + 1600 * grow + 5200 * plunge);
      set(rise.gain, born ? 0.006 + 0.035 * Math.pow(grow, 1.3) + 0.05 * plunge : 0);
      set(tinnitus.gain, born ? 0 : 0.007 * range(t, 0.1, 0.9), born ? 0.02 : 0.1);
      set(groan.gain, 0.09 * range(t, T.capture, T.capture + 1) * (1 - 0.4 * plunge));
      set(shimmer.gain, 0.022 * plunge * plunge);
      let eng = 0;
      if (t >= T.fight && t < T.shipLost + 0.6) {
        const fail = range(t, T.shipLost, T.shipLost + 0.6);
        const sputter = t < T.shipLost || Math.sin(t * 38) * Math.sin(t * 23 + 1.7) > 0.05 ? 1 : 0.1;
        eng = 0.06 * (1 - fail) * sputter * range(t, T.fight, T.fight + 0.2);
      }
      set(engine.gain, eng, 0.015);
      set(engineBand.frequency, 700 + 900 * range(t, T.fight, T.shipLost));
      // Accretion sparks: more and more, across the field.
      if (born && dt > 0) {
        const rate = 5 + 45 * grow + 90 * plunge;
        let n = rate * dt;
        while (n > 0) {
          if (Math.random() < n) {
            const f = 900 + Math.random() * 4200;
            burst(now + Math.random() * dt, 0.012 + Math.random() * 0.03, { from: f, to: f * 0.6, q: 4, vol: 0.012 + 0.025 * Math.random() * (0.5 + grow), pan: Math.random() * 2 - 1, wet: 0.3 });
          }
          n -= 1;
        }
      }
    },

    whoosh(pan, size) {
      if (cut) return;
      const at = c.currentTime;
      const dur = 0.6 + 0.4 * size;
      burst(at, dur, { from: 3400, to: 160, q: 1.5, vol: 0.045 + 0.06 * size, attack: dur * 0.25, pan: Math.max(-1, Math.min(1, pan)), wet: 0.4 });
    },

    stop() {
      // The impact's tail rings for about four seconds after the horizon.
      const end = c.currentTime + 5;
      master.gain.setTargetAtTime(0, end - 0.5, 0.15);
      for (const n of nodes) n.stop(end);
      window.setTimeout(() => master.disconnect(), 5200);
    },
  };
}
