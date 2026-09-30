// The page-side probe shared by tools/startup-profile.mjs and tools/journey-profile.mjs, and the
// statistics they report. Injected before the game's own scripts (page.addInitScript(pageProbe, [nonce])).

/**
 * Records, in window.__prof: every requestAnimationFrame interval (with whether a full-screen cover
 * hid the 3D view), long tasks, milestones from the page (title, clicks, flow state, current scene,
 * the intro's clock, the loading screen, quality tier), heap samples, every program linked and the
 * time spent blocked waiting on compiles, and spans for the engine's preparation steps. With a
 * nonzero nonce, appends a harmless per-run term to every shader so the GPU driver's own cache misses.
 */
export function pageProbe([nonce]) {
  const prof = (window.__prof = { long: [], frames: [], events: [], heap: [], spans: [] });
  const ev = (name) => prof.events.push([name, performance.now()]);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) prof.long.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  const coveredNow = () => !!document.querySelector('.loading-indicator.visible, .scan-wipe.covered');
  let last = performance.now();
  const tick = (now) => {
    prof.frames.push([now, now - last, coveredNow() ? 1 : 0]);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  let titleSeen = false;
  new MutationObserver(() => {
    if (!titleSeen && document.querySelector('.title-btn')) {
      titleSeen = true;
      ev('title:shown');
    }
  }).observe(document, { subtree: true, childList: true });
  addEventListener('click', (e) => {
    const b = e.target?.closest?.('.title-btn');
    if (b) ev(`click:${b.textContent.trim().toLowerCase()}`);
  }, true);
  addEventListener('webglcontextlost', () => ev('webgl:contextlost'), true);
  const kind = (s) => {
    if (!s) return 'none';
    if (typeof s.kind === 'string') return s.kind.replace(/Scene$/, '').toLowerCase();
    if ('settleStartedAt' in s) return 'intro';
    if (typeof s.adaptToTier === 'function') return 'shipinterior';
    return 'other';
  };
  let lastState = null;
  let lastScene;
  let introClock = false;
  let loading = null;
  let playable = false;
  let lastHeap = 0;
  setInterval(() => {
    const now = performance.now();
    if (performance.memory && now - lastHeap > 1000) {
      lastHeap = now;
      prof.heap.push([now, +(performance.memory.usedJSHeapSize / 1048576).toFixed(1)]);
    }
    const le = document.querySelector('.loading-indicator');
    const vis = !!le && le.classList.contains('visible');
    if (vis !== loading) {
      loading = vis;
      ev(vis ? 'loading:show' : 'loading:hide');
    }
    const d = window.__DEBUG__;
    if (!d) return;
    if (!prof.wrapped) {
      prof.wrapped = true;
      const span = (obj, name, label) => {
        const orig = obj[name];
        if (typeof orig !== 'function') return;
        obj[name] = function (...a) {
          const t = performance.now();
          const r = orig.apply(this, a);
          if (r && typeof r.then === 'function') return r.finally(() => prof.spans.push([label, t, performance.now() - t]));
          prof.spans.push([label, t, performance.now() - t]);
          return r;
        };
      };
      const e = d.engine;
      for (const m of ['prepareScene', 'setScene', 'prewarmScene', 'benchmarkScene', 'warmScene', 'fitRenderScale']) span(e, m, `engine.${m}`);
      span(e.renderer, 'compileAsync', 'renderer.compileAsync');
    }
    const tier = `${d.engine.getQualityTier()}${d.engine.renderer.shadowMap.enabled ? '+shadows' : ''}`;
    if (tier !== prof.lastTier) {
      prof.lastTier = tier;
      ev(`tier:${tier}`);
    }
    const st = d.flow.state + (d.flow.isTransitioning() ? '*' : '');
    if (st !== lastState) {
      lastState = st;
      ev(`state:${st}`);
    }
    const cur = d.engine.getCurrentScene();
    if (cur !== lastScene) {
      lastScene = cur;
      ev(`scene:${kind(cur)}`);
    }
    if (!introClock && cur && 'settleStartedAt' in cur && cur.started) {
      introClock = true;
      ev('intro:clock');
    }
    if (!playable && d.flow.state === 'wren' && !d.flow.isTransitioning() && kind(cur) === 'shipinterior' && !vis) {
      playable = true;
      ev('ship:playable');
    }
  }, 20);

  const gl = (prof.gl = { links: [], waits: [] });
  const wrap = (proto, name, record) => {
    const orig = proto[name];
    proto[name] = function (...a) {
      const t = performance.now();
      const r = orig.apply(this, a);
      record(t, performance.now() - t, a);
      return r;
    };
  };
  wrap(WebGL2RenderingContext.prototype, 'linkProgram', (t) => gl.links.push(Math.round(t)));
  for (const name of ['getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog']) {
    wrap(WebGL2RenderingContext.prototype, name, (t, d) => {
      if (d > 5) gl.waits.push([Math.round(t), Math.round(d)]);
    });
  }

  if (!nonce) return;
  const patch = (proto) => {
    const orig = proto.shaderSource;
    proto.shaderSource = function (shader, src) {
      const m = /void\s+main\s*\(\s*(?:void)?\s*\)\s*\{/.exec(src);
      if (!m) return orig.call(this, shader, src);
      const k = `${1000000 + nonce}.5`;
      let tail = null;
      if (/gl_Position\s*=/.test(src)) {
        tail = `void main() { kethra_nonce_main(); gl_Position.x += step(${k}, gl_Position.y) * 1e-20; }`;
      } else {
        const out = /#version\s+300\s+es/.test(src) ? /\bout\s+(?:highp\s+|mediump\s+|lowp\s+)?vec4\s+(\w+)\s*;/.exec(src)?.[1] : 'gl_FragColor';
        if (out) tail = `void main() { kethra_nonce_main(); ${out}.a += step(${k}, gl_FragCoord.x) * 1e-20; }`;
      }
      if (!tail) return orig.call(this, shader, src);
      return orig.call(this, shader, `${src.slice(0, m.index)}void kethra_nonce_main() {${src.slice(m.index + m[0].length)}\n${tail}\n`);
    };
  };
  patch(WebGL2RenderingContext.prototype);
  patch(WebGLRenderingContext.prototype);
}

/** Frame-interval statistics: rate, percentiles, worst, and counts over 50/100/250/1000 ms. */
export function stats(frames) {
  if (!frames.length) return null;
  const d = frames.map((f) => f[1]).sort((a, b) => a - b);
  const q = (p) => +d[Math.min(d.length - 1, Math.floor(d.length * p))].toFixed(1);
  const total = frames.reduce((s, f) => s + f[1], 0);
  return {
    frames: d.length,
    fps: +((1000 * d.length) / total).toFixed(1),
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: +d[d.length - 1].toFixed(1),
    over50: d.filter((x) => x > 50).length,
    over100: d.filter((x) => x > 100).length,
    over250: d.filter((x) => x > 250).length,
    over1000: d.filter((x) => x > 1000).length,
  };
}

export const longStats = (list) => ({
  count: list.length,
  totalMs: Math.round(list.reduce((s, x) => s + x[1], 0)),
  max: Math.round(list.reduce((m, x) => Math.max(m, x[1]), 0)),
  top: list.map((x) => Math.round(x[1])).sort((a, b) => b - a).slice(0, 8),
});

/** Chrome flags every tool here launches with: this machine's GPU through ANGLE's D3D11, no throttling. */
export const CHROME_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--enable-precise-memory-info'];
