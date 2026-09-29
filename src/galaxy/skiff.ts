import * as THREE from 'three';

/**
 * The skiff model: a small flat lander with two thruster pods and a lamp under the nose, used in
 * the canopy descent (MG2) and as the return pad on Kethra's landing terrace. Local axes: +X nose,
 * +Y up.
 */
export interface Skiff {
  group: THREE.Group;
  /** The entry-heat shell material; its uHeat uniform runs from 0 (cold) to 1 (peak burn). */
  heat: THREE.ShaderMaterial;
  /** The lamp position under the nose, for attaching a spotlight. */
  lampAnchor: THREE.Object3D;
  /** The landing gear, scaled for the touchdown squash. */
  gear: THREE.Group;
  /** The thruster glow, for scenes that drive it. */
  thrusters: THREE.MeshStandardMaterial;
}

function wedge(points: [number, number][], depth: number, bevel: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 }).rotateX(Math.PI / 2);
}

export function buildSkiff(): Skiff {
  const group = new THREE.Group();
  group.name = 'skiff';
  const paint = new THREE.MeshStandardMaterial({ color: 0x7c8084, roughness: 0.58, metalness: 0.35, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.5, metalness: 0.55, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1115, roughness: 0.12, metalness: 0.4, emissive: 0xffb45a, emissiveIntensity: 0.12 });
  const livery = new THREE.MeshStandardMaterial({ color: 0xb07a2a, roughness: 0.6, metalness: 0.2 });
  const thrusters = new THREE.MeshStandardMaterial({ color: 0x1a1612, emissive: 0xffa24a, emissiveIntensity: 1.2, roughness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: 0xfff2d8, emissiveIntensity: 1.6 });

  // Hull: a chamfered wedge, wide aft, nose at +X. The extrude runs down from y = 0.24.
  const hull = new THREE.Mesh(wedge([[-1.3, -0.75], [0.7, -0.62], [1.45, -0.2], [1.45, 0.2], [0.7, 0.62], [-1.3, 0.75]], 0.36, 0.06), paint);
  hull.position.y = 0.24;
  group.add(hull);
  // The livery stripe down each flank.
  for (const z of [-0.69, 0.69]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.02), livery);
    stripe.position.set(-0.2, 0.06, z);
    stripe.rotation.y = z < 0 ? 0.06 : -0.06;
    group.add(stripe);
  }
  // Cockpit canopy, set back from the nose.
  const canopy = new THREE.Mesh(wedge([[-0.35, -0.34], [0.35, -0.28], [0.72, 0], [0.35, 0.28], [-0.35, 0.34]], 0.16, 0.04), glass);
  canopy.position.set(0.1, 0.46, 0);
  group.add(canopy);
  // Thruster pods along the flanks, their throats aft.
  for (const z of [-0.86, 0.86]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 1.15, 10).rotateZ(Math.PI / 2), dark);
    pod.position.set(-0.55, 0.02, z);
    group.add(pod);
    const throat = new THREE.Mesh(new THREE.CircleGeometry(0.15, 14).rotateY(-Math.PI / 2), thrusters);
    throat.position.set(-1.13, 0.02, z);
    group.add(throat);
  }
  // The lamp under the nose.
  const lampHousing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.24), dark);
  lampHousing.position.set(1.15, -0.14, 0);
  group.add(lampHousing);
  const lampFace = new THREE.Mesh(new THREE.CircleGeometry(0.08, 14).rotateX(Math.PI / 2), lampMat);
  lampFace.position.set(1.15, -0.195, 0);
  group.add(lampFace);
  const lampAnchor = new THREE.Object3D();
  lampAnchor.position.set(1.15, -0.2, 0);
  group.add(lampAnchor);

  // Landing gear: a nose strut and two aft, each on a pad.
  const gear = new THREE.Group();
  for (const [x, z] of [[0.85, 0], [-0.8, -0.5], [-0.8, 0.5]] as [number, number][]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.05), dark);
    strut.position.set(x, -0.26, z);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 10), dark);
    pad.position.set(x, -0.44, z);
    gear.add(strut, pad);
  }
  group.add(gear);

  // Entry heat: an orange fresnel shell over the leading underside.
  const heat = new THREE.ShaderMaterial({
    uniforms: { uHeat: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vRim;
      varying float vLead;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vRim = 1.0 - abs(dot(normalize(mat3(modelMatrix) * normal), normalize(cameraPosition - w.xyz)));
        vLead = clamp(position.x * 0.5 + 0.5 - position.y, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uHeat;
      varying float vRim;
      varying float vLead;
      void main() {
        // Only the leading underside burns, brightest at the silhouette.
        float rim = max(vRim, 0.0);
        float lead = clamp(vLead, 0.0, 1.0);
        vec3 c = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.75, 0.4), rim) * rim * rim * lead * lead;
        gl_FragColor = vec4(c * uHeat * 1.4, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 12).scale(1.1, 0.45, 0.8), heat);
  shell.position.set(0.2, 0.05, 0);
  group.add(shell);

  return { group, heat, lampAnchor, gear, thrusters };
}
