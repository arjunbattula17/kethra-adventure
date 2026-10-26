import * as THREE from 'three';

/**
 * Kethra's pool surface. The grove stands in still water (docs/PROGRESS.md), and a flat dark
 * material read as a grey floor rather than as water. This keeps the same plane and the same lit
 * material and adds the three things that make a surface read as water at night: slow crossing
 * swells in the normal, so the moon's sheen breaks up and moves; the sky's colour at grazing angles;
 * and shallows that lighten toward teal around everything standing in it.
 *
 * The technique follows the usual real-time water recipe (summed directional waves, a depth tint, a
 * Fresnel term) but is written for this scene: no refraction or depth pass, and the waves only bend
 * the normal, because the surface is also the fall-reset plane and has to stay flat.
 */

/** Something standing in the pool: a box of half-extents hx by hz, or a disc of radius hx. */
export interface ShoreShape {
  x: number;
  z: number;
  hx: number;
  hz?: number;
}

/** The square of world the shore mask covers: the walkable grove and the banks around it. */
const FRAME = { x: 0, z: -8, half: 64 };
const MASK_SIZE = 512;
/** How far the shallows reach out from a shore, in metres. */
const REACH = 3.2;

export interface PoolWater {
  /** Redraws the shallows around the given shapes. */
  setShores(shapes: ShoreShape[]): void;
  update(time: number): void;
  dispose(): void;
}

/** Patches the pool's material in place. Call before addWake, which chains this patch. */
export function makePoolWater(mat: THREE.MeshStandardMaterial): PoolWater {
  const canvas = document.createElement('canvas');
  canvas.width = MASK_SIZE;
  canvas.height = MASK_SIZE;
  const mask = new THREE.CanvasTexture(canvas);
  mask.colorSpace = THREE.NoColorSpace;
  // Rows are drawn with z growing down the canvas and sampled with v growing with z: unflipped, or
  // every shallow lands mirrored about the frame's centre line.
  mask.flipY = false;

  const uniforms = {
    uPoolTime: { value: 0 },
    uPoolShore: { value: mask },
    uPoolFrame: { value: new THREE.Vector3(FRAME.x, FRAME.z, 1 / (2 * FRAME.half)) },
    uPoolShallow: { value: new THREE.Color(0x0a2c2a) },
    uPoolSky: { value: new THREE.Color(0x1d3348) },
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPoolWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPoolWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPoolWorld;
        uniform float uPoolTime;
        uniform sampler2D uPoolShore;
        uniform vec3 uPoolFrame;
        uniform vec3 uPoolShallow;
        uniform vec3 uPoolSky;
        // Slope of five low swells crossing at different headings, as (dh/dx, dh/dz).
        vec2 poolSlope(vec2 p, float t) {
          p += 0.35 * sin(p.yx * 0.31 + t * 0.11);
          vec2 s = vec2(0.0);
          vec2 d = vec2(0.92, 0.39);
          s += d * (0.050 * cos(dot(d, p) * 1.9 + t * 0.55));
          d = vec2(-0.47, 0.88);
          s += d * (0.045 * cos(dot(d, p) * 3.1 - t * 0.72));
          d = vec2(0.26, -0.97);
          s += d * (0.040 * cos(dot(d, p) * 5.3 + t * 0.93));
          d = vec2(-0.83, -0.56);
          s += d * (0.030 * cos(dot(d, p) * 8.7 + t * 1.21));
          d = vec2(0.71, 0.70);
          s += d * (0.022 * cos(dot(d, p) * 14.0 - t * 1.6));
          return s;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float poolShore = texture2D(uPoolShore, (vPoolWorld.xz - uPoolFrame.xy) * uPoolFrame.z + 0.5).r;
        diffuseColor.rgb = mix(diffuseColor.rgb, uPoolShallow, poolShore * poolShore * 0.8);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // The surface is level, so its world normal is the swell's slope alone. The swells calm with
        // distance, where they would only shimmer.
        vec2 poolTilt = poolSlope(vPoolWorld.xz, uPoolTime) / (1.0 + dot(vViewPosition, vViewPosition) * 0.002);
        normal = normalize((viewMatrix * vec4(normalize(vec3(-poolTilt.x, 1.0, -poolTilt.y)), 0.0)).xyz);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float poolGraze = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += uPoolSky * (poolGraze * poolGraze * poolGraze);`,
      );
  };
  mat.customProgramCacheKey = () => 'kethra-pool';
  mat.needsUpdate = true;

  return {
    setShores(shapes) {
      const ctx = canvas.getContext('2d')!;
      const scale = MASK_SIZE / (2 * FRAME.half);
      const px = (x: number) => (x - FRAME.x + FRAME.half) * scale;
      const pz = (z: number) => (z - FRAME.z + FRAME.half) * scale;
      ctx.filter = 'none';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
      // Each footprint is drawn white, grown by half the reach, then blurred by a quarter of it: that
      // leaves full strength at the waterline, half at REACH / 2 and nothing by REACH.
      const grow = REACH / 2;
      ctx.filter = `blur(${(REACH / 4) * scale}px)`;
      ctx.fillStyle = '#fff';
      for (const s of shapes) {
        ctx.beginPath();
        if (s.hz === undefined) ctx.arc(px(s.x), pz(s.z), (s.hx + grow) * scale, 0, Math.PI * 2);
        else ctx.rect(px(s.x - s.hx - grow), pz(s.z - s.hz - grow), (s.hx + grow) * 2 * scale, (s.hz + grow) * 2 * scale);
        ctx.fill();
      }
      mask.needsUpdate = true;
    },
    update(time) {
      uniforms.uPoolTime.value = time;
    },
    dispose() {
      mask.dispose();
    },
  };
}
