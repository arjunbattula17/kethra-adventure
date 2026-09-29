import * as THREE from 'three';

/**
 * Ship interior power stages. Instead of tagging parts, collect() sorts the built room's lights and
 * emissive materials into roles (room, practical, screen, strip), and each stage scales each role.
 * Anything in ctx.ownLight keeps its own light.
 */
export type PowerStage = 'emergency' | 'navigation' | 'full';
type Role = 'room' | 'practical' | 'screen' | 'strip';

const LEVELS: Record<PowerStage, Record<Role, number>> = {
  emergency: { room: 0.3, practical: 0.12, screen: 0.1, strip: 1.4 },
  navigation: { room: 0.45, practical: 0.3, screen: 1, strip: 1 },
  full: { room: 1, practical: 1, screen: 1, strip: 1 },
};
/** Deck strip colour in the emergency stage. */
const EMERGENCY_AMBER = new THREE.Color(0xd98a2e);

export function powerStageFor(hasFlag: (flag: string) => boolean): PowerStage {
  // Debug jumps set left_wren without first_light, so either flag means full power.
  if (hasFlag('first_light') || hasFlag('left_wren')) return 'full';
  if (hasFlag('tutorial_battle_complete')) return 'navigation';
  return 'emergency';
}

interface Entry {
  role: Role;
  /** World z, set for point and spot lights so setWave() switches them as the front passes. */
  z?: number;
  apply(k: number, stage: PowerStage): void;
}

/** World z range of the power wave, from the stern (aft, +z) to the helm (fore, -z). */
export const WAVE_AFT = 7.5;
export const WAVE_FORE = -5.5;

interface StripWave {
  uFront: { value: number };
  uWave: { value: number };
  uFrom: { value: THREE.Color };
  uTo: { value: THREE.Color };
}

const _c = new THREE.Color();
const isCool = (c: THREE.Color) => c.b > c.r * 1.05;
const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export class ShipPower {
  private entries: Entry[] = [];
  private strips: { mat: THREE.MeshStandardMaterial; base: number; color: THREE.Color; wave: StripWave }[] = [];
  stage: PowerStage = 'full';

  /** Reads everything's current value as full power. Call once the room is built and settled. */
  collect(scene: THREE.Scene, ownLight: Set<object>, strips: THREE.MeshStandardMaterial[]): void {
    const envBase = scene.environmentIntensity;
    this.entries.push({ role: 'room', apply: (k) => (scene.environmentIntensity = envBase * k) });

    const stripSet = new Set<THREE.Material>(strips);
    for (const mat of strips) {
      const base = mat.emissiveIntensity;
      const color = mat.emissive.clone();
      // The strips are merged into a few meshes, so the power wave switches them per pixel.
      const wave: StripWave = { uFront: { value: WAVE_AFT }, uWave: { value: 0 }, uFrom: { value: new THREE.Color() }, uTo: { value: new THREE.Color() } };
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, wave);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vPowerZ;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvPowerZ = (modelMatrix * vec4(transformed, 1.0)).z;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uFront;\nuniform float uWave;\nuniform vec3 uFrom;\nuniform vec3 uTo;\nvarying float vPowerZ;')
          .replace(
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\nif (uWave > 0.5) totalEmissiveRadiance = mix(uFrom, uTo, smoothstep(uFront - 0.8, uFront + 0.8, vPowerZ));',
          );
      };
      mat.customProgramCacheKey = () => 'ship-power-strip';
      mat.needsUpdate = true;
      this.strips.push({ mat, base, color, wave });
      this.entries.push({
        role: 'strip',
        apply: (k, stage) => {
          wave.uWave.value = 0;
          mat.emissive.copy(stage === 'emergency' ? EMERGENCY_AMBER : color);
          mat.emissiveIntensity = base * k;
        },
      });
    }

    const seen = new Set<object>();
    scene.traverse((obj) => {
      if (ownLight.has(obj)) return;
      const light = obj as THREE.Light;
      if (light.isLight) {
        const base = light.intensity;
        let role: Role = 'room';
        let z: number | undefined;
        if ((light as THREE.PointLight).isPointLight || (light as THREE.SpotLight).isSpotLight) {
          role = isCool(light.color) ? 'screen' : 'practical';
          z = light.getWorldPosition(new THREE.Vector3()).z;
        }
        this.entries.push({ role, z, apply: (k) => (light.intensity = base * k) });
        return;
      }
      const material = (obj as THREE.Mesh).material;
      if (!material) return;
      for (const mat of Array.isArray(material) ? material : [material]) {
        if (seen.has(mat) || ownLight.has(mat) || stripSet.has(mat)) continue;
        seen.add(mat);
        const entry = this.classify(mat);
        if (entry) this.entries.push(entry);
      }
    });
  }

  private classify(mat: THREE.Material): Entry | null {
    const std = mat as THREE.MeshStandardMaterial;
    if (std.isMeshStandardMaterial) {
      const base = std.emissiveIntensity;
      const glow = luminance(std.emissive) * base;
      if (glow <= 0) return null;
      // Screens glow white through their emissive map; anything else glows by colour. Faint glows
      // stand in for bounce light, so they follow the room level.
      const white = std.emissive.r > 0.95 && std.emissive.g > 0.95 && std.emissive.b > 0.95;
      const role: Role = glow < 0.15 ? 'room' : (std.emissiveMap && white) || isCool(std.emissive) ? 'screen' : 'practical';
      return { role, apply: (k) => (std.emissiveIntensity = base * k) };
    }
    const basic = mat as THREE.MeshBasicMaterial;
    // Painted light (pools, halos, cones): additive, so dimming its colour dims the light.
    if ((basic.isMeshBasicMaterial || (mat as THREE.SpriteMaterial).isSpriteMaterial) && mat.blending === THREE.AdditiveBlending && !mat.vertexColors) {
      const base = basic.color.clone();
      if (base.r > 0.8 && base.g < 0.45 && base.b < 0.45) return null; // Alarm red is a status indicator, not lighting.
      const role: Role = isCool(base) ? 'screen' : 'practical';
      return { role, apply: (k) => basic.color.copy(_c.copy(base).multiplyScalar(k)) };
    }
    // The batched glow sprites (spriteBatch.ts) carry their opacity as a uniform.
    const shader = mat as THREE.ShaderMaterial;
    const opacity = shader.isShaderMaterial ? (shader.uniforms?.opacity as { value: number } | undefined) : undefined;
    if (opacity && shader.blending === THREE.AdditiveBlending) {
      const base = opacity.value;
      return { role: 'practical', apply: (k) => (opacity.value = base * k) };
    }
    return null;
  }

  apply(stage: PowerStage): void {
    this.stage = stage;
    const levels = LEVELS[stage];
    for (const e of this.entries) e.apply(levels[e.role], stage);
  }

  /**
   * Power wave from stage `from` to `to` with its front at world z `front`, running stern to helm.
   * Point lights switch as the front passes them, deck strips switch per pixel, and everything else
   * follows the wave's overall progress.
   */
  setWave(front: number, from: PowerStage, to: PowerStage): void {
    const a = LEVELS[from];
    const b = LEVELS[to];
    const progress = THREE.MathUtils.clamp((WAVE_AFT - front) / (WAVE_AFT - WAVE_FORE), 0, 1);
    for (const e of this.entries) {
      if (e.role === 'strip') continue;
      const k = e.z === undefined ? progress : THREE.MathUtils.smoothstep(e.z, front - 1, front + 1);
      e.apply(THREE.MathUtils.lerp(a[e.role], b[e.role], k), k < 0.5 ? from : to);
    }
    for (const s of this.strips) {
      s.wave.uWave.value = 1;
      s.wave.uFront.value = front;
      s.wave.uFrom.value.copy(from === 'emergency' ? EMERGENCY_AMBER : s.color).multiplyScalar(s.base * a.strip);
      s.wave.uTo.value.copy(to === 'emergency' ? EMERGENCY_AMBER : s.color).multiplyScalar(s.base * b.strip);
    }
    this.stage = progress >= 1 ? to : from;
  }
}
