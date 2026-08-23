import * as THREE from 'three';
import {
  buildHazardStripeTexture,
  buildFloorStencilTexture,
  buildWarningStripeTexture,
} from '../ShipTextures';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D } from './ctx';
import {
  buildPaintedDeckTexture,
  buildDeckRoughnessTexture,
  buildTreadPlateTexture,
  buildDeckWearTexture,
  buildTarpTexture,
} from './floorTextures';

const HALF_W = ROOM_W / 2;
const HALF_D = ROOM_D / 2;

/** Recessed bare-plate insert running down the middle of the deck, as in the reference. */
const INSET_X = 1.93;
const INSET_Z0 = 0.62;
const INSET_Z1 = 4.48;
/** Linear drain/cable trough hugging the insert's +X edge. */
const TROUGH_X = 2.20;

type Xform = { p: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] };

const dummy = new THREE.Object3D();

function instance(geo: THREE.BufferGeometry, mat: THREE.Material, xforms: Xform[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, xforms.length);
  xforms.forEach((x, i) => {
    dummy.position.set(x.p[0], x.p[1], x.p[2]);
    dummy.rotation.set(x.r?.[0] ?? 0, x.r?.[1] ?? 0, x.r?.[2] ?? 0);
    dummy.scale.set(x.s?.[0] ?? 1, x.s?.[1] ?? 1, x.s?.[2] ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The deck. Rebuilt against the reference: a bone-white painted plate field (the brightest large
 * surface in the room) panelised with raised seam ribs and bolt heads, broken by a recessed
 * dark tread insert, a ribbed threshold band, painted lane markings, and a dense scatter of
 * floor-level hardware — loose grate panels, a cable trough, wall-base pipe runs, hatches,
 * vents, tie-downs and work mats.
 */
export function buildFloor(ctx: InteriorCtx): void {
  const add = (o: THREE.Object3D) => ctx.scene.add(o);

  // ===== shared materials =====
  // Palette per the brief: painted deck #c9c2b4–#ddd6c6, bare plate #6e737c–#8a8f98, shadowed
  // structure #2b3138–#3d444c. The low emissive terms are a tonemapping lift, not a colour —
  // ACES crushes the mid-lows and the deck has to stay the brightest thing on the ground plane.
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: buildPaintedDeckTexture(ROOM_W / 2.4, ROOM_D / 2.4),
    roughnessMap: buildDeckRoughnessTexture(ROOM_W / 2.4, ROOM_D / 2.4),
    roughness: 0.94,
    metalness: 0.06,
    envMapIntensity: 0.7,
    emissive: 0x3a382f,
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
  });
  const deckRibMat = new THREE.MeshStandardMaterial({ color: 0xc4bdad, roughness: 0.78, metalness: 0.14, emissive: 0x35332b, emissiveIntensity: 0.45 });
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x9d978b, roughness: 0.48, metalness: 0.62, emissive: 0x2b2926, emissiveIntensity: 0.45 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x828790, roughness: 0.54, metalness: 0.62, envMapIntensity: 1.3, emissive: 0x2c3036, emissiveIntensity: 0.5 });
  const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x3c4149, roughness: 0.62, metalness: 0.55, emissive: 0x1f2228, emissiveIntensity: 0.6 });
  const voidMat = new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.9, metalness: 0.2 });
  const treadMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: buildTreadPlateTexture(4, 4),
    roughness: 0.72,
    metalness: 0.5,
    envMapIntensity: 1.1,
    emissive: 0x23262c,
    emissiveIntensity: 0.55,
  });
  const paintYellowMat = new THREE.MeshStandardMaterial({ color: 0xd8a63a, roughness: 0.8, metalness: 0.05, emissive: 0x3a2c10, emissiveIntensity: 0.45 });
  const paintWhiteMat = new THREE.MeshStandardMaterial({ color: 0xe6e2d6, roughness: 0.86, metalness: 0.04, emissive: 0x33322c, emissiveIntensity: 0.45 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x7b818b, roughness: 0.5, metalness: 0.7, envMapIntensity: 1.4, emissive: 0x282c33, emissiveIntensity: 0.5 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xa8703a, roughness: 0.55, metalness: 0.75, emissive: 0x2e1e0f, emissiveIntensity: 0.6 });
  const grateMat = new THREE.MeshStandardMaterial({ color: 0xb08c3c, roughness: 0.62, metalness: 0.45, emissive: 0x2e2410, emissiveIntensity: 0.55 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.85, metalness: 0.1, emissive: 0x1b1d22, emissiveIntensity: 0.7 });
  const hoseMat = new THREE.MeshStandardMaterial({ color: 0xc19a34, roughness: 0.65, metalness: 0.25, emissive: 0x30260e, emissiveIntensity: 0.55 });

  const hazardTex = buildHazardStripeTexture();
  hazardTex.repeat.set(28, 1);
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.72, metalness: 0.18, emissive: 0x2a2212, emissiveIntensity: 0.45 });
  const hazardTexShort = buildHazardStripeTexture();
  hazardTexShort.repeat.set(10, 1);
  const hazardMatShort = new THREE.MeshStandardMaterial({ map: hazardTexShort, roughness: 0.72, metalness: 0.18, emissive: 0x2a2212, emissiveIntensity: 0.45 });
  const hazardTexPatch = buildHazardStripeTexture();
  hazardTexPatch.repeat.set(3, 1);
  const hazardMatPatch = new THREE.MeshStandardMaterial({ map: hazardTexPatch, roughness: 0.72, metalness: 0.18, emissive: 0x2a2212, emissiveIntensity: 0.45 });

  // Bolt heads are collected across every sub-assembly and drawn as one instanced batch.
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
    m.renderOrder = 2;
    add(m);
  };

  // ===== 1. deck slab =====
  const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.2, ROOM_D), deckMat);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  add(floor);
  ctx.floorMeshes.push(floor);

  // A polished traffic zone in front of the console: same paint, far lower roughness, so it
  // throws a specular smear the surrounding matte deck does not.
  const polishMat = new THREE.MeshStandardMaterial({
    color: 0xfffdf6,
    map: buildPaintedDeckTexture(1.6, 1.2),
    roughness: 0.42,
    metalness: 0.2,
    envMapIntensity: 1.6,
    emissive: 0x3d3a30,
    emissiveIntensity: 0.5,
  });
  const polish = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), polishMat);
  polish.rotation.x = -Math.PI / 2;
  polish.position.set(0, 0.003, -2.3);
  add(polish);

  // ===== 2. panel seam ribs + bolts =====
  // Raised 3 cm ribs on a 1.5 m grid. Real geometry rather than a seam texture: at deck grazing
  // angles the rib top catches light and drops a hard shadow line, which a map cannot fake.
  const ribGeoX = new THREE.BoxGeometry(8.7, 0.016, 0.05);
  const ribGeoZ = new THREE.BoxGeometry(0.05, 0.016, 11.7);
  const ribZs = [-4.5, -3.0, -1.5, 0, 1.5, 3.0, 4.5];
  const ribXs = [-3.0, -1.5, 0, 1.5, 3.0];
  for (const z of ribZs) {
    const rib = new THREE.Mesh(ribGeoX, deckRibMat);
    rib.position.set(0, 0.008, z);
    rib.receiveShadow = true;
    add(rib);
    for (let x = -3.9; x <= 3.9; x += 0.87) bolts.push({ p: [x, 0.017, z] });
  }
  for (const x of ribXs) {
    const rib = new THREE.Mesh(ribGeoZ, deckRibMat);
    rib.position.set(x, 0.008, 0);
    rib.receiveShadow = true;
    add(rib);
    for (let z = -5.4; z <= 5.4; z += 0.9) bolts.push({ p: [x, 0.017, z] });
  }

  // ===== 3. wall-base kick strip =====
  // Coving the deck into the walls, so the floor never just intersects a vertical plane.
  const kickSideGeo = new THREE.BoxGeometry(0.16, 0.17, 11.62);
  const kickSideLipGeo = new THREE.BoxGeometry(0.22, 0.03, 11.62);
  const kickEndGeo = new THREE.BoxGeometry(8.62, 0.17, 0.16);
  const kickEndLipGeo = new THREE.BoxGeometry(8.62, 0.03, 0.22);
  for (const sx of [-1, 1]) {
    const kick = new THREE.Mesh(kickSideGeo, darkSteelMat);
    kick.position.set(sx * (HALF_W - 0.16), 0.085, 0);
    kick.receiveShadow = true;
    add(kick);
    const lip = new THREE.Mesh(kickSideLipGeo, plateMat);
    lip.position.set(sx * (HALF_W - 0.17), 0.185, 0);
    add(lip);
    for (let z = -5.4; z <= 5.4; z += 0.9) bolts.push({ p: [sx * (HALF_W - 0.23), 0.2, z] });
  }
  for (const sz of [-1, 1]) {
    const kick = new THREE.Mesh(kickEndGeo, darkSteelMat);
    kick.position.set(0, 0.085, sz * (HALF_D - 0.16));
    kick.receiveShadow = true;
    add(kick);
    const lip = new THREE.Mesh(kickEndLipGeo, plateMat);
    lip.position.set(0, 0.185, sz * (HALF_D - 0.17));
    add(lip);
    for (let x = -3.9; x <= 3.9; x += 0.87) bolts.push({ p: [x, 0.2, sz * (HALF_D - 0.23)] });
  }

  // ===== 4. recessed tread insert =====
  const insetW = INSET_X * 2;
  const insetD = INSET_Z1 - INSET_Z0;
  const insetCz = (INSET_Z0 + INSET_Z1) / 2;

  // Black void plate showing through the seams between the individual tread panels.
  const insetVoid = new THREE.Mesh(new THREE.BoxGeometry(insetW + 0.12, 0.02, insetD + 0.12), voidMat);
  insetVoid.position.set(0, 0.01, insetCz);
  add(insetVoid);

  const cols = 3;
  const rows = 2;
  const gap = 0.06;
  const plateW = (insetW - gap * (cols - 1)) / cols;
  const plateD = (insetD - gap * (rows - 1)) / rows;
  const plateGeo = new THREE.BoxGeometry(plateW, 0.05, plateD);
  for (let cx = 0; cx < cols; cx++) {
    for (let rz = 0; rz < rows; rz++) {
      const px = -INSET_X + plateW / 2 + cx * (plateW + gap);
      const pz = INSET_Z0 + plateD / 2 + rz * (plateD + gap);
      const plate = new THREE.Mesh(plateGeo, treadMat);
      plate.position.set(px, 0.025, pz);
      plate.receiveShadow = true;
      add(plate);
      for (const ox of [-1, 1]) {
        for (const oz of [-1, 1]) {
          bolts.push({ p: [px + ox * (plateW / 2 - 0.09), 0.056, pz + oz * (plateD / 2 - 0.09)] });
        }
      }
    }
  }

  // Bevelled frame rails around the insert, with a hazard chevron on the near edge.
  const railZGeo = new THREE.BoxGeometry(0.11, 0.062, insetD + 0.22);
  const railXGeo = new THREE.BoxGeometry(insetW + 0.22, 0.062, 0.11);
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(railZGeo, plateMat);
    rail.position.set(sx * (INSET_X + 0.055), 0.031, insetCz);
    add(rail);
    for (let z = INSET_Z0; z <= INSET_Z1; z += 0.55) bolts.push({ p: [sx * (INSET_X + 0.055), 0.064, z] });
  }
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(railXGeo, plateMat);
    rail.position.set(0, 0.031, insetCz + sz * (insetD / 2 + 0.055));
    add(rail);
  }
  const insetChevron = new THREE.Mesh(new THREE.BoxGeometry(insetW + 0.22, 0.008, 0.075), hazardMatShort);
  insetChevron.position.set(0, 0.066, INSET_Z1 + 0.055);
  add(insetChevron);

  // Linear trough along the insert's +X edge — dark channel, cross slats, flanking rails, and
  // the white lane line the reference paints just outboard of it.
  const troughBase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, insetD), voidMat);
  troughBase.position.set(TROUGH_X, 0.012, insetCz);
  add(troughBase);
  const slatXforms: Xform[] = [];
  for (let z = INSET_Z0 + 0.07; z < INSET_Z1; z += 0.125) slatXforms.push({ p: [TROUGH_X, 0.028, z] });
  add(instance(new THREE.BoxGeometry(0.30, 0.02, 0.05), plateMat, slatXforms));
  // Only the outboard rail: the insert's own +X frame rail already closes the inboard side.
  const troughRail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.055, insetD + 0.1), plateMat);
  troughRail.position.set(TROUGH_X + 0.21, 0.028, insetCz);
  add(troughRail);
  const whiteLine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.006, insetD + 0.4), paintWhiteMat);
  whiteLine.position.set(TROUGH_X + 0.36, 0.004, insetCz);
  add(whiteLine);

  // ===== 5. ribbed threshold band =====
  // The horizontal ribbed step that splits the reference's foreground from the console bay.
  // Deliberately only 6 cm proud with 3 cm lead-in lips, and left out of ctx.floorMeshes, so the
  // ground raycast keeps returning the flat deck and the walk to the console stays unchanged.
  const bandZ = -0.45;
  const bandBase = new THREE.Mesh(new THREE.BoxGeometry(8.66, 0.06, 0.9), plateMat);
  bandBase.position.set(0, 0.03, bandZ);
  bandBase.receiveShadow = true;
  add(bandBase);
  const bandRibs: Xform[] = [];
  for (let x = -4.22; x <= 4.22; x += 0.19) bandRibs.push({ p: [x, 0.068, bandZ] });
  add(instance(new THREE.BoxGeometry(0.08, 0.022, 0.76), darkSteelMat, bandRibs));
  for (const sz of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(8.66, 0.03, 0.1), plateMat);
    lip.position.set(0, 0.015, bandZ + sz * 0.5);
    add(lip);
    const chevron = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.008, 0.07), hazardMat);
    chevron.position.set(0, 0.065, bandZ + sz * 0.41);
    add(chevron);
  }
  for (let x = -4.0; x <= 4.0; x += 0.8) {
    bolts.push({ p: [x, 0.032, bandZ - 0.5] });
    bolts.push({ p: [x, 0.032, bandZ + 0.5] });
  }

  // ===== 6. painted lane markings =====
  const laneGeo = new THREE.BoxGeometry(0.07, 0.006, 4.3);
  // Split around the threshold band; the +X run stops short of the cable well.
  const lanes: [number, number, number][] = [
    [-3.35, -3.15, 4.3],
    [-3.35, 2.7, 5.2],
    [3.35, -3.15, 4.3],
    [3.35, 1.75, 3.3],
  ];
  for (const [lx, zc, len] of lanes) {
    const lane = new THREE.Mesh(laneGeo, paintYellowMat);
    lane.position.set(lx, 0.004, zc);
    lane.scale.z = len / 4.3;
    add(lane);
  }
  // Short cross-hatched caution block where the walking lane meets the threshold band.
  for (const sx of [-1, 1]) {
    const patch = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.006, 0.5), hazardMatPatch);
    patch.position.set(sx * 2.9, 0.005, bandZ + 1.1);
    add(patch);
  }

  // ===== 7. stencils =====
  const stencils: [string, number, number, number, number][] = [
    ['NAV', 0, -2.35, 0.95, 0],
    ['REPAIR', 3.3, 1.7, 0.85, -Math.PI / 2],
    ['CAUTION', -2.95, -1.9, 0.8, Math.PI / 2],
    ['E-LOCK', 0, 5.35, 0.9, Math.PI],
  ];
  for (const [label, x, z, size, rot] of stencils) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: buildFloorStencilTexture(label), transparent: true, roughness: 0.85, metalness: 0.05, depthWrite: false }),
    );
    decal.position.set(x, 0.007, z);
    decal.rotation.set(-Math.PI / 2, 0, rot);
    decal.renderOrder = 3;
    add(decal);
  }

  // ===== 8. deck hatch =====
  const hatchX = 2.95;
  const hatchZ = -2.45;
  const hatchWell = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.02, 1.02), voidMat);
  hatchWell.position.set(hatchX, 0.01, hatchZ);
  add(hatchWell);
  const hatchCover = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.045, 0.92), darkSteelMat);
  hatchCover.position.set(hatchX, 0.023, hatchZ);
  hatchCover.receiveShadow = true;
  add(hatchCover);
  const hatchRibs: Xform[] = [];
  for (let i = -2; i <= 2; i++) hatchRibs.push({ p: [hatchX, 0.05, hatchZ + i * 0.17] });
  add(instance(new THREE.BoxGeometry(0.82, 0.016, 0.07), plateMat, hatchRibs));
  for (const [ox, oz] of [[0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]] as [number, number][]) {
    bolts.push({ p: [hatchX + ox, 0.05, hatchZ + oz] });
  }
  const hatchFrame = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.05, 0.08), plateMat);
  hatchFrame.position.set(hatchX, 0.025, hatchZ + 0.53);
  add(hatchFrame);
  const hatchFrame2 = hatchFrame.clone();
  hatchFrame2.position.z = hatchZ - 0.53;
  add(hatchFrame2);
  const hatchFrame3 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 1.14), plateMat);
  hatchFrame3.position.set(hatchX + 0.53, 0.025, hatchZ);
  add(hatchFrame3);
  const hatchFrame4 = hatchFrame3.clone();
  hatchFrame4.position.x = hatchX - 0.53;
  add(hatchFrame4);
  // Recessed lift handle and a hinge pair, so the cover reads as removable hardware.
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 14, Math.PI), plateMat);
  handle.rotation.set(Math.PI / 2, 0, 0);
  handle.position.set(hatchX + 0.26, 0.052, hatchZ);
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
  hatchLabel.position.set(hatchX, 0.047, hatchZ);
  hatchLabel.rotation.x = -Math.PI / 2;
  hatchLabel.renderOrder = 3;
  add(hatchLabel);

  // ===== 9. floor vents =====
  const ventFrameGeo = new THREE.BoxGeometry(0.66, 0.035, 0.46);
  const ventWellGeo = new THREE.BoxGeometry(0.56, 0.02, 0.36);
  const ventSlatGeo = new THREE.BoxGeometry(0.52, 0.014, 0.032);
  const ventSpots: [number, number, number][] = [
    [-2.85, -1.35, 0],
    [3.9, -4.4, Math.PI / 2],
    [-1.45, 5.15, 0],
    [1.35, -5.25, 0],
  ];
  for (const [vx, vz, vr] of ventSpots) {
    const group = new THREE.Group();
    group.position.set(vx, 0, vz);
    group.rotation.y = vr;
    const frame = new THREE.Mesh(ventFrameGeo, plateMat);
    frame.position.y = 0.0175;
    group.add(frame);
    const well = new THREE.Mesh(ventWellGeo, voidMat);
    well.position.y = 0.03;
    group.add(well);
    const slats: Xform[] = [];
    for (let i = 0; i < 7; i++) slats.push({ p: [0, 0.04, -0.15 + i * 0.05] });
    group.add(instance(ventSlatGeo, darkSteelMat, slats));
    add(group);
    for (const [ox, oz] of [[0.29, 0.19], [-0.29, 0.19], [0.29, -0.19], [-0.29, -0.19]] as [number, number][]) {
      const c = Math.cos(vr);
      const s = Math.sin(vr);
      bolts.push({ p: [vx + ox * c + oz * s, 0.038, vz - ox * s + oz * c] });
    }
  }

  // ===== 10. cargo tie-down rings =====
  const ringPadGeo = new THREE.BoxGeometry(0.17, 0.02, 0.17);
  const ringGeo = new THREE.TorusGeometry(0.05, 0.013, 5, 12);
  const ringSpots: [number, number][] = [
    [-3.35, -2.2], [3.35, -3.0], [-3.35, 1.9], [3.3, 1.05],
    [-1.4, -3.6], [1.4, -3.6], [-2.6, 1.25], [2.6, 1.25], [-4.0, 4.9], [4.0, -0.9],
  ];
  add(instance(ringPadGeo, plateMat, ringSpots.map(([x, z]) => ({ p: [x, 0.01, z] as [number, number, number] }))));
  add(instance(ringGeo, darkSteelMat, ringSpots.map(([x, z], i) => ({
    p: [x, 0.035, z] as [number, number, number],
    r: [Math.PI / 2 - 0.5, i * 0.9, 0] as [number, number, number],
  }))));

  // ===== 11. bolted access plates =====
  const accessSpots: [number, number, number][] = [
    [-3.6, -4.3, 0],
    [3.72, 0.35, Math.PI / 2],
    [-2.35, -4.55, 0],
  ];
  for (const [ax, az, ar] of accessSpots) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.025, 0.5), plateMat);
    plate.position.set(ax, 0.012, az);
    plate.rotation.y = ar;
    plate.receiveShadow = true;
    add(plate);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.34), darkSteelMat);
    inner.position.set(ax, 0.02, az);
    inner.rotation.y = ar;
    add(inner);
    for (const [ox, oz] of [[0.31, 0.2], [-0.31, 0.2], [0.31, -0.2], [-0.31, -0.2]] as [number, number][]) {
      const c = Math.cos(ar);
      const s = Math.sin(ar);
      bolts.push({ p: [ax + ox * c + oz * s, 0.028, az - ox * s + oz * c] });
    }
  }

  // ===== 12. loose grate panels =====
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
  grateA.position.set(-2.55, 0.0, 4.55);
  grateA.rotation.y = 0.34;
  add(grateA);
  const grateB = grateA.clone();
  grateB.position.set(-3.05, 0.055, 5.15);
  grateB.rotation.set(0.05, 0.62, 0.03);
  add(grateB);
  const grateC = grateA.clone();
  grateC.position.set(-3.4, 0.0, 2.9);
  grateC.rotation.y = 1.32;
  add(grateC);

  // ===== 13. cable coil in a recessed well =====
  const coilCx = 3.35;
  const coilCz = 4.25;
  const wellShape = roundedRect(1.45, 1.1, 0.3);
  const wellHole = roundedRect(1.29, 0.94, 0.24);
  wellShape.holes.push(new THREE.Path(wellHole.getPoints(48)));
  const wellRim = new THREE.Mesh(new THREE.ExtrudeGeometry(wellShape, { depth: 0.045, bevelEnabled: false, curveSegments: 12 }), plateMat);
  wellRim.rotation.x = -Math.PI / 2;
  wellRim.position.set(coilCx, 0.002, coilCz);
  add(wellRim);
  const wellFloor = new THREE.Mesh(new THREE.ShapeGeometry(wellHole, 12), darkSteelMat);
  wellFloor.rotation.x = -Math.PI / 2;
  wellFloor.position.set(coilCx, 0.004, coilCz);
  add(wellFloor);
  for (const [ox, oz] of [[0.66, 0.44], [-0.66, 0.44], [0.66, -0.44], [-0.66, -0.44]] as [number, number][]) {
    bolts.push({ p: [coilCx + ox, 0.048, coilCz + oz] });
  }
  // Two loops of flex hose coiled into the well.
  for (const [w, d, r, y] of [[1.18, 0.82, 0.045, 0.05], [0.86, 0.54, 0.04, 0.055]] as [number, number, number, number][]) {
    const pts: THREE.Vector3[] = [];
    const n = 44;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const ct = Math.cos(t);
      const st = Math.sin(t);
      pts.push(new THREE.Vector3(
        coilCx + (w / 2) * Math.sign(ct) * Math.abs(ct) ** 0.55,
        y + Math.sin(t * 3) * 0.008,
        coilCz + (d / 2) * Math.sign(st) * Math.abs(st) ** 0.55,
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.4);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, r, 7, true), hoseMat);
    hose.castShadow = true;
    add(hose);
  }

  // ===== 14. wall-base pipe runs =====
  const pipeGeo = new THREE.CylinderGeometry(0.105, 0.105, 1, 12);
  const thinPipeGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 10);
  const flangeGeo = new THREE.CylinderGeometry(0.135, 0.135, 0.07, 12);
  const saddleGeo = new THREE.BoxGeometry(0.1, 0.2, 0.13);
  const runs: [number, number, number, number][] = [
    [-4.18, -5.2, 0.7, 0.31],
    [-4.32, -1.0, 2.9, 0.52],
    [4.18, -5.2, -0.7, 0.31],
    [4.3, -5.2, -2.4, 0.5],
  ];
  const flanges: Xform[] = [];
  const saddles: Xform[] = [];
  for (const [px, z0, z1, py] of runs) {
    const len = z1 - z0;
    const pipe = new THREE.Mesh(py > 0.4 ? thinPipeGeo : pipeGeo, py > 0.4 ? copperMat : pipeMat);
    pipe.scale.y = len;
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(px, py, (z0 + z1) / 2);
    pipe.castShadow = true;
    add(pipe);
    for (let z = z0 + 0.6; z < z1; z += 1.45) {
      flanges.push({ p: [px, py, z], r: [Math.PI / 2, 0, 0], s: py > 0.4 ? [0.55, 1, 0.55] : [1, 1, 1] });
      if (py < 0.4) saddles.push({ p: [px, 0.105, z] });
    }
    // Corrosion running down the wall-base pipes onto the deck below them.
    addWear('drip', px + (px < 0 ? 0.32 : -0.32), (z0 + z1) / 2 + 1.1, 1.1, 1.5, px < 0 ? 0.2 : -0.2);
  }
  add(instance(flangeGeo, plateMat, flanges));
  add(instance(saddleGeo, darkSteelMat, saddles));

  // A loose rubber hose snaking along the -X wall base, breaking the pipe run's straight read.
  const hosePts = [
    new THREE.Vector3(-3.55, 0.05, -4.6),
    new THREE.Vector3(-3.22, 0.05, -3.2),
    new THREE.Vector3(-3.52, 0.05, -1.9),
    new THREE.Vector3(-3.15, 0.05, -0.6),
    new THREE.Vector3(-3.45, 0.05, 0.6),
  ];
  const looseHose = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hosePts), 64, 0.045, 7, false),
    rubberMat,
  );
  looseHose.castShadow = true;
  add(looseHose);

  // ===== 15. recessed deck LED strips =====
  // Cool light, kept as a low emissive on flat geometry (not a point light) so bloom can't blow
  // out, and seated in a dark channel so it reads as inset hardware rather than a painted line.
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x0a2530, emissive: 0x4fb8e0, emissiveIntensity: 1.0, roughness: 0.5, metalness: 0.1 });
  ctx.floorLedMats.push(ledMat);
  const ledChannelMat = darkSteelMat;
  const ledRuns: [number, number, number][] = [
    [-3.75, -4.4, -0.95],
    [-3.75, 1.15, 4.7],
    [3.75, -3.9, -1.45],
    [3.75, 1.9, 3.4],
  ];
  for (const [lx, z0, z1] of ledRuns) {
    const len = z1 - z0;
    const channel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, len), ledChannelMat);
    channel.position.set(lx, 0.017, (z0 + z1) / 2);
    add(channel);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, len - 0.1), ledMat);
    strip.position.set(lx, 0.036, (z0 + z1) / 2);
    add(strip);
  }
  // Short cross run just inboard of the airlock threshold.
  const crossChannel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.035, 0.11), ledChannelMat);
  crossChannel.position.set(0, 0.017, 5.6);
  add(crossChannel);
  const crossStrip = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.012, 0.045), ledMat);
  crossStrip.position.set(0, 0.036, 5.6);
  add(crossStrip);

  // ===== 16. work mats =====
  const tarpGeo = new THREE.PlaneGeometry(1, 1);
  const tarps: [number, number, number, number, number, number][] = [
    [-2.6, -3.05, 2.1, 1.7, 0.2, 1],
    [2.6, -4.2, 1.9, 1.4, -0.35, 2],
  ];
  for (const [tx, tz, tw, td, trot, seed] of tarps) {
    const mat = new THREE.MeshStandardMaterial({
      map: buildTarpTexture(seed),
      transparent: true,
      roughness: 0.95,
      metalness: 0.02,
      emissive: 0x38352d,
      emissiveIntensity: 0.45,
      depthWrite: false,
    });
    const tarp = new THREE.Mesh(tarpGeo, mat);
    tarp.position.set(tx, 0.009, tz);
    tarp.rotation.set(-Math.PI / 2, 0, trot);
    tarp.scale.set(tw, td, 1);
    tarp.renderOrder = 2;
    add(tarp);
  }

  // ===== 17. small floor clutter =====
  // Tool crate: chamfered body, ribbed lid, hazard band, feet — not a bare box.
  const crateBodyMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.68, metalness: 0.4, emissive: 0x24282e, emissiveIntensity: 0.55 });
  const crate = new THREE.Group();
  crate.position.set(-3.25, 0, 0.3);
  crate.rotation.y = 0.24;
  const crateBody = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.4), crateBodyMat);
  crateBody.position.y = 0.17;
  crateBody.castShadow = true;
  crate.add(crateBody);
  const crateLid = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.44), plateMat);
  crateLid.position.y = 0.345;
  crate.add(crateLid);
  const crateRibs: Xform[] = [];
  for (const ox of [-0.17, 0, 0.17]) crateRibs.push({ p: [ox, 0.375, 0] });
  crate.add(instance(new THREE.BoxGeometry(0.05, 0.014, 0.42), darkSteelMat, crateRibs));
  const crateBandTex = buildWarningStripeTexture('amber');
  crateBandTex.repeat.set(4, 1);
  const crateBand = new THREE.Mesh(
    new THREE.BoxGeometry(0.59, 0.06, 0.41),
    new THREE.MeshStandardMaterial({ map: crateBandTex, roughness: 0.65, emissive: 0x2a2210, emissiveIntensity: 0.5 }),
  );
  crateBand.position.y = 0.1;
  crate.add(crateBand);
  const feet: Xform[] = [];
  for (const ox of [-0.24, 0.24]) for (const oz of [-0.15, 0.15]) feet.push({ p: [ox, 0.02, oz] });
  crate.add(instance(new THREE.BoxGeometry(0.07, 0.04, 0.07), darkSteelMat, feet));
  add(crate);

  // Coiled power cable resting near the trough.
  const coilTorusGeo = new THREE.TorusGeometry(0.24, 0.035, 7, 20);
  add(instance(coilTorusGeo, rubberMat, [
    { p: [-1.05, 0.038, -1.55], r: [Math.PI / 2, 0, 0] },
    { p: [-1.05, 0.078, -1.55], r: [Math.PI / 2, 0, 0], s: [0.62, 0.62, 1] },
    { p: [-1.05, 0.112, -1.55], r: [Math.PI / 2, 0, 0], s: [0.34, 0.34, 1] },
  ]));

  // Stacked spare tread plates leaning against the -X kick strip.
  const spareGeo = new THREE.BoxGeometry(1.0, 0.04, 0.7);
  add(instance(spareGeo, treadMat, [
    { p: [-2.9, 0.02, -2.6], r: [0, 0.12, 0] },
    { p: [-2.85, 0.062, -2.56], r: [0, 0.02, 0] },
    { p: [-2.93, 0.104, -2.64], r: [0, 0.2, 0] },
  ]));

  // Flat conduit bundle crossing the deck behind the console bay.
  const conduitGeo = new THREE.CylinderGeometry(0.032, 0.032, 2.7, 8);
  add(instance(conduitGeo, rubberMat, [
    { p: [-2.6, 0.03, -5.05], r: [0, 0, Math.PI / 2] },
    { p: [-2.6, 0.03, -4.97], r: [0, 0, Math.PI / 2] },
    { p: [-2.6, 0.062, -5.01], r: [0, 0, Math.PI / 2] },
  ]));
  const clampXforms: Xform[] = [];
  for (let x = -3.7; x <= -1.5; x += 0.72) clampXforms.push({ p: [x, 0.03, -5.01] });
  add(instance(new THREE.BoxGeometry(0.07, 0.11, 0.2), plateMat, clampXforms));

  // ===== 18. localised wear =====
  // Motivated, not a uniform tint: traffic in the walking lane, oil where the deck is worked on,
  // grime pooling at the wall/deck joints.
  addWear('scuff', 0, -1.6, 2.6, 2.2);
  addWear('scuff', 0, 0.9, 3.0, 1.8, 0.3);
  addWear('scuff', 0, 3.6, 2.4, 2.0, -0.4);
  addWear('scuff', -1.9, 4.9, 2.2, 2.0, 0.8);
  addWear('oil', 1.15, -1.05, 1.5, 1.5, 0.35);
  addWear('oil', -2.7, -3.6, 1.2, 1.2, 1.1);
  addWear('oil', 3.05, -1.45, 1.0, 1.0, -0.6);
  addWear('grime', -4.0, -3.4, 1.6, 3.2);
  addWear('grime', 4.0, 1.4, 1.6, 3.4);
  addWear('grime', -2.2, 5.5, 3.0, 1.4);
  addWear('grime', 2.6, 5.5, 3.0, 1.4);
  addWear('grime', 0, -5.3, 4.0, 1.4);

  // ===== bolt batch =====
  add(instance(boltGeo, boltMat, bolts));
}

/** Rounded-rectangle path used for the recessed cable well. */
function roundedRect(w: number, d: number, r: number): THREE.Shape {
  const hw = w / 2;
  const hd = d / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return shape;
}
