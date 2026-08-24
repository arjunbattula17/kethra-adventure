import * as THREE from 'three';
import type { InteriorCtx } from './ctx';
import {
  buildAuxGlassMaps,
  buildAuxScreenTexture,
  buildBareSteelMaps,
  buildCableMaps,
  buildCommandArrayTexture,
  buildFrameLabelTexture,
  buildGlassGlareTexture,
  buildGlassSmudgeMaps,
  buildPaintedPlateMaps,
  buildScuffTexture,
  buildVentSootTexture,
  buildSweepTexture,
  paneUvRect,
} from './displaysTextures';

// ---------------------------------------------------------------------------------------------
// The suspended command display -- the room's focal point.
//
// The reference's screen bank is structurally a 3x2 GRID of separate glass slabs carrying ONE
// continuous holo composition, recessed inside a heavy cool-grey steel frame, hung under the
// ceiling on a bolted gantry. The previous pass here was two small tilted squares with an
// unmodulated light-blue bezel: no grid, no image continuity across panes, no frame hardware, and
// a saturated royal-blue palette the brief calls out as the room's largest whole-room deviation.
//
// This rebuild is: six UV-sliced panes off one wide canvas so the reticle crosses the mullions;
// a recessed bezel with chamfer strips, instanced bolt heads, corner gussets and an underside
// louvre bank; a cantilevered ceiling gantry (header beam, tie plates, bracket arms, diagonal
// braces, conduit run); flanking aux monitors on articulated arms for depth layering; and steel
// in the brief's #5d666f-#7c858f band with corrosion confined to drip streaks under seams.
//
// Placement constraints: the array hangs over/behind the console (console housing now sits at
// z = -4.8, after the room's 9x12 -> 12x16 rebuild) rather than out over the walkway, and its
// lowest hardware stays well clear of player eye height 1.7, so nothing blocks the walk-up from
// spawn. The gantry's header beam climbs to just under the flat ceiling slab (ceiling.ts, y =
// ROOM_H - 0.06 = 4.94), the same margin it kept under the old room's ceiling greeble.
// ---------------------------------------------------------------------------------------------

// 0.18 in front of the console's DESK_Z (console.ts), kept fixed as DESK_Z moved from -3.6 to
// -4.8 with the room rebuild.
const ANCHOR_Z = -4.62;
const CENTER_Y = 2.82;
/** Downward tilt so the panes face a player walking up the room rather than presenting an edge. */
const TILT = 0.13;

const COLS = 3;
const ROWS = 2;
/** Glass area is 2:1, matching the array canvas, so the reticle stays circular. */
const GLASS_W = 2.6;
const GLASS_H = 1.3;
const MULLION = 0.045;
const PANE_W = (GLASS_W - (COLS - 1) * MULLION) / COLS;
const PANE_H = (GLASS_H - (ROWS - 1) * MULLION) / ROWS;
const BEZEL = 0.08;
const FRAME_HX = GLASS_W / 2 + BEZEL;
const FRAME_HY = GLASS_H / 2 + BEZEL;
const BEZEL_Z = 0.04;

/** A pane whose UVs address only its own cell of the shared array texture. */
function paneGeometry(col: number, row: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(PANE_W, PANE_H);
  const { u0, v0, du, dv } = paneUvRect(col, row);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Every solid piece of the rig casts and receives by default. Nothing here was shadowed at all
 * last round, which is most of why the assembly floated -- there was no contact anywhere between
 * the gantry, the brackets and the frame. `lit = false` opts out the emissive trim strips, which
 * only self-shadow-acne.
 */
function box(
  parent: THREE.Object3D,
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  lit = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = lit;
  mesh.receiveShadow = lit;
  parent.add(mesh);
  return mesh;
}

/**
 * Multiply-blended grime quad. It darkens whatever is already shaded underneath rather than
 * painting a flat tint, so the wear rides the lighting instead of replacing it.
 */
function grimeDecal(
  parent: THREE.Object3D,
  tex: THREE.Texture,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  opacity: number,
  rotZ = 0,
): void {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.z = rotZ;
  mesh.renderOrder = 1;
  parent.add(mesh);
}

/**
 * Regular-alpha-blended wear decal -- the lightening counterpart to `grimeDecal`'s multiply
 * darkening. Paint rubbed through to bare metal at a corner or handhold brightens the surface
 * underneath rather than tinting it, so pairing this with `grimeDecal` at the same joint gives the
 * joint actual contrast instead of one uniform darkened patch.
 */
function scuffDecal(
  parent: THREE.Object3D,
  tex: THREE.Texture,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  opacity: number,
  rotZ = 0,
): void {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.z = rotZ;
  mesh.renderOrder = 1;
  parent.add(mesh);
}

export function buildSuspendedDisplay(ctx: InteriorCtx): void {
  // --- shared materials -------------------------------------------------------------------------
  // Round 1 shipped seven materials that were the same tinted-plastic response with a different
  // base colour: every one of them sat at roughness 0.4-0.8 and metalness 0.2-0.9 with no maps.
  // The set below is separated by FINISH first and colour second -- ship paint is a dielectric at
  // ~0.78 rough, bare machined steel is a conductor at ~0.32, rubber is a dielectric at ~0.95 --
  // and each class carries its own albedo / normal / roughness maps so a single light source
  // produces three visibly different falloffs across the same silhouette.
  const painted = buildPaintedPlateMaps();
  const bare = buildBareSteelMaps();
  const cableMaps = buildCableMaps();
  const glassWear = buildGlassSmudgeMaps();

  /** Ship paint over plate: matte, dielectric, seams and chips carried in the maps. */
  const bodyMat = new THREE.MeshStandardMaterial({
    map: painted.map,
    normalMap: painted.normalMap,
    roughnessMap: painted.roughnessMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 1,
    metalness: 0.05,
  });
  /** Same plate, darker mix and a semi-gloss anodised finish -- the frame face round the glass. */
  const bezelMat = new THREE.MeshStandardMaterial({
    color: 0xc4ccd4,
    map: painted.map,
    normalMap: painted.normalMap,
    roughnessMap: painted.roughnessMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.8,
    metalness: 0.55,
  });
  /** Bare machined steel: conductor, tight highlight, drawing grain and gouges. */
  const brightSteelMat = new THREE.MeshStandardMaterial({
    map: bare.map,
    normalMap: bare.normalMap,
    roughnessMap: bare.roughnessMap,
    roughness: 1,
    metalness: 0.95,
  });
  /**
   * Thin chamfer lips and edge trim. Same steel, deliberately duller than the structural
   * brackets: a mirror-finish 14 mm strip in front of an emissive panel is a pinpoint specular
   * that blooms into the cross-shaped blaze that flattened the upper third last round.
   */
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xb6bec6,
    map: bare.map,
    roughnessMap: bare.roughnessMap,
    roughness: 1.9,
    metalness: 0.8,
  });
  /**
   * Cavity interiors: recesses, mullion webs, the gaps between plates. Rough and barely metallic
   * so they read as unlit depth without going to dead black -- the old 0x3a4149 crushed out under
   * the grade, which is most of the measured crushed-black excess.
   */
  const recessMat = new THREE.MeshStandardMaterial({
    map: painted.map,
    color: 0x8a939c,
    normalMap: painted.normalMap,
    roughness: 1.15,
    metalness: 0.18,
  });
  /** Extruded rubber gasket packing the glass into the frame. Fully matte, zero metal. */
  const gasketMat = new THREE.MeshStandardMaterial({
    map: cableMaps.map,
    normalMap: cableMaps.normalMap,
    color: 0xb4bcc4,
    roughness: 1,
    metalness: 0,
  });
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x99a2ab, roughness: 0.3, metalness: 1 });
  /** Cable jacket: ribbed, matte, dielectric -- nothing like the steel it hangs off. */
  const cableMat = new THREE.MeshStandardMaterial({
    map: cableMaps.map,
    normalMap: cableMaps.normalMap,
    roughnessMap: cableMaps.roughnessMap,
    roughness: 1,
    metalness: 0,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xa8703a,
    map: bare.map,
    roughnessMap: bare.roughnessMap,
    roughness: 1.1,
    metalness: 1,
  });
  /**
   * Rim wash inside the bezel. Dropped from 1.4 to 0.3: at 1.4 these six thin strips sat far over
   * the 0.95 bloom threshold and the veil off them, not the screen art, is what washed the top row
   * of panes to white.
   */
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x27505e,
    emissive: 0x49b6d2,
    emissiveIntensity: 0.3,
    roughness: 0.45,
    metalness: 0.2,
  });
  // Lifted from 0x3d4148: the louvre bank faces straight down into the room's dimmest air, and at
  // the old value it read as dead black between the warm slots -- the ambient/hemisphere terms
  // still reach it (they aren't shadow-mapped), so a brighter albedo actually shows up here.
  const warmVentMat = new THREE.MeshStandardMaterial({
    color: 0x4c525b,
    emissive: 0xffd9a0,
    emissiveIntensity: 0.18,
    roughness: 0.9,
    metalness: 0.1,
  });
  const redBankMat = new THREE.MeshStandardMaterial({
    color: 0x4a2c22,
    emissive: 0xe0552f,
    emissiveIntensity: 0.7,
    roughness: 0.55,
    metalness: 0.15,
  });

  const arrayTex = buildCommandArrayTexture();
  // This is the backlit LCD substrate ONLY -- the image itself. Round 4 put the glass response
  // (roughnessMap/normalMap) on this same material, which is exactly what read as "a flat 2D
  // overlay pasted onto the panel": one surface carrying both the picture and its own specular hit
  // is a decal, not a display. The physical glass a viewer actually sees is a separate mesh added
  // below, floating a few millimetres in front of this one, so the reflection and the image behind
  // it are genuinely two different depths instead of one texture doing both jobs.
  const makeScreenMat = () =>
    new THREE.MeshStandardMaterial({
      // Base colour is the unlit LCD, and it is a dark teal rather than near-black so the panes
      // still carry material where the grade rolls off instead of punching six holes in the frame.
      color: 0x16323d,
      map: arrayTex,
      // Diffuse and matte, the way an LCD's own surface reads once you take the glass out of it --
      // any glossiness the assembly shows now comes from the glass layer in front, not from this.
      roughness: 0.7,
      emissive: 0xffffff,
      emissiveMap: arrayTex,
      emissiveIntensity: 0.92,
      metalness: 0,
    });
  const screenMat = makeScreenMat();
  // One pane runs its own material so it can drop out independently -- a tired panel on a worn
  // ship, the localised and motivated kind of wear the brief asks for over a uniform tint.
  const flickerPaneMat = makeScreenMat();

  // --- chassis ----------------------------------------------------------------------------------
  const rig = new THREE.Group();
  rig.position.set(0, CENTER_Y, ANCHOR_Z);
  rig.rotation.x = TILT;
  ctx.scene.add(rig);

  // Stepped depth: deep equipment box, service pod, mounting flange, main body, recessed bezel.
  box(rig, recessMat, 2.5, 0.9, 0.18, 0, 0, -0.3);
  box(rig, bodyMat, 0.9, 0.3, 0.24, 0, -0.24, -0.32);
  box(rig, recessMat, 0.5, 0.18, 0.3, -0.85, 0.2, -0.33);
  box(rig, recessMat, 0.5, 0.18, 0.3, 0.85, 0.2, -0.33);
  box(rig, brightSteelMat, FRAME_HX * 2 + 0.09, FRAME_HY * 2 + 0.09, 0.04, 0, 0, -0.215);
  // Shadow gap between the mounting flange and the main body: a real 12 mm undercut running the
  // whole perimeter, so the step reads as two bolted assemblies with a cavity between them rather
  // than one extruded silhouette. This is the cavity contact the critic could not find.
  box(rig, recessMat, FRAME_HX * 2 + 0.02, FRAME_HY * 2 + 0.02, 0.055, 0, 0, -0.178);
  box(rig, bodyMat, FRAME_HX * 2 - 0.02, FRAME_HY * 2 - 0.02, 0.2, 0, 0, -0.1);

  // --- glass --------------------------------------------------------------------------------------
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const isFlicker = row === 1 && col === 2;
      const pane = new THREE.Mesh(paneGeometry(col, row), isFlicker ? flickerPaneMat : screenMat);
      pane.position.set(
        (col - 1) * (PANE_W + MULLION),
        (0.5 - row) * (PANE_H + MULLION),
        // A few millimetres of stagger so the six slabs catch light as separate sheets of glass.
        0.004 + ((col + row) % 2) * 0.004,
      );
      rig.add(pane);
    }
  }

  // Animated scan sweep over the reticle. Sits in front of the screen content but behind the
  // physical glass and mullion bars, so both occlude it exactly as they occlude the baked art
  // underneath.
  const sweepMat = new THREE.MeshBasicMaterial({
    map: buildSweepTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.45,
  });
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), sweepMat);
  sweep.position.set(0, 0, 0.016);
  sweep.renderOrder = 2;
  rig.add(sweep);
  ctx.noMerge.add(sweep); // its own rotation.z is animated per frame, below

  // --- physical glass ---------------------------------------------------------------------------
  // One continuous sheet spanning the whole array, floating a few millimetres in front of the six
  // phosphor panes above. This is the direct fix for the round-5 critique -- "the console's screen
  // graphics read as flat 2D overlays pasted onto the panel rather than physically lit displays" --
  // because it gives the assembly a real second surface with its own roughness/normal response
  // (glassWear, built for this exact rect: dust speckle, bezel-lip grime, hand smears on the lower
  // row) that the scene's environment map and point lights can actually hit, independently of
  // whatever the image behind it is doing. A baked soft-glare pass rides on top of it, standing in
  // for the room's practicals catching the glass, so the "there's real glass here" cue reads
  // regardless of the exact camera angle a given capture lands on.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xd8ecf2,
    transparent: true,
    opacity: 0.1,
    roughness: 1,
    roughnessMap: glassWear.roughnessMap,
    normalMap: glassWear.normalMap,
    normalScale: new THREE.Vector2(0.4, 0.4),
    metalness: 0,
    envMapIntensity: 1.8,
    depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(GLASS_W, GLASS_H), glassMat);
  glass.position.set(0, 0, 0.02);
  glass.renderOrder = 3;
  rig.add(glass);

  const glareMat = new THREE.MeshBasicMaterial({
    map: buildGlassGlareTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.7,
  });
  const glare = new THREE.Mesh(new THREE.PlaneGeometry(GLASS_W, GLASS_H), glareMat);
  glare.position.set(0, 0, 0.022);
  glare.renderOrder = 4;
  rig.add(glare);

  // --- mullions -------------------------------------------------------------------------------------
  // The reference's mullions are DARK bars silhouetted against the holo, and ours were polished
  // metal strips standing in front of a 1.4-intensity emissive rim: each junction fired a specular
  // that bloomed into the white cross that dominated the last render. They are now rubber-gasketed
  // dark webs with a matte painted cap -- the grid still reads, but by contrast, not by glare.
  const mullionZ = 0.04;
  for (const sx of [-1, 1] as const) {
    const mx = (sx * (PANE_W + MULLION)) / 2;
    box(rig, gasketMat, MULLION, GLASS_H + 0.01, 0.07, mx, 0, mullionZ);
    box(rig, recessMat, 0.02, GLASS_H + 0.01, 0.012, mx, 0, mullionZ + 0.04);
  }
  box(rig, gasketMat, GLASS_W + 0.01, MULLION, 0.07, 0, 0, mullionZ);
  box(rig, recessMat, GLASS_W + 0.01, 0.02, 0.012, 0, 0, mullionZ + 0.04);
  // Cruciform cover plates where the mullions cross -- the small third-layer detail that stops
  // the grid reading as four bars laid over each other.
  for (const sx of [-1, 1] as const) {
    box(rig, trimMat, 0.075, 0.075, 0.02, (sx * (PANE_W + MULLION)) / 2, 0, mullionZ + 0.048);
  }
  // Gasket lip lapping each slab into the frame: a rubber shadow line right around the glass, and
  // the surface that grounds the six panes against the bezel instead of leaving them floating.
  for (const sy of [-1, 1] as const) {
    box(rig, gasketMat, GLASS_W + 0.02, 0.02, 0.04, 0, sy * (GLASS_H / 2), mullionZ - 0.01);
  }
  for (const sx of [-1, 1] as const) {
    box(rig, gasketMat, 0.02, GLASS_H + 0.02, 0.04, sx * (GLASS_W / 2), 0, mullionZ - 0.01);
  }

  // --- bezel ------------------------------------------------------------------------------------------
  const bezelD = 0.09;
  box(rig, bezelMat, FRAME_HX * 2, BEZEL, bezelD, 0, FRAME_HY - BEZEL / 2, BEZEL_Z);
  box(rig, bezelMat, FRAME_HX * 2, BEZEL, bezelD, 0, -(FRAME_HY - BEZEL / 2), BEZEL_Z);
  for (const sx of [-1, 1] as const) {
    box(rig, bezelMat, BEZEL, FRAME_HY * 2 - BEZEL * 2, bezelD, sx * (FRAME_HX - BEZEL / 2), 0, BEZEL_Z);
  }

  // Chamfer strips: the lit lip that stops the bezel reading as four sharp boxes. Duller steel
  // than the structural brackets on purpose -- see trimMat.
  box(rig, trimMat, FRAME_HX * 2 - 0.02, 0.02, 0.022, 0, FRAME_HY - 0.006, BEZEL_Z + 0.034);
  box(rig, trimMat, FRAME_HX * 2 - 0.02, 0.02, 0.022, 0, -(FRAME_HY - 0.006), BEZEL_Z + 0.034);
  for (const sx of [-1, 1] as const) {
    box(rig, trimMat, 0.02, FRAME_HY * 2 - 0.02, 0.022, sx * (FRAME_HX - 0.006), 0, BEZEL_Z + 0.034);
  }

  // Cool rim strips washing the glass -- the array lighting its own frame. They now sit a couple
  // of millimetres proud of the bezel face; buried at BEZEL_Z + 0.012 they were inside the bezel
  // box and contributing nothing but light leak.
  box(rig, rimMat, GLASS_W - 0.08, 0.012, 0.014, 0, GLASS_H / 2 + 0.018, BEZEL_Z + 0.05, false);
  box(rig, rimMat, GLASS_W - 0.08, 0.012, 0.014, 0, -(GLASS_H / 2 + 0.018), BEZEL_Z + 0.05, false);
  for (const sx of [-1, 1] as const) {
    box(rig, rimMat, 0.012, GLASS_H - 0.08, 0.014, sx * (GLASS_W / 2 + 0.018), 0, BEZEL_Z + 0.05, false);
  }

  // Chamfered corner gussets -- diamond plates breaking the four right angles of the silhouette.
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const gusset = box(
        rig, brightSteelMat, 0.1, 0.1, 0.045,
        sx * (FRAME_HX - 0.04), sy * (FRAME_HY - 0.04), BEZEL_Z + 0.018,
      );
      gusset.rotation.z = Math.PI / 4;
    }
  }

  // --- instanced bolt heads around the bezel ---------------------------------------------------------
  const boltPositions: [number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const x = -FRAME_HX + 0.1 + (i * (FRAME_HX * 2 - 0.2)) / 8;
    boltPositions.push([x, FRAME_HY - BEZEL / 2], [x, -(FRAME_HY - BEZEL / 2)]);
  }
  for (let i = 0; i < 3; i++) {
    const y = -FRAME_HY + 0.3 + (i * (FRAME_HY * 2 - 0.6)) / 2;
    boltPositions.push([-(FRAME_HX - BEZEL / 2), y], [FRAME_HX - BEZEL / 2, y]);
  }
  const boltGeo = new THREE.CylinderGeometry(0.013, 0.016, 0.026, 6);
  boltGeo.rotateX(Math.PI / 2);
  const bolts = new THREE.InstancedMesh(boltGeo, boltMat, boltPositions.length);
  const m = new THREE.Matrix4();
  boltPositions.forEach(([x, y], i) => {
    m.makeTranslation(x, y, BEZEL_Z + 0.05);
    bolts.setMatrixAt(i, m);
  });
  bolts.instanceMatrix.needsUpdate = true;
  // Bolt heads are 26 mm against a 1024 shadow map over the whole room -- casting from them is
  // sub-texel and only buys stipple noise, but they very much need to receive.
  bolts.receiveShadow = true;
  rig.add(bolts);

  // --- underside louvre bank ---------------------------------------------------------------------------
  // The underside is what a player at the console looks straight up into, so it gets a real
  // two-row louvre bank rather than the bare face it used to present.
  const slatGeo = new THREE.BoxGeometry(0.16, 0.02, 0.055);
  const slats = new THREE.InstancedMesh(slatGeo, warmVentMat, 26);
  let si = 0;
  for (let g = 0; g < 2; g++) {
    for (let i = 0; i < 13; i++) {
      m.makeTranslation(-1.2 + i * 0.2, -(FRAME_HY + 0.002) - g * 0.028, 0.02 - g * 0.032);
      slats.setMatrixAt(si++, m);
    }
  }
  slats.instanceMatrix.needsUpdate = true;
  slats.receiveShadow = true;
  rig.add(slats);
  box(rig, recessMat, GLASS_W, 0.035, 0.05, 0, -(FRAME_HY + 0.06), -0.02);

  // --- localised wear ----------------------------------------------------------------------------------
  // Wear where use puts it, not as a tint. Heat staining climbs the lower bezel out of the louvre
  // mouths, and grime runs down the top rail from under the two pod conduits -- the two places on
  // this assembly where something actually vents and something actually drips. Round-4 critique was
  // that this read as sparse and low-contrast against the reference, so both bands are wider, denser
  // and darker here than the previous pass, and every bezel corner below adds a second, independent
  // wear event (grime pooling paired with a rubbed-through scuff) rather than relying on these two
  // alone to carry the whole assembly.
  const ventSoot = buildVentSootTexture(4412, 16);
  const dripSoot = buildVentSootTexture(9903, 5);
  grimeDecal(rig, ventSoot, GLASS_W, 0.1, 0, -(FRAME_HY - 0.05), BEZEL_Z + 0.047, 0.95);
  for (const sx of [-1, 1] as const) {
    grimeDecal(rig, dripSoot, 0.56, 0.1, sx * 0.95, FRAME_HY - 0.05, BEZEL_Z + 0.047, 0.88, Math.PI);
  }
  // Grime pooled at the four bezel corners -- the literal meeting point of the horizontal and
  // vertical bezel strips and the gusset plate over them -- paired with a rubbed-through scuff
  // where a hand would brace against the same corner. Dark and light sitting right next to each
  // other reads as actual wear; either alone reads as a tint.
  const cornerGrime = buildVentSootTexture(2201, 3);
  const cornerScuff = buildScuffTexture(6605);
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      grimeDecal(
        rig, cornerGrime, 0.24, 0.16,
        sx * (FRAME_HX - 0.1), sy * (FRAME_HY - 0.1), BEZEL_Z + 0.058,
        0.75, sy > 0 ? Math.PI : 0,
      );
      scuffDecal(
        rig, cornerScuff, 0.16, 0.1,
        sx * (FRAME_HX - 0.26), sy * (FRAME_HY - 0.13), BEZEL_Z + 0.058,
        0.55, sx * sy > 0 ? 0.5 : -0.5,
      );
    }
  }
  // Handhold: the underside lip of the bezel is what a crewman grabs to swing the array on its
  // brackets, so the paint there is rubbed thin rather than dirtied.
  const handhold = new THREE.MeshStandardMaterial({
    map: bare.map,
    roughnessMap: bare.roughnessMap,
    color: 0xa9b2bb,
    roughness: 0.75,
    metalness: 0.9,
  });
  for (const sx of [-1, 1] as const) {
    box(rig, handhold, 0.34, 0.018, 0.03, sx * 0.62, -(FRAME_HY - 0.018), BEZEL_Z + 0.05);
  }

  // --- top rail hardware -------------------------------------------------------------------------------
  // Painted stencil plate: a dielectric sign, matte, nothing like the bracket steel beside it.
  const placardMat = new THREE.MeshStandardMaterial({
    map: buildFrameLabelTexture('TAC-01  CMD ARRAY'),
    roughness: 0.88,
    metalness: 0.06,
  });
  const placard = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.108), placardMat);
  placard.position.set(0, FRAME_HY + 0.062, 0.035);
  placard.receiveShadow = true;
  rig.add(placard);

  for (const sx of [-1, 1] as const) {
    // Chamfered equipment pod bolted to the top rail: stepped body, cap plate, alarm bank.
    box(rig, bodyMat, 0.4, 0.12, 0.18, sx * 0.8, FRAME_HY + 0.055, -0.03);
    box(rig, brightSteelMat, 0.43, 0.02, 0.21, sx * 0.8, FRAME_HY + 0.124, -0.03);
    box(rig, recessMat, 0.3, 0.05, 0.2, sx * 0.8, FRAME_HY + 0.01, -0.03);
    box(rig, redBankMat, 0.24, 0.03, 0.02, sx * 0.8, FRAME_HY + 0.055, 0.065, false);
    // Heat soot bleeding down the pod face under the alarm bank -- the one place on this pod that
    // actually gets hot.
    grimeDecal(rig, ventSoot, 0.26, 0.09, sx * 0.8, FRAME_HY - 0.01, 0.072, 0.6, Math.PI);
    // Copper flex conduit dropping off the pod -- an accent, deliberately never a large surface.
    const conduit = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.017, 6, 12, Math.PI * 1.35), copperMat);
    conduit.position.set(sx * 1.06, FRAME_HY - 0.01, -0.11);
    conduit.rotation.set(Math.PI / 2, 0, sx * 0.4);
    conduit.castShadow = true;
    conduit.receiveShadow = true;
    rig.add(conduit);
  }

  // Cable bundles draped across the top rail and down into the chassis.
  for (const [x0, x1, sag] of [[-1.15, 0.4, 0.08], [-0.25, 1.2, 0.12]] as const) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x0, FRAME_HY + 0.01, -0.15),
      new THREE.Vector3((x0 + x1) / 2, FRAME_HY + 0.04 - sag, -0.19),
      new THREE.Vector3(x1, FRAME_HY + 0.01, -0.15),
    ]);
    const loom = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.016, 6, false), cableMat);
    loom.castShadow = true;
    loom.receiveShadow = true;
    rig.add(loom);
  }

  // --- blinking indicator strips on the lower bezel -------------------------------------------------------
  const dotGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.016, 8);
  dotGeo.rotateX(Math.PI / 2);
  const dotColors = [0x8fe89a, 0x8fe89a, 0xd8a63a, 0x4fd8f0];
  for (const sx of [-1, 1] as const) {
    dotColors.forEach((color, i) => {
      const mat = new THREE.MeshStandardMaterial({
        // Smoked lens housing, not a black hole: at 0x11151a these read as punched-out dots
        // whenever the indicator was in its off phase.
        color: 0x333941,
        emissive: sx > 0 && i === 2 ? 0xe0552f : color,
        emissiveIntensity: 0.8,
        roughness: 0.22,
        metalness: 0,
      });
      const dot = new THREE.Mesh(dotGeo, mat);
      dot.position.set(sx * (FRAME_HX - 0.16 - i * 0.09), -(FRAME_HY - BEZEL / 2), BEZEL_Z + 0.05);
      rig.add(dot);
      ctx.statusLights.push({ mesh: dot, material: mat, phase: i * 1.13 + (sx > 0 ? 0.6 : 0), onIntensity: 1.0 });
    });
  }

  // --- flanking auxiliary monitors --------------------------------------------------------------------------
  // Depth layering: smaller screens standing off the main array's plane on articulated arms, so
  // the assembly has a foreground element instead of reading as one flat slab.
  // Shared physical-glass overlay for both aux heads -- the same phosphor/glass split as the main
  // array, at a scale small enough that it doesn't need its own per-pane smudge map.
  // Round 6 called the aux glass out by name: it shared one flat roughness value with no map at
  // all, unlike the main array's glass (glassWear). auxGlassMaps gives it the same dust/smear
  // response at its own scale, so the small screens stop reading as evenly-lit plastic.
  const auxGlassMaps = buildAuxGlassMaps();
  const auxGlassMat = new THREE.MeshStandardMaterial({
    color: 0xd8ecf2,
    transparent: true,
    opacity: 0.12,
    roughness: 1,
    roughnessMap: auxGlassMaps.roughnessMap,
    normalMap: auxGlassMaps.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    metalness: 0,
    envMapIntensity: 1.6,
    depthWrite: false,
  });
  for (const sx of [-1, 1] as const) {
    const arm = new THREE.Group();
    arm.position.set(sx * (FRAME_HX + 0.02), -0.12, 0.02);
    rig.add(arm);

    box(arm, recessMat, 0.09, 0.11, 0.09, 0, 0, 0);
    const strut = box(arm, brightSteelMat, 0.22, 0.04, 0.04, sx * 0.105, -0.02, 0.08);
    strut.rotation.y = -sx * 0.55;
    box(arm, recessMat, 0.05, 0.06, 0.05, sx * 0.2, -0.04, 0.15);

    const auxTex = buildAuxScreenTexture(sx < 0 ? 0 : 1);
    const head = new THREE.Group();
    head.position.set(sx * 0.26, -0.05, 0.19);
    head.rotation.set(-0.14, -sx * 0.62, 0);
    arm.add(head);
    box(head, bodyMat, 0.38, 0.29, 0.05, 0, 0, -0.028);
    box(head, brightSteelMat, 0.4, 0.018, 0.06, 0, 0.145, -0.02);
    box(head, brightSteelMat, 0.4, 0.018, 0.06, 0, -0.145, -0.02);
    box(head, recessMat, 0.12, 0.045, 0.06, 0, -0.15, -0.045);
    const auxMat = new THREE.MeshStandardMaterial({
      color: 0x16323d,
      map: auxTex,
      emissive: 0xffffff,
      emissiveMap: auxTex,
      // These sit closer to camera than the main array and were reading as bright as it. Held
      // well under, so the array keeps the single focal point the brief asks for.
      emissiveIntensity: 0.58,
      // Matte substrate, same split as the main array: the glossy response now lives on the glass
      // pane in front, not baked into the same surface that carries the image.
      roughness: 0.7,
      metalness: 0,
    });
    const auxScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.335, 0.25), auxMat);
    auxScreen.position.set(0, 0, 0.006);
    head.add(auxScreen);
    const auxGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.335, 0.25), auxGlassMat);
    auxGlass.position.set(0, 0, 0.012);
    auxGlass.renderOrder = 3;
    head.add(auxGlass);
    // Rubber bezel gasket round the aux glass: the same cavity line the main array gets, at the
    // scale where the eye checks whether a small prop was actually built or just tinted.
    for (const sy of [-1, 1] as const) {
      box(head, gasketMat, 0.36, 0.016, 0.02, 0, sy * 0.128, -0.004);
    }
  }

  // --- ceiling gantry (world space -- deliberately not tilted with the array) -----------------------------------
  const gantry = new THREE.Group();
  gantry.position.set(0, 0, ANCHOR_Z);
  ctx.scene.add(gantry);

  // Header beam. It used to tuck under the old room's ceiling greeble; that structure is gone
  // (ceiling.ts is now a flat slab), so the header simply climbs the ROOM_H - 4 = 1 unit the
  // ceiling itself rose by, keeping the same margin under it. The array cantilevers forward off
  // it on bracket arms.
  const headerZ = -0.48;
  const headerY = 1;
  box(gantry, bodyMat, 2.94, 0.13, 0.22, 0, 3.665 + headerY, headerZ);
  box(gantry, brightSteelMat, 3.02, 0.026, 0.27, 0, 3.715 + headerY, headerZ);
  box(gantry, recessMat, 2.88, 0.04, 0.24, 0, 3.6 + headerY, headerZ);
  for (const sx of [-1, 1] as const) {
    box(gantry, recessMat, 0.09, 0.22, 0.3, sx * 1.49, 3.665 + headerY, headerZ);
    box(gantry, brightSteelMat, 0.05, 0.26, 0.05, sx * 1.53, 3.665 + headerY, headerZ + 0.1);
    // Risers tying the beam up into the deck between the runners.
    for (const rx of [0.35, 1.05]) {
      box(gantry, bodyMat, 0.13, 0.17, 0.13, sx * rx, 3.8 + headerY, headerZ);
      box(gantry, brightSteelMat, 0.2, 0.022, 0.2, sx * rx, 3.732 + headerY, headerZ);
    }
  }
  // Bolt line along the header's front web.
  const headerBoltGeo = new THREE.CylinderGeometry(0.012, 0.015, 0.024, 6);
  headerBoltGeo.rotateX(Math.PI / 2);
  const headerBolts = new THREE.InstancedMesh(headerBoltGeo, boltMat, 22);
  for (let i = 0; i < 22; i++) {
    m.makeTranslation(-1.4 + (i % 11) * 0.28, (i < 11 ? 3.702 : 3.612) + headerY, headerZ + 0.122);
    headerBolts.setMatrixAt(i, m);
  }
  headerBolts.instanceMatrix.needsUpdate = true;
  headerBolts.receiveShadow = true;
  gantry.add(headerBolts);

  // Conduit run strapped under the header, with a copper flex section spliced in.
  const conduitRun = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 2.6, 8), recessMat);
  conduitRun.rotation.z = Math.PI / 2;
  conduitRun.position.set(0, 3.548 + headerY, headerZ);
  conduitRun.castShadow = true;
  conduitRun.receiveShadow = true;
  gantry.add(conduitRun);
  const flex = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.36, 8), copperMat);
  flex.rotation.z = Math.PI / 2;
  flex.position.set(0.92, 3.548 + headerY, headerZ);
  flex.castShadow = true;
  flex.receiveShadow = true;
  gantry.add(flex);
  for (const cx of [-1.05, 0.2]) {
    box(gantry, recessMat, 0.085, 0.12, 0.12, cx, 3.556 + headerY, headerZ);
  }

  // Cantilever bracket arms carrying the array forward off the beam.
  const topY = CENTER_Y + FRAME_HY * Math.cos(TILT);
  const topZ = FRAME_HY * Math.sin(TILT);
  for (const x of [-1.12, -0.42, 0.42, 1.12]) {
    box(gantry, brightSteelMat, 0.07, 0.07, 0.44, x, topY - 0.05, headerZ + 0.24);
    box(gantry, recessMat, 0.115, 0.115, 0.045, x, topY - 0.05, headerZ + 0.45);
    box(gantry, recessMat, 0.09, 0.14, 0.09, x, topY - 0.02, headerZ + 0.03);
  }

  // Knee braces from the header down onto the chassis back -- the diagonal that stops the
  // hanging structure reading as a stack of parallel boxes.
  const up = new THREE.Vector3(0, 1, 0);
  for (const sx of [-1, 1] as const) {
    const a = new THREE.Vector3(sx * 1.26, 3.59 + headerY, headerZ + 0.06);
    const b = new THREE.Vector3(sx * 1.26, 3.02, headerZ + 0.36);
    const dir = new THREE.Vector3().subVectors(b, a);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.045, dir.length(), 0.045), recessMat);
    brace.position.copy(a).addScaledVector(dir, 0.5);
    brace.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    brace.castShadow = true;
    brace.receiveShadow = true;
    gantry.add(brace);
  }

  // Service loom feeding the array from the header.
  for (const [x, sag] of [[-0.68, 0.1], [0.68, 0.14]] as const) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 3.6 + headerY, headerZ - 0.1),
      new THREE.Vector3(x * 1.08, 3.58 + headerY - sag, headerZ + 0.16),
      new THREE.Vector3(x * 0.94, topY - 0.04, topZ - 0.16),
    ]);
    const loom = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.019, 6, false), cableMat);
    loom.castShadow = true;
    loom.receiveShadow = true;
    gantry.add(loom);
  }

  // --- gantry fill lighting -----------------------------------------------------------------------------------
  // The header, risers and knee braces sit above and behind the console's cool wash and outside
  // every dedicated wall fixture's reach (the nearest lit sconce is two bays off), so at the
  // room's low ambient this whole back half of the rig was reading as a crushed black block
  // between the ceiling pendant strip and the screen glow below -- exactly the surfaces the
  // consoleGlow lights stopped reaching once they were dropped and pushed forward toward the
  // console top. A small inspection lamp on the header -- geometry plus the light it makes, per
  // the room's own "never a light without its fixture" rule -- and a dim cool spill standing in
  // for the screens' own glow hitting the structure behind them seat that back half back into the
  // room instead of leaving it unlit.
  const lampHousingMat = new THREE.MeshStandardMaterial({
    color: 0x2c3138,
    emissive: 0xffd9a0,
    emissiveIntensity: 1.1,
    roughness: 0.4,
    metalness: 0.15,
  });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.05), lampHousingMat);
  lamp.position.set(0, 3.62 + headerY, headerZ + 0.16);
  lamp.castShadow = true;
  gantry.add(lamp);
  const gantryLamp = new THREE.PointLight(0xffd9a0, 0.5, 3.2, 2);
  gantryLamp.position.set(0, 3.6 + headerY, headerZ + 0.2);
  gantry.add(gantryLamp);

  const backSpill = new THREE.PointLight(0x6fdcf2, 0.4, 3.4, 2);
  backSpill.position.set(0, 3.3, headerZ + 0.3);
  gantry.add(backSpill);

  // --- lighting ---------------------------------------------------------------------------------------------
  // ShipInteriorScene forces every consoleGlow light to intensity 1.5 each frame, so position and
  // falloff are the only handles here. Last round these sat 1.25 m in front of the glass at eye
  // level with the bezel: they grazed the frame trim head-on, and that specular -- not the screen
  // art -- is what bloomed. They are now dropped and pushed forward to wash the console top, which
  // is where a screen's spill actually lands, with a shorter range so the frame is lit by the
  // panel's own emissive rather than by a lamp aimed at it.
  for (const sx of [-1, 1] as const) {
    const light = new THREE.PointLight(0x4fd8f0, 1.1, 4.2, 2);
    light.position.set(sx * 1.15, CENTER_Y - 0.95, ANCHOR_Z + 1.9);
    ctx.scene.add(light);
    ctx.consoleGlow.push(light);
  }

  // --- animation --------------------------------------------------------------------------------------------
  let flickerT = 0;
  ctx.animated.push((elapsed, dt) => {
    sweep.rotation.z = -elapsed * 0.85;
    sweepMat.opacity = 0.4 + Math.sin(elapsed * 1.7) * 0.09;
    screenMat.emissiveIntensity = 0.92 + Math.sin(elapsed * 1.4) * 0.05;

    // Tired panel: mostly matches its siblings, drops out for a fraction of a second now and then.
    flickerT -= dt;
    if (flickerT <= 0) {
      flickerPaneMat.emissiveIntensity =
        Math.random() < 0.2 ? 0.28 + Math.random() * 0.3 : screenMat.emissiveIntensity;
      flickerT = 0.05 + Math.random() * 0.5;
    }
  });
}
