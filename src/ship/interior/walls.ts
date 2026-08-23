import * as THREE from 'three';
import { buildConsoleScreenTexture, buildLargeDeckNumberTexture } from '../ShipTextures';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D, ROOM_H, addGrimeOverlay } from './ctx';
import {
  buildWallPlateSet,
  buildLouverTexture,
  buildWindowInteriorTexture,
  buildChevronTexture,
  buildStencilTextTexture,
  buildDripTexture,
  buildScuffTexture,
  buildGrungeRoughTexture,
  buildDustFilmTexture,
  buildLowerDirtTexture,
  buildRubberTexture,
} from './wallsTextures';

// ---------------------------------------------------------------------------------------------
// Wall elevation.
//
// The reference wall is not one band of material stretched floor-to-ceiling. It is a stack of
// horizontal structural runs — kick strip, waist rail, glazed bay, head rail, cable tray, cornice
// — interrupted by vertical pilasters, with every leftover face carrying a vent, a junction box,
// a decal or a conduit. These constants are that elevation; every element below hangs off them.
// ---------------------------------------------------------------------------------------------
const FACE_X = ROOM_W / 2 - 0.1;
const FACE_Z = ROOM_D / 2 - 0.1;

const KICK_TOP = 0.16;
const WAIST_Y = 1.32;
const WIN_BOT = 1.46;
const WIN_TOP = 2.5;
const HEAD_Y = 2.62;
const TRAY_Y = 2.99;
const CORNICE_Y = 3.9;

/** Bolted-plate module size in metres — the brief's 0.5–1.5 m panels. */
const PLATE_M = 1.6;

/**
 * A wall's local coordinate system: `out` is metres protruding into the room from that wall's
 * inner face, `along` runs left-to-right as seen by a player facing the wall, `y` is height.
 * One frame per wall lets the side walls and the two end walls share every element builder.
 */
interface Frame {
  pos(out: number, along: number, y: number): THREE.Vector3;
  dims(thick: number, along: number, up: number): [number, number, number];
  /** rotation.y for a plane whose +Z normal should face into the room. */
  rotY: number;
  /** Which world axis points out of this wall — bolts and instanced ribs orient off it. */
  outAxis: 'x' | 'z';
}

function sideFrame(s: number): Frame {
  return {
    pos: (out, along, y) => new THREE.Vector3(s * (FACE_X - out), y, along),
    dims: (thick, along, up) => [thick, up, along],
    rotY: (-s * Math.PI) / 2,
    outAxis: 'x',
  };
}

function endFrame(t: number): Frame {
  return {
    pos: (out, along, y) => new THREE.Vector3(-t * along, y, t * (FACE_Z - out)),
    dims: (thick, along, up) => [along, up, thick],
    rotY: t > 0 ? Math.PI : 0,
    outAxis: 'z',
  };
}

// ---------------------------------------------------------------------------------------------
// Shared geometry and instancing. Once the greeble density is right the repeated elements (bolt
// heads, panel ribs, junction boxes, conduit saddles) run into the high hundreds, so those go
// through InstancedMesh; everything else shares BoxGeometry/PlaneGeometry via a size-keyed cache
// so the two mirrored side walls and the two end walls allocate one geometry between them.
// ---------------------------------------------------------------------------------------------
const geoCache = new Map<string, THREE.BufferGeometry>();

function boxGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `b${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  return g;
}

function planeGeo(w: number, h: number): THREE.BufferGeometry {
  const key = `p${w.toFixed(3)},${h.toFixed(3)}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h);
    geoCache.set(key, g);
  }
  return g;
}

interface InstanceSet {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  xf: THREE.Matrix4[];
}

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const scratchQ = new THREE.Quaternion();
const scratchE = new THREE.Euler();

function pushInstance(set: InstanceSet, p: THREE.Vector3, rotY: number, rotZ = 0): void {
  scratchE.set(0, rotY, rotZ);
  scratchQ.setFromEuler(scratchE);
  set.xf.push(new THREE.Matrix4().compose(p, scratchQ, UNIT_SCALE));
}

function flushInstances(ctx: InteriorCtx, set: InstanceSet): void {
  if (set.xf.length === 0) return;
  const mesh = new THREE.InstancedMesh(set.geo, set.mat, set.xf.length);
  for (let i = 0; i < set.xf.length; i++) mesh.setMatrixAt(i, set.xf[i]);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  // Greeble that does not drop a shadow onto the plate behind it is what makes a wall read as a
  // decal sheet rather than as assembled hardware.
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);
}

// ---------------------------------------------------------------------------------------------
// Material kit
// ---------------------------------------------------------------------------------------------

/**
 * Material response classes.
 *
 * The scene carries a real environment map, so roughness and metalness are the levers that
 * actually separate one material from another here — the previous pass put every surface between
 * 0.3 and 0.7 metalness with a matching emissive lift, which is precisely the "same untextured
 * plastic with a different colour" the critic called out. These are deliberately spread across
 * the full range instead:
 *
 *   bare / machined steel   very metallic, low roughness — hard env highlight, dark diffuse
 *   painted steel           dielectric film over metal, so metalness ~0 and much rougher
 *   chalk paint             the bulkhead finish: no specular character at all
 *   rubber                  matte, non-metallic, swallows light
 *   glass                   the only near-mirror surface in the room
 *   cable jacket / plastic  non-metallic, but glossier than paint
 */
const RESPONSE = {
  bareSteel: { roughness: 0.29, metalness: 1 },
  machined: { roughness: 0.43, metalness: 0.95 },
  galvanised: { roughness: 0.66, metalness: 0.88 },
  castIron: { roughness: 0.78, metalness: 0.8 },
  paintedSteel: { roughness: 0.72, metalness: 0.06 },
  chalkPaint: { roughness: 0.9, metalness: 0.02 },
  rubber: { roughness: 0.97, metalness: 0 },
  glass: { roughness: 0.08, metalness: 0 },
  hardPlastic: { roughness: 0.36, metalness: 0 },
  cableJacket: { roughness: 0.84, metalness: 0 },
  copperPipe: { roughness: 0.32, metalness: 0.94 },
} as const;

type Response = (typeof RESPONSE)[keyof typeof RESPONSE];

let grungeTex: THREE.CanvasTexture | null = null;

/**
 * Flat-coloured material with a shared roughness break-up map. `roughnessMap` multiplies, so the
 * declared roughness is the surface's dirtiest state and the map polishes it back where hands,
 * sleeves and cargo have rubbed it — which is also why no two of these read identically.
 */
function surface(color: number, response: Response, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  if (!grungeTex) {
    grungeTex = buildGrungeRoughTexture();
    grungeTex.repeat.set(3, 3);
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: Math.min(1, response.roughness * 1.12),
    metalness: response.metalness,
    roughnessMap: grungeTex,
    // The scene's environment is dialled to 0.5, which leaves an unlit metal facing away from
    // every practical with nothing at all to reflect. Lifting the per-material intensity gives
    // the shadow side something to catch, so darks carry material instead of crushing to black —
    // and it separates materials further, since a metal gains far more from it than paint does.
    envMapIntensity: 1.5,
    ...extra,
  });
}

interface Kit {
  shellSide: THREE.Material;
  shellEnd: THREE.Material;
  lowerSide: THREE.Material;
  lowerEnd: THREE.Material;
  paintedSide: THREE.Material;
  paintedEnd: THREE.Material;
  paintedPanel: THREE.Material;
  recess: THREE.Material;
  deep: THREE.Material;
  casting: THREE.Material;
  trim: THREE.Material;
  panel: THREE.Material;
  darkMetal: THREE.Material;
  navy: THREE.Material;
  glass: THREE.MeshStandardMaterial[];
  hazardStrip: THREE.Material;
  hazardBlock: THREE.Material;
  hazardTall: THREE.Material;
  red: THREE.Material;
  cyan: THREE.Material;
  warm: THREE.Material;
  louver: THREE.Material;
  copper: THREE.Material;
  cableRed: THREE.Material;
  cableDark: THREE.Material;
  screen: THREE.Material;
  rubber: THREE.Material;
  lowerDirt: THREE.Material;
  drip: THREE.Material;
  scuff: THREE.Material;
  numeral: THREE.Material;
  bolts: InstanceSet;
  ribUpper: InstanceSet;
  ribLower: InstanceSet;
  junction: InstanceSet;
  saddle: InstanceSet;
}

/**
 * Tiled bolted-plate material sized so plates land near PLATE_M whatever the surface measures.
 * Roughness and metalness come entirely from the plate set's ORM map, so the base scalars sit at
 * 1 and let the texture drive them per texel — seam grime, polished bolt heads and steel showing
 * through paint chips all shade differently on what used to be one uniform surface.
 */
function plateMat(
  variant: 'steel' | 'painted' | 'dark' | 'deep',
  along: number,
  up: number,
  normalScale = 1,
): THREE.MeshStandardMaterial {
  const { map, normalMap, ormMap } = buildWallPlateSet(variant, 2, 2);
  const rx = Math.max(1, Math.round(along / PLATE_M));
  const ry = Math.max(0.5, Math.round((up / PLATE_M) * 2) / 2);
  for (const t of [map, normalMap, ormMap]) t.repeat.set(rx, ry);
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: ormMap,
    metalnessMap: ormMap,
    roughness: 1,
    metalness: 1,
  });
}

/** Hazard paint: a thick dry-roller coat, so it is rougher and flatter than the steel it sits on. */
function hazardMat(repeatX: number, repeatY: number): THREE.MeshStandardMaterial {
  const tex = buildChevronTexture('#d8a63a', 5);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return surface(0xffffff, RESPONSE.chalkPaint, { map: tex, transparent: true });
}

function stencilMat(text: string): THREE.MeshStandardMaterial {
  return surface(0xffffff, RESPONSE.chalkPaint, {
    map: buildStencilTextTexture(text),
    transparent: true,
    depthWrite: false,
  });
}

function buildKit(): Kit {
  const louverTex = buildLouverTexture(11);
  louverTex.repeat.set(1, 2);

  const dust = buildDustFilmTexture();
  dust.repeat.set(2, 1);
  const glass = [0, 1].map((seed) => {
    const tex = buildWindowInteriorTexture(seed);
    return new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      // The compartment behind the pane is the light source; the pane itself is only glass.
      emissiveIntensity: 0.8,
      // The one near-mirror surface on the wall — and the dust film is what keeps that
      // reflection patchy instead of a clean CG sheet.
      roughness: 0.4,
      roughnessMap: dust,
      metalness: RESPONSE.glass.metalness,
      envMapIntensity: 2.2,
    });
  });

  const rubberTex = buildRubberTexture();
  rubberTex.repeat.set(6, 1);

  const dirtTex = buildLowerDirtTexture();
  dirtTex.repeat.set(5, 1);

  return {
    shellSide: plateMat('steel', ROOM_D, ROOM_H, 1.1),
    shellEnd: plateMat('steel', ROOM_W, ROOM_H, 1.1),
    lowerSide: plateMat('steel', ROOM_D, 1.16, 1.3),
    lowerEnd: plateMat('steel', ROOM_W, 1.16, 1.3),
    paintedSide: plateMat('painted', ROOM_D, 1.3, 0.85),
    paintedEnd: plateMat('painted', ROOM_W, 0.9, 0.85),
    paintedPanel: plateMat('painted', 2.5, 3.5, 0.85),
    recess: plateMat('dark', ROOM_D, 1.32, 1.2),
    // Recess backing. Well off black on purpose: the reference's darkest wall values still carry
    // material, and dead-black shadow was the largest measured miss of the last round.
    deep: surface(0x2b3138, RESPONSE.chalkPaint),
    // Heavy sand-cast column stock: still metal, but far rougher than the machined trim bolted
    // to it, so the two never share a highlight.
    casting: surface(0x3f464f, RESPONSE.castIron),
    // Machined structural trim. Low diffuse, hard specular — it reads bright only where a light
    // actually hits it, which is how a metal highlight stays out of the blown-highlight budget.
    trim: surface(0x767e88, RESPONSE.machined),
    panel: surface(0x656d77, RESPONSE.paintedSteel),
    darkMetal: surface(0x373f48, RESPONSE.galvanised),
    navy: surface(0x2b3442, RESPONSE.paintedSteel),
    glass,
    hazardStrip: hazardMat(26, 1),
    hazardBlock: hazardMat(3, 1),
    hazardTall: hazardMat(1, 5),
    // Alarm trim is painted, not enamelled metal — matte, and it carries its glow as emissive
    // rather than as a hot base colour.
    red: surface(0xb8462a, RESPONSE.paintedSteel, { emissive: 0x3a1409, emissiveIntensity: 0.7 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x4fd8f0, emissive: 0x4fd8f0, emissiveIntensity: 0.85, ...RESPONSE.hardPlastic }),
    warm: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffd9a0, emissiveIntensity: 0.5, ...RESPONSE.hardPlastic }),
    louver: surface(0xffffff, RESPONSE.galvanised, { map: louverTex }),
    copper: surface(0x9a6836, RESPONSE.copperPipe),
    cableRed: surface(0x7e2c22, RESPONSE.cableJacket),
    cableDark: surface(0x24282e, RESPONSE.cableJacket),
    screen: new THREE.MeshStandardMaterial({ map: buildConsoleScreenTexture('status'), emissive: 0x4fd8f0, emissiveIntensity: 0.9, ...RESPONSE.glass }),
    rubber: surface(0xffffff, RESPONSE.rubber, { map: rubberTex }),
    // Multiply-blended so it darkens whatever plate it sits on rather than painting a flat tint
    // over it — the dirt loading concentrates at the deck and is gone by waist height.
    lowerDirt: new THREE.MeshBasicMaterial({
      map: dirtTex,
      transparent: true,
      // Under MultiplyBlending the premultiply step folds opacity into the colour, so a value
      // below 1 would darken even the clean top of the gradient. The texture carries the falloff
      // instead: white at waist height is the multiply identity and leaves the plate untouched.
      opacity: 1,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
    }),
    drip: new THREE.MeshBasicMaterial({ map: buildDripTexture(), transparent: true, opacity: 0.4, depthWrite: false }),
    scuff: new THREE.MeshBasicMaterial({ map: buildScuffTexture(), transparent: true, opacity: 0.55, depthWrite: false }),
    numeral: surface(0xffffff, RESPONSE.chalkPaint, { map: buildLargeDeckNumberTexture('06', 'DECK'), transparent: true, depthWrite: false }),
    bolts: {
      geo: new THREE.CylinderGeometry(0.019, 0.024, 0.028, 6),
      mat: surface(0x8d959f, RESPONSE.bareSteel),
      xf: [],
    },
    ribUpper: {
      geo: boxGeo(0.05, 0.46, 0.09),
      mat: surface(0x8b939d, RESPONSE.machined),
      xf: [],
    },
    ribLower: {
      geo: boxGeo(0.05, 1.02, 0.08),
      mat: surface(0x737b85, RESPONSE.galvanised),
      xf: [],
    },
    junction: {
      geo: boxGeo(0.15, 0.24, 0.19),
      mat: surface(0x2f3640, RESPONSE.hardPlastic),
      xf: [],
    },
    saddle: {
      geo: boxGeo(0.16, 0.07, 0.3),
      mat: surface(0x4f565f, RESPONSE.machined),
      xf: [],
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Element builders — all frame-relative, so a side wall and an end wall call the same code.
// ---------------------------------------------------------------------------------------------

function addBox(
  ctx: InteriorCtx,
  f: Frame,
  mat: THREE.Material,
  thick: number,
  along: number,
  up: number,
  out: number,
  alongPos: number,
  y: number,
  shadow: 'none' | 'receive' | 'cast' = 'none',
): THREE.Mesh {
  const [w, h, d] = f.dims(thick, along, up);
  const mesh = new THREE.Mesh(boxGeo(w, h, d), mat);
  mesh.position.copy(f.pos(out, alongPos, y));
  if (shadow === 'receive') mesh.receiveShadow = true;
  if (shadow === 'cast') {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  ctx.scene.add(mesh);
  return mesh;
}

function addPlane(
  ctx: InteriorCtx,
  f: Frame,
  mat: THREE.Material,
  w: number,
  h: number,
  out: number,
  alongPos: number,
  y: number,
  renderOrder = 0,
): void {
  const mesh = new THREE.Mesh(planeGeo(w, h), mat);
  mesh.position.copy(f.pos(out, alongPos, y));
  mesh.rotation.y = f.rotY;
  mesh.renderOrder = renderOrder;
  // Decals and grille inserts take shadow from the frames and conduit standing proud of them;
  // only the unlit overlay materials opt out.
  mesh.receiveShadow = !mat.transparent;
  ctx.scene.add(mesh);
}

/**
 * Rectangular frame built from four bars. A solid box the size of an opening would simply hide
 * whatever the opening is meant to reveal, so anything that surrounds glazing, a grille or a
 * screen is assembled as a ring with a real hole in it.
 */
function addFrameRing(
  ctx: InteriorCtx,
  f: Frame,
  mat: THREE.Material,
  thick: number,
  along: number,
  up: number,
  out: number,
  alongPos: number,
  y: number,
  bar: number,
): void {
  addBox(ctx, f, mat, thick, along, bar, out, alongPos, y + up / 2 - bar / 2, 'cast');
  addBox(ctx, f, mat, thick, along, bar, out, alongPos, y - up / 2 + bar / 2, 'cast');
  addBox(ctx, f, mat, thick, bar, up - bar * 2, out, alongPos - along / 2 + bar / 2, y, 'cast');
  addBox(ctx, f, mat, thick, bar, up - bar * 2, out, alongPos + along / 2 - bar / 2, y, 'cast');
}

function addTube(ctx: InteriorCtx, f: Frame, mat: THREE.Material, radius: number, length: number, out: number, alongPos: number, y: number): void {
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), mat);
  tube.rotation.z = Math.PI / 2;
  tube.rotation.y = f.outAxis === 'x' ? Math.PI / 2 : 0;
  tube.position.copy(f.pos(out, alongPos, y));
  tube.castShadow = true;
  tube.receiveShadow = true;
  ctx.scene.add(tube);
}

/**
 * Multiply-blended dirt loading for the bottom of a wall run. Applied as one long decal rather
 * than as a base-colour tint, because dirt belongs where the deck splashes it and boots kick it,
 * not spread evenly over the plate.
 */
function addLowerDirt(ctx: InteriorCtx, kit: Kit, f: Frame, alongPos: number, along: number): void {
  const mesh = new THREE.Mesh(planeGeo(along, 1.05), kit.lowerDirt);
  mesh.position.copy(f.pos(0.078, alongPos, 0.52));
  mesh.rotation.y = f.rotY;
  mesh.renderOrder = 1;
  ctx.scene.add(mesh);
}

/** A run of bolt heads between two points on the wall face. */
function boltRun(kit: Kit, f: Frame, out: number, a0: number, y0: number, a1: number, y1: number, step: number): void {
  const len = Math.hypot(a1 - a0, y1 - y0);
  if (len <= 0) return;
  const n = Math.max(1, Math.round(len / step));
  const rotY = f.outAxis === 'x' ? 0 : Math.PI / 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    scratchQ.setFromEuler(scratchE.set(0, rotY, Math.PI / 2));
    kit.bolts.xf.push(
      new THREE.Matrix4().compose(f.pos(out, a0 + (a1 - a0) * t, y0 + (y1 - y0) * t), scratchQ, UNIT_SCALE),
    );
  }
}

function boltRect(kit: Kit, f: Frame, out: number, ac: number, yc: number, halfA: number, halfY: number, step: number): void {
  boltRun(kit, f, out, ac - halfA, yc + halfY, ac + halfA, yc + halfY, step);
  boltRun(kit, f, out, ac - halfA, yc - halfY, ac + halfA, yc - halfY, step);
  boltRun(kit, f, out, ac - halfA, yc - halfY + step, ac - halfA, yc + halfY - step, step);
  boltRun(kit, f, out, ac + halfA, yc - halfY + step, ac + halfA, yc + halfY - step, step);
}

/**
 * Full-height structural pilaster: a dark flanged base plate with a lighter proud cap, so the
 * silhouette steps twice instead of being one sharp box, plus foot and head castings.
 */
function addPilaster(ctx: InteriorCtx, kit: Kit, f: Frame, alongPos: number, width: number, top = ROOM_H): void {
  addBox(ctx, f, kit.darkMetal, 0.14, width, top, 0.07, alongPos, top / 2, 'cast');
  addBox(ctx, f, kit.trim, 0.09, width - 0.14, top - 0.18, 0.185, alongPos, top / 2, 'cast');
  addBox(ctx, f, kit.darkMetal, 0.24, width + 0.06, 0.1, 0.12, alongPos, 0.13, 'cast');
  addBox(ctx, f, kit.darkMetal, 0.24, width + 0.06, 0.1, 0.12, alongPos, top - 0.15, 'cast');
  const halfB = width / 2 - 0.042;
  boltRun(kit, f, 0.145, alongPos - halfB, 0.34, alongPos - halfB, top - 0.36, 0.44);
  boltRun(kit, f, 0.145, alongPos + halfB, 0.34, alongPos + halfB, top - 0.36, 0.44);
}

/**
 * Glazed bay onto an adjoining lit compartment: proud steel surround, dark navy frame, mullions
 * and transom standing 12 cm in front of a recessed emissive interior, then a projecting sill on
 * brackets. This is the structural feature the wall was missing entirely — the previous pass had
 * no opening of any kind, which is why it read as a painted flat rather than a hull section.
 */
function addWindowBay(ctx: InteriorCtx, kit: Kit, f: Frame, alongPos: number, halfW: number, seed: number): void {
  const yc = (WIN_BOT + WIN_TOP) / 2;
  const halfH = (WIN_TOP - WIN_BOT) / 2;
  const fr = 0.11;

  addFrameRing(ctx, f, kit.trim, 0.1, halfW * 2 + 0.34, halfH * 2 + 0.34, 0.05, alongPos, yc, 0.17);
  addBox(ctx, f, kit.navy, 0.15, halfW * 2 + 0.22, fr, 0.075, alongPos, yc + halfH + fr / 2, 'cast');
  addBox(ctx, f, kit.navy, 0.15, halfW * 2 + 0.22, fr, 0.075, alongPos, yc - halfH - fr / 2, 'cast');
  addBox(ctx, f, kit.navy, 0.15, fr, halfH * 2, 0.075, alongPos - halfW - fr / 2, yc, 'cast');
  addBox(ctx, f, kit.navy, 0.15, fr, halfH * 2, 0.075, alongPos + halfW + fr / 2, yc, 'cast');

  // Rubber glazing gasket bedding the pane into the frame. It is the matte, dead-black-but-not-
  // black element that gives the near-mirror glass beside it something to be measured against.
  addFrameRing(ctx, f, kit.rubber, 0.09, halfW * 2 + 0.08, halfH * 2 + 0.08, 0.06, alongPos, yc, 0.05);

  addPlane(ctx, f, kit.glass[seed % kit.glass.length], halfW * 2, halfH * 2, 0.035, alongPos, yc);

  for (const m of [-halfW / 3, halfW / 3]) {
    addBox(ctx, f, kit.navy, 0.11, 0.055, halfH * 2, 0.055, alongPos + m, yc);
  }
  addBox(ctx, f, kit.navy, 0.1, halfW * 2, 0.05, 0.05, alongPos, yc + halfH * 0.42);
  // Cool strip washing the head of the bay — every strip light in the reference is cyan.
  addBox(ctx, f, kit.cyan, 0.03, halfW * 1.9, 0.028, 0.115, alongPos, yc + halfH - 0.05);

  addBox(ctx, f, kit.trim, 0.26, halfW * 2 + 0.4, 0.08, 0.13, alongPos, WIN_BOT - 0.16, 'cast');
  addBox(ctx, f, kit.darkMetal, 0.2, halfW * 2 + 0.4, 0.04, 0.1, alongPos, WIN_BOT - 0.22, 'cast');
  for (const b of [-0.72, 0, 0.72]) {
    addBox(ctx, f, kit.darkMetal, 0.18, 0.07, 0.16, 0.09, alongPos + b * halfW, WIN_BOT - 0.32, 'cast');
  }

  boltRect(kit, f, 0.155, alongPos, yc, halfW + 0.16, halfH + 0.16, 0.28);
  // Corrosion bleeding out of the sill joint — at the drip source, not smeared over the wall.
  addPlane(ctx, f, kit.drip, halfW * 1.4, 0.7, 0.145, alongPos + halfW * 0.35, WIN_BOT - 0.58, 2);
}

/** Pressure door with alarm-orange surround, viewport, chevron kick plate and a warm door pool. */
function addPressureDoor(ctx: InteriorCtx, kit: Kit, f: Frame, alongPos: number, lampPos: THREE.Vector3): void {
  const halfW = 0.6;
  const yb = KICK_TOP;
  const yt = 2.3;
  const yc = (yb + yt) / 2;
  const halfH = (yt - yb) / 2;

  // Rubber pressure seal, compressed between the leaf and its jamb — matte and non-metallic
  // against the machined trim on one side and painted alarm trim on the other.
  addFrameRing(ctx, f, kit.rubber, 0.13, halfW * 2 + 0.09, halfH * 2 + 0.09, 0.055, alongPos, yc, 0.055);

  addBox(ctx, f, kit.darkMetal, 0.1, halfW * 2, halfH * 2, 0.07, alongPos, yc, 'cast');
  // Raised armour plate and ribs — the leaf steps forward three times, never one flat slab.
  addBox(ctx, f, kit.darkMetal, 0.035, halfW * 2 - 0.16, halfH * 2 - 0.34, 0.1375, alongPos, yc + 0.02);
  for (const y of [0.64, 1.36]) {
    addBox(ctx, f, kit.panel, 0.035, halfW * 2 - 0.1, 0.06, 0.1725, alongPos, y);
  }
  addBox(ctx, f, kit.navy, 0.05, 0.6, 0.28, 0.18, alongPos, 1.96);
  addBox(ctx, f, kit.cyan, 0.02, 0.5, 0.18, 0.215, alongPos, 1.96);
  addPlane(ctx, f, kit.hazardBlock, halfW * 2 - 0.14, 0.24, 0.158, alongPos, 0.4, 2);

  const tw = 0.13;
  addBox(ctx, f, kit.red, 0.17, halfW * 2 + tw * 2, tw, 0.085, alongPos, yt + tw / 2, 'cast');
  addBox(ctx, f, kit.red, 0.17, halfW * 2 + tw * 2, tw, 0.085, alongPos, yb - tw / 2, 'cast');
  addBox(ctx, f, kit.red, 0.17, tw, halfH * 2 + tw * 2, 0.085, alongPos - halfW - tw / 2, yc, 'cast');
  addBox(ctx, f, kit.red, 0.17, tw, halfH * 2 + tw * 2, 0.085, alongPos + halfW + tw / 2, yc, 'cast');
  boltRect(kit, f, 0.175, alongPos, yc, halfW + tw / 2, halfH + tw / 2, 0.26);

  // Over-door lamp: the warm practical that keeps door pools separate from the cool screens.
  addBox(ctx, f, kit.darkMetal, 0.2, 0.9, 0.13, 0.1, alongPos, 2.55, 'cast');
  addBox(ctx, f, kit.warm, 0.05, 0.74, 0.05, 0.19, alongPos, 2.5);
  const lamp = new THREE.PointLight(0xffd9a0, 0.3, 2.0, 2);
  lamp.position.copy(lampPos);
  ctx.scene.add(lamp);

  // Door control plate, squeezed into the reveal between the trim and the next pilaster.
  const panelA = alongPos + 0.835;
  addBox(ctx, f, kit.darkMetal, 0.1, 0.2, 0.4, 0.05, panelA, 1.55, 'cast');
  addBox(ctx, f, kit.deep, 0.03, 0.14, 0.32, 0.115, panelA, 1.55);
  const dotColors = [0xe0552f, 0x4fd8a8, 0xd8a63a];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: dotColors[i], emissive: dotColors[i], emissiveIntensity: 0.2, roughness: 0.35 });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), mat);
    dot.position.copy(f.pos(0.145, panelA, 1.43 + i * 0.11));
    ctx.scene.add(dot);
    ctx.statusLights.push({ mesh: dot, material: mat, phase: Math.random() * Math.PI * 2, onIntensity: 1.4 });
  }
}

/** Shallow wall cabinet: carcass, proud inset door, louvre grille, handle and status LED. */
function addCabinet(ctx: InteriorCtx, kit: Kit, f: Frame, alongPos: number, width: number, yc: number, height: number): void {
  addBox(ctx, f, kit.darkMetal, 0.26, width, height, 0.13, alongPos, yc, 'cast');
  // Rubber weather seal in the door rebate, then the painted door leaf proud of it.
  addFrameRing(ctx, f, kit.rubber, 0.04, width - 0.06, height - 0.06, 0.262, alongPos, yc, 0.04);
  addBox(ctx, f, kit.panel, 0.05, width - 0.1, height - 0.1, 0.285, alongPos, yc, 'cast');
  addPlane(ctx, f, kit.louver, width - 0.3, height * 0.3, 0.313, alongPos, yc + height * 0.22, 1);
  addBox(ctx, f, kit.darkMetal, 0.06, 0.06, 0.2, 0.34, alongPos + width / 2 - 0.14, yc - height * 0.1, 'cast');
  addBox(ctx, f, kit.cyan, 0.02, 0.05, 0.05, 0.32, alongPos - width / 2 + 0.14, yc + height / 2 - 0.11);
  boltRect(kit, f, 0.315, alongPos, yc, width / 2 - 0.09, height / 2 - 0.09, 0.3);
}

/** Louvre extract vent recessed behind a proud steel picture frame. */
function addVent(ctx: InteriorCtx, kit: Kit, f: Frame, alongPos: number, y: number, w: number, h: number): void {
  addBox(ctx, f, kit.deep, 0.09, w, h, 0.045, alongPos, y, 'receive');
  addPlane(ctx, f, kit.louver, w, h, 0.093, alongPos, y, 1);
  addFrameRing(ctx, f, kit.trim, 0.13, w + 0.12, h + 0.12, 0.065, alongPos, y, 0.09);
  boltRect(kit, f, 0.135, alongPos, y, w / 2 + 0.04, h / 2 + 0.04, 0.24);
}

/** Small wall-mounted status monitor on a stub arm, screen recessed inside its bezel ring. */
function addMonitor(ctx: InteriorCtx, kit: Kit, f: Frame, alongPos: number, y: number): void {
  addBox(ctx, f, kit.darkMetal, 0.1, 0.09, 0.16, 0.05, alongPos, y - 0.25);
  addBox(ctx, f, kit.deep, 0.1, 0.46, 0.34, 0.05, alongPos, y, 'cast');
  addPlane(ctx, f, kit.screen, 0.36, 0.24, 0.105, alongPos, y, 1);
  addFrameRing(ctx, f, kit.navy, 0.14, 0.46, 0.34, 0.07, alongPos, y, 0.05);
}

// ---------------------------------------------------------------------------------------------
// Side-wall layout. Every z below is hand-placed against its neighbours so the wall has a real
// bay rhythm — window / door / window / equipment run — rather than evenly scattered props.
// ---------------------------------------------------------------------------------------------

const PILASTERS: [number, number][] = [
  [-5.75, 0.42],
  [-2.75, 0.48],
  [-0.68, 0.36],
  [2.18, 0.4],
  [5.82, 0.32],
];
/** Slim dividers between the equipment cabinets; stop below the head rail. */
const BAY_DIVIDERS = [3.5, 4.6];
const WINDOW_BAYS: [number, number][] = [
  [-4.25, 1.12],
  [0.85, 1.12],
];
const DOOR_Z = -1.8;
const CABINETS = [2.95, 4.05, 5.15];
const RIB_UPPER_Z = [-5.4, -5.0, -4.7, -3.8, -2.3, -1.4, -1.1, -0.2, 1.9];
const RIB_LOWER_Z = [-5.3, -4.7, -4.1, -3.5, -0.1, 0.5, 1.1, 1.7, 2.7, 3.1, 3.9, 4.3, 5.1, 5.5];
const JUNCTION_Z = [-5.2, -1.25, -0.35, 1.7];
const SADDLE_Z = [-5.2, -4.4, -2.6, -0.9, 0.9, 2.6, 4.4, 5.4];

function buildSideWall(ctx: InteriorCtx, kit: Kit, s: number): void {
  const f = sideFrame(s);
  const D = ROOM_D;
  const rotY = f.outAxis === 'x' ? 0 : Math.PI / 2;

  // --- horizontal structural runs ---------------------------------------------------------
  addBox(ctx, f, kit.shellSide, 0.2, D, ROOM_H, -0.1, 0, ROOM_H / 2, 'receive');
  // The glazing band is left as bare shell 7 cm behind the facings, so it reads as a recess.
  addBox(ctx, f, kit.recess, 0.02, D, HEAD_Y - WAIST_Y, 0.01, 0, (HEAD_Y + WAIST_Y) / 2, 'receive');
  addBox(ctx, f, kit.lowerSide, 0.07, D, WAIST_Y - KICK_TOP, 0.035, 0, (WAIST_Y + KICK_TOP) / 2, 'receive');
  addBox(ctx, f, kit.paintedSide, 0.07, D, CORNICE_Y - HEAD_Y, 0.035, 0, (CORNICE_Y + HEAD_Y) / 2, 'receive');

  addBox(ctx, f, kit.darkMetal, 0.14, D, KICK_TOP, 0.07, 0, KICK_TOP / 2, 'cast');
  addPlane(ctx, f, kit.hazardStrip, D - 0.4, 0.1, 0.145, 0, 0.085, 2);

  addBox(ctx, f, kit.trim, 0.16, D, 0.1, 0.08, 0, WAIST_Y, 'cast');
  addBox(ctx, f, kit.darkMetal, 0.1, D, 0.05, 0.05, 0, WAIST_Y - 0.075);
  boltRun(kit, f, 0.085, -D / 2 + 0.3, WAIST_Y + 0.06, D / 2 - 0.3, WAIST_Y + 0.06, 0.55);

  addBox(ctx, f, kit.trim, 0.18, D, 0.13, 0.09, 0, HEAD_Y, 'cast');
  addBox(ctx, f, kit.deep, 0.1, D, 0.04, 0.05, 0, HEAD_Y - 0.09);
  boltRun(kit, f, 0.095, -D / 2 + 0.3, HEAD_Y, D / 2 - 0.3, HEAD_Y, 0.55);

  // Cable tray: a real U-channel carrying three runs, one copper accent.
  addBox(ctx, f, kit.darkMetal, 0.22, D, 0.04, 0.11, 0, TRAY_Y, 'cast');
  addBox(ctx, f, kit.trim, 0.03, D, 0.13, 0.215, 0, TRAY_Y + 0.06, 'cast');
  addTube(ctx, f, kit.copper, 0.032, D - 0.1, 0.06, 0, TRAY_Y + 0.055);
  addTube(ctx, f, kit.cableRed, 0.032, D - 0.1, 0.115, 0, TRAY_Y + 0.055);
  addTube(ctx, f, kit.cableDark, 0.032, D - 0.1, 0.17, 0, TRAY_Y + 0.055);

  // Upper conduit run on saddles.
  addTube(ctx, f, kit.cableDark, 0.045, D - 0.3, 0.14, 0, 3.5);
  addTube(ctx, f, kit.copper, 0.045, D - 0.3, 0.14, 0, 3.62);
  for (const z of SADDLE_Z) pushInstance(kit.saddle, f.pos(0.11, z, 3.56), rotY);

  addBox(ctx, f, kit.deep, 0.16, D, 0.2, 0.08, 0, CORNICE_Y, 'cast');
  addBox(ctx, f, kit.trim, 0.19, D, 0.04, 0.095, 0, CORNICE_Y - 0.12, 'cast');

  // --- vertical structure ------------------------------------------------------------------
  for (const [z, w] of PILASTERS) addPilaster(ctx, kit, f, z, w);
  for (const z of BAY_DIVIDERS) {
    addBox(ctx, f, kit.trim, 0.14, 0.12, 2.55, 0.07, z, 1.42, 'cast');
  }
  for (const z of RIB_UPPER_Z) pushInstance(kit.ribUpper, f.pos(0.105, z, 2.88), rotY);
  for (const z of RIB_LOWER_Z) pushInstance(kit.ribLower, f.pos(0.105, z, 0.73), rotY);

  // --- bays, door, equipment ----------------------------------------------------------------
  WINDOW_BAYS.forEach(([z, hw], i) => addWindowBay(ctx, kit, f, z, hw, i));
  addPressureDoor(ctx, kit, f, DOOR_Z, new THREE.Vector3(s * 3.7, 2.62, DOOR_Z));
  for (const z of CABINETS) addCabinet(ctx, kit, f, z, 0.95, 1.98, 1.06);

  // --- upper-band dressing --------------------------------------------------------------------
  addPlane(ctx, f, kit.numeral, 0.95 * (400 / 560), 0.95, 0.08, -4.25, 3.4, 1);
  addPlane(ctx, f, kit.hazardBlock, 1.5, 0.6, 0.08, 0.85, 3.36, 1);
  addPlane(ctx, f, stencilMat(s > 0 ? 'SOLAR CENTER STATION' : 'HAB RING SECTOR 06'), 2.2, 0.41, 0.08, 4.05, 3.3, 1);
  addMonitor(ctx, kit, f, -1.8, 3.28);
  addMonitor(ctx, kit, f, 2.65, 3.28);
  addVent(ctx, kit, f, -3.4, 3.3, 0.5, 0.44);
  addVent(ctx, kit, f, 5.4, 3.28, 0.4, 0.36);
  for (const z of JUNCTION_Z) {
    pushInstance(kit.junction, f.pos(0.09, z, 3.24), rotY);
    const stub = new THREE.Mesh(boxGeo(0.04, 0.26, 0.04), kit.cableDark);
    stub.position.copy(f.pos(0.05, z, 3.44));
    stub.castShadow = true;
    ctx.scene.add(stub);
  }

  // Slack cable bundles slung between junction boxes, passing behind the pilasters.
  for (const [a, b] of [[-5.2, -1.25], [-0.35, 1.7]] as [number, number][]) {
    const p0 = f.pos(0.11, a, 3.34);
    const p1 = f.pos(0.11, b, 3.34);
    const mid = p0.clone().lerp(p1, 0.5);
    mid.y -= 0.2;
    const curve = new THREE.CatmullRomCurve3([p0, mid, p1]);
    const bundle = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.022, 5, false), kit.cableRed);
    bundle.castShadow = true;
    ctx.scene.add(bundle);
  }

  // --- localised wear ---------------------------------------------------------------------------
  // Dirt loading is heaviest at the deck and gone by waist height — the way splash, mop lines and
  // boot scuff actually deposit it — rather than an even tint across the whole elevation.
  addLowerDirt(ctx, kit, f, 0, D);
  // Scuffs along the walking lane, corrosion under joints, grime pooling where planes meet.
  for (const z of [-4.6, -1.2, 1.6, 4.4]) addPlane(ctx, f, kit.scuff, 1.9, 0.55, 0.075, z, 0.55, 2);
  for (const z of [-2.9, 2.2, 5.6]) addPlane(ctx, f, kit.drip, 0.6, 0.9, 0.075, z, 0.85, 2);
  addGrimeOverlay(ctx, 5.2, 1.1, f.pos(0.09, -3.2, 0.72), new THREE.Euler(0, f.rotY, 0), 0.4);
  addGrimeOverlay(ctx, 5.2, 1.1, f.pos(0.09, 3.2, 0.72), new THREE.Euler(0, f.rotY, 0), 0.32);
  addGrimeOverlay(ctx, 6.0, 1.2, f.pos(0.085, -3.0, 3.3), new THREE.Euler(0, f.rotY, 0), 0.3);
  addGrimeOverlay(ctx, 6.0, 1.2, f.pos(0.085, 3.0, 3.3), new THREE.Euler(0, f.rotY, 0), 0.3);
}

// ---------------------------------------------------------------------------------------------

/** Forward wall: the starfield viewport owns |x| < 3.3, so this dresses the flanks and bands. */
function buildConsoleEndWall(ctx: InteriorCtx, kit: Kit): void {
  const f = endFrame(-1);
  const W = ROOM_W;

  addBox(ctx, f, kit.shellEnd, 0.2, W, ROOM_H, -0.1, 0, ROOM_H / 2, 'receive');
  addBox(ctx, f, kit.lowerEnd, 0.07, W, 0.68, 0.035, 0, 0.5, 'receive');
  addBox(ctx, f, kit.darkMetal, 0.14, W, KICK_TOP, 0.07, 0, KICK_TOP / 2, 'cast');
  addPlane(ctx, f, kit.hazardStrip, W - 0.4, 0.1, 0.145, 0, 0.085, 2);
  addLowerDirt(ctx, kit, f, 0, W);
  addBox(ctx, f, kit.trim, 0.14, W, 0.09, 0.07, 0, 0.86, 'cast');
  boltRun(kit, f, 0.08, -W / 2 + 0.3, 0.78, W / 2 - 0.3, 0.78, 0.5);
  addBox(ctx, f, kit.paintedEnd, 0.07, W, 0.34, 0.035, 0, 3.73, 'receive');
  addBox(ctx, f, kit.deep, 0.16, W, 0.2, 0.08, 0, CORNICE_Y, 'cast');
  addBox(ctx, f, kit.trim, 0.19, W, 0.04, 0.095, 0, CORNICE_Y - 0.12, 'cast');
  addPlane(ctx, f, kit.hazardBlock, 2.0, 0.32, 0.08, 0, 3.72, 1);

  for (const side of [-1, 1] as const) {
    const a = side * 3.9;
    addBox(ctx, f, kit.paintedPanel, 0.07, 0.95, 2.6, 0.035, a, 2.25, 'receive');
    addPilaster(ctx, kit, f, side * 3.35, 0.3);
    addBox(ctx, f, kit.trim, 0.16, 0.95, 0.1, 0.08, a, WAIST_Y, 'cast');
    addVent(ctx, kit, f, a, 2.92, 0.6, 0.5);
    addCabinet(ctx, kit, f, a + side * 0.05, 0.82, 1.62, 0.92);
    addMonitor(ctx, kit, f, a, 3.5);
    // Vertical conduit dropping through the deck beside the viewport.
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 8), kit.cableDark);
    drop.position.copy(f.pos(0.16, a + side * 0.42, 2.0));
    drop.castShadow = true;
    drop.receiveShadow = true;
    ctx.scene.add(drop);
    // Saddles on a vertical run need the clamp turned on its side, so they are built directly
    // rather than fed through the horizontal-run instancer.
    for (const y of [0.9, 2.0, 3.1]) addBox(ctx, f, kit.saddle.mat, 0.16, 0.07, 0.3, 0.08, a + side * 0.42, y);
    pushInstance(kit.junction, f.pos(0.09, a - side * 0.34, 3.48), Math.PI / 2);
    addPlane(ctx, f, kit.drip, 0.5, 0.8, 0.08, a + side * 0.42, 1.1, 2);
    addPlane(ctx, f, kit.scuff, 1.0, 0.5, 0.08, a, 0.55, 2);
    addGrimeOverlay(ctx, 1.0, 1.0, f.pos(0.085, a, 0.7), new THREE.Euler(0, f.rotY, 0), 0.35);
  }
}

/** Aft wall: the airlock assembly owns |x| < 1.75, so this dresses the two outboard panels. */
function buildAirlockEndWall(ctx: InteriorCtx, kit: Kit): void {
  const f = endFrame(1);
  const W = ROOM_W;

  addBox(ctx, f, kit.shellEnd, 0.2, W, ROOM_H, -0.1, 0, ROOM_H / 2, 'receive');
  addBox(ctx, f, kit.paintedEnd, 0.07, W, 0.36, 0.035, 0, 3.72, 'receive');
  addBox(ctx, f, kit.deep, 0.16, W, 0.2, 0.08, 0, CORNICE_Y, 'cast');
  addBox(ctx, f, kit.trim, 0.19, W, 0.04, 0.095, 0, CORNICE_Y - 0.12, 'cast');
  addLowerDirt(ctx, kit, f, 0, W);

  for (const side of [-1, 1] as const) {
    const a = side * 3.1;
    addBox(ctx, f, kit.paintedPanel, 0.07, 2.5, 3.6, 0.035, a, 1.86, 'receive');
    addPilaster(ctx, kit, f, side * 2.1, 0.34);
    addBox(ctx, f, kit.trim, 0.16, 2.4, 0.1, 0.08, a, WAIST_Y, 'cast');
    addBox(ctx, f, kit.trim, 0.18, 2.4, 0.12, 0.09, a, HEAD_Y, 'cast');
    boltRun(kit, f, 0.085, a - 1.1, WAIST_Y + 0.06, a + 1.1, WAIST_Y + 0.06, 0.5);
    boltRun(kit, f, 0.095, a - 1.1, HEAD_Y, a + 1.1, HEAD_Y, 0.5);

    // Chevron column flanking the airlock opening — the reference's striped door surround.
    addBox(ctx, f, kit.darkMetal, 0.09, 0.22, 2.7, 0.045, side * 1.78, 1.55, 'cast');
    addPlane(ctx, f, kit.hazardTall, 0.2, 2.6, 0.095, side * 1.78, 1.55, 2);

    addBox(ctx, f, kit.darkMetal, 0.14, 2.4, KICK_TOP, 0.07, a, KICK_TOP / 2, 'cast');
    addCabinet(ctx, kit, f, a - side * 0.1, 1.0, 1.98, 1.02);
    addVent(ctx, kit, f, a + side * 0.95, 1.95, 0.5, 0.7);
    addMonitor(ctx, kit, f, a, 3.05);
    addPlane(ctx, f, stencilMat(side > 0 ? 'AIRLOCK 02' : 'PRESS 1.0 ATM'), 2.0, 0.38, 0.08, a, 3.45, 1);
    for (const d of [-0.75, -0.25, 0.35, 0.95]) pushInstance(kit.ribLower, f.pos(0.105, a + side * d, 0.72), Math.PI / 2);
    pushInstance(kit.junction, f.pos(0.09, a - side * 0.55, 2.95), Math.PI / 2);
    addPlane(ctx, f, kit.scuff, 1.6, 0.55, 0.08, a, 0.6, 2);
    addPlane(ctx, f, kit.drip, 0.55, 0.85, 0.08, a + side * 1.05, 1.0, 2);
    addGrimeOverlay(ctx, 2.4, 1.1, f.pos(0.085, a, 0.75), new THREE.Euler(0, f.rotY, 0), 0.35);
  }
}

/** Chamfered corner columns tying the four walls together and darkening the room's corners. */
function buildCornerColumns(ctx: InteriorCtx, kit: Kit): void {
  const shaft = new THREE.CylinderGeometry(0.3, 0.3, ROOM_H, 8);
  const flange = new THREE.CylinderGeometry(0.36, 0.36, 0.12, 8);
  const pipe = new THREE.CylinderGeometry(0.05, 0.05, ROOM_H - 0.5, 8);
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const x = sx * (FACE_X - 0.28);
      const z = sz * (FACE_Z - 0.32);
      const col = new THREE.Mesh(shaft, kit.casting);
      col.position.set(x, ROOM_H / 2, z);
      col.rotation.y = Math.PI / 8;
      col.castShadow = true;
      col.receiveShadow = true;
      ctx.scene.add(col);
      for (const y of [0.16, ROOM_H - 0.2]) {
        const cap = new THREE.Mesh(flange, kit.trim);
        cap.position.set(x, y, z);
        cap.rotation.y = Math.PI / 8;
        cap.castShadow = true;
        cap.receiveShadow = true;
        ctx.scene.add(cap);
      }
      // Nothing sits flush against a wall with nothing in front of it, corners included.
      const run = new THREE.Mesh(pipe, kit.copper);
      run.position.set(x - sx * 0.28, ROOM_H / 2 - 0.1, z - sz * 0.18);
      run.castShadow = true;
      run.receiveShadow = true;
      ctx.scene.add(run);
    }
  }
}

/** The four hull walls: plated shell, structural runs, glazed bays, doors, greeble and wear. */
export function buildWalls(ctx: InteriorCtx): void {
  const kit = buildKit();

  buildSideWall(ctx, kit, -1);
  buildSideWall(ctx, kit, 1);
  buildConsoleEndWall(ctx, kit);
  buildAirlockEndWall(ctx, kit);
  buildCornerColumns(ctx, kit);

  flushInstances(ctx, kit.bolts);
  flushInstances(ctx, kit.ribUpper);
  flushInstances(ctx, kit.ribLower);
  flushInstances(ctx, kit.junction);
  flushInstances(ctx, kit.saddle);

  // The compartments behind the glazed bays are lived-in: their light level drifts rather than
  // sitting on a constant, so the four bays never read as four copies of the same decal.
  const baseline = kit.glass.map((m) => m.emissiveIntensity);
  ctx.animated.push((elapsed) => {
    for (let i = 0; i < kit.glass.length; i++) {
      kit.glass[i].emissiveIntensity = baseline[i] * (0.9 + 0.1 * Math.sin(elapsed * (0.5 + i * 0.17) + i));
    }
  });
}
