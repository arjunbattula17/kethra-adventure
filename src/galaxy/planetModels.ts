import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Real NASA VTAD glTF models (public domain — see public/models/CREDITS.md), re-encoded by
// tools/prep-planet-models.mjs to swap their embedded 4096x3072 PNGs for downscaled JPEGs. Mapped
// onto this game's own fictional planets (see planetData.ts) rather than used as literal
// Saturn/Venus/Jupiter/Earth — tintColor below nudges each toward that planet's established
// in-fiction color so the model reads as Kethra/Vessek/Orrun/Isilthe, not a real solar-system body.
const MODEL_URLS: Record<string, string> = {
  kethra: `${import.meta.env.BASE_URL}models/planets/earth.glb`,
  vessek: `${import.meta.env.BASE_URL}models/planets/saturn.glb`,
  orrun: `${import.meta.env.BASE_URL}models/planets/venus.glb`,
  isilthe: `${import.meta.env.BASE_URL}models/planets/jupiter.glb`,
};

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

function loadTemplate(url: string): Promise<THREE.Object3D> {
  let pending = cache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url).then((gltf) => gltf.scene);
    cache.set(url, pending);
  }
  return pending;
}

/**
 * Loads the real glTF model mapped to `planetId`, scales it so its longest axis is `radius * 2`,
 * recenters it on its own origin, and tints its baked albedo toward `tintColor`. Every call
 * clones the cached template (and its materials) so repeat scene entries — e.g. replaying the
 * intro — don't compound the tint or scale onto an already-mutated shared material.
 */
export async function buildPlanetSurface(planetId: string, radius: number, tintColor: number): Promise<THREE.Object3D> {
  const url = MODEL_URLS[planetId];
  if (!url) throw new Error(`planetModels.ts: no model mapped for planet "${planetId}"`);
  const template = await loadTemplate(url);
  const model = template.clone(true);

  const tint = new THREE.Color(tintColor);
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    mat.color.lerp(tint, 0.4);
    // The scene's sun PointLight decays over the 60-165 unit orbit radii these planets sit at
    // (see GalaxyRevealScene.ts), so real physical falloff leaves this PBR material almost unlit —
    // while the cloud shell wrapped just outside it (planetShader.ts CLOUD_FRAGMENT) fakes a flat
    // 0.3 ambient floor that ignores distance entirely. Mirror that floor here via emissive (reusing
    // the albedo map so terrain detail still reads) so the real surface doesn't go dark relative to
    // its own cloud shell.
    mat.emissiveMap = mat.map;
    mat.emissive = mat.color.clone();
    mat.emissiveIntensity = 0.35;
    mesh.material = mat;
  });

  // Scale/center off the planet BODY only. saturn.glb embeds separate RingsTop/RingsBottom meshes
  // alongside the body — a whole-model Box3 sizes off the much wider ring span instead of the
  // sphere, shrinking the visible body far inside the cloud/atmosphere shells below (which size
  // directly off `radius`, not off this model's own geometry).
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && !/ring/i.test(mesh.name)) box.expandByObject(mesh);
  });
  const size = box.getSize(new THREE.Vector3());
  const scale = (radius * 2) / Math.max(size.x, size.y, size.z, 1e-6);
  model.scale.setScalar(scale);
  model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(scale));

  return model;
}

/** Preloads every mapped model in parallel — call up front so the cinematic doesn't pop them in mid-flight. */
export async function preloadPlanetModels(): Promise<void> {
  await Promise.all(Object.values(MODEL_URLS).map((url) => loadTemplate(url)));
}
