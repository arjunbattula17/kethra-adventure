import * as THREE from 'three';
import { buildInstancedKit } from '../kethra/kit';
import * as L from './layout';

/**
 * Set dressing for the Vessek school, tanker, junction and ducts: the pieces buildDressing returns
 * for the scene to animate and interact with.
 */
export interface Dressing {
  /** Emissive grow-bar materials, one per row from north to south, so rows can light in order. */
  growBars: THREE.MeshStandardMaterial[];
  heaterMat: THREE.MeshStandardMaterial;
  schoolMat: THREE.MeshStandardMaterial;
  junctionMat: THREE.MeshStandardMaterial;
  plantMats: THREE.MeshStandardMaterial[];
  /** Spinning parts: the duct fans (with their colliders while they run) and the scrubber's fan. */
  ductFans: { blades: THREE.Object3D; collider: THREE.Box3; closed: THREE.Box3; light: THREE.MeshStandardMaterial }[];
  scrubberFan: THREE.Object3D;
  /** The junction's reset panel and the door buttons, for the scene's interactions. */
  resetPanel: THREE.Object3D;
  resetLever: THREE.Object3D;
  keypad: THREE.Object3D;
  insideButton: THREE.Object3D;
  crank: THREE.Object3D;
  colliders: THREE.Box3[];
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function chalkboard(): THREE.CanvasTexture {
  return canvasTex(1024, 512, (ctx) => {
    ctx.fillStyle = '#23302a';
    ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = 'rgba(232,226,210,0.85)';
    ctx.fillStyle = 'rgba(232,226,210,0.9)';
    ctx.lineWidth = 4;
    ctx.font = 'bold 54px Rajdhani, sans-serif';
    ctx.fillText('OTHER STARS', 60, 90);
    ctx.font = '600 30px Rajdhani, sans-serif';
    ctx.fillText('ours: white, too close, one', 60, 140);
    const star = (x: number, y: number, r: number, colour: string, label: string) => {
      ctx.strokeStyle = colour;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(232,226,210,0.85)';
      ctx.fillText(label, x - 40, y + r + 40);
    };
    star(220, 300, 60, '#e8e2d2', 'white');
    star(460, 290, 46, '#e8a07a', 'red?');
    star(680, 300, 70, '#a8c8f0', 'BLUE??');
    star(880, 290, 52, '#f0d890', 'yellow');
    ctx.strokeStyle = 'rgba(232,226,210,0.5)';
    ctx.beginPath();
    ctx.moveTo(60, 460);
    ctx.lineTo(980, 460);
    ctx.stroke();
    ctx.fillText('ask the amber ship', 640, 500);
  });
}

/** A child's drawing texture: a `sun`-coloured disc over the ring of ships, laid out from `seed`. */
function drawing(seed: number, sun: string): THREE.CanvasTexture {
  let r = seed * 9301 + 49297;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  return canvasTex(256, 320, (ctx) => {
    ctx.fillStyle = '#e8dfc8';
    ctx.fillRect(0, 0, 256, 320);
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(70 + rand() * 110, 70 + rand() * 40, 34 + rand() * 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a6068';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(128, 230, 100, 34, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = ['#c05a3a', '#3a7ac0', '#d9a441', '#5aa06a', '#8a5ac0'][i];
      const a = rand() * Math.PI * 2;
      ctx.fillRect(128 + Math.cos(a) * 100 - 12, 230 + Math.sin(a) * 34 - 8, 26, 14);
    }
  });
}

/** The chalk-arrow texture for the duct walls, built once and shared. */
let arrowTex: THREE.CanvasTexture | null = null;
function arrow(): THREE.CanvasTexture {
  arrowTex ??= canvasTex(128, 64, (ctx) => {
    ctx.clearRect(0, 0, 128, 64);
    ctx.strokeStyle = 'rgba(236,232,220,0.9)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(14, 32);
    ctx.lineTo(108, 32);
    ctx.moveTo(84, 12);
    ctx.lineTo(110, 32);
    ctx.lineTo(84, 52);
    ctx.stroke();
  });
  return arrowTex;
}

export async function buildDressing(scene: THREE.Scene): Promise<Dressing> {
  const colliders: THREE.Box3[] = [];
  const add = (m: THREE.Object3D) => {
    scene.add(m);
    return m;
  };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    return add(m) as THREE.Mesh;
  };
  const solid = (x0: number, z0: number, x1: number, z1: number, h: number) =>
    colliders.push(new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), 0, Math.min(z0, z1)), new THREE.Vector3(Math.max(x0, x1), h, Math.max(z0, z1))));

  const steel = new THREE.MeshStandardMaterial({ color: 0x4a5258, metalness: 0.6, roughness: 0.5 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2c3136, metalness: 0.7, roughness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 0.85 });

  // --- The school hold ---
  const school = L.faces(L.ROOMS.school);
  // In front of its wooden backing (which is 0.1 thick on the wall's face).
  const board = mesh(new THREE.PlaneGeometry(4.2, 2.1), new THREE.MeshStandardMaterial({ map: chalkboard(), roughness: 0.95 }), school.x0 + 0.1, 1.9, 6, Math.PI / 2);
  board.castShadow = false;
  mesh(new THREE.BoxGeometry(0.1, 2.3, 4.4), wood, school.x0 + 0.02, 1.9, 6);
  const suns = ['#e8e2d2', '#e8a07a', '#a8c8f0', '#f0d890', '#e8e2d2', '#f0d890'];
  suns.forEach((sun, i) => {
    const d = mesh(new THREE.PlaneGeometry(0.5, 0.62), new THREE.MeshStandardMaterial({ map: drawing(i + 3, sun), roughness: 0.9 }), -22.6 + i * 1.1, 1.8 + (i % 2) * 0.35, school.z0 + 0.05);
    d.rotation.z = (i % 3 - 1) * 0.06;
    d.castShadow = false;
  });
  // Desks and stools.
  for (const [x, z] of [[-20.5, 4], [-20.5, 7], [-17.5, 4], [-17.5, 7]] as const) {
    mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), wood, x, 0.62, z);
    mesh(new THREE.BoxGeometry(1.4, 0.58, 0.6), darkSteel, x, 0.29, z);
    mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.42, 8), steel, x - 0.4, 0.21, z + 0.75);
    mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.42, 8), steel, x + 0.4, 0.21, z + 0.75);
    solid(x - 0.8, z - 0.4, x + 0.8, z + 0.4, 0.7);
  }
  // The school lamps: a string of bulbs across the hold.
  const schoolMat = new THREE.MeshStandardMaterial({ color: 0x3a3228, emissive: 0xffc27a, emissiveIntensity: 1.6 });
  for (let i = 0; i < 7; i++) mesh(new THREE.SphereGeometry(0.1, 10, 8), schoolMat, -22.5 + i * 1.5, 4.2 - Math.sin((i / 6) * Math.PI) * 0.4, 6 + Math.cos(i) * 0.4);

  // --- The hydroponics tanker ---
  const tanker = L.faces(L.ROOMS.tanker);
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x4a5258, metalness: 0.6, roughness: 0.5 });
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 1 });
  const growBars: THREE.MeshStandardMaterial[] = [];
  const plants: { position: THREE.Vector3; yaw: number; scale: number }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const z of [-33, -29.5, -26, -22.5, -19]) {
    const bar = new THREE.MeshStandardMaterial({ color: 0x2a2f2c, emissive: 0xd8ffd8, emissiveIntensity: 1.6 });
    growBars.push(bar);
    for (const x of [-4.2, 3.6]) {
      mesh(new THREE.BoxGeometry(5.2, 0.9, 1.1), tableMat, x, 0.45, z);
      mesh(new THREE.BoxGeometry(5.0, 0.08, 0.94), soilMat, x, 0.94, z);
      mesh(new THREE.BoxGeometry(4.8, 0.06, 0.16), bar, x, 2.5, z).castShadow = false;
      solid(x - 2.6, z - 0.55, x + 2.6, z + 0.55, 1);
      for (let i = 0; i < 9; i++) plants.push({ position: new THREE.Vector3(x - 2.2 + i * 0.55, 0.96, z + (rnd() - 0.5) * 0.4), yaw: rnd() * 6.28, scale: 0.55 + rnd() * 0.3 });
    }
  }
  const half = Math.ceil(plants.length / 2);
  const built = await Promise.all([buildInstancedKit(scene, 'Plant_1', plants.slice(0, half)), buildInstancedKit(scene, 'Fern_1', plants.slice(half))]);
  const plantMats: THREE.MeshStandardMaterial[] = [];
  for (const meshes of built) for (const m of meshes) plantMats.push(m.material as THREE.MeshStandardMaterial);
  for (const m of plantMats) m.userData.baseColor = m.color.clone();
  // Heater coils along both long walls: they glow when the heaters run.
  const heaterMat = new THREE.MeshStandardMaterial({ color: 0x3a2a22, emissive: 0xff7a3a, emissiveIntensity: 0, roughness: 0.6, metalness: 0.5 });
  for (const x of [tanker.x0 + 0.25, tanker.x1 - 0.25]) {
    for (const z of [-31, -27, -23, -19]) {
      if (x > 0 && (z === -27 || z === -31)) continue; // the short duct and the junction tube
      for (let k = 0; k < 5; k++) mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 14), heaterMat, x, 0.5 + k * 0.1, z).rotation.set(Math.PI / 2, 0, 0);
    }
  }
  // The scrubber stack, by its lever on the west wall, with a fan on top.
  mesh(new THREE.CylinderGeometry(0.55, 0.65, 3.2, 12), steel, -6.6, 1.6, -21.8);
  solid(-7.3, -22.5, -5.9, -21.1, 3.2);
  const scrubberFan = new THREE.Group();
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.18), darkSteel);
    blade.rotation.y = (b / 4) * Math.PI;
    blade.rotation.x = 0.3;
    scrubberFan.add(blade);
  }
  scrubberFan.position.set(-6.6, 3.28, -21.8);
  add(scrubberFan);
  // The hatch crank, on the tanker side of the hall tube.
  const crank = new THREE.Group();
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 18), new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.8, roughness: 0.4 }));
  wheel.position.y = 1.2;
  crank.add(wheel);
  crank.position.set(L.CRANK.x, 0, L.CRANK.z);
  add(crank);

  // --- The aft junction ---
  const junction = L.faces(L.ROOMS.junction);
  mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 16), steel, 17.5, 1.7, -32);
  for (let k = 0; k < 4; k++) mesh(new THREE.TorusGeometry(1.12, 0.05, 6, 24), darkSteel, 17.5, 0.5 + k * 0.8, -32).rotation.x = Math.PI / 2;
  solid(16.3, -33.2, 18.7, -30.8, 3.4);
  // The pump housings, in the middle of the room: the levers on the east wall need standing room.
  for (const z of [-26.5, -28.5]) {
    mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.4, 12), darkSteel, 19.6, 0.7, z).rotation.z = Math.PI / 2;
    solid(18.9, z - 0.45, 20.3, z + 0.45, 0.9);
  }
  const junctionMat = new THREE.MeshStandardMaterial({ color: 0x1a2630, emissive: 0x9fd0ff, emissiveIntensity: 0.1 });
  for (const z of [-23, -25, -34.5]) mesh(new THREE.BoxGeometry(1.2, 0.06, 0.22), junctionMat, 18, 4.6, z).castShadow = false;
  // The reset panel on the north wall, with its big lever.
  const resetPanel = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.55, metalness: 0.65 }));
  panel.position.y = 1.5;
  const resetLever = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), new THREE.MeshStandardMaterial({ color: 0xc03a2a, roughness: 0.5 }));
  bar.position.y = 0.35;
  resetLever.add(bar);
  resetLever.position.set(0, 1.2, 0.14);
  resetLever.rotation.x = 0.9;
  resetPanel.add(panel, resetLever);
  resetPanel.position.set(21, 0, junction.z0 + 0.15);
  add(resetPanel);
  // The door button inside, and the keypad outside.
  const insideButton = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.2), new THREE.MeshStandardMaterial({ color: 0x7cbf7c, emissive: 0x7cbf7c, emissiveIntensity: 0.6 }));
  insideButton.position.set(junction.x0 + 0.1, 1.4, -31.6);
  add(insideButton);
  // On the tube's south wall, facing into the tube.
  const keypad = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 0.1), new THREE.MeshStandardMaterial({ color: 0x23282d, emissive: 0xd9a441, emissiveIntensity: 0.35 }));
  keypad.position.set(L.KEYPAD.x, L.KEYPAD.y, L.KEYPAD.z);
  add(keypad);

  // --- The ducts: a fan behind each mouth, and the chalk arrows ---
  const ductFans: Dressing['ductFans'] = [];
  const fanSpots = [
    { x: -18, z: -1.4, alongZ: true },
    { x: 2, z: -13.2, alongZ: true },
  ];
  for (const f of fanSpots) {
    const blades = new THREE.Group();
    for (let b = 0; b < 5; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.02), darkSteel);
      blade.position.y = 0.25;
      const arm = new THREE.Group();
      arm.rotation.z = (b / 5) * Math.PI * 2;
      arm.add(blade);
      blades.add(arm);
    }
    blades.position.set(f.x, L.DUCT_HEIGHT / 2, f.z);
    if (!f.alongZ) blades.rotation.y = Math.PI / 2;
    add(blades);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.04, 6, 24), steel);
    ring.position.copy(blades.position);
    ring.rotation.y = f.alongZ ? 0 : Math.PI / 2;
    add(ring);
    const light = new THREE.MeshStandardMaterial({ color: 0x1a1d20, emissive: 0xb8d0e0, emissiveIntensity: 0.6 });
    mesh(new THREE.BoxGeometry(0.5, 0.03, 0.08), light, f.x, L.DUCT_HEIGHT - 0.05, f.z + 0.4).castShadow = false;
    const closed = new THREE.Box3(new THREE.Vector3(f.x - 0.65, 0, f.z - 0.1), new THREE.Vector3(f.x + 0.65, L.DUCT_HEIGHT, f.z + 0.1));
    ductFans.push({ blades, collider: closed.clone(), closed, light });
  }
  // Each arrow: its position on a duct's inner wall, the wall normal into the duct, and its
  // direction.
  const wallIn = L.DUCT_WIDTH / 2 - 0.01;
  const arrows: [number, number, number, [number, number], [number, number]][] = [
    [-18 + wallIn, 0.8, -2.8, [-1, 0], [0, -1]],
    [-18 + wallIn, L.UPPER + 0.8, -12, [-1, 0], [0, -1]],
    [-18 + wallIn, L.UPPER + 0.8, -22, [-1, 0], [0, -1]],
    [2 - wallIn, 0.8, -12.8, [1, 0], [0, -1]],
    [6, 0.8, -14 - wallIn, [0, 1], [1, 0]],
    [10 - wallIn, L.UPPER + 0.8, -16.2, [1, 0], [0, -1]],
    [14, L.UPPER + 0.8, -18 - wallIn, [0, 1], [1, 0]],
  ];
  const arrowMat = new THREE.MeshBasicMaterial({ map: arrow(), transparent: true, depthWrite: false });
  const basis = new THREE.Matrix4();
  for (const [x, y, z, [nx, nz], [dx, dz]] of arrows) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), arrowMat);
    // The plane's +x points along the arrow's direction and its +z faces into the duct.
    const right = new THREE.Vector3(dx, 0, dz);
    const normal = new THREE.Vector3(nx, 0, nz);
    a.quaternion.setFromRotationMatrix(basis.makeBasis(right, new THREE.Vector3().crossVectors(normal, right), normal));
    a.position.set(x, y, z);
    add(a);
  }

  return { growBars, heaterMat, schoolMat, junctionMat, plantMats, ductFans, scrubberFan, resetPanel, resetLever, keypad, insideButton, crank, colliders };
}
