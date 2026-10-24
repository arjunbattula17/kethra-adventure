import type { Engine } from '../core/Engine';

/**
 * A performance readout anyone can open on the machine in front of them (a school laptop, a
 * Chromebook): the backquote key (`) toggles it, `?fps` opens it at load. Frames are timed between
 * draws (under the steady-30 cap the loop skips every other animation frame), so the numbers are what
 * the screen shows. Loaded on first use, and closed it stops all its work: the engine's per-frame
 * cost is one null check (Engine.drawObserver).
 */
export class PerfOverlay {
  private readonly panel = document.createElement('div');
  private readonly frames: number[] = [];
  private lastDraw = 0;
  private lastText = 0;
  private calls = 0;
  private tris = 0;
  private drawsThisSecond = 0;
  private secondStart = 0;
  private drawsPerSecond = 0;
  private readonly gpu: string;
  open = false;
  private readonly engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
    const p = this.panel;
    p.setAttribute('aria-hidden', 'true');
    Object.assign(p.style, {
      position: 'fixed', top: '8px', right: '8px', zIndex: '99999', pointerEvents: 'none', whiteSpace: 'pre',
      font: '11px/1.35 ui-monospace, Consolas, monospace', color: '#d8f3ff', background: 'rgba(4, 10, 18, 0.78)',
      padding: '6px 8px', borderRadius: '4px', display: 'none',
    });
    document.body.appendChild(p);
    let gpu = '';
    try {
      const gl = engine.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch {
      gpu = 'unknown';
    }
    this.gpu = gpu.replace(/^ANGLE \((.*)\)$/, '$1').replace(/ Direct3D.*$/, '').slice(0, 60);
  }

  toggle(): void {
    this.open = !this.open;
    const info = this.engine.renderer.info;
    this.panel.style.display = this.open ? 'block' : 'none';
    if (this.open) {
      // Whole frames: the post chain renders several passes, and three.js resets its counters on
      // every render() by default.
      info.autoReset = false;
      info.reset();
      this.frames.length = 0;
      this.lastDraw = 0;
      this.secondStart = performance.now();
      this.drawsThisSecond = 0;
      this.engine.drawObserver = () => this.onDraw();
    } else {
      this.engine.drawObserver = null;
      info.autoReset = true;
    }
  }

  private onDraw(): void {
    const now = performance.now();
    const info = this.engine.renderer.info;
    this.calls = info.render.calls;
    this.tris = info.render.triangles;
    info.reset();
    if (this.lastDraw) {
      this.frames.push(now - this.lastDraw);
      if (this.frames.length > 120) this.frames.shift();
    }
    this.lastDraw = now;
    this.drawsThisSecond++;
    if (now - this.secondStart >= 1000) {
      this.drawsPerSecond = (this.drawsThisSecond * 1000) / (now - this.secondStart);
      this.drawsThisSecond = 0;
      this.secondStart = now;
    }
    if (now - this.lastText >= 250) {
      this.lastText = now;
      this.render();
    }
  }

  private render(): void {
    const sorted = [...this.frames].sort((a, b) => a - b);
    const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1) : '-');
    const slow = this.frames.filter((ms) => ms > 50).length;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const info = this.engine.renderer.info;
    const pacing = this.engine.getPacingState();
    const tierName = { low: 'Performance', medium: 'Balanced', high: 'Quality' }[pacing.tier];
    this.panel.textContent = [
      `${this.drawsPerSecond.toFixed(0).padStart(3)} fps   frame p50 ${q(0.5)}  p95 ${q(0.95)}  max ${q(1)} ms`,
      `>50 ms: ${slow} of the last ${this.frames.length} frames`,
      `draw calls ${this.calls}   triangles ${(this.tris / 1000).toFixed(0)}k`,
      `textures ${info.memory.textures}   geometries ${info.memory.geometries}   programs ${info.programs?.length ?? '-'}`,
      `JS heap ${mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : 'n/a (Chrome only)'}`,
      `${tierName}${pacing.auto ? ' (Auto)' : ''}   render scale ${Math.round(pacing.renderScale * 100)}%${pacing.capped ? '   capped at 30' : ''}`,
      `start-up benchmark ${pacing.benchmarkMs ?? '-'} ms   ${this.gpu}`,
      'press ` to close',
    ].join('\n');
  }
}

let overlay: PerfOverlay | null = null;

export function togglePerfOverlay(engine: Engine): void {
  overlay ??= new PerfOverlay(engine);
  overlay.toggle();
}
