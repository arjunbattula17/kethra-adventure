import * as THREE from 'three';
import { buildHazardStripeTexture, buildFloorStencilTexture } from '../ShipTextures';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D } from './ctx';
import {
  buildPaintedDeckTexture,
  buildDeckRoughnessTexture,
  buildDeckNormalTexture,
  buildTreadPlateTexture,
  buildTreadNormalTexture,
  buildTreadRoughnessTexture,
  buildDeckWearTexture,
  buildContactShadowTexture,
} from './floorTextures';

const HALF_W = ROOM_W / 2;
const HALF_D = ROOM_D / 2;

/**
 * The room-facing wall surfaces, measured (docs/interior-room-contract.md). These are *not*
 * HALF_W / HALF_D: the kit wall shell stands 0.435 m inboard of the 12x16 deck slab on every side,
 * so deck hardware placed relative to HALF_W / HALF_D ends up buried inside the wall.
 */
const WALL_X = 5.565;
const WALL_Z = 7.565;
/** Kick-strip depth, and the room-facing face it leaves for everything else on the deck. */
const KICK_D = 0.16;
const KICK_X = WALL_X - KICK_D;
const KICK_Z = WALL_Z - KICK_D;
/** Ribbed threshold band spans wall to wall, stopping at the kick strip. */
const BAND_W = KICK_X * 2;

/**
 * Recessed bare-plate walkway insert running down the middle of the foreground deck, as in the
 * reference crop — the room's one big material swap from painted composite to dark tread plate.
 * Sits between the room centre and the +Z (spawn/airlock) side, so it reads in the foreground
 * from spawn and the console stays on plain painted deck beyond it.
 */
const INSET_HALF_X = 1.6;
const INSET_Z0 = 0.6;
const INSET_Z1 = 5.8;
const INSET_CZ = (INSET_Z0 + INSET_Z1) / 2;
/** Cable trough hugging the insert's +X edge. */
const TROUGH_X = INSET_HALF_X + 0.3;
/** Ribbed transition step marking the console bay boundary. */
const THRESHOLD_Z = -3.0;

type Xform = { p: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] };

const dummy = new THREE.Object3D();

function instance(geo: THREE.BufferGeometry, mat: THREE.Material, xforms: Xform[], cast = false): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, xforms.length);
  xforms.forEach((x, i) => {
    dummy.position.set(x.p[0], x.p[1], x.p[2]);
    dummy.rotation.set(x.r?.[0] ?? 0, x.r?.[1] ?? 0, x.r?.[2] ?? 0);
    dummy.scale.set(x.s?.[0] ?? 1, x.s?.[1] ?? 1, x.s?.[2] ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

/** Everything in the subtree drops and receives shadows — floor hardware is never floating. */
function grounded<T extends THREE.Object3D>(o: T): T {
  o.traverse((n) => {
    if ((n as THREE.Mesh).isMesh) {
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });
  return o;
}

/**
 * Evenly spaced grid lines covering `[-half + margin, half - margin]` at close to `target`
 * spacing (adjusted so the run divides evenly). Used for the panel-seam grid so the physical
 * seam pitch stays inside the brief's 0.5-1.5 m band regardless of room size, instead of a fixed
 * count of lines that would drift off-pitch if the room changes again.
 */
function gridLines(half: number, margin: number, target: number): number[] {
  const span = (half - margin) * 2;
  const segments = Math.max(1, Math.round(span / target));
  const spacing = span / segments;
  const lines: number[] = [];
  for (let i = 0; i <= segments; i++) lines.push(-half + margin + i * spacing);
  return lines;
}

/**
 * The deck. A bone-white painted plate field — the brightest large surface in the room, per the
 * brief's value structure — panelised with raised seam ribs and bolt heads, broken by a recessed
 * dark tread insert (the walkway grate), a ribbed threshold band, painted lane markings, and
 * floor-level hardware (hatch, vents, tie-downs). Crates, racks and wall-mounted gear are the
 * other artists' props module; this file owns only the deck surface itself and what is bolted
 * directly into it.
 */
export function buildFloor(ctx: InteriorCtx): void {
  const add = (o: THREE.Object3D) => ctx.scene.add(o);

  // ===== shared materials =====
  // Distinct material *response*, not just colour, per the recurring critique:
  //   painted deck / markings   metalness 0.00, roughness 0.85-1.0 (mapped)
  //   worn composite tread      metalness 0.30, roughness 0.62 (mapped)
  //   bare / machined steel     metalness 0.72-0.82, roughness 0.30-0.40
  //   rubber-ish dark recess    metalness 0.05, roughness 0.9+
  // Nothing here bottoms out at literal black (the darkest base is 0x2b2f36) and nothing tops
  // out near white (the brightest, the deck rib, sits at 0xb2ab9c) — the two ends of this
  // round's measured miss.
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: buildPaintedDeckTexture(ROOM_W / 2.4, ROOM_D / 2.4),
    roughnessMap: buildDeckRoughnessTexture(ROOM_W / 2.4, ROOM_D / 2.4),
    normalMap: buildDeckNormalTexture(ROOM_W / 1.2, ROOM_D / 1.2),
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.35,
    side: THREE.DoubleSide,
  });
  // Rib tops are walked on, so they burnish lighter and smoother than the bay they divide.
  const deckRibMat = new THREE.MeshStandardMaterial({ color: 0xb2ab9c, roughness: 0.56, metalness: 0.08, envMapIntensity: 0.5 });
  // Metal trim roughness/metalness pulled back from the previous round's near-mirror values: with
  // hundreds of bolt heads and rail edges catching the key + pendant + sconce lights at once, a
  // roughness in the 0.26-0.38 band turns each one into a small blown-white speck, which is what
  // dragged this round's measured p95 above the reference (there is no scene environment map, so
  // this specular response comes entirely from direct lights, not envMapIntensity). Still clearly
  // more reflective than the painted deck (metalness 0 there) so the material-response contrast
  // the brief asks for survives — the hotspots are just tamed rather than removed.
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x8e939c, roughness: 0.5, metalness: 0.62, envMapIntensity: 0.85 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x6f747d, roughness: 0.42, metalness: 0.6, envMapIntensity: 0.8 });
  const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x4b515b, roughness: 0.55, metalness: 0.45, envMapIntensity: 0.55 });
  // Not a hole: the reference's recesses are dark *material* that still reads in shadow.
  const voidMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.92, metalness: 0.05, envMapIntensity: 0.2 });
  const treadMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: buildTreadPlateTexture(2.2, 3.2),
    normalMap: buildTreadNormalTexture(2.2, 3.2),
    normalScale: new THREE.Vector2(1.25, 1.25),
    // Camera sits inside this insert's Z-range (spawn is z=4, insert runs 0.6-5.8), so the row
    // right in front of the player fills most of the foreground frame — the "flat, under-detailed
    // corrugated grate panel" the critic called out. A roughnessMap keyed to the same dash grid as
    // the diffuse/normal maps is what turns that from one flat specular value into machined plate
    // that actually catches light unevenly.
    roughnessMap: buildTreadRoughnessTexture(2.2, 3.2),
    roughness: 1.0,
    metalness: 0.3,
    envMapIntensity: 0.55,
  });
  // The threshold band's top is 10.81 x 0.9 m carrying only 8 cm ribs on a 19 cm pitch, so a bit
  // over half of it renders bare — the largest unmapped colour field left on the deck, and it sits
  // straight across the spawn-to-console lane. Same bare-plate maps as the walkway insert, at the
  // same physical pitch (treadMat runs 2.2 repeats over its 1.03 m plates, i.e. ~2 per metre), so
  // the step reads as the same machined plate rather than a flat grey bar.
  const stepMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: buildTreadPlateTexture(BAND_W * 2, 1.8),
    normalMap: buildTreadNormalTexture(BAND_W * 2, 1.8),
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: buildTreadRoughnessTexture(BAND_W * 2, 1.8),
    roughness: 1.0,
    metalness: 0.35,
    envMapIntensity: 0.55,
  });
  // Plate-edge trim: boot-polished, but polished is not chromed. At roughness 0.34 / metalness 0.68
  // / envMapIntensity 1.0 these strips were a near-mirror, and since they run the full length of the
  // walkway insert they returned one unbroken specular streak per overhead fixture — which the bloom
  // pass then blew to pure white straight down the middle of the deck, erasing the tread plate's
  // texture across the whole midground (renders/sweep-a/mid_y180.png, and the same blowout in the
  // player's own screenshots). Widening the specular lobe keeps the edge reading brighter than the
  // roughness-1.0 plate beside it without flaring.
  const wornEdgeMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.62, metalness: 0.55, envMapIntensity: 0.55 });
  const paintWhiteMat = new THREE.MeshStandardMaterial({ color: 0xbdb8ab, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.3 });
  const grateMat = new THREE.MeshStandardMaterial({ color: 0x8d7238, roughness: 0.52, metalness: 0.5, envMapIntensity: 0.6 });

  // Hazard yellow stays a saturated accent, tinted down so the stripe tops are never the
  // brightest thing on the deck. The shared stripe texture's black bands are #14120a, which at
  // this room's ambient level would render as literal 0 — a small emissive floor keeps them
  // reading as painted stripes in shadow instead of as gaps (the only emissive in this file).
  const hazardTint = 0xbdb8ac;
  const hazardFloor = 0x23262b;
  const hazardTexLong = buildHazardStripeTexture();
  hazardTexLong.repeat.set(24, 1);
  const hazardMatLong = new THREE.MeshStandardMaterial({ map: hazardTexLong, color: hazardTint, roughness: 0.74, metalness: 0.06, envMapIntensity: 0.3, emissive: hazardFloor, emissiveIntensity: 1 });
  const hazardTexShort = buildHazardStripeTexture();
  hazardTexShort.repeat.set(9, 1);
  const hazardMatShort = new THREE.MeshStandardMaterial({ map: hazardTexShort, color: hazardTint, roughness: 0.74, metalness: 0.06, envMapIntensity: 0.3, emissive: hazardFloor, emissiveIntensity: 1 });
  const hazardTexPatch = buildHazardStripeTexture();
  hazardTexPatch.repeat.set(3, 1);
  const hazardMatPatch = new THREE.MeshStandardMaterial({ map: hazardTexPatch, color: hazardTint, roughness: 0.74, metalness: 0.06, envMapIntensity: 0.3, emissive: hazardFloor, emissiveIntensity: 1 });

  // Bolt heads collected across every sub-assembly and drawn as one instanced batch.
  const bolts: Xform[] = [];
  const boltGeo = new THREE.CylinderGeometry(0.023, 0.026, 0.014, 6);

  // Multiply-blended wear decals share one material per variant.
  const decalPlane = new THREE.PlaneGeometry(1, 1);
  const wearMats: Record<string, THREE.MeshBasicMaterial> = {};
  const wearMat = (variant: 'scuff' | 'drip' | 'grime' | 'oil') => {
    if (!wearMats[variant]) {
      wearMats[variant] = new THREE.MeshBasicMaterial({
        map: buildDeckWearTexture(variant),
        transparent: true,
        blending: THREE.MultiplyBlending,
        premultipliedAlpha: true,
        depthWrite: false,
      });
    }
    return wearMats[variant];
  };
  const addWear = (variant: 'scuff' | 'drip' | 'grime' | 'oil', x: number, z: number, w: number, d: number, rot = 0, y = 0.009) => {
    const m = new THREE.Mesh(decalPlane, wearMat(variant));
    m.position.set(x, y, z);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.scale.set(w, d, 1);
    // Deck decal stack, y offset and renderOrder kept in the same order so neither can contradict
    // the other: polish 0.003/1, painted stencils 0.007/2, wear 0.009/3, contact occlusion
    // 0.0115/4. Wear used to draw *under* the stencils (renderOrder 2 vs 3) despite sitting 2 mm
    // higher, so a stencil erased the scuffing over it.
    m.renderOrder = 3;
    add(m);
  };

  // Contact occlusion. The room's shadow map cannot resolve the centimetre-scale darkening
  // where a grate lip, a hatch or a rail meets the plate, so every ground-resting assembly gets
  // an explicit multiply-blended pool under it — what stops floor hardware reading as decals
  // floating on a flat sheet.
  const contactMats: Record<string, THREE.MeshBasicMaterial> = {};
  const contactMat = (variant: 'pad' | 'strip') => {
    if (!contactMats[variant]) {
      contactMats[variant] = new THREE.MeshBasicMaterial({
        map: buildContactShadowTexture(variant),
        transparent: true,
        blending: THREE.MultiplyBlending,
        premultipliedAlpha: true,
        depthWrite: false,
      });
    }
    return contactMats[variant];
  };
  const addContact = (variant: 'pad' | 'strip', x: number, z: number, w: number, d: number, rot = 0, y = 0.011) => {
    const m = new THREE.Mesh(decalPlane, contactMat(variant));
    m.position.set(x, y, z);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.scale.set(w, d, 1);
    m.renderOrder = 4;
    add(m);
  };

  // ===== 1. deck slab =====
  const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_D), deckMat);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  add(floor);
  ctx.floorMeshes.push(floor);
  ctx.noMerge.add(floor); // the player's ground raycast target — keep its own identity

  // A burnished traffic zone in front of the console — differs from the surrounding deck by
  // *roughness*, not albedo, so it reads as worn paint rather than a bright decal. Roughness eased
  // up from the previous round's 0.38: under the room's stacked key + pendant + cool console
  // lights that low a roughness read as a mirror streak across the middle of the deck, which is
  // the single biggest specular contributor to this round's blown-highlight miss.
  const polishMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: buildPaintedDeckTexture(1.6, 1.2),
    normalMap: buildDeckNormalTexture(3.2, 2.4),
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.56,
    metalness: 0.05,
    envMapIntensity: 0.45,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const polish = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.0), polishMat);
  polish.rotation.x = -Math.PI / 2;
  polish.position.set(0, 0.003, -3.4);
  polish.renderOrder = 1;
  add(polish);

  // ===== 2. panel seam ribs + bolts =====
  // Raised 3 cm ribs on a ~1.5 m grid. Real geometry rather than a seam texture: at deck grazing
  // angles the rib top catches light and drops a hard shadow line, which a map cannot fake.
  // Ribs run wall to wall and die into the kick strip's room-facing face, not to ROOM_W/ROOM_D-0.3
  // (measured x = ±5.85, z = ±7.85) which pushed 0.285 m of every rib under the wall shell.
  const ribGeoX = new THREE.BoxGeometry(KICK_X * 2, 0.016, 0.05);
  const ribGeoZ = new THREE.BoxGeometry(0.05, 0.016, KICK_Z * 2);
  const ribZs = gridLines(HALF_D, 0.9, 1.5);
  const ribXs = gridLines(HALF_W, 0.9, 1.5);
  // The key light runs from (+X, +Y, +Z) toward (-X, -Y, -Z), so each rib pools grime and drops
  // its contact darkening on its -Z / -X side — wear where use would put it, not evenly.
  for (const z of ribZs) {
    const rib = new THREE.Mesh(ribGeoX, deckRibMat);
    rib.position.set(0, 0.008, z);
    rib.castShadow = true;
    rib.receiveShadow = true;
    add(rib);
    addContact('strip', 0, z - 0.115, KICK_X * 2, 0.23, Math.PI, 0.0105);
    for (const x of gridLines(HALF_W, 0.7, 0.87)) bolts.push({ p: [x, 0.017, z] });
  }
  for (const x of ribXs) {
    const rib = new THREE.Mesh(ribGeoZ, deckRibMat);
    rib.position.set(x, 0.008, 0);
    rib.castShadow = true;
    rib.receiveShadow = true;
    add(rib);
    addContact('strip', x - 0.115, 0, KICK_Z * 2, 0.23, -Math.PI / 2, 0.0105);
    for (const z of gridLines(HALF_D, 0.7, 0.9)) bolts.push({ p: [x, 0.017, z] });
  }

  // ===== 3. wall-base kick strip =====
  // Coving the deck into the walls, so the floor never just intersects a vertical plane. Sits on
  // the measured room-facing wall surfaces (WALL_X / WALL_Z), not on HALF_W / HALF_D: the old
  // HALF_W-0.16 / HALF_D-0.16 placement put the whole strip at a measured x ∈ [5.76, 5.92] and
  // z ∈ [7.76, 7.92], i.e. entirely behind the 5.565 / 7.565 wall face, so none of it ever
  // rendered and every wall/deck junction in the room met as a bare seam.
  // It is broken wherever it would drive through something: the Column_Astra bases (measured world
  // AABB x ∈ [5.117, 6.29], z ∈ [1.836, 2.164]) and the airlock opening, where the +Z wall shells
  // stop at |x| = 2 and a 17 cm bar across the doorway would be a trip hazard.
  const COLUMN_HALF_Z = 0.164 + 0.06;
  const sideKickRuns: [number, number][] = [
    [-KICK_Z, -2 - COLUMN_HALF_Z],
    [-2 + COLUMN_HALF_Z, 2 - COLUMN_HALF_Z],
    [2 + COLUMN_HALF_Z, KICK_Z],
  ];
  const endKickRuns: [number, [number, number][]][] = [
    [-1, [[-WALL_X, WALL_X]]],
    [1, [[-WALL_X, -2], [2, WALL_X]]],
  ];
  for (const [z0, z1] of sideKickRuns) {
    const len = z1 - z0;
    const cz = (z0 + z1) / 2;
    const kickGeo = new THREE.BoxGeometry(KICK_D, 0.17, len);
    const lipGeo = new THREE.BoxGeometry(0.22, 0.03, len);
    for (const sx of [-1, 1]) {
      const kick = new THREE.Mesh(kickGeo, darkSteelMat);
      kick.position.set(sx * (WALL_X - KICK_D / 2), 0.085, cz);
      kick.receiveShadow = true;
      add(kick);
      const lip = new THREE.Mesh(lipGeo, plateMat);
      lip.position.set(sx * (WALL_X - 0.11), 0.185, cz);
      lip.castShadow = true;
      add(lip);
      addContact('strip', sx * (WALL_X - 0.52), cz, len, 0.44, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0.0115);
      for (const dz of gridLines(len / 2, 0.25, 0.9)) bolts.push({ p: [sx * (WALL_X - 0.17), 0.2, cz + dz] });
    }
  }
  for (const [sz, runs] of endKickRuns) {
    for (const [x0, x1] of runs) {
      const len = x1 - x0;
      const cx = (x0 + x1) / 2;
      const kick = new THREE.Mesh(new THREE.BoxGeometry(len, 0.17, KICK_D), darkSteelMat);
      kick.position.set(cx, 0.085, sz * (WALL_Z - KICK_D / 2));
      kick.receiveShadow = true;
      add(kick);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.22), plateMat);
      lip.position.set(cx, 0.185, sz * (WALL_Z - 0.11));
      lip.castShadow = true;
      add(lip);
      addContact('strip', cx, sz * (WALL_Z - 0.52), len, 0.44, sz > 0 ? Math.PI : 0, 0.0115);
      for (const dx of gridLines(len / 2, 0.25, 0.87)) bolts.push({ p: [cx + dx, 0.2, sz * (WALL_Z - 0.17)] });
    }
  }

  // ===== 4. recessed tread insert (walkway grate) =====
  const insetW = INSET_HALF_X * 2;
  const insetD = INSET_Z1 - INSET_Z0;

  // Sub-deck plate showing through the seams between the individual tread panels — dark, but a
  // real surface, so the insert reads as the darkest *material* in the room rather than a hole.
  const insetVoid = new THREE.Mesh(new THREE.BoxGeometry(insetW + 0.12, 0.02, insetD + 0.12), voidMat);
  insetVoid.position.set(0, 0.01, INSET_CZ);
  insetVoid.receiveShadow = true;
  add(insetVoid);

  // Boots polish the panel lips back to bright steel while the field between them stays dull.
  const edgeTrimsX: Xform[] = [];
  const edgeTrimsZ: Xform[] = [];
  const cols = 3;
  const rows = 3;
  const gap = 0.06;
  const plateW = (insetW - gap * (cols - 1)) / cols;
  const plateD = (insetD - gap * (rows - 1)) / rows;
  const plateGeo = new THREE.BoxGeometry(plateW, 0.05, plateD);
  const edgeGeoX = new THREE.BoxGeometry(plateW - 0.04, 0.012, 0.05);
  const edgeGeoZ = new THREE.BoxGeometry(0.05, 0.012, plateD - 0.04);
  for (let cx = 0; cx < cols; cx++) {
    for (let rz = 0; rz < rows; rz++) {
      const px = -INSET_HALF_X + plateW / 2 + cx * (plateW + gap);
      const pz = INSET_Z0 + plateD / 2 + rz * (plateD + gap);
      const plate = new THREE.Mesh(plateGeo, treadMat);
      plate.position.set(px, 0.025, pz);
      plate.castShadow = true;
      plate.receiveShadow = true;
      add(plate);
      for (const oz of [-1, 1]) edgeTrimsX.push({ p: [px, 0.049, pz + oz * (plateD / 2 - 0.03)] });
      for (const ox of [-1, 1]) edgeTrimsZ.push({ p: [px + ox * (plateW / 2 - 0.03), 0.049, pz] });
      for (const ox of [-1, 1]) {
        for (const oz of [-1, 1]) {
          bolts.push({ p: [px + ox * (plateW / 2 - 0.09), 0.056, pz + oz * (plateD / 2 - 0.09)] });
        }
      }
    }
  }
  add(instance(edgeGeoX, wornEdgeMat, edgeTrimsX));
  add(instance(edgeGeoZ, wornEdgeMat, edgeTrimsZ));

  // Bevelled frame rails around the insert, with a hazard chevron on the near edge.
  const railZGeo = new THREE.BoxGeometry(0.11, 0.062, insetD + 0.22);
  const railXGeo = new THREE.BoxGeometry(insetW + 0.22, 0.062, 0.11);
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(railZGeo, plateMat);
    rail.position.set(sx * (INSET_HALF_X + 0.055), 0.031, INSET_CZ);
    rail.castShadow = true;
    rail.receiveShadow = true;
    add(rail);
    for (const z of gridLines(insetD / 2, 0.1, 0.55).map((v) => v + INSET_CZ)) bolts.push({ p: [sx * (INSET_HALF_X + 0.055), 0.064, z] });
  }
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(railXGeo, plateMat);
    rail.position.set(0, 0.031, INSET_CZ + sz * (insetD / 2 + 0.055));
    rail.castShadow = true;
    rail.receiveShadow = true;
    add(rail);
  }
  addContact('strip', -(INSET_HALF_X + 0.32), INSET_CZ, insetD + 0.3, 0.42, -Math.PI / 2, 0.0115);
  addContact('strip', 0, INSET_Z1 + 0.36, insetW + 0.5, 0.42, 0, 0.0115);
  const insetChevron = new THREE.Mesh(new THREE.BoxGeometry(insetW + 0.22, 0.008, 0.075), hazardMatShort);
  insetChevron.position.set(0, 0.066, INSET_Z1 + 0.055);
  add(insetChevron);

  // Linear cable trough along the insert's +X edge — dark channel, cross slats, an outboard
  // rail, and the white lane line the reference paints just outboard of it.
  const troughBase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, insetD), voidMat);
  troughBase.position.set(TROUGH_X, 0.012, INSET_CZ);
  troughBase.receiveShadow = true;
  add(troughBase);
  const slatXforms: Xform[] = [];
  for (let z = INSET_Z0 + 0.07; z < INSET_Z1; z += 0.125) slatXforms.push({ p: [TROUGH_X, 0.028, z] });
  add(instance(new THREE.BoxGeometry(0.3, 0.02, 0.05), plateMat, slatXforms));
  const troughRail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.055, insetD + 0.1), plateMat);
  troughRail.position.set(TROUGH_X + 0.21, 0.028, INSET_CZ);
  troughRail.castShadow = true;
  troughRail.receiveShadow = true;
  add(troughRail);
  addContact('strip', TROUGH_X + 0.5, INSET_CZ, insetD + 0.2, 0.36, Math.PI / 2, 0.0115);
  const whiteLine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.006, insetD + 0.4), paintWhiteMat);
  whiteLine.position.set(TROUGH_X + 0.36, 0.004, INSET_CZ);
  add(whiteLine);

  // ===== 4b. foreground grate wear =====
  // Spawn is z=4, inside the insert's 0.6-5.8 span, so the plate row centred near z=3.2 sits
  // right under the player and fills most of the foreground frame — the critic's single biggest
  // gap ("the corrugated grate panel in the very front... comparatively flat"). The diffuse/normal
  // maps alone read as a printed texture at that scale; what's missing is the localised wear the
  // brief asks for — grime pooled in the seams a boot can't reach, scuffing down the row people
  // actually stand on, and a couple of loose fasteners resting on the surface rather than only
  // driven into it.
  const rowCenterZ = [0, 1, 2].map((rz) => INSET_Z0 + plateD / 2 + rz * (plateD + gap));
  addWear('scuff', 0, rowCenterZ[1], insetW - 0.08, plateD - 0.06, 0.14, 0.052);
  addWear('scuff', -0.5, rowCenterZ[0], plateW * 1.7, plateD - 0.1, -0.22, 0.052);
  addWear('oil', 0.55, rowCenterZ[1] - 0.25, 0.6, 0.6, 0.5, 0.053);
  const seamZs = [(rowCenterZ[0] + rowCenterZ[1]) / 2, (rowCenterZ[1] + rowCenterZ[2]) / 2];
  for (const sz of seamZs) addWear('grime', 0, sz, insetW + 0.04, gap + 0.18, 0, 0.054);
  const colCenterX = [0, 1, 2].map((cx) => -INSET_HALF_X + plateW / 2 + cx * (plateW + gap));
  const seamXs = [(colCenterX[0] + colCenterX[1]) / 2, (colCenterX[1] + colCenterX[2]) / 2];
  for (const sx of seamXs) addWear('grime', sx, INSET_CZ, gap + 0.16, insetD - 0.1, 0, 0.054);
  // Loose fasteners lying flat on the near plate, part of the same instanced bolt batch.
  bolts.push({ p: [0.62, 0.054, rowCenterZ[1] - 0.35], r: [Math.PI / 2, 0.4, 0] });
  bolts.push({ p: [-0.42, 0.054, rowCenterZ[1] + 0.3], r: [Math.PI / 2, 1.15, 0] });

  // ===== 5. ribbed threshold band =====
  // The horizontal ribbed step that splits the reference's foreground from the console bay.
  // Left out of ctx.floorMeshes so the ground raycast keeps returning the flat deck.
  // ROOM_W - 0.5 reached x = ±5.75, 0.185 m past the 5.565 wall face; the band now dies into the
  // kick strip's room-facing face at ±5.405 instead.
  const bandW = BAND_W;
  const bandBase = new THREE.Mesh(new THREE.BoxGeometry(bandW, 0.06, 0.9), stepMat);
  bandBase.position.set(0, 0.03, THRESHOLD_Z);
  bandBase.castShadow = true;
  bandBase.receiveShadow = true;
  add(bandBase);
  const bandRibs: Xform[] = gridLines(bandW / 2, 0.04, 0.19).map((x) => ({ p: [x, 0.068, THRESHOLD_Z] as [number, number, number] }));
  add(instance(new THREE.BoxGeometry(0.08, 0.022, 0.76), darkSteelMat, bandRibs, true));
  for (const sz of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(bandW, 0.03, 0.1), plateMat);
    lip.position.set(0, 0.015, THRESHOLD_Z + sz * 0.5);
    lip.castShadow = true;
    add(lip);
    const chevron = new THREE.Mesh(new THREE.BoxGeometry(bandW - 0.16, 0.008, 0.07), hazardMatLong);
    chevron.position.set(0, 0.065, THRESHOLD_Z + sz * 0.41);
    add(chevron);
    addContact('strip', 0, THRESHOLD_Z + sz * 0.72, bandW, 0.36, sz > 0 ? 0 : Math.PI, 0.0115);
  }
  for (const x of gridLines(bandW / 2, 0.1, 0.8)) {
    bolts.push({ p: [x, 0.032, THRESHOLD_Z - 0.5] });
    bolts.push({ p: [x, 0.032, THRESHOLD_Z + 0.5] });
  }

  // ===== 6. painted lane markings =====
  // Two long lines flanking the walkway insert, plus caution cross-hatch where the lane meets
  // the threshold band — hazard yellow stays a narrow accent, never a large surface.
  const laneGeo = new THREE.BoxGeometry(0.07, 0.006, insetD + 0.6);
  for (const lx of [-(TROUGH_X + 0.9), TROUGH_X + 0.9]) {
    const lane = new THREE.Mesh(laneGeo, hazardMatLong);
    lane.position.set(lx, 0.004, INSET_CZ);
    add(lane);
  }
  for (const sx of [-1, 1]) {
    const patch = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.006, 0.55), hazardMatPatch);
    patch.position.set(sx * (bandW * 0.32), 0.005, THRESHOLD_Z + 1.2);
    add(patch);
  }

  // ===== 7. stencils =====
  // Every one of these used to run under solid deck hardware, which cut the lettering into pieces:
  // NAV reached z = -2.65 against the band's outer lip face at -2.45; REPAIR (x ∈ [3.65, 4.55],
  // z ∈ [1.65, 2.55]) overlapped the access plate at z ∈ [1.24, 1.96]; CAUTION overlapped the hatch
  // frame (x ∈ [-3.57, -2.43], z ∈ [-2.37, -1.23]) and, once the band grew to the wall, the band
  // too; E-LOCK was placed off HALF_D so it landed on the airlock cross LED channel.
  const stencils: [string, number, number, number, number][] = [
    ['NAV', 0, THRESHOLD_Z + 1.1, 1.0, 0],
    ['REPAIR', 4.1, 2.75, 0.9, -Math.PI / 2],
    ['CAUTION', -4.75, -2.0, 0.85, Math.PI / 2],
    ['E-LOCK', 0, WALL_Z - 1.115, 0.95, Math.PI],
  ];
  for (const [label, x, z, size, rot] of stencils) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: buildFloorStencilTexture(label), transparent: true, roughness: 0.85, metalness: 0.05, depthWrite: false }),
    );
    decal.position.set(x, 0.007, z);
    decal.rotation.set(-Math.PI / 2, 0, rot);
    decal.renderOrder = 2;
    add(decal);
  }

  // ===== 8. deck hatch =====
  const hatchX = -3.0;
  const hatchZ = -1.8;
  const hatchWell = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.02, 1.02), voidMat);
  hatchWell.position.set(hatchX, 0.01, hatchZ);
  add(hatchWell);
  // 0.92 x 0.92 m — the second-largest unmapped field on the deck, and only ~40% of it is covered
  // by the ribs. Shares the walkway insert's bare-plate material outright (no new texture, no new
  // material): both are removable plate over the sub-deck, so they should read as the same stock.
  const hatchCover = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.045, 0.92), treadMat);
  hatchCover.position.set(hatchX, 0.023, hatchZ);
  hatchCover.castShadow = true;
  hatchCover.receiveShadow = true;
  add(hatchCover);
  addContact('pad', hatchX, hatchZ, 1.55, 1.5, 0, 0.0115);
  const hatchRibs: Xform[] = [];
  for (let i = -2; i <= 2; i++) hatchRibs.push({ p: [hatchX, 0.05, hatchZ + i * 0.17] });
  add(instance(new THREE.BoxGeometry(0.82, 0.016, 0.07), plateMat, hatchRibs));
  for (const [ox, oz] of [[0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]] as [number, number][]) {
    bolts.push({ p: [hatchX + ox, 0.05, hatchZ + oz] });
  }
  for (const oz of [0.53, -0.53]) {
    const hatchFrame = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.05, 0.08), plateMat);
    hatchFrame.position.set(hatchX, 0.025, hatchZ + oz);
    hatchFrame.castShadow = true;
    hatchFrame.receiveShadow = true;
    add(hatchFrame);
  }
  for (const ox of [0.53, -0.53]) {
    const hatchFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 1.14), plateMat);
    hatchFrame.position.set(hatchX + ox, 0.025, hatchZ);
    hatchFrame.castShadow = true;
    hatchFrame.receiveShadow = true;
    add(hatchFrame);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 14, Math.PI), plateMat);
  handle.rotation.set(Math.PI / 2, 0, 0);
  handle.position.set(hatchX + 0.26, 0.052, hatchZ);
  handle.castShadow = true;
  handle.receiveShadow = true;
  add(handle);
  const hingeGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.14, 8);
  add(instance(hingeGeo, plateMat, [
    { p: [hatchX - 0.45, 0.048, hatchZ + 0.24], r: [0, 0, Math.PI / 2] },
    { p: [hatchX - 0.45, 0.048, hatchZ - 0.24], r: [0, 0, Math.PI / 2] },
  ]));
  const hatchLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshStandardMaterial({ map: buildFloorStencilTexture('SUB-DECK'), transparent: true, roughness: 0.85, metalness: 0.1, depthWrite: false }),
  );
  // Above the hatch ribs (0.05 centre, 0.016 tall, so tops at 0.058), which the label used to sit
  // *inside* at 0.047 — the five ribs cut the lettering into strips.
  hatchLabel.position.set(hatchX, 0.0595, hatchZ);
  hatchLabel.rotation.x = -Math.PI / 2;
  hatchLabel.renderOrder = 2;
  add(hatchLabel);

  // ===== 9. floor vents =====
  const ventFrameGeo = new THREE.BoxGeometry(0.66, 0.035, 0.46);
  const ventWellGeo = new THREE.BoxGeometry(0.56, 0.02, 0.36);
  const ventSlatGeo = new THREE.BoxGeometry(0.52, 0.014, 0.032);
  const ventSpots: [number, number, number][] = [
    [2.7, -2.4, 0],
    [-2.4, 3.0, Math.PI / 2],
  ];
  for (const [vx, vz, vr] of ventSpots) {
    const group = new THREE.Group();
    group.position.set(vx, 0, vz);
    group.rotation.y = vr;
    const frame = new THREE.Mesh(ventFrameGeo, plateMat);
    frame.position.y = 0.0175;
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);
    const well = new THREE.Mesh(ventWellGeo, voidMat);
    well.position.y = 0.03;
    group.add(well);
    const slats: Xform[] = [];
    for (let i = 0; i < 7; i++) slats.push({ p: [0, 0.04, -0.15 + i * 0.05] });
    group.add(instance(ventSlatGeo, darkSteelMat, slats));
    add(group);
    addContact('pad', vx, vz, 1.15, 0.9, -vr, 0.0115);
    const c = Math.cos(vr);
    const s = Math.sin(vr);
    for (const [ox, oz] of [[0.29, 0.19], [-0.29, 0.19], [0.29, -0.19], [-0.29, -0.19]] as [number, number][]) {
      bolts.push({ p: [vx + ox * c + oz * s, 0.038, vz - ox * s + oz * c] });
    }
  }

  // ===== 10. cargo tie-down rings =====
  const ringPadGeo = new THREE.BoxGeometry(0.17, 0.02, 0.17);
  const ringGeo = new THREE.TorusGeometry(0.05, 0.013, 5, 12);
  const ringSpots: [number, number][] = [
    [-3.0, -3.6], [3.0, -3.8], [-3.3, 1.0], [3.3, 0.6],
    [-2.6, 4.6], [2.6, 4.4], [-2.9, -0.6], [2.9, -1.6],
  ];
  add(instance(ringPadGeo, plateMat, ringSpots.map(([x, z]) => ({ p: [x, 0.01, z] as [number, number, number] }))));
  add(instance(ringGeo, darkSteelMat, ringSpots.map(([x, z], i) => ({
    p: [x, 0.035, z] as [number, number, number],
    r: [Math.PI / 2 - 0.5, i * 0.9, 0] as [number, number, number],
  })), true));
  for (const [x, z] of ringSpots) addContact('pad', x, z, 0.42, 0.42, 0, 0.0115);

  // ===== 11. bolted access plates =====
  const accessSpots: [number, number, number][] = [
    [-4.6, -5.4, 0],
    [4.5, 1.6, Math.PI / 2],
  ];
  for (const [ax, az, ar] of accessSpots) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.025, 0.5), plateMat);
    plate.position.set(ax, 0.012, az);
    plate.rotation.y = ar;
    plate.castShadow = true;
    plate.receiveShadow = true;
    add(plate);
    addContact('pad', ax, az, 1.2, 0.95, -ar, 0.0115);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.34), darkSteelMat);
    inner.position.set(ax, 0.02, az);
    inner.rotation.y = ar;
    add(inner);
    const c = Math.cos(ar);
    const s = Math.sin(ar);
    for (const [ox, oz] of [[0.31, 0.2], [-0.31, 0.2], [0.31, -0.2], [-0.31, -0.2]] as [number, number][]) {
      bolts.push({ p: [ax + ox * c + oz * s, 0.028, az - ox * s + oz * c] });
    }
  }

  // ===== 12. recessed deck LED strips =====
  // Cool light on flat geometry (not a point light), seated in a dark channel so it reads as
  // inset hardware rather than a painted line, flanking the walkway insert. ShipInteriorScene
  // drives emissiveIntensity for everything in ctx.floorLedMats every frame, so the base value
  // set here only has to survive that clamp without pushing the bloom threshold.
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x0e2028, emissive: 0x2f8bad, emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.1 });
  ctx.floorLedMats.push(ledMat);
  for (const sx of [-1, 1]) {
    const lx = sx * (INSET_HALF_X + 0.42);
    const len = insetD + 0.3;
    const channel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, len), darkSteelMat);
    channel.position.set(lx, 0.017, INSET_CZ);
    channel.castShadow = true;
    channel.receiveShadow = true;
    add(channel);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, len - 0.1), ledMat);
    strip.position.set(lx, 0.036, INSET_CZ);
    add(strip);
  }
  // Short cross run just inboard of the airlock threshold. HALF_D - 0.5 put it at z = 7.5, i.e.
  // straight through the kick strip's z ∈ [7.405, 7.565] footprint; 0.105 clears the kick's
  // room-facing face by 5 cm with the channel's own 0.055 half-depth.
  const crossZ = KICK_Z - 0.105;
  const crossChannel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.035, 0.11), darkSteelMat);
  crossChannel.position.set(0, 0.017, crossZ);
  crossChannel.castShadow = true;
  crossChannel.receiveShadow = true;
  add(crossChannel);
  const crossStrip = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.012, 0.045), ledMat);
  crossStrip.position.set(0, 0.036, crossZ);
  add(crossStrip);

  // ===== 13. loose grate panels =====
  // The signature foreground prop in the reference: removable walkway grilles pulled up and
  // stacked on the deck. One geometry set, three placements, one leaning on another.
  const gratePanel = () => {
    const g = new THREE.Group();
    const railGeo = new THREE.BoxGeometry(1.5, 0.055, 0.075);
    const endGeo = new THREE.BoxGeometry(0.075, 0.055, 0.62);
    for (const oz of [-0.28, 0.28]) {
      const rail = new THREE.Mesh(railGeo, grateMat);
      rail.position.set(0, 0.0275, oz);
      g.add(rail);
    }
    for (const ox of [-0.71, 0.71]) {
      const end = new THREE.Mesh(endGeo, grateMat);
      end.position.set(ox, 0.0275, 0);
      g.add(end);
    }
    const rungs: Xform[] = [];
    for (let i = -6; i <= 6; i++) rungs.push({ p: [i * 0.108, 0.032, 0] });
    g.add(instance(new THREE.BoxGeometry(0.045, 0.03, 0.55), grateMat, rungs));
    return g;
  };
  const grateA = gratePanel();
  grateA.position.set(-2.5, 0.0, HALF_D - 1.6);
  grateA.rotation.y = 0.34;
  add(grounded(grateA));
  // The tilted panel measured z ∈ [6.308, 7.696] at HALF_D - 1.0, so its far corner drove 0.13 m
  // through the 7.565 wall face; 6.62 puts its span at [5.93, 7.32], clear of the kick strip's
  // 7.405 face. Its low corner also measured y = -0.002, 2 mm under the deck — the panel's own
  // tilt drops 0.057 below its origin, so the origin has to sit at 0.06, not 0.055.
  const grateB = grateA.clone();
  grateB.position.set(-3.05, 0.06, 6.62);
  grateB.rotation.set(0.05, 0.62, 0.03);
  add(grateB);
  const grateC = grateA.clone();
  grateC.position.set(-3.4, 0.0, HALF_D - 2.9);
  grateC.rotation.y = 1.32;
  add(grateC);
  addContact('pad', -2.5, HALF_D - 1.6, 2.1, 1.15, -0.34, 0.0115);
  addContact('pad', -3.05, 6.62, 2.1, 1.15, -0.62, 0.0115);
  addContact('pad', -3.4, HALF_D - 2.9, 2.1, 1.15, -1.32, 0.0115);

  // ===== 14. localised wear =====
  // Motivated, not a uniform tint: traffic in the walking lane, oil where the deck is worked on,
  // grime pooling at the wall/deck joints and around the recessed trough.
  addWear('scuff', 0, 3.4, 2.6, 2.4);
  addWear('scuff', 0, 0.6, 2.8, 2.4, 0.25);
  addWear('scuff', 0, -1.4, 2.4, 2.0, -0.3);
  addWear('scuff', -2.6, HALF_D - 2.3, 2.2, 2.0, 0.8);
  addWear('oil', TROUGH_X + 0.2, INSET_CZ + 0.4, 1.3, 1.3, 0.35);
  addWear('oil', -3.0, -1.8, 1.4, 1.4, 1.1);
  addWear('oil', 2.7, -2.4, 1.1, 1.1, -0.6);
  // Wall-joint grime keys off the wall faces, not HALF_W / HALF_D — measured, these four ran to
  // x = ±5.85 / z = ±7.85 and lost their darkest half behind the wall shell.
  addWear('grime', -WALL_X + 1.0, -3.6, 1.7, 3.4);
  addWear('grime', WALL_X - 1.0, 1.4, 1.7, 3.6);
  addWear('grime', -2.2, WALL_Z - 1.0, 3.2, 1.5);
  addWear('grime', 2.6, WALL_Z - 1.0, 3.2, 1.5);
  addWear('grime', 0, -WALL_Z + 0.9, 4.2, 1.5);
  addWear('drip', hatchX + 0.55, hatchZ - 0.6, 1.0, 1.4, 0.3);

  // ===== 15. floor cable runs + coiled hose =====
  // The critic's single biggest gap: the open apron between the threshold band (z=-3.0) and the
  // walkway insert (z=0.6) reads as bare repeating tile with nothing breaking it up. Two flex
  // conduit runs cross it diagonally, motivated as power/data feeds — one plugs into the sub-deck
  // hatch, the other into the near floor vent — plus a coiled hose reel, the same kind of loose
  // floor-resting clutter the grate panels already establish for this module. Rubber cable gets
  // its own low-metal, high-roughness response distinct from every steel/paint material above.
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x201d1a, roughness: 0.78, metalness: 0.06, envMapIntensity: 0.25 });
  const coilMat = new THREE.MeshStandardMaterial({ color: 0xa8703a, roughness: 0.42, metalness: 0.55, envMapIntensity: 0.7 });
  // Saddle clamp: 0.075 tall so it stands on the deck and arches over the 6 cm cable. The old
  // 0.1 x 0.02 x 0.06 clip sat at y = 0.031, spanning the cable's own centreline (0.021, radius
  // 0.03), so all that showed of it was a 2 cm tab either side of the tube.
  const clipGeo = new THREE.BoxGeometry(0.11, 0.075, 0.026);
  const glandGeo = new THREE.BoxGeometry(0.16, 0.09, 0.12);
  /** Cable centreline: radius 0.03 + 2 mm, so the tube rests on the deck instead of measuring y = -0.009. */
  const CABLE_Y = 0.032;
  /** Wall penetration face: the gland bolts to the kick strip, whose room-facing face is at KICK_X. */
  const GLAND_X = KICK_X - 0.08;

  function buildCableRun(pts: [number, number][], y = CABLE_Y, radius = 0.03): THREE.CatmullRomCurve3 {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y, z)));
    const geo = new THREE.TubeGeometry(curve, pts.length * 8, radius, 8, false);
    const mesh = new THREE.Mesh(geo, cableMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    add(mesh);
    return curve;
  }
  function addCableClips(curve: THREE.CatmullRomCurve3, count: number) {
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const rot = Math.atan2(tangent.x, tangent.z);
      const clip = new THREE.Mesh(clipGeo, plateMat);
      clip.position.set(p.x, 0.0375, p.z);
      clip.rotation.y = rot;
      clip.castShadow = true;
      clip.receiveShadow = true;
      add(clip);
      // Anchor bolts flank the saddle, clear of its 0.055 half-width plus their own 0.026 radius,
      // driven into the deck. They used to be stacked on the cable's centreline at y = 0.045,
      // inside the tube (top 0.051), where only a millimetre of each head poked out.
      for (const s of [-1, 1]) {
        bolts.push({ p: [p.x + s * 0.085 * Math.cos(rot), 0.008, p.z - s * 0.085 * Math.sin(rot)] });
      }
      addContact('pad', p.x, p.z, 0.24, 0.16, rot, 0.0112);
    }
  }

  // Both glands measured x = ∓[5.7, 5.86] — the whole wall penetration, and the first 0.19 m of
  // each cable run, were behind the 5.565 wall face. They now bolt to the kick strip's room-facing
  // face at ±5.405, with the run starting at the gland's inboard face.
  const runA = buildCableRun([[-(GLAND_X - 0.08), 0.3], [-4.4, -0.6], [-3.15, -1.35], [-2.05, -1.95]]);
  addCableClips(runA, 3);
  const glandA = new THREE.Mesh(glandGeo, darkSteelMat);
  glandA.position.set(-GLAND_X, 0.045, 0.3);
  glandA.castShadow = true;
  glandA.receiveShadow = true;
  add(glandA);
  addContact('pad', -(GLAND_X - 0.04), 0.3, 0.4, 0.32, 0, 0.0113);
  addWear('grime', -3.6, -1.1, 1.6, 1.1, 0.6);

  const runB = buildCableRun([[GLAND_X - 0.08, 0.45], [4.1, -0.2], [3.35, -1.3], [2.85, -2.05]]);
  addCableClips(runB, 3);
  const glandB = new THREE.Mesh(glandGeo, darkSteelMat);
  glandB.position.set(GLAND_X, 0.045, 0.45);
  glandB.castShadow = true;
  glandB.receiveShadow = true;
  add(glandB);
  addContact('pad', GLAND_X - 0.04, 0.45, 0.4, 0.32, 0, 0.0113);
  addWear('grime', 3.7, -0.7, 1.5, 1.1, -0.5);

  // Coiled hose reel resting on open deck — small saturated copper accent per the palette table,
  // footprint well under a square metre so it stays an accent rather than a large rust surface.
  const coilGroup = new THREE.Group();
  coilGroup.position.set(4.3, 0.0, -0.8);
  [0.32, 0.25, 0.18, 0.11].forEach((r, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.024, 6, 20), coilMat);
    ring.rotation.x = -Math.PI / 2;
    // 6 radial segments, so the tube's lowest vertex sits 0.024·cos(30°) = 0.0208 under the ring
    // centre: at y = 0.012 the coil measured a min of -0.0088, sunk almost a centimetre into the
    // deck. 0.023 lands the bottom ring 2 mm proud of it.
    ring.position.y = 0.023 + i * 0.001;
    ring.castShadow = true;
    ring.receiveShadow = true;
    coilGroup.add(ring);
  });
  add(coilGroup);
  addContact('pad', 4.3, -0.8, 0.9, 0.9, 0, 0.0113);
  addWear('oil', 4.3, -0.55, 0.7, 0.6, 0.4);

  // ===== bolt batch =====
  add(instance(boltGeo, boltMat, bolts));
}
