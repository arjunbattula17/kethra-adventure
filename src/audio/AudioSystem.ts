/**
 * Every sound in the game, synthesized with the Web Audio API (no audio files to download, license
 * or decode). The sound family is "glass and hum" (docs/STYLE_BIBLE.md): sine and triangle tones
 * with soft attacks, all tuned to A minor pentatonic so every UI sound sits in key with the music.
 *
 * Three buses feed the master: effects (UI and world sounds), music (the per-place beds) and the
 * ambient hums, which count as music for the volume sliders.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let unlocked = false;
const volumes = { master: 0.8, music: 0.6, sfx: 0.8 };

// A minor pentatonic, A2 up to A6.
const A_MINOR_PENT = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

function getCtx(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = volumes.master * 0.62;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = volumes.sfx;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = volumes.music;
    musicBus.connect(master);
  }
  return ctx;
}

function unlockOnGesture(): void {
  if (unlocked) return;
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
}

/** One soft enveloped tone on a bus. The building block of every UI sound. */
function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; vol?: number; attack?: number; bus?: GainNode | null; detune?: number; lowpass?: number } = {}): void {
  const c = getCtx();
  const bus = opts.bus ?? sfxBus;
  if (!c || !bus) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.value = freq;
  if (opts.detune) osc.detune.value = opts.detune;
  const vol = opts.vol ?? 0.12;
  const attack = opts.attack ?? 0.012;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + attack + dur);
  let node: AudioNode = osc;
  if (opts.lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = opts.lowpass;
    osc.connect(f);
    node = f;
  }
  node.connect(gain);
  gain.connect(bus);
  osc.start(t0);
  osc.stop(t0 + attack + dur + 0.05);
}

/** A glassy note: the fundamental plus a quiet inharmonic partial, the "glass" in glass-and-hum. */
function glass(freq: number, start: number, dur: number, vol = 0.1): void {
  tone(freq, start, dur, { type: 'sine', vol });
  tone(freq * 2.76, start, dur * 0.5, { type: 'sine', vol: vol * 0.22 });
}

let lastHover = 0;

export type MusicPlace = 'title' | 'wren' | 'kethra' | 'vessek' | 'ending';

interface MusicBed {
  root: number[];
  cutoff: number;
  pluckEvery: [number, number];
  pluckRange: [number, number];
  pluckType: OscillatorType;
  lfo: number[];
}

const BEDS: Record<MusicPlace, MusicBed> = {
  // The Wren: a low warm drone with sparse plucks, the sound of a ship keeping itself alive.
  wren: { root: [55, 82.41, 110], cutoff: 700, pluckEvery: [4.5, 9], pluckRange: [8, 15], pluckType: 'triangle', lfo: [0.05, 0.07, 0.04] },
  // Kethra: an open fifth higher up, and wind-chime plucks with long tails.
  kethra: { root: [146.83, 220, 329.63], cutoff: 2200, pluckEvery: [2.5, 6], pluckRange: [12, 20], pluckType: 'sine', lfo: [0.09, 0.06, 0.11] },
  // The Anchorage: hums at three pitches pulsing at uneven rates, every ship's grid a little
  // different, and short metallic ticks.
  vessek: { root: [110, 164.81, 196], cutoff: 1100, pluckEvery: [1.4, 4], pluckRange: [10, 17], pluckType: 'triangle', lfo: [0.13, 0.21, 0.08] },
  title: { root: [110, 164.81, 246.94], cutoff: 1400, pluckEvery: [3.5, 7], pluckRange: [11, 18], pluckType: 'sine', lfo: [0.06, 0.05, 0.07] },
  ending: { root: [110, 164.81, 220, 277.18], cutoff: 2600, pluckEvery: [2, 4.5], pluckRange: [12, 20], pluckType: 'sine', lfo: [0.05, 0.07, 0.06, 0.04] },
};

export const AudioSystem = {
  init(): void {
    window.addEventListener('pointerdown', unlockOnGesture, { once: true });
    window.addEventListener('keydown', unlockOnGesture, { once: true });
  },

  /** Create the context now rather than on the first sound (see IntroScene.init). */
  prepare(): void {
    getCtx();
  },

  getVolumes(): { master: number; music: number; sfx: number } {
    return { ...volumes };
  },

  setVolume(bus: 'master' | 'music' | 'sfx', v: number): void {
    volumes[bus] = Math.max(0, Math.min(1, v));
    if (bus === 'master' && master) master.gain.value = volumes.master * 0.62;
    if (bus === 'music' && musicBus) musicBus.gain.value = volumes.music;
    if (bus === 'sfx' && sfxBus) sfxBus.gain.value = volumes.sfx;
  },

  setMasterVolume(v: number): void {
    this.setVolume('master', v);
  },

  playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15): void {
    tone(freq, 0, duration, { type, vol: volume });
  },

  // ---- interaction classes (STYLE_BIBLE.md, Sound) ----

  /** Hover: a 30 ms glass tick, throttled so sweeping across a menu doesn't buzz. */
  playHover(): void {
    const now = performance.now();
    if (now - lastHover < 45) return;
    lastHover = now;
    tone(1760, 0, 0.03, { type: 'triangle', vol: 0.018 });
  },

  /** Confirm: two notes rising a fifth. */
  playConfirm(): void {
    glass(440, 0, 0.12, 0.07);
    glass(659.25, 0.06, 0.16, 0.07);
  },

  /** Cancel / close: two notes falling a fourth. */
  playCancel(): void {
    glass(440, 0, 0.1, 0.05);
    glass(329.63, 0.055, 0.14, 0.05);
  },

  /** Collect / record: a quick three-note arpeggio. */
  playCollect(): void {
    glass(880, 0, 0.18, 0.06);
    glass(1046.5, 0.07, 0.2, 0.055);
    glass(1318.51, 0.14, 0.34, 0.05);
  },

  /** Success: a bloom, an A minor triad with a slow attack and a shimmering octave. */
  playSuccess(): void {
    for (const [f, d] of [[220, 0], [261.63, 0.02], [329.63, 0.04], [440, 0.06]] as const) {
      tone(f, d, 1.6, { type: 'sine', vol: 0.06, attack: 0.18 });
    }
    tone(880, 0.25, 1.4, { type: 'sine', vol: 0.03, attack: 0.3, detune: 6 });
    tone(880, 0.25, 1.4, { type: 'sine', vol: 0.03, attack: 0.3, detune: -6 });
  },

  /** Fail: a soft, muffled low dyad. Never harsh: failing here is information, not punishment. */
  playFail(): void {
    tone(110, 0, 0.35, { type: 'triangle', vol: 0.09, lowpass: 500 });
    tone(116.54, 0.02, 0.35, { type: 'triangle', vol: 0.07, lowpass: 500 });
  },

  /** Level start: the scan line's rising filtered sweep. */
  playLevelStart(): void {
    const c = getCtx();
    if (!c || !sfxBus) return;
    const len = 0.6;
    const buffer = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((i / data.length) * Math.PI);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(220, c.currentTime);
    bp.frequency.exponentialRampToValueAtTime(2600, c.currentTime + len);
    const g = c.createGain();
    g.gain.value = 0.08;
    src.connect(bp);
    bp.connect(g);
    g.connect(sfxBus);
    src.start();
    glass(659.25, 0.45, 0.4, 0.04);
  },

  /** Level end: a resolved four-note cadence, landing home on A. */
  playLevelEnd(): void {
    [523.25, 587.33, 659.25, 880].forEach((f, i) => glass(f, i * 0.16, i === 3 ? 1.2 : 0.3, 0.07));
    tone(220, 0.48, 1.4, { type: 'sine', vol: 0.05, attack: 0.1 });
  },

  // Older names, kept pointing at the new family so every call site speaks the same language.
  playChime(): void {
    this.playCollect();
  },
  playError(): void {
    this.playFail();
  },
  playUiClick(): void {
    this.playConfirm();
  },

  playFootstep(surface: 'metal' | 'organic' = 'metal'): void {
    const c = getCtx();
    if (!c || !sfxBus) return;
    const bufferSize = Math.floor(c.sampleRate * 0.05);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = surface === 'metal' ? 'highpass' : 'lowpass';
    filter.frequency.value = surface === 'metal' ? 900 : 400;
    const gain = c.createGain();
    gain.gain.value = 0.06;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    noise.start();
  },

  /** A landing thump, scaled by how far the player fell. */
  playLand(strength: number): void {
    tone(70, 0, 0.14, { type: 'sine', vol: 0.05 + 0.08 * Math.min(1, strength), lowpass: 300 });
  },

  startAmbient(baseFreq: number, volume = 0.05): () => void {
    const c = getCtx();
    if (!c || !musicBus) return () => {};
    const osc1 = c.createOscillator();
    const osc2 = c.createOscillator();
    const gain = c.createGain();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = baseFreq;
    osc2.frequency.value = baseFreq * 1.01;
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(volume, c.currentTime + 2);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(musicBus);
    osc1.start();
    osc2.start();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const now = c.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 1);
      osc1.stop(now + 1.1);
      osc2.stop(now + 1.1);
    };
  },

  /**
   * A generative music bed for a place: a slowly breathing chord under a lowpass, and sparse plucks
   * picked from the pentatonic scale at irregular intervals, so it never loops audibly. Returns a
   * stop function that fades it out.
   */
  startMusic(place: MusicPlace): () => void {
    const c = getCtx();
    if (!c || !musicBus) return () => {};
    const bed = BEDS[place];
    const out = c.createGain();
    out.gain.setValueAtTime(0, c.currentTime);
    out.gain.linearRampToValueAtTime(1, c.currentTime + 4);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = bed.cutoff;
    lp.connect(out);
    out.connect(musicBus);
    // A feedback delay gives the plucks a sense of space.
    const delay = c.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = c.createGain();
    fb.gain.value = 0.32;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(out);

    const oscs: OscillatorNode[] = [];
    bed.root.forEach((f, i) => {
      for (const det of [-5, 5]) {
        const o = c.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        const g = c.createGain();
        g.gain.value = (i === 0 ? 0.05 : 0.022) / bed.root.length * 2;
        // Each voice breathes at its own rate.
        const lfo = c.createOscillator();
        lfo.frequency.value = bed.lfo[i % bed.lfo.length];
        const lfoGain = c.createGain();
        lfoGain.gain.value = g.gain.value * 0.6;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        o.connect(g);
        g.connect(lp);
        o.start();
        lfo.start();
        oscs.push(o, lfo);
      }
    });

    let stopped = false;
    let timer = 0;
    const pluck = () => {
      if (stopped) return;
      const [lo, hi] = bed.pluckRange;
      const f = A_MINOR_PENT[lo + Math.floor(Math.random() * (hi - lo))];
      const t0 = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = bed.pluckType;
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.028, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0006, t0 + (place === 'vessek' ? 0.35 : 2.2));
      o.connect(g);
      g.connect(lp);
      g.connect(delay);
      o.start(t0);
      o.stop(t0 + 2.4);
      const [a, b] = bed.pluckEvery;
      timer = window.setTimeout(pluck, (a + Math.random() * (b - a)) * 1000);
    };
    timer = window.setTimeout(pluck, 1500);

    return () => {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(timer);
      const now = c.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 2);
      for (const o of oscs) o.stop(now + 2.1);
    };
  },
};
