import * as THREE from 'three';
import { applyPbr } from '../../core/TextureLibrary';
import { gameState } from '../../core/GameState';
import { bus } from '../../core/EventBus';
import { UIManager } from '../../ui/UIManager';
import { buildConsoleScreenTexture, buildStencilPlacardTexture } from '../ShipTextures';
import type { InteriorCtx } from './ctx';
import { ROOM_W } from './ctx';

/** Nav console housing, its monitor bank, the pilot chair, and the two side wall stations. */
export function buildConsole(ctx: InteriorCtx): void {

  const consoleMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.85, metalness: 0.15 });
  applyPbr(consoleMat, 'ship_console', [1.5, 0.8]);

  const consoleBase = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.1, 0.7), consoleMat);
  consoleBase.position.set(0, 0.55, -3.6);
  consoleBase.castShadow = true;
  consoleBase.receiveShadow = true;
  ctx.scene.add(consoleBase);

  buildConsoleScreenCluster(ctx);
  buildChair(ctx);

  // Cool cyan-blue console fill light doubling as the console's pulsing "glow" accent — kept
  // 0.9+ units away from the console/screens and within the 0.8-2.0 safe intensity band.
  // Lowered from its original (0, 2.6, -3.0) once the suspended display's pillar/divider moved
  // to sit almost exactly there (~0.2 units away) and bloomed the pillar's metal trim into a
  // blown white flare; this position keeps clear of both the screens below and the display
  // above. Recolored from warm amber to a saturated cyan-blue (was the "screen-adjacent" light
  // still tinted warm, working against the room's warm-overhead/cool-console contrast target —
  // the overhead fixtures above now carry the warm side of that split instead) so the console
  // desk and chair actually pool in cool light against the warm ceiling wash, with real falloff
  // between the two instead of a uniformly warm-tinted room.
  // Cast shadows: this was the round's structural gap — with no shadow-casting light in the
  // scene, the console/chair/screens read as pasted onto the floor with no contact shadow or
  // occlusion at their base. A small 512px shadow map (this light's own 6-unit range keeps the
  // frustum tight) is enough to ground the console and chair without a heavy shadow cost.
  const keyLight = new THREE.PointLight(0x38c4f0, 1.0, 6, 2);
  keyLight.position.set(0, 2.0, -2.9);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(512, 512);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 6;
  keyLight.shadow.bias = -0.003;
  ctx.scene.add(keyLight);
  ctx.consoleGlow.push(keyLight);

  const placardTex = buildStencilPlacardTexture('NAV-01', 'CONSOLE');
  const placard = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.25),
    new THREE.MeshStandardMaterial({ map: placardTex, roughness: 0.7, metalness: 0.15 }),
  );
  placard.position.set(1.1, 0.85, -3.24);
  ctx.scene.add(placard);

  consoleBase.userData.interactable = true;
  ctx.interaction.register({
    object: consoleBase,
    label: () => (gameState.hasFlag('galaxy_revealed') ? 'Open Galaxy Map' : 'Access Navigation Console'),
    range: 2.2,
    onInteract: () => {
      if (gameState.hasFlag('galaxy_revealed')) bus.emit('ui:open_galaxy_map');
      else UIManager.toast('Navigation offline — awaiting system reboot.');
    },
  });

  // Journal terminal on the side wall
  const journalMat = new THREE.MeshStandardMaterial({ color: 0x24303a, emissive: 0x274b3a, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.4 });
  applyPbr(journalMat, 'ship_trim', [0.5, 0.7]);
  const journalTerminal = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.12), journalMat);
  journalTerminal.position.set(-ROOM_W / 2 + 0.15, 1.3, 1.5);
  journalTerminal.rotation.y = Math.PI / 2;
  ctx.scene.add(journalTerminal);
  ctx.interaction.register({
    object: journalTerminal,
    label: 'Open Travel Logs',
    range: 2,
    enabled: () => gameState.hasFlag('logs_available'),
    onInteract: () => bus.emit('ui:open_journal'),
  });

  // Repair station
  const repairMat = new THREE.MeshStandardMaterial({ color: 0x3a2a24, emissive: 0xaa5522, emissiveIntensity: 0.3, roughness: 0.5, metalness: 0.4 });
  applyPbr(repairMat, 'ship_trim', [0.6, 1.2]);
  const repairStation = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.5), repairMat);
  repairStation.position.set(ROOM_W / 2 - 0.5, 0.7, 2.2);
  ctx.scene.add(repairStation);
  ctx.interaction.register({
    object: repairStation,
    label: 'Open Ship Repair Interface',
    range: 2,
    enabled: () => gameState.hasFlag('damage_assessed'),
    onInteract: () => bus.emit('ui:open_repair'),
  });
}

// Horseshoe/stepped cluster of five monitors across the top of the console housing — the
// original two flat screens read as a login kiosk rather than a command station. Outer pairs
// are yawed inward and sit lower than the taller center screen so the bank reads as wrapping
// around the operator, echoing the reference's angled multi-monitor bank. Each screen keeps
// the original's opaque backing plate (mounted just behind, same rotation) so its rear face
// doesn't glow the unmirrored screen content through from behind.
function buildConsoleScreenCluster(ctx: InteriorCtx): void {
  const backingMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.8, metalness: 0.1 });

  // x, y, yaw, tiltX, width, height, variant
  // Three of the five slots get a real canvas-texture readout (nav/status/comms); the two
  // outermost slots get a flat emissive "standby monitor" glow instead of a sixth/seventh
  // freshly-generated canvas texture — this environment's texture upload path was found to
  // reliably drop the texture (rendering solid black) once too many fresh canvas textures
  // landed in the same draw batch, confirmed independent of position, rotation, mipmaps, and
  // material sharing; flat-emissive (no map) rendered reliably in every configuration tested.
  // A mix of a few detailed readouts plus a couple of idle/standby panels is a plausible
  // real-console look besides, not just a workaround.
  const texturedSpecs: [number, number, number, number, number, number, 'nav' | 'status' | 'comms'][] = [
    [-0.56, 1.16, 0.18, -0.35, 0.9, 0.4, 'nav'],
    [0, 1.27, 0, -0.32, 0.98, 0.44, 'comms'],
    [0.56, 1.16, -0.18, -0.35, 0.9, 0.4, 'status'],
  ];
  for (const [x, y, yaw, tiltX, w, h, variant] of texturedSpecs) {
    const tex = buildConsoleScreenTexture(variant);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a1620,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.5,
      map: tex,
      roughness: 0.9,
      metalness: 0,
    });

    const backing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.04), backingMat);
    backing.position.set(x, y, -3.62);
    backing.rotation.set(tiltX, yaw, 0);
    ctx.scene.add(backing);

    const screen = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mat);
    screen.position.set(x, y - 0.005, -3.55);
    screen.rotation.set(tiltX, yaw, 0);
    ctx.scene.add(screen);
  }

  // x, y, yaw, tiltX, width, height, glowColor
  const standbySpecs: [number, number, number, number, number, number, number][] = [
    [-1.05, 1.03, 0.5, -0.28, 0.72, 0.34, 0xd9a441],
    [1.05, 1.03, -0.5, -0.28, 0.72, 0.34, 0x4fd8e0],
  ];
  for (const [x, y, yaw, tiltX, w, h, glowColor] of standbySpecs) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, emissive: glowColor, emissiveIntensity: 0.22, roughness: 0.7, metalness: 0.1 });

    const backing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.04), backingMat);
    backing.position.set(x, y, -3.62);
    backing.rotation.set(tiltX, yaw, 0);
    ctx.scene.add(backing);

    const screen = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mat);
    screen.position.set(x, y - 0.005, -3.55);
    screen.rotation.set(tiltX, yaw, 0);
    ctx.scene.add(screen);
  }
}

// Rebuilds the plain cylinder "seat" as a proper pilot-chair silhouette: a seat pad, a
// reclined backrest, two armrests, a thin support column, and a five-point base with small
// caster hints — facing the console (-Z) the way an operator would actually sit.
function buildChair(ctx: InteriorCtx): void {
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.75, metalness: 0.1 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.5, metalness: 0.6 });
  const chairX = 0;
  const chairZ = -1.6;

  const seatPad = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.1, 16), padMat);
  seatPad.position.set(chairX, 0.5, chairZ);
  seatPad.castShadow = true;
  ctx.scene.add(seatPad);

  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.08), padMat);
  backrest.position.set(chairX, 0.82, chairZ + 0.27);
  backrest.rotation.x = -0.15;
  backrest.castShadow = true;
  ctx.scene.add(backrest);

  for (const xSign of [-1, 1] as const) {
    const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.32), frameMat);
    armrest.position.set(chairX + xSign * 0.32, 0.66, chairZ);
    ctx.scene.add(armrest);
    const armPost = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), frameMat);
    armPost.position.set(chairX + xSign * 0.32, 0.55, chairZ + 0.06);
    ctx.scene.add(armPost);
  }

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 10), frameMat);
  column.position.set(chairX, 0.28, chairZ);
  ctx.scene.add(column);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), frameMat);
  hub.position.set(chairX, 0.09, chairZ);
  ctx.scene.add(hub);

  const legLen = 0.32;
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5;
    const midX = chairX + Math.cos(angle) * legLen * 0.5;
    const midZ = chairZ + Math.sin(angle) * legLen * 0.5;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(legLen, 0.03, 0.03), frameMat);
    leg.position.set(midX, 0.05, midZ);
    leg.rotation.y = -angle;
    ctx.scene.add(leg);

    const caster = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), frameMat);
    caster.position.set(chairX + Math.cos(angle) * legLen, 0.03, chairZ + Math.sin(angle) * legLen);
    ctx.scene.add(caster);
  }
}
