import './style.css';

/**
 * Entry point. Checks the one thing the game can't run without before loading any of it: some
 * managed school Chromebooks and locked-down browsers ship with WebGL 2 switched off, and the old
 * result was a silent black page. Where it's missing, say so plainly with fixes a player can try;
 * otherwise load the game (src/boot.ts).
 */
function webgl2Available(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

if (webgl2Available()) {
  void import('./boot');
} else {
  document.body.innerHTML = `<div class="no-webgl"><div class="panel"><div class="eyebrow">Graphics unavailable</div>
    <h2>This browser can’t draw the game</h2>
    <p>Kethra needs WebGL 2, and this browser has it switched off or unsupported.</p>
    <ul><li>Try another browser: Chrome, Edge, Firefox or Safari (version 15 or newer).</li>
    <li>In Chrome or Edge, check that <b>Use graphics acceleration when available</b> is on in Settings, System.</li>
    <li>On a school device, the graphics setting may be locked; a different computer will work.</li></ul></div></div>`;
}
