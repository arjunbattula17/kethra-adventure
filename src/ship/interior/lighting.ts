import * as THREE from 'three';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_H } from './ctx';
import {
  buildRadialGlowTexture,
  buildBarGlowTexture,
  buildWallConeTexture,
  buildFloorPoolTexture,
  buildDiffuserTexture,
  buildLouverTexture,
} from './lightingTextures';

// ---------------------------------------------------------------------------------------------
// Lighting piece: the room's whole light rig *and* every visible fixture that motivates it.
//
// The reference frame never shows a light without showing the thing making it — a hanging
// twin-tube pendant, hooded wall downlights throwing hard-edged cones on the plating, bare strip
// tubes clamped to the upper wall, recessed egg-crate troffers in the ceiling, caged alarm
// beacons. Previously this module was six bare THREE lights and no geometry at all, so the room
// read as an evenly-tinted blue box: light arrived from nowhere and landed on nothing.
//
// Value structure follows the brief: one dominant soft key from above (so the deck is the
// brightest large surface and the vertical walls fall off), a cool low ambient that lets corners
// crush toward near-black, and then *local* warm pools from practicals overlapping a single cool
// focal wash at the console end. Warm and cool are separated strictly by fixture type.
// ---------------------------------------------------------------------------------------------

const WARM = 0xffd9a0;
const WARM_HOT = 0xfff2dc;
const COOL = 0x6fdcf2;
const ALARM = 0xff4a2c;

const STEEL = 0x4b535e;
const STEEL_DARK = 0x2b3138;
const STEEL_TRIM = 0x89929d;

/** All non-prop scene lighting: the room rig plus the practical fixtures that motivate it. */
export function buildLighting(ctx: InteriorCtx): void {
  // ===== shared geometry =====
  // Everything in this module is one of five buffers, scaled per instance. A unit box covers all
  // housings/plates/tubes-ends, a unit cylinder all stems and tubes, a unit quad all glow decals.
  const gBox = new THREE.BoxGeometry(1, 1, 1);
  const gCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const gQuad = new THREE.PlaneGeometry(1, 1);
  const gRing = new THREE.TorusGeometry(1, 0.055, 5, 16);
  const gDome = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);

  // ===== shared materials =====
  const matHousing = new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.62, metalness: 0.55, emissive: 0x191d23, emissiveIntensity: 0.6 });
  const matHousingDark = new THREE.MeshStandardMaterial({ color: STEEL_DARK, roughness: 0.55, metalness: 0.62, emissive: 0x14181d, emissiveIntensity: 0.6 });
  const matTrim = new THREE.MeshStandardMaterial({ color: STEEL_TRIM, roughness: 0.38, metalness: 0.72, emissive: 0x222831, emissiveIntensity: 0.5 });
  const matBolt = new THREE.MeshStandardMaterial({ color: 0x9ba3ad, roughness: 0.34, metalness: 0.85 });

  const diffuserTex = buildDiffuserTexture();
  const matWarmTube = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.3, metalness: 0, emissive: WARM_HOT, emissiveIntensity: 1.35, emissiveMap: diffuserTex });
  const matWarmLens = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.32, metalness: 0, emissive: WARM, emissiveIntensity: 1.05, emissiveMap: diffuserTex });
  const matCoolLens = new THREE.MeshStandardMaterial({ color: 0x14191c, roughness: 0.28, metalness: 0, emissive: 0x9cecff, emissiveIntensity: 1.15 });
  const matAlarmLens = new THREE.MeshStandardMaterial({ color: 0x1c1210, roughness: 0.3, metalness: 0.1, emissive: 0xff3a2a, emissiveIntensity: 1.1 });

  const radialTex = buildRadialGlowTexture();
  const barTex = buildBarGlowTexture();
  const coneTex = buildWallConeTexture();
  const poolTex = buildFloorPoolTexture();

  const additive = (map: THREE.Texture, color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({ map, color, opacity, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  const glowWarmCone = additive(coneTex, 0xffcf94, 0.5);
  // Two pool strengths, because these stack: a dozen additive decals on the deck at one opacity
  // sums to a washed-out white floor. Only the pendants — the room's dominant practicals — get
  // the strong one; every secondary fixture drops a soft pool that reads only where it overlaps
  // otherwise-dark plating.
  const glowWarmPool = additive(poolTex, 0xffd2a4, 0.4);
  const glowWarmPoolSoft = additive(poolTex, 0xffcf9e, 0.2);
  const glowWarmBar = additive(barTex, WARM, 0.45);
  const glowCoolPool = additive(poolTex, COOL, 0.34);
  const glowAlarmPool = additive(poolTex, ALARM, 0.3);
  const glowAlarmBar = additive(barTex, ALARM, 0.32);

  const spriteWarm = new THREE.SpriteMaterial({ map: radialTex, color: 0xffe0b4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 });

  const matLouver = new THREE.MeshBasicMaterial({ color: 0x1b1f25, alphaMap: buildLouverTexture(), transparent: true, depthWrite: false });

  // ===== builders =====
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(gBox, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    ctx.scene.add(m);
    return m;
  };
  /** Cylinder laid along an axis: 'x' | 'y' | 'z'. */
  const tube = (r: number, len: number, axis: 'x' | 'y' | 'z', mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(gCyl, mat);
    m.scale.set(r * 2, len, r * 2);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    else if (axis === 'z') m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    ctx.scene.add(m);
    return m;
  };
  const glow = (w: number, h: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(gQuad, mat);
    m.scale.set(w, h, 1);
    m.renderOrder = 3;
    ctx.scene.add(m);
    return m;
  };
  /** Warm pool dropped on the deck. Purely visual — no collision, sits 2 cm above the plating. */
  const floorPool = (x: number, z: number, w: number, d: number, mat: THREE.Material) => {
    const m = glow(w, d, mat);
    m.position.set(x, 0.02, z);
    m.rotation.x = -Math.PI / 2;
    return m;
  };
  /** Glow decal pressed against a side wall. side=+1 is the +X wall. */
  const wallGlow = (side: 1 | -1, z: number, y: number, w: number, h: number, mat: THREE.Material) => {
    const m = glow(w, h, mat);
    m.position.set(side * (ROOM_W / 2 - 0.115), y, z);
    m.rotation.y = -side * (Math.PI / 2);
    return m;
  };

  const boltMatrices: THREE.Matrix4[] = [];
  const boltQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const boltScale = new THREE.Vector3(0.036, 0.028, 0.036);
  const addWallBolts = (side: 1 | -1, z: number, y: number, spreadZ: number, spreadY: number) => {
    const x = side * (ROOM_W / 2 - 0.13);
    for (const dz of [-spreadZ, spreadZ]) {
      for (const dy of [-spreadY, spreadY]) {
        boltMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + dy, z + dz), boltQuat, boltScale));
      }
    }
  };

  // ===============================================================================================
  // 1. Room rig — the value structure everything else sits on.
  // ===============================================================================================

  // Cool sky over a warm bounce: the sky term lights up-facing surfaces (deck, prop tops), the
  // ground term lights down-facing ones (ceiling underside, shelf bottoms) with the colour the
  // bone-white deck would actually bounce. Half the old intensity — the previous 1.05 hemisphere
  // plus a 0.45 flat ambient was doing nearly all the lighting, which is exactly why the room
  // read as a uniformly tinted box with no pooling.
  const hemi = new THREE.HemisphereLight(0x93a7bd, 0xb7a992, 0.55);
  ctx.scene.add(hemi);

  // Residual bounce floor, cool and dim, so shadowed corners land on the brief's #2b3138 rather
  // than pure black — but low enough that they still read as *dark*.
  const ambient = new THREE.AmbientLight(0x4e5661, 0.3);
  ctx.scene.add(ambient);

  // Dominant soft key from high and slightly off-axis. This is what makes the deck the brightest
  // large surface in frame while the vertical walls fall off by cosine, and it's the room's only
  // shadow caster: one orthographic pass replaces the old point-light cubemap (6 faces) and gives
  // the ceiling beams/ducts/pendants real slanted shadow bars across the plating.
  const key = new THREE.DirectionalLight(0xffeed6, 1.0);
  key.position.set(4.5, 11.5, 5.5);
  key.target.position.set(-0.6, 0, -2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -9;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 28;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.03;
  // LightShadow.updateMatrices() re-derives the view matrix every frame but never touches the
  // projection, so an orthographic frustum edited after construction is silently ignored — the
  // shadow would keep the default +/-5 x 0.5..500 box and clip half a 12-deep room.
  key.shadow.camera.updateProjectionMatrix();
  ctx.scene.add(key.target);
  ctx.scene.add(key);

  // Up-firing bounce fill standing in for radiosity off the bright deck — picks out the undersides
  // of the ceiling structure and every prop overhang, which a purely top-down rig leaves black.
  const bounce = new THREE.DirectionalLight(0xf7e6ca, 0.32);
  bounce.position.set(0, -4, 1.5);
  ctx.scene.add(bounce);

  // Cold starlight leaking in past the console window — the only light in the room that is neither
  // a warm practical nor a screen.
  const starlight = new THREE.DirectionalLight(0x6d86c0, 0.22);
  starlight.position.set(-2, 4.5, -18);
  ctx.scene.add(starlight);

  // ===============================================================================================
  // 2. Hanging twin-tube pendants — the reference's hero fixture, dead centre under the duct spine.
  // ===============================================================================================

  const pendantLights: THREE.PointLight[] = [];
  const addPendant = (z: number) => {
    // Mount into the underside of the ceiling duct spine (which bottoms out at y=3.38).
    box(0.36, 0.05, 0.36, matHousingDark, 0, 3.345, z);
    const collar = new THREE.Mesh(gRing, matTrim);
    collar.scale.set(0.12, 0.12, 0.12);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 3.3, z);
    ctx.scene.add(collar);

    tube(0.032, 0.34, 'y', matTrim, 0, 3.15, z);
    const crossbar = box(1.22, 0.05, 0.07, matHousing, 0, 2.99, z);
    crossbar.castShadow = true;

    // Reflector hood: a flat pan with two turned-down side flaps, so the fixture has a chamfered
    // silhouette instead of reading as one slab.
    const hood = box(1.16, 0.035, 0.32, matTrim, 0, 2.955, z);
    hood.castShadow = true;
    for (const dz of [-0.165, 0.165]) box(1.16, 0.1, 0.028, matHousing, 0, 2.915, z + dz);

    for (const dx of [-0.585, 0.585]) {
      box(0.1, 0.2, 0.3, matHousingDark, dx, 2.885, z);
      box(0.03, 0.24, 0.34, matTrim, dx + Math.sign(dx) * 0.058, 2.885, z);
    }

    for (const dz of [-0.085, 0.085]) {
      tube(0.048, 1.06, 'x', matWarmTube, 0, 2.87, z + dz);
      const sprite = new THREE.Sprite(spriteWarm);
      sprite.scale.set(1.55, 0.46, 1);
      sprite.position.set(0, 2.87, z + dz);
      sprite.renderOrder = 4;
      ctx.scene.add(sprite);
    }

    // Wire guard cage — three hoops and four longitudinal wires. Cheap silhouette break-up, and
    // the thing that most reads as "industrial fixture" rather than "glowing box".
    for (const dx of [-0.36, 0, 0.36]) {
      const hoop = new THREE.Mesh(gRing, matHousingDark);
      hoop.scale.set(0.175, 0.175, 0.175);
      hoop.rotation.y = Math.PI / 2;
      hoop.position.set(dx, 2.87, z);
      ctx.scene.add(hoop);
    }
    for (const [dy, dz] of [[-0.125, -0.125], [-0.125, 0.125], [0.125, -0.125], [0.125, 0.125]]) {
      tube(0.009, 1.02, 'x', matHousingDark, 0, 2.87 + dy, z + dz);
    }

    const light = new THREE.PointLight(0xffe7c4, 1.2, 9.5, 1.5);
    light.position.set(0, 2.6, z);
    ctx.scene.add(light);
    pendantLights.push(light);

    floorPool(0, z, 3.6, 3.6, glowWarmPool);
  };
  addPendant(-0.2);
  addPendant(2.9);

  // ===============================================================================================
  // 3. Hooded wall downlights — the cone pools grazing the plating are the single most
  //    recognisable lighting cue in the reference crop.
  // ===============================================================================================

  const SCONCE_Y = 2.72;
  const addSconce = (side: 1 | -1, z: number, withLight: boolean) => {
    const wallX = side * (ROOM_W / 2 - 0.1);
    const inward = -side;

    box(0.05, 0.46, 0.58, matHousingDark, wallX - side * 0.02, SCONCE_Y, z);
    box(0.06, 0.34, 0.44, matHousing, wallX + inward * 0.05, SCONCE_Y, z);
    const body = box(0.2, 0.26, 0.36, matHousing, wallX + inward * 0.17, SCONCE_Y, z);
    body.castShadow = true;
    // Hood over the lens and a short lip under it — the recessed-face read from the brief.
    box(0.28, 0.04, 0.44, matTrim, wallX + inward * 0.18, SCONCE_Y + 0.15, z);
    box(0.24, 0.035, 0.4, matHousingDark, wallX + inward * 0.2, SCONCE_Y - 0.145, z);
    // Down-facing lens plus a sliver of front glass, so the fixture reads as lit head-on too.
    box(0.16, 0.025, 0.3, matWarmLens, wallX + inward * 0.17, SCONCE_Y - 0.125, z);
    box(0.02, 0.14, 0.3, matWarmLens, wallX + inward * 0.275, SCONCE_Y - 0.02, z);

    addWallBolts(side, z, SCONCE_Y, 0.24, 0.19);

    const cone = wallGlow(side, z, SCONCE_Y - 1.06, 1.05, 1.8, glowWarmCone);
    cone.renderOrder = 2;
    floorPool(side * 3.7, z, 1.7, 2.2, glowWarmPoolSoft);

    const sprite = new THREE.Sprite(spriteWarm);
    sprite.scale.set(0.6, 0.34, 1);
    sprite.position.set(wallX + inward * 0.2, SCONCE_Y - 0.12, z);
    ctx.scene.add(sprite);

    if (withLight) {
      const light = new THREE.PointLight(WARM, 0.85, 6.5, 1.7);
      light.position.set(wallX + inward * 0.45, SCONCE_Y - 0.3, z);
      ctx.scene.add(light);
    }
  };
  // Staggered rather than mirrored: two walls of evenly-opposed fixtures reads as a corridor
  // decal strip, and the reference's practicals are never symmetrical across the room.
  for (const z of [-4.5, -1.7, 1.1, 3.9]) addSconce(-1, z, z === -1.7);
  for (const z of [-3.4, -0.6, 2.2, 5.0]) addSconce(1, z, z === -0.6);

  // ===============================================================================================
  // 4. Bare strip tubes clamped high on the side walls, plus the graze they throw down the plating.
  // ===============================================================================================

  const flickerTargets: { mat: THREE.MeshStandardMaterial; graze: THREE.MeshBasicMaterial; baseE: number; baseO: number }[] = [];
  const addWallStrip = (side: 1 | -1, z: number, len: number, flicker: boolean) => {
    const wallX = side * (ROOM_W / 2 - 0.1);
    const inward = -side;
    const lensMat = flicker ? matWarmTube.clone() : matWarmTube;
    const grazeMat = flicker ? glowWarmBar.clone() : glowWarmBar;

    box(0.16, 0.14, len, matHousingDark, wallX + inward * 0.07, 3.36, z);
    box(0.22, 0.03, len - 0.08, matTrim, wallX + inward * 0.15, 3.395, z);
    for (const dz of [-(len / 2 - 0.1), len / 2 - 0.1]) {
      box(0.2, 0.22, 0.06, matHousing, wallX + inward * 0.13, 3.31, z + dz);
      addWallBolts(side, z + dz, 3.31, 0.02, 0.09);
    }
    tube(0.046, len - 0.24, 'z', lensMat, wallX + inward * 0.16, 3.29, z);

    const sprite = new THREE.Sprite(spriteWarm);
    sprite.scale.set(0.5, 0.42, 1);
    sprite.position.set(wallX + inward * 0.16, 3.29, z);
    ctx.scene.add(sprite);

    const graze = wallGlow(side, z, 3.29 - 0.62, len + 0.9, 1.55, grazeMat);
    graze.renderOrder = 2;

    if (flicker) flickerTargets.push({ mat: lensMat, graze: grazeMat, baseE: lensMat.emissiveIntensity, baseO: grazeMat.opacity });
  };
  addWallStrip(-1, -0.4, 2.1, false);
  addWallStrip(-1, 4.2, 1.8, false);
  addWallStrip(1, -3.0, 2.2, false);
  addWallStrip(1, 2.6, 1.9, true);

  // ===============================================================================================
  // 5. Recessed egg-crate troffers set between the ceiling beams.
  // ===============================================================================================

  // Ceiling slab underside sits at ROOM_H - 0.075; the troffers recess into it between beams.
  const CEIL_FACE = ROOM_H - 0.075;
  const addTroffer = (x: number, z: number) => {
    box(1.26, 0.07, 1.16, matHousingDark, x, CEIL_FACE - 0.03, z);
    box(1.12, 0.05, 1.02, matTrim, x, CEIL_FACE - 0.025, z);

    const lens = new THREE.Mesh(gQuad, matWarmLens);
    lens.scale.set(1.0, 0.9, 1);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, CEIL_FACE - 0.06, z);
    ctx.scene.add(lens);

    const louver = new THREE.Mesh(gQuad, matLouver);
    louver.scale.set(1.0, 0.9, 1);
    louver.rotation.x = Math.PI / 2;
    louver.position.set(x, CEIL_FACE - 0.07, z);
    louver.renderOrder = 2;
    ctx.scene.add(louver);

    const halo = glow(1.7, 1.6, glowWarmPoolSoft);
    halo.rotation.x = Math.PI / 2;
    halo.position.set(x, CEIL_FACE - 0.105, z);

    floorPool(x, z, 2.8, 2.8, glowWarmPoolSoft);
  };
  for (const x of [-2.75, 2.75]) {
    addTroffer(x, -3.0);
    addTroffer(x, 3.0);
  }

  // ===============================================================================================
  // 6. Cool focal wash at the console end. Every screen-coloured photon in the room comes from
  //    here; the practicals above stay strictly warm so the two never blend into one tint.
  // ===============================================================================================

  const coolLights: THREE.PointLight[] = [];
  for (const [x, y, z] of [[0, 1.7, -2.6], [-1.5, 2.4, -3.8]] as [number, number, number][]) {
    const light = new THREE.PointLight(COOL, 0.6, 7.5, 1.7);
    light.position.set(x, y, z);
    ctx.scene.add(light);
    coolLights.push(light);
  }
  floorPool(0, -2.5, 5.4, 4.4, glowCoolPool);
  // Screen light striking the ceiling above the display — the cue that reads "that panel is the
  // brightest thing in the room" even when the panel itself is off-frame.
  const coolCeiling = glow(3.2, 2.4, glowCoolPool);
  coolCeiling.rotation.x = Math.PI / 2;
  coolCeiling.position.set(0, CEIL_FACE - 0.03, -4.0);

  // Cool marker lenses flanking the console bay at deck level — small, cool, and low, so the eye
  // is led toward the focal point along the floor.
  for (const side of [-1, 1] as const) {
    box(0.06, 0.05, 0.9, matCoolLens, side * 2.2, 0.14, -4.6);
    box(0.1, 0.14, 1.0, matHousingDark, side * 2.24, 0.08, -4.6);
  }

  // ===============================================================================================
  // 7. Caged alarm beacons.
  // ===============================================================================================

  const beaconSweeps: THREE.Object3D[] = [];
  const addBeacon = (side: 1 | -1, z: number, primary: boolean) => {
    const wallX = side * (ROOM_W / 2 - 0.1);
    const inward = -side;
    const y = 3.05;

    box(0.06, 0.34, 0.34, matHousingDark, wallX - side * 0.02, y, z);
    box(0.05, 0.4, 0.06, matHousing, wallX + inward * 0.04, y, z);
    tube(0.145, 0.1, 'x', matHousing, wallX + inward * 0.11, y, z);
    addWallBolts(side, z, y, 0.13, 0.15);

    const dome = new THREE.Mesh(gDome, matAlarmLens);
    dome.scale.set(0.115, 0.13, 0.115);
    dome.rotation.z = side * (Math.PI / 2);
    dome.position.set(wallX + inward * 0.16, y, z);
    ctx.scene.add(dome);

    for (const dy of [-0.075, 0, 0.075]) box(0.2, 0.016, 0.24, matHousingDark, wallX + inward * 0.2, y + dy, z);

    wallGlow(side, z, y - 0.15, 1.5, 1.5, glowAlarmPool).renderOrder = 2;

    // Sweeping searchlight streak. The group carries the wall facing; the quad spins about its own
    // normal inside it, which is what a rotating beacon actually paints on a flat wall.
    const sweepGroup = new THREE.Object3D();
    sweepGroup.position.set(side * (ROOM_W / 2 - 0.12), y, z);
    sweepGroup.rotation.y = -side * (Math.PI / 2);
    const sweep = new THREE.Mesh(gQuad, glowAlarmBar);
    sweep.scale.set(2.4, 0.5, 1);
    sweep.renderOrder = 3;
    sweepGroup.add(sweep);
    ctx.scene.add(sweepGroup);

    beaconSweeps.push(sweepGroup);

    if (primary) {
      const light = new THREE.PointLight(ALARM, 1.2, 7.5, 2);
      light.position.set(wallX + inward * 0.5, y - 0.15, z);
      ctx.scene.add(light);
      ctx.setEmergencyLight(light);
    }
  };
  addBeacon(-1, -2.6, true);
  addBeacon(1, 4.1, false);

  // ===============================================================================================
  // 8. Bolt heads across every wall-mounted fixture, batched into one instanced draw.
  // ===============================================================================================

  if (boltMatrices.length > 0) {
    const bolts = new THREE.InstancedMesh(gCyl, matBolt, boltMatrices.length);
    for (let i = 0; i < boltMatrices.length; i++) bolts.setMatrixAt(i, boltMatrices[i]);
    bolts.instanceMatrix.needsUpdate = true;
    ctx.scene.add(bolts);
  }

  // ===============================================================================================
  // 9. Animation.
  // ===============================================================================================

  const pendantBase = pendantLights.map((l) => l.intensity);
  const coolBase = coolLights.map((l) => l.intensity);
  const coolPoolBase = glowCoolPool.opacity;
  const alarmPoolBase = glowAlarmPool.opacity;
  const alarmBarBase = glowAlarmBar.opacity;
  const alarmDomeBase = matAlarmLens.emissiveIntensity;

  ctx.animated.push((elapsed, dt) => {
    // Mains ripple: a couple of percent, just enough that the practicals aren't dead static.
    const ripple = 1 + Math.sin(elapsed * 7.3) * 0.018 + Math.sin(elapsed * 2.1) * 0.022;
    for (let i = 0; i < pendantLights.length; i++) pendantLights[i].intensity = pendantBase[i] * ripple;

    // Screens breathe slower and deeper than the warm side, matching the console glow's cadence.
    const coolPulse = 1 + Math.sin(elapsed * 2.2) * 0.12;
    for (let i = 0; i < coolLights.length; i++) coolLights[i].intensity = coolBase[i] * coolPulse;
    glowCoolPool.opacity = coolPoolBase * coolPulse;

    // One bad ballast on the starboard strip tube — localised, not a room-wide strobe.
    const noise = Math.sin(elapsed * 13.7) * 0.5 + Math.sin(elapsed * 31.3) * 0.3 + Math.sin(elapsed * 7.1) * 0.2;
    const stall = Math.sin(elapsed * 2.3) > 0.94 ? 0.22 : 1;
    const f = THREE.MathUtils.clamp(0.78 + noise * 0.2, 0.25, 1.1) * stall;
    for (const t of flickerTargets) {
      t.mat.emissiveIntensity = t.baseE * f;
      t.graze.opacity = t.baseO * f;
    }

    // Beacons share the emergency light's own 3.1 rad/s pulse so fixture and light read as one.
    const alarm = 0.55 + Math.max(0, Math.sin(elapsed * 3.1)) * 0.75;
    glowAlarmPool.opacity = alarmPoolBase * alarm;
    glowAlarmBar.opacity = alarmBarBase * alarm;
    matAlarmLens.emissiveIntensity = alarmDomeBase * alarm;
    for (const sweep of beaconSweeps) sweep.rotation.z += dt * 2.1;
  });
}
