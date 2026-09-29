import * as THREE from 'three';
import { blackbody } from './spaceSky';

/**
 * The system's star for space scenes: a limb-darkened photosphere, a static corona, and a 5800 K
 * directional key light.
 */
export interface Sun {
  /** Position this; the disc and corona are centred on it. */
  group: THREE.Group;
  /** Sun-coloured directional key light. Place it and its target, and add both to the scene. */
  light: THREE.DirectionalLight;
  /** Keeps the corona facing the camera and drifts the granulation. */
  update(camera: THREE.Camera, dt: number): void;
}

const CORONA_SPAN = 7;

const coronaVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const coronaFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  uniform float uDisc;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    // Streamers: a few broad lobes, longer and shorter, so the outer glow isn't a perfect disc
    // without turning into a starburst.
    float lobes = 0.86 + 0.08 * sin(a * 3.0 + 1.3) + 0.04 * sin(a * 5.0 + 0.4) + 0.02 * sin(a * 9.0 + 2.1);
    float x = max(r - uDisc, 0.0);
    vec3 col = uInner * exp(-x * 22.0) * 0.7 + uOuter * exp(-x * 5.0 / lobes) * 0.3;
    col *= smoothstep(1.0, 0.75, r);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildSun(opts: { radius: number }): Sun {
  const group = new THREE.Group();
  group.name = 'sun';

  // A real photospheric surface (granulation and active regions, from Solar System Scope via
  // tools/prep-planet-textures.mjs) with limb darkening toward the edge.
  const surface = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/planets/sun.jpg`) },
      uDrift: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      uniform float uDrift;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec3 base = texture2D(uMap, vec2(vUv.x + uDrift, vUv.y)).rgb;
        // Limb darkening: a real star is dimmer and redder at its edge because the line of sight
        // there exits the photosphere at a shallower depth.
        float mu = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
        float limb = 0.42 + 0.58 * pow(mu, 0.55);
        vec3 color = base * limb;
        color.b *= mix(0.72, 1.0, mu);
        gl_FragColor = vec4(color * 1.35, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const disc = new THREE.Mesh(new THREE.SphereGeometry(opts.radius, 48, 32), surface);
  group.add(disc);

  const white = blackbody(5800, new THREE.Color());
  const corona = new THREE.Mesh(
    new THREE.PlaneGeometry(opts.radius * CORONA_SPAN * 2, opts.radius * CORONA_SPAN * 2),
    new THREE.ShaderMaterial({
      uniforms: {
        uInner: { value: white.clone().multiplyScalar(1.1) },
        uOuter: { value: new THREE.Color(0xffb870) },
        uDisc: { value: 1 / CORONA_SPAN },
      },
      vertexShader: coronaVertex,
      fragmentShader: coronaFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(corona);

  const light = new THREE.DirectionalLight(white, 3.2);

  return {
    group,
    light,
    update(camera, dt) {
      corona.quaternion.copy(camera.quaternion);
      // Slow UV drift so the surface texture doesn't look static.
      surface.uniforms.uDrift.value += dt * 0.004;
    },
  };
}
