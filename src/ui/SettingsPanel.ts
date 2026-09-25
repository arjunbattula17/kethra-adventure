import type { QualityTier } from '../core/PostProcessing';
import { getActiveEngine } from '../core/EngineRegistry';
import { PanelManager } from './PanelManager';
import { AudioSystem } from '../audio/AudioSystem';
import { PlayerController } from '../player/PlayerController';

const SETTINGS_KEY = 'kethra_settings_v2';
const LEGACY_KEY = 'kethra_settings_v1';

type TextSize = 'default' | 'large' | 'larger';

interface Settings {
  /** null = automatic: the engine's hardware guess and runtime governor decide. */
  tier: QualityTier | null;
  shadows: boolean;
  ao: boolean;
  bloom: boolean;
  master: number;
  music: number;
  sfx: number;
  reducedMotion: boolean;
  textSize: TextSize;
  sensitivity: number;
}

// Mirrors Engine.ts's TIERS (shadows) and PostProcessing.ts's setQuality() (ao/bloom) — the
// preset each tier applies before a toggle is allowed to override it individually.
const TIER_DEFAULTS: Record<QualityTier, { shadows: boolean; ao: boolean; bloom: boolean }> = {
  high: { shadows: true, ao: true, bloom: true },
  medium: { shadows: true, ao: false, bloom: true },
  low: { shadows: false, ao: false, bloom: false },
};

const QUALITY_OPTIONS: { key: QualityTier | null; label: string; hint: string }[] = [
  { key: null, label: 'Auto', hint: 'Picks the best look this computer can keep smooth, and adjusts if it has to.' },
  { key: 'low', label: 'Performance', hint: 'For older laptops and Chromebooks: same game, simpler light.' },
  { key: 'medium', label: 'Balanced', hint: 'Shadows and glow, lighter on the graphics card.' },
  { key: 'high', label: 'Quality', hint: 'Every effect, for a desktop or a recent laptop.' },
];

function osPrefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function defaults(): Settings {
  return {
    tier: null,
    ...TIER_DEFAULTS.high,
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    reducedMotion: osPrefersReducedMotion(),
    textSize: 'default',
    sensitivity: 1,
  };
}

const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const isTier = (v: unknown): v is QualityTier => v === 'low' || v === 'medium' || v === 'high';

/**
 * Reads saved settings, field by field, so a partial or older object still loads. The try/catch is
 * load-bearing: where a browser blocks storage, touching localStorage throws, and this runs at boot.
 */
function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (!p || typeof p !== 'object') return null;
    const d = defaults();
    return {
      tier: isTier(p.tier) ? p.tier : null,
      shadows: bool(p.shadows, d.shadows),
      ao: bool(p.ao, d.ao),
      bloom: bool(p.bloom, d.bloom),
      master: num(p.master, d.master, 0, 1),
      music: num(p.music, d.music, 0, 1),
      sfx: num(p.sfx, d.sfx, 0, 1),
      reducedMotion: bool(p.reducedMotion, d.reducedMotion),
      textSize: p.textSize === 'large' || p.textSize === 'larger' ? p.textSize : 'default',
      sensitivity: num(p.sensitivity, 1, 0.4, 2.5),
    };
  } catch {
    return null;
  }
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked or full: the choice still applies for this session.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

class SettingsPanelImpl {
  private settings: Settings = defaults();

  private keyHandler = (e: KeyboardEvent) => {
    if (e.code !== 'KeyO') return;
    e.preventDefault();
    // Checking activeId (not just isOpen) so O switches TO this panel from a different one
    // (e.g. Character) instead of just closing whatever else happens to be open.
    if (PanelManager.isOpen && PanelManager.activeId === 'settings') PanelManager.close();
    else this.open();
  };

  init(): void {
    window.addEventListener('keydown', this.keyHandler);
    const saved = loadSettings();
    if (saved) this.settings = saved;
    this.applyAll(saved !== null && saved.tier !== null);
  }

  /** Applies everything. The tier is only pushed to the engine when the player chose one: pushing
   * a default would switch off the automatic tier and its runtime governor for good. */
  private applyAll(applyTier: boolean): void {
    const s = this.settings;
    AudioSystem.setVolume('master', s.master);
    AudioSystem.setVolume('music', s.music);
    AudioSystem.setVolume('sfx', s.sfx);
    document.body.classList.toggle('reduced-motion', s.reducedMotion);
    document.body.classList.toggle('text-large', s.textSize === 'large');
    document.body.classList.toggle('text-larger', s.textSize === 'larger');
    PlayerController.motion = !s.reducedMotion;
    PlayerController.sensitivity = s.sensitivity;
    if (applyTier) this.applyGraphics();
  }

  private applyGraphics(): void {
    const engine = getActiveEngine();
    if (!engine || !this.settings.tier) return;
    engine.setManualQualityTier(this.settings.tier);
    engine.setShadowsEnabled(this.settings.shadows);
    engine.setAOEnabled(this.settings.ao);
    engine.setBloomEnabled(this.settings.bloom);
  }

  private change(patch: Partial<Settings>, rerender = false): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.applyAll(false);
    if (rerender) this.render();
  }

  open(): void {
    this.render();
  }

  private render(): void {
    const s = this.settings;
    const panel = el('div', 'panel');
    panel.id = 'settings-panel';
    panel.append(el('div', 'eyebrow', 'Options'), el('h2', '', 'Settings'));
    panel.appendChild(el('p', 'subtitle', 'Changes apply at once and are remembered on this computer.'));

    // Sound
    const sound = el('section', 'settings-section');
    sound.appendChild(el('div', 'eyebrow', 'Sound'));
    for (const [key, label] of [['master', 'Master volume'], ['music', 'Music'], ['sfx', 'Effects']] as const) {
      sound.appendChild(this.slider(label, s[key], 0, 1, 0.05, (v) => {
        this.change({ [key]: v });
        if (key === 'sfx') AudioSystem.playHover();
      }, (v) => `${Math.round(v * 100)}%`));
    }
    panel.appendChild(sound);

    // Graphics
    const gfx = el('section', 'settings-section');
    gfx.appendChild(el('div', 'eyebrow', 'Graphics'));
    const current = QUALITY_OPTIONS.find((o) => o.key === s.tier) ?? QUALITY_OPTIONS[0];
    const row = el('div', 'settings-row');
    row.appendChild(el('div', 'label', 'Quality'));
    row.appendChild(this.segmented(QUALITY_OPTIONS.map((o) => o.label), QUALITY_OPTIONS.indexOf(current), (i) => {
      const tier = QUALITY_OPTIONS[i].key;
      if (tier) {
        this.change({ tier, ...TIER_DEFAULTS[tier] }, true);
        this.applyGraphics();
      } else {
        // Back to automatic takes effect on the next load, when the engine makes its own guess.
        this.change({ tier: null }, true);
      }
    }));
    row.appendChild(el('div', 'hint', current.hint + (s.tier === null ? ` Running now: ${this.tierName()}.` : '')));
    gfx.appendChild(row);
    if (s.tier) {
      const adv = el('details', 'advanced');
      adv.appendChild(el('summary', '', 'Individual effects'));
      for (const [key, label] of [['shadows', 'Shadows'], ['ao', 'Contact shadows (ambient occlusion)'], ['bloom', 'Glow (bloom)']] as const) {
        adv.appendChild(this.switchRow(label, s[key], (v) => {
          this.change({ [key]: v });
          this.applyGraphics();
        }));
      }
      gfx.appendChild(adv);
    }
    panel.appendChild(gfx);

    // Accessibility
    const a11y = el('section', 'settings-section');
    a11y.appendChild(el('div', 'eyebrow', 'Comfort and access'));
    a11y.appendChild(this.switchRow('Reduced motion', s.reducedMotion, (v) => this.change({ reducedMotion: v }), 'No head bob, camera shake or sweeping transitions.'));
    const text = el('div', 'settings-row');
    text.appendChild(el('div', 'label', 'Text size'));
    const sizes: TextSize[] = ['default', 'large', 'larger'];
    text.appendChild(this.segmented(['Default', 'Large', 'Larger'], sizes.indexOf(s.textSize), (i) => this.change({ textSize: sizes[i] }, true)));
    a11y.appendChild(text);
    a11y.appendChild(this.slider('Mouse sensitivity', s.sensitivity, 0.4, 2.5, 0.1, (v) => this.change({ sensitivity: v }), (v) => `${Math.round(v * 100)}%`));
    panel.appendChild(a11y);

    const foot = el('div', 'panel-foot');
    foot.innerHTML = '<span class="keycap">O</span> or <span class="keycap" style="margin-left:.5em">Esc</span> close';
    panel.appendChild(foot);

    const reopen = PanelManager.isOpen && PanelManager.activeId === 'settings';
    if (reopen) PanelManager.setContent(panel);
    else PanelManager.open(panel, undefined, undefined, 'settings');
    (panel.querySelector('button, input') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  private tierName(): string {
    const tier = getActiveEngine()?.getQualityTier();
    return QUALITY_OPTIONS.find((o) => o.key === tier)?.label ?? 'Quality';
  }

  private slider(label: string, value: number, min: number, max: number, step: number, onInput: (v: number) => void, fmt: (v: number) => string): HTMLElement {
    const row = el('div', 'settings-row');
    const id = `set-${label.replace(/\W+/g, '-').toLowerCase()}`;
    const lab = el('label', '', `${label}: ${fmt(value)}`);
    lab.htmlFor = id;
    const input = el('input', 'slider');
    input.type = 'range';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.oninput = () => {
      const v = Number(input.value);
      lab.textContent = `${label}: ${fmt(v)}`;
      onInput(v);
    };
    row.append(lab, input);
    return row;
  }

  private segmented(labels: string[], selected: number, onPick: (i: number) => void): HTMLElement {
    const group = el('div', 'segmented');
    group.setAttribute('role', 'group');
    labels.forEach((label, i) => {
      const b = el('button', '', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(i === selected));
      b.onclick = () => {
        AudioSystem.playConfirm();
        onPick(i);
      };
      group.appendChild(b);
    });
    return group;
  }

  private switchRow(label: string, value: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
    const row = el('div', 'settings-row');
    const id = `set-${label.replace(/\W+/g, '-').toLowerCase()}`;
    const lab = el('label', '', label);
    lab.htmlFor = id;
    const sw = el('button', 'switch');
    sw.type = 'button';
    sw.id = id;
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(value));
    sw.onclick = () => {
      const v = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(v));
      AudioSystem.playConfirm();
      onChange(v);
    };
    row.append(lab, sw);
    if (hint) row.appendChild(el('div', 'hint', hint));
    return row;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
  }
}

export const SettingsPanel = new SettingsPanelImpl();
