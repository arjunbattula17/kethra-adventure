import * as THREE from 'three';
import { getPointSprite } from '../spaceDressing';
import type { Orbit, Vec } from './sim';
import { orbitAt } from './sim';

/**
 * Drawing helpers for the navigation instrument: 1 px hairlines and screen-sized dots. Everything is
 * additive and writes no depth, so it draws as an overlay on the scene. The chart the player
 * interacts with is ./overlay.
 */

export const INK = {
  amber: 0xd9a441,
  grove: 0x5cd1b0,
  steel: 0x5d666f,
  warn: 0xd06a5c,
  ink: 0xeae2d0,
} as const;

export function toV3(p: Vec, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(p.x, p.y, p.z);
}

function hairline(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/**
 * Uniforms for revealing static hairlines: lines show only within `uRadius` of `uOrigin`, with a
 * bright band at that edge. Once the scan is done, set the radius above 1e4 to show everything
 * and hide the band.
 */
export interface Reveal {
  uOrigin: { value: THREE.Vector3 };
  uRadius: { value: number };
}

export function revealHairline(reveal: Reveal): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: reveal as unknown as Record<string, THREE.IUniform>,
    vertexColors: true,
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      varying vec3 vWorld;
      void main() {
        vColor = color;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uOrigin;
      uniform float uRadius;
      varying vec3 vColor;
      varying vec3 vWorld;
      void main() {
        float d = distance(vWorld, uOrigin);
        float shown = 1.0 - smoothstep(uRadius - 4.0, uRadius, d);
        // Show the edge band only while the scan is expanding (0.5 <= uRadius <= 1e4).
        float band = (d - uRadius) / 1.6;
        float edge = exp(-band * band) * step(0.5, uRadius) * step(uRadius, 1e4);
        gl_FragColor = vec4(vColor * (shown + edge * 3.0), 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * A fixed-size pool of line segments, rebuilt when their content changes. Colour is per vertex;
 * with additive blending a darker colour draws a dimmer line, and black draws nothing.
 */
export class Lines {
  readonly object: THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private n = 0;

  constructor(max: number, renderOrder = 10, material: THREE.Material = hairline()) {
    this.pos = new Float32Array(max * 6);
    this.col = new Float32Array(max * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.object = new THREE.LineSegments(geo, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = renderOrder;
  }

  clear(): this {
    this.n = 0;
    return this;
  }

  add(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color): this {
    if ((this.n + 1) * 6 > this.pos.length) return this;
    const i = this.n * 6;
    this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i);
    this.col.set([color.r, color.g, color.b, color.r, color.g, color.b], i);
    this.n++;
    return this;
  }

  /** A polyline through `points`. */
  path(points: THREE.Vector3[], color: THREE.Color): this {
    for (let i = 1; i < points.length; i++) this.add(points[i - 1], points[i], color);
    return this;
  }

  /** A dashed segment: `dash` long, `gap` apart, in world units. */
  dashed(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color, dash: number, gap: number): this {
    const d = a.distanceTo(b);
    const step = dash + gap;
    for (let s = 0; s < d; s += step) this.add(_p.lerpVectors(a, b, s / d).clone(), _q.lerpVectors(a, b, Math.min(d, s + dash) / d).clone(), color);
    return this;
  }

  commit(): void {
    const geo = this.object.geometry;
    geo.setDrawRange(0, this.n * 2);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

/** Round dots a fixed number of pixels across, whatever their distance: day ticks and markers. */
export class Dots {
  readonly object: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private n = 0;

  constructor(max: number, sizePx: number, renderOrder = 11) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.object = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: sizePx,
        sizeAttenuation: false,
        map: getPointSprite(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.object.frustumCulled = false;
    this.object.renderOrder = renderOrder;
  }

  clear(): this {
    this.n = 0;
    return this;
  }

  add(p: THREE.Vector3, color: THREE.Color): this {
    if ((this.n + 1) * 3 > this.pos.length) return this;
    this.pos.set([p.x, p.y, p.z], this.n * 3);
    this.col.set([color.r, color.g, color.b], this.n * 3);
    this.n++;
    return this;
  }

  commit(): void {
    const geo = this.object.geometry;
    geo.setDrawRange(0, this.n);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/**
 * The ecliptic grid: rings every 10 Mkm and a spoke every 30°, fading with distance from the sun.
 * It is the height reference that bodies and ticks drop hairlines onto.
 */
export function eclipticGrid(maxR: number, material?: THREE.Material): THREE.LineSegments {
  const lines = new Lines(2000, 1, material);
  const c = new THREE.Color();
  const fade = (r: number) => c.setHex(INK.steel).multiplyScalar(0.55 * Math.pow(1 - r / (maxR * 1.15), 1.4));
  for (let r = 10; r <= maxR; r += 10) {
    const segs = Math.max(48, Math.round(r * 2));
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      lines.add(new THREE.Vector3(r * Math.cos(a0), 0, r * Math.sin(a0)), new THREE.Vector3(r * Math.cos(a1), 0, r * Math.sin(a1)), fade(r));
    }
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    for (let r = 4; r < maxR; r += 4) {
      lines.add(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)), new THREE.Vector3((r + 4) * Math.cos(a), 0, (r + 4) * Math.sin(a)), fade(r + 2).multiplyScalar(0.6));
    }
  }
  lines.commit();
  return lines.object;
}

/** A closed orbit as a hairline loop. */
export function orbitLoop(orbit: Orbit, color: number, brightness: number, material?: THREE.Material): THREE.LineSegments {
  const lines = new Lines(256, 2, material);
  const c = new THREE.Color(color).multiplyScalar(brightness);
  const period = (Math.PI * 2) / orbit.rate;
  let prev = toV3(orbitAt(orbit, 0));
  for (let i = 1; i <= 240; i++) {
    const p = toV3(orbitAt(orbit, (i / 240) * period));
    lines.add(prev, p, c);
    prev = p;
  }
  lines.commit();
  return lines.object;
}
