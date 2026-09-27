import { motion, DUR } from '../motion';
import { t } from '../content/strings';

/**
 * Hold to skip (docs/BRIEF.md, <cinematics>): a cinematic skips only after a deliberate hold, so a
 * stray key or click never throws one away. Space, Enter, or pressing on the hint itself; the line
 * under the hint fills while held and drains back if let go early. On the ui clock, so it keeps
 * working while the game clock is paused or frozen.
 */
export class HoldToSkip {
  private readonly el: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly seconds: number;
  private readonly onSkip: () => void;
  private progress = 0;
  private holding = new Set<string>();
  private done = false;
  private ticker: { cancel(): void } | null = null;
  private last = 0;

  private keydown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    e.preventDefault();
    if (!e.repeat) this.press(e.code);
  };
  private keyup = (e: KeyboardEvent) => this.holding.delete(e.code);
  private blur = () => this.holding.clear();

  constructor(opts: { onSkip: () => void; seconds?: number }) {
    this.onSkip = opts.onSkip;
    this.seconds = opts.seconds ?? 0.8;
    this.el = document.createElement('div');
    this.el.className = 'hold-skip';
    this.el.setAttribute('role', 'button');
    this.el.setAttribute('aria-label', `${t('skip.hold')} (${t('skip.key')})`);
    this.el.innerHTML = `<span class="keycap">${t('skip.key')}</span><span class="hold-skip-label">${t('skip.hold')}</span><div class="hold-skip-track"><div class="hold-skip-fill"></div></div>`;
    this.fill = this.el.querySelector('.hold-skip-fill') as HTMLDivElement;
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.press('pointer');
    });
    const release = () => this.holding.delete('pointer');
    this.el.addEventListener('pointerup', release);
    this.el.addEventListener('pointerleave', release);
  }

  /** Mounts the hint and starts listening. */
  show(): void {
    if (this.el.isConnected) return;
    document.getElementById('ui-root')!.appendChild(this.el);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.blur);
    motion.ui.animate(this.el, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { dur: 'small', fill: 'forwards' });
    this.last = motion.clocks.ui.time;
    this.ticker = motion.ui.every(1 / 60, () => this.tick());
  }

  private press(source: string): void {
    if (this.done) return;
    this.holding.add(source);
  }

  private tick(): void {
    const now = motion.clocks.ui.time;
    const dt = now - this.last;
    this.last = now;
    if (this.done) return;
    // Filling is linear (it's a measure of time held); draining is quicker than filling.
    this.progress += this.holding.size ? dt / this.seconds : -dt / (this.seconds * 0.5);
    this.progress = Math.max(0, Math.min(1, this.progress));
    this.fill.style.transform = `scaleX(${this.progress})`;
    this.el.classList.toggle('holding', this.holding.size > 0);
    if (this.progress >= 1) {
      this.done = true;
      this.swallowUntilReleased();
      this.dispose();
      this.onSkip();
    }
  }

  /**
   * The held key keeps auto-repeating, and its release would press whatever button the skip just
   * brought up. Swallow that key, capture-phase, until it's released.
   */
  private swallowUntilReleased(): void {
    const keys = new Set([...this.holding].filter((k) => k !== 'pointer'));
    if (!keys.size) return;
    const block = (e: KeyboardEvent) => {
      if (!keys.has(e.code)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === 'keyup') {
        keys.delete(e.code);
        if (!keys.size) {
          window.removeEventListener('keydown', block, true);
          window.removeEventListener('keyup', block, true);
        }
      }
    };
    window.addEventListener('keydown', block, true);
    window.addEventListener('keyup', block, true);
  }

  dispose(): void {
    this.ticker?.cancel();
    this.ticker = null;
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.blur);
    if (this.el.isConnected) {
      const a = motion.ui.animate(this.el, [{ opacity: 1 }, { opacity: 0 }], { dur: DUR.small, exit: true, fill: 'forwards' });
      a.finished.then(() => this.el.remove(), () => this.el.remove());
    }
  }
}
