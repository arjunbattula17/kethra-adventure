import type { QualityTier } from '../core/PostProcessing';
import { getActiveEngine } from '../core/EngineRegistry';
import { PanelManager } from './PanelManager';

const SETTINGS_KEY = 'kethra_settings_v1';

interface Settings {
  tier: QualityTier;
  shadows: boolean;
  ao: boolean;
  bloom: boolean;
}

// Mirrors Engine.ts's TIERS (shadows) and PostProcessing.ts's setQuality() (ao/bloom) — the
// preset each tier applies before either checkbox is allowed to override it individually.
const TIER_DEFAULTS: Record<QualityTier, Omit<Settings, 'tier'>> = {
  high: { shadows: true, ao: true, bloom: true },
  medium: { shadows: true, ao: false, bloom: true },
  low: { shadows: false, ao: false, bloom: false },
};

const DEFAULT_SETTINGS: Settings = { tier: 'high', ...TIER_DEFAULTS.high };

function isQualityTier(v: unknown): v is QualityTier {
  return v === 'low' || v === 'medium' || v === 'high';
}

/** Returns the player's explicitly saved settings, or null when they have never chosen any. The
 * distinction matters: applying a *default* through setManualQualityTier() would permanently
 * disable the engine's automatic tier selection and runtime downgrade monitor — which is exactly
 * the bug this replaced: every fresh profile was forced to 'high' at boot, so a 2-core machine
 * never saw the low tier and the frame-time governor never ran for anyone. */
function loadSettings(): Settings | null {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed && typeof parsed === 'object' &&
      isQualityTier(parsed.tier) &&
      typeof parsed.shadows === 'boolean' &&
      typeof parsed.ao === 'boolean' &&
      typeof parsed.bloom === 'boolean'
    ) {
      return parsed as Settings;
    }
  } catch {
    // fall through to defaults
  }
  return null;
}

function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const TIER_OPTIONS: { key: QualityTier; label: string }[] = [
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
];

const TOGGLE_OPTIONS: { key: 'shadows' | 'ao' | 'bloom'; label: string }[] = [
  { key: 'shadows', label: 'Shadows' },
  { key: 'ao', label: 'Ambient Occlusion' },
  { key: 'bloom', label: 'Bloom' },
];

class SettingsPanelImpl {
  private settings: Settings = { ...DEFAULT_SETTINGS };
  // False until the player explicitly picks something in this panel (now or in a past session).
  // While false, the engine stays on its automatic tier/downgrade behavior and this panel only
  // mirrors what the engine chose.
  private playerChosen = false;

  private keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'KeyO') {
      e.preventDefault();
      // Checking activeId (not just isOpen) so O switches TO this panel from a different one
      // (e.g. Character) instead of just closing whatever else happens to be open.
      if (PanelManager.isOpen && PanelManager.activeId === 'settings') PanelManager.close();
      else this.open();
    }
  };

  init(): void {
    window.addEventListener('keydown', this.keyHandler);
    const saved = loadSettings();
    if (saved) {
      this.playerChosen = true;
      this.settings = saved;
      this.apply();
    }
    // No saved choice: leave the engine alone — its hardware guess and runtime downgrade monitor
    // are the defaults, and apply() would silence them for good (see loadSettings).
  }

  open(): void {
    if (!this.playerChosen) {
      // Mirror whatever the automatic system currently runs at, so the panel opens truthful.
      const engine = getActiveEngine();
      if (engine) {
        const tier = engine.getQualityTier();
        this.settings = { tier, ...TIER_DEFAULTS[tier] };
      }
    }
    this.render();
  }

  private apply(): void {
    const engine = getActiveEngine();
    if (!engine) return;
    engine.setManualQualityTier(this.settings.tier);
    engine.setShadowsEnabled(this.settings.shadows);
    engine.setAOEnabled(this.settings.ao);
    engine.setBloomEnabled(this.settings.bloom);
  }

  private setTier(tier: QualityTier): void {
    this.playerChosen = true;
    this.settings = { tier, ...TIER_DEFAULTS[tier] };
    saveSettings(this.settings);
    this.apply();
    this.render();
  }

  private setToggle(key: 'shadows' | 'ao' | 'bloom', value: boolean): void {
    this.playerChosen = true;
    this.settings = { ...this.settings, [key]: value };
    saveSettings(this.settings);
    this.apply();
  }

  private render(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.width = '420px';

    const heading = document.createElement('h2');
    heading.textContent = 'Settings';
    panel.appendChild(heading);

    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.textContent = 'Graphics quality — changes apply immediately and are saved.';
    panel.appendChild(sub);

    const tierLabel = document.createElement('div');
    tierLabel.className = 'settings-label';
    tierLabel.textContent = 'Quality';
    panel.appendChild(tierLabel);

    const tierRow = document.createElement('div');
    tierRow.className = 'settings-tier-row';
    for (const opt of TIER_OPTIONS) {
      const label = document.createElement('label');
      label.className = 'settings-radio';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'quality-tier';
      input.value = opt.key;
      input.checked = this.settings.tier === opt.key;
      input.onchange = () => this.setTier(opt.key);
      label.appendChild(input);
      label.appendChild(document.createTextNode(opt.label));
      tierRow.appendChild(label);
    }
    panel.appendChild(tierRow);

    const effectsLabel = document.createElement('div');
    effectsLabel.className = 'settings-label';
    effectsLabel.textContent = 'Effects';
    panel.appendChild(effectsLabel);

    for (const opt of TOGGLE_OPTIONS) {
      const row = document.createElement('label');
      row.className = 'settings-checkbox-row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = this.settings[opt.key];
      input.onchange = () => this.setToggle(opt.key, input.checked);
      row.appendChild(input);
      row.appendChild(document.createTextNode(opt.label));
      panel.appendChild(row);
    }

    const hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.textContent = 'O or ESC to close';
    panel.appendChild(hint);

    PanelManager.open(panel, undefined, undefined, 'settings');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
  }
}

export const SettingsPanel = new SettingsPanelImpl();
