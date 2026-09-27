import type { Engine } from '../core/Engine';
import type { GameFlow } from '../core/GameFlow';
import { motion } from '../motion';
import { activeMiniGame } from './hooks';

/**
 * The debug harness (docs/DESIGN.md §8), loaded only with `?debug` in the address:
 *   F1  jump to any state (reloads into it through the real boot flags)
 *   F2  win the running mini-game      F3  fail it
 *   F4  time scale ×1 → ×0.25 → ×4     F7  freeze / unfreeze    F8  step one frame while frozen
 * plus an overlay: frame time (p50/p95), draw calls and triangles per frame (all passes),
 * geometries, textures, JS heap, quality tier and the flow state. `?seed=N` (read in boot.ts) fixes
 * every random stream. F5 is left alone: browsers reload on it.
 */
const JUMPS: { label: string; query: string }[] = [
  { label: 'Title', query: '' },
  { label: 'Intro (Cold Start)', query: '?newGame=1' },
  { label: 'Tutorial', query: '?newGame=1&jump=tutorial' },
  { label: 'Galaxy reveal', query: '?newGame=1&skipTutorial=1' },
  { label: 'Course plot (MG1 slot)', query: '?newGame=1&skipIntro=1&jump=plot' },
  { label: 'The Wren, hub', query: '?newGame=1&skipIntro=1&unlockKethra=1' },
  { label: 'Kethra', query: '?newGame=1&skipIntro=1&unlockKethra=1&jump=kethra' },
  { label: 'Vessek Anchorage', query: '?newGame=1&skipIntro=1&unlockVessek=1&jump=vessek' },
  { label: 'Ending', query: '?newGame=1&skipIntro=1&unlockVessek=1&jump=ending' },
];

const SCALES = [1, 0.25, 4];

export function startDebugHarness(engine: Engine, flow: GameFlow): void {
  const panel = document.createElement('div');
  panel.className = 'debug-overlay';
  document.body.appendChild(panel);
  const menu = document.createElement('div');
  menu.className = 'debug-menu';
  menu.hidden = true;
  const seed = new URLSearchParams(location.search).get('seed');
  for (const j of JUMPS) {
    const b = document.createElement('button');
    b.textContent = j.label;
    b.onclick = () => {
      const params = new URLSearchParams(j.query);
      params.set('debug', '1');
      if (seed) params.set('seed', seed);
      location.assign(`${location.pathname}?${params}`);
    };
    menu.appendChild(b);
  }
  document.body.appendChild(menu);

  let scaleIndex = 0;
  window.addEventListener('keydown', (e) => {
    const handled = ['F1', 'F2', 'F3', 'F4', 'F7', 'F8'].includes(e.code);
    if (!handled) return;
    e.preventDefault();
    if (e.code === 'F1') menu.hidden = !menu.hidden;
    if (e.code === 'F2') activeMiniGame()?.win();
    if (e.code === 'F3') activeMiniGame()?.fail();
    if (e.code === 'F4') motion.timeScale = SCALES[(scaleIndex = (scaleIndex + 1) % SCALES.length)];
    if (e.code === 'F7') motion.frozen = !motion.frozen;
    if (e.code === 'F8') motion.step();
  });

  // Counts whole frames: the post chain renders several passes, and three resets its counters on
  // every render() by default (tools/perf-run.mjs counts the same way).
  const info = engine.renderer.info;
  info.autoReset = false;
  const frameMs: number[] = [];
  let calls = 0;
  let tris = 0;
  let last = performance.now();
  let lastDraw = 0;
  const tick = (now: number) => {
    requestAnimationFrame(tick);
    frameMs.push(now - last);
    if (frameMs.length > 120) frameMs.shift();
    last = now;
    calls = info.render.calls;
    tris = info.render.triangles;
    info.reset();
    if (now - lastDraw < 250) return;
    lastDraw = now;
    const sorted = [...frameMs].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]?.toFixed(1) ?? '-';
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const game = activeMiniGame();
    panel.textContent = [
      `frame ${q(0.5)} / ${q(0.95)} ms (p50/p95)`,
      `calls ${calls}  tris ${(tris / 1000).toFixed(0)}k`,
      `geo ${info.memory.geometries}  tex ${info.memory.textures}${mem ? `  heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : ''}`,
      `tier ${engine.getQualityTier()}  flow ${flow.state}${flow.isTransitioning() ? '…' : ''}`,
      `time ×${motion.timeScale}${motion.frozen ? '  FROZEN' : ''}${game ? `  game: ${game.name}` : ''}`,
      'F1 jump · F2 win · F3 fail · F4 speed · F7 freeze · F8 step',
    ].join('\n');
  };
  requestAnimationFrame(tick);
}
