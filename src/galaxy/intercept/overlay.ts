/**
 * The Intercept chart layer: SVG shapes and HTML chips drawn in screen space over the 3D scene,
 * from positions the game projects each frame. Each colour has one meaning:
 *
 *   gold   the Wren's course and its handle (the only thing the player moves)
 *   blue   Kethra's path ahead and its day markers
 *   green  correct            red  wrong
 *
 * SVG keeps the strokes wide and crisp on any GPU (WebGL lines are 1 px). The layer takes no
 * pointer input; the game does its own hit testing.
 */

export interface Pt {
  x: number;
  y: number;
}

export type SocketState = 'idle' | 'near' | 'bad' | 'good' | 'passed' | 'target';
export type Tone = 'you' | 'good' | 'bad' | 'kethra' | 'plain';
/** Where a chip sits relative to its point. */
export type Anchor = 'center' | 'right' | 'left';

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, cls: string, parent: Element): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  if (cls) el.setAttribute('class', cls);
  parent.appendChild(el);
  return el;
}

/** Sets an attribute only when it changes: most of the chart is still from frame to frame. */
function attr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

const f = (n: number) => n.toFixed(1);

interface Socket {
  g: SVGGElement;
  ring: SVGCircleElement;
  state: string;
}

export class ChartOverlay {
  readonly root: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly path: SVGPathElement;
  private readonly chevrons: SVGPathElement[] = [];
  private readonly courseGlow: SVGLineElement;
  private readonly course: SVGLineElement;
  private readonly dots: SVGCircleElement[] = [];
  private readonly sockets: Socket[] = [];
  private readonly handle: SVGGElement;
  private readonly chipLayer: HTMLDivElement;
  private chips: HTMLDivElement[] = [];
  private chipsUsed = 0;
  /** Every element a frame may draw, and the ones this frame did: end() shows those and hides the rest. */
  private readonly parts: Element[] = [];
  private readonly drawn = new Set<Element>();

  constructor(socketCount: number, maxDots: number) {
    this.root = document.createElement('div');
    this.root.className = 'chart-overlay';
    this.svg = svg('svg', 'chart-svg', this.root);

    const kethra = svg('g', 'chart-kethra', this.svg);
    this.path = svg('path', 'chart-path', kethra);
    for (let i = 0; i < 3; i++) this.chevrons.push(svg('path', 'chart-chevron', kethra));

    const you = svg('g', 'chart-you', this.svg);
    this.courseGlow = svg('line', 'chart-course-glow', you);
    this.course = svg('line', 'chart-course', you);
    for (let i = 0; i < maxDots; i++) {
      const d = svg('circle', 'chart-day-dot', you);
      d.setAttribute('r', '3.2');
      this.dots.push(d);
    }

    // Markers draw over the course so the connected marker's ring is never hidden by the line.
    const markers = svg('g', 'chart-sockets', this.svg);
    for (let i = 0; i < socketCount; i++) {
      const g = svg('g', 'chart-socket', markers);
      const ring = svg('circle', 'ring', g);
      this.sockets.push({ g, ring, state: '' });
    }

    this.handle = svg('g', 'chart-handle', this.svg);
    const halo = svg('circle', 'halo', this.handle);
    halo.setAttribute('r', '17');
    const knob = svg('circle', 'knob', this.handle);
    knob.setAttribute('r', '15');
    // Four-way move glyph.
    const grip = svg('path', 'grip', this.handle);
    grip.setAttribute('d', 'M0 -9 L3.2 -5.2 H1.1 V-1.1 H5.2 V-3.2 L9 0 L5.2 3.2 V1.1 H1.1 V5.2 H3.2 L0 9 L-3.2 5.2 H-1.1 V1.1 H-5.2 V3.2 L-9 0 L-5.2 -3.2 V-1.1 H-1.1 V-5.2 H-3.2 Z');
    const tick = svg('path', 'tick', this.handle);
    tick.setAttribute('d', 'M-6 0.5 L-1.8 4.6 L6.5 -4.2');

    this.chipLayer = document.createElement('div');
    this.chipLayer.className = 'chart-chips';
    this.root.appendChild(this.chipLayer);
    this.parts.push(this.path, ...this.chevrons, this.courseGlow, this.course, ...this.dots, ...this.sockets.map((k) => k.g), this.handle);
    this.end();
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('shown', on);
  }

  /** Starts a frame: anything not drawn again before end() is hidden. */
  begin(width: number, height: number): void {
    attr(this.svg, 'viewBox', `0 0 ${width} ${height}`);
    attr(this.svg, 'width', String(width));
    attr(this.svg, 'height', String(height));
    this.chipsUsed = 0;
    this.drawn.clear();
  }

  end(): void {
    for (const el of this.parts) attr(el, 'display', this.drawn.has(el) ? 'inline' : 'none');
    for (let i = this.chipsUsed; i < this.chips.length; i++) this.chips[i].style.display = 'none';
  }

  /** Kethra's path ahead, with chevrons along it pointing the way it travels. */
  kethraPath(points: Pt[], chevronAt: number[]): void {
    if (points.length < 2) return;
    let d = `M${f(points[0].x)} ${f(points[0].y)}`;
    for (let i = 1; i < points.length; i++) d += `L${f(points[i].x)} ${f(points[i].y)}`;
    attr(this.path, 'd', d);
    this.drawn.add(this.path);
    chevronAt.forEach((k, i) => {
      const c = this.chevrons[i];
      if (!c) return;
      const at = Math.min(points.length - 2, Math.max(0, Math.round(k * (points.length - 1))));
      const a = points[at];
      const b = points[at + 1];
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      attr(c, 'd', 'M-4 -5 L3 0 L-4 5');
      attr(c, 'transform', `translate(${f((a.x + b.x) / 2)} ${f((a.y + b.y) / 2)}) rotate(${angle.toFixed(0)})`);
      this.drawn.add(c);
    });
  }

  /** One of Kethra's day markers. `big` is the larger ring around Kethra itself (day 0). */
  socket(i: number, p: Pt, state: SocketState, opts: { big?: boolean; hint?: boolean } = {}): void {
    const s = this.sockets[i];
    if (!s) return;
    attr(s.g, 'transform', `translate(${f(p.x)} ${f(p.y)})`);
    this.drawn.add(s.g);
    // When the handle is on this marker, the ring grows to show around the knob rather than under it.
    const plugged = state === 'good' || state === 'bad';
    const r = plugged ? (opts.big ? 24 : 21) : opts.big ? 19 : state === 'near' ? 12 : state === 'target' ? 12 : 8.5;
    attr(s.ring, 'r', String(r));
    const cls = `chart-socket ${state}${opts.big ? ' big' : ''}${opts.hint ? ' hint' : ''}`;
    if (s.state !== cls) {
      s.state = cls;
      s.g.setAttribute('class', cls);
    }
  }

  /** The course line from the ship to the handle, with a dot for each day of flight. */
  courseLine(a: Pt, b: Pt, tone: 'you' | 'good', dots: Pt[]): void {
    for (const el of [this.courseGlow, this.course]) {
      attr(el, 'x1', f(a.x));
      attr(el, 'y1', f(a.y));
      attr(el, 'x2', f(b.x));
      attr(el, 'y2', f(b.y));
      this.drawn.add(el);
    }
    attr(this.course, 'class', `chart-course ${tone}`);
    attr(this.courseGlow, 'class', `chart-course-glow ${tone}`);
    dots.forEach((p, i) => {
      const d = this.dots[i];
      if (!d) return;
      attr(d, 'cx', f(p.x));
      attr(d, 'cy', f(p.y));
      attr(d, 'class', `chart-day-dot ${tone}`);
      this.drawn.add(d);
    });
  }

  /** The handle. `idle` pulses (not moved yet); `good` means it is on the matching marker. */
  handleAt(p: Pt, state: 'idle' | 'drag' | 'set' | 'good'): void {
    attr(this.handle, 'transform', `translate(${f(p.x)} ${f(p.y)})`);
    attr(this.handle, 'class', `chart-handle ${state}`);
    this.drawn.add(this.handle);
  }

  /** A text chip pinned to a screen point. */
  chip(p: Pt, text: string, tone: Tone, anchor: Anchor = 'center', extra = ''): HTMLDivElement {
    const el = this.chips[this.chipsUsed] ?? this.makeChip();
    this.chipsUsed++;
    if (el.textContent !== text) el.textContent = text;
    const cls = `chart-chip ${tone} ${anchor}${extra ? ` ${extra}` : ''}`;
    if (el.dataset.cls !== cls) {
      el.className = cls;
      el.dataset.cls = cls;
    }
    el.style.transform = `translate(${f(p.x)}px, ${f(p.y)}px)`;
    el.style.display = '';
    return el;
  }

  private makeChip(): HTMLDivElement {
    const el = document.createElement('div');
    this.chipLayer.appendChild(el);
    this.chips.push(el);
    return el;
  }

  dispose(): void {
    this.root.remove();
  }
}
