import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';

/**
 * The title's light effects, each one draw: the sun rising over Kethra's limb (a core the planet can
 * hide, and the lens's rays and streak on top), three faint lens ghosts, an occasional meteor, the
 * near-field dust drifting past the camera, and the black veil the scene leaves through.
 *
 * Screen-space pieces are placed in clip space by their vertex shaders, so they cost one quad each and
 * nothing on the CPU beyond a few uniforms.
 */

const clipQuad = () => new THREE.PlaneGeometry(2, 2);

const GLARE_VERTEX = /* glsl */ `
  uniform vec2 uCenter;
  uniform float uAspect;
  uniform float uSize;
  uniform float uDepth;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = vec4(uCenter + position.xy * vec2(uSize / uAspect, uSize), uDepth, 1.0);
  }
`;

/** The sun's disc and its inner bloom. Depth-tested at the sky's depth, so the limb can cut it. */
const CORE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float k = exp(-r * r * 2200.0) * 7.0 + exp(-r * 70.0) * 1.3 + exp(-r * 14.0) * 0.28;
    k *= smoothstep(1.0, 0.6, r);
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * k * uIntensity, 1.0);
  }
`;

/** What the lens adds on top of everything: thin rays, a horizontal streak and a wide warm haze. */
const LENS_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float a = atan(vP.y, vP.x);
    float breathe = 0.92 + 0.08 * sin(uTime * 0.7);
    float rays = pow(abs(cos(a * 3.0 + 0.35)), 110.0) * exp(-r * 7.0) * 0.3;
    rays += pow(abs(cos(a * 5.0 + 1.2)), 160.0) * exp(-r * 10.0) * 0.16;
    float streak = exp(-abs(vP.y) * 130.0) * exp(-abs(vP.x) * 2.6) * 0.32;
    float haze = exp(-r * 3.6) * 0.09;
    vec3 col = vec3(1.0, 0.8, 0.56) * (rays * breathe + haze) + vec3(0.62, 0.82, 1.0) * streak;
    col *= smoothstep(1.0, 0.55, r);
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }
`;

const GHOST_VERTEX = /* glsl */ `
  attribute vec2 aCorner;
  attribute float aAlong;
  attribute float aSize;
  attribute vec3 aTint;
  uniform vec2 uSun;
  uniform float uAspect;
  varying vec2 vCorner;
  varying vec3 vTint;
  void main() {
    vCorner = aCorner;
    vTint = aTint;
    vec2 c = uSun + (-uSun) * aAlong * 2.0;
    gl_Position = vec4(c + aCorner * vec2(aSize / uAspect, aSize), 0.0, 1.0);
  }
`;

const GHOST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uIntensity;
  varying vec2 vCorner;
  varying vec3 vTint;
  void main() {
    // A soft hexagon, like an aperture's ghost.
    vec2 p = abs(vCorner);
    float hex = max(p.x * 0.866 + p.y * 0.5, p.y);
    float k = smoothstep(1.0, 0.82, hex) * (0.35 + 0.65 * smoothstep(0.2, 0.95, hex));
    gl_FragColor = vec4(vTint * k * uIntensity, 1.0);
  }
`;

const METEOR_VERTEX = /* glsl */ `
  uniform vec2 uHead;
  uniform vec2 uDir;
  uniform float uLength;
  uniform float uWidth;
  uniform float uAspect;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    vec2 side = vec2(-uDir.y, uDir.x);
    // x: 1 at the head, -1 at the tail; y across.
    vec2 p = uHead - uDir * (1.0 - position.x) * 0.5 * uLength + side * position.y * uWidth;
    p.x /= uAspect;
    gl_Position = vec4(p, 0.99999, 1.0);
  }
`;

const METEOR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    // along: 0 at the tail, 1 at the head; vP.y across, -1..1. Clamped: MSAA samples the varying past
    // the quad's ends, and pow() of a negative is NaN, which High's bloom spread over the whole title.
    float along = clamp(vP.x * 0.5 + 0.5, 0.0, 1.0);
    float y2 = vP.y * vP.y;
    // The quad is about twice as wide as the streak, so its glow has room to spread past the core.
    // The trail: a crisp white core (pushed well past 1 so the title's grade, its highlight shoulder,
    // holds it at full white) in a soft blue glow kept below white, fading toward the tail.
    float tail = pow(along, 1.8);
    vec3 col = (vec3(1.0) * exp(-y2 * 60.0) * 0.7 + vec3(0.7, 0.85, 1.0) * exp(-y2 * 14.0) * 0.08) * tail;
    // The head: a short white point no wider than the core, in a glow drawn out along the streak rather
    // than round (a round, wide halo bloomed into a ball), so the tip glows.
    float h = 1.0 - along;
    col += vec3(1.0) * exp(-h * h * 3000.0 - y2 * 80.0) * 1.0;
    col += vec3(0.85, 0.93, 1.0) * exp(-h * h * 250.0 - y2 * 10.0) * 0.35;
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }
`;

const DUST_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform vec3 uStream;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxSize;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec3 p = mod(position + uStream * uTime - uBoxMin, uBoxSize) + uBoxMin;
    vec3 e = min(p - uBoxMin, uBoxMin + uBoxSize - p) / uBoxSize;
    float edge = smoothstep(0.0, 0.12, min(min(e.x, e.y), e.z));
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    vAlpha = edge * (0.35 + 0.65 * aSeed) * smoothstep(1.5, 4.0, dist);
    gl_PointSize = clamp((14.0 + 22.0 * aSeed) / dist, 1.0, 6.0) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uIntensity;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float k = exp(-r * r * 4.0) * smoothstep(1.0, 0.7, r);
    gl_FragColor = vec4(vec3(0.62, 0.78, 0.92) * k * vAlpha * uIntensity, 1.0);
  }
`;

const VEIL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity);
  }
`;

export interface SkyFx {
  group: THREE.Group;
  /** Places the sun glare at a world direction (seen from the camera), 0..1 strength. */
  update(camera: THREE.PerspectiveCamera, dt: number, elapsed: number): void;
  setGlare(k: number): void;
  setDust(k: number): void;
  setVeil(k: number): void;
  /** Turns the shooting stars on or off (off under reduced motion). */
  setMeteors(on: boolean): void;
  dispose(): void;
}

export interface SkyFxOptions {
  /** Direction toward the sun as seen (the glare's place). */
  sunDir: THREE.Vector3;
  /** Distance the sun is placed at for projecting it: beyond every planet, inside the far plane. */
  coreDistance: number;
  /** Near-field dust: count, the box it fills, and the direction it streams. */
  dust: { count: number; boxMin: THREE.Vector3; boxSize: THREE.Vector3; stream: THREE.Vector3 };
  meteors: MeteorOptions;
}

/** Shooting stars: where they start, which way they fall, how often, and how they look. */
export interface MeteorOptions {
  /** Clip-space rectangle they start in ([x0, y0, x1, y1], -1..1). */
  area: [number, number, number, number];
  /** Heading range, radians, on screen (0 rightward, PI leftward; up positive). */
  heading: [number, number];
  /** Seconds before the first one, and between later ones ([min, max]). */
  first: number;
  every: [number, number];
  /** Seconds one takes to cross, and how far its head travels (clip units, aspect-corrected). */
  seconds: number;
  travel: number;
  /** Trail length range, and the half-width of the strip it is drawn in (clip units; the streak itself is narrower, its glow spreads to the edge). */
  length: [number, number];
  width: number;
  /** Peak brightness. */
  brightness: number;
}

export function buildSkyFx(o: SkyFxOptions): SkyFx {
  const group = new THREE.Group();
  group.name = 'title-sky-fx';
  const aspect = { value: 16 / 9 };
  const sunNdc = new THREE.Vector2();
  const glareCenter = { value: sunNdc };
  const glare = { value: 0 };
  const time = { value: 0 };
  // The core's clip depth is the sun's own, far beyond the planet's limb, so the limb can cut it.
  const coreDepth = { value: 0.9999 };

  const coreMat = new THREE.ShaderMaterial({
    vertexShader: GLARE_VERTEX,
    fragmentShader: CORE_FRAGMENT,
    uniforms: { uCenter: glareCenter, uAspect: aspect, uSize: { value: 0.5 }, uDepth: coreDepth, uIntensity: glare },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(clipQuad(), coreMat);
  core.frustumCulled = false;
  core.renderOrder = 20;
  group.add(core);

  const lensMat = new THREE.ShaderMaterial({
    vertexShader: GLARE_VERTEX,
    fragmentShader: LENS_FRAGMENT,
    uniforms: { uCenter: glareCenter, uAspect: aspect, uSize: { value: 0.95 }, uDepth: { value: 0 }, uIntensity: glare, uTime: time },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const lens = new THREE.Mesh(clipQuad(), lensMat);
  lens.frustumCulled = false;
  lens.renderOrder = 900;
  group.add(lens);

  // Ghosts along the line from the sun through the frame's centre, kept on the near side of the
  // centre so none lands on the menu.
  const ghostSpec: [number, number, [number, number, number]][] = [
    [0.22, 0.035, [0.25, 0.55, 0.6]],
    [0.42, 0.06, [0.5, 0.42, 0.25]],
    [0.62, 0.022, [0.3, 0.6, 0.9]],
  ];
  const gPos: number[] = [];
  const gCorner: number[] = [];
  const gAlong: number[] = [];
  const gSize: number[] = [];
  const gTint: number[] = [];
  const gIndex: number[] = [];
  ghostSpec.forEach(([along, size, tint], i) => {
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      gPos.push(0, 0, 0);
      gCorner.push(x, y);
      gAlong.push(along);
      gSize.push(size);
      gTint.push(...tint);
    }
    gIndex.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const ghostGeo = new THREE.BufferGeometry();
  ghostGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
  ghostGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(gCorner, 2));
  ghostGeo.setAttribute('aAlong', new THREE.Float32BufferAttribute(gAlong, 1));
  ghostGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(gSize, 1));
  ghostGeo.setAttribute('aTint', new THREE.Float32BufferAttribute(gTint, 3));
  ghostGeo.setIndex(gIndex);
  const ghostIntensity = { value: 0 };
  const ghosts = new THREE.Mesh(
    ghostGeo,
    new THREE.ShaderMaterial({
      vertexShader: GHOST_VERTEX,
      fragmentShader: GHOST_FRAGMENT,
      uniforms: { uSun: glareCenter, uAspect: aspect, uIntensity: ghostIntensity },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ghosts.frustumCulled = false;
  ghosts.renderOrder = 901;
  group.add(ghosts);

  // Meteor: one quad, re-aimed each time.
  const meteorU = {
    uHead: { value: new THREE.Vector2() },
    uDir: { value: new THREE.Vector2(-0.8, -0.6) },
    uLength: { value: 0.22 },
    uWidth: { value: o.meteors.width },
    uAspect: aspect,
    uIntensity: { value: 0 },
  };
  const meteor = new THREE.Mesh(
    clipQuad(),
    new THREE.ShaderMaterial({ vertexShader: METEOR_VERTEX, fragmentShader: METEOR_FRAGMENT, uniforms: meteorU, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  meteor.frustumCulled = false;
  // Drawn with the sky, before the planets, which then cover it: meteors belong to the far sky.
  meteor.renderOrder = -998;
  meteor.visible = false;
  group.add(meteor);
  const rand = mulberry32(0x3e7e0);
  let meteorsOn = true;
  const m = o.meteors;
  let nextMeteor = m.first;
  let meteorT = -1;
  const meteorStart = new THREE.Vector2();

  // Dust.
  const dustPos = new Float32Array(o.dust.count * 3);
  const dustSeed = new Float32Array(o.dust.count);
  for (let i = 0; i < o.dust.count; i++) {
    dustPos[i * 3] = o.dust.boxMin.x + rand() * o.dust.boxSize.x;
    dustPos[i * 3 + 1] = o.dust.boxMin.y + rand() * o.dust.boxSize.y;
    dustPos[i * 3 + 2] = o.dust.boxMin.z + rand() * o.dust.boxSize.z;
    dustSeed[i] = rand();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeed, 1));
  const dustIntensity = { value: 0 };
  const pixelRatio = { value: 1 };
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      uniforms: { uTime: time, uStream: { value: o.dust.stream }, uBoxMin: { value: o.dust.boxMin }, uBoxSize: { value: o.dust.boxSize }, uPixelRatio: pixelRatio, uIntensity: dustIntensity },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  dust.frustumCulled = false;
  dust.renderOrder = 10;
  dust.onBeforeRender = (r) => {
    pixelRatio.value = r.getPixelRatio();
  };
  group.add(dust);

  const veilOpacity = { value: 0 };
  const veil = new THREE.Mesh(
    clipQuad(),
    new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: VEIL_FRAGMENT,
      uniforms: { uOpacity: veilOpacity },
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  veil.frustumCulled = false;
  veil.renderOrder = 10000;
  veil.visible = false;
  group.add(veil);

  const sunWorld = new THREE.Vector3();
  const projected = new THREE.Vector3();
  return {
    group,
    update(camera, dt, elapsed) {
      time.value = elapsed;
      aspect.value = camera.aspect;
      sunWorld.copy(o.sunDir).multiplyScalar(o.coreDistance).add(camera.position);
      projected.copy(sunWorld).project(camera);
      sunNdc.set(projected.x, projected.y);
      coreDepth.value = Math.min(projected.z, 0.99999);
      // Shooting stars (MeteorOptions): one at a time, each brightening and fading as it crosses.
      if (meteorT >= 0) {
        meteorT += dt;
        const life = meteorT / m.seconds;
        if (life >= 1) {
          meteorT = -1;
          meteor.visible = false;
          nextMeteor = m.every[0] + rand() * (m.every[1] - m.every[0]);
        } else {
          meteorU.uHead.value.copy(meteorU.uDir.value).multiplyScalar(life * m.travel).add(meteorStart);
          meteorU.uIntensity.value = Math.sin(Math.PI * life) * m.brightness;
        }
      } else if (meteorsOn && (nextMeteor -= dt) <= 0) {
        const [x0, y0, x1, y1] = m.area;
        // The meteor shader works in aspect-corrected units (x spans -aspect..aspect).
        meteorStart.set((x0 + rand() * (x1 - x0)) * aspect.value, y0 + rand() * (y1 - y0));
        const a = m.heading[0] + rand() * (m.heading[1] - m.heading[0]);
        meteorU.uDir.value.set(Math.cos(a), Math.sin(a));
        meteorU.uLength.value = m.length[0] + rand() * (m.length[1] - m.length[0]);
        meteorT = 0;
        meteor.visible = true;
      }
    },
    setGlare(k) {
      glare.value = k;
      ghostIntensity.value = k * 0.05;
      // No glare, no draws: the sun can be hidden (the ringworld title keeps it behind the planet).
      core.visible = lens.visible = ghosts.visible = k > 0;
    },
    setDust(k) {
      dustIntensity.value = k;
    },
    setVeil(k) {
      veilOpacity.value = k;
      veil.visible = k > 0;
    },
    setMeteors(on) {
      meteorsOn = on;
    },
    dispose() {
      group.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
    },
  };
}
