import * as THREE from 'three';

/**
 * Kethra's set pieces as designed objects, replacing the primitive stand-ins (a glowing sphere for
 * the Wickmoth, an octahedron for the Cistern Heart) that STYLE_AUDIT.md called out as the worst
 * thing a judge sees. Each one is built from the lore's own description (LORE.md, Characters and
 * Places) so the object tells its story without a caption.
 */

/** The Rite's three colours: the only saturated hues the grove is allowed (ART_BIBLE.md). */
export const RITE = {
  azure: 0x5fb4ff,
  amber: 0xffb45a,
  verdant: 0x7be0a0,
} as const;

/** Kethra's palette for the canopy: deep sea-greens and teals, never autumn red. */
export const CANOPY_TINTS = [0x5fa88c, 0x4f9a86, 0x6fb89a, 0x4a8c7c];

/**
 * Re-tints a kit material by the brightness of its own texture, so a red-leaved species and a
 * green-leaved one both come out in the grove's palette while keeping every leaf's painted detail.
 * The patch runs after three.js samples the diffuse map: the sampled colour is replaced by its
 * luminance times the material's colour.
 */
export function tintByLuminance(mat: THREE.MeshStandardMaterial, tint: number, gain = 1.65): void {
  mat.color.set(tint).multiplyScalar(gain);
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      #ifdef USE_MAP
        diffuseColor.rgb = diffuse * dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      #endif`,
    );
  };
  // One program for every material patched this way, not one per material.
  mat.customProgramCacheKey = () => 'kethra-luminance-tint';
  mat.needsUpdate = true;
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Stained glass for the Wickmoth's wings: cells of the Rite's colours between dark "leading",
 * brightest near the body, so the light reads as coming *through* the wing.
 */
function stainedGlassTexture(seed: number): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    let r = seed * 48271;
    const rand = () => ((r = (r * 48271) % 2147483647) / 2147483647);
    const points: [number, number][] = [];
    for (let i = 0; i < 26; i++) points.push([rand() * s, rand() * s]);
    const colors = ['#5fb4ff', '#ffb45a', '#7be0a0', '#8fd6ff', '#b7f0c8'];
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        let d1 = Infinity;
        let d2 = Infinity;
        let nearest = 0;
        for (let i = 0; i < points.length; i++) {
          const dx = points[i][0] - x;
          const dy = points[i][1] - y;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            nearest = i;
          } else if (d < d2) d2 = d;
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1);
        const o = (y * s + x) * 4;
        if (edge < 2.2) {
          img.data[o] = 22;
          img.data[o + 1] = 20;
          img.data[o + 2] = 18;
        } else {
          const c = colors[nearest % colors.length];
          // Brighter toward the wing root (left edge of the texture, where the body is).
          const glow = 0.55 + 0.45 * (1 - x / s);
          img.data[o] = parseInt(c.slice(1, 3), 16) * glow;
          img.data[o + 1] = parseInt(c.slice(3, 5), 16) * glow;
          img.data[o + 2] = parseInt(c.slice(5, 7), 16) * glow;
        }
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

/** A moth wing outline in the XY plane, root at the origin, reaching along +X. */
function wingShape(length: number, width: number, hind: boolean): THREE.ShapeGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  if (hind) {
    sh.bezierCurveTo(length * 0.3, -width * 0.2, length * 0.9, -width * 0.9, length * 0.55, -width);
    sh.bezierCurveTo(length * 0.3, -width * 1.05, length * 0.05, -width * 0.5, 0, 0);
  } else {
    sh.bezierCurveTo(length * 0.35, width * 0.55, length * 0.85, width * 0.75, length, width * 0.35);
    sh.bezierCurveTo(length * 1.02, width * 0.05, length * 0.6, -width * 0.25, 0, 0);
  }
  const geo = new THREE.ShapeGeometry(sh, 10);
  // UVs from position: u runs root to tip, v across.
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / length, (pos.getY(i) + width) / (2 * width));
  }
  return geo;
}

export interface Wickmoth {
  root: THREE.Group;
  update(dt: number, elapsed: number, dormant: boolean): void;
}

/**
 * The Wickmoth: "territorial, slow, wings like stained glass with the light still moving through
 * it" (LORE.md). A 2.6 m wingspan guardian that patrols the chamber approach while the grove is
 * bright, and settles, wings folded and dimmed, once the lantern bloom is closed.
 */
export function buildWickmoth(): Wickmoth {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const chitin = new THREE.MeshStandardMaterial({ color: 0x1d2a2c, roughness: 0.45, metalness: 0.15, flatShading: true });
  const fur = new THREE.MeshStandardMaterial({ color: 0x9fb8a8, roughness: 1, flatShading: true });

  const thorax = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), fur);
  thorax.scale.set(0.9, 0.85, 1.25);
  body.add(thorax);
  const abdomen = new THREE.Mesh(
    new THREE.LatheGeometry([0.02, 0.14, 0.17, 0.15, 0.1, 0.02].map((r, i) => new THREE.Vector2(r, -i * 0.13)), 7),
    chitin,
  );
  abdomen.rotation.x = Math.PI / 2 + 0.25;
  abdomen.position.z = -0.12;
  body.add(abdomen);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), fur);
  head.position.set(0, 0.03, 0.27);
  body.add(head);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.1, metalness: 0.4, emissive: 0x3fd9a8, emissiveIntensity: 0.25 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 1), eyeMat);
    eye.position.set(side * 0.09, 0.05, 0.33);
    body.add(eye);
    // Feathered antennae: a curved spine with a fan.
    const antenna = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.42, 4), fur);
    antenna.position.set(side * 0.06, 0.24, 0.36);
    antenna.rotation.set(0.6, 0, side * -0.45);
    antenna.scale.z = 0.25;
    body.add(antenna);
  }

  const wingTex = stainedGlassTexture(11);
  const wingMat = new THREE.MeshStandardMaterial({
    map: wingTex,
    emissiveMap: wingTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.9,
    roughness: 0.3,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const hinges: { pivot: THREE.Group; side: number; hind: boolean }[] = [];
  for (const side of [-1, 1]) {
    for (const hind of [false, true]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.12, 0.05, hind ? -0.08 : 0.08);
      const wing = new THREE.Mesh(wingShape(hind ? 0.95 : 1.25, hind ? 0.5 : 0.6, hind), wingMat);
      // Lay the wing flat, reaching out to its own side, swept back a little.
      wing.rotation.x = -Math.PI / 2;
      if (side < 0) wing.scale.x = -1;
      wing.rotation.z = side * (hind ? -0.35 : 0.15);
      pivot.add(wing);
      body.add(pivot);
      hinges.push({ pivot, side, hind });
    }
  }

  const light = new THREE.PointLight(0x7fe0d0, 1.1, 7, 2);
  light.position.y = 0.3;
  root.add(light);
  // A guardian, not an insect: 2.6 m across. Nose tipped up in flight so the wings face the player
  // coming up the approach instead of cutting edge-on through their eye line.
  body.scale.setScalar(1.45);

  let t = 0;
  let settle = 0;
  return {
    root,
    update(dt, elapsed, dormant) {
      t += dt;
      settle += ((dormant ? 1 : 0) - settle) * Math.min(1, dt * 0.8);
      // Awake: slow, heavy flaps and a lazy patrol across the approach. Dormant: perched, wings
      // folded up in a tent, breathing.
      const flap = Math.sin(t * 4.2);
      for (const h of hinges) {
        const open = h.side * (0.2 + 0.55 * (flap * 0.5 + 0.5)) * (h.hind ? 0.85 : 1);
        const folded = h.side * 1.2;
        h.pivot.rotation.z = THREE.MathUtils.lerp(open, folded, settle);
      }
      const patrolX = Math.sin(t * 0.35) * 3.2;
      // It settles at the east edge of the approach, off the path, so a player walking past a
      // sleeping guardian has it beside them rather than hanging at head height in the way.
      root.position.x = THREE.MathUtils.lerp(patrolX, 2.8, settle);
      root.position.y = THREE.MathUtils.lerp(2.5 + Math.sin(t * 1.1) * 0.25 + flap * 0.04, 1.78, settle);
      body.rotation.y = THREE.MathUtils.lerp(Math.cos(t * 0.35) * 0.9, 0, settle);
      body.rotation.z = THREE.MathUtils.lerp(-Math.cos(t * 0.35) * 0.15, 0, settle);
      body.rotation.x = THREE.MathUtils.lerp(-0.55, -0.1, settle);
      wingMat.emissiveIntensity = THREE.MathUtils.lerp(0.75 + Math.sin(elapsed * 1.7) * 0.2, 0.25, settle);
      light.intensity = THREE.MathUtils.lerp(1.1, 0.25, settle);
    },
  };
}

export interface CisternHeart {
  root: THREE.Group;
  core: THREE.Mesh;
  water: THREE.Mesh;
  callStone: THREE.Group;
  setAwake(awake: boolean): void;
  update(dt: number, elapsed: number): void;
}

/**
 * Glyph drawn for each Rite colour, so the puzzle never depends on colour alone (BACKLOG B-11):
 * azure is a wave, amber a rayed sun, verdant a branching leaf.
 */
export function drawRiteGlyph(ctx: CanvasRenderingContext2D, which: keyof typeof RITE, cx: number, cy: number, r: number): void {
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (which === 'azure') {
    for (let row = -1; row <= 1; row++) {
      ctx.moveTo(cx - r, cy + row * r * 0.45);
      for (let i = 0; i <= 16; i++) {
        const x = cx - r + (i / 16) * 2 * r;
        ctx.lineTo(x, cy + row * r * 0.45 + Math.sin((i / 16) * Math.PI * 2) * r * 0.16);
      }
    }
  } else if (which === 'amber') {
    ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.moveTo(cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58);
      ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    }
  } else {
    ctx.moveTo(cx, cy + r * 0.95);
    ctx.lineTo(cx, cy - r * 0.9);
    for (const [y, len] of [[0.4, 0.55], [0, 0.7], [-0.4, 0.5]]) {
      ctx.moveTo(cx, cy + r * y);
      ctx.lineTo(cx - r * len, cy + r * (y - 0.35));
      ctx.moveTo(cx, cy + r * y);
      ctx.lineTo(cx + r * len, cy + r * (y - 0.35));
    }
  }
  ctx.stroke();
}

/**
 * The Cistern Heart: a Kindling machine that lifts water and makes light (LORE.md, "How the Choir
 * works" rule 4). A stone basin of dark water, three standing vanes each crowned with one of the
 * Rite's colours, and a faceted crystal core hanging over the water. Asleep, the vanes are cold and
 * the water black; awake, all three vanes light and the water glows from beneath.
 */
export function buildCisternHeart(stone: THREE.Material): CisternHeart {
  const root = new THREE.Group();

  // Basin: a thick carved ring with a lip, lathed.
  const basin = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [1.55, 0.02], [2.35, 0.0], [2.45, 0.35], [2.3, 0.5], [2.15, 0.52], [2.05, 0.3], [1.6, 0.28], [1.55, 0.02],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      14,
    ),
    stone,
  );
  basin.castShadow = true;
  basin.receiveShadow = true;
  root.add(basin);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.9, 7), stone);
  plinth.position.y = 0.45;
  root.add(plinth);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0e2a33,
    emissive: 0x2a8fa0,
    emissiveIntensity: 0.08,
    roughness: 0.08,
    metalness: 0.3,
    transparent: true,
    opacity: 0.85,
  });
  const water = new THREE.Mesh(new THREE.RingGeometry(0.7, 2.08, 28), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  root.add(water);

  // Three vanes around the basin, one per Rite colour, facing inward.
  const vaneShape = new THREE.Shape();
  vaneShape.moveTo(-0.32, 0);
  vaneShape.lineTo(0.32, 0);
  vaneShape.lineTo(0.2, 2.2);
  vaneShape.quadraticCurveTo(0, 2.75, -0.2, 2.2);
  vaneShape.lineTo(-0.32, 0);
  const vaneGeo = new THREE.ExtrudeGeometry(vaneShape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  vaneGeo.translate(0, 0, -0.11);
  const crystals: { mat: THREE.MeshStandardMaterial; light: THREE.PointLight; color: number; order: number }[] = [];
  (['azure', 'amber', 'verdant'] as const).forEach((name, i) => {
    const a = Math.PI + (i - 1) * ((Math.PI * 2) / 3);
    const vane = new THREE.Group();
    vane.position.set(Math.sin(a) * 2.75, 0, Math.cos(a) * 2.75);
    vane.rotation.y = a + Math.PI;
    const blade = new THREE.Mesh(vaneGeo, stone);
    blade.castShadow = true;
    vane.add(blade);
    // A glyph inset on the blade's face, cut and glowing in its colour.
    const glyphTex = canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#fff';
      drawRiteGlyph(ctx, name, s / 2, s / 2, s * 0.36);
    });
    const glyphMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: RITE[name], emissiveMap: glyphTex, emissiveIntensity: 0.35, transparent: true, alphaMap: glyphTex, depthWrite: false });
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), glyphMat);
    glyph.position.set(0, 1.25, 0.15);
    vane.add(glyph);
    const crystalMat = new THREE.MeshStandardMaterial({ color: RITE[name], emissive: RITE[name], emissiveIntensity: 0.15, roughness: 0.15, metalness: 0.1, flatShading: true });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), crystalMat);
    crystal.scale.set(0.8, 1.7, 0.8);
    crystal.position.set(0, 2.95, 0);
    vane.add(crystal);
    const light = new THREE.PointLight(RITE[name], 0, 5, 2);
    light.position.set(0, 2.9, 0.4);
    vane.add(light);
    crystals.push({ mat: crystalMat, light, color: RITE[name], order: i });
    // The glyph brightens with its crystal.
    crystal.userData.glyphMat = glyphMat;
    root.add(vane);
  });

  // The core: a faceted glass shell around a lit heart, hanging over the water.
  const coreGroup = new THREE.Group();
  coreGroup.position.y = 1.75;
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x5fb4d0, emissiveIntensity: 0.35, roughness: 0.2, flatShading: true });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), coreMat);
  coreGroup.add(core);
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.62, 0),
    new THREE.MeshStandardMaterial({ color: 0x9fd8e8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, flatShading: true, depthWrite: false }),
  );
  coreGroup.add(shell);
  const cage = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.64, 0)),
    new THREE.LineBasicMaterial({ color: 0x9fd8e8, transparent: true, opacity: 0.55 }),
  );
  coreGroup.add(cage);
  const coreLight = new THREE.PointLight(0x7fd0e8, 0.8, 8, 2);
  coreGroup.add(coreLight);
  root.add(coreGroup);

  // The call-stone: where the Rite is sung. A low slanted lectern with the three glyphs.
  const callStone = new THREE.Group();
  const lectern = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.0, 6), stone);
  lectern.position.y = 0.5;
  callStone.add(lectern);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.7), stone);
  top.position.y = 1.05;
  top.rotation.x = -0.35;
  callStone.add(top);
  const faceTex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#141210';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#fff';
    (['azure', 'amber', 'verdant'] as const).forEach((name, i) => {
      ctx.strokeStyle = `#${RITE[name].toString(16).padStart(6, '0')}`;
      drawRiteGlyph(ctx, name, s * (0.2 + i * 0.3), s * 0.5, s * 0.11);
    });
  });
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(1.08, 0.58),
    new THREE.MeshStandardMaterial({ map: faceTex, emissiveMap: faceTex, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.8 }),
  );
  face.position.set(0, 1.125, 0.03);
  face.rotation.x = -Math.PI / 2 - 0.35;
  callStone.add(face);

  let awake = 0;
  let awakeTarget = 0;
  let wakeClock = 0;
  return {
    root,
    core,
    water,
    callStone,
    setAwake(on) {
      awakeTarget = on ? 1 : 0;
      if (on) wakeClock = 0;
    },
    update(dt, elapsed) {
      wakeClock += dt;
      awake += (awakeTarget - awake) * Math.min(1, dt * 0.9);
      coreGroup.rotation.y += dt * (0.25 + awake * 0.6);
      coreGroup.position.y = 1.75 + Math.sin(elapsed * 0.9) * 0.06 + awake * 0.25;
      coreMat.emissiveIntensity = 0.35 + awake * 2.2 + Math.sin(elapsed * 2) * 0.1 * awake;
      coreLight.intensity = 0.8 + awake * 4;
      waterMat.emissiveIntensity = 0.08 + awake * 0.9;
      waterMat.color.setHex(awake > 0.5 ? 0x1a4d57 : 0x0e2a33);
      // On waking, the vanes light one after another in the true order of the Rite.
      for (const c of crystals) {
        const lit = awakeTarget > 0 ? THREE.MathUtils.clamp((wakeClock - c.order * 0.7) / 0.6, 0, 1) : awake;
        c.mat.emissiveIntensity = 0.15 + lit * 2.4;
        c.light.intensity = lit * 2.2;
      }
    },
  };
}

export interface LanternBloom {
  root: THREE.Group;
  setClosed(closed: boolean): void;
  update(dt: number, elapsed: number): void;
}

/**
 * The grove's lantern bloom: a head-high Kindling-grown flower whose open cup lights the approach
 * and keeps the Wickmoth awake. Closing it (the "dim the grove light" interaction) folds the petals
 * shut and its light goes to an ember.
 */
export function buildLanternBloom(): LanternBloom {
  const root = new THREE.Group();
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x2f5a46, roughness: 0.8, flatShading: true });
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.15, 0.8, 0.05),
    new THREE.Vector3(-0.05, 1.6, 0.1),
    new THREE.Vector3(0.1, 2.2, 0.25),
  ]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.07, 5), stemMat));
  for (const [y, side] of [[0.6, 1], [1.1, -1]] as const) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 4), stemMat);
    leaf.scale.z = 0.2;
    leaf.position.set(side * 0.3, y, 0.05);
    leaf.rotation.z = side * -1.1;
    root.add(leaf);
  }
  const head = new THREE.Group();
  head.position.set(0.1, 2.2, 0.25);
  head.rotation.x = 0.5;
  root.add(head);
  const petalMat = new THREE.MeshStandardMaterial({
    color: 0x9fe8c8,
    emissive: 0x5cd1b0,
    emissiveIntensity: 1.1,
    roughness: 0.5,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const petals: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const hinge = new THREE.Group();
    hinge.rotation.y = (i / 6) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.42, 5, 4, 0, 0.9, 0, Math.PI * 0.5), petalMat);
    petal.rotation.x = Math.PI;
    petal.scale.set(1, 1.4, 1);
    hinge.add(petal);
    head.add(hinge);
    petals.push(hinge);
  }
  const heartMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xc8ffe8, emissiveIntensity: 2.2 });
  const pistil = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), heartMat);
  pistil.position.y = 0.05;
  head.add(pistil);
  const light = new THREE.PointLight(0x5cd1b0, 1.4, 8, 2);
  light.position.y = 0.1;
  head.add(light);

  let open = 1;
  let openTarget = 1;
  return {
    root,
    setClosed(closed) {
      openTarget = closed ? 0 : 1;
    },
    update(dt, elapsed) {
      open += (openTarget - open) * Math.min(1, dt * 2.5);
      for (const p of petals) p.rotation.x = THREE.MathUtils.lerp(0.05, -0.9, open) ;
      const breathe = 1 + Math.sin(elapsed * 1.3) * 0.08;
      petalMat.emissiveIntensity = (0.15 + open * 0.95) * breathe;
      heartMat.emissiveIntensity = 0.3 + open * 1.9;
      light.intensity = (0.12 + open * 1.3) * breathe;
    },
  };
}

/**
 * A carved stele for the grove shrine: a tapered standing stone with the Aiveth's ritual record cut
 * into its face, lit faintly from within the cuts.
 */
export function buildShrineStele(stone: THREE.Material, runes: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 7), stone);
  base.position.y = 0.09;
  g.add(base);
  const steleShape = new THREE.Shape();
  steleShape.moveTo(-0.32, 0);
  steleShape.lineTo(0.32, 0);
  steleShape.lineTo(0.26, 1.35);
  steleShape.quadraticCurveTo(0, 1.6, -0.26, 1.35);
  steleShape.lineTo(-0.32, 0);
  const stele = new THREE.Mesh(
    new THREE.ExtrudeGeometry(steleShape, { depth: 0.2, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1 }),
    stone,
  );
  stele.position.set(0, 0.18, -0.1);
  stele.castShadow = true;
  g.add(stele);
  const inset = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.62),
    new THREE.MeshStandardMaterial({ map: runes, emissiveMap: runes, emissive: RITE.verdant, emissiveIntensity: 0.7, roughness: 0.9 }),
  );
  inset.position.set(0, 0.95, 0.13);
  g.add(inset);
  // An offering bowl of water at its foot, the Aiveth's habit at every shrine.
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.12, 8), stone);
  bowl.position.set(0.1, 0.24, 0.35);
  g.add(bowl);
  return g;
}
