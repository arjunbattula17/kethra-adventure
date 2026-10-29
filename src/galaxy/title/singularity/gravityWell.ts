import * as THREE from 'three';

/**
 * The hole's pull on the title's own geometry: a displacement every patched vertex shader applies to
 * its final position, so rocks, debris, dust, embers and the ship are drawn falling in.
 *
 * It is a field, not a simulation. Distances from the hole are remapped r' = (r^1.5 - K)^(2/3): the
 * ball of radius K^(2/3) has been swallowed, everything outside it has moved in to fill the gap, and nothing
 * overtakes anything (the map is monotonic); the power 1.5 rather than 3 lets far matter move too, not only what is near. Its slope (r / r')^0.5 grows without bound near the hole,
 * so a body is stretched along the line to the hole and squeezed across it as it nears it, which is
 * tidal stretching (spaghettification) for free, per vertex. On top, matter turns about the disk's
 * axis by W * (R0 / (r' + R0))^1.5 (inner matter laps outer matter, winding streams into spirals) and
 * is flattened toward the disk plane as it falls. K, W and the flattening only grow, driven by
 * singularity.ts; at K = W = 0 the shader takes its original path untouched.
 *
 * Vertex shaders that end in `projectionMatrix * viewMatrix * <world>` get the world-space version,
 * those that end in `projectionMatrix * mv` the view-space one (the uniforms carry both frames).
 * Lighting still reads the unbent position, so a falling rock keeps its shading.
 */

export interface GravityWell {
  /** Hole centre and spin axis in world space, and the same in the current view space. */
  readonly uniforms: {
    uWellPos: { value: THREE.Vector3 };
    uWellAxis: { value: THREE.Vector3 };
    uWellPosV: { value: THREE.Vector3 };
    uWellAxisV: { value: THREE.Vector3 };
    /** x: K (swallowed radius to the power 1.5), y: W (swirl, radians at the centre), z: flattening 0..1, w: R0. */
    uWell: { value: THREE.Vector4 };
  };
  /** Patches every ShaderMaterial under `root` whose vertex shader ends in a form it knows. Returns how many. */
  patch(root: THREE.Object3D): number;
  /** Moves the view-space copies to `camera` (after it has been placed for the frame). */
  sync(camera: THREE.Camera): void;
  /** The world-space displacement the shaders apply, for things placed from script (the menu, the ship). */
  displace(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
}

const WELL_GLSL = /* glsl */ `
  uniform vec3 uWellPos;
  uniform vec3 uWellAxis;
  uniform vec3 uWellPosV;
  uniform vec3 uWellAxisV;
  uniform vec4 uWell;
  vec3 bhFall(vec3 p, vec3 c, vec3 ax) {
    vec3 d = p - c;
    float r = length(d);
    float rn = pow(max(r * sqrt(r) - uWell.x, 0.0), 2.0 / 3.0);
    float k = r > 1e-4 ? rn / r : 0.0;
    float h = dot(d, ax);
    vec3 pl = (d - ax * h) * k;
    float a = uWell.y * pow(uWell.w / (rn + uWell.w), 1.5);
    pl = pl * cos(a) + cross(ax, pl) * sin(a);
    return c + pl + ax * (h * k * mix(1.0, k, uWell.z));
  }
  vec4 bhWell(vec4 w) {
    if (uWell.x <= 0.0 && uWell.y == 0.0) return w;
    return vec4(bhFall(w.xyz / w.w, uWellPos, uWellAxis), 1.0);
  }
  vec4 bhWellView(vec4 mv) {
    if (uWell.x <= 0.0 && uWell.y == 0.0) return mv;
    return vec4(bhFall(mv.xyz / mv.w, uWellPosV, uWellAxisV), 1.0);
  }
`;

const WORLD_FORM = /gl_Position\s*=\s*projectionMatrix\s*\*\s*viewMatrix\s*\*\s*([^;]+);/g;
const VIEW_FORM = /gl_Position\s*=\s*projectionMatrix\s*\*\s*(mv)\s*;/g;

export function createGravityWell(): GravityWell {
  const uniforms = {
    uWellPos: { value: new THREE.Vector3() },
    uWellAxis: { value: new THREE.Vector3(0, 1, 0) },
    uWellPosV: { value: new THREE.Vector3() },
    uWellAxisV: { value: new THREE.Vector3(0, 1, 0) },
    uWell: { value: new THREE.Vector4(0, 0, 0, 4) },
  };
  const rot = new THREE.Matrix3();
  const d = new THREE.Vector3();
  const ax = new THREE.Vector3();
  const pl = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  return {
    uniforms,
    patch(root) {
      let n = 0;
      const seen = new Set<THREE.Material>();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const m of mats) {
          if (seen.has(m) || !(m as THREE.ShaderMaterial).isShaderMaterial) continue;
          seen.add(m);
          const sm = m as THREE.ShaderMaterial;
          if (sm.vertexShader.includes('bhWell')) continue;
          const src = sm.vertexShader.replace(WORLD_FORM, 'gl_Position = projectionMatrix * viewMatrix * bhWell($1);').replace(VIEW_FORM, 'gl_Position = projectionMatrix * bhWellView($1);');
          if (src === sm.vertexShader) continue;
          const at = src.indexOf('void main');
          sm.vertexShader = src.slice(0, at) + WELL_GLSL + src.slice(at);
          Object.assign(sm.uniforms, uniforms);
          sm.needsUpdate = true;
          n++;
        }
        // Bent geometry leaves its bounds behind: never culled on them.
        if (mats.some((m) => seen.has(m))) o.frustumCulled = false;
      });
      return n;
    },
    sync(camera) {
      camera.updateMatrixWorld();
      uniforms.uWellPosV.value.copy(uniforms.uWellPos.value).applyMatrix4(camera.matrixWorldInverse);
      rot.setFromMatrix4(camera.matrixWorldInverse);
      uniforms.uWellAxisV.value.copy(uniforms.uWellAxis.value).applyMatrix3(rot).normalize();
    },
    displace(p, out) {
      const w = uniforms.uWell.value;
      if (w.x <= 0 && w.y === 0) return out.copy(p);
      const c = uniforms.uWellPos.value;
      ax.copy(uniforms.uWellAxis.value);
      d.subVectors(p, c);
      const r = d.length();
      const rn = Math.pow(Math.max(r * Math.sqrt(r) - w.x, 0), 2 / 3);
      const k = r > 1e-4 ? rn / r : 0;
      const h = d.dot(ax);
      pl.copy(d).addScaledVector(ax, -h).multiplyScalar(k);
      const a = w.y * Math.pow(w.w / (rn + w.w), 1.5);
      tmp.crossVectors(ax, pl);
      pl.multiplyScalar(Math.cos(a)).addScaledVector(tmp, Math.sin(a));
      return out.copy(c).add(pl).addScaledVector(ax, h * k * (1 + (k - 1) * w.z));
    },
  };
}
