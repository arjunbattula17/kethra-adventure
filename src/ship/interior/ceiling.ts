import * as THREE from 'three';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D, ROOM_H } from './ctx';
import {
  buildCeilingPlateTexture,
  buildCeilingPlateRoughness,
  buildCeilingPlateNormal,
  buildCorrugatedDeckTexture,
  buildCorrugatedDeckNormal,
  buildCorrugatedDeckRoughness,
  buildPaintedTrimTexture,
  buildPaintedTrimRoughness,
  buildPipeSteelTexture,
  buildPipeRoughness,
  buildGrilleTexture,
  buildCeilingDripTexture,
  buildCeilingSootTexture,
  buildCeilingStreakTexture,
} from './ceilingTextures';

/**
 * Flat ceiling slab over the kit wall tops. The kit's own TopAstra caps close the top of each
 * wall bay (they run y 3..5, the full ROOM_H), but they don't span the open middle of a 12x16
 * room on their own — there is no Quaternius "ceiling" category in this kit, so this stays the
 * one hand-built structural piece, resized to the new footprint and dropped down 4 cm so it seats
 * just under the wall tops instead of poking through them.
 *
 * Round 3: the slab + bare beams read as flat and undressed next to the reference's overhead,
 * which mixes panel materials and hangs real conduit off the structure. `lighting.ts` already
 * owns every light fixture (pendants, sconces, recessed troffers) — this module adds the
 * *unlit* dressing around them: a conduit run with clamp brackets, junction boxes, recessed vent
 * grilles and a patch of corrugated decking, plus wear decals motivated by that new geometry.
 * Everything sits well clear of lighting.ts's fixture footprints (checked against its troffer/
 * pendant/sconce coordinates) so nothing new pokes through a lit housing.
 */
export function buildCeiling(ctx: InteriorCtx): void {
  const plateMap = buildCeilingPlateTexture();
  const plateRough = buildCeilingPlateRoughness();
  const plateNormal = buildCeilingPlateNormal();
  plateMap.repeat.set(ROOM_W / 2, ROOM_D / 2);
  plateRough.repeat.set(ROOM_W / 2, ROOM_D / 2);
  plateNormal.repeat.set(ROOM_W / 2, ROOM_D / 2);

  // Painted composite panel: mid metalness, wide roughness spread from the map. Metalness was
  // dropped from 0.28 — a painted panel has diffuse response everywhere, and the old value was
  // starving the parts of the ceiling that only ever see the room's dim hemisphere/ambient term,
  // which is most of the crushed-black area the round-3 audit measured (27.7% vs a 0.1% ref).
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: plateMap,
    roughnessMap: plateRough,
    normalMap: plateNormal,
    roughness: 1,
    metalness: 0.14,
  });
  slabMat.normalScale.set(0.8, 0.8);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.12, ROOM_D), slabMat);
  slab.position.set(0, ROOM_H - 0.06, 0);
  slab.receiveShadow = true;
  ctx.scene.add(slab);

  // Shallow transverse beams for a little structural rhythm, echoing the wall bay spacing so the
  // ceiling doesn't read as a bare painted lid.
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x4c5662, roughness: 0.65, metalness: 0.4 });
  const beamGeo = new THREE.BoxGeometry(ROOM_W - 0.3, 0.2, 0.28);
  const beamZs = [-6, -2, 2, 6];
  for (const z of beamZs) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, ROOM_H - 0.22, z);
    beam.castShadow = true;
    beam.receiveShadow = true;
    ctx.scene.add(beam);
  }

  // ===============================================================================================
  // Corrugated deck accent — one patch of ribbed panelling breaking up the bolted-plate slab, set
  // in the console-end corner clear of every lighting.ts fixture footprint.
  // ===============================================================================================
  const corrMap = buildCorrugatedDeckTexture();
  const corrNormal = buildCorrugatedDeckNormal();
  const corrRough = buildCorrugatedDeckRoughness();
  corrMap.repeat.set(3, 3);
  corrNormal.repeat.set(3, 3);
  corrRough.repeat.set(3, 3);
  const corrMat = new THREE.MeshStandardMaterial({
    map: corrMap,
    normalMap: corrNormal,
    roughnessMap: corrRough,
    roughness: 1,
    metalness: 0.22,
  });
  const corrPanel = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), corrMat);
  corrPanel.rotation.x = Math.PI / 2;
  corrPanel.position.set(2.7, ROOM_H - 0.135, -6.5);
  corrPanel.receiveShadow = true;
  ctx.scene.add(corrPanel);

  // ===============================================================================================
  // Painted-trim material shared by junction boxes, pipe brackets and vent housings — genuinely
  // distinct from both the bare pipe steel and the bolted plate: low metalness, semi-matte paint.
  // ===============================================================================================
  const trimMap = buildPaintedTrimTexture();
  const trimRough = buildPaintedTrimRoughness();
  const trimMat = new THREE.MeshStandardMaterial({
    map: trimMap,
    roughnessMap: trimRough,
    roughness: 1,
    metalness: 0.12,
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    ctx.scene.add(m);
    return m;
  };

  // ===============================================================================================
  // Overhead conduit run — bare steel, high metalness, tight roughness: a deliberately different
  // material response from the painted slab and trim. Runs the depth of the room at x = -4.6,
  // clear of the x = -3.667 troffer housings (0.23 clearance) and below beam height.
  // ===============================================================================================
  const pipeMap = buildPipeSteelTexture();
  const pipeRough = buildPipeRoughness();
  const PIPE_LEN = 14.6;
  pipeMap.repeat.set(2, 5);
  pipeRough.repeat.set(2, 5);
  const pipeMat = new THREE.MeshStandardMaterial({
    map: pipeMap,
    roughnessMap: pipeRough,
    roughness: 1,
    metalness: 0.78,
  });
  const PIPE_X = -4.6;
  const PIPE_Y = 4.55;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, PIPE_LEN, 12), pipeMat);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(PIPE_X, PIPE_Y, 0);
  pipe.castShadow = true;
  pipe.receiveShadow = true;
  ctx.scene.add(pipe);

  // Clamp brackets tying the run back up to the slab.
  const bracketZs = [-6, -3.6, -1.2, 1.2, 3.6, 6];
  for (const z of bracketZs) {
    box(0.22, 0.16, 0.1, PIPE_X, PIPE_Y + 0.02, z, trimMat);
    box(0.05, ROOM_H - 0.06 - PIPE_Y, 0.05, PIPE_X, (ROOM_H - 0.06 + PIPE_Y) / 2, z, trimMat);
  }

  // ===============================================================================================
  // Junction boxes: base flange + smaller body for a chamfered silhouette rather than one sharp
  // box, mounted to the beam undersides away from every lighting.ts fixture.
  // ===============================================================================================
  const addJunctionBox = (x: number, z: number) => {
    box(0.34, 0.05, 0.34, x, ROOM_H - 0.22 - 0.1 - 0.025, z, trimMat);
    box(0.22, 0.16, 0.22, x, ROOM_H - 0.22 - 0.1 - 0.13, z, trimMat);
    box(0.05, 0.1, 0.05, x, ROOM_H - 0.22 - 0.1 - 0.26, z, trimMat);
  };
  addJunctionBox(2.2, -6);
  addJunctionBox(-2.6, 6);

  // ===============================================================================================
  // Recessed vent grilles — dark louvred housing let into the slab. A third, genuinely different
  // material story (matte composite/mesh) alongside painted trim and bare pipe steel.
  // ===============================================================================================
  const grilleMat = new THREE.MeshStandardMaterial({ map: buildGrilleTexture(), roughness: 0.72, metalness: 0.4 });
  const addVent = (x: number, z: number) => {
    box(0.86, 0.05, 0.86, x, ROOM_H - 0.06 - 0.06 - 0.025, z, trimMat);
    const louver = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), grilleMat);
    louver.rotation.x = Math.PI / 2;
    louver.position.set(x, ROOM_H - 0.06 - 0.06 - 0.052, z);
    louver.receiveShadow = true;
    ctx.scene.add(louver);
  };
  addVent(4.8, -3);
  addVent(-5.3, 2.6);

  // ===============================================================================================
  // Wear decals, motivated by the new geometry above rather than a uniform tint: a drip stain at
  // a pipe joint, a streak trail running off another bracket, and a soot bloom by the junction
  // box. Opaque-white-base multiply decals, matching the convention `addGrimeOverlay` in ctx.ts
  // uses — a cleared canvas would premultiply to a hard black quad under MultiplyBlending.
  // ===============================================================================================
  const addDecal = (
    map: THREE.Texture,
    width: number,
    height: number,
    position: THREE.Vector3,
    opacity: number,
  ) => {
    const mat = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(position);
    mesh.renderOrder = 1;
    ctx.scene.add(mesh);
  };
  const SLAB_FACE = ROOM_H - 0.06 - 0.055;
  addDecal(buildCeilingDripTexture(), 1.1, 1.1, new THREE.Vector3(PIPE_X, SLAB_FACE, -3.6), 0.5);
  addDecal(buildCeilingStreakTexture(), 0.9, 1.6, new THREE.Vector3(PIPE_X, SLAB_FACE, 1.2), 0.55);
  addDecal(buildCeilingSootTexture(), 1.0, 1.0, new THREE.Vector3(2.2, SLAB_FACE, -6.3), 0.45);
}
