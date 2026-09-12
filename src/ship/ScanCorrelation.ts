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
 * Deliberately not skippable and not failable: wrong correlations get a specific instrument
 * contradiction naming what does not fit, and stay editable until everything locks.
 */

interface Contact {
  /** Stable key used for hit-testing and the harnesses. */
  key: string;
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
    label: 'Contact α',
    readings: ['Ring echo: POSITIVE — irregular, natural debris', 'Doppler: slowest orbital period of the four'],
    slot: 4,
    contradiction: 'Doppler period too long for this orbit — α is moving like a far body.',
  },
  {
    key: 'beta',
    label: 'Contact β',
    readings: ['Ring echo: negative', 'Radio band: continuous silicate-storm static'],
    slot: 3,
    contradiction: 'Spectra collide with another contact’s fix — re-check what the notes pin first.',
  },
  {
    key: 'gamma',
    label: 'Contact γ',
    readings: ['Ring echo: negative', 'Spectral: chlorophyll-analog absorption — vegetated surface'],
    slot: 1,
    contradiction: 'Vegetation line only resolves this side of the belt gap — γ rides the first orbit past it.',
  },
  {
    key: 'delta',
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

const SLOT_LABELS = ['ORBIT I — just past the belt', 'ORBIT II', 'ORBIT III', 'ORBIT IV — farthest fix'];

export class ScanCorrelation {
  onSolved: () => void = () => {};

  private assigned = new Map<number, string>();
  private selectedContact: string | null = null;
  private root!: HTMLDivElement;
  private status!: HTMLDivElement;
  private solved = false;
  private locked = new Set<number>();

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
      <div class="scan-columns">
        <div class="scan-contacts"></div>
        <div class="scan-orbits"></div>
      </div>
      <div class="scan-notes"></div>
      <div class="scan-status"></div>
      <button class="scan-correlate" disabled>Correlate</button>
    `;

    const contactsEl = panel.querySelector('.scan-contacts') as HTMLDivElement;
    for (const c of CONTACTS) {
      const card = document.createElement('div');
      card.className = 'scan-contact';
      card.dataset.contact = c.key;
      card.innerHTML = `<div class="scan-contact-title">${c.label}</div>` +
        c.readings.map((r) => `<div class="scan-reading">${r}</div>`).join('');
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

    this.root = panel;
    // Escape must not skip the first game: it is the route out of the opening. A gentle refusal
    // instead — the panel closes itself only on the solve.
    PanelManager.open(panel, undefined, () => {
      if (!this.solved) this.setStatus('Correlation incomplete — navigation needs all four fixes.', 'warn');
    });
    this.setStatus('Select a contact, then the orbit it belongs to.', '');
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
      }, 2600);
    } else if (wrong > 0) {
      AudioSystem.playError();
      this.setStatus(firstContradiction, 'warn');
      this.refresh();
    }
  }

  private setStatus(text: string, kind: '' | 'warn' | 'good'): void {
    this.status.textContent = text;
    this.status.className = `scan-status${kind ? ` ${kind}` : ''}`;
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
