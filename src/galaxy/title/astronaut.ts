import * as THREE from 'three';

/**
 * The astronaut on the ledge: a surveyor in an EVA suit, sitting on a rock in the belt and looking out
 * toward Isilthe. Built in code like the rest of the title (no model in the project fits, and none is
 * downloaded): soft suit sections are tubes along the bones with elliptical sections and accordion
 * folds at the joints; armour is plates laid on those tubes with a bevelled rim; hard parts (boots,
 * gloves, backpack, knee caps) are superellipsoids; the helmet is a shell, a lime trim and a gold visor.
 *
 * Units are metres in the figure's own frame: +Y up, the figure faces +Z, its left hand is on +X, and
 * the rock it sits on is the plane y = 0 (the feet rest on a step 0.12-0.16 lower, see formations.ts).
 *
 * One draw. Every vertex carries its colour, roughness, metalness, kind (fabric, hard, visor, lamp),
 * an edge flag (worn paint along plate rims), a baked ambient occlusion and a bone. Six rigid bones move
 * it: the torso breathes (a 2.5 mm rise and a third of a degree), the shoulders follow it half way so
 * the arms stay on the knees, the head looks about slowly, the hanging hands sway a little, and a lamp
 * on the chest pulses. Occlusion is analytic: every vertex against capsules standing in for the other
 * parts, and the rock below.
 *
 * Light, matched to the rocks around it: a cool key from the right and in front (the ring arc's light),
 * a cyan rim from the planet's side, a dim blue fill, a warm bounce off the rock. Reflections, the
 * visor's above all, read an analytic sky: dark space, the planet's disc and its bright rim, the ring
 * band.
 */

const Kind = { Fabric: 0, Hard: 1, Visor: 2, Lamp: 3 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

const Bone = { Root: 0, Torso: 1, Head: 2, Shoulders: 3, HandL: 4, HandR: 5 } as const;
type Bone = (typeof Bone)[keyof typeof Bone];

interface Finish {
  color: THREE.ColorRepresentation;
  rough: number;
  metal?: number;
  kind?: Kind;
  bone: Bone;
  /** Which AO stand-in this part is (it does not occlude itself). */
  proxy?: number;
}

// Palette, after the reference: navy-teal suit fabric, warm yellow armour, pale grey plates, gunmetal rings.
const FABRIC = 0xb4bbbf;
const NAVY = 0x2f4b59;
const YELLOW = 0xdcc425;
const LIME = 0xa9c935;
const PLATE = 0xb8bcbc;
const GUNMETAL = 0x3a4248;
const BLACK = 0x0d1013;
const BOOT = 0x8c9294;

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Collects every part into one set of arrays. */
class Builder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  mat: number[] = [];
  bone: number[] = [];
  proxy: number[] = [];
  index: number[] = [];
  private c = new THREE.Color();

  /**
   * A grid of nu x nv points from f(u, v) (u, v in 0..1), wrapped in v when `wrap`; smooth normals
   * within the part. `edge(u, v)` marks worn rims.
   */
  grid(nu: number, nv: number, f: (u: number, v: number) => THREE.Vector3, wrap: boolean, finish: Finish, edge?: (i: number, j: number) => number): void {
    const cols = wrap ? nv : nv + 1;
    const pos: number[] = [];
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j < cols; j++) {
        const p = f(i / nu, j / nv);
        pos.push(p.x, p.y, p.z);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = i * cols + j;
        const b = i * cols + ((j + 1) % cols);
        const c = (i + 1) * cols + j;
        const d = (i + 1) * cols + ((j + 1) % cols);
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.getAttribute('normal');
    // Every part's normals point out of it: a grid laid the other way round is turned over.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const count = pos.length / 3;
    for (let k = 0; k < count; k++) {
      cx += pos[k * 3] / count;
      cy += pos[k * 3 + 1] / count;
      cz += pos[k * 3 + 2] / count;
    }
    let out = 0;
    for (let k = 0; k < count; k++) out += (pos[k * 3] - cx) * n.getX(k) + (pos[k * 3 + 1] - cy) * n.getY(k) + (pos[k * 3 + 2] - cz) * n.getZ(k);
    if (out < 0) {
      for (let k = 0; k < count; k++) n.setXYZ(k, -n.getX(k), -n.getY(k), -n.getZ(k));
      for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    }
    const base = this.pos.length / 3;
    this.c.set(finish.color).convertSRGBToLinear();
    for (let k = 0; k < pos.length / 3; k++) {
      this.pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
      this.nor.push(n.getX(k), n.getY(k), n.getZ(k));
      this.col.push(this.c.r, this.c.g, this.c.b);
      const e = edge ? edge(Math.floor(k / cols), k % cols) : 0;
      this.mat.push(finish.rough, finish.metal ?? 0, finish.kind ?? Kind.Hard, e);
      this.bone.push(finish.bone);
      this.proxy.push(finish.proxy ?? -1);
    }
    for (const i of idx) this.index.push(base + i);
    g.dispose();
  }

  /**
   * A tube along a curve with elliptical sections (rx along `side`, ry across it), radius scaled by
   * `shape(t)`, rounded caps. Returns a sampler for laying plates on it.
   */
  tube(o: { path: THREE.Vector3[]; rx: number | ((t: number) => number); ry?: number | ((t: number) => number); side: THREE.Vector3; seg?: number; steps?: number; caps?: [boolean, boolean]; finish: Finish }): TubeFrame {
    const frame = new TubeFrame(o.path, o.side, o.rx, o.ry ?? o.rx);
    const seg = o.seg ?? 24;
    const steps = o.steps ?? 16;
    const capRings = 5;
    const [c0, c1] = o.caps ?? [true, true];
    const rows = (c0 ? capRings : 0) + steps + 1 + (c1 ? capRings : 0);
    const p = new THREE.Vector3();
    this.grid(
      rows - 1,
      seg,
      (u, v) => {
        const row = Math.round(u * (rows - 1));
        const a = v * Math.PI * 2;
        if (c0 && row < capRings) {
          const phi = (Math.PI / 2) * (1 - row / capRings);
          return frame.at(0, a, 0, p, Math.cos(phi), -Math.sin(phi));
        }
        const r2 = row - (c0 ? capRings : 0);
        if (r2 <= steps) return frame.at(r2 / steps, a, 0, p);
        const phi = (Math.PI / 2) * ((r2 - steps) / capRings);
        return frame.at(1, a, 0, p, Math.cos(phi), Math.sin(phi));
      },
      true,
      o.finish,
    );
    return frame;
  }

  /**
   * A plate on a tube: t in [t0, t1] along it, angle in [a0, a1] round it (0 = `side`), standing
   * `lift` off the surface and `thick` thick, its rim bevelled down to the surface (and marked worn).
   */
  plate(frame: TubeFrame, t0: number, t1: number, a0: number, a1: number, finish: Finish, lift = 0.006, thick = 0.008, nu = 10, nv = 12): void {
    const e = 0.07;
    const ramp = (s: number) => (s <= 0 ? 0 : s >= 1 ? 1 : s < e ? s / e : s > 1 - e ? (1 - s) / e : 1);
    const p = new THREE.Vector3();
    // Rows and columns: the rim, a step in, then evenly across.
    const sample = (k: number, n: number) => (k === 0 ? 0 : k === n ? 1 : k === 1 ? e : k === n - 1 ? 1 - e : e + ((1 - 2 * e) * (k - 1)) / (n - 2));
    this.grid(
      nu,
      nv,
      (u, v) => {
        const su = sample(Math.round(u * nu), nu);
        const sv = sample(Math.round(v * nv), nv);
        const h = lift + thick * Math.min(ramp(su), ramp(sv));
        return frame.at(t0 + (t1 - t0) * su, a0 + (a1 - a0) * sv, h, p);
      },
      false,
      finish,
      (i, j) => (i <= 1 || i >= nu - 1 || j <= 1 || j >= nv - 1 ? 1 : 0),
    );
  }

  /** A superellipsoid (e < 1 squarer, 1 an ellipsoid), centred, turned by `q`. */
  blob(center: THREE.Vector3, half: THREE.Vector3, e: number, q: THREE.Quaternion, finish: Finish, nu = 14, nv = 20): void {
    const sp = (x: number, k: number) => Math.sign(x) * Math.pow(Math.abs(x), k);
    const p = new THREE.Vector3();
    this.grid(
      nu,
      nv,
      (u, v) => {
        const lat = -Math.PI / 2 + u * Math.PI;
        const lon = v * Math.PI * 2;
        const cu = sp(Math.cos(lat), e);
        p.set(half.x * cu * sp(Math.cos(lon), e), half.y * sp(Math.sin(lat), e), half.z * cu * sp(Math.sin(lon), e));
        return p.applyQuaternion(q).add(center);
      },
      true,
      finish,
    );
  }

  /** A patch of a sphere: yaw in [y0, y1], pitch in [p0, p1] (radians, 0 = +Z), bevelled like a plate. */
  spherePatch(center: THREE.Vector3, r: number, q: THREE.Quaternion, y0: number, y1: number, p0: number, p1: number, finish: Finish, lift: number, thick: number, nu = 14, nv = 22): void {
    const e = 0.06;
    const ramp = (s: number) => (s < e ? s / e : s > 1 - e ? (1 - s) / e : 1);
    const p = new THREE.Vector3();
    const sample = (k: number, n: number) => (k === 0 ? 0 : k === n ? 1 : k === 1 ? e : k === n - 1 ? 1 - e : e + ((1 - 2 * e) * (k - 1)) / (n - 2));
    this.grid(
      nu,
      nv,
      (u, v) => {
        const su = sample(Math.round(u * nu), nu);
        const sv = sample(Math.round(v * nv), nv);
        const pitch = p0 + (p1 - p0) * su;
        const yaw = y0 + (y1 - y0) * sv;
        const rr = r + lift + thick * Math.min(ramp(su), ramp(sv));
        p.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(rr);
        return p.applyQuaternion(q).add(center);
      },
      false,
      finish,
      (i, j) => (i <= 1 || i >= nu - 1 || j <= 1 || j >= nv - 1 ? 1 : 0),
    );
  }

  /** A torus round `axis`. */
  ring(center: THREE.Vector3, axis: THREE.Vector3, R: number, r: number, finish: Finish, nu = 32, nv = 10): void {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
    const p = new THREE.Vector3();
    this.grid(
      nu,
      nv,
      (u, v) => {
        const a = u * Math.PI * 2;
        const b = v * Math.PI * 2;
        p.set((R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a));
        return p.applyQuaternion(q).add(center);
      },
      true,
      finish,
    );
  }
}

/** A smooth path with parallel-transported frames; points on its surface by (t, angle, lift). */
class TubeFrame {
  private curve: THREE.CatmullRomCurve3;
  private rx: (t: number) => number;
  private ry: (t: number) => number;
  private samples: { p: THREE.Vector3; t: THREE.Vector3; u: THREE.Vector3; w: THREE.Vector3 }[] = [];
  private static N = 48;

  constructor(path: THREE.Vector3[], side: THREE.Vector3, rx: number | ((t: number) => number), ry: number | ((t: number) => number)) {
    this.curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
    this.rx = typeof rx === 'number' ? () => rx : rx;
    this.ry = typeof ry === 'number' ? () => ry : ry;
    let u = side.clone();
    for (let i = 0; i <= TubeFrame.N; i++) {
      const t = i / TubeFrame.N;
      const tan = this.curve.getTangentAt(t).normalize();
      // Transport: keep `u` square to the tangent, turning as little as possible.
      u = u.sub(tan.clone().multiplyScalar(u.dot(tan))).normalize();
      const w = new THREE.Vector3().crossVectors(tan, u);
      this.samples.push({ p: this.curve.getPointAt(t), t: tan, u: u.clone(), w });
    }
  }

  /** The surface point at (t, angle) lifted by `lift`; `scale` and `along` shape the caps. */
  at(t: number, angle: number, lift: number, out: THREE.Vector3, scale = 1, along = 0): THREE.Vector3 {
    const f = t * TubeFrame.N;
    const i = Math.min(Math.floor(f), TubeFrame.N - 1);
    const k = f - i;
    const a = this.samples[i];
    const b = this.samples[i + 1];
    const rx = this.rx(t);
    const ry = this.ry(t);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const ux = a.u.x + (b.u.x - a.u.x) * k;
    const uy = a.u.y + (b.u.y - a.u.y) * k;
    const uz = a.u.z + (b.u.z - a.u.z) * k;
    const wx = a.w.x + (b.w.x - a.w.x) * k;
    const wy = a.w.y + (b.w.y - a.w.y) * k;
    const wz = a.w.z + (b.w.z - a.w.z) * k;
    const ex = (rx + lift) * c * scale;
    const ey = (ry + lift) * s * scale;
    const cap = along * Math.max(rx, ry);
    const tx = a.t.x + (b.t.x - a.t.x) * k;
    const ty = a.t.y + (b.t.y - a.t.y) * k;
    const tz = a.t.z + (b.t.z - a.t.z) * k;
    return out.set(
      a.p.x + (b.p.x - a.p.x) * k + ux * ex + wx * ey + tx * cap,
      a.p.y + (b.p.y - a.p.y) * k + uy * ex + wy * ey + ty * cap,
      a.p.z + (b.p.z - a.p.z) * k + uz * ex + wz * ey + tz * cap,
    );
  }

  point(t: number): THREE.Vector3 {
    return this.curve.getPointAt(t);
  }
}

/** Accordion folds over [t0, t1] of a limb: k folds, `depth` of the radius. */
function bellows(t: number, t0: number, t1: number, k: number, depth: number): number {
  if (t < t0 || t > t1) return 1;
  const s = (t - t0) / (t1 - t0);
  return 1 + depth * (0.5 - 0.5 * Math.cos(s * Math.PI * 2 * k)) * Math.sin(s * Math.PI);
}

/** Capsule stand-ins for occlusion, and the AO they give a vertex (Quilez's sphere occlusion, nearest point on each segment). */
interface Proxy {
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
}

function bakeOcclusion(b: Builder, proxies: Proxy[], seatY: number): Float32Array {
  const n = b.pos.length / 3;
  const ao = new Float32Array(n);
  const p = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.set(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]);
    nn.set(b.nor[i * 3], b.nor[i * 3 + 1], b.nor[i * 3 + 2]);
    let occ = 0;
    for (let k = 0; k < proxies.length; k++) {
      if (k === b.proxy[i]) continue;
      const pr = proxies[k];
      ab.subVectors(pr.b, pr.a);
      const t = THREE.MathUtils.clamp(q.subVectors(p, pr.a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0, 1);
      q.copy(pr.a).addScaledVector(ab, t).sub(p);
      const d = q.length();
      if (d < 1e-4) continue;
      const cos = nn.dot(q) / d;
      if (cos <= 0) continue;
      occ += cos * (pr.r * pr.r) / Math.max(d * d, pr.r * pr.r);
    }
    // The rock below: faces turned down toward it, and anything close above it, darken.
    const h = Math.max(p.y - seatY, 0);
    occ += Math.max(-nn.y, 0) * 0.7 * Math.exp(-h / 0.12);
    ao[i] = Math.max(0.18, 1 - occ * 0.9);
  }
  return ao;
}

const VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute vec4 aMat;
  attribute float aBone;
  attribute float aAO;
  uniform mat4 uBones[6];
  varying vec3 vPosW;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec3 vColor;
  varying vec4 vMat;
  varying float vAO;
  void main() {
    mat4 bone = uBones[int(aBone + 0.5)];
    vec4 local = bone * vec4(position, 1.0);
    vec4 world = modelMatrix * local;
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * mat3(bone) * normal);
    vLocal = position;
    vColor = aColor;
    vMat = aMat;
    vAO = aAO;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uDetail;
  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform vec3 uRimDir;
  uniform vec3 uRimColor;
  uniform vec3 uFill;
  uniform vec3 uBounceDir;
  uniform vec3 uBounceColor;
  uniform vec3 uPlanetDir;
  uniform float uPlanetCos;
  uniform vec3 uRingNormal;
  uniform float uLamp;
  uniform float uFade;
  varying vec3 vPosW;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec3 vColor;
  varying vec4 vMat;
  varying float vAO;

  // The sky as the suit and visor reflect it: space, the planet's dark disc and its bright rim, the
  // ring band either side of it, and the broad glow the key light comes from.
  vec3 sky(vec3 r) {
    vec3 col = vec3(0.004, 0.008, 0.016) + vec3(0.01, 0.02, 0.035) * max(r.y, 0.0);
    float c = dot(r, uPlanetDir);
    // Squares written out: pow() of a negative base is NaN on Direct3D.
    float rd = (c - uPlanetCos) / 0.0025;
    float rimBand = exp(-rd * rd);
    float off = 1.0 - smoothstep(uPlanetCos - 0.002, uPlanetCos + 0.002, c);
    // The rings span a wide arc of the sky round the planet: a band along their plane, brightest near it.
    float rb = dot(r, uRingNormal) / 0.07;
    float ringBand = exp(-rb * rb) * smoothstep(-0.2, uPlanetCos, c);
    col += vec3(0.35, 0.75, 1.0) * ringBand * off * 1.4;
    col += vec3(1.0, 0.85, 0.85) * rimBand * 2.0;
    col = mix(col, vec3(0.01, 0.025, 0.035), (1.0 - off));
    col += uKeyColor * (pow(max(dot(r, uKeyDir), 0.0), 24.0) * 0.25 + pow(max(dot(r, uKeyDir), 0.0), 3.0) * 0.06);
    return col;
  }

  void main() {
    float rough = vMat.x;
    float metal = vMat.y;
    float kind = vMat.z;
    float edge = vMat.w;
    vec3 n = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    if (dot(n, V) < -0.2) n = -n;

    vec3 albedo = vColor;
    // Fabric: a fine weave and soft creases from the detail sheet, as bump.
    if (kind < 0.5) {
      vec3 w = pow(abs(n), vec3(4.0));
      w /= w.x + w.y + w.z;
      vec3 p = vLocal * 9.0;
      float hgt = texture2D(uDetail, p.zy).b * w.x + texture2D(uDetail, p.xz).b * w.y + texture2D(uDetail, p.xy).b * w.z;
      float weave = texture2D(uDetail, vLocal.xy * 60.0 + vLocal.z * 31.0).a;
      vec3 dpx = dFdx(vPosW);
      vec3 dpy = dFdy(vPosW);
      vec3 r1 = cross(dpy, n);
      vec3 r2 = cross(n, dpx);
      float det = dot(dpx, r1);
      vec3 grad = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2);
      n = normalize(abs(det) * n - grad * 0.0045);
      albedo *= 0.85 + 0.3 * weave;
    } else if (kind < 1.5) {
      // Hard plates: paint worn back along the rims, a little grime in the mid tones.
      float grime = texture2D(uDetail, vLocal.xy * 7.0 + vLocal.z * 3.0).r;
      albedo *= 0.88 + 0.24 * grime;
      albedo = mix(albedo, vec3(0.55, 0.57, 0.58), edge * 0.35);
    }

    float ao = vAO;
    vec3 H = normalize(uKeyDir + V);
    float ndl = dot(n, uKeyDir);
    // Fabric wraps the light a little; plates take it hard.
    float wrap = kind < 0.5 ? 0.25 : 0.05;
    float diff = max((ndl + wrap) / (1.0 + wrap), 0.0);
    float shininess = mix(220.0, 8.0, rough);
    float spec = pow(max(dot(n, H), 0.0), shininess) * (shininess + 8.0) / 25.0 * step(0.0, ndl);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 f0 = mix(vec3(0.04), albedo, metal);
    vec3 F = f0 + (1.0 - f0) * fres * (1.0 - rough * 0.7);

    vec3 col = albedo * (1.0 - metal) * (uKeyColor * diff + uFill * (0.4 + 0.6 * max(dot(n, V), 0.0)) + uBounceColor * max(dot(n, uBounceDir), 0.0)) * ao;
    col += uKeyColor * spec * F * (1.0 - rough * 0.6);
    // The planet's side: a cool rim along the edges turned toward it.
    float rim = pow(1.0 - max(dot(n, V), 0.0), 2.2) * max(dot(n, uRimDir) + 0.25, 0.0);
    col += uRimColor * rim * (kind < 0.5 ? 0.5 : 0.9) * ao;
    // Reflections of the sky, dimmed by roughness.
    vec3 R = reflect(-V, n);
    col += sky(R) * F * (1.0 - rough) * ao;

    if (kind > 1.5 && kind < 2.5) {
      // The visor: dark gold glass, a mirror of the sky and a sharp highlight of the key.
      float vf = 0.35 + 0.65 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
      vec3 gold = vec3(1.0, 0.78, 0.42);
      col = albedo * 0.02 + sky(R) * gold * vf + uKeyColor * gold * pow(max(dot(n, H), 0.0), 900.0) * 2.5;
      col += uRimColor * rim * 0.6;
    } else if (kind > 2.5) {
      col = albedo * (0.4 + 2.6 * uLamp);
    }
    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface AstronautLight {
  keyDir: THREE.Vector3;
  keyColor: THREE.Color;
  rimDir: THREE.Vector3;
  rimColor: THREE.Color;
  fill: THREE.Color;
  bounceDir: THREE.Vector3;
  bounceColor: THREE.Color;
  /** For reflections: toward the planet, its angular radius, the rings' axis. */
  planetDir: THREE.Vector3;
  planetAngle: number;
  ringNormal: THREE.Vector3;
}

export interface Astronaut {
  group: THREE.Group;
  update(elapsed: number): void;
  setFade(k: number): void;
  /** Capsules (world space) standing in for the figure, for the rock's contact shadow. */
  occluders(): THREE.Vector4[];
  dispose(): void;
}

export interface AstronautOptions {
  light: AstronautLight;
  detail: THREE.Texture;
  /** Whether it moves at all (off under reduced motion: it simply sits). */
  still: boolean;
}

/** Where the bones turn: the torso about the seat, the head about the neck ring, the hands about the wrists. */
const PIVOT = {
  torso: v3(0, 0.1, -0.02),
  neck: v3(0, 0.71, 0.07),
  wristL: v3(0.14, 0.355, 0.6),
  wristR: v3(-0.15, 0.32, 0.57),
};

export function buildAstronaut(o: AstronautOptions): Astronaut {
  const b = new Builder();
  const proxies: Proxy[] = [];
  const proxy = (a: THREE.Vector3, c: THREE.Vector3, r: number) => proxies.push({ a, b: c, r }) - 1;

  // ---------------------------------------------------------------- torso and hips
  // The spine leans forward ~12 degrees; sections are wide across (rx) and shallower front to back (ry).
  const spine = [v3(0, 0.05, -0.03), v3(0, 0.2, -0.02), v3(0, 0.42, 0.02), v3(0, 0.6, 0.06), v3(0, 0.69, 0.075)];
  const torsoProxy = proxy(v3(0, 0.15, -0.02), v3(0, 0.58, 0.05), 0.15);
  const torsoW = (t: number) => {
    // Hips, waist, chest, shoulders, then in to the neck.
    const k = [0.14, 0.18, 0.165, 0.19, 0.215, 0.2, 0.115];
    const f = t * (k.length - 1);
    const i = Math.min(Math.floor(f), k.length - 2);
    const s = f - i;
    return k[i] + (k[i + 1] - k[i]) * s * s * (3 - 2 * s);
  };
  const torsoD = (t: number) => 0.11 + 0.025 * Math.sin(Math.PI * Math.min(t * 1.2, 1)) - 0.03 * Math.max(t - 0.85, 0) / 0.15;
  const torso = b.tube({ path: spine, rx: torsoW, ry: torsoD, side: v3(1, 0, 0), seg: 32, steps: 22, finish: { color: FABRIC, rough: 0.82, kind: Kind.Fabric, bone: Bone.Torso, proxy: torsoProxy } });
  // Chest armour (yellow) over the front, the upper back under the pack, a pale belly plate, a hip belt.
  // Angles round the torso: 0 = his left side (+X), -PI/2 = his front (+Z), PI = his right, PI/2 = his back.
  const front = -Math.PI / 2;
  b.plate(torso, 0.6, 0.93, front - 1.15, front + 1.15, { color: YELLOW, rough: 0.45, bone: Bone.Torso, proxy: torsoProxy }, 0.008, 0.012, 12, 16);
  b.plate(torso, 0.38, 0.57, front - 0.95, front + 0.95, { color: PLATE, rough: 0.5, bone: Bone.Torso, proxy: torsoProxy }, 0.006, 0.009, 8, 14);
  b.plate(torso, 0.17, 0.27, 0, Math.PI * 2, { color: GUNMETAL, rough: 0.4, metal: 0.6, bone: Bone.Torso, proxy: torsoProxy }, 0.004, 0.012, 6, 32);
  b.plate(torso, 0.62, 0.95, front + Math.PI - 1.2, front + Math.PI + 1.2, { color: PLATE, rough: 0.55, bone: Bone.Torso, proxy: torsoProxy }, 0.006, 0.01, 10, 14);
  // Flank armour in yellow under the arms, with a lime stripe along its top.
  for (const a of [0, Math.PI]) {
    b.plate(torso, 0.33, 0.6, a - 0.55, a + 0.55, { color: YELLOW, rough: 0.45, bone: Bone.Torso, proxy: torsoProxy }, 0.008, 0.01, 8, 10);
    b.plate(torso, 0.6, 0.66, a - 0.5, a + 0.5, { color: LIME, rough: 0.5, bone: Bone.Torso, proxy: torsoProxy }, 0.008, 0.008, 4, 8);
  }
  // The chest lamp and a control box under it.
  const chestUp = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -0.2);
  b.blob(v3(0.0, 0.43, 0.135), v3(0.06, 0.035, 0.025), 0.35, chestUp, { color: BLACK, rough: 0.35, metal: 0.3, bone: Bone.Torso, proxy: torsoProxy });
  b.blob(v3(0.035, 0.435, 0.157), v3(0.009, 0.009, 0.006), 0.6, chestUp, { color: 0x48e0ff, rough: 0.3, kind: Kind.Lamp, bone: Bone.Torso, proxy: torsoProxy }, 8, 10);

  // Pelvis / seat: a broad rounded block on the rock.
  b.blob(v3(0, 0.1, -0.01), v3(0.18, 0.09, 0.14), 0.55, new THREE.Quaternion(), { color: NAVY, rough: 0.85, kind: Kind.Fabric, bone: Bone.Root, proxy: torsoProxy });

  // ---------------------------------------------------------------- legs
  const legs = [
    { side: 1, hip: v3(0.1, 0.11, 0.03), knee: v3(0.15, 0.38, 0.44), ankle: v3(0.17, -0.04, 0.58), toe: v3(0.18, -0.1, 0.8) },
    { side: -1, hip: v3(-0.1, 0.1, 0.03), knee: v3(-0.17, 0.32, 0.43), ankle: v3(-0.2, -0.08, 0.5), toe: v3(-0.22, -0.14, 0.72) },
  ];
  for (const L of legs) {
    const thighProxy = proxy(L.hip, L.knee, 0.085);
    const shinProxy = proxy(L.knee, L.ankle, 0.065);
    const thigh = b.tube({
      path: [L.hip, L.hip.clone().lerp(L.knee, 0.5).add(v3(0, 0.02, 0)), L.knee],
      rx: (t) => (0.106 - 0.024 * t) * bellows(t, 0.82, 1.0, 2, 0.08),
      ry: (t) => (0.098 - 0.02 * t) * bellows(t, 0.82, 1.0, 2, 0.08),
      side: v3(0, 1, 0),
      finish: { color: NAVY, rough: 0.82, kind: Kind.Fabric, bone: Bone.Root, proxy: thighProxy },
    });
    // Thigh armour on top (angle 0 = up), a pale strip along the outside.
    b.plate(thigh, 0.12, 0.72, -1.05, 1.05, { color: YELLOW, rough: 0.45, bone: Bone.Root, proxy: thighProxy }, 0.006, 0.011, 12, 14);
    b.plate(thigh, 0.2, 0.68, L.side > 0 ? -1.75 : 1.12, L.side > 0 ? -1.12 : 1.75, { color: YELLOW, rough: 0.5, bone: Bone.Root, proxy: thighProxy }, 0.006, 0.008, 10, 6);
    const shin = b.tube({
      path: [L.knee, L.knee.clone().lerp(L.ankle, 0.5), L.ankle],
      rx: (t) => (0.08 - 0.017 * t) * bellows(t, 0.0, 0.16, 2, 0.08),
      side: v3(0, 0, 1),
      finish: { color: NAVY, rough: 0.82, kind: Kind.Fabric, bone: Bone.Root, proxy: shinProxy },
    });
    // Shin guard (yellow over pale), the knee cap.
    b.plate(shin, 0.16, 0.86, -1.1, 1.1, { color: PLATE, rough: 0.5, bone: Bone.Root, proxy: shinProxy }, 0.006, 0.008, 12, 12);
    b.plate(shin, 0.22, 0.6, -0.75, 0.75, { color: YELLOW, rough: 0.45, bone: Bone.Root, proxy: shinProxy }, 0.016, 0.008, 10, 10);
    const kneeDir = L.knee.clone().sub(L.hip).normalize().add(L.knee.clone().sub(L.ankle).normalize()).normalize();
    const kq = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), kneeDir);
    b.blob(L.knee.clone().addScaledVector(kneeDir, 0.045), v3(0.066, 0.066, 0.045), 0.6, kq, { color: PLATE, rough: 0.45, bone: Bone.Root, proxy: shinProxy });
    b.blob(L.knee.clone().addScaledVector(kneeDir, 0.075), v3(0.03, 0.03, 0.02), 0.5, kq, { color: GUNMETAL, rough: 0.35, metal: 0.6, bone: Bone.Root, proxy: shinProxy }, 8, 12);
    // The boot: a heavy rounded block along the foot, a dark sole, a cuff and a yellow strap.
    const footDir = L.toe.clone().sub(L.ankle).setY(0).normalize();
    const fq = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), footDir);
    const bootC = L.ankle.clone().lerp(L.toe, 0.5).add(v3(0, -0.005, 0));
    const bootProxy = proxy(L.ankle.clone().add(v3(0, -0.04, 0)), L.toe, 0.06);
    b.blob(bootC, v3(0.07, 0.065, 0.15), 0.42, fq, { color: BOOT, rough: 0.6, bone: Bone.Root, proxy: bootProxy });
    b.blob(bootC.clone().add(v3(0, -0.058, 0.005)), v3(0.075, 0.018, 0.16), 0.3, fq, { color: BLACK, rough: 0.8, bone: Bone.Root, proxy: bootProxy });
    b.blob(L.ankle.clone().add(v3(0, 0.03, 0)), v3(0.078, 0.06, 0.078), 0.6, fq, { color: GUNMETAL, rough: 0.45, metal: 0.4, bone: Bone.Root, proxy: bootProxy });
    b.blob(bootC.clone().add(v3(0, 0.035, 0.0)).addScaledVector(footDir, 0.02), v3(0.074, 0.03, 0.035), 0.4, fq, { color: YELLOW, rough: 0.45, bone: Bone.Root, proxy: bootProxy });
  }

  // ---------------------------------------------------------------- arms
  const arms = [
    { side: 1, shoulder: v3(0.21, 0.6, 0.05), elbow: v3(0.25, 0.43, 0.34), wrist: PIVOT.wristL, hand: v3(0.125, 0.3, 0.66), bone: Bone.HandL },
    { side: -1, shoulder: v3(-0.21, 0.6, 0.05), elbow: v3(-0.27, 0.39, 0.32), wrist: PIVOT.wristR, hand: v3(-0.14, 0.26, 0.63), bone: Bone.HandR },
  ];
  for (const A of arms) {
    const upperProxy = proxy(A.shoulder, A.elbow, 0.07);
    const foreProxy = proxy(A.elbow, A.wrist, 0.058);
    const upper = b.tube({
      path: [A.shoulder, A.shoulder.clone().lerp(A.elbow, 0.5).add(v3(0.012 * A.side, 0, 0)), A.elbow],
      rx: (t) => (0.09 - 0.012 * t) * bellows(t, 0.8, 1.0, 2, 0.09),
      side: v3(A.side, 0, 0),
      finish: { color: FABRIC, rough: 0.82, kind: Kind.Fabric, bone: Bone.Shoulders, proxy: upperProxy },
    });
    b.plate(upper, 0.25, 0.72, -1.2, 1.2, { color: YELLOW, rough: 0.5, bone: Bone.Shoulders, proxy: upperProxy }, 0.005, 0.007, 8, 10);
    // The shoulder: a yellow pauldron over a bearing ring.
    const outward = v3(A.side, 0.55, 0).normalize();
    const pq = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), outward);
    b.spherePatch(A.shoulder.clone().add(v3(-0.012 * A.side, -0.01, 0)), 0.085, pq, -1.25, 1.25, -1.1, 1.1, { color: YELLOW, rough: 0.42, bone: Bone.Shoulders, proxy: upperProxy }, 0.006, 0.012);
    b.ring(A.shoulder.clone().add(v3(0.03 * A.side, -0.055, 0)), A.elbow.clone().sub(A.shoulder).normalize(), 0.072, 0.012, { color: GUNMETAL, rough: 0.35, metal: 0.7, bone: Bone.Shoulders, proxy: upperProxy });
    const fore = b.tube({
      path: [A.elbow, A.elbow.clone().lerp(A.wrist, 0.5), A.wrist],
      rx: (t) => (0.078 - 0.016 * t) * bellows(t, 0.0, 0.18, 2, 0.08),
      side: v3(0, 1, 0),
      finish: { color: FABRIC, rough: 0.82, kind: Kind.Fabric, bone: Bone.Root, proxy: foreProxy },
    });
    // Gauntlet: yellow over the top of the forearm, a pale cuff, the wrist ring.
    b.plate(fore, 0.25, 0.85, -1.3, 1.3, { color: YELLOW, rough: 0.45, bone: Bone.Root, proxy: foreProxy }, 0.006, 0.01, 10, 12);
    b.plate(fore, 0.86, 0.98, 0, Math.PI * 2, { color: PLATE, rough: 0.5, bone: Bone.Root, proxy: foreProxy }, 0.006, 0.01, 4, 24);
    // Elbow cap.
    const eDir = A.elbow.clone().sub(A.shoulder).normalize().add(A.elbow.clone().sub(A.wrist).normalize()).normalize();
    b.blob(A.elbow.clone().addScaledVector(eDir, 0.035), v3(0.05, 0.05, 0.035), 0.6, new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), eDir), { color: PLATE, rough: 0.45, bone: Bone.Root, proxy: foreProxy });
    // The glove, hanging over the knee: a palm block, the curled fingers, a thumb, yellow knuckles.
    const handDir = A.hand.clone().sub(A.wrist).normalize();
    const hq = new THREE.Quaternion().setFromUnitVectors(v3(0, -1, 0), handDir);
    hq.multiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), A.side * 0.5));
    const handProxy = proxy(A.wrist, A.hand, 0.045);
    const g = { color: 0x1f262b, rough: 0.75, bone: A.bone, proxy: handProxy };
    b.blob(A.wrist.clone().lerp(A.hand, 0.45), v3(0.052, 0.06, 0.03), 0.5, hq, g);
    const tip = A.hand.clone().addScaledVector(handDir, 0.02);
    b.blob(tip.clone().add(v3(0, 0, 0.012)), v3(0.05, 0.042, 0.03), 0.6, hq, g);
    b.blob(A.wrist.clone().lerp(A.hand, 0.55).add(new THREE.Vector3(0.035 * A.side, 0, 0.02).applyQuaternion(hq)), v3(0.016, 0.04, 0.016), 0.8, hq, g, 8, 10);
    b.blob(A.wrist.clone().lerp(A.hand, 0.62).add(new THREE.Vector3(0, 0, 0.03).applyQuaternion(hq)), v3(0.05, 0.016, 0.012), 0.45, hq, { ...g, color: YELLOW, rough: 0.5 }, 8, 12);
  }

  // ---------------------------------------------------------------- backpack and hose
  const packQ = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), 0.2);
  const packProxy = proxy(v3(0, 0.36, -0.2), v3(0, 0.66, -0.15), 0.15);
  b.blob(v3(0, 0.48, -0.2), v3(0.2, 0.25, 0.1), 0.28, packQ, { color: PLATE, rough: 0.55, bone: Bone.Torso, proxy: packProxy }, 16, 24);
  b.blob(v3(0, 0.5, -0.29), v3(0.17, 0.2, 0.035), 0.25, packQ, { color: GUNMETAL, rough: 0.5, metal: 0.4, bone: Bone.Torso, proxy: packProxy }, 12, 20);
  b.blob(v3(0, 0.3, -0.24), v3(0.18, 0.05, 0.08), 0.3, packQ, { color: YELLOW, rough: 0.45, bone: Bone.Torso, proxy: packProxy }, 10, 18);
  // Two tanks along its sides.
  for (const s of [1, -1]) {
    b.tube({ path: [v3(0.19 * s, 0.3, -0.21), v3(0.19 * s, 0.68, -0.13)], rx: 0.045, side: v3(1, 0, 0), seg: 16, steps: 6, finish: { color: GUNMETAL, rough: 0.35, metal: 0.65, bone: Bone.Torso, proxy: packProxy } });
  }
  // The hose from the pack round to the helmet's side.
  b.tube({ path: [v3(0.17, 0.66, -0.2), v3(0.26, 0.74, -0.08), v3(0.2, 0.78, 0.04), v3(0.14, 0.8, 0.1)], rx: 0.017, side: v3(0, 1, 0), seg: 10, steps: 18, finish: { color: 0x22282d, rough: 0.6, bone: Bone.Torso, proxy: packProxy } });
  // Antenna on the pack.
  b.tube({ path: [v3(-0.15, 0.7, -0.22), v3(-0.16, 0.9, -0.25), v3(-0.17, 1.02, -0.27)], rx: 0.005, side: v3(1, 0, 0), seg: 6, steps: 6, finish: { color: GUNMETAL, rough: 0.4, metal: 0.6, bone: Bone.Torso, proxy: packProxy } });
  b.blob(v3(-0.17, 1.03, -0.27), v3(0.01, 0.01, 0.01), 1, new THREE.Quaternion(), { color: 0xff5a3c, rough: 0.4, kind: Kind.Lamp, bone: Bone.Torso, proxy: packProxy }, 6, 8);

  // ---------------------------------------------------------------- neck ring and helmet
  b.ring(PIVOT.neck, v3(0, 1, 0.15), 0.115, 0.022, { color: GUNMETAL, rough: 0.3, metal: 0.75, bone: Bone.Torso, proxy: torsoProxy }, 36, 12);
  b.ring(PIVOT.neck.clone().add(v3(0, 0.025, 0.003)), v3(0, 1, 0.15), 0.108, 0.012, { color: YELLOW, rough: 0.45, bone: Bone.Torso, proxy: torsoProxy }, 36, 8);
  const head = PIVOT.neck.clone().add(v3(0, 0.15, 0.025));
  const headProxy = proxy(head, head, 0.16);
  const hq = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -0.08);
  const shell = { color: 0xd9dbd8, rough: 0.35, bone: Bone.Head, proxy: headProxy };
  b.blob(head, v3(0.152, 0.158, 0.155), 1, hq, shell, 24, 36);
  // Lime trim round the visor, the visor itself, a brow ridge and a dark lower rim.
  b.spherePatch(head, 0.152, hq, -1.45, 1.45, -0.72, 0.78, { color: LIME, rough: 0.45, bone: Bone.Head, proxy: headProxy }, 0.002, 0.006);
  b.spherePatch(head, 0.152, hq, -1.25, 1.25, -0.55, 0.62, { color: 0x05070a, rough: 0.05, kind: Kind.Visor, bone: Bone.Head, proxy: headProxy }, 0.009, 0.004, 16, 26);
  b.spherePatch(head, 0.152, hq, -1.0, 1.0, 0.72, 1.0, { color: PLATE, rough: 0.4, bone: Bone.Head, proxy: headProxy }, 0.004, 0.008, 6, 14);
  // Side pods (a radio and a lamp), and the helmet lamp on top.
  for (const s of [1, -1]) {
    const side = new THREE.Vector3(s, 0.05, -0.05).normalize();
    const sq = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), side);
    b.blob(head.clone().addScaledVector(side, 0.158), v3(0.05, 0.05, 0.022), 0.7, sq, { color: GUNMETAL, rough: 0.4, metal: 0.5, bone: Bone.Head, proxy: headProxy }, 10, 16);
    b.blob(head.clone().addScaledVector(side, 0.178), v3(0.03, 0.03, 0.01), 0.7, sq, { color: YELLOW, rough: 0.45, bone: Bone.Head, proxy: headProxy }, 8, 12);
  }
  b.blob(head.clone().add(v3(0.07, 0.13, 0.03)), v3(0.03, 0.02, 0.04), 0.4, hq, { color: GUNMETAL, rough: 0.4, metal: 0.5, bone: Bone.Head, proxy: headProxy }, 8, 12);
  b.blob(head.clone().add(v3(0.07, 0.13, 0.07)), v3(0.018, 0.012, 0.004), 0.5, hq, { color: 0xbff4ff, rough: 0.3, kind: Kind.Lamp, bone: Bone.Head, proxy: headProxy }, 6, 8);

  // ---------------------------------------------------------------- assemble
  const ao = bakeOcclusion(b, proxies, 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(b.col, 3));
  geo.setAttribute('aMat', new THREE.Float32BufferAttribute(b.mat, 4));
  geo.setAttribute('aBone', new THREE.Float32BufferAttribute(b.bone, 1));
  geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  geo.setIndex(b.index);
  geo.computeBoundingSphere();

  const bones = Array.from({ length: 6 }, () => new THREE.Matrix4());
  const fade = { value: 0 };
  const lamp = { value: 0 };
  const L = o.light;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uBones: { value: bones },
      uDetail: { value: o.detail },
      uKeyDir: { value: L.keyDir },
      uKeyColor: { value: L.keyColor },
      uRimDir: { value: L.rimDir },
      uRimColor: { value: L.rimColor },
      uFill: { value: L.fill },
      uBounceDir: { value: L.bounceDir },
      uBounceColor: { value: L.bounceColor },
      uPlanetDir: { value: L.planetDir },
      uPlanetCos: { value: Math.cos(L.planetAngle) },
      uRingNormal: { value: L.ringNormal },
      uLamp: lamp,
      uFade: fade,
    },
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'title-astronaut';
  const group = new THREE.Group();
  group.name = 'title-astronaut-root';
  group.add(mesh);

  // Bone motion, all on elapsed time: sums of slow sines at unrelated periods, so it never visibly loops.
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const back = new THREE.Matrix4();
  const about = (out: THREE.Matrix4, pivot: THREE.Vector3, rot: THREE.Quaternion, lift = 0) => {
    out.makeTranslation(pivot.x, pivot.y + lift, pivot.z).multiply(m.makeRotationFromQuaternion(rot)).multiply(back.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    return out;
  };
  const headM = new THREE.Matrix4();
  const occ = proxies.map(() => new THREE.Vector4());
  return {
    group,
    update(t) {
      const k = o.still ? 0 : 1;
      // Breathing: ~4.6 s a breath, a little irregular.
      const breath = Math.sin(t * 1.37) * 0.8 + Math.sin(t * 0.61 + 1.2) * 0.2;
      e.set(-0.006 * breath * k, 0, 0);
      about(bones[Bone.Torso], PIVOT.torso, q.setFromEuler(e), 0.0025 * breath * k);
      e.set(-0.003 * breath * k, 0, 0);
      about(bones[Bone.Shoulders], PIVOT.torso, q.setFromEuler(e), 0.0012 * breath * k);
      // The head: looking out, drifting between the planet and the rocks below it, now and then a little longer one way.
      const yaw = (Math.sin(t * 0.071) * 0.09 + Math.sin(t * 0.163 + 2.1) * 0.035) * k;
      const pitch = (Math.sin(t * 0.053 + 0.7) * 0.04 + Math.sin(t * 0.19 + 1.1) * 0.012) * k;
      e.set(pitch, yaw, 0, 'YXZ');
      about(headM, PIVOT.neck, q.setFromEuler(e));
      bones[Bone.Head].multiplyMatrices(bones[Bone.Torso], headM);
      // Hands, hanging: the slightest sway.
      e.set(Math.sin(t * 0.83) * 0.02 * k, 0, Math.sin(t * 0.57 + 0.4) * 0.015 * k);
      about(bones[Bone.HandL], PIVOT.wristL, q.setFromEuler(e));
      e.set(Math.sin(t * 0.77 + 2.0) * 0.02 * k, 0, Math.sin(t * 0.49 + 1.3) * 0.015 * k);
      about(bones[Bone.HandR], PIVOT.wristR, q.setFromEuler(e));
      // The chest lamp: a short double blink every ~3.4 s (steady under reduced motion).
      const c = (t % 3.4) / 3.4;
      lamp.value = o.still ? 0.6 : Math.max(Math.exp(-Math.pow((c - 0.05) / 0.012, 2)), Math.exp(-Math.pow((c - 0.11) / 0.012, 2))) * 0.9 + 0.1;
    },
    setFade(kf) {
      fade.value = kf;
    },
    occluders() {
      group.updateMatrixWorld(true);
      const w = group.matrixWorld;
      const s = new THREE.Vector3().setFromMatrixScale(w).x;
      return proxies.map((p, i) => {
        const c = p.a.clone().lerp(p.b, 0.5).applyMatrix4(w);
        const r = (p.r + p.a.distanceTo(p.b) * 0.35) * s;
        return occ[i].set(c.x, c.y, c.z, r);
      });
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
