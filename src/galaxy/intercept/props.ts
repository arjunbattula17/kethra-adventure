import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import { getPointSprite } from '../spaceDressing';
import type { Clump, Vec } from './sim';
import { BELT_RADIUS } from './sim';
import { INK, toV3 } from './instrument';

/**
 * The Intercept scene's bodies at plot scale (1 unit = 1 Mkm): the belt the sim tests against, the
 * Wren's debris, and ORION's buoy. Each is one or two draw calls.
 */

export interface Belt {
  group: THREE.Group;
  /** 0 = only the thin dust; 1 = the rock clumps fully shown. */
  setResolved(k: number): void;
  /** Perception 2: the clumps' extent shown as a faint shaded volume. */
  setDensityVisible(on: boolean): void;
}

/**
 * Rocks fill the sim's clumps, so what the player sees is what the sim tests: a thin wall of rock
 * standing across the plane, open above and below. Dust scatters wider and thinner around it.
 */
export function buildBelt(clumps: Clump[], seed = 0xbe17): Belt {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'belt';

  const perClump = 26;
  const rocks = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.92, metalness: 0, flatShading: true, transparent: true, opacity: 0 }),
    clumps.length * perClump,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let i = 0;
  for (const c of clumps) {
    for (let k = 0; k < perClump; k++) {
      // Uniform in the sphere, a little flattened: a belt, not a string of balls.
      let x: number, y: number, z: number;
      do {
        x = rand() * 2 - 1;
        y = rand() * 2 - 1;
        z = rand() * 2 - 1;
      } while (x * x + y * y + z * z > 1);
      p.set(c.c.x + x * c.r * 0.92, c.c.y + y * c.r * 0.8, c.c.z + z * c.r * 0.92);
      const size = 0.12 + Math.pow(rand(), 2.2) * 0.55;
      s.set(size * (0.7 + rand() * 0.6), size * (0.6 + rand() * 0.5), size * (0.7 + rand() * 0.6));
      q.setFromEuler(e.set(rand() * 6.3, rand() * 6.3, rand() * 6.3));
      rocks.setMatrixAt(i++, m.compose(p, q, s));
    }
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.visible = false;
  group.add(rocks);

  const dustCount = 2600;
  const dustPos = new Float32Array(dustCount * 3);
  const dustCol = new Float32Array(dustCount * 3);
  const dc = new THREE.Color();
  for (let k = 0; k < dustCount; k++) {
    const a = rand() * Math.PI * 2;
    const r = BELT_RADIUS + (rand() + rand() + rand() - 1.5) * 7;
    dustPos.set([r * Math.cos(a), (rand() + rand() - 1) * 2.2, r * Math.sin(a)], k * 3);
    dc.setHex(0x8c847a).multiplyScalar(0.18 + rand() * 0.3);
    dustCol.set([dc.r, dc.g, dc.b], k * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, map: getPointSprite(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  group.add(dust);

  // The clumps' extent, for perception 2: soft-edged shells, brighter at the rim.
  const density = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 2),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(INK.steel) }, uOpacity: { value: 0 } },
      vertexShader: /* glsl */ `
        varying float vRim;
        void main() {
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vRim = 1.0 - abs(dot(n, normalize(cameraPosition - world.xyz)));
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vRim;
        void main() { gl_FragColor = vec4(uColor * (0.12 + 0.5 * pow(max(vRim, 0.0), 3.0)) * uOpacity, 1.0); }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    }),
    clumps.length,
  );
  clumps.forEach((c, k) => density.setMatrixAt(k, m.compose(toV3(c.c, p), q.identity(), s.setScalar(c.r))));
  density.instanceMatrix.needsUpdate = true;
  density.visible = false;
  group.add(density);

  const rockMat = rocks.material as THREE.MeshStandardMaterial;
  const densityMat = density.material as THREE.ShaderMaterial;
  let resolved = 0;
  let densityOn = false;
  return {
    group,
    setResolved(k) {
      resolved = k;
      rocks.visible = k > 0;
      rockMat.opacity = k;
      rockMat.transparent = k < 1;
      rockMat.depthWrite = k >= 1;
      densityMat.uniforms.uOpacity.value = densityOn ? k : 0;
      density.visible = densityOn && k > 0;
    },
    setDensityVisible(on) {
      densityOn = on;
      densityMat.uniforms.uOpacity.value = on ? resolved : 0;
      density.visible = on && resolved > 0;
    },
  };
}

/** Drifting shards of hull plating around the Wren. Decoration only. */
export function buildDrift(center: Vec, seed = 0xd21f7): { group: THREE.Group; update(dt: number): void } {
  const rand = mulberry32(seed);
  const count = 48;
  const mesh = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x4c5055, roughness: 0.6, metalness: 0.45, flatShading: true }),
    count,
  );
  const parts = Array.from({ length: count }, () => {
    const r = 0.35 + Math.pow(rand(), 0.7) * 2.4;
    const a = rand() * Math.PI * 2;
    return {
      pos: new THREE.Vector3(center.x + r * Math.cos(a), center.y + (rand() - 0.5) * 1.4, center.z + r * Math.sin(a)),
      rot: new THREE.Euler(rand() * 6, rand() * 6, rand() * 6),
      spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.6),
      size: 0.006 + Math.pow(rand(), 3) * 0.03,
    };
  });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const write = () => {
    parts.forEach((p, i) => mesh.setMatrixAt(i, m.compose(p.pos, q.setFromEuler(p.rot), s.setScalar(p.size))));
    mesh.instanceMatrix.needsUpdate = true;
  };
  write();
  const group = new THREE.Group();
  group.add(mesh);
  return {
    group,
    update(dt) {
      for (const p of parts) {
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
      }
      write();
    },
  };
}

/** ORION's buoy: a squat beacon with a blinking amber lamp. */
export function buildBuoy(at: Vec): { group: THREE.Group; update(time: number): void } {
  const group = new THREE.Group();
  group.position.set(at.x, at.y, at.z);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.07, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.5, metalness: 0.5, flatShading: true }),
  );
  group.add(body);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 5), body.material);
  mast.position.y = 0.16;
  group.add(mast);
  const lamp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: getPointSprite(), color: INK.amber, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  lamp.position.y = 0.26;
  lamp.scale.setScalar(0.12);
  group.add(lamp);
  const lampMat = lamp.material;
  return {
    group,
    update(time) {
      lampMat.opacity = Math.sin(time * Math.PI * 2 * 0.8) > 0.2 ? 1 : 0.15;
    },
  };
}
