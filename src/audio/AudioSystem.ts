let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

function unlockOnGesture(): void {
  if (unlocked) return;
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
}

export const AudioSystem = {
  init(): void {
    window.addEventListener('pointerdown', unlockOnGesture, { once: true });
    window.addEventListener('keydown', unlockOnGesture, { once: true });
  },

  setMasterVolume(v: number): void {
    if (masterGain) masterGain.gain.value = v;
  },

  playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15): void {
    const c = getCtx();
    if (!c || !masterGain) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(volume, c.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + duration + 0.05);
  },

  playChime(): void {
    this.playTone(523.25, 0.22, 'sine', 0.18);
    setTimeout(() => this.playTone(659.25, 0.22, 'sine', 0.16), 90);
    setTimeout(() => this.playTone(783.99, 0.32, 'sine', 0.16), 180);
  },

  playError(): void {
    this.playTone(220, 0.18, 'sawtooth', 0.09);
    setTimeout(() => this.playTone(174.6, 0.22, 'sawtooth', 0.08), 90);
  },

  playUiClick(): void {
    this.playTone(880, 0.05, 'square', 0.05);
  },

  playFootstep(surface: 'metal' | 'organic' = 'metal'): void {
    const c = getCtx();
    if (!c || !masterGain) return;
    const bufferSize = c.sampleRate * 0.05;
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
    gain.connect(masterGain);
    noise.start();
  },

  startAmbient(baseFreq: number, volume = 0.05): () => void {
    const c = getCtx();
    if (!c || !masterGain) return () => {};
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
    gain.connect(masterGain);
    osc1.start();
    osc2.start();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const now = c.currentTime;
      gain.gain.linearRampToValueAtTime(0, now + 1);
      osc1.stop(now + 1.1);
      osc2.stop(now + 1.1);
    };
  },
};
