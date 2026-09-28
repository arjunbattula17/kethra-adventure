import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/rng';
import { buildShipHull } from '../../galaxy/shipHull';
import { getPointSprite } from '../../galaxy/spaceDressing';

/** Every ship's grid is a little different, so every lamp is a different colour of white. */
export const LAMP_COLORS = [0xffd8a8, 0xd6e6ff, 0xffbe7a, 0xeef2ff, 0xffe2b8];

/**
 * Vessek Anchorage from outside, for the cruise's docking arrival (docs/DESIGN.md §5, the Vessek
 * variant): the broken Kindling ring, the freighters lashed nose-in around it, their lamps
 * blinking out of sync, and the Lantern Bay's berth between two of them.
 *
 * Local frame: the origin is where the Wren rests when docked, +X her heading, as in shipHull. The
 * ring's plane is tilted to that line so the approach sees it as an ellipse, not edge-on, and every
 * moored hull is the Wren's berth turned about the ring's axis: they all nose into the ring alike.
 * Ten draw calls: the moored hulls and the Bay are merged by material.
 */
export interface Anchorage {
  group: THREE.Group;
  /** 0 on approach, 1 made fast: the collar's lamp turns from amber to green. */
  setDocked(k: number): void;
  update(time: number): void;
}

const RADIUS = 40;
const TUBE = 0.9;
const TILT = 0.45;
/** The Lantern Bay: the oldest hull, lying along the ring with the collar amidships on its flank. */
const BAY_SCALE = 2.2;
const COLLAR = { from: 4.9, to: 7.2 };
const BAY = new THREE.Vector3(COLLAR.from + 1.9 + 0.86 * BAY_SCALE, 0, -3.3 * BAY_SCALE);
/** The ring's nearest point, under the Lantern Bay. */
const NEAR = new THREE.Vector3(BAY.x, -3.6, 0);
const U = new THREE.Vector3(Math.cos(TILT), Math.sin(TILT), 0);
const W = new THREE.Vector3(0, 0, 1);
/** The ring's axis; turning about it by δ moves a point δ along the ring. */
const AXIS = new THREE.Vector3().crossVectors(U, W);
const CENTER = NEAR.clone().addScaledVector(U, RADIUS);
/** The ring's "up", the side the berths are on. */
const UP = AXIS.clone().negate();
/** The Wren docks high, at the Bay's collar; the others ride lower, close over the ring. */
const MOORED_DROP = new THREE.Vector3().sub(NEAR).dot(UP) - 2.4;
/** Broken arcs [start, length] in radians; the berth is at π. */
const ARCS: [number, number][] = [[1.95, 2.45], [4.7, 1.0], [6.0, 1.3], [1.25, 0.4]];
/** Ring angles of the moored hulls along the arcs: close either side of the berth (one across it
 * from the Bay's long body), then round the far side. */
const SLOTS = [
  Math.PI - 1.05, Math.PI - 0.8, Math.PI - 0.52, Math.PI + 0.21, Math.PI + 0.45, Math.PI + 0.74, Math.PI + 1.05,
  4.8, 5.05, 5.3, 5.55,
  6.1, 0.067, 0.317, 0.567, 0.817,
  1.45,
];
/** Slots (indices) with a second hull rafted outboard: twenty moored, and the Bay makes the ring's
 * twenty-one. */
const RAFTED = [1, 8, 13];
const RAFT_OFFSET = 15;
const VARIANTS = 5;

function ringPoint(phi: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(CENTER).addScaledVector(U, RADIUS * Math.cos(phi)).addScaledVector(W, RADIUS * Math.sin(phi));
}

/** The Wren's berth turned about the ring's axis to the ring angle `phi`. */
function berthAt(phi: number): THREE.Matrix4 {
  const turn = new THREE.Matrix4().makeRotationAxis(AXIS, phi - Math.PI);
  return new THREE.Matrix4().makeTranslation(CENTER.x, CENTER.y, CENTER.z).multiply(turn).multiply(new THREE.Matrix4().makeTranslation(-CENTER.x, -CENTER.y, -CENTER.z));
}

export async function buildAnchorage(): Promise<Anchorage> {
  const rand = mulberry32(0xa4c7);
  const group = new THREE.Group();
  group.name = 'vessek-anchorage';

  // The ring: broken arcs of one torus, in the tilted plane.
  const basis = new THREE.Matrix4().makeBasis(U, W, AXIS).setPosition(CENTER);
  const arcs = ARCS.map(([start, len]) => new THREE.TorusGeometry(RADIUS, TUBE, 8, Math.ceil(len * 22), len).rotateZ(start).applyMatrix4(basis));
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x57524a, roughness: 0.72, metalness: 0.5, emissive: 0x7be0a0, emissiveIntensity: 0.03 });
  group.add(new THREE.Mesh(mergeGeometries(arcs)!, ringMat));
  for (const g of arcs) g.dispose();

  // The moored freighters: a few variants of the Wren's class, each placed several times at its own
  // scale and set, then merged by material with the Lantern Bay's. Engines cold, windows lit:
  // people live aboard.
  const hulls = await Promise.all(Array.from({ length: VARIANTS + 1 }, (_, i) => buildShipHull({ variant: i + 1 })));
  const byMaterial = new Map<string, { mat: THREE.MeshStandardMaterial; geos: THREE.BufferGeometry[] }>();
  const lamps: { at: THREE.Vector3; color: number; steady?: boolean }[] = [];
  const merge = (hull: (typeof hulls)[number], placed: THREE.Matrix4) => {
    hull.group.updateMatrixWorld(true);
    const hue = hull.parts.paint.color.clone();
    hull.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!['hull-paint', 'hull-structure', 'hull-windows', 'hull-bells', 'hull-stern'].includes(mat.name)) return;
      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(placed);
      // Each hull's livery, baked into its vertex colour so one paint material serves them all.
      if (mat.name === 'hull-paint') {
        const col = geo.getAttribute('color') as THREE.BufferAttribute;
        for (let v = 0; v < col.count; v++) col.setXYZ(v, col.getX(v) * hue.r, col.getY(v) * hue.g, col.getZ(v) * hue.b);
      }
      const entry = byMaterial.get(mat.name) ?? { mat, geos: [] };
      entry.geos.push(geo);
      byMaterial.set(mat.name, entry);
    });
  };
  const lashings: THREE.Vector3[] = [];
  const set = new THREE.Matrix4();
  const drop = new THREE.Matrix4().makeTranslation(-UP.x * MOORED_DROP, -UP.y * MOORED_DROP, -UP.z * MOORED_DROP);
  /** One moored hull at `berth` (its scale and set jittered), with its three running lamps. */
  const moor = (berth: THREE.Matrix4, i: number) => {
    const scale = 0.95 + rand() * 0.5;
    set.makeRotationFromEuler(new THREE.Euler((rand() - 0.5) * 0.14, (rand() - 0.5) * 0.24, (rand() - 0.5) * 0.08)).scale(new THREE.Vector3(scale, scale, scale));
    set.setPosition(-(scale - 1) * 4.75 - rand() * 1.2, (rand() - 0.5) * 1.4, 0);
    const placed = berth.clone().multiply(set);
    merge(hulls[i % VARIANTS], placed);
    const color = LAMP_COLORS[i % LAMP_COLORS.length];
    for (const local of [new THREE.Vector3(3.4, 0.8, 0), new THREE.Vector3(-0.6, 0.95, 0), new THREE.Vector3(-3.8, 1.1, 0.4)]) {
      lamps.push({ at: local.applyMatrix4(placed), color });
    }
    return placed;
  };
  SLOTS.forEach((phi, i) => {
    const berth = drop.clone().multiply(berthAt(phi));
    const placed = moor(berth, i);
    // Lashed to the ring: two cables from the prow to the tube either side.
    const prow = new THREE.Vector3(4.6, 0, 0).applyMatrix4(placed);
    for (const side of [-0.035, 0.035]) lashings.push(prow.clone(), ringPoint(phi + side).addScaledVector(UP, TUBE * 0.6));
    if (!RAFTED.includes(i)) return;
    // Rafted outboard, lashed prow to the inner hull's stern.
    const outer = moor(berth.multiply(new THREE.Matrix4().makeTranslation(-RAFT_OFFSET, 0, 0)), i + 2);
    lashings.push(new THREE.Vector3(4.6, 0, 0).applyMatrix4(outer), new THREE.Vector3(-4.2, 0, 0).applyMatrix4(placed));
  });
  // The Lantern Bay: nose along the ring (+Z), port flank to the berth, the collar amidships.
  const bayPlaced = new THREE.Matrix4().makeRotationY(-Math.PI / 2).scale(new THREE.Vector3(BAY_SCALE, BAY_SCALE, BAY_SCALE)).setPosition(BAY);
  merge(hulls[VARIANTS], bayPlaced);
  for (let k = 0; k < 5; k++) lamps.push({ at: new THREE.Vector3(2.0 + k * 0.6, 0.78, k % 2 ? 0.5 : -0.5).applyMatrix4(bayPlaced), color: 0xffd8a8, steady: true });
  for (const [name, { mat, geos }] of byMaterial) {
    // Weathered matte: the panel sheet's glossiest texels, back-lit by the sun at a grazing angle,
    // spiked into a blaze under the bloom (the Bay's brow, at its size, catches exactly that angle).
    mat.roughnessMap = null;
    mat.roughness = Math.max(mat.roughness, 0.8);
    if (name === 'hull-paint') {
      mat.color.setRGB(1, 1, 1);
      mat.emissive.setHex(0xffd8a8);
      mat.emissiveIntensity = 0.04;
    }
    if (name === 'hull-windows') {
      // Lit from inside, and matte like the rest: mirror glass glinted the same way.
      mat.emissive.setHex(0xffc88a);
      mat.emissiveIntensity = 0.8;
      mat.roughness = 1;
      mat.metalness = 0;
    }
    group.add(new THREE.Mesh(mergeGeometries(geos)!, mat));
    for (const g of geos) g.dispose();
  }
  for (const hull of hulls) {
    hull.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material;
      if (![...byMaterial.values()].some((e) => e.mat === mat)) mat.dispose();
    });
  }
  const cableGeo = new THREE.BufferGeometry().setFromPoints(lashings);
  group.add(new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x2c2a27 })));

  // The Bay's pylon down to the ring, and the collar the Wren's nose mates to.
  const collarLen = COLLAR.to - COLLAR.from;
  const fittings = [
    new THREE.BoxGeometry(1.2, -1.4 - (NEAR.y + TUBE * 0.5), 1.6).translate(BAY.x, (-1.4 + NEAR.y + TUBE * 0.5) / 2, 0),
    new THREE.CylinderGeometry(0.45, 0.45, collarLen, 12).rotateZ(Math.PI / 2).translate(COLLAR.from + collarLen / 2, 0, 0),
    new THREE.CylinderGeometry(0.62, 0.7, 0.3, 12).rotateZ(Math.PI / 2).translate(COLLAR.from + 0.15, 0, 0),
  ];
  const fittingMat = new THREE.MeshStandardMaterial({ color: 0x6a645a, roughness: 0.55, metalness: 0.6 });
  group.add(new THREE.Mesh(mergeGeometries(fittings)!, fittingMat));
  for (const g of fittings) g.dispose();
  const collarMat = new THREE.MeshBasicMaterial({ color: 0xffa640 });
  group.add(new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.05, 6, 24).rotateY(Math.PI / 2).translate(COLLAR.from - 0.02, 0, 0), collarMat));
  // The Bay's floodlight on the berth: the only light that falls on the Wren's nose as she comes in.
  const flood = new THREE.PointLight(0xffc88a, 7, 20, 1.6);
  flood.position.set(2.5, 3.6, 2.8);
  group.add(flood);

  // Lamps along the ring, and the hulls' own: each blinks on its own clock.
  const step = 1.5 / RADIUS;
  for (const [start, len] of ARCS) {
    for (let a = start + step / 2; a < start + len; a += step) {
      lamps.push({ at: ringPoint(a).addScaledVector(UP, TUBE + 0.12), color: LAMP_COLORS[Math.floor(rand() * LAMP_COLORS.length)] });
    }
  }
  const pos = new Float32Array(lamps.length * 3);
  const col = new Float32Array(lamps.length * 3);
  const blink = new Float32Array(lamps.length * 2);
  const c = new THREE.Color();
  lamps.forEach((l, i) => {
    pos.set([l.at.x, l.at.y, l.at.z], i * 3);
    c.setHex(l.color).multiplyScalar(0.7 + rand() * 0.6);
    col.set([c.r, c.g, c.b], i * 3);
    // A rate of zero is a steady lamp.
    blink.set([l.steady || rand() < 0.2 ? 0 : 0.2 + rand() * 0.9, rand()], i * 2);
  });
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lampGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  lampGeo.setAttribute('aBlink', new THREE.BufferAttribute(blink, 2));
  const uniforms = { uTime: { value: 0 }, uScale: { value: 400 }, uMap: { value: getPointSprite() } };
  const lampMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec2 aBlink;
      uniform float uTime;
      uniform float uScale;
      varying vec3 vColor;
      void main() {
        float s = fract(uTime * aBlink.x + aBlink.y);
        float on = aBlink.x == 0.0 ? 1.0 : smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.5, 0.58, s));
        vColor = color * (0.15 + 0.85 * on);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // A lamp's size in the world, but never smaller than a few pixels: from far out the ring
        // still reads as a ring of lights.
        gl_PointSize = clamp(0.45 * uScale / -mv.z, 3.0, 22.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec3 vColor;
      void main() {
        gl_FragColor = vec4(vColor * texture2D(uMap, gl_PointCoord).a * 1.6, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lampPoints = new THREE.Points(lampGeo, lampMat);
  const size = new THREE.Vector2();
  lampPoints.onBeforeRender = (renderer) => {
    uniforms.uScale.value = renderer.getDrawingBufferSize(size).y / 2;
  };
  group.add(lampPoints);

  const amber = new THREE.Color(0xffa640);
  const green = new THREE.Color(0x6af0a0);
  return {
    group,
    setDocked(k) {
      collarMat.color.copy(amber).lerp(green, k);
      flood.color.setHex(0xffc88a).lerp(green, k * 0.25);
    },
    update(time) {
      uniforms.uTime.value = time;
    },
  };
}
