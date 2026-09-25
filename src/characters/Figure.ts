import * as THREE from 'three';

/**
 * Stylized low-poly characters, built in code so they match the Quaternius kits' faceted,
 * flat-shaded look. Everything is a lathe or a tapered cylinder with few radial segments and
 * flatShading on, which is what makes a primitive read as "a carved low-poly figure" instead of
 * "a placeholder capsule": the facets catch the scene's key light plane by plane.
 *
 * Proportions are a stylized seven heads tall. Every measurement below is a fraction of the
 * figure's height, so one builder serves a 2.2 m Aiveth and a 1.4 m child.
 */
export interface FigureSpec {
  kind: 'aiveth' | 'human';
  height: number;
  /** Shoulder width multiplier; 1 is average. */
  build?: number;
  skin: number;
  garment: number;
  trim: number;
  /** 0 = fitted jumpsuit, 1 = coat to the knee, 1.6 = robe to the ankle. */
  coat?: number;
  hair?: { color: number; style: 'crop' | 'bun' | 'swept' };
  /** Aiveth vein light, or a human's headlamp. */
  glow?: { color: number; intensity: number };
  headlamp?: boolean;
  /** Something held: a ledger under the arm, a tool roll on the belt. */
  prop?: 'ledger' | 'toolbelt' | 'staff';
  seed?: number;
}

const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, flatShading: true, ...extra });

/** A lathe around Y from (radius, height) pairs, squashed front-to-back so torsos read as bodies, not tubes. */
function lathe(points: [number, number][], segments: number, depth = 0.72): THREE.BufferGeometry {
  const geo = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  geo.scale(1, 1, depth);
  return geo;
}

function limb(top: number, bottom: number, length: number, segments = 6): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(top, bottom, length, segments, 1);
  geo.translate(0, -length / 2, 0);
  return geo;
}

/**
 * The Aiveth's vein pattern: soft vertical channels of light that branch as they rise, painted once
 * per colour. Used as the emissive map on robe and skin, so the glow sits *in* the surface.
 */
function veinTexture(seed: number): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  let s = seed * 7919 + 17;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    let x = (i + 0.5) * (w / 9) + (rand() - 0.5) * 10;
    let y = h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y > 0) {
      y -= 12 + rand() * 18;
      x += (rand() - 0.5) * 14;
      ctx.lineTo(x, y);
      if (rand() < 0.18) {
        // A short branch, the way light-veins fork toward the shoulders.
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 40, y - 20 - rand() * 20);
        ctx.moveTo(x, y);
      }
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.55 + rand() * 0.45})`;
    ctx.lineWidth = 1.5 + rand() * 2;
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

const _look = new THREE.Vector3();

export class Figure {
  readonly group = new THREE.Group();
  private torso = new THREE.Group();
  private headPivot = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private glowMats: THREE.MeshStandardMaterial[] = [];
  private glowLight: THREE.PointLight | null = null;
  private baseGlow = 0;
  private glowLevel = 1;
  private glowTarget = 1;
  private headYaw = 0;
  private phase: number;
  private spec: FigureSpec;

  constructor(spec: FigureSpec) {
    this.spec = spec;
    this.phase = (spec.seed ?? 1) * 1.7;
    const H = spec.height;
    const b = spec.build ?? 1;
    const alien = spec.kind === 'aiveth';

    const skin = flat(spec.skin, { roughness: 0.6 });
    const garment = flat(spec.garment);
    const trim = flat(spec.trim, { roughness: 0.6 });
    const boots = flat(alien ? spec.garment : 0x2a2622, { roughness: 0.9 });

    let veins: THREE.CanvasTexture | null = null;
    if (spec.glow) {
      veins = veinTexture(spec.seed ?? 1);
      for (const m of alien ? [garment, skin] : []) {
        m.emissive = new THREE.Color(spec.glow.color);
        m.emissiveMap = veins;
        m.emissiveIntensity = spec.glow.intensity;
        this.glowMats.push(m);
      }
      this.baseGlow = spec.glow.intensity;
    }

    // Aiveth are long-limbed with a high waist; humans sit on the stylized-kit norm.
    const hipY = H * (alien ? 0.52 : 0.49);
    const shoulderY = H * 0.8;
    const shoulderW = H * (alien ? 0.085 : 0.105) * b;

    // Legs and feet.
    for (const side of [-1, 1]) {
      const legLen = hipY - H * 0.035;
      const leg = new THREE.Mesh(limb(H * 0.05 * b, H * 0.032, legLen), alien ? garment : garment);
      leg.position.set(side * H * 0.045 * b, hipY, 0);
      leg.rotation.z = side * 0.02;
      this.group.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(H * 0.055, H * 0.035, H * (alien ? 0.12 : 0.1)), boots);
      foot.position.set(side * H * 0.046 * b, H * 0.0175, H * 0.022);
      this.group.add(foot);
    }

    // Torso: hips to the base of the neck, in one faceted lathe.
    const torsoGeo = lathe(
      [
        [0.001, hipY - H * 0.03],
        [H * 0.075 * b, hipY - H * 0.02],
        [H * 0.082 * b, hipY + H * 0.05],
        [H * (alien ? 0.062 : 0.075) * b, H * 0.62],
        [H * (alien ? 0.08 : 0.092) * b, H * 0.72],
        [shoulderW * 0.95, shoulderY - H * 0.01],
        [H * 0.05, shoulderY + H * 0.02],
        [H * 0.028, shoulderY + H * 0.035],
      ],
      7,
      alien ? 0.62 : 0.68,
    );
    const torsoMesh = new THREE.Mesh(torsoGeo, garment);
    this.torso.add(torsoMesh);

    // Coat or robe: a flared shell from the chest down, open enough that the legs still show on a
    // coat and hidden entirely by a robe.
    const coat = spec.coat ?? 0;
    if (coat > 0) {
      const hemY = Math.max(H * 0.04, hipY - H * 0.28 * coat);
      const flare = alien ? 0.15 : 0.11;
      const shell = new THREE.Mesh(
        lathe(
          [
            [H * 0.09 * b, H * 0.7],
            [H * 0.1 * b, hipY + H * 0.04],
            [H * (flare - 0.01) * b, (hipY + hemY) / 2],
            [H * flare * b, hemY],
            [H * (flare - 0.012) * b, hemY - H * 0.01],
          ],
          alien ? 9 : 8,
          alien ? 0.8 : 0.78,
        ),
        garment,
      );
      shell.material.side = THREE.DoubleSide;
      this.torso.add(shell);
      // A trim band at the hem and a belt at the waist: the details that make it clothing.
      const hem = new THREE.Mesh(new THREE.CylinderGeometry(H * flare * b, H * flare * b, H * 0.018, alien ? 9 : 8, 1, true), trim);
      hem.scale.z = alien ? 0.8 : 0.78;
      hem.position.y = hemY + H * 0.004;
      hem.material.side = THREE.DoubleSide;
      this.torso.add(hem);
    }
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.084 * b, H * 0.084 * b, H * 0.026, 7), trim);
    belt.scale.z = alien ? 0.64 : 0.7;
    belt.position.y = hipY + H * 0.045;
    this.torso.add(belt);

    // Collar: a mantle for the Aiveth, a turned-up collar for the Anchorage's work coats.
    const collar = new THREE.Mesh(
      lathe(
        [
          [H * 0.04, shoulderY + H * 0.035],
          [shoulderW * (alien ? 1.1 : 0.95), shoulderY + H * 0.005],
          [shoulderW * (alien ? 1.25 : 1.02), shoulderY - H * 0.03],
          [shoulderW * (alien ? 1.2 : 0.98), shoulderY - H * (alien ? 0.07 : 0.035)],
        ],
        alien ? 9 : 7,
        0.7,
      ),
      garment,
    );
    this.torso.add(collar);
    const collarEdge = new THREE.Mesh(
      new THREE.CylinderGeometry(shoulderW * (alien ? 1.2 : 0.98), shoulderW * (alien ? 1.2 : 0.98), H * 0.012, alien ? 9 : 7, 1, true),
      trim,
    );
    collarEdge.scale.z = 0.7;
    collarEdge.position.y = shoulderY - H * (alien ? 0.07 : 0.035);
    this.torso.add(collarEdge);

    // Arms hang from the shoulders with a slight outward angle and a forward bend at the elbow.
    const armLen = H * (alien ? 0.41 : 0.36);
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(side * shoulderW, shoulderY - H * 0.02, 0);
      arm.rotation.z = side * (alien ? 0.13 : 0.14);
      const upper = new THREE.Mesh(limb(H * 0.036 * b, H * 0.029, armLen * 0.5), garment);
      arm.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -armLen * 0.5;
      elbow.rotation.x = -0.18;
      const lower = new THREE.Mesh(limb(H * 0.029, H * 0.022, armLen * 0.46), coat > 0 ? garment : skin);
      elbow.add(lower);
      const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(H * (alien ? 0.022 : 0.026), 0), skin);
      hand.scale.set(0.8, 1.25, 0.9);
      hand.position.y = -armLen * 0.5;
      elbow.add(hand);
      arm.add(elbow);
      this.torso.add(arm);
    }

    // Head on a pivot at the neck, so it can turn to follow the player.
    this.headPivot.position.y = shoulderY + H * 0.03;
    const neck = new THREE.Mesh(limb(H * 0.024, H * 0.028, H * 0.05), skin);
    neck.position.y = H * 0.045;
    this.headPivot.add(neck);
    const headR = H / 14;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(headR, 1), skin);
    head.scale.set(0.86, alien ? 1.22 : 1.08, 0.94);
    head.position.y = H * 0.045 + headR * (alien ? 1.1 : 1.0);
    this.headPivot.add(head);

    // Eyes: what makes a shape a someone. Aiveth eyes are lit; human eyes are dark.
    const eyeMat = alien
      ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: spec.glow?.color ?? 0x9fe8d0, emissiveIntensity: 1.6, flatShading: true })
      : new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.3 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(headR * (alien ? 0.2 : 0.13), 0), eyeMat);
      eye.scale.set(alien ? 1.3 : 1, alien ? 0.7 : 1, 0.5);
      eye.position.set(side * headR * 0.36, head.position.y + headR * (alien ? 0.08 : 0.05), headR * 0.84);
      eye.rotation.z = alien ? side * -0.3 : 0;
      this.headPivot.add(eye);
    }
    if (!alien) {
      const nose = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.13, headR * 0.3, 4), skin);
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, head.position.y - headR * 0.12, headR * 0.95);
      this.headPivot.add(nose);
    }

    if (alien) {
      // The Aiveth crest: two swept fins from the brow back over the skull, lit along the edge.
      const crestMat = spec.glow ? garment : trim;
      for (const side of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.32, headR * 1.9, 4), crestMat);
        fin.position.set(side * headR * 0.42, head.position.y + headR * 0.7, -headR * 0.45);
        fin.rotation.set(-1.0, 0, side * -0.28);
        fin.scale.z = 0.35;
        this.headPivot.add(fin);
      }
    } else if (spec.hair) {
      const hairMat = flat(spec.hair.color, { roughness: 0.95 });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.06, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      cap.scale.set(0.9, 1.1, 1.0);
      cap.position.y = head.position.y + headR * 0.05;
      cap.rotation.x = -0.25;
      this.headPivot.add(cap);
      if (spec.hair.style === 'bun') {
        const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(headR * 0.42, 0), hairMat);
        bun.position.set(0, head.position.y + headR * 0.55, -headR * 0.85);
        this.headPivot.add(bun);
      } else if (spec.hair.style === 'swept') {
        const fringe = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.2, headR * 0.35, headR * 0.5), hairMat);
        fringe.position.set(headR * 0.15, head.position.y + headR * 0.72, headR * 0.45);
        fringe.rotation.set(0.35, 0, -0.25);
        this.headPivot.add(fringe);
      }
    }

    if (spec.headlamp) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.97, headR * 0.08, 4, 10), trim);
      band.rotation.x = Math.PI / 2 - 0.2;
      band.position.y = head.position.y + headR * 0.35;
      band.scale.set(0.9, 1, 1);
      this.headPivot.add(band);
      const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: spec.glow?.color ?? 0xffe2b0, emissiveIntensity: 1.1 });
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.22, headR * 0.26, headR * 0.22, 8), lampMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(0, head.position.y + headR * 0.42, headR * 0.98);
      this.headPivot.add(lamp);
    }

    this.torso.add(this.headPivot);
    this.group.add(this.torso);

    if (spec.prop === 'ledger') {
      // A thick bound book held against the hip: Varro's ledger.
      const book = new THREE.Mesh(new THREE.BoxGeometry(H * 0.1, H * 0.13, H * 0.035), flat(0x5a3b24));
      book.position.set(0, -armLen * 0.46, H * 0.03);
      book.rotation.set(0.1, 0.4, 0.15);
      this.armL.children[1].add(book);
      this.armL.rotation.x = -0.35;
    } else if (spec.prop === 'toolbelt') {
      const pouchMat = flat(0x6b5a3a);
      for (const side of [-1, 1]) {
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(H * 0.05, H * 0.06, H * 0.04), pouchMat);
        pouch.position.set(side * H * 0.075 * b, hipY + H * 0.02, H * 0.035);
        this.torso.add(pouch);
      }
      const wrench = new THREE.Mesh(new THREE.BoxGeometry(H * 0.014, H * 0.12, H * 0.02), flat(0x8a9097, { metalness: 0.6, roughness: 0.4 }));
      wrench.position.set(H * 0.1 * b, hipY - H * 0.02, H * 0.01);
      wrench.rotation.z = 0.2;
      this.torso.add(wrench);
    } else if (spec.prop === 'staff') {
      // A tall walking staff crowned with a lit seed-pod: the Warden's office.
      const staff = new THREE.Group();
      const pole = new THREE.Mesh(limb(H * 0.012, H * 0.014, H * 1.05, 5), flat(0x3a2e22));
      staff.add(pole);
      const podMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: spec.glow?.color ?? 0x7be0a0, emissiveIntensity: 1.8, flatShading: true });
      const pod = new THREE.Mesh(new THREE.OctahedronGeometry(H * 0.03, 1), podMat);
      pod.scale.set(0.8, 1.4, 0.8);
      pod.position.y = H * 0.03;
      staff.add(pod);
      this.glowMats.push(podMat);
      staff.position.set(0, -armLen * 0.4, H * 0.02);
      staff.position.y += H * 0.55;
      this.armR.children[1].add(staff);
      this.armR.rotation.x = -0.3;
    }

    if (spec.glow) {
      // A headlamp throws its light ahead of the face, onto what the wearer is looking at, rather
      // than lighting the head itself from inside.
      this.glowLight = new THREE.PointLight(spec.glow.color, alien ? 0.8 : 0.6, alien ? 4.5 : 4, 2);
      this.glowLight.position.set(0, spec.headlamp ? shoulderY : H * 1.02, spec.headlamp ? H * 0.5 : H * 0.28);
      this.group.add(this.glowLight);
    }

    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }

  /** 0..1: how bright the figure's own light is. The Aiveth pull their glow inward when wary. */
  setGlow(level: number): void {
    this.glowTarget = level;
  }

  update(dt: number, elapsed: number, lookAt?: THREE.Vector3): void {
    const t = elapsed + this.phase;
    // Breathing lifts the chest; the whole body sways a little around the feet.
    this.torso.scale.y = 1 + Math.sin(t * 1.6) * 0.008;
    this.torso.rotation.z = Math.sin(t * 0.6) * 0.012;
    this.armL.rotation.x = (this.spec.prop === 'ledger' ? -0.35 : 0) + Math.sin(t * 1.6) * 0.02;
    this.armR.rotation.x = (this.spec.prop === 'staff' ? -0.3 : 0) - Math.sin(t * 1.6 + 0.5) * 0.02;

    // Turn the head toward the player when they're near and in front, eased so it never snaps.
    let targetYaw = Math.sin(t * 0.23) * 0.15;
    if (lookAt) {
      this.group.worldToLocal(_look.copy(lookAt));
      const dist = Math.hypot(_look.x, _look.z);
      if (dist < 7 && _look.z > -1) targetYaw = THREE.MathUtils.clamp(Math.atan2(_look.x, _look.z), -1.0, 1.0);
    }
    this.headYaw += (targetYaw - this.headYaw) * Math.min(1, dt * 3);
    this.headPivot.rotation.y = this.headYaw;

    if (this.glowMats.length || this.glowLight) {
      this.glowLevel += (this.glowTarget - this.glowLevel) * Math.min(1, dt * 1.5);
      const pulse = 0.85 + Math.sin(t * 1.1) * 0.15;
      for (const m of this.glowMats) m.emissiveIntensity = this.baseGlow * this.glowLevel * pulse + 0.05;
      if (this.glowLight) this.glowLight.intensity = (this.spec.kind === 'aiveth' ? 0.8 : 0.6) * this.glowLevel * pulse;
    }
  }
}
