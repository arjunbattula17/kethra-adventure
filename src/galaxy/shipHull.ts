import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import { displayFontsReady } from '../core/loadFonts';

/**
 * The Wren, built in code (docs/DESIGN.md §2, and the licensing decision in §10): an ARK Ltd survey
 * freighter with, per LORE.md, a long spine, four engine pods, stern hex panels, Airlock 04 and
 * the cold-sleep section 4-B sealed behind a breach. Everything patched.
 *
 * Shape language is ARK Ltd's: rectangles with 45° chamfers. Every module is a side profile with
 * chamfered corners, extruded with a one-segment bevel so its edges catch light, and flat-shaded.
 * Paint and structure get world-scale panel UVs, so the seam and bolt detail has the same density
 * on every part. Vertex colours carry the patching (a few plates repainted a different shade) and
 * the soot that builds toward the engines. Everything merges into one mesh per material (about
 * nine draw calls).
 *
 * It replaces a CC BY freighter model that could only ever look like a toy: flat colour slots on
 * palette UVs that no texture could use.
 */

/** Local ship axes: +X nose, -X aft/engines, +Y up, +Z port (the red light). */
export interface ShipHull {
  group: THREE.Group;
  /** World-facing exhaust points at the mouth of each engine bell, in the group's local space. */
  engineLocalPositions: THREE.Vector3[];
  /** The materials a cinematic drives. Each is this hull's own instance. */
  parts: {
    /** The bridge canopy and the crew-section ports: the light of people aboard. */
    windows: THREE.MeshStandardMaterial;
    /** The four engine throats: dark until the drive lights. */
    engines: THREE.MeshStandardMaterial;
    /** The stern's hex heat-shield tiles. */
    stern: THREE.MeshStandardMaterial;
    navPort: THREE.MeshStandardMaterial;
    navStarboard: THREE.MeshStandardMaterial;
    /** The painted plating, for scenes that relight or retint it. */
    paint: THREE.MeshStandardMaterial;
  };
}

export interface HullOptions {
  /** A different freighter of the same class: livery and proportions vary (the Anchorage's hulls). */
  variant?: number;
}

const LENGTH_HALF = 4.75;
const PANEL = 1.6; // world units per tile of the panel texture

// ---------------------------------------------------------------------------------------------
// Textures, cached per session: one tiling panel sheet and one stencil atlas.

let panelTex: { map: THREE.CanvasTexture; rough: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;

/** A tangent-space normal map from a height canvas (Sobel), so seams are grooves and bolts bumps. */
function normalFromHeight(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = height.width;
  const h = height.height;
  const src = height.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const at = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function panelTextures(): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  if (panelTex) return panelTex;
  const size = 512;
  const rand = mulberry32(0x7e11);
  const albedo = document.createElement('canvas');
  const rough = document.createElement('canvas');
  const height = document.createElement('canvas');
  albedo.width = albedo.height = rough.width = rough.height = height.width = height.height = size;
  const a = albedo.getContext('2d')!;
  const r = rough.getContext('2d')!;
  const hgt = height.getContext('2d')!;
  hgt.fillStyle = 'rgb(128,128,128)';
  hgt.fillRect(0, 0, size, size);
  a.fillStyle = '#dcdcdc';
  a.fillRect(0, 0, size, size);
  r.fillStyle = '#8a8a8a';
  r.fillRect(0, 0, size, size);
  // Plates in staggered courses, four per tile each way; every plate a hair different.
  const rows = 4;
  const cols = 4;
  const ph = size / rows;
  const pw = size / cols;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 ? pw / 2 : 0;
    for (let col = -1; col <= cols; col++) {
      const x = col * pw + offset;
      const y = row * ph;
      const shade = 178 + Math.floor(rand() * 62);
      a.fillStyle = `rgb(${shade},${shade},${shade})`;
      a.fillRect(x + 2, y + 2, pw - 4, ph - 4);
      const rv = 120 + Math.floor(rand() * 40);
      r.fillStyle = `rgb(${rv},${rv},${rv})`;
      r.fillRect(x + 2, y + 2, pw - 4, ph - 4);
      // Seams: dark, rough, and a groove in the height map.
      a.fillStyle = 'rgba(40,40,40,0.9)';
      r.fillStyle = '#e8e8e8';
      hgt.fillStyle = 'rgb(20,20,20)';
      for (const ctx of [a, r, hgt]) {
        ctx.fillRect(x, y, pw, 2);
        ctx.fillRect(x, y, 2, ph);
      }
      // Bolt rows just inside each seam: small raised heads.
      a.fillStyle = 'rgba(60,60,60,0.85)';
      hgt.fillStyle = 'rgb(230,230,230)';
      for (let b = 8; b < pw - 4; b += 16) {
        for (const by of [y + 6, y + ph - 9]) {
          a.fillRect(x + b, by, 3, 3);
          hgt.fillRect(x + b, by, 3, 3);
        }
      }
    }
  }
  // Grime: soft streaks running aft, and a scatter of scuffs.
  for (let i = 0; i < 140; i++) {
    const gx = rand() * size;
    const gy = rand() * size;
    const len = 20 + rand() * 90;
    a.fillStyle = `rgba(30,28,26,${0.03 + rand() * 0.06})`;
    a.fillRect(gx, gy, len, 2 + rand() * 3);
    r.fillStyle = `rgba(230,230,230,${0.05 + rand() * 0.08})`;
    r.fillRect(gx, gy, len, 3);
  }
  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const rmap = new THREE.CanvasTexture(rough);
  const nmap = new THREE.CanvasTexture(normalFromHeight(height, 1.6));
  for (const t of [map, rmap, nmap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  panelTex = { map, rough: rmap, normal: nmap };
  return panelTex;
}

/** Stencil lettering in ARK Ltd's face (Rajdhani, the same face as the UI; docs/DESIGN.md §2). */
function stencilAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(28,30,34,0.92)';
  g.textBaseline = 'middle';
  // Row 0: WREN, large.
  g.font = '700 120px Rajdhani, sans-serif';
  g.fillText('WREN', 12, 64);
  // Row 0 right: ARK LTD · SURVEY.
  g.font = '700 44px Rajdhani, sans-serif';
  g.fillText('ARK LTD  SURVEY 9', 470, 64);
  // Row 1: 04 with a hazard band, and 4-B SEALED.
  g.font = '700 84px Rajdhani, sans-serif';
  g.fillText('04', 12, 192);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? 'rgba(28,30,34,0.92)' : 'rgba(176,132,47,0.95)';
    g.beginPath();
    g.moveTo(130 + i * 26, 230);
    g.lineTo(152 + i * 26, 230);
    g.lineTo(182 + i * 26, 154);
    g.lineTo(160 + i * 26, 154);
    g.fill();
  }
  g.fillStyle = 'rgba(28,30,34,0.92)';
  g.font = '700 64px Rajdhani, sans-serif';
  g.fillText('4-B  SEALED', 330, 192);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers. Every part ends non-indexed with flat normals, world-scale uv and a colour.

/** A side profile (x, y) with the chamfered corners already in it, extruded along Z. */
function extrudeProfile(points: [number, number][], depth: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  return geo;
}

/** A chamfered box: rectangle profile with 45° corners, beveled on the extruded edges too. */
function chamferBox(w: number, h: number, d: number, c: number): THREE.BufferGeometry {
  const x = w / 2;
  const y = h / 2;
  const k = Math.min(c, x * 0.45, y * 0.45);
  return extrudeProfile([[-x + k, -y], [x - k, -y], [x, -y + k], [x, y - k], [x - k, y], [-x + k, y], [-x, y - k], [-x, -y + k]], d, Math.min(k * 0.6, d * 0.2));
}

/** An octagonal prism along X. */
function octPrism(radius: number, length: number, taper = 1): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius * taper, radius, length, 8, 1, false);
  geo.rotateY(Math.PI / 8);
  geo.rotateZ(Math.PI / 2);
  return geo;
}

interface Part {
  geo: THREE.BufferGeometry;
  /** Per-part tint multiplier (1 = the material's own colour). */
  tint?: number;
}

/** Non-indexed, flat normals, world-scale planar uvs and vertex colours (patch tint and soot). */
function finish(part: Part, rand: () => number, soot = true): THREE.BufferGeometry {
  let geo = part.geo.index ? part.geo.toNonIndexed() : part.geo;
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const col = new Float32Array(pos.count * 3);
  const base = part.tint ?? 1;
  for (let i = 0; i < pos.count; i += 3) {
    // One decision per triangle, from its centroid: which plane to project on, and which panel
    // (so repainted plates are whole plates, not noise).
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    const cell = Math.floor(cx / 0.4) * 73856093 ^ Math.floor(cy / 0.4) * 19349663 ^ Math.floor(cz / 0.4) * 83492791;
    const h = ((cell >>> 0) % 1000) / 1000;
    const patch = h > 0.9 ? 0.7 + rand() * 0.08 : 0.94 + h * 0.08;
    const aft = soot ? Math.min(1, Math.max(0, (-cx - 2.6) / 2.1)) : 0;
    // Form: faces turned to the belly sit in the hull's own shadow; the lower third wears the
    // darker half of the two-tone livery.
    const belly = nrm.getY(i) < -0.3 ? 0.62 : cy < -0.3 ? 0.74 : 1;
    const shade = base * patch * belly * (1 - 0.55 * aft * aft);
    for (let k = 0; k < 3; k++) {
      const vx = pos.getX(i + k);
      const vy = pos.getY(i + k);
      const vz = pos.getZ(i + k);
      let u: number;
      let v: number;
      if (nx >= ny && nx >= nz) {
        u = vz;
        v = vy;
      } else if (ny >= nz) {
        u = vx;
        v = vz;
      } else {
        u = vx;
        v = vy;
      }
      uv[(i + k) * 2] = u / PANEL;
      uv[(i + k) * 2 + 1] = v / PANEL;
      col[(i + k) * 3] = shade;
      col[(i + k) * 3 + 1] = shade;
      col[(i + k) * 3 + 2] = shade * (aft > 0 ? 0.97 : 1);
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo !== part.geo) part.geo.dispose();
  return geo;
}

/** Tapers a geometry's width (z) and height toward the nose, for the prow. */
function taperNose(geo: THREE.BufferGeometry, fromX: number, toX: number, zScale: number, yScale: number, yCentre: number): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x <= fromX) continue;
    const t = Math.min(1, (x - fromX) / (toX - fromX));
    const s = t * t;
    pos.setZ(i, pos.getZ(i) * (1 - (1 - zScale) * s));
    pos.setY(i, yCentre + (pos.getY(i) - yCentre) * (1 - (1 - yScale) * s * 0.5));
  }
  pos.needsUpdate = true;
}

function placed(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z);
  geo.applyMatrix4(m);
  return geo;
}

/** A flat quad facing +normal at `at`, for windows and decals. uv optional (atlas rect). */
function quad(w: number, h: number, at: THREE.Vector3, normal: THREE.Vector3, up = new THREE.Vector3(0, 1, 0), uvRect?: [number, number, number, number]): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(w, h);
  if (uvRect) {
    const [u0, v0, u1, v1] = uvRect;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  const z = normal.clone().normalize();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(at));
  return geo.toNonIndexed();
}

// ---------------------------------------------------------------------------------------------

export async function buildShipHull(opts: HullOptions = {}): Promise<ShipHull> {
  // The stencils are drawn in Rajdhani; drawing before the face has loaded would bake the fallback.
  await displayFontsReady();
  const variant = opts.variant ?? 0;
  const rand = mulberry32(0x3e11 + variant * 977);
  const vr = variant ? mulberry32(variant * 131) : () => 0.5;
  // Proportions: the Wren herself at variant 0; other hulls of her class stretch and shrink.
  const deckLen = 2.9 + (vr() - 0.5) * 1.0;
  const deckH = 1.36 + (vr() - 0.5) * 0.3;
  const deckW = 1.72 + (vr() - 0.5) * 0.3;

  const paint: THREE.BufferGeometry[] = [];
  const structure: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const bells: THREE.BufferGeometry[] = [];
  const throats: THREE.BufferGeometry[] = [];
  const tiles: THREE.BufferGeometry[] = [];
  const stencils: THREE.BufferGeometry[] = [];

  // --- The command module: bridge and main deck, the room the player walks. Its side profile
  // rises to a brow above a chamfered chin; seen from above, the prow narrows.
  const noseX = LENGTH_HALF;
  const aftX = noseX - deckLen;
  const top = deckH / 2 + 0.02;
  const bot = -deckH / 2 + 0.02;
  const cmd = extrudeProfile(
    [
      [aftX, bot], [noseX - 1.05, bot], [noseX - 0.3, bot + 0.38], [noseX, bot + 0.72],
      [noseX - 0.36, top - 0.28], [noseX - 1.3, top], [aftX + 0.12, top], [aftX, top - 0.12],
    ],
    deckW,
    0.07,
  );
  taperNose(cmd, noseX - 1.6, noseX, 0.62, 0.9, 0);
  paint.push(finish({ geo: cmd }, rand));
  // The amber livery band: the Wren's own colour, painted, never lit. It shares the paint material;
  // its vertex colour turns the pale paint into a worn amber (#b0842f-ish after the paint map).
  const band = finish({ geo: placed(chamferBox(deckLen * 0.62, 0.09, deckW + 0.02, 0.02), aftX + deckLen * 0.36, bot + 0.42, 0) }, rand, false);
  const bandColour = band.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < bandColour.count; i++) bandColour.setXYZ(i, 0.62, 0.36, 0.08);
  paint.push(band);

  // Bridge canopy on the brow, and a run of ports along each side of the crew section.
  const browMid = new THREE.Vector3(noseX - 0.2, bot + 0.72 + 0.22, 0);
  glass.push(quad(0.3, deckW * 0.58, browMid.clone().add(new THREE.Vector3(0.012, 0, 0)), new THREE.Vector3(0.82, 0.57, 0), new THREE.Vector3(0, 0, 1)));
  for (let side = -1; side <= 1; side += 2) {
    // Four ports, stopping short of the prow where the hull starts to narrow.
    const first = aftX + 0.3;
    const last = noseX - 1.72;
    for (let i = 0; i < 4; i++) {
      const x = first + (i * (last - first)) / 3;
      const zSide = side * (deckW / 2 + 0.006);
      glass.push(quad(0.13, 0.11, new THREE.Vector3(x, 0.2, zSide), new THREE.Vector3(0, 0, side)));
    }
  }

  // --- Section 4-B: cold sleep, sealed behind the breach. A shorter module aft of the deck.
  const sbLen = 1.0;
  const sbX = aftX - sbLen / 2 + 0.05;
  paint.push(finish({ geo: placed(chamferBox(sbLen, deckH * 0.8, deckW * 0.84, 0.16), sbX, 0.04, 0), tint: 0.96 }, rand));
  // The breach, patched: a darker plate bolted over the tear on the port side, and bent shards.
  const patch = chamferBox(0.72, 0.48, 0.05, 0.05);
  placed(patch, sbX + 0.08, 0.1, deckW * 0.42 + 0.01);
  structure.push(finish({ geo: patch, tint: 0.62 }, rand, false));
  for (let i = 0; i < 3; i++) {
    const shard = chamferBox(0.22 - i * 0.04, 0.05, 0.12, 0.01);
    placed(shard, sbX - 0.28 + i * 0.14, 0.38 - i * 0.07, deckW * 0.42 + 0.05, 0.3 * (i + 1), 0.4, 0.2 - i * 0.3);
    structure.push(finish({ geo: shard, tint: 0.7 }, rand, false));
  }

  // --- The spine: a chamfered box beam with frames, survey racks, radiators and the Deep Scanner.
  const spineFore = sbX - sbLen / 2;
  const spineAft = -3.0;
  const spineLen = spineFore - spineAft;
  const spineMid = (spineFore + spineAft) / 2;
  structure.push(finish({ geo: placed(chamferBox(spineLen, 0.62, 0.62, 0.11), spineMid, 0, 0) }, rand));
  for (let i = 0; i <= 7; i++) {
    const x = spineAft + 0.15 + i * ((spineLen - 0.3) / 7);
    structure.push(finish({ geo: placed(octPrism(0.4, 0.08), x, 0, 0), tint: 0.85 }, rand));
  }
  // Survey racks: two either side, one starboard slot empty (only its clamps remain).
  const racks: [number, number, boolean][] = [];
  for (const x of [spineMid + 1.15, spineMid + 0.35, spineMid - 0.45, spineMid - 1.2]) {
    racks.push([x, 1, true], [x, -1, !(x === spineMid - 0.45)]);
  }
  for (const [x, side, present] of racks) {
    const z = side * 0.55;
    structure.push(finish({ geo: placed(chamferBox(0.1, 0.7, 0.1, 0.02), x - 0.36, 0, z), tint: 0.8 }, rand));
    structure.push(finish({ geo: placed(chamferBox(0.1, 0.7, 0.1, 0.02), x + 0.36, 0, z), tint: 0.8 }, rand));
    if (present) paint.push(finish({ geo: placed(chamferBox(0.74, 0.56, 0.5, 0.08), x, 0, side * 0.68), tint: 0.82 + rand() * 0.16 }, rand));
  }
  // Radiators: thin dark fins above and below the spine.
  for (const side of [1, -1]) {
    const fin = chamferBox(spineLen * 0.7, 0.62, 0.035, 0.04);
    placed(fin, spineMid - 0.1, side * 0.6, 0);
    structure.push(finish({ geo: fin, tint: 0.55 }, rand));
  }
  // The Deep Scanner: a mast and a hexagonal array, tilted forward. The ping comes from here.
  const scanX = spineMid + 0.2;
  structure.push(finish({ geo: placed(new THREE.CylinderGeometry(0.045, 0.06, 0.62, 8), scanX, 0.58, 0) }, rand));
  const dish = new THREE.CylinderGeometry(0.46, 0.46, 0.05, 6);
  placed(dish, scanX + 0.05, 0.92, 0, 0, 0, -0.5);
  structure.push(finish({ geo: dish, tint: 0.9 }, rand));

  // --- The engine drum and the stern's hex heat shield.
  const drumFore = spineAft;
  const drumAft = -3.85;
  const drumMid = (drumFore + drumAft) / 2;
  structure.push(finish({ geo: placed(octPrism(0.92, drumFore - drumAft, 0.84), drumMid, 0, 0) }, rand));
  const hexR = 0.12;
  const hexGeo = new THREE.CylinderGeometry(hexR * 0.94, hexR * 0.94, 0.03, 6);
  hexGeo.rotateZ(Math.PI / 2);
  for (let q = -4; q <= 4; q++) {
    for (let r = -4; r <= 4; r++) {
      const hy = hexR * 1.5 * q;
      const hz = hexR * Math.sqrt(3) * (r + q / 2);
      if (Math.hypot(hy, hz) > 0.78) continue;
      tiles.push(finish({ geo: placed(hexGeo.clone(), drumAft - 0.012, hy, hz), tint: 0.9 + rand() * 0.15 }, rand, false));
    }
  }
  hexGeo.dispose();

  // --- Four engine pods on pylons, in an X: chamfered octagonal barrels with flared bells.
  const podCentreX = -3.72;
  const podLen = 1.3;
  const bellProfile = [new THREE.Vector2(0.24, 0), new THREE.Vector2(0.27, -0.12), new THREE.Vector2(0.32, -0.3), new THREE.Vector2(0.36, -0.42)];
  const engineLocalPositions: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * (Math.PI / 2);
    const y = Math.sin(a) * 1.28;
    const z = Math.cos(a) * 1.28;
    structure.push(finish({ geo: placed(octPrism(0.3, podLen, 0.8), podCentreX, y, z), tint: 0.95 }, rand));
    paint.push(finish({ geo: placed(octPrism(0.315, 0.5), podCentreX + 0.25, y, z), tint: 0.93 }, rand));
    // Pylon from the drum out to the pod.
    const pylon = chamferBox(0.7, 0.1, 0.9, 0.03);
    pylon.rotateX(-a);
    placed(pylon, podCentreX + 0.1, y * 0.55, z * 0.55);
    structure.push(finish({ geo: pylon, tint: 0.8 }, rand));
    const bellX = podCentreX - podLen / 2;
    const bell = new THREE.LatheGeometry(bellProfile, 12);
    bell.rotateZ(Math.PI / 2);
    placed(bell, bellX, y, z);
    bells.push(finish({ geo: bell }, rand, false));
    // The throat: a recessed disc that glows when the drive runs.
    const throat = new THREE.CircleGeometry(0.25, 12);
    throat.rotateY(-Math.PI / 2);
    placed(throat, bellX - 0.02, y, z);
    throats.push(throat.toNonIndexed());
    engineLocalPositions.push(new THREE.Vector3(bellX - 0.42, y, z));
  }

  // --- Stencils: WREN and the owner's mark on both flanks, 04 by the airlock, 4-B on the breach.
  const flankX = aftX + deckLen * 0.5;
  for (const side of [1, -1]) {
    const z = side * (deckW / 2 + 0.008);
    const n = new THREE.Vector3(0, 0, side);
    stencils.push(quad(1.05, 0.26, new THREE.Vector3(flankX + side * 0.1, -0.12, z), n, undefined, [0, 0.5, 0.43, 1]));
    stencils.push(quad(1.02, 0.1, new THREE.Vector3(flankX + side * 0.1, -0.34, z), n, undefined, [0.455, 0.62, 0.98, 0.88]));
  }
  stencils.push(quad(0.3, 0.26, new THREE.Vector3(aftX + 0.35, 0.04, deckW / 2 + 0.008), new THREE.Vector3(0, 0, 1), undefined, [0, 0, 0.19, 0.5]));
  stencils.push(quad(0.62, 0.12, new THREE.Vector3(sbX + 0.08, -0.22, deckW * 0.42 + 0.04), new THREE.Vector3(0, 0, 1), undefined, [0.31, 0.12, 0.72, 0.4]));

  // ---------------------------------------------------------------------------------------------
  const tex = panelTextures();
  const hue = variant ? new THREE.Color().setHSL(0.05 + vr() * 0.55, 0.08 + vr() * 0.12, 0.34 + vr() * 0.14) : new THREE.Color(0x7c8084);
  const mats = {
    paint: new THREE.MeshStandardMaterial({ name: 'hull-paint', color: hue, map: tex.map, roughnessMap: tex.rough, normalMap: tex.normal, roughness: 0.74, metalness: 0.12, vertexColors: true }),
    structure: new THREE.MeshStandardMaterial({ name: 'hull-structure', color: 0x4a515a, map: tex.map, roughnessMap: tex.rough, normalMap: tex.normal, roughness: 0.62, metalness: 0.7, vertexColors: true }),
    glass: new THREE.MeshStandardMaterial({ name: 'hull-windows', color: 0x0c1218, roughness: 0.08, metalness: 0.9, emissive: 0xffc27a, emissiveIntensity: 0, side: THREE.FrontSide }),
    bells: new THREE.MeshStandardMaterial({ name: 'hull-bells', color: 0x2c2724, roughness: 0.38, metalness: 0.92, vertexColors: true, side: THREE.DoubleSide }),
    throats: new THREE.MeshStandardMaterial({ name: 'hull-engines', color: 0x120d0a, roughness: 0.6, metalness: 0.2, emissive: 0xff8c3a, emissiveIntensity: 0 }),
    tiles: new THREE.MeshStandardMaterial({ name: 'hull-stern', color: 0x1e1f22, roughness: 0.82, metalness: 0.1, emissive: 0xff9a4a, emissiveIntensity: 0, vertexColors: true }),
    stencil: new THREE.MeshStandardMaterial({ name: 'hull-stencil', map: stencilAtlas(), transparent: true, roughness: 0.7, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  const group = new THREE.Group();
  group.name = 'wren-hull';
  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(merged!, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    group.add(mesh);
  };
  add(paint, mats.paint);
  add(structure, mats.structure);
  add(glass, mats.glass, false);
  add(bells, mats.bells);
  add(throats, mats.throats, false);
  add(tiles, mats.tiles);
  add(stencils, mats.stencil, false);

  // Nav lights: port red on +Z, starboard teal on -Z. Named so cinematics can find and drive them.
  const navLight = (name: string, color: number, z: number) => {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3, roughness: 0.4 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat);
    mesh.name = name;
    mesh.position.set(aftX + 0.3, top - 0.05, z);
    group.add(mesh);
    return mat;
  };
  const navPort = navLight('nav-light-port', 0xe0552f, deckW / 2 + 0.03);
  const navStarboard = navLight('nav-light-starboard', 0x4fd8f0, -deckW / 2 - 0.03);

  return {
    group,
    engineLocalPositions,
    parts: { windows: mats.glass, engines: mats.throats, stern: mats.tiles, navPort, navStarboard, paint: mats.paint },
  };
}
