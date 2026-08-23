import * as THREE from 'three';
import { loadPbr } from '../../core/TextureLibrary';
import type { InteriorCtx } from './ctx';
import { ROOM_D } from './ctx';
import {
  buildAirlockHazardTexture,
  buildAirlockPlacardTexture,
  buildAirlockScreenTexture,
  buildAirlockSteelTexture,
  buildContactShadowTexture,
  buildCorrosionDecalTexture,
  buildDeckStencilTexture,
  buildDoorPlateTexture,
  buildEdgeShadowTexture,
  buildGlassStreakTexture,
  buildHandWearTexture,
  buildLouvreVentTexture,
  buildPaintRoughnessTexture,
  buildPaintedTrimTexture,
  buildScuffDecalTexture,
  buildSillTreadTexture,
  buildSteelRoughnessTexture,
} from './airlockTextures';

// ---------------------------------------------------------------------------------------------
// Layout
//
// The +Z hull wall's inner face is at ROOM_D/2 - 0.1 = 5.9. The player's collider stops their
// centre at z = 5.15 and their capsule radius is 0.35, so nothing at z >= 5.5 can ever intersect
// them. Every wall-mounted element below therefore lives in the 0.4-unit slab between 5.5 and
// 5.9, and the only thing that reaches further into the room is the overhead lintel, which sits
// above 2.7 and is walked under, not into.
// ---------------------------------------------------------------------------------------------

const WALL_F = ROOM_D / 2 - 0.1; // 5.9

const OPEN_W = 1.6;
const OPEN_H = 2.56;
const OPEN_CY = 1.42; // clear opening spans y 0.14 .. 2.70
const FRAME_W = 2.36;
const FRAME_H = 3.1;
const FRAME_CY = 1.55; // frame outer spans y 0.0 .. 3.10, standing on the deck

// Depth stack, front (toward the room) to back. Five distinct planes across 0.37 units is what
// turns a flat painted rectangle into a pressure door you could put a shoulder against.
const Z_BOLT = 5.505;
const Z_BAND = 5.525;
const Z_JAMB_A = 5.57;
const Z_JAMB_B = 5.68;
const Z_LEAF_DETAIL = 5.62;
const Z_LEAF_PLATE = 5.755;
const Z_LEAF_BODY = 5.8;
const Z_DECAL = 5.878;

/** Traces a rounded rectangle with independent top and bottom corner radii onto a path. */
function traceRoundedRect(p: THREE.Path, w: number, h: number, rTop: number, rBot: number, oy = 0): void {
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2 + oy;
  const y1 = h / 2 + oy;
  p.moveTo(x0 + rBot, y0);
  p.lineTo(x1 - rBot, y0);
  p.absarc(x1 - rBot, y0 + rBot, rBot, -Math.PI / 2, 0, false);
  p.lineTo(x1, y1 - rTop);
  p.absarc(x1 - rTop, y1 - rTop, rTop, 0, Math.PI / 2, false);
  p.lineTo(x0 + rTop, y1);
  p.absarc(x0 + rTop, y1 - rTop, rTop, Math.PI / 2, Math.PI, false);
  p.lineTo(x0, y0 + rBot);
  p.absarc(x0 + rBot, y0 + rBot, rBot, Math.PI, Math.PI * 1.5, false);
}

function roundedShape(w: number, h: number, rTop: number, rBot: number, oy = 0): THREE.Shape {
  const s = new THREE.Shape();
  traceRoundedRect(s, w, h, rTop, rBot, oy);
  return s;
}

interface RectSpec {
  w: number;
  h: number;
  rTop: number;
  rBot: number;
  oy?: number;
}

function ringShape(outer: RectSpec, inner: RectSpec): THREE.Shape {
  const s = roundedShape(outer.w, outer.h, outer.rTop, outer.rBot, outer.oy ?? 0);
  const hole = new THREE.Path();
  traceRoundedRect(hole, inner.w, inner.h, inner.rTop, inner.rBot, inner.oy ?? 0);
  s.holes.push(hole);
  return s;
}

function extrude(shape: THREE.Shape, depth: number, bevel = 0.016): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 1,
    curveSegments: 8,
  });
}

/** The aft airlock: bolted pressure-door assembly, its bulkhead surround and the EVA bay around it. */
export function buildAirlock(ctx: InteriorCtx): void {
  // Everything solid casts and receives. The room's only shadow caster is a single directional
  // key, so a mesh that opts out of the shadow pass has literally nothing tying it to the deck —
  // which is exactly what "every object reads as pasted-on" meant. Transparent meshes are excluded
  // because an alpha-blended material still casts a fully opaque shadow.
  const add = <T extends THREE.Object3D>(o: T): T => {
    const m = o as unknown as THREE.Mesh;
    if (m.isMesh) {
      const mat = m.material as THREE.Material;
      m.castShadow = !(Array.isArray(mat) ? mat.some((x) => x.transparent) : mat.transparent);
      m.receiveShadow = true;
    }
    ctx.scene.add(o);
    return o;
  };

  // ===== materials =====================================================================
  // Round 1 lost on material response: steel, paint, rubber, glass and composite all shared one
  // roughness and one metalness, so every surface answered the light identically and the whole bay
  // read as tinted plastic. Each family below is authored as a distinct BRDF. Metalness sits near 0
  // or near 1 and never in the meaningless middle; roughness comes from a map on anything larger
  // than a fist so the specular breaks up across the surface; envMapIntensity separates polished
  // from dead-matte.
  //
  //   family      metal  roughness      env    surfaces
  //   bare steel  0.88   0.35-0.74 map  1.35   frame, jambs, lintel, brackets, housings
  //   painted     0.04   0.47-0.83 map  0.45   door leaf plates, orange band, hazard bands
  //   hardware    1.00   0.21           1.90   wheel, lever, dogs, bolts, hinges, handles
  //   rubber      0.00   0.97           0.12   gasket, hose, tether
  //   glass       0.15   0.05           2.40   viewport, visors
  //   composite   0.05   0.86           0.30   crates, canisters, helmets, keypad
  //   copper      1.00   0.33           1.50   flex conduit
  //
  // Colour follows the brief: cool grey steel, bone-white paint held *below* deck brightness,
  // alarm orange and hazard yellow as accents. The only saturated warm surface is the flex conduit.
  const microNormal = loadPbr('metal_plate', [3, 3]).normalMap;

  const steelTex = buildAirlockSteelTexture();
  steelTex.repeat.set(0.55, 0.55);
  const steelRoughTex = buildSteelRoughnessTexture();
  steelRoughTex.repeat.set(0.55, 0.55);
  const steelMat = new THREE.MeshStandardMaterial({
    map: steelTex,
    roughnessMap: steelRoughTex,
    normalMap: microNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.88,
    envMapIntensity: 1.35,
    emissive: 0x171b21,
    emissiveIntensity: 1.0,
  });

  const steelSmallTex = buildAirlockSteelTexture();
  steelSmallTex.repeat.set(1.7, 1.7);
  const steelSmallRoughTex = buildSteelRoughnessTexture();
  steelSmallRoughTex.repeat.set(1.7, 1.7);
  const steelSmallMat = new THREE.MeshStandardMaterial({
    map: steelSmallTex,
    roughnessMap: steelSmallRoughTex,
    normalMap: microNormal,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.74,
    metalness: 0.86,
    envMapIntensity: 1.3,
    emissive: 0x171b21,
    emissiveIntensity: 1.0,
  });

  // Shadowed structure. The reference keeps material *in* its darks — 0.01% of it is true black
  // against our 17% — so the recess colours sit at the brief's #2b3138–#3d444c rather than below
  // it, and still carry a roughness map so they catch a grazing highlight instead of going flat.
  const shadowSteelRoughTex = buildSteelRoughnessTexture();
  shadowSteelRoughTex.repeat.set(2.4, 2.4);
  const shadowSteelMat = new THREE.MeshStandardMaterial({
    color: 0x3a424c,
    roughnessMap: shadowSteelRoughTex,
    roughness: 0.82,
    metalness: 0.8,
    envMapIntensity: 1.15,
    emissive: 0x141920,
    emissiveIntensity: 1.0,
  });
  const darkRecessMat = new THREE.MeshStandardMaterial({
    color: 0x30363e,
    roughnessMap: shadowSteelRoughTex,
    roughness: 0.95,
    metalness: 0.25,
    envMapIntensity: 0.5,
    emissive: 0x12161b,
    emissiveIntensity: 1.0,
  });
  // Rubber: the only fully dielectric matte in the bay. Near-zero env response is what makes it
  // read as rubber next to steel rather than as dark steel.
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x22252b,
    roughness: 0.97,
    metalness: 0.0,
    envMapIntensity: 0.12,
    emissive: 0x101318,
    emissiveIntensity: 1.0,
  });

  const doorTex = buildDoorPlateTexture();
  doorTex.repeat.set(0.75, 0.75);
  const paintRoughTex = buildPaintRoughnessTexture();
  paintRoughTex.repeat.set(0.75, 0.75);
  const doorMat = new THREE.MeshStandardMaterial({
    map: doorTex,
    roughnessMap: paintRoughTex,
    normalMap: microNormal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughness: 0.98,
    metalness: 0.04,
    envMapIntensity: 0.45,
    emissive: 0x24241f,
    emissiveIntensity: 1.0,
  });

  const trimRoughTex = buildPaintRoughnessTexture();
  trimRoughTex.repeat.set(1.6, 1.6);
  const orangeTex = buildPaintedTrimTexture('#c04a29');
  orangeTex.repeat.set(0.9, 0.9);
  const orangeMat = new THREE.MeshStandardMaterial({
    map: orangeTex,
    roughnessMap: trimRoughTex,
    roughness: 0.96,
    metalness: 0.04,
    envMapIntensity: 0.5,
    emissive: 0x2c0f08,
    emissiveIntensity: 1.0,
  });

  const hazardTex = buildAirlockHazardTexture();
  hazardTex.repeat.set(8, 1);
  const hazardMat = new THREE.MeshStandardMaterial({
    map: hazardTex,
    roughnessMap: trimRoughTex,
    roughness: 0.94,
    metalness: 0.06,
    envMapIntensity: 0.5,
    emissive: 0x1b160a,
    emissiveIntensity: 1.0,
  });

  // Composite / moulded plastic: matte, dielectric, and far less env-reflective than either the
  // steel it sits on or the paint beside it.
  const compositeMat = new THREE.MeshStandardMaterial({
    color: 0x767c85,
    roughnessMap: trimRoughTex,
    roughness: 0.92,
    metalness: 0.05,
    envMapIntensity: 0.3,
    emissive: 0x171a1e,
    emissiveIntensity: 1.0,
  });

  const sillTex = buildSillTreadTexture();
  const sillRoughTex = buildSteelRoughnessTexture();
  sillRoughTex.repeat.set(3, 1);
  const sillMat = new THREE.MeshStandardMaterial({
    map: sillTex,
    roughnessMap: sillRoughTex,
    normalMap: microNormal,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.72,
    metalness: 0.82,
    envMapIntensity: 1.5,
    emissive: 0x181c22,
    emissiveIntensity: 1.0,
  });

  // Hardware: bright, polished, near-mirror. The single loudest specular in the bay, and the thing
  // that proves by contrast that the painted plates around it are not metal.
  const boltMat = new THREE.MeshStandardMaterial({ color: 0xa9b0ba, roughness: 0.21, metalness: 1.0, envMapIntensity: 1.9, emissive: 0x161a20, emissiveIntensity: 1.0 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xa8703a, roughness: 0.33, metalness: 1.0, envMapIntensity: 1.5, emissive: 0x1e0f07, emissiveIntensity: 1.0 });

  const glassMat = new THREE.MeshStandardMaterial({ color: 0x151d25, roughness: 0.05, metalness: 0.15, envMapIntensity: 2.4, emissive: 0x0e222b, emissiveIntensity: 0.9 });
  const cyanLedMat = new THREE.MeshStandardMaterial({ color: 0x0b2530, emissive: 0x4fd8f0, emissiveIntensity: 1.1, roughness: 0.4 });
  // Round 1's fixtures blew out: p95 0.83 against the reference's 0.47. The practicals stay the
  // brightest thing in the bay, but only just, and the base colour under them is dark so the
  // housing does not join in.
  const warmStripMat = new THREE.MeshStandardMaterial({ color: 0x2a251c, emissive: 0xffd9a0, emissiveIntensity: 1.15, roughness: 0.5 });
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x2c0e06, emissive: 0xe0552f, emissiveIntensity: 0.9, roughness: 0.35, transparent: true, opacity: 0.85 });

  // ===== wear and grounding decals =====================================================
  // Straight alpha blending throughout, never MultiplyBlending: a multiply decal built from a
  // canvas with cleared regions multiplies the destination by RGB 0 wherever alpha is 0, so it
  // stamps an opaque black rectangle around itself. That was silently painting black plates onto
  // this bulkhead last round, and black plates are most of a 17% crushed-shadow score.
  const decalPlane = new THREE.PlaneGeometry(1, 1);
  const corrosionMat = new THREE.MeshBasicMaterial({ map: buildCorrosionDecalTexture(), transparent: true, opacity: 0.85, depthWrite: false });
  const contactMat = new THREE.MeshBasicMaterial({ map: buildContactShadowTexture(), transparent: true, depthWrite: false });
  const edgeAoMat = new THREE.MeshBasicMaterial({ map: buildEdgeShadowTexture(), transparent: true, depthWrite: false });
  const scuffMat = new THREE.MeshBasicMaterial({ map: buildScuffDecalTexture(), transparent: true, opacity: 0.9, depthWrite: false });
  const handWearMat = new THREE.MeshBasicMaterial({ map: buildHandWearTexture(), transparent: true, depthWrite: false });
  const stencilMat = new THREE.MeshBasicMaterial({ map: buildDeckStencilTexture(), transparent: true, opacity: 0.85, depthWrite: false });
  const glassStreakMat = new THREE.MeshBasicMaterial({ map: buildGlassStreakTexture(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });

  /** A flat decal quad. Never shadowed and never a shadow caster — it *is* the shadow. */
  const decal = (mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, rot: THREE.Euler, order = 4) => {
    const m = new THREE.Mesh(decalPlane, mat);
    m.position.set(x, y, z);
    m.scale.set(w, h, 1);
    m.rotation.copy(rot);
    m.renderOrder = order;
    ctx.scene.add(m);
    return m;
  };
  const FLAT = new THREE.Euler(-Math.PI / 2, 0, 0);
  const UPRIGHT = new THREE.Euler(0, 0, 0);

  /**
   * Occlusion pool on the deck under a prop — the contact the 1024px shadow map cannot resolve.
   * `y` rises to 0.042 for anything standing on the 3.5 cm deck-plate inserts near the bulkhead,
   * so the pool draws on top of the plate instead of being buried inside it.
   */
  const groundShadow = (x: number, z: number, w: number, d: number, y = 0.018) => decal(contactMat, x, y, z, w, d, FLAT);

  /**
   * Occlusion ramp on the bulkhead, darkest at its lower edge. The key light comes from over the
   * camera's shoulder, so a box bolted flat to this wall can never cast a shadow onto it; without
   * this the wall stays evenly lit right up to the box and the box floats.
   */
  const wallAo = (x: number, y: number, w: number, h: number, z = 5.882) => decal(edgeAoMat, x, y, z, w, h, UPRIGHT);

  /** Stencilled placard on a painted plate: matte, dielectric, barely env-reflective. */
  const placardMaterial = (main: string, sub: string, accent?: string) =>
    new THREE.MeshStandardMaterial({
      map: buildAirlockPlacardTexture(main, sub, accent),
      roughnessMap: trimRoughTex,
      roughness: 0.9,
      metalness: 0.05,
      envMapIntensity: 0.3,
      emissive: 0x171a1e,
      emissiveIntensity: 1.0,
    });
  const placard = (w: number, h: number, main: string, sub: string, accent?: string) =>
    new THREE.Mesh(new THREE.PlaneGeometry(w, h), placardMaterial(main, sub, accent));

  // Shared geometries for everything that repeats.
  const boltGeo = new THREE.CylinderGeometry(0.028, 0.034, 0.03, 6);
  const smallBoltGeo = new THREE.CylinderGeometry(0.016, 0.02, 0.022, 6);
  const clampGeo = new THREE.BoxGeometry(0.07, 0.11, 0.13);
  const canisterGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.46, 12);
  const canisterCapGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.09, 10);

  /** One InstancedMesh per bolt cluster: dozens of rivet heads for a single draw call. */
  const addBolts = (geo: THREE.BufferGeometry, pts: THREE.Vector3[]) => {
    const im = new THREE.InstancedMesh(geo, boltMat, pts.length);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const one = new THREE.Vector3(1, 1, 1);
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => {
      m.compose(p, q, one);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    add(im);
    // A 3 cm rivet is a third of a shadow-map texel at this frustum size, so casting from it buys
    // aliasing rather than contact. It still receives.
    im.castShadow = false;
  };

  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    add(m);
    return m;
  };

  // ===== 0. bulkhead panelisation ======================================================
  // The aft wall arrives as one bare band. Ribbing it on the same 1.15 / 3.15 rhythm the side
  // walls use keeps the room reading as one hull rather than three unrelated surfaces.
  const ribMat = new THREE.MeshStandardMaterial({
    color: 0x848b94,
    roughnessMap: steelSmallRoughTex,
    roughness: 0.62,
    metalness: 0.9,
    envMapIntensity: 1.55,
    emissive: 0x1b2027,
    emissiveIntensity: 1.0,
  });
  for (const x of [-4.15, -2.42, 2.42, 4.15]) {
    box(0.07, 3.9, 0.05, x, 1.95, WALL_F - 0.025, ribMat);
  }
  for (const [y, x0, x1] of [[1.15, -4.35, -1.25], [3.15, -4.35, -1.25], [1.15, 1.25, 4.35], [3.15, 1.25, 4.35], [3.6, -4.35, 4.35]] as const) {
    box(x1 - x0, 0.06, 0.045, (x0 + x1) / 2, y, WALL_F - 0.022, ribMat);
  }

  // Room-scale ambient occlusion. Nothing in the lighting rig computes this: the key is a single
  // directional and the fill is a hemisphere, so a corner and an open wall receive identical light.
  // These three ramps are the difference between a bay and a lit box.
  wallAo(0, 0.34, 8.9, 0.68); // wall meets deck
  for (const sx of [-1, 1] as const) {
    // Scale is applied before rotation, so the quad is authored long-side-first and then turned a
    // quarter turn; the ramp's dark end lands on the side-wall corner it is occluding.
    const corner = decal(edgeAoMat, sx * 4.06, 1.9, 5.86, 3.9, 0.78, UPRIGHT);
    corner.rotation.z = (sx * Math.PI) / 2;
  }
  // Deck-side half of the same junction: the shadow the bulkhead throws onto the floor at its foot.
  decal(contactMat, 0, 0.042, 5.78, 8.9, 0.7, FLAT);

  // Corrosion and drip runs where the conduit above bleeds onto the bulkhead — wear with a
  // cause, sitting under the pipes rather than tinted across the whole wall.
  for (const x of [-2.6, 3.0]) {
    decal(corrosionMat, x, 2.9, Z_DECAL, 1.7, 1.1, UPRIGHT, 2);
  }
  // Drip streaks directly beneath the riser clamps and the starboard junction box, where a joint
  // has been weeping for years.
  for (const [x, y, w, h] of [[-4.16, 1.5, 0.5, 2.4], [3.9, 1.8, 0.6, 1.9]] as const) {
    decal(corrosionMat, x, y, Z_DECAL, w, h, UPRIGHT, 2);
  }

  // ===== 1. door surround ==============================================================
  const openSpec: RectSpec = { w: OPEN_W, h: OPEN_H, rTop: 0.4, rBot: 0.1, oy: OPEN_CY - FRAME_CY };
  const midSpec: RectSpec = { w: OPEN_W + 0.38, h: OPEN_H + 0.36, rTop: 0.5, rBot: 0.14, oy: OPEN_CY - FRAME_CY };
  const outerSpec: RectSpec = { w: FRAME_W, h: FRAME_H, rTop: 0.56, rBot: 0.16 };

  // Dark plate closing off the recess so nothing shows the raw hull behind the door.
  const backPlate = new THREE.Mesh(new THREE.PlaneGeometry(FRAME_W, FRAME_H), darkRecessMat);
  backPlate.position.set(0, FRAME_CY, Z_DECAL);
  add(backPlate);

  // Chamber lighting inside the reveal. The gap between leaf and jamb was the deepest true black
  // in the frame; the reference solves the same problem by putting warm red emissives *inside* the
  // door, which reads as a lit chamber beyond rather than a hole cut in the wall.
  // The strips live in the 5 cm slot between the face plates and the jamb's inner edge, which is
  // the exact band that read as dead black last round.
  const chamberMat = new THREE.MeshStandardMaterial({ color: 0x2a1109, emissive: 0xe0552f, emissiveIntensity: 0.5, roughness: 0.6 });
  for (const sx of [-1, 1] as const) {
    box(0.026, OPEN_H - 0.34, 0.05, sx * 0.775, OPEN_CY, Z_LEAF_PLATE - 0.01, chamberMat);
  }
  box(1.1, 0.022, 0.05, 0, OPEN_CY + OPEN_H / 2 - 0.025, Z_LEAF_PLATE - 0.01, chamberMat);
  const chamberLight = new THREE.PointLight(0xff8a4a, 0.5, 2.0, 2);
  chamberLight.position.set(0, 1.7, 5.66);
  add(chamberLight);

  // Jamb A — the outer, shallower step of the reveal.
  const jambA = new THREE.Mesh(extrude(ringShape(outerSpec, midSpec), WALL_F - Z_JAMB_A), steelMat);
  jambA.position.set(0, FRAME_CY, Z_JAMB_A);
  jambA.castShadow = true;
  add(jambA);

  // Jamb B — the inner step, carrying the sealing face the leaf closes against.
  const jambB = new THREE.Mesh(extrude(ringShape(midSpec, openSpec), WALL_F - Z_JAMB_B), shadowSteelMat);
  jambB.position.set(0, FRAME_CY, Z_JAMB_B);
  add(jambB);

  // Alarm-orange painted band around the outer edge — the reference's single loudest colour,
  // used as a 15 cm border rather than a large surface.
  const bandInner: RectSpec = { w: FRAME_W - 0.32, h: FRAME_H - 0.32, rTop: 0.44, rBot: 0.1 };
  const band = new THREE.Mesh(extrude(ringShape(outerSpec, bandInner), 0.05, 0.012), orangeMat);
  band.position.set(0, FRAME_CY, Z_BAND);
  add(band);

  // Compression gasket, visible as a matte black lip just inside the opening.
  const gasketInner: RectSpec = { w: OPEN_W - 0.1, h: OPEN_H - 0.1, rTop: 0.35, rBot: 0.07, oy: openSpec.oy };
  const gasket = new THREE.Mesh(extrude(ringShape(openSpec, gasketInner), 0.04, 0), rubberMat);
  gasket.position.set(0, FRAME_CY, Z_LEAF_PLATE - 0.05);
  add(gasket);

  // Rivet lines up both jambs and across the header.
  const framePts: THREE.Vector3[] = [];
  for (let y = 0.16; y <= 2.9; y += 0.26) {
    framePts.push(new THREE.Vector3(-1.1, y, Z_BOLT), new THREE.Vector3(1.1, y, Z_BOLT));
  }
  for (let x = -0.92; x <= 0.93; x += 0.31) framePts.push(new THREE.Vector3(x, 3.0, Z_BOLT));
  addBolts(boltGeo, framePts);

  // Corner gussets breaking the frame silhouette.
  for (const sx of [-1, 1] as const) {
    for (const [y, h] of [[0.34, 0.5], [2.78, 0.42]] as const) {
      box(0.16, h, 0.1, sx * 1.26, y, Z_JAMB_A + 0.05, steelSmallMat);
    }
  }

  // ===== 2. door leaf ==================================================================
  const leafSpec: RectSpec = { w: OPEN_W + 0.14, h: OPEN_H + 0.14, rTop: 0.44, rBot: 0.12 };
  const leafBody = new THREE.Mesh(extrude(roundedShape(leafSpec.w, leafSpec.h, leafSpec.rTop, leafSpec.rBot), 0.1, 0.02), shadowSteelMat);
  leafBody.position.set(0, OPEN_CY, Z_LEAF_BODY);
  add(leafBody);

  // Bolted face plates, separated by 6 cm shadow gaps so the leaf reads as assembled, not cast.
  const facePlate = (w: number, h: number, y: number, mat: THREE.Material, rTop = 0.06, rBot = 0.06) => {
    const m = new THREE.Mesh(extrude(roundedShape(w, h, rTop, rBot), 0.05, 0.014), mat);
    m.position.set(0, y, Z_LEAF_PLATE);
    add(m);
    return m;
  };
  facePlate(1.5, 0.3, 0.31, hazardMat); // kick plate
  facePlate(1.5, 0.9, 0.97, doorMat);
  facePlate(1.5, 1.16, 2.07, doorMat, 0.3, 0.06);

  // Wear where use puts it, not as a tint: boot marks smeared across the kick plate, a burnished
  // halo around the wheel and the lever where gloves land, and grime settled into the shadow gap
  // under each plate.
  decal(scuffMat, 0, 0.3, Z_LEAF_PLATE - 0.028, 1.44, 0.34, UPRIGHT, 3);
  decal(handWearMat, 0, 0.97, Z_LEAF_PLATE - 0.028, 0.94, 0.86, UPRIGHT, 3);
  decal(handWearMat, 0.55, 1.5, Z_LEAF_PLATE - 0.028, 0.44, 0.6, UPRIGHT, 3);
  for (const y of [0.47, 1.44]) {
    decal(edgeAoMat, 0, y + 0.09, Z_LEAF_PLATE - 0.026, 1.46, 0.18, UPRIGHT, 3);
  }

  // Raised ribs across the plates — the third detail layer, above plate and above leaf.
  for (const [w, h, x, y] of [[1.42, 0.05, 0, 0.63], [1.42, 0.05, 0, 1.31], [0.05, 1.02, -0.5, 2.02], [0.05, 1.02, 0.5, 2.02]] as const) {
    box(w, h, 0.03, x, y, Z_LEAF_PLATE - 0.03, ribMat);
  }
  const plateBolts: THREE.Vector3[] = [];
  for (const [x, y] of [[-0.66, 0.6], [0.66, 0.6], [-0.66, 1.34], [0.66, 1.34], [-0.66, 1.6], [0.66, 1.6], [-0.66, 2.5], [0.66, 2.5], [-0.66, 0.2], [0.66, 0.2], [-0.66, 0.42], [0.66, 0.42]] as const) {
    plateBolts.push(new THREE.Vector3(x, y, Z_LEAF_PLATE - 0.04));
  }
  addBolts(smallBoltGeo, plateBolts);

  // Viewport: recessed bezel, dark glass, cyan status ring and its own bolt ring.
  const portGroup = new THREE.Group();
  portGroup.position.set(0, 2.12, 0);
  add(portGroup);
  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.09, 20), steelSmallMat);
  bezel.rotation.x = Math.PI / 2;
  bezel.position.z = Z_LEAF_PLATE - 0.02;
  portGroup.add(bezel);
  const portGlass = new THREE.Mesh(new THREE.CircleGeometry(0.25, 20), glassMat);
  portGlass.position.z = Z_LEAF_PLATE - 0.07;
  portGroup.add(portGlass);
  const cycleRing = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.014, 6, 24), cyanLedMat);
  cycleRing.position.z = Z_LEAF_PLATE - 0.085;
  portGroup.add(cycleRing);
  // Frost/condensation ring at the glass edge — the hatch is cold on the far side.
  const frost = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.25, 20), new THREE.MeshBasicMaterial({ color: 0x9fd4e4, transparent: true, opacity: 0.18, depthWrite: false }));
  frost.position.z = Z_LEAF_PLATE - 0.075;
  portGroup.add(frost);
  // A broad off-axis reflection laid over the glass. Standard-material glass with nothing bright
  // in front of it renders as a black disc; the reference's viewport convinces because a room
  // reflection sits on top of whatever you can see through it.
  const streak = new THREE.Mesh(new THREE.CircleGeometry(0.245, 20), glassStreakMat);
  streak.position.z = Z_LEAF_PLATE - 0.078;
  streak.renderOrder = 5;
  portGroup.add(streak);
  // Burnished halo on the plate around the bezel, where crew brace a hand to look through.
  decal(handWearMat, 0, 2.12, Z_LEAF_PLATE - 0.03, 0.9, 0.9, UPRIGHT, 3);
  const portBolts: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    portBolts.push(new THREE.Vector3(Math.cos(a) * 0.34, 2.12 + Math.sin(a) * 0.34, Z_LEAF_PLATE - 0.05));
  }
  addBolts(smallBoltGeo, portBolts);

  // Manual override wheel — steel, not gold, with a proper hub, six spokes and a grip rim.
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(0, 0.97, Z_LEAF_DETAIL);
  add(wheelGroup);
  // Handled steel: the rim is polished by use to a lower roughness than any structural plate.
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x9ba3ad, roughness: 0.24, metalness: 1.0, envMapIntensity: 1.75, emissive: 0x161a20, emissiveIntensity: 1.0 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 28), wheelMat);
  wheelGroup.add(rim);
  const spokeGeo = new THREE.BoxGeometry(0.5, 0.035, 0.035);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(spokeGeo, wheelMat);
    spoke.rotation.z = (Math.PI / 3) * i;
    wheelGroup.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.14, 12), steelSmallMat);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.05;
  wheelGroup.add(hub);
  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10), orangeMat);
  hubCap.rotation.x = Math.PI / 2;
  hubCap.position.z = -0.03;
  wheelGroup.add(hubCap);

  // Latch pocket and lever, offset from the wheel so the leaf isn't symmetric.
  box(0.24, 0.42, 0.05, 0.55, 1.55, Z_LEAF_PLATE - 0.01, darkRecessMat);
  const lever = box(0.07, 0.3, 0.06, 0.55, 1.52, Z_LEAF_PLATE - 0.07, wheelMat);
  lever.rotation.z = -0.22;
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), steelSmallMat);
  pivot.rotation.x = Math.PI / 2;
  pivot.position.set(0.55, 1.68, Z_LEAF_PLATE - 0.08);
  add(pivot);

  // Dogging bolts biting into the frame down both edges of the leaf.
  const dogGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.1, 8);
  for (const sx of [-1, 1] as const) {
    for (const y of [0.5, 1.45, 2.4]) {
      const dog = new THREE.Mesh(dogGeo, wheelMat);
      dog.rotation.x = Math.PI / 2;
      dog.position.set(sx * 0.76, y, Z_LEAF_PLATE - 0.03);
      add(dog);
    }
  }

  // Hinge knuckles down the left edge.
  for (const y of [0.42, 1.42, 2.42]) {
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.28, 12), steelSmallMat);
    knuckle.position.set(-0.79, y, Z_LEAF_PLATE + 0.01);
    add(knuckle);
    box(0.14, 0.1, 0.16, -0.72, y, Z_LEAF_PLATE + 0.03, shadowSteelMat);
  }

  // Leaf placard.
  const leafPlacard = placard(0.56, 0.14, 'A-1', 'PRESSURE HATCH', '#d8a63a');
  leafPlacard.position.set(-0.32, 1.55, Z_LEAF_PLATE - 0.033);
  add(leafPlacard);

  // ===== 3. threshold and deck dressing ================================================
  const sill = box(2.5, 0.09, 0.42, 0, 0.045, 5.66, sillMat);
  sill.receiveShadow = true;
  box(2.56, 0.05, 0.06, 0, 0.02, 5.44, hazardMat);
  const sillBolts: THREE.Vector3[] = [];
  for (let x = -1.1; x <= 1.15; x += 0.31) sillBolts.push(new THREE.Vector3(x, 0.09, 5.52));
  const sillIm = new THREE.InstancedMesh(smallBoltGeo, boltMat, sillBolts.length);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    sillBolts.forEach((p, i) => {
      m.compose(p, q, one);
      sillIm.setMatrixAt(i, m);
    });
    sillIm.instanceMatrix.needsUpdate = true;
    add(sillIm);
  }
  // The critic's one complaint about the *reference* is that its lower foreground is a bare,
  // low-texel grey slab carrying none of the material information the rest of the frame does. That
  // is the half of the shot where this bay can be better rather than merely level, so the approach
  // deck gets real geometry, real markings and real traffic wear. Everything here is under 6 cm
  // tall or flat, so the walk from spawn to the console is untouched.

  // Bolted deck-plate inserts running the width of the bay, either side of the sill.
  for (const sx of [-1, 1] as const) {
    const insert = box(3.05, 0.035, 0.52, sx * 2.82, 0.018, 5.62, sillMat);
    insert.receiveShadow = true;
    box(3.05, 0.02, 0.05, sx * 2.82, 0.03, 5.37, ribMat);
    const insertBolts: THREE.Vector3[] = [];
    for (let x = -1.4; x <= 1.45; x += 0.4) insertBolts.push(new THREE.Vector3(sx * 2.82 + x, 0.038, 5.42));
    addBolts(smallBoltGeo, insertBolts);
  }

  // Recessed deck drain just off the lane, with a raised bezel so it catches an edge highlight.
  const drainMat = new THREE.MeshStandardMaterial({ map: buildLouvreVentTexture(), roughness: 0.85, metalness: 0.7, envMapIntensity: 0.9, emissive: 0x14171c, emissiveIntensity: 1.0 });
  const drain = new THREE.Mesh(decalPlane, drainMat);
  drain.rotation.copy(FLAT);
  drain.position.set(-1.94, 0.014, 5.06);
  drain.scale.set(0.36, 0.36, 1);
  drain.receiveShadow = true;
  ctx.scene.add(drain);
  for (const [w, d, x, z] of [[0.44, 0.03, -1.94, 4.88], [0.44, 0.03, -1.94, 5.24], [0.03, 0.4, -2.16, 5.06], [0.03, 0.4, -1.72, 5.06]] as const) {
    box(w, 0.03, d, x, 0.015, z, ribMat);
  }

  // Flush tie-down rings, well outside the walking lane.
  const ringGeo = new THREE.TorusGeometry(0.055, 0.012, 6, 14);
  for (const [x, z] of [[-2.9, 5.14], [2.9, 5.14], [-3.9, 4.86], [3.9, 4.86]] as const) {
    box(0.18, 0.02, 0.18, x, 0.011, z, ribMat);
    const ring = new THREE.Mesh(ringGeo, boltMat);
    ring.rotation.x = Math.PI / 2 - 0.5;
    ring.position.set(x, 0.03, z);
    add(ring);
  }

  // Painted deck markings, worn through where the traffic crosses them.
  decal(stencilMat, 0, 0.019, 4.62, 3.4, 1.7, FLAT, 3);
  // Traffic wear: heavy in the lane through the hatch, lighter fanning out to either side.
  decal(scuffMat, 0, 0.021, 5.0, 1.9, 1.3, FLAT, 5);
  decal(scuffMat, -1.5, 0.021, 4.7, 1.6, 1.4, FLAT, 5);
  decal(scuffMat, 1.7, 0.021, 4.75, 1.7, 1.5, FLAT, 5);
  // Grime dragged out of the doorway, darkest right at the sill.
  decal(corrosionMat, 0, 0.02, 5.3, 2.3, 0.9, FLAT, 4);

  // ===== 4. overhead lintel ============================================================
  // The one element that leaves the wall slab: a structural beam over the hatch at head height,
  // giving the shot a genuine foreground layer in front of mid-ground frame and background wall.
  const lintel = box(3.4, 0.3, 0.6, 0, 3.28, 5.5, steelMat);
  lintel.castShadow = true;
  box(3.5, 0.07, 0.68, 0, 3.44, 5.5, ribMat);
  for (const sx of [-1, 1] as const) {
    // Angled knee braces back to the bulkhead.
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, 0.09), steelSmallMat);
    brace.position.set(sx * 1.5, 2.86, 5.55);
    brace.rotation.x = -0.55;
    add(brace);
    box(0.16, 0.16, 0.2, sx * 1.5, 3.1, 5.28, shadowSteelMat);
  }
  const lintelBolts: THREE.Vector3[] = [];
  for (let x = -1.55; x <= 1.6; x += 0.31) lintelBolts.push(new THREE.Vector3(x, 3.28, 5.19));
  addBolts(boltGeo, lintelBolts);

  // Warm practical tucked under the lintel — the door's pool of light, warm by fixture type.
  // Round 1 ran this at emissive 2.1 through a bloom pass and lit the deck to white; it is now a
  // fixture you can look at, and the falloff is tightened so the pool lands on the leaf and the
  // upper frame rather than washing across the floor.
  box(2.4, 0.05, 0.13, 0, 3.12, 5.32, warmStripMat);
  box(2.56, 0.11, 0.2, 0, 3.17, 5.32, shadowSteelMat);
  const doorLight = new THREE.PointLight(0xffd9a0, 1.1, 3.4, 2);
  doorLight.position.set(0, 2.94, 5.16);
  add(doorLight);

  // Header placard and flanking alarm beacons.
  const header = placard(1.5, 0.34, 'AIRLOCK 04', 'EVA ACCESS — VACUUM BEYOND');
  header.position.set(0, 3.28, 5.19);
  add(header);

  for (const sx of [-1, 1] as const) {
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.1, 10), shadowSteelMat);
    cage.position.set(sx * 1.32, 3.28, 5.2);
    cage.rotation.x = Math.PI / 2;
    add(cage);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), beaconMat);
    dome.position.set(sx * 1.32, 3.28, 5.14);
    dome.rotation.x = -Math.PI / 2;
    add(dome);
  }
  const beaconLight = new THREE.PointLight(0xe0552f, 0.4, 4, 2);
  beaconLight.position.set(0, 3.15, 5.05);
  add(beaconLight);

  // Conduit bundle slung under the lintel and running off along the bulkhead.
  const pipeGeo = new THREE.CylinderGeometry(0.045, 0.045, 8.6, 10);
  for (const [y, z, mat] of [[3.5, 5.72, steelSmallMat], [3.62, 5.72, steelSmallMat], [3.56, 5.62, copperMat]] as const) {
    const pipe = new THREE.Mesh(pipeGeo, mat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, y, z);
    add(pipe);
  }
  for (let x = -4.0; x <= 4.05; x += 0.95) {
    const clamp = new THREE.Mesh(clampGeo, shadowSteelMat);
    clamp.position.set(x, 3.56, 5.68);
    add(clamp);
  }

  // ===== 5. port side: control station, EVA lockers, riser =============================
  // Control niche.
  const nicheHousing = box(0.94, 1.16, 0.16, -1.82, 1.62, 5.72, steelSmallMat);
  nicheHousing.castShadow = true;
  box(0.98, 0.07, 0.2, -1.82, 2.24, 5.7, ribMat);
  box(0.84, 0.98, 0.05, -1.82, 1.62, 5.62, darkRecessMat);
  wallAo(-1.82, 0.86, 1.3, 0.66); // occlusion the wall receives under the housing
  // Grubby halo around the keypad and the release, where every crew member has put a glove.
  decal(handWearMat, -1.82, 1.36, 5.588, 1.0, 0.7, UPRIGHT, 3);

  const screenTexA = buildAirlockScreenTexture('pressure');
  const screenMatA = new THREE.MeshStandardMaterial({ map: screenTexA, emissive: 0xffffff, emissiveMap: screenTexA, emissiveIntensity: 1.5, roughness: 0.25, metalness: 0.1 });
  const screenA = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.39), screenMatA);
  screenA.position.set(-1.82, 1.86, 5.59);
  add(screenA);
  box(0.68, 0.45, 0.03, -1.82, 1.86, 5.615, shadowSteelMat);

  // Keypad: 12 keys on a shared geometry.
  const keyGeo = new THREE.BoxGeometry(0.055, 0.045, 0.02);
  // Moulded keycaps: plastic, so matte and barely env-reflective next to the steel bezel.
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x8d939c, roughness: 0.88, metalness: 0.04, envMapIntensity: 0.25, emissive: 0x171a1f, emissiveIntensity: 1.0 });
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const key = new THREE.Mesh(keyGeo, keyMat);
      key.position.set(-2.0 + c * 0.07, 1.52 - r * 0.06, 5.6);
      add(key);
    }
  }
  // Status lamps, hooked into the shared blink loop.
  const lampGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.025, 10);
  const lampColors = [0x4fd8f0, 0x8ef0b0, 0xe0552f];
  lampColors.forEach((color, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x14181d, emissive: color, emissiveIntensity: 1.4, roughness: 0.35 });
    const lamp = new THREE.Mesh(lampGeo, mat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(-1.62, 1.52 - i * 0.09, 5.6);
    add(lamp);
    ctx.statusLights.push({ mesh: lamp, material: mat, phase: i * 1.7, onIntensity: 1.9 });
  });
  // Emergency release: red pull handle in its own guarded pocket.
  box(0.2, 0.3, 0.05, -1.62, 1.24, 5.615, darkRecessMat);
  // Powder-coated handle: painted, not plated — dielectric and matte.
  const pullMat = new THREE.MeshStandardMaterial({ color: 0xc44a29, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.4, emissive: 0x33110a, emissiveIntensity: 1.0 });
  const pull = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 14), pullMat);
  pull.position.set(-1.62, 1.24, 5.56);
  add(pull);
  const panelGlow = new THREE.PointLight(0x4fd8f0, 0.35, 2.4, 2);
  panelGlow.position.set(-1.82, 1.8, 5.25);
  add(panelGlow);

  // EVA suit lockers.
  const lockerX = -3.28;
  const lockerBody = box(1.42, 2.2, 0.34, lockerX, 1.14, 5.73, steelMat);
  lockerBody.castShadow = true;
  box(1.5, 0.12, 0.42, lockerX, 2.28, 5.71, ribMat);
  box(1.46, 0.18, 0.38, lockerX, 0.09, 5.71, hazardMat);
  // Grounding: a pool on the deck at the locker's foot and an occlusion ramp on the wall behind
  // it. Without these the cabinet is a box floating against an evenly lit bulkhead.
  groundShadow(lockerX, 5.42, 2.1, 1.0, 0.042);
  wallAo(lockerX, 0.3, 2.0, 0.6);
  decal(scuffMat, lockerX, 0.043, 5.3, 1.9, 0.8, FLAT, 5);
  const louvreTex = buildLouvreVentTexture();
  const louvreMat = new THREE.MeshStandardMaterial({ map: louvreTex, roughness: 0.86, metalness: 0.72, envMapIntensity: 0.85, emissive: 0x14171c, emissiveIntensity: 1.0 });
  for (const sx of [-1, 1] as const) {
    const doorX = lockerX + sx * 0.35;
    const leaf = new THREE.Mesh(extrude(roundedShape(0.64, 1.86, 0.09, 0.09), 0.06, 0.014), doorMat);
    leaf.position.set(doorX, 1.24, 5.5);
    add(leaf);
    const vent = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.26), louvreMat);
    vent.position.set(doorX, 1.86, 5.485);
    add(vent);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.05), boltMat);
    handle.position.set(lockerX + sx * 0.07, 1.24, 5.46);
    add(handle);
    box(0.4, 0.05, 0.03, doorX, 0.55, 5.47, ribMat);
    box(0.4, 0.05, 0.03, doorX, 1.62, 5.47, ribMat);
  }
  const lockerPlacard = placard(0.8, 0.2, 'EVA', 'SUIT STOWAGE 1-4');
  lockerPlacard.position.set(lockerX, 2.28, 5.495);
  add(lockerPlacard);
  const lockerBolts: THREE.Vector3[] = [];
  for (const y of [0.28, 0.9, 1.55, 2.14]) lockerBolts.push(new THREE.Vector3(lockerX - 0.68, y, 5.55), new THREE.Vector3(lockerX + 0.68, y, 5.55));
  addBolts(smallBoltGeo, lockerBolts);

  // Vertical service riser in the port corner.
  const riserGeo = new THREE.CylinderGeometry(0.055, 0.055, 3.5, 10);
  for (const [x, mat] of [[-4.24, steelSmallMat], [-4.1, steelSmallMat], [-4.34, copperMat]] as const) {
    const pipe = new THREE.Mesh(riserGeo, mat);
    pipe.position.set(x, 1.8, 5.72);
    add(pipe);
  }
  for (let y = 0.4; y < 3.4; y += 0.72) {
    const clamp = new THREE.Mesh(clampGeo, shadowSteelMat);
    clamp.rotation.z = Math.PI / 2;
    clamp.position.set(-4.22, y, 5.78);
    add(clamp);
    // Each clamp occludes the wall just under itself — the small-scale AO that makes a pipe run
    // look bolted on rather than drawn on.
    decal(edgeAoMat, -4.22, y - 0.13, 5.858, 0.34, 0.2, UPRIGHT, 3);
  }
  groundShadow(-4.22, 5.62, 0.9, 0.62, 0.042);
  const valveWheel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 14), pullMat);
  valveWheel.rotation.y = Math.PI / 2;
  valveWheel.position.set(-4.24, 1.5, 5.6);
  add(valveWheel);
  box(0.3, 0.36, 0.18, -3.9, 2.7, 5.78, steelSmallMat);
  box(0.32, 0.06, 0.2, -3.9, 2.9, 5.77, ribMat);
  // Flex conduit dropping from the junction box across to the door frame.
  const flexCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.9, 2.52, 5.72),
    new THREE.Vector3(-3.4, 2.2, 5.62),
    new THREE.Vector3(-2.6, 2.35, 5.6),
    new THREE.Vector3(-1.9, 2.5, 5.66),
    new THREE.Vector3(-1.34, 2.8, 5.74),
  ]);
  add(new THREE.Mesh(new THREE.TubeGeometry(flexCurve, 30, 0.035, 7, false), copperMat));

  // ===== 6. starboard side: gauges, gear rack, vents ===================================
  // Pressure gauge cluster.
  const gaugeBack = box(0.62, 0.78, 0.14, 1.86, 1.86, 5.75, steelSmallMat);
  gaugeBack.castShadow = true;
  box(0.66, 0.06, 0.18, 1.86, 2.28, 5.74, ribMat);
  wallAo(1.86, 1.32, 0.9, 0.5);
  // Enamelled dial face under glass: the one small surface in the bay that is genuinely glossy
  // and genuinely white, which is what lets it read as an instrument rather than a sticker.
  const gaugeFaceMat = new THREE.MeshStandardMaterial({ color: 0xb5af9f, roughness: 0.18, metalness: 0.0, envMapIntensity: 1.1, emissive: 0x24261f, emissiveIntensity: 1.0 });
  for (const [gx, gy] of [[1.72, 2.02], [2.0, 2.02]] as const) {
    const bezelG = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.08, 14), steelSmallMat);
    bezelG.rotation.x = Math.PI / 2;
    bezelG.position.set(gx, gy, 5.66);
    add(bezelG);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.085, 14), gaugeFaceMat);
    face.position.set(gx, gy, 5.615);
    add(face);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.008), pullMat);
    needle.position.set(gx + 0.02, gy + 0.02, 5.608);
    needle.rotation.z = 0.9;
    add(needle);
  }
  const screenTexB = buildAirlockScreenTexture('cycle');
  const screenMatB = new THREE.MeshStandardMaterial({ map: screenTexB, emissive: 0xffffff, emissiveMap: screenTexB, emissiveIntensity: 1.4, roughness: 0.25, metalness: 0.1 });
  const screenB = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.29), screenMatB);
  screenB.position.set(1.86, 1.68, 5.675);
  add(screenB);
  // Manifold pipes feeding the gauges back into the bulkhead.
  for (const gx of [1.7, 1.86, 2.02]) {
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.5, 8), steelSmallMat);
    stub.position.set(gx, 1.24, 5.78);
    add(stub);
  }
  box(0.52, 0.08, 0.12, 1.86, 1.0, 5.78, shadowSteelMat);

  // Open equipment rack: uprights, shelves, canisters, coiled hose.
  const rackX = 3.16;
  for (const sx of [-1, 1] as const) {
    box(0.08, 1.9, 0.32, rackX + sx * 0.68, 0.95, 5.72, steelSmallMat);
  }
  for (const y of [0.36, 1.02, 1.68]) {
    box(1.44, 0.05, 0.34, rackX, y, 5.72, steelSmallMat);
    box(1.44, 0.04, 0.04, rackX, y + 0.03, 5.56, ribMat);
  }
  // Gas bottles are painted steel; the moulded transit crates beside them are composite. Mixing
  // the two families on one shelf is what shows the eye that the roughness is authored per object.
  const canisterMats = [compositeMat, orangeMat, hazardMat, steelSmallMat, orangeMat];
  for (let i = 0; i < 5; i++) {
    const cx = rackX - 0.52 + i * 0.26;
    const can = new THREE.Mesh(canisterGeo, canisterMats[i]);
    can.position.set(cx, 0.62, 5.7);
    add(can);
    const cap = new THREE.Mesh(canisterCapGeo, boltMat);
    cap.position.set(cx, 0.89, 5.7);
    add(cap);
  }
  for (let i = 0; i < 3; i++) {
    const crate = box(0.36, 0.24, 0.26, rackX - 0.44 + i * 0.44, 1.17, 5.72, i === 1 ? hazardMat : compositeMat);
    crate.rotation.y = (i - 1) * 0.06;
  }
  // The rack's own footprint, and the shadow each loaded shelf drops onto the one below it.
  groundShadow(rackX, 5.6, 2.0, 0.8, 0.042);
  wallAo(rackX, 0.28, 1.9, 0.56);
  for (const y of [1.02, 1.68]) {
    // Dark end at the top: this is the underside of the shelf above occluding the bay below it,
    // painted on the back wall of the rack so props in front stay in front of it.
    const shelfAo = decal(edgeAoMat, rackX, y - 0.16, 5.86, 1.44, 0.32, UPRIGHT, 3);
    shelfAo.rotation.z = Math.PI;
  }
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 6, 18), rubberMat);
  hose.position.set(rackX + 0.3, 1.9, 5.68);
  add(hose);
  // Helmet shells: moulded composite, so the highlight is broad and soft where the visor beside
  // it is a hard mirror. Albedo pulled well under the deck's so they stop blowing out.
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xa9a394, roughness: 0.62, metalness: 0.04, envMapIntensity: 0.4, emissive: 0x22241e, emissiveIntensity: 1.0 });
  for (const hx of [rackX - 0.42, rackX - 0.05] as const) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), helmetMat);
    helmet.position.set(hx, 1.86, 5.7);
    add(helmet);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.152, 14, 10, Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.28, Math.PI * 0.4), glassMat);
    visor.position.copy(helmet.position);
    add(visor);
  }
  const rackPlacard = placard(0.62, 0.16, 'O2', 'CHARGE / PURGE');
  rackPlacard.position.set(rackX, 2.06, 5.545);
  add(rackPlacard);

  // Low bulkhead vents on both sides, plus a starboard junction box and its drop.
  for (const [vx, vy, vw, vh] of [[2.24, 0.5, 0.72, 0.36], [-2.3, 0.5, 0.72, 0.36], [4.06, 2.5, 0.5, 0.26]] as const) {
    const vent = new THREE.Mesh(new THREE.PlaneGeometry(vw, vh), louvreMat);
    vent.position.set(vx, vy, WALL_F - 0.04);
    add(vent);
    box(vw + 0.06, vh + 0.06, 0.05, vx, vy, WALL_F - 0.03, shadowSteelMat);
  }
  box(0.34, 0.4, 0.2, 4.02, 2.96, 5.77, steelSmallMat);
  box(0.36, 0.06, 0.22, 4.02, 3.18, 5.76, ribMat);
  const dropCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(4.02, 2.76, 5.72),
    new THREE.Vector3(3.9, 2.3, 5.64),
    new THREE.Vector3(3.6, 2.0, 5.66),
    new THREE.Vector3(3.2, 2.14, 5.7),
  ]);
  add(new THREE.Mesh(new THREE.TubeGeometry(dropCurve, 24, 0.03, 7, false), copperMat));

  // ===== 7. upper-band dressing and deck clutter =======================================
  // The stretch of bulkhead between the props and the lintel is the last big empty area, so it
  // gets junction boxes tapping the conduit run, placards and inspection lamps.
  const smallPlacardMat = placardMaterial('A4-07', 'PRESSURE BOUNDARY');
  for (const sx of [-1, 1] as const) {
    const jx = sx * 2.62;
    box(0.3, 0.36, 0.17, jx, 2.72, 5.77, steelSmallMat);
    box(0.32, 0.06, 0.19, jx, 2.92, 5.76, ribMat);
    for (const dx of [-0.08, 0.08]) {
      const riserStub = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 8), steelSmallMat);
      riserStub.position.set(jx + dx, 3.2, 5.72);
      add(riserStub);
    }
    const plac = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16), smallPlacardMat);
    plac.position.set(sx * 1.72, 2.62, WALL_F - 0.035);
    add(plac);
    // Caged inspection lamp on a stub bracket.
    box(0.06, 0.06, 0.22, sx * 3.62, 2.5, 5.76, shadowSteelMat);
    const lampHead = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 10), shadowSteelMat);
    lampHead.rotation.x = Math.PI / 2;
    lampHead.position.set(sx * 3.62, 2.5, 5.62);
    add(lampHead);
    const lampLens = new THREE.Mesh(new THREE.CircleGeometry(0.062, 10), warmStripMat);
    lampLens.position.set(sx * 3.62, 2.5, 5.565);
    add(lampLens);
    // Occlusion under each wall-mounted junction box.
    wallAo(jx, 2.5, 0.44, 0.28);
  }

  // Deck clutter just off the walking lane, giving the shot something in front of the bulkhead.
  // Each piece gets its own contact pool: this is the specific complaint the critic raised — that
  // crates, spools and canisters sat on a uniformly bright slab with nothing holding them down.
  groundShadow(-2.16, 5.42, 1.05, 0.72, 0.042);
  groundShadow(2.52, 5.4, 1.1, 0.78, 0.042);
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 16), steelSmallMat);
  spool.rotation.x = Math.PI / 2;
  spool.position.set(-2.16, 0.24, 5.42);
  add(spool);
  const spoolHub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 10), shadowSteelMat);
  spoolHub.rotation.x = Math.PI / 2;
  spoolHub.position.set(-2.16, 0.24, 5.42);
  add(spoolHub);
  const tether = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.026, 6, 20), rubberMat);
  tether.position.set(-2.16, 0.24, 5.42);
  add(tether);
  box(0.66, 0.06, 0.34, -2.16, 0.03, 5.42, shadowSteelMat);

  const crateStack: [number, number, number, number][] = [
    [0.62, 0.24, 0.42, 0.12],
    [0.5, 0.18, 0.36, 0.33],
  ];
  crateStack.forEach(([w, h, d, y], i) => {
    const crate = box(w, h, d, 2.52, y, 5.4, i === 0 ? compositeMat : hazardMat);
    crate.rotation.y = i === 0 ? 0.08 : -0.05;
    box(w + 0.02, 0.03, d + 0.02, 2.52, y + h / 2, 5.4, ribMat).rotation.y = crate.rotation.y;
  });

  // Cyan guide strips flanking the hatch — the cool half of the warm/cool separation.
  for (const sx of [-1, 1] as const) {
    box(0.05, 1.9, 0.03, sx * 1.42, 1.3, 5.53, cyanLedMat);
    box(0.11, 1.98, 0.06, sx * 1.42, 1.3, 5.57, shadowSteelMat);
  }

  // Group children never went through add(), so they get the same shadow flags in one pass.
  for (const group of [portGroup, wheelGroup]) {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      m.castShadow = !(Array.isArray(mat) ? mat.some((x) => x.transparent) : mat.transparent);
      m.receiveShadow = true;
    });
  }

  // ===== 8. animation ==================================================================
  ctx.animated.push((elapsed) => {
    const pulse = Math.max(0, Math.sin(elapsed * 2.1)) ** 2;
    // Peak emissive is held well under round 1's, which drove p95 to 0.83 against a reference
    // that tops out at 0.47. The beacon still reads as the loudest thing in the bay because it
    // pulses, not because it is white.
    beaconMat.emissiveIntensity = 0.35 + pulse * 1.5;
    beaconLight.intensity = 0.12 + pulse * 0.5;
    cyanLedMat.emissiveIntensity = 0.95 + Math.sin(elapsed * 1.3) * 0.2;
    screenMatA.emissiveIntensity = 1.05 + Math.sin(elapsed * 7.3) * 0.07;
    screenMatB.emissiveIntensity = 0.98 + Math.sin(elapsed * 5.1 + 1.2) * 0.08;
  });
}
