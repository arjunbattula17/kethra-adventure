import { TIMELINE, range, smooth } from '../galaxy/title/singularity/timeline';
import type { Cue, SingularityFrame } from '../galaxy/title/singularity/timeline';
import { t as str } from '../content/strings';

/**
 * The menu being eaten by the black hole (galaxy/title/singularity/singularity.ts). It is DOM over the
 * 3D view, so the lens can't bend it; it is moved instead, on the event's clock and around the hole's
 * place on screen, which the scene reports every frame.
 *
 * The menu comes apart into pieces: each corner readout, the kicker, the tagline, each button, the two
 * halves of the orbit, and the wordmark letter by letter (split into one SVG per letter over the
 * original). The shockwave jolts each piece as it passes it. Then, nearest the hole first, each one
 * trembles in place, tears loose and falls in on a tightening spiral: it speeds up as it nears (as
 * angular momentum would have it), is stretched along the line to the hole and squeezed across it,
 * shrinks, and is gone at the shadow's edge. The button that was pressed goes last.
 *
 * Only transforms and opacity change from frame to frame, each piece on its own layer. The wordmark is
 * split when the title is built (prepareDevour), while it is still invisible; the pieces get their own
 * layers at the click, in the beat of silence before the hole opens, where the one repaint that costs
 * goes unseen. Given their layers for the whole time the title is up, they cost the idle title frames:
 * 84-98 of 300 over 20 ms on an Intel UHD laptop, against 0-14 without.
 *
 * Under reduced motion nothing flies: the pieces fade out in the same order.
 */
export interface Devour {
  frame(f: SingularityFrame): void;
  cue(c: Cue): void;
  /** Called as each piece tears loose: its screen position as -1..1 and its size 0..1. */
  onTear: ((pan: number, size: number) => void) | null;
}

interface Piece {
  el: HTMLElement | SVGElement;
  cx: number;
  cy: number;
  size: number;
  /** When it starts to tremble, tears loose, and how long its fall takes. */
  shake: number;
  tear: number;
  fall: number;
  spin: number;
  seed: number;
  /** Its place relative to the hole when it tore loose. */
  r0: number;
  a0: number;
  torn: boolean;
  gone: boolean;
}

/** The wordmark's subpaths grouped by letter: K (three), E, T, H, R (two: its counter), A. */
const LETTER_PARTS = [3, 1, 1, 1, 2, 1];

/** What comes apart, in the title's markup; the letters are made by prepareDevour. */
const PIECES = '.ts-hud-track, .ts-hud-place, .ts-hud-end, .ts-kicker, .ts-orbit-back, .ts-orbit-front, .ts-tagline, .title-btn, .ts-letter';

/** Replaces the wordmark with one SVG per letter, each over the same grid, so the letters can part. */
function splitWordmark(title: HTMLElement): void {
  const original = title.querySelector<SVGSVGElement>('.ts-wordmark');
  const path = original?.querySelector('.ts-glyphs');
  const gradient = original?.querySelector('linearGradient');
  if (!original || !path || !gradient) return;
  const subpaths = (path.getAttribute('d') ?? '').split(/(?=M)/).map((s) => s.trim()).filter(Boolean);
  const letters: SVGSVGElement[] = [];
  let at = 0;
  const NS = 'http://www.w3.org/2000/svg';
  LETTER_PARTS.forEach((parts, i) => {
    const d = subpaths.slice(at, at + parts).join(' ');
    at += parts;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ts-wordmark ts-letter');
    svg.setAttribute('viewBox', '0 0 776 100');
    svg.setAttribute('aria-hidden', 'true');
    const grad = gradient.cloneNode(true) as SVGLinearGradientElement;
    grad.id = `ts-metal-${i}`;
    const defs = document.createElementNS(NS, 'defs');
    defs.appendChild(grad);
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', `url(#ts-metal-${i})`);
    svg.append(defs, p);
    title.appendChild(svg);
    letters.push(svg);
  });
  original.remove();
  // Each letter turns about its own middle: the middle of its glyph's box, in the shared grid.
  for (const svg of letters) {
    const box = (svg.querySelector('path') as SVGPathElement).getBBox();
    svg.style.transformOrigin = `${((box.x + box.width / 2) / 776) * 100}% 50%`;
  }
}

/**
 * Readies the menu to be eaten, looking exactly the same: the wordmark split into letters. Called once
 * the title is in the page, before it is revealed.
 */
export function prepareDevour(root: HTMLElement): void {
  const title = root.querySelector<HTMLElement>('.ts-title');
  if (title) splitWordmark(title);
}

/** The spiral turns this way on screen (+1 counter-clockwise as seen), matching the disk's swirl. */
const SPIN = -1;

export function createDevour(root: HTMLElement, pressed: HTMLElement | null, gentle: boolean): Devour {
  const T = TIMELINE;
  const els = [...root.querySelectorAll<HTMLElement | SVGElement>(PIECES)];
  const scrim = root.querySelector<HTMLElement>('.ts-scrim');
  const diag = Math.hypot(window.innerWidth, window.innerHeight);
  const pieces: Piece[] = [];
  let seed = 0.37;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    el.style.willChange = 'transform, opacity';
    // Moved every frame from here on: nothing of its own may smooth or override that.
    el.style.transition = 'none';
    el.style.animation = 'none';
    pieces.push({
      el,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      size: Math.min(1, Math.sqrt(r.width * r.height) / 260),
      shake: 0,
      tear: 0,
      fall: 0,
      spin: 0.8 + rand() * 0.6,
      seed: rand() * 100,
      r0: 0,
      a0: 0,
      torn: false,
      gone: false,
    });
  }
  let scheduled = false;
  const tremble = (p: Piece, t: number, k: number) => {
    const a = 3.5 * k * k;
    return [Math.sin(t * 53 + p.seed) * a, Math.sin(t * 61 + p.seed * 1.7) * a];
  };

  const devour: Devour = {
    onTear: null,

    cue(cue) {
      if (cue === 'warn') {
        // The readouts lose the signal.
        root.classList.add('ts-alarm');
        const set = (sel: string, text: string) => {
          const el = root.querySelector(sel);
          if (el) el.textContent = text;
        };
        set('.ts-hud-place-text b', str('title.void.place'));
        set('.ts-hud-place-text span', str('title.void.placeSub'));
        set('.ts-hud-end-text', str('title.void.end'));
        set('.ts-hud-signal', str('title.void.signal'));
      }
    },

    frame(f) {
      const t = f.t;
      // The order is fixed at the first frame the hole has a place: nearest first, the pressed button last.
      if (!scheduled) {
        scheduled = true;
        const order = pieces
          .map((p) => ({ p, d: Math.hypot(p.cx - f.x, p.cy - f.y) + (p.el === pressed ? diag : 0) }))
          .sort((a, b) => a.d - b.d);
        order.forEach(({ p }, i) => {
          const k = order.length > 1 ? i / (order.length - 1) : 0;
          p.shake = T.birth + 0.25 + k * 2.6 + rand() * 0.2;
          p.tear = p.shake + 0.35 + rand() * 0.25;
          p.fall = 0.75 + 0.35 * k + rand() * 0.15;
        });
      }
      if (scrim) scrim.style.opacity = String(1 - f.pull);
      for (const p of pieces) {
        if (p.gone) continue;
        if (gentle) {
          // Reduced motion: each piece fades where it is, in the same order.
          const k = range(t, p.shake, p.tear + p.fall * 0.5);
          p.el.style.opacity = String(1 - k);
          if (k >= 1) p.gone = true;
          continue;
        }
        let dx = 0;
        let dy = 0;
        // The shockwave: pushed out as the front arrives, drawn back as it passes.
        const rx = p.cx - f.x;
        const ry = p.cy - f.y;
        const dist = Math.hypot(rx, ry) || 1;
        if (f.shockAmp > 0) {
          const s = (dist - f.shockRadius) / (0.07 * window.innerHeight);
          const push = -f.shockAmp * 1.4 * s * Math.exp(-s * s);
          dx += (rx / dist) * push;
          dy += (ry / dist) * push;
        }
        dx += f.shakeX * 0.5;
        dy += f.shakeY * 0.5;
        if (t < p.tear) {
          const k = range(t, p.shake, p.tear);
          if (k > 0) {
            const [tx, ty] = tremble(p, t, k);
            // Leaning toward the hole as it trembles.
            dx += tx - (rx / dist) * 10 * k * k;
            dy += ty - (ry / dist) * 10 * k * k;
          }
          p.el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
          continue;
        }
        if (!p.torn) {
          p.torn = true;
          p.r0 = dist;
          p.a0 = Math.atan2(ry, rx);
          devour.onTear?.(Math.max(-1, Math.min(1, (p.cx / window.innerWidth) * 2 - 1)), p.size);
        }
        // The fall: accelerating, on a tightening spiral, stretched toward the hole.
        const tau = Math.min((t - p.tear) / p.fall, 1);
        const u = Math.pow(tau, 2.1);
        const r = p.r0 * (1 - u);
        const angle = p.a0 + SPIN * p.spin * (1.1 * u + 3.6 * u * u * u);
        const x = f.x + Math.cos(angle) * r;
        const y = f.y + Math.sin(angle) * r;
        const stretch = 1 + 3.4 * Math.pow(u, 1.6);
        const squeeze = 1 / (1 + 1.6 * u);
        const scale = Math.pow(1 - u, 0.55);
        const turn = (angle - p.a0) * 0.7;
        // M = R(angle) S(stretch, squeeze) R(-angle) R(turn) * scale
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const a11 = c * c * stretch + s * s * squeeze;
        const a12 = c * s * (stretch - squeeze);
        const a22 = s * s * stretch + c * c * squeeze;
        const ct = Math.cos(turn) * scale;
        const st = Math.sin(turn) * scale;
        const m11 = a11 * ct + a12 * st;
        const m12 = -a11 * st + a12 * ct;
        const m21 = a12 * ct + a22 * st;
        const m22 = -a12 * st + a22 * ct;
        const ex = x - p.cx + dx;
        const ey = y - p.cy + dy;
        p.el.style.transform = `matrix(${m11.toFixed(4)}, ${m21.toFixed(4)}, ${m12.toFixed(4)}, ${m22.toFixed(4)}, ${ex.toFixed(2)}, ${ey.toFixed(2)})`;
        const inside = r < f.horizon * 0.9 || tau >= 1;
        p.el.style.opacity = inside ? '0' : String(1 - smooth((u - 0.7) / 0.3));
        if (inside) p.gone = true;
      }
      // Whatever is left at the horizon goes with the light.
      if (f.eat > 0) root.style.opacity = String(1 - f.eat);
    },
  };
  return devour;
}
