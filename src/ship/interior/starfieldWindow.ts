import * as THREE from 'three';
import { applyPbr } from '../../core/TextureLibrary';
import { buildHazardStripeTexture, buildStencilPlacardTexture } from '../ShipTextures';
import type { InteriorCtx } from './ctx';
import { ROOM_D } from './ctx';
import {
  buildAoTexture,
  buildDistantStarTexture,
  buildDripStreakTexture,
  buildGlassSheenTexture,
  buildLedBankTexture,
  buildNebulaWispTexture,
  buildOpenBayTexture,
  buildPlateMaps,
  buildSillReadoutTexture,
  buildSpaceBackdropTexture,
} from './starfieldWindowTextures';

// ---------------------------------------------------------------------------------------------
// Forward viewport bay — the armoured window assembly filling the console (-Z) bulkhead.
//
// The bulkhead itself (buildWalls) is a solid box, so there is no literal hole to see through.
// The exterior is instead a parallax stack sitting inside a deep recess — painted backdrop,
// nebula wisps, two star sheets and the glass — each drifting at its own rate. That reads as
// depth from every vantage a player can reach and costs five planes. The registered
// THREE.Points cloud stays on the scene as the hull-exterior star volume.
//
// MATERIAL PASS: the bay previously drew almost every form with a flat colour, a uniform
// metalness near 0.7 and a blanket emissive lift — which meant the frame was being *rendered by
// its own emissive*, not by the room's lights, so no crease ever went dark and nothing had a
// contact shadow. It is now built from five genuinely different material responses:
//
//   painted hull plate  low metalness, coarse roughness, chipping back to primer
//   bare machined steel high metalness, tight roughness, downloaded PBR set
//   dark structure      mid metalness, brushed anisotropy along the working direction
//   cast primer recess  near-dielectric, uniformly very rough, heavy pooled grime
//   rubber / copper     matte dielectric vs polished conductor, the two extremes
//
// Each of the procedural sets carries co-registered albedo / roughness / normal channels, so a
// seam is a dark line, a rough line *and* a groove at once. Every non-instanced form casts and
// receives shadow, and soft occlusion decals sit in the creases the shadow map is too coarse to
// resolve. Boxes are chamfered so a grazing key breaks into a highlight along every edge.
//
// Everything else is structure. Rather than one dark slab there is a three-step chamfered
// surround, a mullion grid on an I-section profile, corner braces, a retracted blast shutter
// with its actuators and hydraulics, indicator banks and conduit on the jambs, instrument
// inserts and a hazard kick strip on the sill, and a panelled apron carrying the bay down to
// the deck. The review vantage is (2.3, 1.62, -1.1) — well off-axis — so every step, return,
// nose and cylinder exists to give the assembly a silhouette in Z at that grazing angle
// instead of presenting one flat face.
//
// The bay is also deliberately *not* mirror-symmetric: an access panel hangs open on the port
// jamb over an exposed loom, a clip-on work lamp throws a warm asymmetric key across the
// starboard sill, and a bolted repair patch sits over one pane corner. That is the one axis the
// reference itself is weakest on.
//
// Walkway: nothing here reaches past z = -5.15, which is behind the bulkhead collider plane at
// -5.5... — everything forward of the frame below eye height stays under y = 1.5.
// ---------------------------------------------------------------------------------------------

// Every constant below is the old 9x12x4 room's value scaled by the same 4/3 (x) / 5/4 (y) that
// took the room to 12x16x5, so the whole bay grows proportionally with the wall it's mounted on
// instead of being redesigned from scratch.
const WALL_Z = -ROOM_D / 2 + 0.1;   // inner face of the console bulkhead, -7.9
const FRONT_Z = WALL_Z + 0.4 * (4 / 3); // the surround's frontmost structural plane
const APER_HW = 3.35 * (4 / 3);     // aperture half-width
const APER_B = 1.3 * (5 / 4);       // aperture bottom
const APER_T = 3.2 * (5 / 4);       // aperture top
const APER_W = APER_HW * 2;
const APER_H = APER_T - APER_B;
const APER_CY = (APER_B + APER_T) / 2;
const FRAME_HW = 4.2 * (4 / 3);     // outer edge of the surround (side walls sit at HALF_W = 6)
const SILL_B = 0.96 * (5 / 4);
const LINTEL_T = 3.64 * (5 / 4);
const MULLION_X = [-APER_HW / 3, APER_HW / 3];   // three panes across
const TRANSOM_Y = 2.26 * (5 / 4);                // two panes high
const JAMB_W = FRAME_HW - APER_HW;
const JAMB_CX = (FRAME_HW + APER_HW) / 2;
const ACT_X = 4.06 * (4 / 3);                    // shutter actuator centreline

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

// Chamfered boxes, cached by size. A square-edged box has exactly one normal per face, so a
// grazing light either hits the whole face or none of it — which is most of why a blockout reads
// as plastic. A 2 cm cut on all twelve edges gives every silhouette a thin bright return.
const CHAMFER = 0.022;
const chamferCache = new Map<string, THREE.BufferGeometry>();

function chamferedBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  const hit = chamferCache.get(key);
  if (hit) return hit;
  const c = Math.min(CHAMFER, w / 2.6, h / 2.6, d / 2.6);
  const shape = new THREE.Shape();
  const hw = w / 2 - c;
  const hh = h / 2 - c;
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - 2 * c, bevelEnabled: true, bevelSize: c, bevelThickness: c,
    bevelSegments: 1, curveSegments: 1, steps: 1,
  });
  // ExtrudeGeometry runs 0..depth along +Z from the shape plane; recentre so callers can keep
  // treating these as centred boxes. Its UVs come out in world units, which is what makes one
  // shared plate texture hold a constant texel density across an 8 m lintel and a 0.3 m bracket.
  geo.translate(0, 0, -(d - 2 * c) / 2);
  geo.computeVertexNormals();
  chamferCache.set(key, geo);
  return geo;
}

/** Chamfered, shadow-participating box. */
function slab(
  ctx: InteriorCtx,
  mat: THREE.Material,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(chamferedBox(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  ctx.scene.add(m);
  return m;
}

export function buildStarfieldWindow(ctx: InteriorCtx): void {
  // ===== materials =====================================================================
  // Cool grey steel throughout. The bulkhead behind this assembly is the room's warm worn
  // band, so the bay is what carries the brief's wall-steel values into the -Z end of the room.
  //
  // Note the metalness spread: paint and primer are dielectrics and sit near 0.15, machined
  // stock sits near 0.9, and the dark structure sits between. Under one environment map that
  // difference alone separates the surfaces far more than any colour change would.

  // Painted hull plate — the largest area of the bay, and the value the p95 measurement is
  // reading. Baked a full stop below the old flat 0x7c858f so the highlights stop clipping.
  const paintMaps = buildPlateMaps({
    seed: 0x51a3, res: 512,
    base: [0x67, 0x6f, 0x79], under: [0x4b, 0x46, 0x3f],
    cols: 3, rows: 2, rivets: true,
    chip: 0.8, grime: 0.75, scratch: 170, streaks: 14,
    roughBase: 148, roughWorn: 222,
  });
  for (const t of [paintMaps.map, paintMaps.roughnessMap, paintMaps.normalMap]) t.repeat.set(0.5, 0.5);
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 0.16,
    map: paintMaps.map, roughnessMap: paintMaps.roughnessMap, normalMap: paintMaps.normalMap,
  });
  steelMat.normalScale.set(0.9, 0.9);

  // Bare machined steel: the proud front noses and end caps, the one family that is genuinely
  // conductive. Downloaded PBR set rather than a second procedural one, so the grain reads as a
  // different fabrication process from the painted plate beside it.
  const steelNoseMat = new THREE.MeshStandardMaterial({
    color: 0x848b95, roughness: 0.74, metalness: 0.92,
  });
  applyPbr(steelNoseMat, 'metal_plate_02', [1.1, 1.1]);
  steelNoseMat.normalScale.set(0.7, 0.7);

  // Dark structural stock — mullion webs, housings, the shutter body. Brushed along its length.
  const darkMaps = buildPlateMaps({
    seed: 0x9a17, res: 512,
    base: [0x30, 0x35, 0x3c], under: [0x62, 0x5c, 0x50],
    cols: 2, rows: 2, rivets: false,
    chip: 0.55, grime: 0.6, scratch: 130, streaks: 8,
    roughBase: 118, roughWorn: 196, brushed: true,
  });
  for (const t of [darkMaps.map, darkMaps.roughnessMap, darkMaps.normalMap]) t.repeat.set(0.7, 0.7);
  const steelDarkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 0.66,
    map: darkMaps.map, roughnessMap: darkMaps.roughnessMap, normalMap: darkMaps.normalMap,
    // A faint cool emissive floor: this stock backs the shutter and the recess, both of which
    // sit past the reach of the room's single shadow-mapped key. Without it those regions render
    // literal (0,0,0) whenever the local fill lights below don't quite reach — the measured
    // defect (30% crushed-black vs the reference's ~0%) rather than a lit, textured dark surface.
    emissive: 0x141a1e, emissiveIntensity: 0.35,
  });
  steelDarkMat.normalScale.set(0.7, 0.7);

  // Cast, primered, never top-coated: the recess returns and the vent wells. Uniformly very
  // rough and almost non-metallic, so it stays matte exactly where the polished nose beside it
  // is throwing a highlight. Lifted off near-black — the reference has no dead shadows.
  const recessMaps = buildPlateMaps({
    seed: 0x27bd, res: 512,
    base: [0x3c, 0x41, 0x49], under: [0x52, 0x46, 0x38],
    cols: 2, rows: 3, rivets: false,
    chip: 0.55, grime: 0.72, scratch: 50, streaks: 16,
    roughBase: 224, roughWorn: 248,
  });
  for (const t of [recessMaps.map, recessMaps.roughnessMap, recessMaps.normalMap]) t.repeat.set(0.8, 0.8);
  const recessMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 0.07,
    map: recessMaps.map, roughnessMap: recessMaps.roughnessMap, normalMap: recessMaps.normalMap,
    emissive: 0x181614, emissiveIntensity: 0.4,
  });
  recessMat.normalScale.set(1.1, 1.1);

  // Polished fasteners: the only fully conductive, tight-roughness surface in the bay.
  const boltMat = new THREE.MeshStandardMaterial({
    color: 0x8e959e, roughness: 0.29, metalness: 1,
  });
  // Rolled steel ribs and louvre slats — no map, because they are thin enough that any tiling
  // would smear; distinguished instead by sitting between the nose and the dark plate.
  const slatMat = new THREE.MeshStandardMaterial({
    color: 0x424a54, roughness: 0.52, metalness: 0.78,
    emissive: 0x11151a, emissiveIntensity: 0.3,
  });
  // Rubber: the matte dielectric end of the range, and the reason the hoses read as flexible.
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x24282e, roughness: 0.97, metalness: 0.02,
    emissive: 0x0d1013, emissiveIntensity: 0.25,
  });
  // Copper flex — accent only, and the one surface allowed a mirror-tight roughness.
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0x9c6a38, roughness: 0.36, metalness: 1,
  });
  // Extruded gasket bedding the pane into the frame: dead matte black rubber against polished
  // steel, which is the sharpest material contrast in the assembly and lands right at the focal
  // aperture edge.
  const gasketMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f36, roughness: 1, metalness: 0,
    emissive: 0x0e1013, emissiveIntensity: 0.25,
  });

  const cyanStripMat = new THREE.MeshStandardMaterial({
    color: 0x0a2630, roughness: 0.3, metalness: 0.1,
    emissive: 0x4fd8f0, emissiveIntensity: 1.05,
  });
  const warmStripMat = new THREE.MeshStandardMaterial({
    color: 0x2a2214, roughness: 0.35, metalness: 0.1,
    emissive: 0xffd9a0, emissiveIntensity: 1.25,
  });

  const hazardTex = buildHazardStripeTexture();
  hazardTex.repeat.set(16, 1);
  const hazardMat = new THREE.MeshStandardMaterial({
    map: hazardTex, roughness: 0.86, metalness: 0.15,
    roughnessMap: paintMaps.roughnessMap,
  });

  // ===== soft occlusion decals =========================================================
  // The key light is a single 1024 orthographic map covering the whole 9x12 room, so it cannot
  // resolve the 2-5 cm creases where these forms meet. These decals put the darkening there by
  // hand — black with a gradient alpha, straight alpha blend so the strength is predictable.
  const aoTex = {
    radial: buildAoTexture('radial'),
    top: buildAoTexture('top'),
    bottom: buildAoTexture('bottom'),
    frame: buildAoTexture('frame'),
  };
  const aoMats = new Map<string, THREE.MeshBasicMaterial>();
  const aoPlane = new THREE.PlaneGeometry(1, 1);
  function ao(
    shape: keyof typeof aoTex, opacity: number,
    w: number, h: number, x: number, y: number, z: number,
    rotZ = 0, rotX = 0,
  ): void {
    const key = `${shape}|${opacity}`;
    let mat = aoMats.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: 0x000000, map: aoTex[shape], transparent: true, opacity,
        depthWrite: false,
      });
      aoMats.set(key, mat);
    }
    const m = new THREE.Mesh(aoPlane, mat);
    m.scale.set(w, h, 1);
    m.position.set(x, y, z);
    m.rotation.set(rotX, 0, rotZ);
    m.renderOrder = 4;
    ctx.scene.add(m);
  }

  // ===== exterior view stack ===========================================================
  const backdropTex = buildSpaceBackdropTexture();
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(APER_W, APER_H),
    new THREE.MeshBasicMaterial({ map: backdropTex }),
  );
  backdrop.position.set(0, APER_CY, WALL_Z + 0.015);
  ctx.scene.add(backdrop);

  const wispTex = buildNebulaWispTexture();
  const starTexA = buildDistantStarTexture(0x1177aa, 220);
  const starTexB = buildDistantStarTexture(0x44cc31, 130);
  const parallaxGeo = new THREE.PlaneGeometry(APER_W, APER_H);
  const parallax: { tex: THREE.CanvasTexture; rate: number }[] = [];
  for (const [tex, z, rate, opacity] of [
    [wispTex, WALL_Z + 0.05, 0.0022, 0.85],
    [starTexA, WALL_Z + 0.1, 0.0055, 0.9],
    [starTexB, WALL_Z + 0.17, 0.0105, 0.75],
  ] as const) {
    const layer = new THREE.Mesh(parallaxGeo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    layer.position.set(0, APER_CY, z);
    layer.renderOrder = 1;
    ctx.scene.add(layer);
    parallax.push({ tex, rate });
  }

  // Light falling off into the depth of the recess: the view is darkest where the reveal walls
  // shade it, which is what sells the aperture as a metre-thick opening rather than a print.
  ao('frame', 0.7, APER_W, APER_H, 0, APER_CY, WALL_Z + 0.2);

  // The pane: sheen, polish swirls, sealed-edge dust and a few impact chips, set forward of
  // the star sheets so there is visible thickness between the glass and the view.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(APER_W - 0.02, APER_H - 0.02),
    new THREE.MeshBasicMaterial({
      map: buildGlassSheenTexture(), transparent: true, opacity: 0.92, depthWrite: false,
    }),
  );
  glass.position.set(0, APER_CY, FRONT_Z - 0.09);
  glass.renderOrder = 2;
  ctx.scene.add(glass);

  const glassTint = new THREE.Mesh(
    new THREE.PlaneGeometry(APER_W - 0.02, APER_H - 0.02),
    new THREE.MeshBasicMaterial({
      color: 0x3f7d96, transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  glassTint.position.set(0, APER_CY, FRONT_Z - 0.085);
  glassTint.renderOrder = 3;
  ctx.scene.add(glassTint);

  // ===== bolts (accumulated, then one instanced draw call) =============================
  const boltXforms: THREE.Matrix4[] = [];
  const boltQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const boltScale = new THREE.Vector3(1, 1, 1);
  const boltPos = new THREE.Vector3();
  function bolt(x: number, y: number, z: number): void {
    boltPos.set(x, y, z);
    boltXforms.push(new THREE.Matrix4().compose(boltPos, boltQuat, boltScale));
  }
  function boltRow(x0: number, y0: number, z: number, dx: number, dy: number, n: number): void {
    for (let i = 0; i < n; i++) bolt(x0 + dx * i, y0 + dy * i, z);
  }

  // The repeated slat groups — shutter ribs, reveal stiffeners, jamb louvres, apron louvres —
  // are all the same rolled steel rib at different scales, so they go through one instanced
  // batch instead of ~60 individual draw calls.
  const slatXforms: THREE.Matrix4[] = [];
  const noRot = new THREE.Quaternion();
  const slatPos = new THREE.Vector3();
  const slatScale = new THREE.Vector3();
  function slat(w: number, h: number, d: number, x: number, y: number, z: number): void {
    slatPos.set(x, y, z);
    slatScale.set(w, h, d);
    slatXforms.push(new THREE.Matrix4().compose(slatPos, noRot, slatScale));
  }

  // ===== aperture reveal ===============================================================
  // The recess walls. From the off-axis review vantage these returns are most of what sells
  // the window as a metre-thick armoured opening rather than a picture hung on the bulkhead.
  const revealD = FRONT_Z - WALL_Z;                 // 0.4
  const revealZ = (FRONT_Z + WALL_Z) / 2;           // -5.7
  slab(ctx, recessMat, APER_W + 0.16, 0.08, revealD, 0, APER_T + 0.04, revealZ);
  slab(ctx, recessMat, APER_W + 0.16, 0.08, revealD, 0, APER_B - 0.04, revealZ);
  for (const s of [-1, 1] as const) {
    slab(ctx, recessMat, 0.08, APER_H + 0.16, revealD, s * (APER_HW + 0.04), APER_CY, revealZ);
    for (let i = 0; i < 4; i++) {
      slat(0.1, 0.06, revealD - 0.06, s * (APER_HW + 0.03), APER_B + 0.32 + i * 0.42, revealZ);
    }
  }
  // Cool LED coving washing the recess from top and bottom. The cool half of the room's
  // warm/cool fixture split lives here and on the sill inserts; nothing here is blended warm.
  slab(ctx, cyanStripMat, APER_W - 0.1, 0.035, 0.05, 0, APER_T - 0.03, WALL_Z + 0.22);
  slab(ctx, cyanStripMat, APER_W - 0.1, 0.035, 0.05, 0, APER_B + 0.03, WALL_Z + 0.22);
  // The strips above are self-lit emissive geometry but cast nothing onto their neighbours, so
  // the mullion grid and reveal walls they're bolted beside were reading as unlit black — the
  // room's single shadow-mapped key doesn't reach this deep into the recess. A pair of low-range
  // point lights co-located with the coving turns "cove lighting" into an actual light source,
  // which is both more physically honest and the direct fix for the recess's share of the
  // crushed-black measurement.
  for (const y of [APER_T - 0.03, APER_B + 0.03]) {
    const cove = new THREE.PointLight(0x4fd8f0, 0.55, 2.4, 2);
    cove.position.set(0, y, WALL_Z + 0.3);
    ctx.scene.add(cove);
  }

  // Extruded rubber gasket bedding the pane — matte black against the polished nose, and the
  // dark line that gives the aperture a hard edge instead of a soft fade into the frame.
  slab(ctx, gasketMat, APER_W + 0.1, 0.05, 0.09, 0, APER_T + 0.025, FRONT_Z - 0.06);
  slab(ctx, gasketMat, APER_W + 0.1, 0.05, 0.09, 0, APER_B - 0.025, FRONT_Z - 0.06);
  for (const s of [-1, 1] as const) {
    slab(ctx, gasketMat, 0.05, APER_H + 0.1, 0.09, s * (APER_HW + 0.025), APER_CY, FRONT_Z - 0.06);
  }

  // ===== mullion grid ==================================================================
  // I-section: a deep web spanning the recess, a proud front flange, a back flange, and a
  // bolted shoe at each end. Three panes across, two high — the reference's screen grid.
  const mullionD = revealD - 0.04;
  const mullionZ = revealZ + 0.02;
  for (const x of MULLION_X) {
    slab(ctx, steelDarkMat, 0.09, APER_H, mullionD, x, APER_CY, mullionZ);
    slab(ctx, steelNoseMat, 0.17, APER_H, 0.07, x, APER_CY, FRONT_Z - 0.045);
    slab(ctx, steelDarkMat, 0.13, APER_H, 0.05, x, APER_CY, WALL_Z + 0.045);
    for (const y of [APER_B + 0.12, APER_T - 0.12]) {
      slab(ctx, steelNoseMat, 0.28, 0.2, 0.1, x, y, FRONT_Z - 0.06);
      for (const bx of [x - 0.1, x + 0.1]) {
        bolt(bx, y - 0.07, FRONT_Z - 0.015);
        bolt(bx, y + 0.07, FRONT_Z - 0.015);
      }
    }
    slab(ctx, steelNoseMat, 0.26, 0.26, 0.12, x, TRANSOM_Y, FRONT_Z - 0.055);
    // The mullion sits proud of the glass: the pane picks up its shadow on both flanks.
    ao('radial', 0.5, 0.44, APER_H, x, APER_CY, FRONT_Z - 0.082);
  }
  slab(ctx, steelDarkMat, APER_W, 0.09, mullionD, 0, TRANSOM_Y, mullionZ);
  slab(ctx, steelNoseMat, APER_W, 0.15, 0.07, 0, TRANSOM_Y, FRONT_Z - 0.045);
  slab(ctx, steelDarkMat, APER_W, 0.11, 0.05, 0, TRANSOM_Y, WALL_Z + 0.045);
  boltRow(-3.0, TRANSOM_Y + 0.055, FRONT_Z - 0.015, 0.5, 0, 13);
  ao('radial', 0.45, APER_W, 0.5, 0, TRANSOM_Y, FRONT_Z - 0.082);

  // Corner braces cutting each aperture corner, bolted at both ends.
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const cx = sx * (APER_HW - 0.17);
      const cy = APER_CY + sy * (APER_H / 2 - 0.17);
      const g = new THREE.Mesh(chamferedBox(0.42, 0.1, 0.09), steelNoseMat);
      g.position.set(cx, cy, FRONT_Z - 0.05);
      g.rotation.z = sx * sy * -Math.PI / 4;
      g.castShadow = true;
      g.receiveShadow = true;
      ctx.scene.add(g);
      const dy = -(sx * sy) * 0.148;
      bolt(cx + 0.148, cy + dy, FRONT_Z - 0.01);
      bolt(cx - 0.148, cy - dy, FRONT_Z - 0.01);
    }
  }

  // ===== stepped surround ==============================================================
  // Each side is three slabs of decreasing depth so the frame has a chamfered profile rather
  // than one square edge — the front nose reads as a distinct highlight band at grazing angles.
  const lintelH = LINTEL_T - APER_T;                // 0.44
  const lintelCY = (LINTEL_T + APER_T) / 2;
  const sillH = APER_B - SILL_B;                    // 0.34
  const sillCY = (APER_B + SILL_B) / 2;

  slab(ctx, steelMat, FRAME_HW * 2, lintelH, 0.2, 0, lintelCY, WALL_Z + 0.1);
  slab(ctx, steelMat, FRAME_HW * 2 - 0.16, lintelH - 0.08, 0.16, 0, lintelCY, WALL_Z + 0.28);
  slab(ctx, steelNoseMat, FRAME_HW * 2 - 0.34, lintelH - 0.2, 0.12, 0, lintelCY, FRONT_Z - 0.06);
  boltRow(-FRAME_HW + 0.28, APER_T + 0.1, FRONT_Z - 0.008, 0.436, 0, 19);
  boltRow(-FRAME_HW + 0.28, LINTEL_T - 0.1, FRONT_Z - 0.008, 0.436, 0, 19);
  // The lintel steps out over the aperture three times; each step drops occlusion on the one
  // below it, and the whole run beds into the bulkhead along its top edge.
  ao('bottom', 0.62, FRAME_HW * 2, 0.4, 0, APER_T + 0.2, FRONT_Z + 0.006);
  ao('top', 0.4, FRAME_HW * 2 - 0.3, 0.3, 0, LINTEL_T - 0.15, FRONT_Z - 0.005);

  // Sill: pushed further into the room than the lintel, the way a real sill carries a ledge.
  slab(ctx, steelMat, FRAME_HW * 2, sillH, 0.2, 0, sillCY, WALL_Z + 0.1);
  slab(ctx, steelMat, FRAME_HW * 2 - 0.16, sillH - 0.06, 0.24, 0, sillCY, WALL_Z + 0.32);
  slab(ctx, steelNoseMat, FRAME_HW * 2 - 0.3, sillH - 0.14, 0.2, 0, sillCY + 0.03, FRONT_Z - 0.02);
  slab(ctx, steelNoseMat, FRAME_HW * 2 - 0.3, 0.05, 0.34, 0, APER_B - 0.02, FRONT_Z - 0.06);
  boltRow(-FRAME_HW + 0.3, 1.22, FRONT_Z + 0.075, 0.4333, 0, 19);
  ao('top', 0.6, FRAME_HW * 2, 0.34, 0, APER_B - 0.17, FRONT_Z + 0.086);

  for (const s of [-1, 1] as const) {
    const jx = s * JAMB_CX;
    slab(ctx, steelMat, JAMB_W, LINTEL_T - SILL_B, 0.2, jx, (LINTEL_T + SILL_B) / 2, WALL_Z + 0.1);
    slab(ctx, steelMat, JAMB_W - 0.1, LINTEL_T - SILL_B - 0.14, 0.16, jx, (LINTEL_T + SILL_B) / 2, WALL_Z + 0.28);
    slab(ctx, steelNoseMat, JAMB_W - 0.24, LINTEL_T - SILL_B - 0.3, 0.12, jx, (LINTEL_T + SILL_B) / 2, FRONT_Z - 0.06);
    // Raised seam ribs splitting each jamb into plates, bolted at both ends.
    for (const y of [1.52, 2.6]) {
      slab(ctx, steelDarkMat, JAMB_W - 0.2, 0.035, 0.14, jx, y, FRONT_Z - 0.05);
      bolt(s * (JAMB_CX - 0.295), y, FRONT_Z + 0.012);
      bolt(s * (JAMB_CX + 0.295), y, FRONT_Z + 0.012);
      ao('top', 0.4, JAMB_W - 0.15, 0.22, jx, y - 0.11, FRONT_Z + 0.002);
    }
    boltRow(s * 3.41, 1.25, FRONT_Z - 0.008, 0, 0.36, 7);
    // The jamb's proud nose against the aperture wall — a vertical crease down each side.
    ao('bottom', 0.55, 0.42, LINTEL_T - SILL_B, s * (APER_HW + 0.21), (LINTEL_T + SILL_B) / 2,
      FRONT_Z + 0.004, s * Math.PI / 2);
  }

  // ===== retracted blast shutter =======================================================
  // The big secondary form above the lintel: housing, ribbed body, end caps, an actuator
  // cylinder down each jamb and a hydraulic line feeding it. This is the layer that breaks
  // the top of the silhouette instead of ending the assembly on a flat beam.
  // Ceiling sits at y = 4, so the whole shutter assembly is packed into the 0.36 band above
  // the lintel rather than being allowed to grow up through it.
  const shutterY = 3.8 * (5 / 4);
  slab(ctx, steelMat, FRAME_HW * 2 - 0.5, 0.34, 0.46, 0, shutterY, WALL_Z + 0.25);
  slab(ctx, steelDarkMat, FRAME_HW * 2 - 0.36, 0.06, 0.5, 0, shutterY + 0.15, WALL_Z + 0.26);
  slab(ctx, steelNoseMat, FRAME_HW * 2 - 0.6, 0.1, 0.14, 0, shutterY - 0.15, FRONT_Z + 0.02);
  for (let i = 0; i < 27; i++) {
    slat(0.05, 0.26, 0.4, (-3.78 + i * 0.2908) * (4 / 3), shutterY, WALL_Z + 0.26);
  }
  // The housing overhangs the lintel: the crease under it never sees the key.
  ao('top', 0.7, FRAME_HW * 2 - 0.5, 0.26, 0, shutterY - 0.3, WALL_Z + 0.49);
  for (const s of [-1, 1] as const) {
    slab(ctx, steelNoseMat, 0.16, 0.4, 0.54, s * (FRAME_HW - 0.28), shutterY, WALL_Z + 0.26);
    boltRow(s * (FRAME_HW - 0.28), shutterY - 0.17, WALL_Z + 0.522, 0, 0.11, 4);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.05, 14), steelDarkMat);
    body.position.set(s * ACT_X, 3.16, FRONT_Z + 0.07);
    body.castShadow = true;
    body.receiveShadow = true;
    ctx.scene.add(body);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.0, 10), boltMat);
    rod.position.set(s * ACT_X, 2.2, FRONT_Z + 0.07);
    rod.castShadow = true;
    ctx.scene.add(rod);
    for (const [y, r, h] of [[3.68, 0.09, 0.09], [2.63, 0.09, 0.1], [1.72, 0.07, 0.12]] as const) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), steelNoseMat);
      cap.position.set(s * ACT_X, y, FRONT_Z + 0.07);
      cap.castShadow = true;
      cap.receiveShadow = true;
      ctx.scene.add(cap);
    }
    const hose = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * (FRAME_HW - 0.62), shutterY - 0.18, WALL_Z + 0.44),
        new THREE.Vector3(s * (ACT_X + 0.02), 3.4, FRONT_Z + 0.13),
        new THREE.Vector3(s * (ACT_X + 0.06), 2.5, FRONT_Z + 0.14),
        new THREE.Vector3(s * ACT_X, 1.84, FRONT_Z + 0.1),
      ]), 22, 0.022, 7, false),
      rubberMat,
    );
    hose.castShadow = true;
    ctx.scene.add(hose);
    // Seepage at the lower gland, and the grime shadow the cylinder throws on the jamb.
    ao('radial', 0.5, 0.42, 1.5, s * ACT_X, 2.4, FRONT_Z + 0.002);
  }

  // ===== jamb hardware =================================================================
  const ledGeo = new THREE.PlaneGeometry(0.4, 0.6);
  const placardTex = buildStencilPlacardTexture('V-04', 'FWD VIEWPORT');
  const placardMat = new THREE.MeshStandardMaterial({
    map: placardTex, roughness: 0.72, metalness: 0.1,
    roughnessMap: paintMaps.roughnessMap,
  });
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const jx = s * JAMB_CX;
    const bankX = s * 3.7 * (4 / 3);

    // Two indicator banks per jamb in protruding housings with their own bezels — the red
    // accent the reference hangs beside its screen bank, as real hardware rather than a decal.
    const bankTex = buildLedBankTexture(0x3a71 + i * 977);
    const bankMat = new THREE.MeshStandardMaterial({
      map: bankTex, emissiveMap: bankTex, emissive: 0xffffff, emissiveIntensity: 0.95,
      roughness: 0.45, metalness: 0.2,
    });
    for (const y of [2.16, 3.0]) {
      slab(ctx, steelDarkMat, 0.52, 0.72, 0.15, bankX, y, FRONT_Z - 0.02);
      slab(ctx, steelNoseMat, 0.56, 0.06, 0.17, bankX, y + 0.36, FRONT_Z - 0.02);
      slab(ctx, steelNoseMat, 0.56, 0.06, 0.17, bankX, y - 0.36, FRONT_Z - 0.02);
      const bank = new THREE.Mesh(ledGeo, bankMat);
      bank.position.set(bankX, y, FRONT_Z + 0.056);
      ctx.scene.add(bank);
      for (const bx of [bankX - 0.24, bankX + 0.24]) {
        bolt(bx, y + 0.36, FRONT_Z + 0.058);
        bolt(bx, y - 0.36, FRONT_Z + 0.058);
      }
      // The housing stands 15 cm off the jamb — it beds into the plate all round.
      ao('radial', 0.55, 0.98, 1.2, bankX, y, FRONT_Z + 0.001);
    }

    // Junction box feeding the banks, conduit climbing to the ceiling, and a copper flex drop
    // hugging the aperture edge — copper stays an accent on conduit only, never a surface.
    slab(ctx, steelDarkMat, 0.3, 0.3, 0.22, bankX, 3.5 * (5 / 4), FRONT_Z + 0.01);
    slab(ctx, steelNoseMat, 0.34, 0.05, 0.24, bankX, 3.66 * (5 / 4), FRONT_Z + 0.01);
    ao('radial', 0.5, 0.6, 0.6, bankX, 3.48 * (5 / 4), FRONT_Z + 0.001);
    for (const dx of [-0.09, 0.09]) {
      const conduit = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
          new THREE.Vector3(bankX + dx, 3.62 * (5 / 4), FRONT_Z + 0.1),
          new THREE.Vector3(bankX + dx * 1.6, 3.82 * (5 / 4), FRONT_Z + 0.16),
          new THREE.Vector3(bankX + dx * 1.8, 3.95 * (5 / 4), WALL_Z + 0.6),
        ]), 12, 0.026, 7, false),
        rubberMat,
      );
      conduit.castShadow = true;
      ctx.scene.add(conduit);
    }
    const flex = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 3.56, 3.44, FRONT_Z + 0.06),
        new THREE.Vector3(s * 3.4, 2.9, FRONT_Z + 0.02),
        new THREE.Vector3(s * 3.42, 2.0, FRONT_Z + 0.03),
        new THREE.Vector3(s * 3.36, 1.22, FRONT_Z + 0.1),
      ]), 24, 0.019, 7, false),
      brassMat,
    );
    flex.castShadow = true;
    ctx.scene.add(flex);
    for (const y of [3.05 * (5 / 4), 2.35 * (5 / 4), 1.62 * (5 / 4)]) {
      slab(ctx, steelNoseMat, 0.08, 0.05, 0.09, s * 3.41, y, FRONT_Z + 0.03);
    }

    // Vent louvre low on the jamb, and an ID placard above it.
    slab(ctx, recessMat, 0.44, 0.3, 0.06, jx, 1.22, FRONT_Z - 0.04);
    for (let k = 0; k < 5; k++) {
      slat(0.4, 0.03, 0.05, jx, 1.1 + k * 0.06, FRONT_Z - 0.055);
    }
    ao('radial', 0.55, 0.6, 0.44, jx, 1.22, FRONT_Z + 0.002);
    const placard = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), placardMat);
    placard.position.set(jx, 1.68, FRONT_Z + 0.001);
    ctx.scene.add(placard);

    // Blinking status dots sitting on the mid seam rib, driven by the shared blink loop.
    for (let k = 0; k < 2; k++) {
      const dotMat = new THREE.MeshStandardMaterial({
        color: 0x141820, roughness: 0.25, metalness: 0.1,
        emissive: k === 0 ? 0x4fd8f0 : 0xe0552f, emissiveIntensity: 1.4,
      });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), dotMat);
      dot.position.set(jx - 0.16 + k * 0.32, 2.6 * (5 / 4), FRONT_Z + 0.025);
      ctx.scene.add(dot);
      ctx.statusLights.push({ mesh: dot, material: dotMat, phase: i * 1.7 + k * 0.9, onIntensity: 1.9 });
    }
  }

  // ===== port jamb: access panel left hanging open ======================================
  // The reference's own weakness is that it is perfectly mirror-symmetric. This is the loudest
  // break: one plate off its seat, a dark cavity, a colour-coded loom and two breakers.
  const bayX = -JAMB_CX;
  const bayY = 2.02 * (5 / 4);
  const openBayTex = buildOpenBayTexture();
  const openBay = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.74),
    new THREE.MeshStandardMaterial({ map: openBayTex, roughness: 0.9, metalness: 0.25 }),
  );
  openBay.position.set(bayX, bayY, FRONT_Z - 0.09);
  openBay.receiveShadow = true;
  ctx.scene.add(openBay);
  // Bezel round the opening so the cavity reads as cut through a real plate thickness.
  slab(ctx, steelNoseMat, 0.58, 0.04, 0.1, bayX, bayY + 0.39, FRONT_Z - 0.05);
  slab(ctx, steelNoseMat, 0.58, 0.04, 0.1, bayX, bayY - 0.39, FRONT_Z - 0.05);
  for (const dx of [-0.27, 0.27]) {
    slab(ctx, steelNoseMat, 0.04, 0.82, 0.1, bayX + dx, bayY, FRONT_Z - 0.05);
  }
  ao('top', 0.85, 0.5, 0.5, bayX, bayY + 0.12, FRONT_Z - 0.086);
  // The removed plate, swung out on its lower hinge and hanging.
  const door = slab(ctx, steelMat, 0.5, 0.72, 0.03, 0, 0, 0);
  door.position.set(bayX + 0.18, bayY - 0.31, FRONT_Z + 0.12);
  door.rotation.set(-1.15, 0.22, 0.06);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8), boltMat);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(bayX, bayY - 0.38, FRONT_Z - 0.01);
  hinge.castShadow = true;
  ctx.scene.add(hinge);
  // Loom escaping the cavity and dropping to a strain-relief clamp on the sill.
  const loom = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(bayX + 0.1, bayY - 0.25, FRONT_Z - 0.06),
      new THREE.Vector3(bayX + 0.26, bayY - 0.62, FRONT_Z + 0.09),
      new THREE.Vector3(bayX + 0.14, 1.24, FRONT_Z + 0.14),
      new THREE.Vector3(bayX + 0.3, 1.06, FRONT_Z + 0.06),
    ]), 26, 0.033, 8, false),
    rubberMat,
  );
  loom.castShadow = true;
  ctx.scene.add(loom);

  // ===== starboard sill: clip-on work lamp ==============================================
  // The critic's note on the reference was that its light is uniformly ambient with nothing
  // pooling. This is the answer: a practical the crew clamped on, throwing a hard warm pool
  // across one end of the sill and down the apron, off-axis and unmirrored.
  const lampX = 2.42 * (4 / 3);
  slab(ctx, steelDarkMat, 0.13, 0.16, 0.16, lampX, 1.2, FRONT_Z + 0.03);
  const neck = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(lampX, 1.28, FRONT_Z + 0.03),
      new THREE.Vector3(lampX - 0.06, 1.58, FRONT_Z + 0.12),
      new THREE.Vector3(lampX - 0.28, 1.68, FRONT_Z + 0.2),
    ]), 16, 0.017, 7, false),
    rubberMat,
  );
  neck.castShadow = true;
  ctx.scene.add(neck);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.075, 0.14, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x8b6f4a, roughness: 0.42, metalness: 0.85, side: THREE.DoubleSide,
    }),
  );
  shade.position.set(lampX - 0.31, 1.65, FRONT_Z + 0.22);
  shade.rotation.set(0.95, 0, 0.45);
  shade.castShadow = true;
  ctx.scene.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 16),
    new THREE.MeshStandardMaterial({
      color: 0x3a3020, emissive: 0xffd9a0, emissiveIntensity: 2.4, roughness: 0.4,
    }),
  );
  bulb.position.set(lampX - 0.35, 1.59, FRONT_Z + 0.27);
  bulb.rotation.set(-2.2, 0, 0.45);
  ctx.scene.add(bulb);
  const lamp = new THREE.SpotLight(0xffcd94, 3.4, 3.6, 0.62, 0.55, 2);
  lamp.position.set(lampX - 0.34, 1.6, FRONT_Z + 0.26);
  lamp.target.position.set(lampX - 1.1, 0.5, FRONT_Z + 0.35);
  ctx.scene.add(lamp.target);
  ctx.scene.add(lamp);

  // ===== sill instruments, kick strip, practical =======================================
  // Cool inserts angled up out of the ledge, breaking the bottom of the pane with a foreground
  // layer the way the reference stacks readouts in front of its display bank.
  const readoutGeo = new THREE.PlaneGeometry(0.46, 0.16);
  const bezelXs = [-2.66, -1.72, 1.72, 2.66].map((x) => x * (4 / 3));
  for (let i = 0; i < bezelXs.length; i++) {
    const x = bezelXs[i];
    const tex = buildSillReadoutTexture(i * 7 + 3);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.2,
      roughness: 0.5, metalness: 0,
    });
    const housing = slab(ctx, steelDarkMat, 0.56, 0.1, 0.24, x, APER_B + 0.06, FRONT_Z - 0.04);
    housing.rotation.x = -0.9;
    const screen = new THREE.Mesh(readoutGeo, mat);
    screen.position.set(x, APER_B + 0.11, FRONT_Z + 0.02);
    screen.rotation.x = -0.9;
    ctx.scene.add(screen);
    bolt(x - 0.31, APER_B - 0.02, FRONT_Z + 0.102);
    bolt(x + 0.31, APER_B - 0.02, FRONT_Z + 0.102);
  }

  // Hazard kick strip on the sill nose, and a warm practical tucked underneath it washing the
  // deck — warm and cool stay separated by fixture, meeting only at the edge of their pools.
  const kick = slab(ctx, hazardMat, FRAME_HW * 2 - 0.32, 0.13, 0.04, 0, 1.13 * (5 / 4), FRONT_Z + 0.085);
  kick.renderOrder = 1;
  slab(ctx, warmStripMat, FRAME_HW * 2 - 1.4, 0.04, 0.14, 0, 1.03 * (5 / 4), FRONT_Z + 0.04);

  // ===== bolted repair patch over the pane ==============================================
  // A plate someone welded over a cracked corner, sealant squeezed out round the edge. It sits
  // *on* the glass, so it also proves the pane has a front surface.
  const patchX = -2.32 * (4 / 3);
  const patchY = 1.62 * (5 / 4);
  const patch = slab(ctx, steelNoseMat, 0.52, 0.36, 0.035, patchX, patchY, FRONT_Z - 0.115);
  patch.rotation.z = 0.04;
  const sealant = slab(ctx, gasketMat, 0.58, 0.42, 0.018, patchX, patchY, FRONT_Z - 0.1);
  sealant.rotation.z = 0.04;
  for (const [dx, dy] of [[-0.2, -0.13], [0.2, -0.13], [-0.2, 0.13], [0.2, 0.13]] as const) {
    bolt(patchX + dx, patchY + dy, FRONT_Z - 0.13);
  }
  ao('radial', 0.6, 0.86, 0.68, patchX, patchY - 0.02, FRONT_Z - 0.088);

  // ===== apron carrying the bay to the deck ============================================
  // Without this, the raw bulkhead below the sill reads as a large warm rust band directly
  // under the room's coolest element. The apron keeps the whole -Z end in grey steel.
  slab(ctx, steelMat, FRAME_HW * 2, SILL_B, 0.12, 0, SILL_B / 2, WALL_Z + 0.06);
  for (let i = 0; i < 7; i++) {
    slat(0.04, SILL_B - 0.12, 0.1, -3.8 + i * 1.2667, SILL_B / 2, WALL_Z + 0.13);
  }
  slab(ctx, steelDarkMat, FRAME_HW * 2 - 0.2, 0.04, 0.1, 0, 0.52, WALL_Z + 0.13);
  slab(ctx, steelNoseMat, FRAME_HW * 2, 0.09, 0.2, 0, 0.06, WALL_Z + 0.1);
  boltRow(-FRAME_HW + 0.34, 0.2, WALL_Z + 0.115, 0.5514, 0, 15);
  for (const s of [-1, 1] as const) {
    slab(ctx, recessMat, 0.9, 0.42, 0.08, s * 2.9, 0.42, WALL_Z + 0.15);
    for (let k = 0; k < 6; k++) {
      slat(0.84, 0.035, 0.06, s * 2.9, 0.26 + k * 0.06, WALL_Z + 0.14);
    }
    ao('radial', 0.5, 1.1, 0.6, s * 2.9, 0.42, WALL_Z + 0.162);
  }
  // The sill ledge overhangs the apron, and the apron beds into the deck. Both creases are
  // below the key's reach and are what actually make the assembly look *stood on the floor*.
  ao('top', 0.75, FRAME_HW * 2, 0.36, 0, SILL_B - 0.18, WALL_Z + 0.135);
  ao('bottom', 0.8, FRAME_HW * 2, 0.34, 0, 0.17, WALL_Z + 0.222);
  ao('top', 0.55, FRAME_HW * 2, 0.5, 0, 0.012, WALL_Z + 0.35, 0, -Math.PI / 2);

  // ===== localised wear ================================================================
  // Drips under the sill and under each actuator gland only — corrosion where fluid actually
  // runs, rather than a uniform tint over the frame.
  const dripTex = buildDripStreakTexture();
  const dripMat = new THREE.MeshBasicMaterial({
    map: dripTex, transparent: true, opacity: 0.62, depthWrite: false,
  });
  const dripA = new THREE.Mesh(new THREE.PlaneGeometry(FRAME_HW * 2 - 0.4, 0.86), dripMat);
  dripA.position.set(0, 0.52 * (5 / 4), WALL_Z + 0.128);
  dripA.renderOrder = 2;
  ctx.scene.add(dripA);
  for (const s of [-1, 1] as const) {
    const dripB = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), dripMat);
    dripB.position.set(s * 3.95 * (4 / 3), 1.46 * (5 / 4), FRONT_Z + 0.005);
    dripB.renderOrder = 2;
    ctx.scene.add(dripB);
  }

  // ===== instanced batches =============================================================
  const slats = new THREE.InstancedMesh(UNIT_BOX, slatMat, slatXforms.length);
  for (let i = 0; i < slatXforms.length; i++) slats.setMatrixAt(i, slatXforms[i]);
  slats.instanceMatrix.needsUpdate = true;
  slats.castShadow = true;
  slats.receiveShadow = true;
  ctx.scene.add(slats);

  const bolts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.024, 0.028, 0.028, 8),
    boltMat,
    boltXforms.length,
  );
  for (let i = 0; i < boltXforms.length; i++) bolts.setMatrixAt(i, boltXforms[i]);
  bolts.instanceMatrix.needsUpdate = true;
  bolts.castShadow = true;
  ctx.scene.add(bolts);

  // ===== light =========================================================================
  const paneLight = new THREE.PointLight(0x6fd0ea, 1.05, 7.5, 2);
  paneLight.position.set(0, 2.5 * (5 / 4), -4.9 * (4 / 3));
  ctx.scene.add(paneLight);
  const sillLight = new THREE.PointLight(0xffd9a0, 0.85, 5, 2);
  sillLight.position.set(0, 1.02 * (5 / 4), -5.1 * (4 / 3));
  ctx.scene.add(sillLight);
  // The retracted shutter and its actuators sit above the lintel, past the reach of both lights
  // above — a housing-and-hardware assembly that otherwise renders fully unlit black regardless
  // of the room's own lighting pass. A dim neutral fill keyed to the housing gives it the same
  // "still carries material and detail in shadow" read the brief calls for elsewhere.
  const shutterFill = new THREE.PointLight(0xaebac2, 0.5, 3.2, 2);
  shutterFill.position.set(0, shutterY - 0.1, FRONT_Z + 0.3);
  ctx.scene.add(shutterFill);

  // ===== hull-exterior starfield =======================================================
  // The scene rotates whatever is registered here about Y, so this cloud is a spherical shell
  // centred on the room: rotation stays a no-op on its silhouette and it can never swing
  // inside the hull. The view a player reads is the parallax stack above.
  const starCount = 1200;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 70 + Math.random() * 220;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starfield = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcfe0ff, size: 0.9, sizeAttenuation: true,
  }));
  ctx.setStarfield(starfield);
  ctx.scene.add(starfield);

  // ===== animation =====================================================================
  // Each exterior layer drifts at its own rate; the difference between them is the parallax
  // cue that keeps the pane from reading as wallpaper.
  ctx.animated.push((elapsed) => {
    for (const layer of parallax) layer.tex.offset.x = elapsed * layer.rate;
  });
}
