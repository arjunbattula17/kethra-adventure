import * as THREE from 'three';

/**
 * The Wren's power, in three stages (docs/DESIGN.md §2, "The Wren (inside)"):
 * - emergency: from the white sky until navigation boots. The room is dark, lamps and screens are
 *   down, and the deck strips burn the Wren's lamp amber, low.
 * - navigation: after the boot and the plot. The screens are up (the cool fill), the room is low.
 * - full: after First light, the rig as built.
 *
 * Rather than tag hundreds of parts, the stage sorts what the room holds by what it is, once the
 * room is built: room light (the global rig, and the faint self-glow that stands in for bounce),
 * practicals (warm lamps, their pools and halos), screens (cool emissives and the console wash), and
 * the deck strips. Alarms, a fault bulb that runs its own flicker and the view outside keep their
 * own light (ctx.ownLight).
 */
export type PowerStage = 'emergency' | 'navigation' | 'full';
type Role = 'room' | 'practical' | 'screen' | 'strip';

const LEVELS: Record<PowerStage, Record<Role, number>> = {
  emergency: { room: 0.3, practical: 0.12, screen: 0.1, strip: 1.4 },
  navigation: { room: 0.45, practical: 0.3, screen: 1, strip: 1 },
  full: { room: 1, practical: 1, screen: 1, strip: 1 },
};
/** The emergency strips' colour: the Wren's lamp amber. */
const EMERGENCY_AMBER = new THREE.Color(0xd98a2e);

export function powerStageFor(hasFlag: (flag: string) => boolean): PowerStage {
  // First light doesn't exist until M2; until then, the first departure stands in for it.
  if (hasFlag('first_light') || hasFlag('left_wren')) return 'full';
  if (hasFlag('tutorial_battle_complete')) return 'navigation';
  return 'emergency';
}

interface Entry {
  role: Role;
  apply(k: number, stage: PowerStage): void;
}

const _c = new THREE.Color();
const isCool = (c: THREE.Color) => c.b > c.r * 1.05;
const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export class ShipPower {
  private entries: Entry[] = [];
  stage: PowerStage = 'full';

  /** Reads everything's current value as full power. Call once the room is built and settled. */
  collect(scene: THREE.Scene, ownLight: Set<object>, strips: THREE.MeshStandardMaterial[]): void {
    const envBase = scene.environmentIntensity;
    this.entries.push({ role: 'room', apply: (k) => (scene.environmentIntensity = envBase * k) });

    const stripSet = new Set<THREE.Material>(strips);
    for (const mat of strips) {
      const base = mat.emissiveIntensity;
      const color = mat.emissive.clone();
      this.entries.push({
        role: 'strip',
        apply: (k, stage) => {
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
        if ((light as THREE.PointLight).isPointLight || (light as THREE.SpotLight).isSpotLight) role = isCool(light.color) ? 'screen' : 'practical';
        this.entries.push({ role, apply: (k) => (light.intensity = base * k) });
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
      // A screen glows white through its map; anything else by its colour. A faint glow is the
      // stand-in for bounce light, so it follows the room.
      const white = std.emissive.r > 0.95 && std.emissive.g > 0.95 && std.emissive.b > 0.95;
      const role: Role = glow < 0.15 ? 'room' : (std.emissiveMap && white) || isCool(std.emissive) ? 'screen' : 'practical';
      return { role, apply: (k) => (std.emissiveIntensity = base * k) };
    }
    const basic = mat as THREE.MeshBasicMaterial;
    // Painted light (pools, halos, cones): additive, so dimming its colour dims the light.
    if ((basic.isMeshBasicMaterial || (mat as THREE.SpriteMaterial).isSpriteMaterial) && mat.blending === THREE.AdditiveBlending && !mat.vertexColors) {
      const base = basic.color.clone();
      if (base.r > 0.8 && base.g < 0.45 && base.b < 0.45) return null; // alarm red reports, it isn't lighting
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
}
