import * as THREE from 'three';
import * as H from './sim';

/** Where a ray from inside the chamber leaves the wall ring, as a fraction of `range`. */
function ringExit(o: H.Vec, dx: number, dz: number, range: number): number {
  const R = H.RADIUS + 0.7;
  const px = o.x - H.CENTER.x;
  const pz = o.z - H.CENTER.z;
  const a = (dx * dx + dz * dz) * range * range;
  if (a < 1e-9) return Infinity;
  const b = 2 * (px * dx + pz * dz) * range;
  const c = px * px + pz * pz - R * R;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  return (-b + Math.sqrt(disc)) / (2 * a);
}

const RINGS = 6;
const AROUND = 22;
const RAYS = 1 + RINGS * AROUND;

/**
 * Draws the moth's gaze cone. Each frame a fan of rays is cast against the chamber blocks (the same
 * test as sim.ts `sees`); the shaft is the cone hull cut where rays stop, and the pool is where
 * they land. Cover shadows the gaze on every quality tier without a shadow map.
 */
export class GazeView {
  readonly group = new THREE.Group();
  private readonly shaft: THREE.Mesh;
  private readonly pool: THREE.Mesh;
  private readonly ends = new Float32Array(RAYS * 3);
  private readonly shaftPos: THREE.BufferAttribute;
  private readonly shaftAlong: THREE.BufferAttribute;
  private readonly shaftOut: THREE.BufferAttribute;
  private readonly poolPos: THREE.BufferAttribute;
  private readonly poolLand: THREE.BufferAttribute;
  private readonly uniforms = { uColor: { value: new THREE.Color() }, uStrength: { value: 1 } };
  private readonly poolUniforms = { uColor: { value: new THREE.Color() }, uStrength: { value: 1 } };
  private readonly blocks: H.Block[];
  private readonly near: H.Block[] = [];

  constructor(blocks: H.Block[]) {
    this.blocks = blocks;
    // The shaft: one triangle from the eye to each pair of neighbouring rim rays.
    const shaftGeo = new THREE.BufferGeometry();
    this.shaftPos = new THREE.BufferAttribute(new Float32Array(AROUND * 3 * 3), 3);
    this.shaftAlong = new THREE.BufferAttribute(new Float32Array(AROUND * 3), 1);
    // Each vertex's outward direction across the cone: the hull glows where it is seen edge-on,
    // so a cone of flat triangles reads as a volumetric shaft.
    this.shaftOut = new THREE.BufferAttribute(new Float32Array(AROUND * 3 * 3), 3);
    shaftGeo.setAttribute('position', this.shaftPos);
    shaftGeo.setAttribute('aAlong', this.shaftAlong);
    shaftGeo.setAttribute('aOut', this.shaftOut);
    for (let i = 0; i < AROUND; i++) this.shaftAlong.setX(i * 3, 0);
    this.shaft = new THREE.Mesh(
      shaftGeo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `attribute float aAlong; attribute vec3 aOut; varying float vAlong; varying vec3 vOut; varying vec3 vView;
          void main() {
            vAlong = aAlong;
            vOut = aOut;
            vView = cameraPosition - position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vAlong; varying vec3 vOut; varying vec3 vView;
          void main() {
            float edge = 1.0 - abs(dot(normalize(vOut), normalize(vView)));
            float a = pow(max(0.0, 1.0 - vAlong), 1.3) * smoothstep(0.0, 0.08, vAlong) * (0.15 + 0.85 * edge * edge);
            gl_FragColor = vec4(uColor * a * 0.2 * uStrength, 1.0);
          }`,
      }),
    );
    // The pool: the rays' landing points as rings of a disc.
    const poolGeo = new THREE.BufferGeometry();
    this.poolPos = new THREE.BufferAttribute(new Float32Array(RAYS * 3), 3);
    this.poolLand = new THREE.BufferAttribute(new Float32Array(RAYS), 1);
    poolGeo.setAttribute('position', this.poolPos);
    poolGeo.setAttribute('aLand', this.poolLand);
    const index: number[] = [];
    const id = (ring: number, k: number) => (ring === 0 ? 0 : 1 + (ring - 1) * AROUND + (k % AROUND));
    for (let ring = 0; ring < RINGS; ring++) {
      for (let k = 0; k < AROUND; k++) {
        if (ring === 0) index.push(0, id(1, k), id(1, k + 1));
        else index.push(id(ring, k), id(ring + 1, k), id(ring + 1, k + 1), id(ring, k), id(ring + 1, k + 1), id(ring, k + 1));
      }
    }
    poolGeo.setIndex(index);
    this.pool = new THREE.Mesh(
      poolGeo,
      new THREE.ShaderMaterial({
        uniforms: this.poolUniforms,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        blending: THREE.AdditiveBlending,
        vertexShader: 'attribute float aLand; varying float vLand; void main() { vLand = aLand; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vLand;
          void main() { gl_FragColor = vec4(uColor * vLand * 0.7 * uStrength, 1.0); }`,
      }),
    );
    for (const m of [this.shaft, this.pool]) {
      m.frustumCulled = false;
      m.renderOrder = 6;
      this.group.add(m);
    }
  }

  /** Recasts the rays for `g` and redraws. `strength` scales both (0 hides it). */
  update(g: H.Gaze, color: THREE.Color, strength: number): void {
    this.group.visible = strength > 0.001;
    if (!this.group.visible) return;
    this.uniforms.uColor.value.copy(color);
    this.uniforms.uStrength.value = strength;
    this.poolUniforms.uColor.value.copy(color);
    this.poolUniforms.uStrength.value = strength;

    // Only blocks the cone could reach are worth testing.
    const o = g.origin;
    this.near.length = 0;
    for (const k of this.blocks) {
      const r = Math.hypot(k.hx, k.hz) + Math.max(Math.abs(k.y1 - o.y), Math.abs(k.y0 - o.y));
      const dx = k.x - o.x;
      const dz = k.z - o.z;
      if (Math.hypot(dx, dz) > g.range + r) continue;
      if (dx * g.dir.x + dz * g.dir.z < -r) continue;
      this.near.push(k);
    }

    // An orthonormal frame about the gaze.
    const d = g.dir;
    const upX = Math.abs(d.y) > 0.95 ? 1 : 0;
    const upY = 1 - upX;
    let ux = upY * d.z;
    let uy = -upX * d.z;
    let uz = upX * d.y - upY * d.x;
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const wx = d.y * uz - d.z * uy;
    const wy = d.z * ux - d.x * uz;
    const wz = d.x * uy - d.y * ux;

    const end = { x: 0, y: 0, z: 0 };
    const rim = 1 + (RINGS - 1) * AROUND;
    for (let i = 0; i < RAYS; i++) {
      const ring = i === 0 ? 0 : 1 + Math.floor((i - 1) / AROUND);
      const k = i === 0 ? 0 : (i - 1) % AROUND;
      const spread = Math.tan((g.halfAngle * ring) / RINGS);
      const phi = (k / AROUND) * Math.PI * 2;
      if (i >= rim) {
        const ox = Math.cos(phi) * ux + Math.sin(phi) * wx;
        const oy = Math.cos(phi) * uy + Math.sin(phi) * wy;
        const oz = Math.cos(phi) * uz + Math.sin(phi) * wz;
        // The eye's vertex and this ray's end share its outward direction, in both triangles it is in.
        const j = i - rim;
        const prev = (j + AROUND - 1) % AROUND;
        for (const v of [j * 3, j * 3 + 1, prev * 3 + 2]) this.shaftOut.setXYZ(v, ox, oy, oz);
      }
      let rx = d.x + spread * (Math.cos(phi) * ux + Math.sin(phi) * wx);
      let ry = d.y + spread * (Math.cos(phi) * uy + Math.sin(phi) * wy);
      let rz = d.z + spread * (Math.cos(phi) * uz + Math.sin(phi) * wz);
      const rl = Math.hypot(rx, ry, rz);
      rx /= rl;
      ry /= rl;
      rz /= rl;
      end.x = o.x + rx * g.range;
      end.y = o.y + ry * g.range;
      end.z = o.z + rz * g.range;
      let t = 1;
      let land = 0;
      if (ry < 0) {
        const tf = (H.FLOOR_Y + 0.02 - o.y) / (ry * g.range);
        if (tf < t) {
          t = tf;
          land = 1;
        }
      }
      for (const blk of this.near) {
        const tb = H.segmentBlockT(o, end, blk);
        if (tb < t) {
          t = tb;
          land = 0.55;
        }
      }
      // Rays that clear the wall top stop at the wall ring instead of running out into the sky.
      const tr = ringExit(o, rx, rz, g.range);
      if (tr < t) {
        t = tr;
        land = 0;
      }
      // Light thins with distance, as in `sees`.
      land *= 1 / (1 + (t * g.range) / 9);
      this.ends[i * 3] = o.x + rx * g.range * t;
      this.ends[i * 3 + 1] = o.y + ry * g.range * t;
      this.ends[i * 3 + 2] = o.z + rz * g.range * t;
      this.poolPos.setXYZ(i, this.ends[i * 3], this.ends[i * 3 + 1], this.ends[i * 3 + 2]);
      this.poolLand.setX(i, land);
    }
    this.poolPos.needsUpdate = true;
    this.poolLand.needsUpdate = true;

    // The hull, from the outermost ring.
    for (let k = 0; k < AROUND; k++) {
      const a = rim + k;
      const b = rim + ((k + 1) % AROUND);
      this.shaftPos.setXYZ(k * 3, o.x, o.y, o.z);
      this.shaftPos.setXYZ(k * 3 + 1, this.ends[a * 3], this.ends[a * 3 + 1], this.ends[a * 3 + 2]);
      this.shaftPos.setXYZ(k * 3 + 2, this.ends[b * 3], this.ends[b * 3 + 1], this.ends[b * 3 + 2]);
      this.shaftAlong.setX(k * 3 + 1, Math.hypot(this.ends[a * 3] - o.x, this.ends[a * 3 + 1] - o.y, this.ends[a * 3 + 2] - o.z) / g.range);
      this.shaftAlong.setX(k * 3 + 2, Math.hypot(this.ends[b * 3] - o.x, this.ends[b * 3 + 1] - o.y, this.ends[b * 3 + 2] - o.z) / g.range);
    }
    this.shaftPos.needsUpdate = true;
    this.shaftAlong.needsUpdate = true;
    this.shaftOut.needsUpdate = true;
  }

  dispose(): void {
    for (const m of [this.shaft, this.pool]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
