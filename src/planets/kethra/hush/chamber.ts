import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyPbr } from '../../../core/TextureLibrary';
import { getPointSprite } from '../../../galaxy/spaceDressing';
import * as H from './sim';

/**
 * The Cistern Heart's chamber (MG3 Hush), built from the blocks in sim.ts: the same numbers the
 * moth's line of sight and the player's collision use, so what looks like cover is cover. Static
 * pieces are merged by material (stone, Kindling-cut stone, root, glyph band), so the whole room is
 * a handful of draw calls.
 */
export interface Chamber {
  group: THREE.Group;
  /** The walking surface: a floor target for the player. */
  floor: THREE.Mesh;
  colliders: THREE.Box3[];
  /** Materials the wake crosses when the Heart wakes (KethraScene adds them to the wave). */
  wake: { mat: THREE.MeshStandardMaterial; residual: THREE.Color; front: number }[];
  lightPost(i: number): void;
  flareCap(i: number): void;
  /** A breath runs along the floor channel from the stone to the Heart, in `color`. */
  pulse(color: THREE.Color): void;
  update(dt: number): void;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function place(x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1, pitch = 0, roll = 0): THREE.Matrix4 {
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ')), _s.set(sx, sy, sz));
}

/** A box whose UVs are in `tile`-metre units on every face, so a stone texture keeps its scale. */
function box(w: number, h: number, d: number, tile = 3): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  }
  return g;
}

/** Geometries gathered under one material and merged into a single mesh. */
class Batch {
  private geos: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    g.applyMatrix4(m);
    this.geos.push(g);
  }
  mesh(mat: THREE.Material, shadows = true): THREE.Mesh {
    const merged = mergeGeometries(this.geos, false)!;
    for (const g of this.geos) g.dispose();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** A root: a tube through the given points, thicker at its base. */
function root(points: THREE.Vector3[], radius: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, Math.max(6, points.length * 4), radius, 6, false);
  // Taper toward the tip: shrink each ring about the curve by how far along it is.
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const rings = g.parameters.tubularSegments + 1;
  const perRing = g.parameters.radialSegments + 1;
  const c = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let r = 0; r < rings; r++) {
    const t = r / (rings - 1);
    curve.getPointAt(t, c);
    const k = 1 - t * 0.65;
    for (let i = 0; i < perRing; i++) {
      const idx = r * perRing + i;
      p.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
      pos.setXYZ(idx, p.x, p.y, p.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Deterministic noise for the dressing, so every visit builds the same room. */
function hash(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** How far the chamber's walls and floor run down below its floor: into the pool around it. */
const FOUNDATION = 3.2;

export function buildChamber(): Chamber {
  const group = new THREE.Group();
  group.name = 'hush-chamber';
  const blocks = H.chamberBlocks();
  const F = H.FLOOR_Y;

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x55615c, roughness: 0.93 });
  applyPbr(stoneMat, 'lichen_rock', [1, 1]);
  // Kindling-cut stone: flat and untextured like the Heart's, so arches and the rim read as made.
  const cutMat = new THREE.MeshStandardMaterial({ color: 0x6f7d78, roughness: 0.88, flatShading: true });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x5a4c3c, roughness: 1 });
  applyPbr(barkMat, 'bark_willow', [1, 1]);
  // The glyph band: Kindling script cut around the walls and along the rim, faintly lit. It is what
  // the wake lights first.
  const glyphMat = new THREE.MeshStandardMaterial({ color: 0x1a2622, emissive: 0x3fd9a8, emissiveIntensity: 0.45, roughness: 0.6 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3e4743, roughness: 0.95 });
  applyPbr(floorMat, 'lichen_rock', [7, 7]);

  const stone = new Batch();
  const cut = new Batch();
  const bark = new Batch();
  const glyph = new Batch();

  // --- Floor ---
  // A deep drum, so the chamber stands on stone down into the grove's pool, and the door's threshold
  // shows as a plinth rather than a slab edge.
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(H.RADIUS + 0.3, H.RADIUS + 0.3, FOUNDATION, 72), floorMat);
  floor.position.set(H.CENTER.x, F - FOUNDATION / 2, H.CENTER.z);
  floor.receiveShadow = true;
  floor.name = 'hush-floor';
  group.add(floor);

  // --- The wall ring, the glyph band round it, and roots hanging over it ---
  for (const [i, k] of blocks.filter((b) => b.kind === 'wall').entries()) {
    const h = H.WALL_HEIGHT - 0.6 + hash(i) * 1.4;
    stone.add(box(k.hx * 2, h + FOUNDATION, k.hz * 2), place(k.x, F + (h - FOUNDATION) / 2, k.z, k.yaw));
    // A plinth course at the foot and a cornice, both proud of the inner face.
    const inX = -Math.cos(k.yaw);
    const inZ = Math.sin(k.yaw);
    cut.add(box(0.5, 0.55, k.hz * 2), place(k.x + inX * (k.hx + 0.1), F + 0.27, k.z + inZ * (k.hx + 0.1), k.yaw));
    cut.add(box(0.36, 0.3, k.hz * 2), place(k.x + inX * (k.hx + 0.08), F + h - 0.15, k.z + inZ * (k.hx + 0.08), k.yaw));
    glyph.add(box(0.06, 0.22, k.hz * 2 - 0.1), place(k.x + inX * (k.hx + 0.02), F + 2.35, k.z + inZ * (k.hx + 0.02), k.yaw));
    if (i % 3 === 1) {
      // A root over the wall top, down its inner face and out across the floor.
      const r = H.RADIUS;
      const a = Math.atan2(k.z - H.CENTER.z, k.x - H.CENTER.x) + (hash(i + 9) - 0.5) * 0.08;
      const at = (d: number, y: number) => v3(H.CENTER.x + Math.cos(a) * d, y, H.CENTER.z + Math.sin(a) * d);
      bark.add(root([at(r + 1.6, F + h + 0.4), at(r + 0.3, F + h + 0.2), at(r - 0.15, F + h * 0.55), at(r - 0.3, F + 1.2), at(r - 1.2 - hash(i) * 0.8, F + 0.05)], 0.16 + hash(i + 3) * 0.08), new THREE.Matrix4());
      // And down the outer face into the pool, as the grove sees it from the terraces.
      bark.add(root([at(r + 0.6, F + h + 0.35), at(r + 1.55, F + h * 0.7), at(r + 1.6, F + 0.8), at(r + 2.6 + hash(i + 5), F - 2.8)], 0.2 + hash(i + 7) * 0.1), new THREE.Matrix4());
    }
  }

  // --- The gate over the door: pillars, a pointed arch, and above it the high ledge ---
  const gateZ = H.GATE.z;
  const gw = H.GATE.halfWidth + 0.55;
  for (const side of [-1, 1]) {
    stone.add(box(1.1, 9.4 + FOUNDATION, 1.8), place(side * gw, F + (9.4 - FOUNDATION) / 2, gateZ));
    cut.add(box(1.4, 0.5, 2.0), place(side * gw, F + 0.25, gateZ));
    cut.add(box(1.3, 0.35, 2.0), place(side * gw, F + 7.4, gateZ));
  }
  // Voussoirs along two arcs meeting at a point: springing at +7.6, apex at +11.
  const springY = F + 7.6;
  const span = gw - 0.55;
  const radius = span * 1.6;
  for (const side of [-1, 1]) {
    const cx = -side * (radius - span);
    for (let i = 0; i < 7; i++) {
      const t0 = (i / 7) * Math.acos((radius - span) / radius);
      const t1 = ((i + 1) / 7) * Math.acos((radius - span) / radius);
      const tm = (t0 + t1) / 2;
      const x = cx + side * Math.cos(tm) * radius;
      const y = springY + Math.sin(tm) * radius;
      const len = (t1 - t0) * radius;
      // Each stone lies along the arc: its length turned to the curve's tangent.
      cut.add(box(len + 0.04, 0.7, 1.9), place(x, y, gateZ, 0, 1, 1, 1, 0, side * tm + Math.PI / 2));
    }
  }
  // The tower above the arch, and the root shelf on its inner face where the moth watches from.
  stone.add(box(gw * 2 + 1.1, 5.4, 1.8), place(0, F + 12.2 + 0.3, gateZ));
  cut.add(box(gw * 2 + 1.3, 0.4, 2.0), place(0, F + 15.1, gateZ));
  const ledge = H.PERCHES.ledge.at;
  bark.add(box(2.6, 0.45, 1.6, 1.5), place(ledge.x, ledge.y - 0.5, (ledge.z + gateZ) / 2 - 0.2));
  for (const side of [-1, 1]) {
    bark.add(root([v3(side * 1.2, ledge.y - 0.4, ledge.z - 0.4), v3(side * 2.2, ledge.y - 2.2, gateZ - 1.2), v3(side * (gw - 0.2), F + 8.2, gateZ - 1.0), v3(side * (gw + 0.1), F + 4, gateZ - 1.1)], 0.2), new THREE.Matrix4());
  }

  // --- The far arch, low on the south-west wall, where the moth first watches from ---
  const arch = H.PERCHES.arch.at;
  const archA = Math.atan2(arch.z - H.CENTER.z, arch.x - H.CENTER.x);
  const tx = -Math.sin(archA);
  const tz = Math.cos(archA);
  const archYaw = -archA;
  const pillarH = arch.y - F - 1.9;
  for (const side of [-1, 1]) {
    cut.add(box(0.7, pillarH, 0.7), place(arch.x + tx * side * 1.5, F + pillarH / 2, arch.z + tz * side * 1.5, archYaw));
  }
  // The arch lies in the wall's plane (the block's local y-z); each stone is pitched to the curve.
  for (let i = 0; i < 9; i++) {
    const t = ((i + 0.5) / 9) * Math.PI;
    const along = Math.cos(t) * 1.5;
    const y = F + pillarH + Math.sin(t) * 1.5;
    cut.add(box(0.72, 0.55, 0.56), place(arch.x + tx * along, y, arch.z + tz * along, archYaw, 1, 1, 1, -(t + Math.PI / 2), 0));
  }

  // --- The basin rim: Kindling masonry with a capstone and a lit glyph line along the top ---
  for (const k of blocks.filter((b) => b.kind === 'rim')) {
    cut.add(box(k.hx * 2, H.RIM_HEIGHT - 0.12, k.hz * 2 - 0.06, 1.5), place(k.x, F + (H.RIM_HEIGHT - 0.12) / 2, k.z, k.yaw));
    cut.add(box(k.hx * 2 + 0.16, 0.14, k.hz * 2, 1.5), place(k.x, F + H.RIM_HEIGHT - 0.07, k.z, k.yaw));
    glyph.add(box(0.1, 0.02, k.hz * 2 - 0.2), place(k.x, F + H.RIM_HEIGHT + 0.005, k.z, k.yaw));
  }

  // --- The root tunnels: a woven roof on root arches, walled in ---
  for (const k of blocks.filter((b) => b.kind === 'roof')) {
    bark.add(box(k.hx * 2, k.y1 - k.y0, k.hz * 2, 1.5), place(k.x, (k.y0 + k.y1) / 2, k.z, k.yaw));
    const n = Math.round((k.hz * 2) / 1.1);
    for (let i = 0; i <= n; i++) {
      const z = k.z - k.hz + (i / n) * k.hz * 2;
      const big = i === 0 || i === n;
      const arc = new THREE.TorusGeometry(1.22, big ? 0.24 : 0.15, 6, 12, Math.PI);
      bark.add(arc, place(k.x, F + 0.72, z, 0, 1, 1, 1, 0, 0));
    }
  }
  for (const k of blocks.filter((b) => b.kind === 'tunnel')) {
    bark.add(box(k.hx * 2, k.y1 - k.y0, k.hz * 2, 1.5), place(k.x, (k.y0 + k.y1) / 2, k.z, k.yaw));
  }

  // --- Root mounds: low humps with a root or two arching over ---
  for (const [i, k] of blocks.filter((b) => b.kind === 'mound').entries()) {
    const hump = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    bark.add(hump, place(k.x, F, k.z, k.yaw, k.hx * 1.02, H.MOUND_HEIGHT, k.hz * 1.08));
    const c = Math.cos(k.yaw);
    const s = Math.sin(k.yaw);
    const w = (lx: number, y: number, lz: number) => v3(k.x + lx * c + lz * s, y, k.z - lx * s + lz * c);
    bark.add(root([w(-k.hx - 0.5, F, -0.1), w(-k.hx * 0.4, F + H.MOUND_HEIGHT + 0.05, 0.05), w(k.hx * 0.5, F + H.MOUND_HEIGHT - 0.05, -0.05), w(k.hx + 0.6 + hash(i), F, 0.2)], 0.13), new THREE.Matrix4());
  }

  // --- The lantern posts ---
  const glassGeo = new THREE.OctahedronGeometry(0.1, 0);
  glassGeo.scale(1, 1.5, 1);
  const glass = new THREE.InstancedMesh(glassGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), H.POSTS.length);
  const unlit = new THREE.Color(0xffb45a).multiplyScalar(0.07);
  const lit = new THREE.Color(0xffb45a).multiplyScalar(2.6);
  H.POSTS.forEach((post, i) => {
    const { x, z } = post.lamp;
    cut.add(new THREE.CylinderGeometry(0.22, 0.3, 0.3, 8), place(x, F + 0.15, z));
    bark.add(new THREE.CylinderGeometry(0.06, 0.08, 1.9, 6), place(x, F + 1.2, z));
    bark.add(box(0.06, 0.06, 0.5, 1), place(x, F + 2.1, z + 0.2));
    cut.add(new THREE.CylinderGeometry(0.1, 0.06, 0.06, 6), place(x, F + 1.92, z + 0.4));
    glass.setMatrixAt(i, place(x, F + 1.76, z + 0.4));
    glass.setColorAt(i, unlit);
  });
  glass.instanceMatrix.needsUpdate = true;
  group.add(glass);
  const postHalos = pointsAt(H.POSTS.map((p) => v3(p.lamp.x, F + 1.76, p.lamp.z + 0.4)), 0xffc27a, 1.6);
  group.add(postHalos.points);

  // --- Glowcaps: three to a cluster, dim until brushed ---
  const capGeo = new THREE.SphereGeometry(0.12, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  capGeo.scale(1, 0.55, 1);
  const stemGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.18, 5);
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), H.GLOWCAPS.length * 3);
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0xa8c8b8, roughness: 0.8 }), H.GLOWCAPS.length * 3);
  const capBase = new THREE.Color(0x4fd9c8);
  const capColour = new THREE.Color();
  const capFlare = H.GLOWCAPS.map(() => 0);
  H.GLOWCAPS.forEach((g, i) => {
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * Math.PI * 2 + i;
      const r = j === 0 ? 0 : 0.16;
      const s = j === 0 ? 1.25 : 0.8 + hash(i * 3 + j) * 0.3;
      const x = g.x + Math.cos(a) * r;
      const z = g.z + Math.sin(a) * r;
      stems.setMatrixAt(i * 3 + j, place(x, F + 0.09 * s, z, 0, s, s, s));
      caps.setMatrixAt(i * 3 + j, place(x, F + 0.17 * s, z, 0, s, s, s));
      caps.setColorAt(i * 3 + j, capColour.copy(capBase).multiplyScalar(0.35));
    }
  });
  group.add(caps, stems);
  const capHalos = pointsAt(H.GLOWCAPS.map((g) => v3(g.x, F + 0.25, g.z)), 0x4fd9c8, 1.2);
  group.add(capHalos.points);

  // --- The breath channel: a groove from the stone to the basin that a breath runs along ---
  const chanFrom = v3(H.STONE.x, F + 0.012, H.STONE.z - 0.3);
  const chanTo = v3(H.HEART.x, F + 0.012, H.HEART.z - 2.35);
  const chanLen = chanFrom.distanceTo(chanTo);
  const chanUniforms = { uPulse: { value: -1 }, uColor: { value: new THREE.Color(0x5fb4ff) } };
  const channel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, chanLen),
    new THREE.ShaderMaterial({
      uniforms: chanUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uPulse; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          float d = vUv.y - uPulse;
          float head = exp(-d * d / 0.004);
          float tail = uPulse >= 0.0 ? smoothstep(uPulse - 0.35, uPulse, vUv.y) * step(vUv.y, uPulse) * 0.35 : 0.0;
          float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
          gl_FragColor = vec4(uColor * (0.06 + (head * 3.0 + tail) * step(0.0, uPulse)) * edge, 1.0);
        }`,
    }),
  );
  channel.rotation.x = -Math.PI / 2;
  // PlaneGeometry's v runs from -y to +y; after the turn that is +z to -z, so point it stone-first.
  channel.rotation.z = Math.PI;
  channel.position.copy(chanFrom).add(chanTo).multiplyScalar(0.5);
  group.add(channel);

  group.add(stone.mesh(stoneMat), cut.mesh(cutMat), bark.mesh(barkMat), glyph.mesh(glyphMat, false));

  // --- Collision: the sim's blocks, plus the solid parts the moth can see over but you cannot pass ---
  const colliders: THREE.Box3[] = [];
  const toBox3 = (b: { min: H.Vec; max: H.Vec }) => new THREE.Box3(v3(b.min.x, b.min.y, b.min.z), v3(b.max.x, b.max.y, b.max.z));
  for (const k of blocks) {
    // The basin's sight block is its low lip; for walking it is the old full-height box, so no one
    // steps up into the water.
    const solid = k.kind === 'basin' ? { ...k, y1: F + 2.2 } : k;
    for (const b of H.blockToBoxes(solid)) colliders.push(toBox3(b));
  }
  for (const side of [-1, 1]) colliders.push(new THREE.Box3(v3(side * gw - 0.7, F, gateZ - 1), v3(side * gw + 0.7, F + 9.4, gateZ + 1)));
  for (const post of H.POSTS) colliders.push(new THREE.Box3(v3(post.lamp.x - 0.3, F, post.lamp.z - 0.3), v3(post.lamp.x + 0.3, F + 2, post.lamp.z + 0.3)));

  let pulse = -1;
  const postLit = H.POSTS.map(() => false);
  return {
    group,
    floor,
    colliders,
    wake: [
      { mat: glyphMat, residual: new THREE.Color(0x3fd9a8).multiplyScalar(0.9), front: 2.4 },
      { mat: floorMat, residual: new THREE.Color(0x3fd9a8).multiplyScalar(0.012), front: 0.5 },
      { mat: cutMat, residual: new THREE.Color(0x3fd9a8).multiplyScalar(0.02), front: 0.6 },
    ],
    lightPost(i) {
      if (postLit[i]) return;
      postLit[i] = true;
      glass.setColorAt(i, lit);
      glass.instanceColor!.needsUpdate = true;
      postHalos.set(i, 1);
    },
    flareCap(i) {
      capFlare[i] = 1;
    },
    pulse(color) {
      chanUniforms.uColor.value.copy(color);
      pulse = 0;
    },
    update(dt) {
      if (pulse >= 0) {
        pulse += dt / 0.7;
        if (pulse > 1.4) pulse = -1;
      }
      chanUniforms.uPulse.value = pulse;
      let dirty = false;
      capFlare.forEach((f, i) => {
        if (f <= 0) return;
        const next = Math.max(0, f - dt / 1.6);
        capFlare[i] = next;
        for (let j = 0; j < 3; j++) caps.setColorAt(i * 3 + j, capColour.copy(capBase).multiplyScalar(0.35 + next * 3.5));
        capHalos.set(i, next);
        dirty = true;
      });
      if (dirty) caps.instanceColor!.needsUpdate = true;
    },
  };
}

/** Soft halos (additive point sprites) whose size each light sets from 0 to 1. */
function pointsAt(at: THREE.Vector3[], color: number, size: number): { points: THREE.Points; set(i: number, k: number): void } {
  const geo = new THREE.BufferGeometry().setFromPoints(at);
  const amount = new Float32Array(at.length);
  geo.setAttribute('aAmount', new THREE.BufferAttribute(amount, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: getPointSprite() }, uColor: { value: new THREE.Color(color) }, uSize: { value: size } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aAmount; uniform float uSize; varying float vAmount;
      void main() {
        vAmount = aAmount;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.3 + aAmount) * 300.0 / -mv.z;
      }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; varying float vAmount;
      void main() { gl_FragColor = vec4(uColor * texture2D(uMap, gl_PointCoord).a * (0.12 + vAmount * 0.9), 1.0); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    set(i, k) {
      amount[i] = k;
      (geo.getAttribute('aAmount') as THREE.BufferAttribute).needsUpdate = true;
    },
  };
}
