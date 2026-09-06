import * as THREE from 'three';
import { gameState } from '../../core/GameState';
import { bus } from '../../core/EventBus';
import { UIManager } from '../../ui/UIManager';
import {
  buildConsoleScreenTexture,
  buildStencilPlacardTexture,
  buildWarningStripeTexture,
} from '../ShipTextures';
import {
  buildChairMeshTexture,
  buildControlFaceTexture,
  buildDeskMapTexture,
  buildDripDecalTexture,
  buildMicroMaps,
  buildPlateMaps,
  buildScreenGlassTexture,
  buildScuffDecalTexture,
  buildSeatWearTexture,
  buildSecondaryScreenTexture,
  buildStainDecalTexture,
  buildVentNormalTexture,
  buildVentTexture,
  type MicroKind,
  type PlateVariant,
} from './consoleTextures';
import type { InteriorCtx } from './ctx';
import { ROOM_W, protectSubtree } from './ctx';

const DESK_Z = (-3.6 * 4) / 3;
/** Room-facing surface of the side walls — measured, see docs/interior-room-contract.md. */
const WALL_FACE_X = 5.565;
/**
 * Room-facing face of the desk fascia. The fascia is `chamferBox(2.9, 0.44, 0.74)` centred on
 * DESK_Z, so its front face is at DESK_Z + 0.37 — it is a property of the desk body, not of the
 * room. This used to be `(-3.25 * 4) / 3`: the old 9x12 room's -3.25 scaled by the same 4/3 that
 * moved DESK_Z, while the fascia's own 0.74 depth did not scale, which left every fascia detail
 * 0.097 m off the surface it is bolted to. Measured in reports/interior-nobatch.json: the sub-plate
 * at mesh 589 sits at z -4.332..-4.310 against a fascia face at -4.43, and the grab rail (mesh 630,
 * z -4.338..-4.228) hangs in a 0.042 m air gap in front of the coaming end cap (mesh 627, front
 * face -4.380).
 */
const DESK_FRONT_Z = DESK_Z + 0.37;

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------

/**
 * A box with every edge chamfered, built as a corner-cut rectangle extruded with a bevel. The
 * reference has no sharp 90° prop edge anywhere — every plate and cabinet catches a highlight on
 * a small flat, which is most of what separates "assembled hardware" from "primitive box".
 *
 * Extrude UVs come out in shape units (metres), so every mesh built with this shares one texel
 * density and all the plate materials can run at repeat (1, 1).
 */
function chamferBox(w: number, h: number, d: number, bevel = 0.02): THREE.BufferGeometry {
  const b = Math.min(bevel, w * 0.35, h * 0.35, d * 0.35);
  const iw = w - b * 2;
  const ih = h - b * 2;
  const c = Math.min(b * 2, iw * 0.45, ih * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-iw / 2 + c, -ih / 2);
  shape.lineTo(iw / 2 - c, -ih / 2);
  shape.lineTo(iw / 2, -ih / 2 + c);
  shape.lineTo(iw / 2, ih / 2 - c);
  shape.lineTo(iw / 2 - c, ih / 2);
  shape.lineTo(-iw / 2 + c, ih / 2);
  shape.lineTo(-iw / 2, ih / 2 - c);
  shape.lineTo(-iw / 2, -ih / 2 + c);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - b * 2,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: 0,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.translate(0, 0, -(d / 2 - b));
  geo.computeVertexNormals();
  return geo;
}

/** A plane lying flat, facing +Y — for deck-mounted readouts and control faces. */
function flatPlane(w: number, d: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function mesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/**
 * Everything in a group receives shadow; anything with real bulk also casts one. Contact shadows
 * where the pods, the plinth and the chair castors meet the deck are what ground the station —
 * without them the whole assembly floats no matter how good the materials are. The size gate keeps
 * the shadow passes off the several hundred bolt heads, keycaps and indicator dots, which
 * contribute nothing at this scale and would multiply the cost of every shadow render.
 */
function groundGroup(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat) || !(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
    const std = mat as THREE.MeshStandardMaterial;
    // A lit screen or LED is its own light source: a shadow bar falling across a monitor face
    // reads as a bug, and one casting a shadow is physically backwards. Test the emissive colour,
    // not `emissiveIntensity` — that defaults to 1 on every material, lit or not.
    const emissive = std.emissive.getHex() !== 0x000000 || std.emissiveMap !== null;
    if (emissive && std.emissiveIntensity > 0.25) return;
    // The screen glass overlay is a near-invisible clearcoat pane (opacity 0.05) sized to the whole
    // screen face, so its bounding sphere clears the cast-shadow radius gate below — without this
    // it would throw a solid rectangular shadow off geometry meant to read as barely-there glass.
    if (std.transparent && std.opacity < 0.5) return;
    m.receiveShadow = true;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    if ((m.geometry.boundingSphere?.radius ?? 0) > 0.28) m.castShadow = true;
  });
}

// ---------------------------------------------------------------------------------------------
// Shared material / geometry kit
// ---------------------------------------------------------------------------------------------

interface Kit {
  bone: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  charcoal: THREE.MeshStandardMaterial;
  blackTrim: THREE.MeshStandardMaterial;
  keycap: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
  /**
   * Vent / hazard-stripe materials at a given tile count. Each distinct tiling gets its own
   * cloned texture so the stripe and louvre density stays physically consistent across props of
   * very different sizes, without every mesh allocating its own material.
   */
  tiled(kind: 'vent' | 'hazard', rx: number, ry: number): THREE.MeshStandardMaterial;
  emAmber: THREE.MeshStandardMaterial;
  emCyan: THREE.MeshStandardMaterial;
  emRed: THREE.MeshStandardMaterial;
  /** Reflected-room overlay laid over every screen face — see `addScreen`. */
  screenReflection: THREE.MeshBasicMaterial;
  /** Thin clearcoat pane over every screen face, so real scene lights glint across the glass. */
  screenGlass: THREE.MeshPhysicalMaterial;
  bolt: THREE.BufferGeometry;
  boltUp: THREE.BufferGeometry;
  key: THREE.BufferGeometry;
  led: THREE.BufferGeometry;
  toggle: THREE.BufferGeometry;
  knob: THREE.BufferGeometry;
  bar: THREE.BufferGeometry;
  slat: THREE.BufferGeometry;
}

/** Retile a cached canvas texture without disturbing the shared original's own repeat. */
function tile(src: THREE.Texture, rx: number, ry = rx): THREE.Texture {
  const tex = src.clone();
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  // The source canvas is drawn synchronously before this ever runs, so the clone has real pixel
  // data immediately — unlike an image-backed clone, which must wait on the decode.
  tex.needsUpdate = true;
  return tex;
}

/**
 * A bolted hull plate. `roughness`/`metalness` are left at 1 because three multiplies them into
 * the sampled map, and the whole point of the packed map is that both vary across the surface —
 * a chip is smoother and metallic, a grime run is rough and dielectric. A single scalar pair for
 * a whole material is exactly the "one uniform roughness" read the critique called out.
 */
function plateMaterial(variant: PlateVariant, normalScale = 1): THREE.MeshStandardMaterial {
  const maps = buildPlateMaps(variant);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.ormMap,
    metalnessMap: maps.ormMap,
    roughness: 1,
    metalness: 1,
  });
  mat.normalScale = new THREE.Vector2(normalScale, normalScale);
  return mat;
}

/**
 * Non-plate surfaces. `repeat` is in tiles per metre of extruded UV — the small primitives
 * (knobs, castors, keycaps) carry unit UVs instead, so the same number reads as tiles per prop
 * there, which is why the fine-grained kinds want a high count.
 */
function microMaterial(color: number, kind: MicroKind, repeat: number, normalScale = 1): THREE.MeshStandardMaterial {
  const maps = buildMicroMaps(kind);
  // One retiled instance shared by both channels — roughness and metalness read different
  // channels of the same sampler, so a second clone would upload the identical canvas twice.
  const orm = tile(maps.ormMap, repeat);
  const mat = new THREE.MeshStandardMaterial({
    color,
    map: tile(maps.map, repeat),
    normalMap: tile(maps.normalMap, repeat),
    roughnessMap: orm,
    metalnessMap: orm,
    roughness: 1,
    metalness: 1,
  });
  mat.normalScale = new THREE.Vector2(normalScale, normalScale);
  return mat;
}

function createKit(): Kit {
  const tiledCache = new Map<string, THREE.MeshStandardMaterial>();
  const tiled = (kind: 'vent' | 'hazard', rx: number, ry: number): THREE.MeshStandardMaterial => {
    const key = `${kind}:${rx}:${ry}`;
    const cached = tiledCache.get(key);
    if (cached) return cached;
    const isVent = kind === 'vent';
    const mat = new THREE.MeshStandardMaterial({
      map: tile(isVent ? buildVentTexture() : buildWarningStripeTexture('amber'), rx, ry),
      // A louvre stack is pressed steel — smooth and metallic, with the slat lips picked out by a
      // real normal so they catch a highlight edge-on. Painted hazard stripes are the opposite:
      // matte, dielectric, and scuffed flat by boots.
      roughness: isVent ? 0.44 : 0.86,
      metalness: isVent ? 0.85 : 0.04,
    });
    if (isVent) {
      mat.normalMap = tile(buildVentNormalTexture(), rx, ry);
      mat.normalScale = new THREE.Vector2(1.1, 1.1);
    }
    tiledCache.set(key, mat);
    return mat;
  };

  const kit: Kit = {
    // Painted hull plate: matte dielectric paint with metal showing only where it has chipped.
    bone: plateMaterial('bone', 0.95),
    // Bare brushed structural steel: a real metal, so it lives off reflections and its highlight
    // smears along the brush direction instead of pooling.
    steel: plateMaterial('steel', 1.15),
    // Dark painted composite structure — deliberately dielectric so it still catches ambient
    // rather than crushing to black the way a dark metal does.
    dark: plateMaterial('dark', 0.85),
    // Moulded pebbled composite: recessed panels, bezels, keypad wells. Base lifted with the r3
    // measured crush — this dielectric was already off-black in hex but still reads dark, and a
    // recessed well is exactly where ambient light is weakest.
    charcoal: microMaterial(0x454c56, 'composite', 9),
    // Anodised aluminium trim: fine directional grain, smooth, metallic (see `anodised` spec for
    // why metalness itself was pulled down this round — a near-pure metal has no diffuse term, so
    // its base colour alone couldn't keep it off black outside a direct light's throw).
    blackTrim: microMaterial(0x545b66, 'anodised', 11),
    // Matte moulded keycaps — the one thing on the deck that must NOT catch a specular highlight,
    // which is how a keyboard tray reads as keys rather than as a printed decal.
    keycap: microMaterial(0x3d434b, 'composite', 26, 0.7),
    chrome: microMaterial(0xc2c8cf, 'polished', 7),
    rubber: microMaterial(0x353a41, 'rubber', 15, 1.3),
    fabric: microMaterial(0x454b55, 'fabric', 13, 1.2),
    tiled,
    emAmber: new THREE.MeshStandardMaterial({
      color: 0x2a2118, emissive: 0xffd9a0, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0,
    }),
    emCyan: new THREE.MeshStandardMaterial({
      color: 0x0d2029, emissive: 0x6fe4ff, emissiveIntensity: 0.8, roughness: 0.4, metalness: 0,
    }),
    emRed: new THREE.MeshStandardMaterial({
      color: 0x2a120c, emissive: 0xe0552f, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0,
    }),
    // Unlit reflected-room texture: this is painted light, not a lit surface, so it stays a basic
    // material and rides in normal alpha blending just above the emissive face.
    screenReflection: new THREE.MeshBasicMaterial({
      map: buildScreenGlassTexture(), transparent: true, depthWrite: false, toneMapped: false,
    }),
    // The physical pane itself: near-invisible base colour, a clearcoat so the room's real spot and
    // point lights throw an actual moving glint across the glass instead of the screen's own
    // emissive being the only thing that ever lights it.
    screenGlass: new THREE.MeshPhysicalMaterial({
      color: 0xdce8f0, transparent: true, opacity: 0.05, roughness: 0.16, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.08, depthWrite: false,
    }),
    bolt: new THREE.CylinderGeometry(0.011, 0.013, 0.014, 6),
    boltUp: new THREE.CylinderGeometry(0.011, 0.013, 0.014, 6),
    key: chamferBox(0.038, 0.014, 0.038, 0.005),
    led: new THREE.SphereGeometry(0.012, 8, 6),
    toggle: new THREE.CylinderGeometry(0.005, 0.008, 0.05, 6),
    knob: new THREE.CylinderGeometry(0.026, 0.031, 0.03, 12),
    bar: new THREE.CylinderGeometry(0.013, 0.013, 1, 8),
    slat: new THREE.BoxGeometry(1, 0.014, 0.028),
  };
  // `bolt` faces the viewer along +Z (wall/fascia bolts); `boltUp` stays axis-up for deck plates.
  kit.bolt.rotateX(Math.PI / 2);
  kit.bar.rotateZ(Math.PI / 2);
  return kit;
}

/** Bolt heads at the four corners of a face, inset by `inset`. */
function cornerBolts(parent: THREE.Object3D, kit: Kit, w: number, h: number, z: number, inset = 0.035): void {
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      mesh(parent, kit.bolt, kit.chrome, sx * (w / 2 - inset), sy * (h / 2 - inset), z);
    }
  }
}

function addLed(
  ctx: InteriorCtx,
  parent: THREE.Object3D,
  kit: Kit,
  x: number,
  y: number,
  z: number,
  color: number,
  blink: boolean,
): void {
  if (!blink) {
    const shared = color === 0xe0552f ? kit.emRed : color === 0xffd9a0 ? kit.emAmber : kit.emCyan;
    mesh(parent, kit.led, shared, x, y, z);
    return;
  }
  // Blinking dots need their own material — the shared status loop writes emissiveIntensity.
  const material = new THREE.MeshStandardMaterial({
    color: 0x0c1014, emissive: color, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0,
  });
  const m = mesh(parent, kit.led, material, x, y, z);
  ctx.statusLights.push({ mesh: m, material, phase: (x * 7.3 + y * 3.1 + z * 1.7) % 6.28, onIntensity: 1.1 });
}

/**
 * A single monitor pane. `frame` toggles between two very different jobs:
 *
 * - `frame: true` (the default) is a complete standalone monitor — its own steel surround,
 *   hood and corner bolts — for a screen that really is alone (the journal terminal).
 * - `frame: false` is a bare glass-in-bezel pane with no hardware of its own, for screens that
 *   are windows into a *shared* housing built once by the caller. Six fully-framed monitors
 *   stacked together is exactly the "several screen assets piled on top of each other" read the
 *   critique called out; one housing with six windows in it reads as a single designed
 *   instrument instead.
 */
function addScreen(
  ctx: InteriorCtx,
  parent: THREE.Object3D,
  kit: Kit,
  o: {
    x: number; y: number; z: number; yaw: number; tilt: number; w: number; h: number;
    tex: THREE.Texture; intensity?: number; frame?: boolean;
  },
): THREE.MeshStandardMaterial {
  const g = new THREE.Group();
  g.position.set(o.x, o.y, o.z);
  g.rotation.order = 'YXZ';
  g.rotation.set(o.tilt, o.yaw, 0);
  parent.add(g);

  const framed = o.frame !== false;
  const bw = o.w + (framed ? 0.075 : 0.04);
  const bh = o.h + (framed ? 0.075 : 0.04);
  const bezel = mesh(g, chamferBox(bw, bh, 0.05, 0.013), kit.charcoal, 0, 0, -0.018);
  bezel.castShadow = true;

  if (framed) {
    // A thin bright surround catches the practicals and separates the screen from the dark bank.
    mesh(g, chamferBox(bw + 0.03, bh + 0.03, 0.02, 0.008), kit.steel, 0, 0, -0.045);
  }

  const faceMat = new THREE.MeshStandardMaterial({
    color: 0x0a1620,
    map: o.tex,
    emissive: 0xffffff,
    emissiveMap: o.tex,
    emissiveIntensity: o.intensity ?? 1.2,
    roughness: 0.85,
    metalness: 0,
  });
  mesh(g, new THREE.PlaneGeometry(o.w, o.h), faceMat, 0, 0, 0.014);
  // Glass over the emissive face: a painted room-reflection layer plus a thin clearcoat pane that
  // catches the rig's real lights, so the screen reads as a lit physical surface rather than a
  // texture pasted flat onto the bezel.
  const reflection = mesh(g, new THREE.PlaneGeometry(o.w, o.h), kit.screenReflection, 0, 0, 0.0155);
  reflection.renderOrder = 2;
  const glass = mesh(g, new THREE.PlaneGeometry(o.w, o.h), kit.screenGlass, 0, 0, 0.016);
  glass.renderOrder = 3;

  if (framed) {
    const hood = mesh(g, chamferBox(bw + 0.02, 0.022, 0.085, 0.008), kit.steel, 0, bh / 2 + 0.012, 0.03);
    hood.rotation.x = 0.28;
    // Bolts sit proud of the bezel front face, in the border outside the glass.
    cornerBolts(g, kit, bw, bh, 0.015, 0.019);
  }
  // A small power dot survives on every pane — the one piece of hardware that reads as
  // per-instrument rather than per-cluster, whether or not the cluster owns the framing.
  addLed(ctx, g, kit, bw / 2 - 0.035, -bh / 2 - 0.004, 0.02, 0x6fe4ff, false);

  return faceMat;
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

/** Nav console housing, its monitor bank, the pilot chair, and the two side wall stations. */
export function buildConsole(ctx: InteriorCtx): void {
  const kit = createKit();

  const plinth = buildPlinth(ctx, kit);
  const deskGroup = buildDeskBody(ctx, kit);
  buildDeckSurface(ctx, kit, deskGroup);
  const bank = buildMonitorBank(ctx, kit);
  const podL = buildSidePod(ctx, kit, -1);
  const podR = buildSidePod(ctx, kit, 1);
  const bulkhead = buildRearBulkhead(ctx, kit);
  const chair = buildChair(ctx, kit);
  buildConsoleLights(ctx);

  const groups = [plinth, deskGroup, bank, podL, podR, bulkhead, chair];

  deskGroup.userData.interactable = true;
  ctx.interaction.register({
    object: deskGroup,
    label: () => (gameState.hasFlag('galaxy_revealed') ? 'Open Galaxy Map' : 'Access Navigation Console'),
    range: 2.6,
    onInteract: () => {
      if (gameState.hasFlag('galaxy_revealed')) bus.emit('ui:open_galaxy_map');
      else UIManager.toast('Navigation offline — awaiting system reboot.');
    },
  });
  protectSubtree(ctx, deskGroup);

  groups.push(buildJournalTerminal(ctx, kit));
  groups.push(...buildRepairStation(ctx, kit));

  buildWear(ctx);
  for (const g of groups) groundGroup(g);
}

/**
 * Localised wear laid on as decals, in the three places this station would actually show it: drip
 * runs off the pipe flanges on the rear equipment bank, hand grime along the desk's grab rail, and
 * boot scuffing on the plinth where an operator's feet pivot. Deliberately three small quads
 * rather than a tint — a uniform grime pass over the whole console is the failure mode the brief
 * names, and it also flattens exactly the material contrast the plate maps just bought.
 */
function buildWear(ctx: InteriorCtx): void {
  const drip = new THREE.MeshStandardMaterial({
    map: buildDripDecalTexture(),
    transparent: true,
    roughness: 0.95,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const scuff = new THREE.MeshStandardMaterial({
    map: buildScuffDecalTexture(),
    transparent: true,
    roughness: 0.9,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // Oil seep and an old scorch mark — the r5 critic's "battle damage" call-out. Motivated marks
  // rather than another uniform tint: a leaked fitting and a patched-over short, not a wash.
  const oilStain = new THREE.MeshStandardMaterial({
    map: buildStainDecalTexture('oil'),
    transparent: true,
    roughness: 0.35,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const scorch = new THREE.MeshStandardMaterial({
    map: buildStainDecalTexture('scorch'),
    transparent: true,
    roughness: 0.95,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const decal = (
    mat: THREE.Material,
    w: number,
    h: number,
    pos: [number, number, number],
    rot: [number, number, number],
  ) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    m.renderOrder = 1;
    ctx.scene.add(m);
  };

  // Drips off the pipe run down the face of the rear equipment bank. The texture pools its grime
  // along its own top edge, so the quad's top edge is parked directly under the pipe at y = 0.95.
  decal(drip, 1.5, 0.78, [-1.2, 0.5, -4.4], [0, 0, 0]);
  decal(drip, 1.1, 0.7, [1.5, 0.46, -4.4], [0, 0, 0]);
  // Hand grime bleeding down the desk fascia from under the grab rail, at each end where the
  // grab handles are and people actually take hold.
  decal(drip, 0.6, 0.34, [-1.3, 0.85, -3.2], [0, 0, 0]);
  decal(drip, 0.56, 0.3, [1.3, 0.85, -3.2], [0, 0, 0]);
  // Boot scuffing on the strip of plinth in front of the operator well.
  decal(scuff, 2.6, 0.4, [0, 0.089, -3.03], [-Math.PI / 2, 0, 0]);
  // A second scuffed lane further out, where a walk-up pauses before reaching for the wing pods.
  decal(scuff, 1.6, 0.3, [0, 0.089, -2.55], [-Math.PI / 2, 0, 0]);
  // Leaked-fitting oil stain and an old scorch mark flanking the boot lane — floor damage that
  // reads as lived-in rather than another clean tinted panel.
  decal(oilStain, 0.55, 0.5, [-1.9, 0.089, -3.0], [-Math.PI / 2, 0, 0]);
  decal(scorch, 0.5, 0.46, [1.9, 0.089, -3.0], [-Math.PI / 2, 0, 0]);
  // Impact scorch on the plinth's own deck plate, right where the starboard pod's anchor foot
  // meets it — corrosion/damage at the joint the brief calls out by name.
  decal(scorch, 0.4, 0.36, [2.0, 0.088, -4.15], [-Math.PI / 2, 0, 0]);
}

/**
 * Painted deck pad the whole station stands on, with a hazard-striped nosing. In the reference
 * the console never meets the floor as a bare box — there is always a plinth and a marked-off
 * footprint reading as a serviceable equipment bay.
 */
function buildPlinth(ctx: InteriorCtx, kit: Kit): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, 0, DESK_Z - 0.02);
  ctx.scene.add(g);

  const pad = mesh(g, chamferBox(4.9, 0.085, 1.6, 0.025), kit.bone, 0, 0.043, 0);
  pad.receiveShadow = true;

  // Nosing strip along the walking edge, where a plinth actually gets kicked.
  mesh(g, new THREE.BoxGeometry(4.86, 0.055, 0.022), kit.tiled('hazard', 10, 1), 0, 0.055, 0.8);

  // Recessed service hatches either side of the operator well.
  for (const sx of [-1, 1]) {
    mesh(g, chamferBox(0.7, 0.012, 0.5, 0.008), kit.dark, sx * 1.55, 0.09, 0.32);
    for (const bx of [-0.3, 0.3]) {
      for (const bz of [-0.2, 0.2]) {
        const b = mesh(g, kit.boltUp, kit.chrome, sx * 1.55 + bx, 0.097, 0.32 + bz);
        b.scale.setScalar(0.9);
      }
    }
  }

  // Anchor feet under the side pods.
  for (const sx of [-1, 1]) {
    mesh(g, chamferBox(0.12, 0.1, 0.12, 0.02), kit.steel, sx * 2.2, 0.05, -0.55);
    mesh(g, chamferBox(0.12, 0.1, 0.12, 0.02), kit.steel, sx * 2.2, 0.05, 0.5);
  }

  return g;
}

/**
 * Desk housing: recessed footwell with a grille and a warm under-glow, a panelised bone-painted
 * fascia with raised sub-plates and ribs between them, chamfered end caps and a steel coaming.
 */
function buildDeskBody(ctx: InteriorCtx, kit: Kit): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, 0, DESK_Z);
  ctx.scene.add(g);

  const frontZ = DESK_FRONT_Z - DESK_Z; // +0.35 in desk-local space

  // Toe plate and recessed footwell.
  mesh(g, chamferBox(2.88, 0.11, 0.72, 0.018), kit.dark, 0, 0.055, 0);
  mesh(g, new THREE.BoxGeometry(2.84, 0.05, 0.02), kit.tiled('hazard', 6, 1), 0, 0.135, frontZ + 0.005);
  const well = mesh(g, chamferBox(2.7, 0.48, 0.6, 0.02), kit.charcoal, 0, 0.35, -0.05);
  well.receiveShadow = true;
  mesh(g, new THREE.PlaneGeometry(2.4, 0.36), kit.tiled('vent', 6, 1), 0, 0.35, 0.253);
  // Real slats in front of the vent plate so the recess has parallax, not just a picture.
  for (let i = 0; i < 4; i++) {
    const s = mesh(g, kit.slat, kit.blackTrim, 0, 0.19 + i * 0.1, 0.275);
    s.scale.x = 2.34;
  }
  // Cable trunk and a junction box tucked in the footwell — depth layering under the desk.
  const trunk = mesh(g, new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), kit.rubber, 0, 0.16, 0.1);
  trunk.rotation.z = Math.PI / 2;
  const jbox = mesh(g, chamferBox(0.24, 0.2, 0.14, 0.02), kit.dark, -0.85, 0.33, 0.16);
  addLed(ctx, jbox, kit, 0.07, 0.05, 0.08, 0xe0552f, true);
  addLed(ctx, jbox, kit, 0.07, -0.01, 0.08, 0x6fe4ff, false);

  // Main fascia.
  const fascia = mesh(g, chamferBox(2.9, 0.44, 0.74, 0.024), kit.bone, 0, 0.8, 0);
  fascia.castShadow = true;
  fascia.receiveShadow = true;

  // Five raised sub-plates with bolted corners, split by vertical ribs.
  const plateGeo = chamferBox(0.5, 0.3, 0.022, 0.007);
  const ribGeo = chamferBox(0.05, 0.44, 0.032, 0.009);
  for (let i = 0; i < 5; i++) {
    const x = -1.12 + i * 0.56;
    mesh(g, plateGeo, kit.steel, x, 0.8, frontZ + 0.012);
    const sub = new THREE.Group();
    sub.position.set(x, 0.8, frontZ + 0.024);
    g.add(sub);
    cornerBolts(sub, kit, 0.5, 0.3, 0, 0.045);
  }
  for (let i = 0; i < 4; i++) {
    mesh(g, ribGeo, kit.steel, -0.84 + i * 0.56, 0.8, frontZ + 0.008);
  }

  // Chamfered end caps and steel coaming along the top edge.
  for (const sx of [-1, 1]) {
    mesh(g, chamferBox(0.1, 0.5, 0.8, 0.022), kit.steel, sx * 1.47, 0.79, 0);
    mesh(g, chamferBox(0.06, 0.34, 0.1, 0.012), kit.dark, sx * 1.53, 0.79, frontZ - 0.14);
  }
  for (const sx of [-1, 1]) {
    mesh(g, chamferBox(0.11, 0.075, 0.84, 0.018), kit.steel, sx * 1.46, 1.035, 0);
  }
  mesh(g, chamferBox(3.0, 0.055, 0.18, 0.016), kit.steel, 0, 1.04, -0.34);

  // Front edge rail: a chamfered grab rail with a warm strip light washing the walk-up side.
  mesh(g, chamferBox(2.94, 0.09, 0.11, 0.026), kit.steel, 0, 1.005, frontZ + 0.05);
  mesh(g, new THREE.BoxGeometry(2.5, 0.014, 0.012), kit.emAmber, 0, 0.967, frontZ + 0.104);

  // Placards, one per end, plus a small stencil in the middle of the fascia.
  const idPlate = new THREE.MeshStandardMaterial({
    map: buildStencilPlacardTexture('NAV-01', 'CONSOLE'), roughness: 0.7, metalness: 0.2,
  });
  const busPlate = new THREE.MeshStandardMaterial({
    map: buildStencilPlacardTexture('BUS-C', 'DO NOT ISOLATE'), roughness: 0.7, metalness: 0.2,
  });
  mesh(g, new THREE.PlaneGeometry(0.4, 0.2), idPlate, 1.06, 0.72, frontZ + 0.03);
  mesh(g, new THREE.PlaneGeometry(0.4, 0.2), busPlate, -1.06, 0.72, frontZ + 0.03);

  // Grab handles at each end of the fascia.
  for (const sx of [-1, 1]) {
    const handle = mesh(g, kit.bar, kit.chrome, sx * 1.3, 0.66, frontZ + 0.07);
    handle.scale.x = 0.3;
    for (const hx of [-0.15, 0.15]) {
      mesh(g, chamferBox(0.03, 0.05, 0.09, 0.01), kit.steel, sx * 1.3 + hx, 0.66, frontZ + 0.03);
    }
  }

  return g;
}

/**
 * The tilted work deck. The reference's brightest element by far is the flat glowing chart laid
 * into the desk, not the vertical monitors — this carries it, wrapped in a bezel and surrounded
 * by real keys, toggles, knobs and a couple of left-behind personal props.
 */
function buildDeckSurface(ctx: InteriorCtx, kit: Kit, parent: THREE.Group): void {
  const deck = new THREE.Group();
  deck.position.set(0, 1.09, -0.06);
  deck.rotation.x = 0.22;
  parent.add(deck);

  const plate = mesh(deck, chamferBox(2.86, 0.06, 0.72, 0.016), kit.steel, 0, 0, 0);
  plate.receiveShadow = true;

  // Hero chart, recessed into a dark bezel.
  mesh(deck, chamferBox(2.36, 0.04, 0.46, 0.012), kit.charcoal, 0, 0.04, -0.13);
  const mapMat = new THREE.MeshStandardMaterial({
    color: 0x0a1620,
    map: buildDeskMapTexture(),
    emissive: 0xffffff,
    emissiveMap: buildDeskMapTexture(),
    emissiveIntensity: 1.75,
    roughness: 0.9,
    metalness: 0,
  });
  mesh(deck, flatPlane(2.2, 0.4), mapMat, 0, 0.062, -0.13);
  // Same glass treatment as the monitor bank's screens — the deck chart is the single brightest
  // element in frame, so it is the one the "pasted graphic" read shows up on hardest.
  const chartReflection = mesh(deck, flatPlane(2.2, 0.4), kit.screenReflection, 0, 0.0635, -0.13);
  chartReflection.renderOrder = 2;
  const chartGlass = mesh(deck, flatPlane(2.2, 0.4), kit.screenGlass, 0, 0.065, -0.13);
  chartGlass.renderOrder = 3;

  // Scan bar sliding across the chart — the one moving element on the deck.
  const sweep = mesh(
    deck,
    flatPlane(0.05, 0.4),
    new THREE.MeshBasicMaterial({
      color: 0xa8f0ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    0,
    0.066,
    -0.13,
  );
  sweep.renderOrder = 4;
  ctx.noMerge.add(sweep); // its own position.x is animated per frame, below

  // Bezel side trims with a cool strip either side of the chart.
  for (const sx of [-1, 1]) {
    mesh(deck, chamferBox(0.05, 0.05, 0.46, 0.012), kit.steel, sx * 1.2, 0.045, -0.13);
    mesh(deck, new THREE.BoxGeometry(0.016, 0.012, 0.38), kit.emCyan, sx * 1.2, 0.072, -0.13);
  }

  // Keypads either side of a trackball, on the near strip of the deck.
  const padFaces: [number, string, 'amber' | 'cyan'][] = [
    [-0.74, 'PROP / TRIM', 'amber'],
    [0.74, 'NAV / ENTRY', 'cyan'],
  ];
  for (const [px, label, accent] of padFaces) {
    mesh(deck, chamferBox(0.72, 0.028, 0.22, 0.008), kit.charcoal, px, 0.042, 0.21);
    const faceMat = new THREE.MeshStandardMaterial({
      map: buildControlFaceTexture(label, accent),
      emissive: 0xffffff,
      emissiveMap: buildControlFaceTexture(label, accent),
      emissiveIntensity: 0.35,
      roughness: 0.85,
      metalness: 0.05,
    });
    mesh(deck, flatPlane(0.68, 0.2), faceMat, px, 0.058, 0.21);
    // Physical keys standing proud of the printed face.
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 6; c++) {
        const k = mesh(deck, kit.key, r === 0 && c === 5 ? kit.emAmber : kit.keycap,
          px - 0.25 + c * 0.1, 0.066, 0.165 + r * 0.085);
        k.scale.set(0.95, 1, 0.95);
      }
    }
  }

  // Trackball in a machined ring.
  mesh(deck, new THREE.CylinderGeometry(0.075, 0.085, 0.03, 16), kit.steel, 0, 0.045, 0.21);
  mesh(deck, new THREE.SphereGeometry(0.052, 14, 10), kit.rubber, 0, 0.07, 0.21);
  for (const sx of [-1, 1]) {
    mesh(deck, chamferBox(0.07, 0.02, 0.05, 0.006), kit.keycap, sx * 0.13, 0.055, 0.21);
  }

  // Toggle bank along the very front lip of the deck.
  for (let i = 0; i < 11; i++) {
    const x = -1.15 + i * 0.23;
    mesh(deck, chamferBox(0.11, 0.022, 0.07, 0.008), kit.charcoal, x, 0.04, 0.325);
    const t = mesh(deck, kit.toggle, kit.chrome, x, 0.075, 0.325);
    t.rotation.x = i % 3 === 0 ? 0.6 : -0.5;
    mesh(deck, kit.led, i % 3 === 0 ? kit.emAmber : kit.emCyan, x, 0.052, 0.36);
  }

  // Rotary knobs and a chunky throttle-style lever at the outer ends of the deck.
  for (const sx of [-1, 1]) {
    mesh(deck, kit.knob, kit.keycap, sx * 1.3, 0.05, 0.06);
    mesh(deck, kit.knob, kit.keycap, sx * 1.3, 0.05, 0.2);
    mesh(deck, new THREE.BoxGeometry(0.008, 0.012, 0.03), kit.emAmber, sx * 1.3, 0.068, 0.075);
  }
  const leverBase = mesh(deck, chamferBox(0.13, 0.04, 0.14, 0.012), kit.charcoal, 1.28, 0.05, -0.12);
  const lever = mesh(deck, new THREE.CylinderGeometry(0.012, 0.016, 0.15, 8), kit.chrome, 1.28, 0.12, -0.12);
  lever.rotation.x = -0.4;
  mesh(deck, new THREE.SphereGeometry(0.026, 10, 8), kit.rubber, 1.28, 0.19, -0.15);
  leverBase.castShadow = true;

  // Indicator strip above the keypads.
  for (let i = 0; i < 8; i++) {
    const x = -0.32 + i * 0.09;
    addLed(ctx, deck, kit, x, 0.05, 0.3, i % 4 === 0 ? 0xe0552f : i % 3 === 0 ? 0xffd9a0 : 0x6fe4ff, i % 2 === 0);
  }

  // Lived-in props: a data slate left on the deck and a dented mug.
  const slate = mesh(deck, chamferBox(0.24, 0.016, 0.17, 0.008), kit.blackTrim, -1.3, 0.042, -0.14);
  slate.rotation.y = 0.42;
  const slateFace = mesh(
    deck,
    flatPlane(0.2, 0.13),
    new THREE.MeshStandardMaterial({
      color: 0x0d2029, emissive: 0x6fe4ff, emissiveIntensity: 0.45, roughness: 0.5, metalness: 0,
    }),
    -1.3,
    0.052,
    -0.14,
  );
  slateFace.rotation.y = 0.42;
  mesh(deck, new THREE.CylinderGeometry(0.038, 0.032, 0.09, 14), kit.bone, -1.32, 0.075, 0.1);
  const handle = mesh(deck, new THREE.TorusGeometry(0.028, 0.007, 6, 12), kit.bone, -1.28, 0.075, 0.06);
  handle.rotation.y = Math.PI / 2;

  ctx.animated.push((elapsed) => {
    mapMat.emissiveIntensity = 1.72 + Math.sin(elapsed * 1.3) * 0.1;
    sweep.position.x = Math.sin(elapsed * 0.42) * 1.02;
  });
}

/**
 * Two-tier monitor bank on a dark bulkhead. The reference reads as a wall of instrumentation
 * wrapping the operator: a lower row angled up off the deck and an upper row nearly vertical,
 * carried on stanchions with a crossbeam, cable runs and vent boxes behind.
 */
function buildMonitorBank(ctx: InteriorCtx, kit: Kit): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, 0, DESK_Z);
  ctx.scene.add(g);

  // Dark backplane so the screens read against near-black, as in the reference. This is the
  // instrument's single housing: every screen below is unframed and sits in it as a cut window,
  // so the bank reads as one milled unit wrapping six displays rather than six separate monitors
  // set side by side.
  const back = mesh(g, chamferBox(3.05, 1.14, 0.12, 0.025), kit.dark, 0, 1.44, -0.66);
  back.castShadow = true;
  back.receiveShadow = true;
  // One steel frame around the whole housing, with the bolts that used to ring every individual
  // screen moved here — a dozen bolts holding down one cabinet, not four bolts times six panes.
  // The top edge is already carried by the existing coaming bar just below; only the bottom
  // needs a matching rail to close the frame.
  mesh(g, chamferBox(3.11, 0.05, 0.14, 0.012), kit.steel, 0, 1.44 - 0.57, -0.66);
  cornerBolts(g, kit, 3.05, 1.14, -0.595, 0.06);

  // Mullions tying the two tiers into one grid instead of a stack of loose panes: a horizontal
  // rail between the rows, and a vertical divider between each screen within a row.
  mesh(g, chamferBox(2.92, 0.045, 0.2, 0.012), kit.steel, 0, 1.635, -0.52);
  for (const sx of [-1, 1]) {
    const lowerDiv = mesh(g, chamferBox(0.03, 0.5, 0.16, 0.008), kit.steel, sx * 0.51, 1.485, -0.46);
    lowerDiv.rotation.x = -0.28;
    const upperDiv = mesh(g, chamferBox(0.03, 0.42, 0.14, 0.008), kit.steel, sx * 0.41, 1.805, -0.57);
    upperDiv.rotation.x = -0.07;
  }
  // Single shared canopy over the whole upper row, replacing what used to be three individual
  // screen hoods — one roof over the instrument, not one roof per pane.
  const canopy = mesh(g, chamferBox(2.5, 0.05, 0.16, 0.014), kit.steel, 0, 1.98, -0.5);
  canopy.rotation.x = 0.3;
  canopy.castShadow = true;

  for (const sx of [-1, 1]) {
    mesh(g, chamferBox(0.11, 1.06, 0.22, 0.024), kit.steel, sx * 1.36, 1.44, -0.54);
    mesh(g, chamferBox(0.16, 0.12, 0.28, 0.02), kit.charcoal, sx * 1.36, 0.93, -0.54);
    // Vent boxes flanking the bank.
    mesh(g, chamferBox(0.3, 0.34, 0.08, 0.014), kit.charcoal, sx * 1.36, 1.74, -0.42);
    mesh(g, new THREE.PlaneGeometry(0.24, 0.28), kit.tiled('vent', 1, 1), sx * 1.36, 1.74, -0.375);
    addLed(ctx, g, kit, sx * 1.36, 1.5, -0.42, sx < 0 ? 0xe0552f : 0x6fe4ff, true);
  }
  mesh(g, chamferBox(3.0, 0.09, 0.2, 0.024), kit.steel, 0, 2.06, -0.66);

  // Riser the lower screen row is actually mounted on. The reference's screens rise out of a
  // solid stepped housing; leaving daylight under them is what makes a bank read as floating.
  const riser = mesh(g, chamferBox(2.92, 0.24, 0.22, 0.022), kit.steel, 0, 1.05, -0.36);
  riser.rotation.x = -0.16;
  riser.castShadow = true;
  mesh(g, chamferBox(2.96, 0.045, 0.28, 0.014), kit.bone, 0, 1.175, -0.38);
  for (let i = 0; i < 6; i++) {
    const x = -1.15 + i * 0.46;
    mesh(g, chamferBox(0.3, 0.12, 0.03, 0.008), kit.charcoal, x, 1.06, -0.26);
    addLed(ctx, g, kit, x + 0.19, 1.06, -0.25, i % 3 === 0 ? 0xe0552f : 0x6fe4ff, i % 2 === 0);
  }

  const navTex = buildConsoleScreenTexture('nav');
  const commsTex = buildConsoleScreenTexture('comms');
  const statusTex = buildConsoleScreenTexture('status');
  const sysTex = buildSecondaryScreenTexture('sys');
  const diagTex = buildSecondaryScreenTexture('diag');

  const faces: THREE.MeshStandardMaterial[] = [];
  // Lower tier — wide, angled up off the deck. Bottom edge clears the deck's raised back lip.
  // `frame: false` on every pane here: the housing built above already owns the surround, the
  // hood and the bolts, so these six calls contribute only glass in a thin recess.
  faces.push(addScreen(ctx, g, kit, { x: -0.93, y: 1.47, z: -0.44, yaw: 0.26, tilt: -0.3, w: 0.82, h: 0.44, tex: navTex, frame: false }));
  faces.push(addScreen(ctx, g, kit, { x: 0, y: 1.5, z: -0.48, yaw: 0, tilt: -0.26, w: 1.06, h: 0.48, tex: commsTex, intensity: 1.35, frame: false }));
  faces.push(addScreen(ctx, g, kit, { x: 0.93, y: 1.47, z: -0.44, yaw: -0.26, tilt: -0.3, w: 0.82, h: 0.44, tex: statusTex, frame: false }));
  // Upper tier — near vertical and set 12 cm further back, so it steps up behind the lower row
  // rather than stacking clear of it. Its bottom edge is deliberately overlapped.
  faces.push(addScreen(ctx, g, kit, { x: -0.79, y: 1.79, z: -0.56, yaw: 0.18, tilt: -0.08, w: 0.6, h: 0.28, tex: sysTex, intensity: 1.5, frame: false }));
  faces.push(addScreen(ctx, g, kit, { x: 0, y: 1.82, z: -0.58, yaw: 0, tilt: -0.06, w: 0.66, h: 0.3, tex: navTex, intensity: 1.5, frame: false }));
  faces.push(addScreen(ctx, g, kit, { x: 0.79, y: 1.79, z: -0.56, yaw: -0.18, tilt: -0.08, w: 0.6, h: 0.28, tex: diagTex, intensity: 1.5, frame: false }));

  // Cable looms dropping from the bank down behind the desk.
  const cableMat = kit.rubber;
  for (const [sx, r] of [[-1, 0.016], [1, 0.014], [-1, 0.011]] as const) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * (0.5 + r * 12), 1.9, -0.55),
      new THREE.Vector3(sx * (0.62 + r * 8), 1.5, -0.66),
      new THREE.Vector3(sx * 0.7, 1.05, -0.6),
      new THREE.Vector3(sx * 0.62, 0.6, -0.5),
      new THREE.Vector3(sx * 0.5, 0.12, -0.4),
    ]);
    mesh(g, new THREE.TubeGeometry(curve, 18, r, 6, false), cableMat, 0, 0, 0);
  }
  // Cable clamps on the backplane.
  for (let i = 0; i < 4; i++) {
    mesh(g, chamferBox(0.06, 0.05, 0.05, 0.01), kit.steel, -0.75 + i * 0.5, 1.02, -0.56);
  }

  ctx.animated.push((elapsed) => {
    for (let i = 0; i < faces.length; i++) {
      faces[i].emissiveIntensity = 1.18 + Math.sin(elapsed * (1.1 + i * 0.17) + i) * 0.07;
    }
  });

  return g;
}

/**
 * The flanking wedge pods. These are the single biggest structural thing the reference has and
 * the previous pass did not: the console silhouette is a wide W, with chunky sloped cabinets
 * either side of a low centre desk, not one isolated box.
 */
function buildSidePod(ctx: InteriorCtx, kit: Kit, sign: -1 | 1): THREE.Group {
  const g = new THREE.Group();
  // 1.86 is a fixed offset from the desk centre (how far the pod flanks the console), not a
  // room-scale position, so it stays put while DESK_Z carries the whole assembly to its new spot.
  g.position.set(sign * 1.86, 0, DESK_Z + 0.04);
  g.rotation.y = -sign * 0.17;
  ctx.scene.add(g);

  // Base plinth with a hazard kick strip.
  mesh(g, chamferBox(0.94, 0.14, 1.0, 0.024), kit.dark, 0, 0.07, 0);
  mesh(g, new THREE.BoxGeometry(0.9, 0.055, 0.02), kit.tiled('hazard', 2, 1), 0, 0.11, 0.505);

  // Main body.
  const body = mesh(g, chamferBox(0.88, 0.78, 0.94, 0.03), kit.steel, 0, 0.53, 0);
  body.castShadow = true;
  body.receiveShadow = true;

  // Outer flank: recessed dark panel, a louvre insert and a stencil placard.
  const outer = new THREE.Group();
  outer.position.set(sign * 0.44, 0.53, 0);
  outer.rotation.y = sign * (Math.PI / 2);
  g.add(outer);
  mesh(outer, chamferBox(0.78, 0.56, 0.03, 0.01), kit.charcoal, 0, 0.02, 0.01);
  mesh(outer, new THREE.PlaneGeometry(0.34, 0.4), kit.tiled('vent', 1, 1), -0.18, 0.02, 0.03);
  const podPlacard = new THREE.MeshStandardMaterial({
    map: buildStencilPlacardTexture(sign < 0 ? 'PORT' : 'STBD', 'AUX BUS'), roughness: 0.72, metalness: 0.2,
  });
  mesh(outer, new THREE.PlaneGeometry(0.3, 0.15), podPlacard, 0.16, 0.06, 0.03);
  cornerBolts(outer, kit, 0.78, 0.56, 0.03, 0.05);
  for (let i = 0; i < 3; i++) {
    addLed(ctx, outer, kit, 0.08 + i * 0.08, -0.13, 0.04, i === 1 ? 0xffd9a0 : 0x6fe4ff, i === 1);
  }

  // Inner flank, facing the operator: cable port, coiled hose, grab handle.
  const inner = new THREE.Group();
  inner.position.set(-sign * 0.44, 0.53, 0);
  inner.rotation.y = -sign * (Math.PI / 2);
  g.add(inner);
  mesh(inner, chamferBox(0.6, 0.42, 0.025, 0.01), kit.charcoal, 0, 0.02, 0.01);
  mesh(inner, new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), kit.steel, -0.16, 0.04, 0.03)
    .rotateX(Math.PI / 2);
  mesh(inner, new THREE.TorusGeometry(0.07, 0.016, 6, 14), kit.rubber, 0.14, 0.0, 0.05);
  const bar = mesh(inner, kit.bar, kit.chrome, 0, -0.3, 0.07);
  bar.scale.x = 0.42;
  for (const hx of [-0.2, 0.2]) {
    mesh(inner, chamferBox(0.03, 0.05, 0.08, 0.01), kit.steel, hx, -0.3, 0.035);
  }

  // Front end cap: bevelled nose plate, LED bank, handle.
  const nose = new THREE.Group();
  nose.position.set(0, 0.52, 0.48);
  g.add(nose);
  mesh(nose, chamferBox(0.8, 0.62, 0.06, 0.02), kit.steel, 0, 0, 0);
  mesh(nose, chamferBox(0.56, 0.36, 0.03, 0.01), kit.charcoal, 0, 0.04, 0.035);
  for (let i = 0; i < 5; i++) {
    addLed(ctx, nose, kit, -0.2 + i * 0.1, 0.13, 0.06, i === 2 ? 0xe0552f : 0x6fe4ff, i % 2 === 1);
  }
  mesh(nose, new THREE.PlaneGeometry(0.4, 0.11), kit.tiled('vent', 1, 0.3), 0, -0.04, 0.05);
  cornerBolts(nose, kit, 0.8, 0.62, 0.035, 0.05);
  const grab = mesh(nose, kit.bar, kit.chrome, 0, -0.22, 0.09);
  grab.scale.x = 0.4;

  // Angled control face across the top, sloping down toward the centre aisle.
  const top = new THREE.Group();
  top.position.set(0, 0.94, -0.02);
  top.rotation.order = 'YXZ';
  top.rotation.set(-0.12, 0, sign * 0.26);
  g.add(top);

  const topPlate = mesh(top, chamferBox(0.86, 0.07, 0.9, 0.018), kit.steel, 0, 0, 0);
  topPlate.castShadow = true;
  mesh(top, chamferBox(0.68, 0.035, 0.62, 0.012), kit.charcoal, 0, 0.05, -0.04);
  const faceTex = buildControlFaceTexture(sign < 0 ? 'PORT AUX' : 'STBD AUX', sign < 0 ? 'amber' : 'cyan');
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTex, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.4,
    roughness: 0.85, metalness: 0.05,
  });
  mesh(top, flatPlane(0.62, 0.56), faceMat, 0, 0.07, -0.04);

  // Real keys, knobs and a small readout standing proud of the printed face.
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const k = mesh(top, kit.key, r === 2 && c === 4 ? kit.emRed : kit.keycap,
        -0.2 + c * 0.1, 0.078, -0.16 + r * 0.09);
      k.scale.set(0.9, 1, 0.9);
    }
  }
  for (const kx of [-0.22, 0.22]) {
    mesh(top, kit.knob, kit.keycap, kx, 0.07, 0.22);
    mesh(top, new THREE.BoxGeometry(0.008, 0.012, 0.028), kit.emAmber, kx, 0.088, 0.235);
  }
  mesh(top, chamferBox(0.3, 0.03, 0.16, 0.008), kit.charcoal, 0, 0.06, 0.24);
  mesh(top, flatPlane(0.26, 0.12), kit.emCyan, 0, 0.078, 0.24);
  for (let i = 0; i < 4; i++) {
    addLed(ctx, top, kit, -0.3, 0.078, -0.24 + i * 0.09, i === 0 ? 0xe0552f : 0xffd9a0, i % 2 === 0);
  }

  // Raised outer shoulder rail — the chunky lip that gives the pod its reference silhouette.
  mesh(g, chamferBox(0.13, 0.2, 0.94, 0.03), kit.bone, sign * 0.42, 1.02, 0);
  mesh(g, chamferBox(0.09, 0.03, 0.86, 0.012), kit.steel, sign * 0.42, 1.13, 0);
  mesh(g, new THREE.BoxGeometry(0.02, 0.012, 0.7), kit.emAmber, sign * 0.47, 1.06, 0);

  // Rear utility stack behind the pod, so the pod is not flush against empty floor. This sits well
  // back from the key light's throw, so the r6 critique's "soft, underdetailed background unit"
  // is squarely aimed here: a rim strip along its top edge separates it from the near-black behind
  // it, and a second small junction box gives it a silhouette break instead of one flat slab.
  const stack = mesh(g, chamferBox(0.5, 0.44, 0.26, 0.02), kit.dark, 0, 0.36, -0.62);
  stack.castShadow = true;
  mesh(g, new THREE.PlaneGeometry(0.36, 0.28), kit.tiled('vent', 1, 1), 0, 0.36, -0.49);
  // Front face is at z = -0.49 (matches the vent plane above); the trim, box and LED below all sit
  // proud of it rather than embedded in the block, so they actually read at this angle.
  mesh(g, new THREE.BoxGeometry(0.44, 0.014, 0.012), kit.emCyan, 0, 0.575, -0.483);
  const stackBox = mesh(g, chamferBox(0.16, 0.14, 0.1, 0.014), kit.steel, sign * 0.2, 0.62, -0.44);
  stackBox.castShadow = true;
  addLed(ctx, g, kit, sign * 0.2, 0.62, -0.385, 0xffd9a0, true);
  const conduit = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.75, -0.62),
    new THREE.Vector3(-sign * 0.35, 0.9, -0.72),
    new THREE.Vector3(-sign * 0.9, 0.7, -0.85),
    new THREE.Vector3(-sign * 1.4, 0.35, -0.85),
  ]);
  mesh(g, new THREE.TubeGeometry(conduit, 16, 0.03, 6, false), kit.rubber, 0, 0, 0);

  return g;
}

/** Low equipment bank behind the console so the bulkhead is never a bare wall in frame. */
function buildRearBulkhead(ctx: InteriorCtx, kit: Kit): THREE.Group {
  const g = new THREE.Group();
  // -1.02 is the desk-relative offset (old DESK_Z -3.6, bulkhead -4.62), kept fixed under the new
  // DESK_Z so the bank still sits directly behind the console.
  g.position.set(0, 0, DESK_Z - 1.02);
  ctx.scene.add(g);

  const back = mesh(g, chamferBox(4.4, 0.82, 0.36, 0.026), kit.dark, 0, 0.44, 0);
  back.castShadow = true;
  mesh(g, chamferBox(4.44, 0.07, 0.42, 0.016), kit.steel, 0, 0.88, 0);
  mesh(g, new THREE.BoxGeometry(4.36, 0.05, 0.02), kit.tiled('hazard', 9, 1), 0, 0.09, 0.185);
  // Rim strip under the top rail: this bank sits behind the rake key's throw, so without an edge
  // light of its own its silhouette bleeds into the near-black wall behind it — the r6 critique's
  // "background units read soft" call-out. A single cool line along the whole top edge fixes the
  // read cheaply, the same trick the reference uses on its own rear equipment.
  mesh(g, new THREE.BoxGeometry(4.3, 0.012, 0.01), kit.emCyan, 0, 0.845, 0.205);

  for (let i = 0; i < 4; i++) {
    const x = -1.65 + i * 1.1;
    mesh(g, chamferBox(0.86, 0.6, 0.04, 0.012), kit.charcoal, x, 0.46, 0.185);
    mesh(g, new THREE.PlaneGeometry(0.7, 0.44), kit.tiled('vent', 2, 1), x, 0.46, 0.21);
    const sub = new THREE.Group();
    sub.position.set(x, 0.46, 0.215);
    g.add(sub);
    cornerBolts(sub, kit, 0.86, 0.6, 0, 0.055);
    addLed(ctx, g, kit, x + 0.36, 0.76, 0.21, i % 2 === 0 ? 0x6fe4ff : 0xffd9a0, i % 2 === 0);
  }
  // Raised gussets between and outboard of the four sub-panels, breaking the bank into a genuinely
  // ribbed structure instead of one wide dark slab with cutouts.
  for (const x of [-2.15, -1.1, 0, 1.1, 2.15]) {
    const rib = mesh(g, chamferBox(0.07, 0.7, 0.06, 0.016), kit.steel, x, 0.46, 0.19);
    rib.castShadow = true;
  }

  // Pipe run across the top of the bank.
  const pipe = mesh(g, new THREE.CylinderGeometry(0.045, 0.045, 4.2, 10), kit.steel, 0, 0.95, -0.02);
  pipe.rotation.z = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const c = mesh(g, new THREE.CylinderGeometry(0.055, 0.055, 0.07, 10), kit.blackTrim, -1.7 + i * 0.85, 0.95, -0.02);
    c.rotation.z = Math.PI / 2;
  }

  return g;
}

/**
 * Pilot chair. Rebuilt as a real mesh-back operator chair — contoured seat, framed back with a
 * lumbar bar and headrest, padded armrests on L-posts, a sleeved gas column and a five-star base
 * on actual castors — instead of the previous stack of primitives.
 */
function buildChair(ctx: InteriorCtx, kit: Kit): THREE.Group {
  const g = new THREE.Group();
  // Tucked right up against the desk. Parked further out it sat barely a metre off the framing
  // camera and its back panel covered the deck chart, which is the piece's focal element. 0.74 is
  // the desk-relative offset (DESK_Z was -3.6 for a chair at -2.86), kept fixed under the new DESK_Z.
  g.position.set(0, 0, DESK_Z + 0.74);
  ctx.scene.add(g);

  const meshTex = buildChairMeshTexture();
  meshTex.repeat.set(7, 9);
  // alphaTest rather than transparency: the strands stay depth-writing, so the chart reads
  // through the weave without any sorting artefacts against the emissive deck.
  // The weave is a genuinely different material from the frame it hangs in: matte woven polymer
  // against anodised metal. It is also the single largest dark area in the framed shot, so its
  // value is held well off black — a mesh back lit from behind by the deck chart never goes to
  // zero in the reference.
  const meshBack = new THREE.MeshStandardMaterial({
    color: 0x454b55, alphaMap: meshTex, alphaTest: 0.5, side: THREE.DoubleSide,
    roughness: 0.94, metalness: 0.03,
  });
  // Was a flat, mapless MeshStandardMaterial — exactly the "one uniform roughness, no texture"
  // read the critique calls out. A moulded composite shell gets real pebbled grain instead.
  const seatShell = microMaterial(0x30363e, 'composite', 12);
  const wearMat = new THREE.MeshStandardMaterial({
    map: buildSeatWearTexture(),
    transparent: true,
    roughness: 0.9,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const oilRing = new THREE.MeshStandardMaterial({
    map: buildStainDecalTexture('oil'),
    transparent: true,
    roughness: 0.35,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  // Base: five tapered legs with castor yokes and wheels.
  const legGeo = chamferBox(0.055, 0.05, 0.34, 0.014);
  const yokeGeo = chamferBox(0.05, 0.06, 0.04, 0.01);
  const wheelGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.022, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 + 0.3;
    const leg = new THREE.Mesh(legGeo, kit.blackTrim);
    leg.position.set(Math.sin(a) * 0.19, 0.075, Math.cos(a) * 0.19);
    leg.rotation.y = a;
    leg.castShadow = true;
    g.add(leg);

    const yoke = new THREE.Mesh(yokeGeo, kit.blackTrim);
    yoke.position.set(Math.sin(a) * 0.34, 0.055, Math.cos(a) * 0.34);
    yoke.rotation.y = a;
    g.add(yoke);

    const wheel = new THREE.Mesh(wheelGeo, kit.rubber);
    wheel.position.set(Math.sin(a) * 0.34, 0.03, Math.cos(a) * 0.34);
    wheel.rotation.y = a;
    g.add(wheel);
  }
  mesh(g, new THREE.CylinderGeometry(0.075, 0.09, 0.08, 14), kit.blackTrim, 0, 0.1, 0);

  // Gas column with a chrome sleeve.
  mesh(g, new THREE.CylinderGeometry(0.035, 0.04, 0.3, 12), kit.blackTrim, 0, 0.26, 0);
  mesh(g, new THREE.CylinderGeometry(0.028, 0.028, 0.14, 12), kit.chrome, 0, 0.42, 0);
  mesh(g, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), kit.blackTrim, 0, 0.49, 0);

  // Tilt mechanism and seat pan.
  mesh(g, chamferBox(0.24, 0.05, 0.28, 0.012), kit.blackTrim, 0, 0.5, 0.01);
  const lever = mesh(g, new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), kit.chrome, 0.15, 0.5, 0.06);
  lever.rotation.z = Math.PI / 2;

  const seat = mesh(g, chamferBox(0.5, 0.1, 0.48, 0.045), kit.fabric, 0, 0.56, 0);
  seat.castShadow = true;
  mesh(g, chamferBox(0.46, 0.03, 0.44, 0.02), seatShell, 0, 0.615, -0.01);
  // Front edge waterfall.
  mesh(g, chamferBox(0.46, 0.055, 0.06, 0.022), kit.fabric, 0, 0.545, -0.24);
  // Sat-in wear: a compressed sheen where an operator actually sits, dulling to grime at the
  // edges — the chair half of the r5 critique's "clean/CG" call-out.
  const seatWear = mesh(g, flatPlane(0.44, 0.42), wearMat, 0, 0.633, -0.01);
  seatWear.renderOrder = 1;
  // An old oil ring on the deck where the castor base has sat and leaked, unmoved, for years.
  const baseRing = mesh(g, flatPlane(0.7, 0.7), oilRing, 0, 0.004, 0);
  baseRing.renderOrder = 1;

  // Back frame: side rails, top rail, and a mesh panel between them.
  const backPivot = new THREE.Group();
  backPivot.position.set(0, 0.6, 0.22);
  backPivot.rotation.x = -0.17;
  g.add(backPivot);
  for (const sx of [-1, 1]) {
    mesh(backPivot, chamferBox(0.045, 0.5, 0.05, 0.014), kit.blackTrim, sx * 0.22, 0.26, 0);
  }
  mesh(backPivot, chamferBox(0.49, 0.05, 0.055, 0.016), kit.blackTrim, 0, 0.52, 0);
  mesh(backPivot, chamferBox(0.44, 0.05, 0.05, 0.016), kit.blackTrim, 0, 0.04, 0);
  const backPanel = mesh(backPivot, new THREE.PlaneGeometry(0.42, 0.42), meshBack, 0, 0.28, -0.008);
  backPanel.castShadow = true;
  // Lumbar bar and headrest.
  mesh(backPivot, chamferBox(0.42, 0.06, 0.05, 0.018), kit.fabric, 0, 0.13, -0.03);
  mesh(backPivot, chamferBox(0.06, 0.1, 0.04, 0.012), kit.blackTrim, 0, 0.58, 0);
  const head = mesh(backPivot, chamferBox(0.34, 0.12, 0.08, 0.018), kit.fabric, 0, 0.67, -0.02);
  head.castShadow = true;

  // Armrests on L-posts.
  for (const sx of [-1, 1]) {
    mesh(g, chamferBox(0.04, 0.2, 0.05, 0.012), kit.blackTrim, sx * 0.26, 0.68, 0.11);
    mesh(g, chamferBox(0.05, 0.03, 0.26, 0.012), kit.blackTrim, sx * 0.26, 0.79, 0.02);
    mesh(g, chamferBox(0.075, 0.035, 0.24, 0.016), kit.fabric, sx * 0.26, 0.815, 0.02);
    // Hand-worn sheen down the middle of the pad, where every reach for the console rubs it.
    const armWear = mesh(g, flatPlane(0.06, 0.2), wearMat, sx * 0.26, 0.834, 0.02);
    armWear.renderOrder = 1;
  }

  return g;
}

/**
 * Cool console pool plus a warm footwell practical. Fixture types stay separated: everything
 * belonging to the console reads cool, and only the recessed under-desk strip is warm.
 */
function buildConsoleLights(ctx: InteriorCtx): void {
  // Raking key over the station's front-right shoulder, agreeing in direction with the room's own
  // overhead key so the two sets of shadows read as one source. This is the light the material
  // work is for: a near-frontal point light lands flat on everything, whereas a steep off-axis
  // one puts every chamfer, coaming lip and bolt head on the terminator, which is what makes a
  // surface read as metal rather than as tinted clay. A spot's single shadow map is also a sixth
  // of the cost of the point-light cubemap this replaces, which pays for the extra casters.
  const rake = new THREE.SpotLight(0xcfe2f2, 4.6, 9.5, 0.72, 0.55, 2);
  rake.position.set(2.9, 3.45, DESK_Z + 3.1);
  rake.target.position.set(-0.35, 0.95, DESK_Z - 0.1);
  rake.castShadow = true;
  rake.shadow.mapSize.set(1024, 1024);
  rake.shadow.camera.near = 0.6;
  rake.shadow.camera.far = 9.5;
  rake.shadow.bias = -0.0009;
  rake.shadow.normalBias = 0.022;
  ctx.scene.add(rake.target);
  ctx.scene.add(rake);

  // Cool console pool, pulsed by the shared glow loop. No longer the shadow caster — with the
  // rake taking that job this can sit close in and stay soft.
  const keyLight = new THREE.PointLight(0x38c4f0, 1.0, 6, 2);
  keyLight.position.set(0, 2.0, DESK_Z + 0.7);
  ctx.scene.add(keyLight);
  ctx.consoleGlow.push(keyLight);

  // Spill from the deck chart onto the operator's side of the desk. Kept out of consoleGlow so
  // the shared pulse loop can't drive it to a blown-out level right on top of the geometry.
  const deckSpill = new THREE.PointLight(0x5fd4f0, 0.85, 3.2, 2);
  deckSpill.position.set(0, 1.32, DESK_Z + 0.5);
  ctx.scene.add(deckSpill);

  // Warm practical inside the footwell recess, the only warm source on this piece.
  const footwell = new THREE.PointLight(0xffc98a, 0.5, 1.9, 2);
  footwell.position.set(0, 0.3, DESK_Z + 0.26);
  ctx.scene.add(footwell);

  // Deck bounce. The measured render had fourteen percent of its pixels at pure black against the
  // reference's near-zero, almost all of it under the desk lip, inside the footwell and behind
  // the pods. A dim up-facing fill off the bright deck is what a real room does there; it lifts
  // those areas onto the brief's #2b3138 shadow floor without touching the mid-tones, which
  // measured too bright and must not go up.
  const bounce = new THREE.PointLight(0x9fb0c4, 0.55, 5.5, 1.4);
  bounce.position.set(0, 0.18, DESK_Z + 1.2);
  ctx.scene.add(bounce);

  // Rear fill, behind the console. The r3 measurement (23% crushed vs the reference's 0.06%) is
  // dominated by this side of the assembly: the monitor bank's dark backplane, the rear bulkhead
  // and the pods' rear utility stacks all sit behind the rake spot's throw and the other point
  // lights above, which cluster over the desk and footwell in front. None of that geometry is a
  // light source itself, so without a source back here it renders on ambient/hemisphere fill
  // alone — ambient is what an environment reflecting mostly dark space cannot supply to a large
  // flat surface. A single low, wide fill covers the backplane, the bulkhead and both pod rears at
  // once without reading as a second key light.
  const rearFill = new THREE.PointLight(0x7c8fa2, 0.6, 3.1, 1.6);
  rearFill.position.set(0, 1.0, DESK_Z - 0.8);
  ctx.scene.add(rearFill);
}

/** Wall-mounted travel-log terminal: hooded screen, keyboard shelf, service cabinet below. */
function buildJournalTerminal(ctx: InteriorCtx, kit: Kit): THREE.Group {
  const g = new THREE.Group();
  // The terminal is this room's first objective ("Review the travel logs"), and it was invisible.
  // `-ROOM_W / 2 + 0.06` assumed the wall face was at x = -6; the kit shell's is at -5.565
  // (docs/interior-room-contract.md), so the whole assembly — backplate, screen, keyboard shelf and
  // cabinet, 42 meshes measuring x [-5.98, -5.66] — sat entirely inside solid wall. Its old
  // z = 2 also put it directly behind the Column_Astra at z [1.84, 2.16], which stands 0.48 proud
  // of the wall and covered the screen. -6.03 is the centre of the widest clear stretch of left
  // wall in this height band (measured gap z [-6.54, -5.51] against every other prop in
  // reports/interior-nobatch.json), and it reads better anyway: the log archive now sits beside the
  // nav console it belongs to rather than out in the middle of the room.
  g.position.set(-WALL_FACE_X, 0, -6.03);
  g.rotation.y = Math.PI / 2;
  ctx.scene.add(g);

  // Backplate and structural surround.
  mesh(g, chamferBox(0.86, 1.44, 0.09, 0.022), kit.dark, 0, 1.42, 0.045);
  for (const sx of [-1, 1]) {
    mesh(g, chamferBox(0.07, 1.5, 0.16, 0.02), kit.steel, sx * 0.43, 1.42, 0.09);
  }
  mesh(g, chamferBox(0.94, 0.08, 0.24, 0.018), kit.steel, 0, 2.18, 0.1);
  mesh(g, new THREE.BoxGeometry(0.78, 0.018, 0.014), kit.emAmber, 0, 2.12, 0.19);

  // Screen.
  const journalTex = buildSecondaryScreenTexture('sys');
  addScreen(ctx, g, kit, { x: 0, y: 1.66, z: 0.13, yaw: 0, tilt: -0.12, w: 0.6, h: 0.42, tex: journalTex, intensity: 0.85 });

  // Keyboard shelf with real keys.
  mesh(g, chamferBox(0.72, 0.06, 0.26, 0.016), kit.steel, 0, 1.21, 0.15);
  const shelfTex = buildControlFaceTexture('LOG TERMINAL', 'cyan');
  const shelfMat = new THREE.MeshStandardMaterial({
    map: shelfTex, emissive: 0xffffff, emissiveMap: shelfTex, emissiveIntensity: 0.3, roughness: 0.85, metalness: 0.05,
  });
  const shelfFace = mesh(g, flatPlane(0.64, 0.2), shelfMat, 0, 1.245, 0.16);
  shelfFace.rotation.x = -0.14;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 7; c++) {
      const k = mesh(g, kit.key, kit.keycap, -0.24 + c * 0.08, 1.255 + r * 0.006, 0.11 + r * 0.07);
      k.scale.set(0.85, 1, 0.8);
    }
  }

  // Service cabinet below with a vent and a placard, and a hazard strip at the deck.
  mesh(g, chamferBox(0.8, 0.9, 0.3, 0.024), kit.bone, 0, 0.62, 0.11);
  mesh(g, new THREE.PlaneGeometry(0.5, 0.4), kit.tiled('vent', 1, 1), 0, 0.66, 0.262);
  const sub = new THREE.Group();
  sub.position.set(0, 0.62, 0.263);
  g.add(sub);
  cornerBolts(sub, kit, 0.8, 0.9, 0, 0.06);
  mesh(g, new THREE.BoxGeometry(0.78, 0.06, 0.02), kit.tiled('hazard', 2, 1), 0, 0.19, 0.263);
  const plc = new THREE.MeshStandardMaterial({
    map: buildStencilPlacardTexture('LOG-2', 'ARCHIVE'), roughness: 0.72, metalness: 0.2,
  });
  mesh(g, new THREE.PlaneGeometry(0.34, 0.17), plc, 0, 0.98, 0.264);
  addLed(ctx, g, kit, 0.3, 1.44, 0.14, 0x6fe4ff, true);
  addLed(ctx, g, kit, 0.3, 1.38, 0.14, 0xffd9a0, false);

  ctx.interaction.register({
    object: g,
    label: 'Open Travel Logs',
    range: 2.2,
    enabled: () => gameState.hasFlag('logs_available'),
    onInteract: () => bus.emit('ui:open_journal'),
  });
  protectSubtree(ctx, g);

  return g;
}

/**
 * Repair bay station. Kept inside its existing collider footprint (0.7 × 0.5 in plan, 1.4 tall)
 * but rebuilt as a bevelled cabinet with a sloped control head, a tool rack and a hose reel.
 */
function buildRepairStation(ctx: InteriorCtx, kit: Kit): THREE.Group[] {
  const g = new THREE.Group();
  g.position.set(ROOM_W / 2 - 0.5, 0, (2.2 * 4) / 3);
  g.rotation.y = -Math.PI / 2;
  ctx.scene.add(g);

  mesh(g, chamferBox(0.5, 0.12, 0.66, 0.02), kit.dark, 0, 0.06, 0);
  mesh(g, new THREE.BoxGeometry(0.46, 0.06, 0.02), kit.tiled('hazard', 1, 1), 0, 0.1, 0.335);

  const body = mesh(g, chamferBox(0.46, 1.16, 0.6, 0.028), kit.bone, 0, 0.7, 0);
  body.castShadow = true;
  body.receiveShadow = true;

  // Front face: recessed dark panel, vent, placard, LED bank.
  mesh(g, chamferBox(0.36, 0.5, 0.03, 0.01), kit.charcoal, 0, 0.62, 0.3);
  mesh(g, new THREE.PlaneGeometry(0.28, 0.36), kit.tiled('vent', 1, 1), 0, 0.6, 0.32);
  const sub = new THREE.Group();
  sub.position.set(0, 0.62, 0.322);
  g.add(sub);
  cornerBolts(sub, kit, 0.36, 0.5, 0, 0.04);
  const plc = new THREE.MeshStandardMaterial({
    map: buildStencilPlacardTexture('RPR-3', 'DAMAGE CTL'), roughness: 0.72, metalness: 0.2,
  });
  mesh(g, new THREE.PlaneGeometry(0.32, 0.16), plc, 0, 0.98, 0.302);
  for (let i = 0; i < 4; i++) {
    addLed(ctx, g, kit, -0.12 + i * 0.08, 0.28, 0.31, i === 0 ? 0xe0552f : 0xffd9a0, i % 2 === 0);
  }

  // Sloped control head.
  const head = new THREE.Group();
  head.position.set(0, 1.3, 0.02);
  head.rotation.x = -0.45;
  g.add(head);
  mesh(head, chamferBox(0.5, 0.07, 0.42, 0.018), kit.steel, 0, 0, 0);
  const headTex = buildControlFaceTexture('DAMAGE CTL', 'amber');
  const headMat = new THREE.MeshStandardMaterial({
    map: headTex, emissive: 0xffffff, emissiveMap: headTex, emissiveIntensity: 0.45, roughness: 0.85, metalness: 0.05,
  });
  mesh(head, flatPlane(0.4, 0.3), headMat, 0, 0.042, 0);
  for (let c = 0; c < 4; c++) {
    mesh(head, kit.key, c === 3 ? kit.emRed : kit.keycap, -0.13 + c * 0.086, 0.05, 0.1);
  }
  mesh(head, kit.knob, kit.keycap, 0.17, 0.05, -0.1);

  // Tool rack and a coiled hose hanging off the outboard side.
  const side = new THREE.Group();
  side.position.set(-0.24, 0.78, 0);
  side.rotation.y = -Math.PI / 2;
  g.add(side);
  mesh(side, chamferBox(0.5, 0.34, 0.04, 0.012), kit.dark, 0, 0, 0.02);
  for (let i = 0; i < 4; i++) {
    const t = mesh(side, new THREE.CylinderGeometry(0.014, 0.014, 0.26, 8), kit.chrome, -0.17 + i * 0.11, 0, 0.06);
    t.rotation.z = 0.08 * (i % 2 === 0 ? 1 : -1);
  }
  const reel = mesh(g, new THREE.TorusGeometry(0.11, 0.03, 8, 18), kit.rubber, 0.25, 0.5, 0.0);
  reel.rotation.y = Math.PI / 2;

  // Toolbox on the deck beside the station — low enough to never meet the player at eye height.
  const box = new THREE.Group();
  box.position.set(ROOM_W / 2 - 0.95, 0, (2.95 * 4) / 3);
  box.rotation.y = 0.4;
  ctx.scene.add(box);
  mesh(box, chamferBox(0.44, 0.24, 0.3, 0.022), kit.steel, 0, 0.12, 0);
  mesh(box, chamferBox(0.46, 0.05, 0.32, 0.014), kit.dark, 0, 0.25, 0);
  const bh = mesh(box, kit.bar, kit.chrome, 0, 0.32, 0);
  bh.scale.x = 0.24;
  for (const hx of [-0.1, 0.1]) {
    mesh(box, chamferBox(0.025, 0.07, 0.03, 0.008), kit.chrome, hx, 0.285, 0);
  }
  mesh(box, new THREE.BoxGeometry(0.4, 0.04, 0.02), kit.tiled('hazard', 1, 1), 0, 0.05, 0.152);

  ctx.interaction.register({
    object: g,
    label: 'Open Ship Repair Interface',
    range: 2.2,
    enabled: () => gameState.hasFlag('damage_assessed'),
    onInteract: () => bus.emit('ui:open_repair'),
  });
  protectSubtree(ctx, g);
  protectSubtree(ctx, box);

  return [g, box];
}
