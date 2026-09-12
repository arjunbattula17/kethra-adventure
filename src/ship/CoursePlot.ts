import { PanelManager } from '../ui/PanelManager';
import { AudioSystem } from '../audio/AudioSystem';

/**
 * The course-plot puzzle — the first game beat, played seated at the console right after the
 * galaxy reveal. The reveal showed the system; this is doing the navigator's arithmetic to
 * reach the one world in range. Three chained steps of real navigation math (the same
 * distance = speed x time reasoning sailors, pilots and mission planners use), with numbers
 * chosen so every step is clean mental arithmetic: distance is the gap between the ship's
 * parking orbit and Kethra's (60 - 12), time is distance over the Doppler-confirmed cruise
 * speed (48 / 8), and the reserve-cell count covers the trip plus the computer's two days of
 * margin at two days per cell ((6 + 2) / 2). Wrong answers get a hint that re-teaches the
 * relationship but never hands over the number.
 *
 * The panel is built around the same miniature nav chart as the solar map (sun, belt, orbit
 * ellipses), and the course draws itself as the steps solve: the distance line first, then
 * day-tick marks along it, then the fuel pips — so progress is visible on the instrument, not
 * just in text. Solving IS the calibration: the post-reveal flags and the "Galaxy Map
 * calibrated" toast land as something earned.
 *
 * Deliberately not skippable and not failable.
 */

const SHIP_ORBIT = 12;
const KETHRA_ORBIT = 60;
const CRUISE_SPEED = 8;
const MARGIN_DAYS = 2;
const DAYS_PER_CELL = 2;

const DISTANCE = KETHRA_ORBIT - SHIP_ORBIT; // 48
const DAYS = DISTANCE / CRUISE_SPEED; // 6
const CELLS = (DAYS + MARGIN_DAYS) / DAYS_PER_CELL; // 4

interface Step {
  prompt: string;
  detail: string;
  unit: string;
  answer: number;
  hint: string;
  confirm: string;
}

const STEPS: Step[] = [
  {
    prompt: 'How far is the transfer?',
    detail: `Kethra rides the first orbit past the belt, ${KETHRA_ORBIT} Mkm out. We are parked at ${SHIP_ORBIT} Mkm.`,
    unit: 'Mkm',
    answer: DISTANCE,
    hint: `Distance is the gap between two positions — from our ${SHIP_ORBIT} out to Kethra's ${KETHRA_ORBIT}.`,
    confirm: `Transfer distance locked: ${DISTANCE} Mkm.`,
  },
  {
    prompt: 'How many days at cruise?',
    detail: `Doppler ranging confirms cruise speed: ${CRUISE_SPEED} Mkm each day, for all ${DISTANCE} Mkm.`,
    unit: 'days',
    answer: DAYS,
    hint: `Time is distance shared out by speed — how many ${CRUISE_SPEED}s fit inside ${DISTANCE}?`,
    confirm: `Flight time locked: ${DAYS} days.`,
  },
  {
    prompt: 'How many reserve cells?',
    detail: `Each reserve cell powers ${DAYS_PER_CELL} days of cruise. Navigation demands the ${DAYS}-day trip plus ${MARGIN_DAYS} days of margin.`,
    unit: 'cells',
    answer: CELLS,
    hint: `Total the days first — trip plus margin — then count how many ${DAYS_PER_CELL}-day cells cover them.`,
    confirm: `Reserve loadout locked: ${CELLS} cells.`,
  },
];

export class CoursePlot {
  onSolved: () => void = () => {};

  private stepIndex = 0;
  private entry = '';
  private solved = false;
  private root!: HTMLDivElement;
  private status!: HTMLDivElement;
  private chart!: HTMLCanvasElement;
  private chartCtx!: CanvasRenderingContext2D;
  private rafId = 0;
  private startTime = performance.now();
  private kethraImg: HTMLImageElement;
  /** Set when the current step just bounced, for the shake + amber flash on the readout. */
  private lastWrongAt = 0;

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
    panel.id = 'course-plot-panel';

    panel.innerHTML = `
      <h2>Course Plot</h2>
      <div class="subtitle">The chart is live — now the navigator's arithmetic. Three figures and the computer can commit the burn.</div>
      <canvas class="plot-chart"></canvas>
      <div class="plot-steps"></div>
      <div class="plot-work">
        <div class="plot-question"></div>
        <div class="plot-entry-row">
          <div class="plot-entry"><span class="plot-entry-value"></span><span class="plot-entry-unit"></span></div>
          <div class="plot-keypad"></div>
        </div>
      </div>
      <div class="plot-status"></div>
    `;

    const keypad = panel.querySelector('.plot-keypad') as HTMLDivElement;
    for (const key of ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'CLR', '0', 'ENTER']) {
      const b = document.createElement('button');
      b.className = 'plot-key' + (key === 'ENTER' ? ' enter' : '') + (key === 'CLR' ? ' clr' : '');
      b.dataset.key = key;
      b.textContent = key;
      b.addEventListener('click', () => this.press(key));
      keypad.appendChild(b);
    }

    this.status = panel.querySelector('.plot-status') as HTMLDivElement;
    this.chart = panel.querySelector('.plot-chart') as HTMLCanvasElement;
    this.chartCtx = this.chart.getContext('2d')!;
    this.root = panel;

    PanelManager.open(
      panel,
      () => cancelAnimationFrame(this.rafId),
      () => {
        // Escape must not skip the first game: it is the route out of the opening.
        if (!this.solved) this.setStatus('Plot incomplete — the computer needs all three figures.', 'warn');
      },
    );

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
    this.refresh();
    this.setStatus('Work each figure out, key it in, and press ENTER.', '');
  }

  private press(key: string): void {
    if (this.solved) return;
    if (key === 'CLR') {
      this.entry = '';
    } else if (key === 'ENTER') {
      this.submit();
      return;
    } else if (this.entry.length < 3) {
      this.entry += key;
    }
    AudioSystem.playUiClick();
    this.refresh();
  }

  private submit(): void {
    const step = STEPS[this.stepIndex];
    if (this.entry === '') return;
    const value = Number(this.entry);
    if (value === step.answer) {
      AudioSystem.playChime();
      this.entry = '';
      this.stepIndex++;
      if (this.stepIndex >= STEPS.length) {
        this.solved = true;
        this.setStatus(`CHART CALIBRATED — burn committed: ${DISTANCE} Mkm, ${DAYS} days, ${CELLS} cells. Kethra is in range.`, 'good');
        this.refresh();
        window.setTimeout(() => {
          PanelManager.close();
          this.onSolved();
        }, 3200);
      } else {
        this.setStatus(step.confirm, 'good');
        this.refresh();
      }
    } else {
      AudioSystem.playError();
      this.lastWrongAt = performance.now();
      this.entry = '';
      this.setStatus(step.hint, 'warn');
      this.refresh();
    }
  }

  private setStatus(text: string, kind: '' | 'warn' | 'good'): void {
    this.status.textContent = text;
    this.status.className = `plot-status${kind ? ` ${kind}` : ''}`;
    if (kind === 'warn') {
      this.status.classList.remove('flash');
      void this.status.offsetWidth;
      this.status.classList.add('flash');
    }
  }

  private refresh(): void {
    const stepsEl = this.root.querySelector('.plot-steps') as HTMLDivElement;
    stepsEl.innerHTML = STEPS.map((s, i) => {
      const state = i < this.stepIndex || this.solved ? 'done' : i === this.stepIndex ? 'active' : 'pending';
      const value = i < this.stepIndex || this.solved ? `${s.answer} ${s.unit}` : '· · ·';
      return `<div class="plot-step ${state}"><span class="plot-step-num">${i + 1}</span><span class="plot-step-name">${s.prompt}</span><span class="plot-step-value">${value}</span></div>`;
    }).join('');

    const q = this.root.querySelector('.plot-question') as HTMLDivElement;
    if (this.solved) {
      q.innerHTML = `<div class="plot-q-prompt">Burn committed.</div><div class="plot-q-detail">The computer holds the plot: ${DISTANCE} Mkm at ${CRUISE_SPEED} Mkm/day, ${CELLS} cells aboard.</div>`;
    } else {
      const step = STEPS[this.stepIndex];
      q.innerHTML = `<div class="plot-q-prompt">${this.stepIndex + 1}. ${step.prompt}</div><div class="plot-q-detail">${step.detail}</div>`;
    }
    (this.root.querySelector('.plot-entry-value') as HTMLSpanElement).textContent = this.entry === '' ? '—' : this.entry;
    (this.root.querySelector('.plot-entry-unit') as HTMLSpanElement).textContent = this.solved ? '' : STEPS[this.stepIndex].unit;
    (this.root.querySelector('.plot-entry') as HTMLDivElement).classList.toggle('solved', this.solved);
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('.plot-key')) b.disabled = this.solved;
  }

  /** The same miniature nav-chart language as the solar map; the plot draws onto it per step. */
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

    const cx = w * 0.32;
    const cy = h * 0.55;
    const maxR = Math.min(w * 0.62, h * 1.5);
    const squash = 0.32;
    // Chart scale: Mkm to pixels along the +x axis where the whole plot is laid out.
    const px = (mkm: number) => cx + (mkm / KETHRA_ORBIT) * maxR * 0.52;

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

    // Belt between the ship's parking orbit and Kethra's — same landmark as everywhere else.
    const beltPx = px(36) - cx;
    ctx.fillStyle = 'rgba(180,175,160,0.5)';
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + t * 0.02;
      const jitter = 1 + (((i * 37) % 10) - 5) * 0.014;
      ctx.fillRect(cx + Math.cos(a) * beltPx * jitter, cy + Math.sin(a) * beltPx * squash * jitter, dpr, dpr);
    }

    // The two orbits that matter: our parking orbit and Kethra's.
    for (const [mkm, label] of [[SHIP_ORBIT, ''], [KETHRA_ORBIT, '']] as [number, string][]) {
      const r = px(mkm) - cx;
      ctx.strokeStyle = 'rgba(180,190,220,0.18)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * squash, 0, 0, Math.PI * 2);
      ctx.stroke();
      void label;
    }

    const shipX = px(SHIP_ORBIT);
    const kethraX = px(KETHRA_ORBIT);

    // Step 1 solved: the transfer line, with its distance figure.
    if (this.stepIndex >= 1 || this.solved) {
      ctx.strokeStyle = 'rgba(217,164,65,0.75)';
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      ctx.moveTo(shipX + 6 * dpr, cy);
      ctx.lineTo(kethraX - 10 * dpr, cy);
      ctx.stroke();
      ctx.font = `${9 * dpr}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d9a441';
      ctx.fillText(`${DISTANCE} Mkm`, (shipX + kethraX) / 2, cy - 8 * dpr);
    }

    // Step 2 solved: day ticks along the line, one per cruise day.
    if (this.stepIndex >= 2 || this.solved) {
      for (let d = 1; d <= DAYS; d++) {
        const tx = shipX + ((kethraX - shipX) * d) / DAYS;
        ctx.strokeStyle = 'rgba(124,201,224,0.8)';
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.moveTo(tx, cy - 4 * dpr);
        ctx.lineTo(tx, cy + 4 * dpr);
        ctx.stroke();
      }
      ctx.font = `${9 * dpr}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7cc9e0';
      ctx.fillText(`${DAYS} days`, (shipX + kethraX) / 2, cy + 16 * dpr);
    }

    // Solved: fuel pips by the ship and Kethra resolved in green.
    if (this.solved) {
      for (let c = 0; c < CELLS; c++) {
        ctx.fillStyle = '#7cbf7c';
        ctx.fillRect(shipX - 14 * dpr + c * 7 * dpr, cy + 24 * dpr, 4 * dpr, 8 * dpr);
      }
      ctx.font = `${8.5 * dpr}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7cbf7c';
      ctx.fillText(`${CELLS} cells`, shipX + 16 * dpr, cy + 31 * dpr);
    }

    // The ship: the same cyan marker + ping as the solar chart.
    const ping = (t * 0.55) % 1;
    ctx.strokeStyle = `rgba(124,201,224,${(0.5 * (1 - ping)).toFixed(3)})`;
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.arc(shipX, cy, (5 + ping * 12) * dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#7cc9e0';
    ctx.beginPath();
    ctx.moveTo(shipX + 5 * dpr, cy);
    ctx.lineTo(shipX - 4 * dpr, cy - 4 * dpr);
    ctx.lineTo(shipX - 4 * dpr, cy + 4 * dpr);
    ctx.closePath();
    ctx.fill();

    // Kethra on its orbit: dim until the plot commits, then its real surface in green.
    const kr = 8 * dpr;
    if (this.solved && this.kethraImg.complete && this.kethraImg.naturalWidth > 0) {
      const halo = ctx.createRadialGradient(kethraX, cy, 0, kethraX, cy, kr * 2.6);
      halo.addColorStop(0, 'rgba(124,191,124,0.5)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(kethraX, cy, kr * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(kethraX, cy, kr, 0, Math.PI * 2);
      ctx.clip();
      const crop = this.kethraImg.naturalHeight;
      ctx.drawImage(this.kethraImg, (this.kethraImg.naturalWidth - crop) / 2, 0, crop, crop, kethraX - kr, cy - kr, kr * 2, kr * 2);
      ctx.restore();
      ctx.strokeStyle = '#7cbf7c';
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      ctx.arc(kethraX, cy, kr, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(79,143,106,0.8)';
      ctx.beginPath();
      ctx.arc(kethraX, cy, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = `${9 * dpr}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.solved ? '#7cbf7c' : 'rgba(234,226,208,0.7)';
    ctx.fillText('KETHRA', kethraX, cy - kr - 5 * dpr);
    ctx.fillStyle = '#7cc9e0';
    ctx.fillText('YOUR SHIP', shipX, cy - 14 * dpr);

    // The wrong-answer flash: a brief amber wash over the instrument, matching the shake.
    const sinceWrong = performance.now() - this.lastWrongAt;
    if (sinceWrong < 350) {
      ctx.fillStyle = `rgba(160,85,85,${(0.16 * (1 - sinceWrong / 350)).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }

    const scanY = ((t * 14) % (h / dpr)) * dpr;
    ctx.fillStyle = 'rgba(217,164,65,0.04)';
    ctx.fillRect(0, scanY, w, 2 * dpr);
  }
}
