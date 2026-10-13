import * as THREE from 'three';
import type { InteriorCtx } from './ctx';
import { addInteractionProxy } from './ctx';
import { gameState } from '../../core/GameState';
import { SaveSystem } from '../../core/SaveSystem';
import { memoTexture } from '../../core/memoTexture';
import { UIManager } from '../../ui/UIManager';
import { AudioSystem } from '../../audio/AudioSystem';
import { Survey } from '../../journal/Survey';
import { JournalSystem } from '../../journal/JournalSystem';
import { RESTORED_SIGNAL_LOG } from '../../content/discoveries';

/**
 * What the Wren's crew left lying around (src/content/discoveries.ts, level 'wren'): Carrow's note
 * at the workbench, the key it sends you to under the sub-deck hatch, her locker, Mbeki's letter in
 * the suit lockers, and the tag on the dead COMMS relay. All of it hangs on furniture props.ts and
 * floor.ts already place; the positions below are read off those builders.
 *
 * Nothing here is offered until the course is plotted (`galaxy_revealed`), so the opening's five
 * steps keep the room to themselves.
 */

const PAPER = '#d8d0b8';
const TAPE = '#e0a030';
const PENCIL = 'rgba(40, 44, 52, 0.78)';

/** A sheet of note paper held down by a strip of Carrow's amber tape, with pencilled lines. */
function paintNote(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const c = canvas.getContext('2d')!;
  c.fillStyle = PAPER;
  c.fillRect(0, 0, 256, 192);
  c.fillStyle = 'rgba(90, 80, 60, 0.12)';
  c.fillRect(0, 150, 256, 42);
  c.strokeStyle = PENCIL;
  c.lineWidth = 3;
  c.lineCap = 'round';
  [[30, 62, 214], [30, 86, 188], [30, 110, 222], [30, 134, 150], [30, 162, 96]].forEach(([x0, y, x1]) => {
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x1, y + 2);
    c.stroke();
  });
  c.fillStyle = TAPE;
  c.fillRect(70, 0, 116, 30);
  c.fillStyle = 'rgba(255, 255, 255, 0.18)';
  c.fillRect(70, 0, 116, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A strip of the same tape with a name pencilled on it. */
function paintTag(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const c = canvas.getContext('2d')!;
  c.fillStyle = TAPE;
  c.fillRect(0, 0, 256, 64);
  c.fillStyle = 'rgba(255, 255, 255, 0.16)';
  c.fillRect(0, 0, 256, 14);
  c.fillStyle = 'rgba(30, 26, 18, 0.9)';
  c.font = '700 34px Rajdhani, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, 128, 36);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const offered = () => gameState.hasFlag('galaxy_revealed');

export function buildWrenFinds(ctx: InteriorCtx): void {
  const noteMat = new THREE.MeshStandardMaterial({ map: memoTexture('finds:note', paintNote), roughness: 0.92, metalness: 0 });
  const tagMat = (text: string) => new THREE.MeshStandardMaterial({ map: memoTexture(`finds:tag:${text}`, () => paintTag(text)), roughness: 0.7, metalness: 0 });

  /** A flat sheet or strip at a spot, in a group of its own so it can be aimed at. `vTop` below 1
   * leaves the top of the texture off the sheet (the note's tape). */
  const sheet = (mat: THREE.Material, w: number, h: number, x: number, y: number, z: number, rx: number, ry: number, rz = 0, vTop = 1): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.set(rx, ry, rz, 'YXZ');
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * vTop);
    g.add(new THREE.Mesh(geo, mat));
    ctx.scene.add(g);
    addInteractionProxy(ctx, g, 0.12);
    return g;
  };

  // Carrow's note: flat on the workbench's top (0.9475), beside the task lamp's pool rather than in
  // it, where the paper washed out to white.
  ctx.interaction.register({
    object: sheet(noteMat, 0.21, 0.158, -4.95, 0.952, -2.12, -Math.PI / 2, 0, 0.35),
    label: 'Read the note taped to the bench',
    range: 2.2,
    enabled: offered,
    onInteract: () => Survey.collect('wren_bench_note'),
  });

  // The key the note sends you to: under the port lip of the deck hatch (floor.ts, the deck hatch).
  const hatch = sheet(tagMat(''), 0.09, 0.03, -3.5, 0.024, -1.62, -Math.PI / 2, 0, 0.1);
  ctx.interaction.register({
    object: hatch,
    label: 'Feel under the hatch’s lip',
    range: 2.4,
    enabled: () => offered() && !gameState.hasFlag('wren_carrow_key'),
    onInteract: () => {
      gameState.setFlag('wren_carrow_key');
      SaveSystem.save();
      AudioSystem.playCollect();
      UIManager.toast('A small key, taped under the lip of the hatch. No tag on it.', 'act');
    },
  });

  // Locker A-1, the first door of the bank on the starboard wall: its face is at x = 5.0.
  ctx.interaction.register({
    object: sheet(tagMat('I. CARROW'), 0.22, 0.055, 4.994, 1.56, -1.88, 0, -Math.PI / 2),
    label: () => (gameState.hasFlag('wren_found_locker') ? 'Look in Carrow’s locker' : gameState.hasFlag('wren_carrow_key') ? 'Unlock Carrow’s locker' : 'A locked locker: I. Carrow'),
    range: 2.2,
    enabled: offered,
    onInteract: () => {
      if (!gameState.hasFlag('wren_carrow_key')) {
        AudioSystem.playCancel();
        UIManager.toast('Locked. A strip of amber tape on the door says I. CARROW.');
        return;
      }
      JournalSystem.restoreLog('log_signal', RESTORED_SIGNAL_LOG);
      Survey.collect('wren_locker');
    },
  });

  // Mbeki's letter: plain paper (the tape is Carrow's mark) tucked behind the vent slats of suit
  // locker EVA-1, by the airlock.
  ctx.interaction.register({
    object: sheet(noteMat, 0.1, 0.066, -2.77, 1.34, 6.955, 0, Math.PI, 0.5, 0.82),
    label: 'Read the letter in the suit locker',
    range: 2.2,
    enabled: offered,
    onInteract: () => Survey.collect('wren_letter'),
  });

  // The relay rack's COMMS unit is the third from the bottom, centred at y = 1.0; the tag hangs
  // under it. Engineering 2 is what MG1 has just earned.
  ctx.interaction.register({
    object: sheet(tagMat('I.C.'), 0.15, 0.04, 4.872, 0.845, -5.05, 0, -Math.PI / 2),
    label: () => (gameState.data.attributes.engineering >= 2 ? 'Trace the dead relay (engineering)' : 'A relay rack (engineering 2)'),
    range: 2.2,
    enabled: offered,
    onInteract: () => {
      if (gameState.data.attributes.engineering < 2) {
        UIManager.skillCheckPopup('Five relays, one dark. You can’t tell what it feeds.', false);
        return;
      }
      Survey.collect('wren_relay');
    },
  });
}
