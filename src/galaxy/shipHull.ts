import * as THREE from 'three';

// The player's ship. This used to be kitbashed out of the interior's own wall panels and floor
// tiles, on the theory that no free ship-exterior asset matched this project's PBR look. It did not
// work: renders/space-audit shows a hollow rectangular box, see-through from above and behind, with
// the interior kit's red wall trim reading as painted racing stripes. A kit of room parts cannot
// make a hull, because a hull's whole job is to be a closed, tapered, asymmetric volume.
//
// So this loads a purpose-built freighter instead (public/models/ship/freighter.glb -- "Colored
// Freighter" by Jacques Fourie, CC-BY, see public/models/CREDITS.md). It was picked over fifteen
// other free candidates for one reason: every other free ship in that survey is a single-seat
// fighter, and this game has a walkable ship interior with an airlock, a bunk and a repair console.
// Only a hull with real freighter mass -- a spine, a crew section, cargo racks, four engine pods on
// pylons -- can plausibly contain that interior.
//
// The catch is that it ships as eleven flat, unlit colour slots (candy pink engine rings, yellow
// pylons, white hull) with metalness 0 and roughness 1, which is what makes it read as a toy. Its
// UVs are a Google-Poly palette atlas -- every vertex points at a tiny swatch -- so texture maps
// cannot be applied through them. What it does have is 47k triangles of real greeble geometry, and
// that only ever looked flat because pure-diffuse plastic has no specular response. Re-assigning
// each colour slot to a PBR role below (see RE_MATERIAL) lets the scene's shared environment map do
// the rest.

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Local ship axes: +X nose, -X aft/engines, +Y up, +Z right. */
export interface ShipHull {
  group: THREE.Group;
  /** World-facing exhaust points at the tip of each engine nacelle, in the group's local space. */
  engineLocalPositions: THREE.Vector3[];
}

interface MaterialRole {
  color: number;
  metalness: number;
  roughness: number;
  emissive?: number;
  emissiveIntensity?: number;
}

// Keyed by the glTF's own material names. The source palette is arbitrary (mat1, mat4, mat12...),
// so each is identified by what it is actually painted on in the model, then reassigned.
const RE_MATERIAL: Record<string, MaterialRole> = {
  // Main hull plating: the model's white. Weathered off-white, mostly metal, moderately rough --
  // a working freighter, not a showroom.
  mat21: { color: 0x9aa1a6, metalness: 0.85, roughness: 0.46 },
  // Secondary plating (the model's light grey), a shade cooler so panel breaks read.
  mat15: { color: 0x76808a, metalness: 0.85, roughness: 0.52 },
  // Structural pylons and spars -- the model's yellow. Bare, scuffed metal.
  mat12: { color: 0x8d7f6b, metalness: 0.95, roughness: 0.38 },
  // Deep recesses and shadowed structure.
  mat17: { color: 0x1b2228, metalness: 0.7, roughness: 0.7 },
  mat16: { color: 0x39434c, metalness: 0.8, roughness: 0.6 },
  // Blackout surfaces: viewports, sensor faces, engine bells seen end-on.
  mat23: { color: 0x0a0c0f, metalness: 0.4, roughness: 0.35 },
  // Rust/scorch streaking, kept close to the interior's own oxidised palette.
  mat19: { color: 0x6b4326, metalness: 0.6, roughness: 0.82 },
  // Hazard trim. Stays red because hull warning striping genuinely is, but desaturated to paint.
  mat14: { color: 0x8f2d21, metalness: 0.3, roughness: 0.65 },
  // Engine rings -- the model's purple. The one place the toy palette was pointing at something
  // real: these ARE the thrusters, so they become the warm emissive the engine trail feeds from.
  // The deeper orange on both emissives survives ACES with its saturation intact instead of
  // washing out to cream.
  mat1: { color: 0x3a2517, metalness: 0.5, roughness: 0.4, emissive: 0xff8c3a, emissiveIntensity: 1.2 },
  // Running lights, lit viewport strips, AND the four big aft hexagonal panels -- the model's
  // orange slot covers all of them (verified by hiding materials one at a time in a live scene).
  // Intensity has to stay low: at 1.6 those hex panels rendered as huge flat cream discs that
  // dominated every shot showing the ship's stern.
  mat13: { color: 0x2a1c12, metalness: 0.3, roughness: 0.5, emissive: 0xff9a4a, emissiveIntensity: 0.55 },
  // Cockpit/corridor glow behind glass -- the model's teal.
  mat4: { color: 0x123038, metalness: 0.3, roughness: 0.45, emissive: 0x8fd8ff, emissiveIntensity: 1.1 },
};

const loader = new GLTFLoader();
let template: Promise<THREE.Object3D> | null = null;

function loadTemplate(): Promise<THREE.Object3D> {
  if (!template) {
    template = loader
      .loadAsync(`${import.meta.env.BASE_URL}models/ship/freighter.glb`)
      .then((gltf) => gltf.scene);
  }
  return template;
}

export async function buildShipHull(): Promise<ShipHull> {
  const source = await loadTemplate();
  // Cloned so a second visit to this scene re-materials a fresh copy rather than compounding onto
  // an already-mutated shared one.
  const model = source.clone(true);

  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const role = RE_MATERIAL[src.name];
    const mat = new THREE.MeshStandardMaterial({
      color: role ? role.color : 0x8a9198,
      metalness: role ? role.metalness : 0.8,
      roughness: role ? role.roughness : 0.5,
      emissive: role?.emissive ?? 0x000000,
      emissiveIntensity: role?.emissiveIntensity ?? 0,
    });
    mat.name = src.name;
    mesh.material = mat;
  });

  // The model is authored nose-down its own -Z with an arbitrary pivot and scale. Normalise it into
  // this project's ship axes (+X nose) at a known length, so every camera keyframe, engine-trail
  // origin and nav-light position downstream is expressed in ship units rather than glTF units.
  const HULL_LENGTH = 9.5;
  const inner = new THREE.Group();
  inner.add(model);
  inner.rotation.y = -Math.PI / 2;

  const group = new THREE.Group();
  group.add(inner);

  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const scale = HULL_LENGTH / size.x;
  inner.scale.setScalar(scale);
  group.updateMatrixWorld(true);

  const scaled = new THREE.Box3().setFromObject(group);
  const center = scaled.getCenter(new THREE.Vector3());
  inner.position.sub(center);
  group.updateMatrixWorld(true);

  // Exhaust points sit at the aft face of the hull, inboard of the engine pods. Derived from the
  // normalised bounding box rather than hand-typed, so they stay correct if HULL_LENGTH changes.
  const finalBox = new THREE.Box3().setFromObject(group);
  const half = finalBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const engineLocalPositions = [
    new THREE.Vector3(-half.x * 0.94, half.y * 0.42, half.z * 0.52),
    new THREE.Vector3(-half.x * 0.94, half.y * 0.42, -half.z * 0.52),
    new THREE.Vector3(-half.x * 0.94, -half.y * 0.42, half.z * 0.52),
    new THREE.Vector3(-half.x * 0.94, -half.y * 0.42, -half.z * 0.52),
  ];

  // Nav lights: port/starboard convention, matching the interior's own LED palette. Small enough to
  // read as point sources at cinematic distance rather than as visible spheres.
  const navLight = (name: string, color: number, at: THREE.Vector3) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.4 }),
    );
    // Named so the cinematics can find and drive them (the intro blinks the port light while the
    // rest of the hull is still dark).
    mesh.name = name;
    mesh.position.copy(at);
    group.add(mesh);
  };
  navLight('nav-light-port', 0xe0552f, new THREE.Vector3(half.x * 0.1, half.y * 0.55, half.z * 0.96));
  navLight('nav-light-starboard', 0x4fd8f0, new THREE.Vector3(half.x * 0.1, half.y * 0.55, -half.z * 0.96));

  return { group, engineLocalPositions };
}
