import './style.css';
import { applyCssTokens } from './motion/css';
import { startUiClock } from './motion/core';
import { probeWebGL2 } from './core/glContext';

// Motion tokens reach CSS before anything paints, and the ui clock runs from the first frame.
// (Both modules are free of three.js, so this page stays small where WebGL turns out to be missing.)
applyCssTokens();
startUiClock();

/**
 * Entry point. Checks the one thing the game can't run without before starting any of it: some
 * managed school Chromebooks and locked-down browsers ship with WebGL 2 switched off, and the old
 * result was a silent black page. Where it's missing, say so plainly with fixes a player can try;
 * otherwise start the game (src/boot.ts).
 *
 * The game's code starts downloading first, and the check (which creates the WebGL context the
 * engine will use, 180-300 ms on a first visit) runs while it arrives.
 */
const game = import('./boot');
const probeStart = performance.now();
const hasWebGL2 = probeWebGL2();
try {
  performance.measure('main:webglProbe', { start: probeStart, end: performance.now() });
} catch {
  // diagnostics only
}
if (hasWebGL2) {
  void game.then((m) => m.startGame());
} else {
  game.catch(() => {});
  document.body.innerHTML = `<div class="no-webgl"><div class="panel"><div class="eyebrow">Graphics unavailable</div>
    <h2>This browser can’t draw the game</h2>
    <p>Kethra needs WebGL 2, and this browser has it switched off or unsupported.</p>
    <ul><li>Try another browser: Chrome, Edge, Firefox or Safari (version 15 or newer).</li>
    <li>In Chrome or Edge, check that <b>Use graphics acceleration when available</b> is on in Settings, System.</li>
    <li>On a school device, the graphics setting may be locked; a different computer will work.</li></ul></div></div>`;
}
