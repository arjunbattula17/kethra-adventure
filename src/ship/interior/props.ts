import * as THREE from 'three';
import {
  buildStencilPlacardTexture,
  buildFirstAidTexture,
  buildWarningStripeTexture,
} from '../ShipTextures';
import {
  buildCratePanelTexture,
  buildLockerDoorTexture,
  buildCanisterLabelTexture,
  buildReadoutTexture,
  buildToolBoardTexture,
  buildRackUnitTexture,
  buildContactShadowTexture,
  buildStreakTexture,
  applySurface,
} from './propsTextures';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D, ROOM_H } from './ctx';

/**
 * Set dressing. Everything here is a bolted-on object: cargo, storage, maintenance hardware,
 * conduit and safety gear. Two rules drive the layout:
 *
 *  - No wall or floor region a metre across is left empty, but the walking lane down the middle
 *    (|x| < 2.2, from the spawn at z=+4 to the console at z=-3.6) stays completely clear, and
 *    nothing sits in open floor at eye height.
 *  - Repeated small parts — bolt heads, louvre slats, pipe clamps, tray rungs, couplings — go
 *    through InstancedMesh batches, so density costs vertices rather than draw calls.
 */

/** Inner face of the side walls (the wall shell is 0.2 thick, centred on ±ROOM_W/2). */
const WALL_X = ROOM_W / 2 - 0.1;
const BACK_Z = -ROOM_D / 2 + 0.1;
const FRONT_Z = ROOM_D / 2 - 0.1;

// ===========================================================================================
// geometry / material kit
// ===========================================================================================

const chamferCache = new Map<string, THREE.BufferGeometry>();

/**
 * Box with a real chamfer on every edge. Sharp boxes are the loudest tell of untreated blockout
 * geometry — a 2 cm chamfer catches a highlight and breaks up every prop silhouette. Extruded
 * along local Z, centred on the origin, cached by dimensions so repeated props share one buffer.
 */
function chamferBox(w: number, h: number, d: number, bevel = 0.022): THREE.BufferGeometry {
  const b = Math.min(bevel, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${b.toFixed(3)}`;
  const hit = chamferCache.get(key);
  if (hit) return hit;

  const hw = w / 2 - b;
  const hh = h / 2 - b;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  const depth = Math.max(0.002, d - b * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  chamferCache.set(key, geo);
  return geo;
}

const cylCache = new Map<string, THREE.CylinderGeometry>();
function cyl(rt: number, rb: number, h: number, seg = 12): THREE.CylinderGeometry {
  const key = `${rt.toFixed(3)}|${rb.toFixed(3)}|${h.toFixed(3)}|${seg}`;
  const hit = cylCache.get(key);
  if (hit) return hit;
  const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
  cylCache.set(key, geo);
  return geo;
}

const planeCache = new Map<string, THREE.PlaneGeometry>();
function plane(w: number, h: number): THREE.PlaneGeometry {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}`;
  const hit = planeCache.get(key);
  if (hit) return hit;
  const geo = new THREE.PlaneGeometry(w, h);
  planeCache.set(key, geo);
  return geo;
}

/** Collects transforms for one repeated part and emits them all as a single InstancedMesh. */
class Batch {
  private items: THREE.Matrix4[] = [];
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.Material;
  private readonly shadows: boolean;
  private readonly order: number;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, shadows = true, order = 0) {
    this.geo = geo;
    this.mat = mat;
    this.shadows = shadows;
    this.order = order;
  }

  add(
    x: number, y: number, z: number,
    rx = 0, ry = 0, rz = 0,
    sx = 1, sy = 1, sz = 1,
  ): void {
    const m = new THREE.Matrix4();
    m.compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz),
    );
    this.items.push(m);
  }

  flush(scene: THREE.Scene): void {
    if (this.items.length === 0) return;
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, this.items.length);
    for (let i = 0; i < this.items.length; i++) mesh.setMatrixAt(i, this.items[i]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = this.shadows;
    mesh.renderOrder = this.order;
    scene.add(mesh);
  }
}

type Mats = ReturnType<typeof buildMaterials>;

/**
 * Material kit. Every entry is a *different kind of stuff*, not one shader with a different
 * colour typed in, so each has to answer three questions differently:
 *
 *  - metalness is close to binary in reality. Bare and plated metal is 1.0, a thick conversion
 *    coating pulls it a little under, and paint, rubber, phenolic and glass are dielectrics that
 *    sit flat at 0. The old kit smeared everything between 0.16 and 0.88, which is exactly the
 *    setting that makes every surface read as the same tinted plastic.
 *  - roughness spans the full useful range — 0.08 for a gauge lens up to 0.97 for a caster —
 *    and every entry that stands for a real weathered surface carries a roughnessMap, so none of
 *    them hold one flat value across a face. The lenses are the deliberate exceptions: glass and
 *    the LED covers are moulded smooth and get no map at all.
 *  - a tiling detail/normal set gives each family its own micro-structure: brushed grain on
 *    steel, orange peel on paint, spangle on galvanised frame stock, pebbling on rubber.
 *
 * Albedo is also pulled down from the previous pass. The measured highlight ceiling was well
 * above the reference, and hot base colour is the wrong thing to carry brightness — emissives
 * are. Nothing here is left near-black either: the darkest base is 0x2b3138, the bottom of the
 * brief's shadowed-steel band, so shadowed props still hold material instead of crushing out.
 */
function buildMaterials() {
  const std = (
    color: number,
    roughness: number,
    metalness: number,
    emissive: number,
    emissiveIntensity: number,
  ) => new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });

  const hazardTex = buildWarningStripeTexture('amber');
  hazardTex.repeat.set(6, 1);

  // Bare rolled steel — mid grey, fully metallic, directional brush grain.
  const steel = std(0x6f777f, 0.42, 1.0, 0x151a20, 0.16);
  applySurface(steel, 'steel', 3);

  // Blued / phosphated frame steel: darker, rougher, and the one that has to stay off the floor
  // of the value range. The phosphate coat is dielectric enough to keep some diffuse response,
  // which is what stops it going pure black where the key light does not reach; galvanised
  // spangle breaks its shadow side into readable facets rather than one dead field.
  const steelDark = std(0x424a53, 0.58, 0.86, 0x1a212a, 0.3);
  applySurface(steelDark, 'galv', 4);

  // Machined / polished fittings — handles, latches, vise jaws. The shiniest metal in the kit.
  const steelLight = std(0x848d97, 0.24, 1.0, 0x1b222a, 0.14);
  applySurface(steelLight, 'brushed', 5);

  // Painted enamel over steel. Dielectric, high roughness, rub-polished patches in the map.
  const paintBone = std(0xa9a396, 0.72, 0.0, 0x201e1a, 0.2);
  applySurface(paintBone, 'paint', 3);
  const paintGrey = std(0x646a72, 0.76, 0.0, 0x161a20, 0.2);
  applySurface(paintGrey, 'paint', 3);
  const paintOlive = std(0x4c5647, 0.82, 0.0, 0x141813, 0.22);
  applySurface(paintOlive, 'paint', 3);
  // Safety red is sprayed thicker and buffed — the one paint with a visible sheen.
  const paintRed = std(0x9c3d27, 0.5, 0.0, 0x24100a, 0.28);
  applySurface(paintRed, 'paint', 4);

  // Moulded rubber: hose, casters, cable jacket, mats. Dead matte, heavy fine relief.
  const rubber = std(0x2f333a, 0.97, 0.0, 0x14171b, 0.24);
  applySurface(rubber, 'rubber', 5);

  // Worn phenolic / composite — crate skids and tray stock. Thirsty, fibrous, no specular.
  const composite = std(0x5a5346, 0.9, 0.0, 0x18160f, 0.24);
  applySurface(composite, 'composite', 3);

  // Copper flex conduit: warm, fully metallic, low roughness so it stays a small bright accent.
  const copper = std(0x99652f, 0.3, 1.0, 0x1d1206, 0.2);
  applySurface(copper, 'brushed', 4);

  // Gauge glass and lens covers — the only near-mirror in the kit, and a dielectric.
  const glass = std(0x2b3138, 0.08, 0.0, 0x101820, 0.35);

  const hazard = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.66, metalness: 0.0, emissive: 0x1a1408, emissiveIntensity: 0.3 });
  hazard.roughnessMap = paintRed.roughnessMap;
  hazard.normalMap = paintRed.normalMap;
  hazard.normalScale = paintRed.normalScale.clone();

  return {
    steel,
    steelDark,
    steelLight,
    paintBone,
    paintGrey,
    paintOlive,
    paintRed,
    rubber,
    composite,
    copper,
    glass,
    hazard,
    ledCyan: std(0x4fd8f0, 0.3, 0.0, 0x4fd8f0, 2.4),
    ledAmber: std(0xffd9a0, 0.3, 0.0, 0xffd9a0, 2.2),
    ledRed: std(0xe0552f, 0.3, 0.0, 0xe0552f, 2.2),
  };
}

interface Kit {
  scene: THREE.Scene;
  m: Mats;
  /** Every mesh `place()` added, for the auto-instancing pass at the end of the build. */
  pool: THREE.Mesh[];
  bolt: Batch;
  slat: Batch;
  clamp: Batch;
  rung: Batch;
  coupling: Batch;
  jbBody: Batch;
  jbPlate: Batch;
  jbStub: Batch;
  jbCap: Batch;
  /** Baked contact-occlusion quads on the deck — one instanced draw for the whole room. */
  contact: Batch;
  /** Drip / grime decals, one batch per stain tint. */
  streaks: Batch[];
}

function place(
  k: Kit, geo: THREE.BufferGeometry, mat: THREE.Material,
  x: number, y: number, z: number,
  rx = 0, ry = 0, rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  // Label and readout planes sit flush on the housing they belong to; letting them cast would
  // only self-shadow-acne their own backing plate, so they receive light and never occlude it.
  mesh.castShadow = geo.type !== 'PlaneGeometry';
  mesh.receiveShadow = true;
  k.scene.add(mesh);
  k.pool.push(mesh);
  return mesh;
}

/**
 * Baked contact occlusion under a floor-standing prop. `w` and `d` are the prop footprint; the
 * decal is drawn wider so the penumbra falls outside the silhouette and the prop reads as
 * sitting *in* the deck rather than hovering a centimetre above it.
 */
function groundShadow(k: Kit, x: number, z: number, w: number, d: number): void {
  k.contact.add(x, 0.012, z, -Math.PI / 2, 0, 0, w * 1.85, d * 1.85, 1);
}

/** Multiply-blended decal material: white texels are a no-op, so the quad has no visible border. */
function decalMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * Drip / corrosion streak on a wall face, hung from a joint that would actually leak. Wear only
 * means anything when it points at a cause, so every call site sits under a valve, a coupling,
 * a conduit drop or a vent — never sprayed across clean wall for texture's sake.
 */
function grimeDecal(
  k: Kit, x: number, yTop: number, z: number, ry: number,
  w: number, h: number, variant: number,
): void {
  k.streaks[variant % k.streaks.length].add(x, yTop - h / 2, z, 0, ry, 0, w, h, 1);
}

function wallStreak(
  k: Kit, wallX: number, sign: 1 | -1,
  yTop: number, z: number, w: number, h: number, variant: number,
): void {
  grimeDecal(k, wallX - sign * 0.012, yTop, z, faceRy(sign), w, h, variant);
}

/**
 * Collapses every repeated (geometry, material) pair into one InstancedMesh. Props are authored
 * as individual meshes for readability; this pass is what keeps the density affordable — the
 * chamfered plates, flanges, feet and fasteners repeat heavily across the set.
 *
 * Meshes whose identity matters afterwards (status LEDs, placards) each own a unique material,
 * so they never reach the threshold and stay as real meshes.
 */
function autoInstance(k: Kit): void {
  const groups = new Map<string, THREE.Mesh[]>();
  for (const mesh of k.pool) {
    if (Array.isArray(mesh.material)) continue;
    const key = `${mesh.geometry.uuid}|${mesh.material.uuid}`;
    const group = groups.get(key);
    if (group) group.push(mesh);
    else groups.set(key, [mesh]);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const inst = new THREE.InstancedMesh(group[0].geometry, group[0].material as THREE.Material, group.length);
    for (let i = 0; i < group.length; i++) {
      group[i].updateMatrix();
      inst.setMatrixAt(i, group[i].matrix);
      k.scene.remove(group[i]);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    inst.castShadow = group[0].castShadow;
    inst.receiveShadow = true;
    k.scene.add(inst);
  }
}

/**
 * World position of a prop-local (lx, lz) offset, for a prop centred at (x, z) and turned by ry.
 * Props are authored facing their own +Z, so `faceRy(sign)` turns them to face into the room.
 */
function local(x: number, z: number, lx: number, lz: number, ry: number): [number, number] {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

/** Yaw that makes a prop on the side wall at `sign * WALL_X` face into the room. */
function faceRy(sign: 1 | -1): number {
  return sign > 0 ? -Math.PI / 2 : Math.PI / 2;
}

type Face = 'px' | 'nx' | 'pz' | 'nz' | 'py';
const FACE_ROT: Record<Face, [number, number, number]> = {
  px: [0, 0, -Math.PI / 2],
  nx: [0, 0, Math.PI / 2],
  pz: [Math.PI / 2, 0, 0],
  nz: [-Math.PI / 2, 0, 0],
  py: [0, 0, 0],
};

/** Which world face a prop's front (+local Z) ends up on after a yaw of ry. */
function faceForRy(ry: number): Face {
  const a = ((ry % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI / 4 || a > (7 * Math.PI) / 4) return 'pz';
  if (a < (3 * Math.PI) / 4) return 'px';
  if (a < (5 * Math.PI) / 4) return 'nz';
  return 'nx';
}

/** Rotation putting a Y-axis cylinder (LED lens, plug) normal to a face turned by ry. */
function discRot(ry: number): [number, number, number] {
  return Math.abs(Math.sin(ry)) > 0.5 ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
}

/** Four bolt heads at the corners of a w x h rectangle lying on the given face plane. */
function boltRect(k: Kit, face: Face, cx: number, cy: number, cz: number, w: number, h: number): void {
  const [rx, ry, rz] = FACE_ROT[face];
  for (const su of [-1, 1]) {
    for (const sv of [-1, 1]) {
      let x = cx;
      let y = cy;
      let z = cz;
      if (face === 'px' || face === 'nx') {
        z += (su * w) / 2;
        y += (sv * h) / 2;
      } else if (face === 'pz' || face === 'nz') {
        x += (su * w) / 2;
        y += (sv * h) / 2;
      } else {
        x += (su * w) / 2;
        z += (sv * h) / 2;
      }
      k.bolt.add(x, y, z, rx, ry, rz);
    }
  }
}

/** Evenly spaced bolt row along one axis. */
function boltRow(
  k: Kit, face: Face,
  x0: number, y0: number, z0: number,
  axis: 'x' | 'y' | 'z', length: number, count: number,
): void {
  const [rx, ry, rz] = FACE_ROT[face];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * length;
    k.bolt.add(
      x0 + (axis === 'x' ? t : 0),
      y0 + (axis === 'y' ? t : 0),
      z0 + (axis === 'z' ? t : 0),
      rx, ry, rz,
    );
  }
}

// ===========================================================================================
// props
// ===========================================================================================

/**
 * Supply crate: chamfered shell, skid base, lid rim, corner posts, stencilled face panel and
 * latches. Authored facing local +Z.
 */
function buildCrate(
  k: Kit, faceTex: THREE.Texture, bodyMat: THREE.Material,
  x: number, yBase: number, z: number, ry: number,
  w: number, h: number, d: number,
): void {
  const cy = yBase + h / 2;
  place(k, chamferBox(w, h, d, 0.026), bodyMat, x, cy, z, 0, ry, 0);
  place(k, chamferBox(w * 0.94, 0.07, d * 0.94, 0.014), k.m.composite, x, yBase + 0.035, z, 0, ry, 0);
  place(k, chamferBox(w * 1.03, 0.055, d * 1.03, 0.014), k.m.steelDark, x, yBase + h - 0.01, z, 0, ry, 0);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [px, pz] = local(x, z, sx * (w / 2 - 0.024), sz * (d / 2 - 0.024), ry);
      place(k, chamferBox(0.05, h * 0.94, 0.05, 0.01), k.m.steelDark, px, cy, pz, 0, ry, 0);
    }
  }

  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.82, metalness: 0.18, emissive: 0x1c1a16, emissiveIntensity: 0.3 });
  const [fx, fz] = local(x, z, 0, d / 2 + 0.008, ry);
  place(k, plane(w * 0.78, h * 0.72), faceMat, fx, cy, fz, 0, ry, 0);

  for (const sx of [-1, 1]) {
    const [lx, lz] = local(x, z, sx * w * 0.3, d / 2 + 0.022, ry);
    place(k, chamferBox(0.09, 0.11, 0.04, 0.008), k.m.steelLight, lx, yBase + h - 0.075, lz, 0, ry, 0);
  }

  const [bx, bz] = local(x, z, 0, d / 2 + 0.014, ry);
  boltRect(k, faceForRy(ry), bx, cy, bz, w * 0.86, h * 0.78);

  if (yBase < 0.05) groundShadow(k, x, z, Math.max(w, d), Math.max(w, d));
}

/** Pressurised canister rack: welded frame, four bottles with domed shoulders and valve heads. */
function buildCanisterRack(k: Kit, x: number, z: number, ry: number): void {
  const frameW = 1.05;
  const frameD = 0.4;
  const frameH = 1.15;
  const face = faceForRy(ry);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [px, pz] = local(x, z, (sx * frameW) / 2, (sz * frameD) / 2, ry);
      place(k, chamferBox(0.055, frameH, 0.055, 0.01), k.m.steelDark, px, frameH / 2, pz, 0, ry, 0);
    }
  }
  for (const ly of [0.18, 0.72, 1.12]) {
    const [px, pz] = local(x, z, 0, frameD / 2, ry);
    place(k, chamferBox(frameW, 0.05, 0.05, 0.01), k.m.steelDark, px, ly, pz, 0, ry, 0);
    boltRect(k, face, px, ly, pz, frameW * 0.85, 0.02);
    const [qx, qz] = local(x, z, 0, -frameD / 2, ry);
    place(k, chamferBox(frameW, 0.05, 0.05, 0.01), k.m.steelDark, qx, ly, qz, 0, ry, 0);
  }

  const kinds: ('o2' | 'fuel' | 'coolant')[] = ['o2', 'fuel', 'coolant', 'o2'];
  for (let i = 0; i < 4; i++) {
    const [bx, bz] = local(x, z, -frameW / 2 + 0.16 + i * 0.24, 0, ry);
    const bodyMat = i % 2 === 0 ? k.m.paintGrey : k.m.steel;
    place(k, cyl(0.1, 0.1, 0.92, 14), bodyMat, bx, 0.5, bz);
    place(k, new THREE.SphereGeometry(0.1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat, bx, 0.96, bz);
    place(k, cyl(0.028, 0.034, 0.1, 8), k.m.steelLight, bx, 1.04, bz);
    place(k, cyl(0.055, 0.055, 0.022, 10), k.m.copper, bx, 1.1, bz);
    place(k, cyl(0.105, 0.105, 0.03, 14), k.m.steelDark, bx, 0.06, bz);

    const labelMat = new THREE.MeshStandardMaterial({
      map: buildCanisterLabelTexture(kinds[i]),
      roughness: 0.75,
      metalness: 0.2,
      emissive: 0x151a1f,
      emissiveIntensity: 0.35,
    });
    place(k, cyl(0.104, 0.104, 0.17, 14), labelMat, bx, 0.62, bz);
  }

  const [sx2, sz2] = local(x, z, 0, frameD / 2 - 0.03, ry);
  place(k, chamferBox(frameW * 0.94, 0.05, 0.03, 0.008), k.m.hazard, sx2, 0.82, sz2, 0, ry, 0);

  groundShadow(k, x, z, frameW * 0.95, frameW * 0.75);
}

/** Locker bank: carcass, doors with louvre/ID artwork, handles, hinges and stowage on top. */
function buildLockerBank(k: Kit, x: number, z: number, ry: number, labels: string[]): void {
  const doorW = 0.56;
  const h = 1.88;
  const d = 0.46;
  const w = doorW * labels.length;
  const face = faceForRy(ry);

  place(k, chamferBox(w, h, d, 0.03), k.m.paintBone, x, h / 2 + 0.06, z, 0, ry, 0);
  place(k, chamferBox(w * 0.98, 0.12, d * 0.96, 0.015), k.m.steelDark, x, 0.06, z, 0, ry, 0);
  place(k, chamferBox(w + 0.05, 0.06, d + 0.05, 0.015), k.m.steel, x, h + 0.1, z, 0, ry, 0);

  for (let i = 0; i < labels.length; i++) {
    const lx = -w / 2 + doorW / 2 + i * doorW;
    const [dx, dz] = local(x, z, lx, d / 2 + 0.012, ry);
    place(k, chamferBox(doorW - 0.035, h - 0.16, 0.03, 0.012), k.m.paintGrey, dx, h / 2 + 0.06, dz, 0, ry, 0);

    const mat = new THREE.MeshStandardMaterial({
      map: buildLockerDoorTexture(labels[i]),
      roughness: 0.7,
      metalness: 0.35,
      emissive: 0x1a1f25,
      emissiveIntensity: 0.32,
    });
    const [fx, fz] = local(x, z, lx, d / 2 + 0.034, ry);
    place(k, plane(doorW - 0.06, h - 0.2), mat, fx, h / 2 + 0.06, fz, 0, ry, 0);

    const [hx, hz] = local(x, z, lx + doorW * 0.34, d / 2 + 0.05, ry);
    place(k, cyl(0.018, 0.018, 0.3, 8), k.m.steelLight, hx, 1.06, hz);
    // Hand grease around the handle: a small dark halo that trails down the door under it.
    const [sx3, sz3] = local(x, z, lx + doorW * 0.32, d / 2 + 0.038, ry);
    grimeDecal(k, sx3, 1.3, sz3, ry, 0.26, 0.62, 0);
    for (const hy of [0.42, 1.06, 1.7]) {
      const [gx, gz] = local(x, z, lx - doorW * 0.46, d / 2 + 0.022, ry);
      place(k, cyl(0.022, 0.022, 0.08, 8), k.m.steelDark, gx, hy, gz);
    }
    const [bx, bz] = local(x, z, lx, d / 2 + 0.02, ry);
    boltRect(k, face, bx, h / 2 + 0.06, bz, doorW - 0.14, h - 0.32);
  }

  // Stowage on top: a rolled mat and a stacked case — depth layering above eye line.
  const alongZ = Math.abs(Math.sin(ry)) > 0.5;
  const [tx, tz] = local(x, z, -w * 0.22, 0, ry);
  place(k, cyl(0.11, 0.11, w * 0.4, 10), k.m.rubber, tx, h + 0.24, tz, alongZ ? Math.PI / 2 : 0, 0, alongZ ? 0 : Math.PI / 2);
  const [cx2, cz2] = local(x, z, w * 0.26, 0, ry);
  place(k, chamferBox(0.36, 0.24, 0.32, 0.02), k.m.paintOlive, cx2, h + 0.25, cz2, 0, ry, 0);
  place(k, chamferBox(0.38, 0.03, 0.34, 0.008), k.m.steelDark, cx2, h + 0.375, cz2, 0, ry, 0);

  groundShadow(k, x, z, Math.abs(Math.sin(ry)) > 0.5 ? d : w, Math.abs(Math.sin(ry)) > 0.5 ? w : d);
}

/**
 * Maintenance workbench against a side wall: framed top, lower shelf, perforated tool board,
 * vise, parts trays and a warm task lamp. Length runs along Z, depth along X.
 */
function buildWorkbench(k: Kit, ctx: InteriorCtx, wallX: number, z: number, sign: 1 | -1): void {
  const inward = -sign;
  const len = 2.1;
  const depth = 0.66;
  const topY = 0.92;
  const bx = wallX + inward * 0.4;

  place(k, chamferBox(depth, 0.055, len, 0.014), k.m.steelLight, bx, topY, z);
  place(k, chamferBox(depth * 0.96, 0.06, len * 0.98, 0.012), k.m.steelDark, bx, topY - 0.06, z);
  place(k, chamferBox(depth * 0.9, 0.04, len * 0.94, 0.01), k.m.steel, bx, 0.28, z);
  boltRow(k, 'py', bx, topY + 0.032, z, 'z', len * 0.88, 7);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = bx + (sx * (depth - 0.11)) / 2;
      const pz = z + (sz * (len - 0.16)) / 2;
      place(k, chamferBox(0.06, topY - 0.09, 0.06, 0.012), k.m.steelDark, px, (topY - 0.09) / 2 + 0.03, pz);
      place(k, chamferBox(0.12, 0.03, 0.12, 0.006), k.m.steel, px, 0.015, pz);
    }
  }

  // Tool board bolted to the wall behind the bench.
  const boardMat = new THREE.MeshStandardMaterial({
    map: buildToolBoardTexture(),
    roughness: 0.8,
    metalness: 0.25,
    emissive: 0x1a1e24,
    emissiveIntensity: 0.32,
  });
  place(k, chamferBox(0.03, 0.9, len * 0.96, 0.008), k.m.steelDark, wallX + inward * 0.03, 1.62, z);
  place(k, plane(len * 0.9, 0.8), boardMat, wallX + inward * 0.052, 1.62, z, 0, inward > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
  boltRect(k, inward > 0 ? 'px' : 'nx', wallX + inward * 0.05, 1.62, z, len * 0.94, 0.86);

  // Bench vise.
  const vz = z + len * 0.35;
  place(k, chamferBox(0.16, 0.1, 0.2, 0.015), k.m.steelDark, bx, topY + 0.08, vz);
  place(k, chamferBox(0.2, 0.14, 0.05, 0.012), k.m.steelLight, bx, topY + 0.11, vz + 0.11);
  place(k, cyl(0.014, 0.014, 0.28, 8), k.m.steelLight, bx, topY + 0.12, vz - 0.14, 0, 0, Math.PI / 2);

  // Parts trays, a toolbox on the shelf, and stock leaning on the end.
  const trayMats = [k.m.paintRed, k.m.paintGrey, k.m.paintOlive];
  for (let i = 0; i < 3; i++) {
    place(k, chamferBox(0.2, 0.07, 0.17, 0.012), trayMats[i], bx + inward * 0.12, topY + 0.06, z - len * 0.32 + i * 0.2);
  }
  place(k, chamferBox(0.34, 0.19, 0.24, 0.018), k.m.paintRed, bx, 0.42, z - 0.1);
  place(k, cyl(0.012, 0.012, 0.2, 6), k.m.steelLight, bx, 0.54, z - 0.1, 0, 0, Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    place(k, cyl(0.026, 0.026, 1.5, 6), k.m.steel, bx - inward * 0.16 + i * 0.05, 0.72, z - len / 2 - 0.08 + i * 0.04, 0.1, 0, inward * 0.16);
  }

  // Task lamp — post, arm, shade, and a small warm practical under it.
  const lz = z + len * 0.28;
  place(k, cyl(0.05, 0.06, 0.03, 10), k.m.steelDark, bx - inward * 0.2, topY + 0.04, lz);
  place(k, cyl(0.016, 0.016, 0.44, 8), k.m.steelDark, bx - inward * 0.2, topY + 0.25, lz);
  place(k, cyl(0.014, 0.014, 0.36, 8), k.m.steelDark, bx - inward * 0.09, topY + 0.46, lz, 0, 0, inward * (Math.PI / 2 - 0.4));
  const shadeX = bx + inward * 0.04;
  place(k, cyl(0.05, 0.12, 0.12, 12), k.m.steelDark, shadeX, topY + 0.38, lz, 0, 0, inward * 0.3);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffd9a0, emissiveIntensity: 2.6, roughness: 0.4 });
  place(k, cyl(0.055, 0.055, 0.012, 12), bulbMat, shadeX + inward * 0.02, topY + 0.32, lz, 0, 0, inward * 0.3);

  const lamp = new THREE.PointLight(0xffd9a0, 3.0, 3.2, 2);
  lamp.position.set(shadeX + inward * 0.05, topY + 0.28, lz);
  // Deliberately not a shadow caster: a point light costs six shadow-map faces, and with every
  // prop now flagged castShadow that would re-render the whole set six more times for one bench
  // corner. The baked contact decals buy the grounding far more cheaply.
  k.scene.add(lamp);

  groundShadow(k, bx, z, depth * 1.1, len * 0.95);
  // Oil that has run off the benchtop and pooled against the wall skirting behind it.
  wallStreak(k, wallX, sign, 0.9, z + len * 0.12, 0.7, 0.86, 0);

  // Faint, slow flicker so the practical reads as a working fixture, not a painted highlight.
  const base = lamp.intensity;
  ctx.animated.push((elapsed) => {
    const f = 0.9 + Math.sin(elapsed * 2.3) * 0.05 + Math.sin(elapsed * 11.7) * 0.03;
    lamp.intensity = base * f;
    bulbMat.emissiveIntensity = 2.6 * f;
  });
}

/** Equipment rack: chassis, five rack units with vent artwork, live LEDs, cable loom out the top. */
function buildRelayRack(k: Kit, ctx: InteriorCtx, x: number, z: number, ry: number): void {
  const w = 1.0;
  const h = 1.94;
  const d = 0.56;
  const face = faceForRy(ry);
  const [ledRx, ledRy, ledRz] = discRot(ry);

  place(k, chamferBox(w, h, d, 0.028), k.m.paintGrey, x, h / 2 + 0.07, z, 0, ry, 0);
  place(k, chamferBox(w * 0.98, 0.14, d * 0.94, 0.016), k.m.steelDark, x, 0.07, z, 0, ry, 0);
  place(k, chamferBox(w + 0.06, 0.07, d + 0.06, 0.016), k.m.steel, x, h + 0.11, z, 0, ry, 0);
  for (const sx of [-1, 1]) {
    const [px, pz] = local(x, z, sx * (w / 2 - 0.02), d / 2 - 0.03, ry);
    place(k, chamferBox(0.06, h - 0.1, 0.08, 0.012), k.m.steelDark, px, h / 2 + 0.07, pz, 0, ry, 0);
    const [qx, qz] = local(x, z, sx * (w / 2 - 0.02), d / 2 + 0.02, ry);
    boltRow(k, face, qx, h / 2 + 0.07, qz, 'y', h - 0.4, 7);
  }

  const labels = ['PWR-A', 'NAV BUS', 'COMMS', 'LIFE SUP', 'AUX'];
  for (let i = 0; i < labels.length; i++) {
    const uy = 0.36 + i * 0.32;
    const [ux, uz] = local(x, z, 0, d / 2 + 0.018, ry);
    place(k, chamferBox(w - 0.16, 0.26, 0.05, 0.01), k.m.steelDark, ux, uy, uz, 0, ry, 0);
    const mat = new THREE.MeshStandardMaterial({
      map: buildRackUnitTexture(labels[i]),
      roughness: 0.6,
      metalness: 0.4,
      emissive: 0x1c2229,
      emissiveIntensity: 0.45,
    });
    const [px, pz] = local(x, z, 0, d / 2 + 0.048, ry);
    place(k, plane(w - 0.2, 0.22), mat, px, uy, pz, 0, ry, 0);

    const color = i === 3 ? 0xe0552f : 0x4fd8f0;
    const ledMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.35 });
    const [ex, ez] = local(x, z, w / 2 - 0.13, d / 2 + 0.058, ry);
    const led = place(k, cyl(0.014, 0.014, 0.012, 8), ledMat, ex, uy + 0.07, ez, ledRx, ledRy, ledRz);
    ctx.statusLights.push({ mesh: led, material: ledMat, phase: i * 1.3, onIntensity: 2.4 });
  }

  // Cable loom from the rack top up toward the wall conduit run.
  const [c0x, c0z] = local(x, z, 0.18, 0, ry);
  for (let i = 0; i < 3; i++) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(c0x, h + 0.14, c0z + i * 0.06 - 0.06),
      new THREE.Vector3(c0x + Math.sign(x) * -0.1, h + 0.55, c0z + i * 0.05),
      new THREE.Vector3(x + Math.sign(x) * 0.24, 2.9, z + i * 0.07 - 0.07),
    ]);
    place(k, new THREE.TubeGeometry(curve, 12, 0.018, 5, false), k.m.rubber, 0, 0, 0);
  }

  groundShadow(k, x, z, Math.abs(Math.sin(ry)) > 0.5 ? d : w, Math.abs(Math.sin(ry)) > 0.5 ? w : d);
}

/** Rolling tool chest: drawer stack with recessed pulls, casters and lid clutter. */
function buildToolChest(k: Kit, x: number, z: number, ry: number): void {
  const w = 0.72;
  const h = 0.88;
  const d = 0.5;
  place(k, chamferBox(w, h, d, 0.024), k.m.paintRed, x, h / 2 + 0.08, z, 0, ry, 0);
  place(k, chamferBox(w + 0.04, 0.05, d + 0.04, 0.012), k.m.steelDark, x, h + 0.1, z, 0, ry, 0);

  for (let i = 0; i < 4; i++) {
    const dy = 0.22 + i * 0.18;
    const [dx, dz] = local(x, z, 0, d / 2 + 0.014, ry);
    place(k, chamferBox(w - 0.08, 0.15, 0.03, 0.008), k.m.steelDark, dx, dy, dz, 0, ry, 0);
    const [hx, hz] = local(x, z, 0, d / 2 + 0.04, ry);
    place(k, chamferBox(w * 0.5, 0.028, 0.03, 0.006), k.m.steelLight, hx, dy, hz, 0, ry, 0);
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [px, pz] = local(x, z, (sx * (w - 0.16)) / 2, (sz * (d - 0.14)) / 2, ry);
      place(k, cyl(0.045, 0.045, 0.035, 8), k.m.rubber, px, 0.045, pz, 0, 0, Math.PI / 2);
    }
  }

  const [tx, tz] = local(x, z, -0.14, 0.02, ry);
  place(k, chamferBox(0.22, 0.06, 0.16, 0.01), k.m.steel, tx, h + 0.155, tz, 0, ry, 0);
  const [gx, gz] = local(x, z, 0.16, -0.04, ry);
  place(k, cyl(0.06, 0.06, 0.11, 10), k.m.steelDark, gx, h + 0.185, gz);
  place(k, cyl(0.055, 0.055, 0.012, 10), k.m.ledAmber, gx, h + 0.245, gz);

  // Grease worked into the drawer pulls, heaviest on the top two drawers that get opened most.
  for (let i = 2; i < 4; i++) {
    const [sx, sz] = local(x, z, 0, d / 2 + 0.03, ry);
    grimeDecal(k, sx, 0.22 + i * 0.18 + 0.06, sz, ry, w * 0.62, 0.2, 0);
  }
  groundShadow(k, x, z, w, d);
}

/** Cable drum on its side, with a loose run curling away along the deck. */
function buildCableSpool(k: Kit, x: number, z: number, sign: 1 | -1): void {
  const r = 0.34;
  const axisRx = Math.PI / 2; // drum axis runs along Z, cheeks facing up/down the room

  for (const s of [-1, 1]) {
    place(k, cyl(r, r, 0.035, 18), k.m.steelDark, x, r + 0.02, z + s * 0.17, axisRx, 0, 0);
  }
  place(k, cyl(r * 0.62, r * 0.62, 0.3, 16), k.m.rubber, x, r + 0.02, z, axisRx, 0, 0);
  place(k, cyl(0.05, 0.05, 0.44, 10), k.m.steelLight, x, r + 0.02, z, axisRx, 0, 0);
  for (let i = 0; i < 4; i++) {
    place(k, chamferBox(0.04, r * 1.7, 0.02, 0.006), k.m.steel, x, r + 0.02, z + 0.19, 0, 0, (i / 4) * Math.PI);
  }

  const dir = -sign;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, r * 0.9, z + 0.2),
    new THREE.Vector3(x + dir * 0.3, 0.05, z + 0.55),
    new THREE.Vector3(x + dir * 0.08, 0.05, z + 0.95),
    new THREE.Vector3(x + dir * 0.44, 0.05, z + 1.3),
  ]);
  place(k, new THREE.TubeGeometry(curve, 24, 0.026, 6, false), k.m.rubber, 0, 0, 0);

  groundShadow(k, x, z, r * 2.1, r * 2.1);
}

/** Waste drum with banded rings and a foot pedal. */
function buildWasteBin(k: Kit, x: number, z: number): void {
  groundShadow(k, x, z, 0.52, 0.52);
  place(k, cyl(0.25, 0.22, 0.72, 14), k.m.paintOlive, x, 0.36, z);
  place(k, cyl(0.262, 0.262, 0.04, 14), k.m.steelDark, x, 0.73, z);
  place(k, cyl(0.24, 0.24, 0.02, 14), k.m.steelDark, x, 0.757, z);
  place(k, cyl(0.24, 0.24, 0.03, 14), k.m.steel, x, 0.05, z);
  place(k, cyl(0.253, 0.253, 0.028, 14), k.m.steelDark, x, 0.28, z);
  place(k, cyl(0.246, 0.246, 0.028, 14), k.m.steelDark, x, 0.52, z);
  place(k, chamferBox(0.2, 0.03, 0.1, 0.006), k.m.steelLight, x, 0.06, z + 0.24);
}

/** Fluid drums strapped to a deck pallet. */
function buildDrumStack(k: Kit, x: number, z: number): void {
  groundShadow(k, x, z, 1.16, 0.94);
  place(k, chamferBox(1.12, 0.06, 0.9, 0.01), k.m.composite, x, 0.05, z);
  for (const sz of [-1, 0, 1]) {
    place(k, chamferBox(1.16, 0.04, 0.11, 0.008), k.m.steel, x, 0.1, z + sz * 0.34);
  }
  for (const sx of [-1, 1]) {
    place(k, chamferBox(0.09, 0.09, 0.9, 0.01), k.m.steelDark, x + sx * 0.44, 0.06, z);
  }

  const drums: [number, number, THREE.Material][] = [
    [-0.26, 0.12, k.m.paintGrey],
    [0.26, -0.1, k.m.steel],
  ];
  const bandMat = new THREE.MeshStandardMaterial({
    map: buildCanisterLabelTexture('coolant'),
    roughness: 0.78,
    metalness: 0.2,
    emissive: 0x161a1f,
    emissiveIntensity: 0.35,
  });
  for (const [dx, dz, mat] of drums) {
    place(k, cyl(0.24, 0.24, 0.78, 16), mat, x + dx, 0.51, z + dz);
    for (const ringY of [0.28, 0.51, 0.74]) {
      place(k, cyl(0.252, 0.252, 0.035, 16), k.m.steelDark, x + dx, ringY, z + dz);
    }
    place(k, cyl(0.24, 0.24, 0.03, 16), k.m.steelLight, x + dx, 0.905, z + dz);
    place(k, cyl(0.05, 0.05, 0.03, 8), k.m.copper, x + dx + 0.1, 0.925, z + dz + 0.06);
    place(k, cyl(0.243, 0.243, 0.19, 16), bandMat, x + dx, 0.62, z + dz);
    // Coolant that has wept from the bung and run the length of the drum.
    const ry = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    const sx = x + dx - Math.sign(x) * 0.248;
    grimeDecal(k, sx, 0.9, z + dz + 0.05, ry, 0.3, 0.78, 1);
  }
}

/** Fire extinguisher on a wall bracket, with gauge, hose and hazard band. */
function buildExtinguisher(k: Kit, wallX: number, z: number, sign: 1 | -1): void {
  const inward = -sign;
  const x = wallX + inward * 0.28;
  const face: Face = sign > 0 ? 'nx' : 'px';

  place(k, chamferBox(0.05, 0.62, 0.3, 0.012), k.m.steelDark, wallX + inward * 0.03, 0.62, z);
  boltRect(k, face, wallX + inward * 0.06, 0.62, z, 0.22, 0.5);

  place(k, cyl(0.1, 0.108, 0.46, 14), k.m.paintRed, x, 0.5, z);
  place(k, new THREE.SphereGeometry(0.1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), k.m.paintRed, x, 0.73, z);
  place(k, cyl(0.104, 0.104, 0.02, 14), k.m.steelDark, x, 0.27, z);
  place(k, cyl(0.036, 0.042, 0.08, 10), k.m.steelDark, x, 0.85, z);
  place(k, chamferBox(0.14, 0.045, 0.06, 0.01), k.m.steelLight, x + inward * 0.03, 0.91, z);
  place(k, cyl(0.032, 0.032, 0.02, 10), k.m.glass, x + inward * 0.07, 0.85, z, 0, 0, Math.PI / 2);
  place(k, cyl(0.013, 0.013, 0.012, 8), k.m.ledCyan, x + inward * 0.083, 0.85, z, 0, 0, Math.PI / 2);

  const bandTex = buildWarningStripeTexture('red');
  bandTex.repeat.set(4, 1);
  const bandMat = new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.6, metalness: 0.25, emissive: 0x1c0a06, emissiveIntensity: 0.4 });
  place(k, cyl(0.106, 0.106, 0.08, 14), bandMat, x, 0.58, z);

  for (const by of [0.4, 0.66]) {
    place(k, chamferBox(0.24, 0.045, 0.24, 0.008), k.m.steelLight, (x + wallX) / 2 + inward * 0.02, by, z);
  }
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x + inward * 0.07, 0.86, z),
    new THREE.Vector3(x + inward * 0.17, 0.7, z + 0.13),
    new THREE.Vector3(x + inward * 0.06, 0.5, z + 0.16),
    new THREE.Vector3(x - inward * 0.02, 0.36, z + 0.05),
  ]);
  place(k, new THREE.TubeGeometry(curve, 16, 0.014, 5, false), k.m.rubber, 0, 0, 0);
}

/** Recessed first-aid cabinet with a framed door, latch and indicator. */
function buildFirstAidCabinet(k: Kit, wallX: number, z: number, sign: 1 | -1): void {
  const inward = -sign;
  const ry = faceRy(sign);
  const face: Face = sign > 0 ? 'nx' : 'px';
  place(k, chamferBox(0.52, 0.42, 0.17, 0.018), k.m.paintBone, wallX + inward * 0.09, 1.45, z, 0, ry, 0);
  place(k, chamferBox(0.56, 0.05, 0.19, 0.01), k.m.steelDark, wallX + inward * 0.09, 1.68, z, 0, ry, 0);
  place(k, chamferBox(0.56, 0.05, 0.19, 0.01), k.m.steelDark, wallX + inward * 0.09, 1.22, z, 0, ry, 0);

  const doorMat = new THREE.MeshStandardMaterial({ map: buildFirstAidTexture(), roughness: 0.55, metalness: 0.25, emissive: 0x2a0d0d, emissiveIntensity: 0.5 });
  place(k, chamferBox(0.42, 0.34, 0.02, 0.006), k.m.steelLight, wallX + inward * 0.185, 1.45, z, 0, ry, 0);
  place(k, plane(0.34, 0.3), doorMat, wallX + inward * 0.2, 1.45, z, 0, ry, 0);
  place(k, cyl(0.014, 0.014, 0.06, 8), k.m.steelLight, wallX + inward * 0.2, 1.45, z + 0.19, 0, 0, Math.PI / 2);
  place(k, cyl(0.016, 0.016, 0.012, 8), k.m.ledCyan, wallX + inward * 0.2, 1.72, z, 0, 0, Math.PI / 2);
  boltRect(k, face, wallX + inward * 0.19, 1.45, z, 0.46, 0.36);
}

/** Junction box: chamfered housing, recessed faceplate, conduit stub and a live LED. */
function buildJunctionBox(
  k: Kit, ctx: InteriorCtx,
  wallX: number, y: number, z: number, sign: 1 | -1,
  ledColor: number, stubDown: boolean,
): void {
  const inward = -sign;
  const face: Face = sign > 0 ? 'nx' : 'px';
  const x = wallX + inward * 0.09;
  k.jbBody.add(x, y, z);
  k.jbPlate.add(x + inward * 0.1, y, z);
  boltRect(k, face, x + inward * 0.13, y, z, 0.16, 0.24);

  const stubY = stubDown ? y - 0.32 : y + 0.32;
  k.jbStub.add(wallX + inward * 0.06, stubY, z);
  k.jbCap.add(wallX + inward * 0.06, stubY + (stubDown ? 0.2 : -0.2), z);

  const mat = new THREE.MeshStandardMaterial({ color: ledColor, emissive: ledColor, emissiveIntensity: 0.3, roughness: 0.35 });
  const led = place(k, cyl(0.016, 0.016, 0.012, 8), mat, x + inward * 0.14, y + 0.09, z, 0, 0, Math.PI / 2);
  ctx.statusLights.push({ mesh: led, material: mat, phase: (z + y) * 1.7, onIntensity: 2.2 });
}

/** Flanged valve station: stub pipe, body, hand wheel and a gauge. */
function buildValveStation(k: Kit, wallX: number, y: number, z: number, sign: 1 | -1): void {
  const inward = -sign;
  const x = wallX + inward * 0.16;
  const face: Face = sign > 0 ? 'nx' : 'px';
  place(k, cyl(0.14, 0.14, 0.05, 14), k.m.steelDark, wallX + inward * 0.03, y, z, 0, 0, Math.PI / 2);
  place(k, cyl(0.075, 0.075, 0.3, 12), k.m.steel, x, y, z, 0, 0, Math.PI / 2);
  place(k, chamferBox(0.18, 0.2, 0.2, 0.016), k.m.steelDark, x + inward * 0.11, y, z);
  place(k, cyl(0.03, 0.03, 0.16, 8), k.m.steelLight, x + inward * 0.11, y + 0.16, z);
  place(k, new THREE.TorusGeometry(0.13, 0.018, 6, 16), k.m.paintRed, x + inward * 0.11, y + 0.26, z, Math.PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) {
    place(k, cyl(0.012, 0.012, 0.25, 6), k.m.paintRed, x + inward * 0.11, y + 0.26, z, 0, (i / 3) * Math.PI, Math.PI / 2);
  }
  place(k, cyl(0.05, 0.05, 0.03, 12), k.m.glass, x + inward * 0.2, y - 0.07, z, 0, 0, Math.PI / 2);
  place(k, cyl(0.055, 0.055, 0.012, 12), k.m.steelLight, x + inward * 0.19, y - 0.07, z, 0, 0, Math.PI / 2);
  boltRect(k, face, wallX + inward * 0.05, y, z, 0.2, 0.2);

  // A weeping gland stains the wall all the way to the deck — the most motivated wear in the room.
  wallStreak(k, wallX, sign, y - 0.08, z, 0.5, y - 0.06, 1);
}

/** Small cool readout in a bolted housing — a cyan accent bolted to a big flat wall area. */
function buildReadoutPanel(k: Kit, ctx: InteriorCtx, wallX: number, y: number, z: number, sign: 1 | -1, seed: number): void {
  const inward = -sign;
  const ry = faceRy(sign);
  const face: Face = sign > 0 ? 'nx' : 'px';
  place(k, chamferBox(0.62, 0.42, 0.1, 0.016), k.m.steelDark, wallX + inward * 0.06, y, z, 0, ry, 0);
  place(k, chamferBox(0.66, 0.05, 0.12, 0.01), k.m.steel, wallX + inward * 0.06, y + 0.22, z, 0, ry, 0);
  place(k, chamferBox(0.66, 0.05, 0.12, 0.01), k.m.steel, wallX + inward * 0.06, y - 0.22, z, 0, ry, 0);

  const mat = new THREE.MeshStandardMaterial({
    map: buildReadoutTexture(seed),
    roughness: 0.25,
    metalness: 0.1,
    emissive: 0xffffff,
    emissiveIntensity: 0.9,
  });
  mat.emissiveMap = mat.map;
  place(k, plane(0.5, 0.3), mat, wallX + inward * 0.115, y, z, 0, ry, 0);
  boltRect(k, face, wallX + inward * 0.1, y, z, 0.56, 0.36);

  ctx.animated.push((elapsed) => {
    mat.emissiveIntensity = 0.82 + Math.sin(elapsed * 1.6 + seed) * 0.1;
  });
}

/** Three-pipe conduit run along a side wall, with clamps, couplings, brackets and elbow drops. */
function buildConduitRun(k: Kit, wallX: number, sign: 1 | -1): void {
  const inward = -sign;
  const len = ROOM_D - 0.6;
  const runs: [number, number, number, THREE.Material][] = [
    [0.055, 3.12, 0.16, k.m.steel],
    [0.042, 3.12, 0.05, k.m.steelDark],
    [0.032, 3.02, 0.13, k.m.copper],
  ];
  for (const [r, y, off, mat] of runs) {
    const px = wallX + inward * (0.12 + off);
    place(k, cyl(r, r, len, 10), mat, px, y, 0, Math.PI / 2, 0, 0);
    for (let i = 0; i < 9; i++) {
      const z = -len / 2 + 0.4 + i * ((len - 0.8) / 8);
      k.clamp.add(px, y, z, 0, 0, 0, r / 0.06, r / 0.06, 1);
      k.coupling.add(px, y, z + 0.6, Math.PI / 2, 0, 0, r / 0.05, 1, r / 0.05);
    }
  }

  for (let i = 0; i < 7; i++) {
    const z = -len / 2 + 0.6 + i * ((len - 1.2) / 6);
    place(k, chamferBox(0.4, 0.06, 0.05, 0.008), k.m.steelDark, wallX + inward * 0.26, 3.07, z);
    boltRect(k, sign > 0 ? 'nx' : 'px', wallX + inward * 0.09, 3.07, z, 0.03, 0.16);
  }

  for (const z of [-2.6, 2.4]) {
    const px = wallX + inward * 0.27;
    place(k, cyl(0.042, 0.042, 0.48, 8), k.m.steel, px, 2.86, z);
    place(k, chamferBox(0.2, 0.2, 0.22, 0.014), k.m.steelDark, px, 2.56, z);
    boltRect(k, sign > 0 ? 'nx' : 'px', px + inward * 0.11, 2.56, z, 0.16, 0.16);
    // Condensate off the elbow drop, running down the wall behind it.
    wallStreak(k, wallX, sign, 2.5, z, 0.4, 1.5, 2);
  }

  // Two of the nine couplings on the middle run have let go and stained the wall under them.
  for (const z of [-3.9, 1.15]) {
    wallStreak(k, wallX, sign, 3.02, z, 0.34, 1.35, 0);
  }
}

/** Ladder-style cable tray running the length of a side wall, hung off the ceiling. */
function buildCableTray(k: Kit, wallX: number, sign: 1 | -1): void {
  const inward = -sign;
  const len = ROOM_D - 0.8;
  const px = wallX + inward * 0.34;
  place(k, chamferBox(0.36, 0.03, len, 0.008), k.m.steelDark, px, 3.44, 0);
  for (const s of [-1, 1]) {
    place(k, chamferBox(0.03, 0.11, len, 0.008), k.m.steel, px + s * 0.17, 3.49, 0);
  }
  const rungs = 26;
  for (let i = 0; i < rungs; i++) {
    k.rung.add(px, 3.456, -len / 2 + 0.16 + i * ((len - 0.32) / (rungs - 1)));
  }

  for (let i = 0; i < 3; i++) {
    const ox = -0.1 + i * 0.1;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 10; s++) {
      const z = -len / 2 + (s / 10) * len;
      pts.push(new THREE.Vector3(px + ox, 3.5 + Math.sin(s * 1.2 + i) * 0.014, z));
    }
    place(k, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 26, 0.022, 5, false), k.m.rubber, 0, 0, 0);
  }

  for (let i = 0; i < 7; i++) {
    const z = -len / 2 + 0.5 + i * ((len - 1) / 6);
    place(k, chamferBox(0.04, 0.44, 0.04, 0.008), k.m.steelDark, px, 3.72, z);
    place(k, chamferBox(0.44, 0.04, 0.05, 0.008), k.m.steelDark, px, 3.52, z);
  }
}

/** Floor-level conduit duct hugging a wall base, with bolted saddles. */
function buildFloorDuct(k: Kit, wallX: number, sign: 1 | -1, z0: number, z1: number): void {
  const inward = -sign;
  const len = z1 - z0;
  const px = wallX + inward * 0.17;
  place(k, chamferBox(0.24, 0.14, len, 0.014), k.m.steelDark, px, 0.09, (z0 + z1) / 2);
  place(k, chamferBox(0.28, 0.03, len, 0.008), k.m.steel, px, 0.17, (z0 + z1) / 2);
  const n = Math.max(2, Math.round(len / 0.8));
  for (let i = 0; i < n; i++) {
    const z = z0 + 0.3 + i * ((len - 0.6) / Math.max(1, n - 1));
    place(k, chamferBox(0.3, 0.04, 0.06, 0.008), k.m.steelLight, px, 0.185, z);
    boltRect(k, 'py', px, 0.208, z, 0.26, 0.04);
  }
}

/** Vertical service riser: pipe bank floor-to-ceiling with flanges, tie plates and a shutoff. */
function buildRiser(k: Kit, x: number, z: number, sign: 1 | -1): void {
  const radii = [0.07, 0.05, 0.04];
  for (let i = 0; i < radii.length; i++) {
    const px = x + sign * (i * 0.15 - 0.15);
    place(k, cyl(radii[i], radii[i], ROOM_H - 0.2, 10), i === 2 ? k.m.copper : k.m.steel, px, (ROOM_H - 0.2) / 2, z);
    for (const fy of [0.12, 1.35, 2.6, 3.7]) {
      place(k, cyl(radii[i] + 0.03, radii[i] + 0.03, 0.055, 10), k.m.steelDark, px, fy, z);
    }
  }
  for (const ty of [0.55, 1.9, 3.15]) {
    place(k, chamferBox(0.62, 0.16, 0.1, 0.012), k.m.steelDark, x, ty, z - 0.06);
    boltRect(k, 'nz', x, ty, z - 0.115, 0.5, 0.08);
  }
  groundShadow(k, x, z, 0.62, 0.34);
  place(k, new THREE.TorusGeometry(0.1, 0.016, 6, 14), k.m.paintRed, x - sign * 0.15, 2.3, z - 0.02);
  place(k, cyl(0.03, 0.03, 0.16, 8), k.m.steelLight, x - sign * 0.15, 2.22, z);
}

/** Compact wall shelf with stowed odds and ends. */
function buildWallShelf(k: Kit, wallX: number, y: number, z: number, sign: 1 | -1): void {
  const inward = -sign;
  const px = wallX + inward * 0.17;
  place(k, chamferBox(0.32, 0.03, 0.9, 0.008), k.m.steel, px, y, z);
  place(k, chamferBox(0.32, 0.06, 0.03, 0.006), k.m.steelDark, px, y + 0.04, z + 0.44);
  for (const sz of [-1, 1]) {
    place(k, chamferBox(0.28, 0.2, 0.03, 0.006), k.m.steelDark, px, y - 0.1, z + sz * 0.4);
  }
  place(k, chamferBox(0.18, 0.14, 0.24, 0.012), k.m.paintOlive, px, y + 0.09, z - 0.22);
  place(k, cyl(0.07, 0.07, 0.18, 10), k.m.steel, px, y + 0.11, z + 0.06);
  place(k, chamferBox(0.2, 0.05, 0.16, 0.008), k.m.paintRed, px, y + 0.045, z + 0.3);
  boltRect(k, sign > 0 ? 'nx' : 'px', wallX + inward * 0.04, y - 0.02, z, 0.84, 0.1);
}

/** Coiled hose on a wall drum, mounted on the airlock wall (faces -Z). */
function buildHoseReel(k: Kit, x: number, y: number, z: number): void {
  place(k, chamferBox(0.52, 0.52, 0.12, 0.016), k.m.steelDark, x, y, z);
  boltRect(k, 'nz', x, y, z - 0.07, 0.42, 0.42);
  const dz = z - 0.22;
  place(k, cyl(0.24, 0.24, 0.2, 16), k.m.paintRed, x, y, dz, Math.PI / 2, 0, 0);
  place(k, cyl(0.06, 0.06, 0.34, 10), k.m.steelLight, x, y, dz, Math.PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) {
    place(k, new THREE.TorusGeometry(0.15 + i * 0.032, 0.024, 5, 18), k.m.rubber, x, y, dz - 0.02);
  }
  const nozzle = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, y - 0.21, dz),
    new THREE.Vector3(x + 0.03, y - 0.52, dz + 0.06),
    new THREE.Vector3(x + 0.14, y - 0.74, dz - 0.02),
  ]);
  place(k, new THREE.TubeGeometry(nozzle, 12, 0.022, 5, false), k.m.rubber, 0, 0, 0);
}

/** Small loose deck clutter — the last layer that stops a floor region reading as empty. */
function buildDeckClutter(k: Kit, x: number, z: number, variant: number): void {
  groundShadow(k, x, z, 0.34, 0.3);
  switch (variant % 5) {
    case 0:
      place(k, chamferBox(0.3, 0.12, 0.22, 0.014), k.m.paintGrey, x, 0.06, z, 0, 0.4, 0);
      place(k, chamferBox(0.32, 0.03, 0.24, 0.006), k.m.steelDark, x, 0.13, z, 0, 0.4, 0);
      break;
    case 1:
      place(k, cyl(0.12, 0.12, 0.26, 12), k.m.steel, x, 0.13, z);
      place(k, cyl(0.125, 0.125, 0.03, 12), k.m.hazard, x, 0.27, z);
      break;
    case 2:
      for (let i = 0; i < 3; i++) {
        place(k, new THREE.TorusGeometry(0.16 - i * 0.02, 0.024, 5, 14), k.m.rubber, x, 0.03 + i * 0.03, z, Math.PI / 2, 0, 0);
      }
      break;
    case 3:
      place(k, chamferBox(0.5, 0.04, 0.36, 0.008), k.m.steel, x, 0.02, z, 0, 0.6, 0);
      place(k, chamferBox(0.44, 0.03, 0.3, 0.006), k.m.steelDark, x + 0.04, 0.05, z + 0.03, 0, 0.8, 0);
      break;
    default:
      place(k, cyl(0.09, 0.11, 0.2, 10), k.m.paintOlive, x, 0.1, z);
      place(k, cyl(0.055, 0.055, 0.06, 8), k.m.steelDark, x, 0.22, z);
      break;
  }
}

// ===========================================================================================
// entry point
// ===========================================================================================

/** Set dressing: cargo, storage, maintenance hardware, conduit runs, safety gear and clutter. */
export function buildDetailProps(ctx: InteriorCtx): void {
  const m = buildMaterials();

  const k: Kit = {
    scene: ctx.scene,
    m,
    pool: [],
    bolt: new Batch(cyl(0.017, 0.02, 0.016, 6), m.steelLight),
    slat: new Batch(chamferBox(0.24, 0.016, 0.03, 0.004), m.steelDark),
    clamp: new Batch(new THREE.TorusGeometry(0.06, 0.014, 5, 12), m.steelLight),
    rung: new Batch(chamferBox(0.32, 0.015, 0.035, 0.004), m.steel),
    coupling: new Batch(cyl(0.05, 0.05, 0.045, 10), m.steelDark),
    jbBody: new Batch(chamferBox(0.18, 0.34, 0.28, 0.018), m.steelDark),
    jbPlate: new Batch(chamferBox(0.06, 0.26, 0.2, 0.012), m.steel),
    jbStub: new Batch(cyl(0.035, 0.035, 0.42, 8), m.steel),
    jbCap: new Batch(cyl(0.048, 0.048, 0.05, 8), m.steelLight),
    contact: new Batch(plane(1, 1), decalMaterial(buildContactShadowTexture()), false, 2),
    streaks: [0, 1, 2].map((v) => new Batch(plane(1, 1), decalMaterial(buildStreakTexture(v)), false, 2)),
  };

  // ----- console face controls -----
  const buttonMats = [m.ledRed, m.ledAmber, m.ledCyan, m.ledAmber];
  const buttonGeo = cyl(0.045, 0.045, 0.03, 10);
  const bezelGeo = chamferBox(0.11, 0.11, 0.02, 0.008);
  const tilt = Math.PI / 2 - 0.35;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 7; col++) {
      const x = -1.26 + col * 0.42;
      const y = 0.82 + row * 0.14;
      const z = -3.42 - row * 0.08;
      place(k, bezelGeo, m.steelDark, x, y, z, tilt, 0, 0);
      place(k, buttonGeo, buttonMats[(row * 7 + col) % buttonMats.length], x, y + 0.008, z + 0.014, tilt, 0, 0);
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = 1.02 + (i % 3) * 0.14;
    const y = 0.85 + Math.floor(i / 3) * 0.14;
    place(k, chamferBox(0.1, 0.1, 0.02, 0.006), m.steelDark, x, y, -3.44 - Math.floor(i / 3) * 0.08, tilt, 0, 0);
    place(k, cyl(0.011, 0.014, 0.07, 6), m.steelLight, x, y + 0.035, -3.4 - Math.floor(i / 3) * 0.08, 0.5, 0, i % 2 === 0 ? 0.4 : -0.4);
  }

  // ----- wall services -----
  for (const sign of [1, -1] as const) {
    buildConduitRun(k, sign * WALL_X, sign);
    buildCableTray(k, sign * WALL_X, sign);
  }
  buildFloorDuct(k, -WALL_X, -1, -4.9, -3.3);
  buildFloorDuct(k, -WALL_X, -1, 0.5, 2.3);
  buildFloorDuct(k, WALL_X, 1, -1.05, 1.35);
  buildFloorDuct(k, WALL_X, 1, 4.95, 5.7);

  // Junction boxes at staggered heights: the wall reads as a serviced surface, not a flat plate.
  const boxPlan: [1 | -1, number, number, boolean][] = [
    [-1, -4.6, 2.55, true],
    [-1, -3.62, 1.95, false],
    [-1, -1.55, 2.6, true],
    [-1, 0.75, 1.85, false],
    [-1, 2.05, 2.5, true],
    [-1, 3.85, 1.9, false],
    [-1, 5.15, 2.55, true],
    [1, -4.25, 1.9, false],
    [1, -2.7, 2.55, true],
    [1, -0.95, 1.85, false],
    [1, 0.85, 2.5, true],
    [1, 2.65, 1.9, false],
    [1, 4.25, 2.55, true],
    [1, 5.3, 1.95, false],
  ];
  const ledPalette = [0x4fd8f0, 0xffd9a0, 0xe0552f, 0x4fd8f0];
  boxPlan.forEach(([sign, z, y, stubDown], i) => {
    buildJunctionBox(k, ctx, sign * WALL_X, y, z, sign, ledPalette[i % ledPalette.length], stubDown);
  });

  buildValveStation(k, -WALL_X, 1.95, -3.9, -1);
  buildValveStation(k, WALL_X, 2.05, 3.15, 1);
  buildReadoutPanel(k, ctx, -WALL_X, 2.35, -2.4, -1, 1);
  buildReadoutPanel(k, ctx, WALL_X, 2.2, 0.35, 1, 4);
  buildWallShelf(k, -WALL_X, 1.55, 3.45, -1);
  buildWallShelf(k, WALL_X, 1.5, -3.05, 1);

  // ----- left wall floor line -----
  buildRiser(k, -WALL_X + 0.24, -5.4, -1);
  buildWorkbench(k, ctx, -WALL_X, -2.4, -1);
  buildCanisterRack(k, -WALL_X + 0.3, -0.95, faceRy(-1));
  const crateSteel = buildCratePanelTexture('SUP-14', 'steel');
  const crateOlive = buildCratePanelTexture('MRE-09', 'olive');
  const crateBone = buildCratePanelTexture('PT-221', 'bone');
  buildCrate(k, crateSteel, m.paintGrey, -WALL_X + 0.45, 0, 2.95, faceRy(-1), 0.86, 0.68, 0.72);
  buildCrate(k, crateOlive, m.paintOlive, -WALL_X + 0.42, 0.68, 2.88, faceRy(-1), 0.62, 0.46, 0.56);
  buildCrate(k, crateBone, m.paintBone, -WALL_X + 0.4, 0, 3.68, faceRy(-1) + 0.22, 0.5, 0.38, 0.44);
  buildCableSpool(k, -WALL_X + 0.52, 4.4, -1);
  buildExtinguisher(k, -WALL_X, 5.15, -1);

  // ----- right wall floor line -----
  buildRelayRack(k, ctx, WALL_X - 0.36, -5.05, faceRy(1));
  buildDrumStack(k, WALL_X - 0.62, -3.55);
  buildLockerBank(k, WALL_X - 0.3, -1.6, faceRy(1), ['A-1', 'A-2']);
  buildCrate(k, crateSteel, m.paintGrey, WALL_X - 0.46, 0, 0.1, faceRy(1), 0.8, 0.6, 0.68);
  buildCrate(k, crateBone, m.paintBone, WALL_X - 0.44, 0.6, 0.04, faceRy(1), 0.56, 0.4, 0.5);
  buildToolChest(k, WALL_X - 0.4, 4.55, faceRy(1));
  buildWasteBin(k, WALL_X - 0.42, 5.35);
  buildFirstAidCabinet(k, WALL_X, 5.0, 1);
  buildRiser(k, WALL_X - 0.24, -5.72, 1);

  // ----- airlock wall: suit lockers one side, hose reel and cargo the other -----
  buildLockerBank(k, -3.05, FRONT_Z - 0.34, Math.PI, ['EVA-1', 'EVA-2']);
  buildHoseReel(k, 3.1, 1.6, FRONT_Z - 0.06);
  buildCrate(k, crateOlive, m.paintOlive, 3.35, 0, FRONT_Z - 0.55, Math.PI, 0.7, 0.5, 0.55);
  buildCrate(k, crateSteel, m.paintGrey, 2.6, 0, FRONT_Z - 0.5, Math.PI + 0.3, 0.55, 0.42, 0.48);

  // ----- console wall corners: breaker cabinets adding background depth behind the console -----
  for (const sx of [-1, 1] as const) {
    const x = sx * 3.55;
    place(k, chamferBox(0.7, 0.9, 0.22, 0.02), m.paintGrey, x, 1.5, BACK_Z + 0.13);
    place(k, chamferBox(0.76, 0.06, 0.24, 0.012), m.steelDark, x, 1.98, BACK_Z + 0.13);
    place(k, chamferBox(0.76, 0.06, 0.24, 0.012), m.steelDark, x, 1.02, BACK_Z + 0.13);
    boltRect(k, 'pz', x, 1.5, BACK_Z + 0.25, 0.6, 0.78);
    for (let i = 0; i < 6; i++) k.slat.add(x, 1.78 - i * 0.075, BACK_Z + 0.245);
    place(k, cyl(0.02, 0.02, 0.22, 8), m.steelLight, x + sx * 0.26, 1.35, BACK_Z + 0.26);
    place(k, chamferBox(0.5, 0.16, 0.16, 0.014), m.steelDark, x, 0.85, BACK_Z + 0.15);
    place(k, cyl(0.04, 0.04, 1.1, 8), m.steel, x - sx * 0.2, 2.5, BACK_Z + 0.11);
    place(k, cyl(0.055, 0.055, 0.05, 8), m.steelLight, x - sx * 0.2, 2.05, BACK_Z + 0.11);
    buildDeckClutter(k, x + sx * 0.6, BACK_Z + 0.5, sx > 0 ? 1 : 4);
    // Grime pooled in the corner where the cabinet plinth meets the deck.
    grimeDecal(k, x, 1.0, BACK_Z + 0.26, 0, 0.86, 1.0, 0);
  }

  // ----- status light clusters -----
  const dotColors = [0xe0552f, 0x4fd8f0, 0xffd9a0];
  const clusters: [1 | -1, number][] = [[-1, 0.35], [-1, 4.6], [1, -0.6]];
  for (const [sign, cz] of clusters) {
    const wallX = sign * WALL_X;
    const inward = -sign;
    place(k, chamferBox(0.16, 0.56, 0.2, 0.016), m.steelDark, wallX + inward * 0.09, 1.74, cz);
    place(k, chamferBox(0.05, 0.48, 0.14, 0.01), m.steel, wallX + inward * 0.18, 1.74, cz);
    boltRect(k, sign > 0 ? 'nx' : 'px', wallX + inward * 0.2, 1.74, cz, 0.16, 0.46);
    place(k, cyl(0.03, 0.03, 0.62, 8), m.steel, wallX + inward * 0.08, 1.12, cz);
    place(k, cyl(0.042, 0.042, 0.05, 8), m.steelLight, wallX + inward * 0.08, 0.8, cz);
    for (let i = 0; i < 3; i++) {
      const color = dotColors[i % dotColors.length];
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.4 });
      const dot = place(k, cyl(0.028, 0.028, 0.02, 10), mat, wallX + inward * 0.21, 1.58 + i * 0.16, cz, 0, 0, Math.PI / 2);
      ctx.statusLights.push({ mesh: dot, material: mat, phase: cz + i * 1.1, onIntensity: 2.0 });
    }
  }

  // ----- stencilled ID placards -----
  const placards: [string, string | undefined, number, number, number, number][] = [
    ['KB-215', 'MAINT BAY', -WALL_X + 0.02, 2.0, -4.5, Math.PI / 2],
    ['RST-04', 'HULL SEC', WALL_X - 0.02, 2.0, 4.35, -Math.PI / 2],
    ['OX-11', 'LIFE SUPPORT', -WALL_X + 0.02, 1.98, -0.3, Math.PI / 2],
    ['CG-07', 'CARGO TIE', WALL_X - 0.02, 1.55, -4.15, -Math.PI / 2],
    ['EV-02', 'SUIT STOW', -2.0, 2.05, FRONT_Z - 0.02, Math.PI],
  ];
  for (const [id, sub, px, py, pz, rotY] of placards) {
    const mat = new THREE.MeshStandardMaterial({
      map: buildStencilPlacardTexture(id, sub),
      roughness: 0.7,
      metalness: 0.15,
      emissive: 0x1a1814,
      emissiveIntensity: 0.35,
    });
    const placard = place(k, plane(0.46, 0.23), mat, px, py, pz, 0, rotY, 0);
    placard.renderOrder = 1;
    if (Math.abs(px) > 3) {
      const sign: 1 | -1 = px > 0 ? 1 : -1;
      boltRect(k, sign > 0 ? 'nx' : 'px', px - sign * 0.015, py, pz, 0.5, 0.27);
    }
  }

  // ----- loose deck clutter along the wall bases -----
  const clutterSpots: [number, number, number][] = [
    [-3.5, 1.4, 0],
    [-3.9, 5.0, 2],
    [-3.35, -4.35, 3],
    [-3.7, -0.25, 1],
    [3.55, 1.3, 4],
    [3.9, 3.1, 0],
    [3.4, -2.4, 2],
    [3.75, -4.3, 3],
    [2.75, 5.3, 1],
    [-2.5, 5.35, 3],
  ];
  for (const [x, z, variant] of clutterSpots) buildDeckClutter(k, x, z, variant);

  // ----- flush instanced batches -----
  k.bolt.flush(ctx.scene);
  k.slat.flush(ctx.scene);
  k.clamp.flush(ctx.scene);
  k.rung.flush(ctx.scene);
  k.coupling.flush(ctx.scene);
  k.jbBody.flush(ctx.scene);
  k.jbPlate.flush(ctx.scene);
  k.jbStub.flush(ctx.scene);
  k.jbCap.flush(ctx.scene);
  k.contact.flush(ctx.scene);
  for (const s of k.streaks) s.flush(ctx.scene);
  autoInstance(k);
}
