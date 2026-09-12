import { PanelManager } from '../ui/PanelManager';
import { AudioSystem } from '../audio/AudioSystem';

/**
 * The scan-correlation puzzle — the first game beat, played seated at the console right after
 * the galaxy reveal. The reveal ends on a sensor ping; this is the player making sense of what
 * that ping saw. Four unlabeled contacts with real instrument readings have to be matched to
 * the four orbits, and every clue is true of the actual system in planetData.ts: two ring
 * echoes, one artificial (Vessek Anchorage IS a shattered ring-station) and sunward of the
 * natural one (Isilthe); a chlorophyll-analog line on the first orbit past the asteroid belt
 * (Kethra — the belt sits inside its orbit in the reveal too); the slowest Doppler period on
 * the outermost body. Orrun falls out by elimination. Solving it is what calibrates the chart,
 * so the toast the player has always gotten — "Galaxy Map calibrated" — becomes something they
 * earned rather than were given.
 *
 * The panel is built around a live miniature of the solar chart (same visual language as
 * MapController's: sun glow, orbit ellipses, belt, grain) so the puzzle reads as operating the
 * nav console, not filling in a form: assignments appear as contact blips on their orbits,
 * locked fixes turn the orbit green, and the solve resolves Kethra's actual surface on orbit I
 * — the exact image the navigation chart then shows for the rest of the game.
 *
 * Deliberately not skippable and not failable: wrong correlations get a specific instrument
 * contradiction naming what does not fit, and stay editable until everything locks.
 */

interface Contact {
  /** Stable key used for hit-testing and the harnesses. */
  key: string;
  symbol: string;
  label: string;
  readings: string[];
  /** Correct orbit slot, 1 = innermost. */
  slot: number;
  /** What the instruments say when this contact is correlated to the wrong orbit. */
  contradiction: string;
}

const CONTACTS: Contact[] = [
  {
    key: 'alpha',
    symbol: 'α',
    label: 'Contact α',
    readings: ['Ring echo: POSITIVE — irregular, natural debris', 'Doppler: slowest orbital period of the four'],
    slot: 4,
    contradiction: 'Doppler period too long for this orbit — α is moving like a far body.',
  },
  {
    key: 'beta',
    symbol: 'β',
    label: 'Contact β',
    readings: ['Ring echo: negative', 'Radio band: continuous silicate-storm static'],
    slot: 3,
    contradiction: 'Spectra collide with another contact’s fix — re-check what the notes pin first.',
  },
  {
    key: 'gamma',
    symbol: 'γ',
    label: 'Contact γ',
    readings: ['Ring echo: negative', 'Spectral: chlorophyll-analog absorption — vegetated surface'],
    slot: 1,
    contradiction: 'Vegetation line only resolves this side of the belt gap — γ rides the first orbit past it.',
  },
  {
    key: 'delta',
    symbol: 'δ',
    label: 'Contact δ',
    readings: ['Ring echo: POSITIVE — sectioned, regular geometry', 'Structure reads artificial in part'],
    slot: 2,
    contradiction: 'The sectioned ring return sits sunward of the natural one — δ is the nearer of the two.',
  },
];

const SCAN_NOTES = [
  'Two contacts return ring echoes. The sectioned, artificial ring orbits sunward of the ragged natural one.',
  'The chlorophyll-analog line only resolves on the first orbit beyond the asteroid belt.',
  'Doppler shift falls with distance: the slowest period belongs to the farthest orbit.',
];

const SLOT_LABELS = ['ORBIT I · past the belt', 'ORBIT II', 'ORBIT III', 'ORBIT IV · farthest'];
/** Where each orbit's contact blip sits on the chart, staggered so labels never collide. */
const BLIP_ANGLES = [0.5, 2.4, 4.1, 5.6];

export class ScanCorrelation {
  onSolved: () => void = () => {};

  private assigned = new Map<number, string>();
  private selectedContact: string | null = null;
  private root!: HTMLDivElement;
  private status!: HTMLDivElement;
  private chart!: HTMLCanvasElement;
  private chartCtx!: CanvasRenderingContext2D;
  private solved = false;
  private locked = new Set<number>();
  private rafId = 0;
  private startTime = performance.now();
  private kethraImg: HTMLImageElement;

  constructor() {
    this.kethraImg = new Image();
    this.kethraImg.src = `${import.meta.env.BASE_URL}textures/planets/kethra_day.jpg`;
  }

  start(): void {
    this.render();
  }

  private render(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'scan-correlation-panel';

    panel.innerHTML = `
      <h2>Scan Correlation</h2>
      <div class="subtitle">The long-range scan returned four contacts. Fix each to its orbit so navigation can calibrate the chart.</div>
      <canvas class="scan-chart"></canvas>
      <div class="scan-orbits"></div>
      <div class="scan-contacts"></div>
      <div class="scan-notes"></div>
      <div class="scan-footer">
        <div class="scan-status"></div>
        <button class="scan-correlate" disabled>Correlate</button>
      </div>
    `;

    const contactsEl = panel.querySelector('.scan-contacts') as HTMLDivElement;
    for (const c of CONTACTS) {
      const card = document.createElement('div');
      card.className = 'scan-contact';
      card.dataset.contact = c.key;
      card.innerHTML = `<div class="scan-contact-title"><span class="scan-glyph">${c.symbol}</span>${c.label}</div>` +
        c.readings.map((r) => `<div class="scan-reading">▸ ${r}</div>`).join('');
      card.addEventListener('click', () => this.selectContact(c.key));
      contactsEl.appendChild(card);
    }

    const orbitsEl = panel.querySelector('.scan-orbits') as HTMLDivElement;
    for (let slot = 1; slot <= 4; slot++) {
      const el = document.createElement('div');
      el.className = 'scan-slot';
      el.dataset.slot = String(slot);
      el.innerHTML = `<div class="scan-slot-label">${SLOT_LABELS[slot - 1]}</div><div class="scan-slot-fix">— unfixed —</div>`;
      el.addEventListener('click', () => this.assignToSlot(slot));
      orbitsEl.appendChild(el);
    }

    const notesEl = panel.querySelector('.scan-notes') as HTMLDivElement;
    notesEl.innerHTML = `<div class="scan-notes-title">SCAN NOTES</div>` +
      SCAN_NOTES.map((n) => `<div class="scan-note">· ${n}</div>`).join('');

    this.status = panel.querySelector('.scan-status') as HTMLDivElement;
    const correlate = panel.querySelector('.scan-correlate') as HTMLButtonElement;
    correlate.addEventListener('click', () => this.correlate());

    this.chart = panel.querySelector('.scan-chart') as HTMLCanvasElement;
    this.chartCtx = this.chart.getContext('2d')!;

    this.root = panel;
    // Escape must not skip the first game: it is the route out of the opening. A gentle refusal
    // instead — the panel closes itself only on the solve.
    PanelManager.open(
      panel,
      () => cancelAnimationFrame(this.rafId),
      () => {
        if (!this.solved) this.setStatus('Correlation incomplete — navigation needs all four fixes.', 'warn');
      },
    );
    this.setStatus('Select a contact, then the orbit it belongs to.', '');

    const dpr = window.devicePixelRatio;
    const sizeChart = () => {
      const rect = this.chart.getBoundingClientRect();
      this.chart.width = Math.max(1, Math.round(rect.width * dpr));
      this.chart.height = Math.max(1, Math.round(rect.height * dpr));
    };
    sizeChart();
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      if (this.chart.width <= 1) sizeChart();
      this.drawChart();
    };
    loop();
  }

  /** The miniature nav chart: the connective tissue between the reveal, this puzzle, and the
   * solar chart the player uses afterwards — all three share one visual language. */
  private drawChart(): void {
    const ctx = this.chartCtx;
    const w = this.chart.width;
    const h = this.chart.height;
    if (w <= 1) return;
    const dpr = window.devicePixelRatio;
    const t = (performance.now() - this.startTime) / 1000;

    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
    bg.addColorStop(0, '#10131d');
    bg.addColorStop(1, '#05060a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const sx = ((i * 97) % 1000) / 1000 * w;
      const sy = ((i * 53) % 1000) / 1000 * h;
      ctx.globalAlpha = 0.18 + 0.3 * Math.abs(Math.sin(t * 0.5 + i));
      ctx.fillStyle = '#dfe6f5';
      ctx.fillRect(sx, sy, dpr, dpr);
    }
    ctx.globalAlpha = 1;

    const cx = w * 0.5;
    const cy = h * 0.56;
    const maxR = Math.min(w * 0.44, h * 1.15);
    const squash = 0.34;

    const sunR = 7 * dpr;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR * 4);
    glow.addColorStop(0, 'rgba(255,220,160,0.9)');
    glow.addColorStop(1, 'rgba(217,164,65,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, sunR * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe3ab';
    ctx.beginPath();
    ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
    ctx.fill();

    // Asteroid belt just inside orbit I — the anchor the vegetation clue hangs on.
    const beltR = maxR * 0.19;
    ctx.fillStyle = 'rgba(180,175,160,0.5)';
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + t * 0.02;
      const jitter = 1 + (((i * 37) % 10) - 5) * 0.014;
      ctx.fillRect(cx + Math.cos(a) * beltR * jitter, cy + Math.sin(a) * beltR * squash * jitter, dpr, dpr);
    }

    for (let slot = 1; slot <= 4; slot++) {
      const orbitR = maxR * (0.28 + (slot - 1) * 0.24);
      const key = this.assigned.get(slot);
      const isLocked = this.locked.has(slot);
      ctx.save();
      if (!key) ctx.setLineDash([4 * dpr, 5 * dpr]);
      ctx.strokeStyle = isLocked ? 'rgba(124,191,124,0.55)' : key ? 'rgba(217,164,65,0.4)' : 'rgba(180,190,220,0.16)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.ellipse(cx, cy, orbitR, orbitR * squash, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const angle = BLIP_ANGLES[slot - 1];
      const px = cx + Math.cos(angle) * orbitR;
      const py = cy + Math.sin(angle) * orbitR * squash;

      if (this.solved && slot === 1 && this.kethraImg.complete && this.kethraImg.naturalWidth > 0) {
        const r = 9 * dpr;
        const halo = ctx.createRadialGradient(px, py, 0, px, py, r * 2.6);
        halo.addColorStop(0, 'rgba(124,191,124,0.5)');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(px, py, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.clip();
        const crop = this.kethraImg.naturalHeight;
        ctx.drawImage(this.kethraImg, (this.kethraImg.naturalWidth - crop) / 2, 0, crop, crop, px - r, py - r, r * 2, r * 2);
        ctx.restore();
        ctx.strokeStyle = '#7cbf7c';
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `${9 * dpr}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#7cbf7c';
        ctx.fillText('KETHRA', px, py + r + 11 * dpr);
      } else if (key) {
        const contact = CONTACTS.find((c) => c.key === key)!;
        const color = isLocked ? '#7cbf7c' : '#d9a441';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 4 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `600 ${10 * dpr}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText(contact.symbol, px, py - 7 * dpr);
      } else {
        // Unfixed: a pulsing unknown return, the same beacon language as the ship's ping.
        const pulse = 0.35 + 0.3 * Math.abs(Math.sin(t * 2 + slot));
        ctx.strokeStyle = `rgba(217,164,65,${pulse.toFixed(3)})`;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.arc(px, py, 4.5 * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `${9 * dpr}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(217,164,65,${pulse.toFixed(3)})`;
        ctx.fillText('?', px, py + 3 * dpr);
      }

      // Roman numeral at each orbit's right apex, matching the chips below.
      ctx.font = `${8.5 * dpr}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'left';
      ctx.fillStyle = isLocked ? 'rgba(124,191,124,0.8)' : 'rgba(168,158,136,0.75)';
      ctx.fillText(['I', 'II', 'III', 'IV'][slot - 1], cx + orbitR + 5 * dpr, cy + 3 * dpr);
    }

    // Instrument scanline drifting down the readout, very faint.
    const scanY = ((t * 14) % (h / dpr)) * dpr;
    ctx.fillStyle = 'rgba(217,164,65,0.04)';
    ctx.fillRect(0, scanY, w, 2 * dpr);
  }

  private selectContact(key: string): void {
    // A contact already locked into a verified slot is settled evidence.
    const inLocked = [...this.assigned.entries()].some(([slot, k]) => k === key && this.locked.has(slot));
    if (inLocked || this.solved) return;
    this.selectedContact = this.selectedContact === key ? null : key;
    AudioSystem.playUiClick();
    this.refresh();
  }

  private assignToSlot(slot: number): void {
    if (this.locked.has(slot) || this.solved) return;
    if (!this.selectedContact) {
      // Clicking a filled slot with nothing selected clears it, so a change of mind is one click.
      if (this.assigned.has(slot)) {
        this.assigned.delete(slot);
        AudioSystem.playUiClick();
        this.refresh();
      }
      return;
    }
    for (const [s, k] of [...this.assigned.entries()]) {
      if (k === this.selectedContact && !this.locked.has(s)) this.assigned.delete(s);
    }
    this.assigned.set(slot, this.selectedContact);
    this.selectedContact = null;
    AudioSystem.playUiClick();
    this.refresh();
  }

  private correlate(): void {
    let wrong = 0;
    let firstContradiction = '';
    for (const [slot, key] of this.assigned) {
      const contact = CONTACTS.find((c) => c.key === key)!;
      if (contact.slot === slot) {
        if (!this.locked.has(slot)) this.locked.add(slot);
      } else {
        wrong++;
        if (!firstContradiction) firstContradiction = contact.contradiction;
        this.assigned.delete(slot);
      }
    }
    if (wrong === 0 && this.locked.size === 4) {
      this.solved = true;
      AudioSystem.playChime();
      this.setStatus('CHART CALIBRATED — closest viable destination: KETHRA, in scanner range. The other fixes hold, far beyond reach.', 'good');
      this.refresh();
      window.setTimeout(() => {
        PanelManager.close();
        this.onSolved();
      }, 3200);
    } else if (wrong > 0) {
      AudioSystem.playError();
      this.setStatus(firstContradiction, 'warn');
      this.refresh();
    }
  }

  private setStatus(text: string, kind: '' | 'warn' | 'good'): void {
    this.status.textContent = text;
    this.status.className = `scan-status${kind ? ` ${kind}` : ''}`;
    if (kind === 'warn') {
      this.status.classList.remove('flash');
      void this.status.offsetWidth;
      this.status.classList.add('flash');
    }
  }

  private refresh(): void {
    for (const card of this.root.querySelectorAll<HTMLDivElement>('.scan-contact')) {
      const key = card.dataset.contact!;
      const slotOf = [...this.assigned.entries()].find(([, k]) => k === key)?.[0];
      card.classList.toggle('selected', this.selectedContact === key);
      card.classList.toggle('placed', slotOf !== undefined);
      card.classList.toggle('locked', slotOf !== undefined && this.locked.has(slotOf));
    }
    for (const el of this.root.querySelectorAll<HTMLDivElement>('.scan-slot')) {
      const slot = Number(el.dataset.slot);
      const key = this.assigned.get(slot);
      const contact = key ? CONTACTS.find((c) => c.key === key) : null;
      const fix = el.querySelector('.scan-slot-fix') as HTMLDivElement;
      if (this.solved && slot === 1) fix.textContent = 'KETHRA — IN RANGE';
      else fix.textContent = contact ? (this.locked.has(slot) ? `${contact.label} — FIX LOCKED` : contact.label) : '— unfixed —';
      el.classList.toggle('filled', !!contact);
      el.classList.toggle('locked', this.locked.has(slot));
    }
    const correlate = this.root.querySelector('.scan-correlate') as HTMLButtonElement;
    correlate.disabled = this.assigned.size < 4 || this.solved;
    if (this.locked.size > 0 && !this.solved) {
      this.setStatus(`${this.locked.size} of 4 fixes locked — the instruments agree so far.`, 'good');
    }
  }
}
