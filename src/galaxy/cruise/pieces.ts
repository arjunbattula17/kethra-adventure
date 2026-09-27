import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import { getPointSprite } from '../spaceDressing';

/**
 * The cruise's parts (docs/DESIGN.md §5): what the Wren's drive puts out, what streams past a ship
 * under way, and what waits at the bottom of Kethra's sky. Each is one or two draw calls.
 */

/** One engine plume: a soft cone of the drive's light, brightest at the bell, with a hot core. */
export function buildPlume(): { mesh: THREE.Mesh; set(k: number): void } {
  const geo = new THREE.ConeGeometry(0.42, 5.5, 20, 1, true).rotateZ(Math.PI / 2).translate(-2.75, 0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying float vRim;
      void main() {
        vAlong = clamp(-position.x / 5.5, 0.0, 1.0);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vRim = abs(dot(normalize(mat3(modelMatrix) * normal), normalize(cameraPosition - w.xyz)));
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uK;
      varying float vAlong;
      varying float vRim;
      void main() {
        // White-hot at the bell, drive-orange down the length, gone by the tip.
        vec3 hot = vec3(1.0, 0.93, 0.8);
        vec3 warm = vec3(1.0, 0.55, 0.22);
        // Clamped here, not only in the vertex shader: MSAA can sample a varying just outside the
        // triangle, and pow() of a negative is NaN, which the bloom then smears over the frame.
        float fade = pow(max(0.0, 1.0 - vAlong), 2.2);
        vec3 c = mix(hot, warm, smoothstep(0.0, 0.35, vAlong)) * fade * (0.35 + 0.65 * vRim);
        gl_FragColor = vec4(c * uK * 1.1, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  return {
    mesh,
    set(k) {
      mat.uniforms.uK.value = k;
      mesh.visible = k > 0.002;
      mesh.scale.set(0.35 + 0.65 * Math.min(1, k), 1, 1);
    },
  };
}

/** A shockwave ring off an igniting pod: it grows and thins, communicating force. */
export function buildShockRing(): { mesh: THREE.Mesh; set(age: number): void } {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), mat);
  mesh.rotation.y = Math.PI / 2;
  mesh.visible = false;
  return {
    mesh,
    set(age) {
      const k = age / 0.9;
      mesh.visible = k >= 0 && k < 1;
      if (!mesh.visible) return;
      mesh.scale.setScalar(0.4 + k * 3.2);
      mat.opacity = (1 - k) * (1 - k);
    },
  };
}

/** Rocks along the first stretch of the burn: foreground for the departure, parallax for the climb. */
export function buildPassingRocks(seed = 0x7e11): THREE.InstancedMesh {
  const rand = mulberry32(seed);
  const count = 260;
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0x6f6861, roughness: 0.95, metalness: 0, flatShading: true }),
    count,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // Along the burn (x), off to either side, never on the line itself.
    const side = rand() < 0.5 ? -1 : 1;
    p.set(-60 + rand() * 900, (rand() - 0.5) * 70, side * (14 + Math.pow(rand(), 0.6) * 120));
    const size = 0.6 + Math.pow(rand(), 3) * 9;
    s.set(size * (0.7 + rand() * 0.6), size * (0.6 + rand() * 0.5), size * (0.7 + rand() * 0.6));
    q.setFromEuler(e.set(rand() * 6.3, rand() * 6.3, rand() * 6.3));
    mesh.setMatrixAt(i, m.compose(p, q, s));
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * Stars stretched by speed: short lines around the camera, each drawn from where a point of light
 * was to where the ship's motion has carried it. Length follows velocity, so they relax as the
 * burn settles into the cruise.
 */
export class Streaks {
  readonly object: THREE.LineSegments;
  private readonly base: Float32Array;
  private readonly pos: Float32Array;

  constructor(count = 360, seed = 0x57a2) {
    const rand = mulberry32(seed);
    this.base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const d = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(30 + rand() * 50);
      this.base.set([d.x, d.y, d.z], i * 3);
    }
    this.pos = new Float32Array(count * 6);
    const col = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const b = 0.25 + rand() * 0.5;
      col.set([b, b, b * 1.1, 0, 0, 0], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.object = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.object.frustumCulled = false;
    this.object.renderOrder = -900;
  }

  /** `length` in world units along -velocity; centred on the camera. */
  update(camera: THREE.Camera, velocityDir: THREE.Vector3, length: number): void {
    this.object.visible = length > 0.05;
    if (!this.object.visible) return;
    const c = camera.position;
    for (let i = 0; i < this.base.length / 3; i++) {
      const x = this.base[i * 3] + c.x;
      const y = this.base[i * 3 + 1] + c.y;
      const z = this.base[i * 3 + 2] + c.z;
      this.pos.set([x, y, z, x - velocityDir.x * length, y - velocityDir.y * length, z - velocityDir.z * length], i * 6);
    }
    (this.object.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Cloud banks for the entry: soft sprites the skiff drops through, streaming past. */
export function buildCloudLayer(seed = 0xc10d): { group: THREE.Group; clouds: THREE.Sprite[] } {
  const rand = mulberry32(seed);
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  // A lumpy soft puff: a few overlapping radial blobs.
  for (let i = 0; i < 9; i++) {
    const x = size * (0.3 + rand() * 0.4);
    const y = size * (0.35 + rand() * 0.3);
    const r = size * (0.16 + rand() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const clouds: THREE.Sprite[] = [];
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x5d7d78, transparent: true, depthWrite: false, opacity: 0.55 }));
    s.position.set((rand() - 0.5) * 160, -rand() * 220, (rand() - 0.5) * 160);
    s.scale.setScalar(24 + rand() * 40);
    group.add(s);
    clouds.push(s);
  }
  return { group, clouds };
}

/** Kethra's canopy from above at night: dark, with scattered living lights. */
export function buildCanopyLights(seed = 0xca9): THREE.Group {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(900, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x03100c }),
  );
  group.add(floor);
  const count = 1800;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Clustered, as pods on boughs are: a few lights around each of a scatter of centres.
    const cx = (rand() - 0.5) * 1200;
    const cz = (rand() - 0.5) * 1200;
    pos.set([cx + (rand() - 0.5) * 18, 2 + rand() * 10, cz + (rand() - 0.5) * 18], i * 3);
    c.setHex(0x5cd1b0).multiplyScalar(0.3 + rand() * 0.9);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  group.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, map: getPointSprite(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
  return group;
}
