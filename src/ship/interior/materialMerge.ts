import * as THREE from 'three';
import { PAINT_CONTEXT } from '../../core/paintCanvas';

/**
 * Lets meshes that each have their own material share one, so batchStaticGeometry can merge them.
 * atlasCanvasMaterials packs per-mesh canvas textures into shared atlas pages; mergeTints moves
 * colour and opacity into RGBA vertex colours. Both skip animated, custom-shader and tiling
 * materials.
 */

const PAGE = 2048;
const PAD = 6;
const MAX_TILE = 1024;

type Mat = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
const OTHER_SLOTS = ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap', 'envMap'] as const;

function isPlainMat(mat: THREE.Material): mat is Mat {
  if (!(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) return false;
  if ((mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return false;
  return mat.onBeforeCompile === THREE.Material.prototype.onBeforeCompile && mat.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey;
}

/** Everything that affects drawing except the listed fields. */
function signatureWithout(mat: Mat, skip: Set<string>): string {
  const m = mat as THREE.MeshStandardMaterial;
  const fields: Record<string, unknown> = {
    type: mat.type, transparent: mat.transparent, opacity: mat.opacity, side: mat.side, blending: mat.blending,
    depthWrite: mat.depthWrite, depthTest: mat.depthTest, alphaTest: mat.alphaTest, vertexColors: mat.vertexColors,
    toneMapped: mat.toneMapped, polygonOffset: mat.polygonOffset, pof: mat.polygonOffsetFactor, pou: mat.polygonOffsetUnits,
    premultipliedAlpha: mat.premultipliedAlpha, color: mat.color.getHex(), emissive: m.emissive?.getHex(),
    emissiveIntensity: m.emissiveIntensity, roughness: m.roughness, metalness: m.metalness, flatShading: m.flatShading,
    envMapIntensity: m.envMapIntensity, fog: mat.fog, map: mat.map?.uuid, emissiveMap: m.emissiveMap?.uuid,
  };
  for (const slot of OTHER_SLOTS) fields[slot] = (mat as unknown as Record<string, THREE.Texture | null>)[slot]?.uuid;
  for (const k of skip) delete fields[k];
  return JSON.stringify(fields);
}

function uvsInUnitRange(geo: THREE.BufferGeometry): boolean {
  const uv = geo.getAttribute('uv');
  if (!uv) return false;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (u < -1e-3 || u > 1.001 || v < -1e-3 || v > 1.001) return false;
  }
  return true;
}

function isOwnCanvasTexture(tex: THREE.Texture | null): tex is THREE.CanvasTexture {
  if (!tex) return false;
  const img = tex.image as HTMLCanvasElement | undefined;
  return (
    typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement &&
    tex.wrapS === THREE.ClampToEdgeWrapping && tex.wrapT === THREE.ClampToEdgeWrapping &&
    tex.repeat.x === 1 && tex.repeat.y === 1 && tex.offset.x === 0 && tex.offset.y === 0 && tex.rotation === 0 &&
    img.width <= MAX_TILE && img.height <= MAX_TILE
  );
}

/** The slots that sample through a mesh's `uv`. */
const UV_SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'bumpMap'] as const;

/** How a texture samples its image, leaving out where the image starts and how often it repeats. */
function samplingKey(tex: THREE.Texture): string {
  return [tex.source.uuid, tex.wrapS, tex.wrapT, tex.magFilter, tex.minFilter, tex.anisotropy, tex.colorSpace, tex.flipY, tex.generateMipmaps, tex.premultiplyAlpha].join('|');
}

/**
 * Lets meshes share a material when they sample the same images and differ only in how the images
 * tile: the same wall plate at three sizes was three materials and three draw calls. Each such
 * texture is swapped for the first one seen of its image, and the difference in repeat and offset
 * goes into a copy of the mesh's UVs, so every texel lands where it did. Returns how many meshes
 * were changed.
 */
export function shareTiledTextures(meshes: THREE.Mesh[], animated: Set<THREE.Material>, noMerge: Set<THREE.Object3D>): number {
  const firstSeen = new Map<string, THREE.Texture>();
  const rewritten = new Map<THREE.Material, THREE.Material>();
  let moved = 0;
  for (const mesh of meshes) {
    if (noMerge.has(mesh) || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) continue;
    const mat = mesh.material;
    if (animated.has(mat) || !isPlainMat(mat)) continue;
    const slots = mat as unknown as Record<string, THREE.Texture | null>;
    if (slots.aoMap || slots.lightMap) continue;
    const used = UV_SLOTS.filter((slot) => slots[slot]);
    const uv = mesh.geometry.getAttribute('uv');
    if (!used.length || !uv) continue;
    if (used.some((slot) => slots[slot]!.rotation !== 0 || slots[slot]!.channel !== 0 || !slots[slot]!.matrixAutoUpdate)) continue;

    // The one scale and shift of the UVs under which each slot's stand-in samples what the slot
    // samples now. Slots that would need different ones cannot share a `uv`, so the mesh is left.
    let fit: [number, number, number, number] | null = null;
    let swaps = false;
    let agree = true;
    for (const slot of used) {
      const tex = slots[slot]!;
      const key = samplingKey(tex);
      const base = firstSeen.get(key) ?? tex;
      if (base === tex) firstSeen.set(key, tex);
      else swaps = true;
      const need: [number, number, number, number] = [tex.repeat.x / base.repeat.x, tex.repeat.y / base.repeat.y, (tex.offset.x - base.offset.x) / base.repeat.x, (tex.offset.y - base.offset.y) / base.repeat.y];
      if (!need.every(Number.isFinite)) agree = false;
      else if (!fit) fit = need;
      else if (need.some((v, i) => Math.abs(v - fit![i]) > 1e-6)) agree = false;
    }
    if (!swaps || !agree || !fit) continue;

    let shared = rewritten.get(mat);
    if (!shared) {
      shared = mat.clone();
      for (const slot of used) (shared as unknown as Record<string, THREE.Texture>)[slot] = firstSeen.get(samplingKey(slots[slot]!))!;
      rewritten.set(mat, shared);
    }
    const [sx, sy, ox, oy] = fit;
    if (sx !== 1 || sy !== 1 || ox !== 0 || oy !== 0) {
      const geo = mesh.geometry.clone();
      const baked = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < baked.count; i++) baked.setXY(i, baked.getX(i) * sx + ox, baked.getY(i) * sy + oy);
      baked.needsUpdate = true;
      mesh.geometry = geo;
    }
    mesh.material = shared;
    moved++;
  }
  return moved;
}

interface Placement {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Shelf packing into PAGE-sized pages, tallest first. */
function pack(sizes: { w: number; h: number }[]): Placement[] {
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b].h - sizes[a].h);
  const out: Placement[] = new Array(sizes.length);
  let page = 0;
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const i of order) {
    const w = sizes[i].w + PAD * 2;
    const h = sizes[i].h + PAD * 2;
    if (x + w > PAGE) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    if (y + h > PAGE) {
      page++;
      x = 0;
      y = 0;
      shelf = 0;
    }
    out[i] = { page, x, y, w: sizes[i].w, h: sizes[i].h };
    x += w;
    shelf = Math.max(shelf, h);
  }
  return out;
}

/** Draws `img` at (x, y) with its edge pixels stretched into the padding, so mip levels don't bleed. */
function blitPadded(g: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number): void {
  const { width: w, height: h } = img;
  const X = x + PAD;
  const Y = y + PAD;
  g.drawImage(img, X, Y);
  g.drawImage(img, 0, 0, w, 1, X, y, w, PAD);
  g.drawImage(img, 0, h - 1, w, 1, X, Y + h, w, PAD);
  g.drawImage(img, 0, 0, 1, h, x, Y, PAD, h);
  g.drawImage(img, w - 1, 0, 1, h, X + w, Y, PAD, h);
  g.drawImage(img, 0, 0, 1, 1, x, y, PAD, PAD);
  g.drawImage(img, w - 1, 0, 1, 1, X + w, y, PAD, PAD);
  g.drawImage(img, 0, h - 1, 1, 1, x, Y + h, PAD, PAD);
  g.drawImage(img, w - 1, h - 1, 1, 1, X + w, Y + h, PAD, PAD);
}

/** Returns how many meshes were moved onto atlas materials. */
export function atlasCanvasMaterials(meshes: THREE.Mesh[], animated: Set<THREE.Material>, noMerge: Set<THREE.Object3D>): number {
  const groups = new Map<string, THREE.Mesh[]>();
  for (const mesh of meshes) {
    if (noMerge.has(mesh) || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) continue;
    const mat = mesh.material;
    if (animated.has(mat) || !isPlainMat(mat) || !isOwnCanvasTexture(mat.map)) continue;
    const em = (mat as THREE.MeshStandardMaterial).emissiveMap;
    if (em && em.image !== mat.map!.image) continue;
    if (OTHER_SLOTS.some((s) => (mat as unknown as Record<string, unknown>)[s])) continue;
    if (!uvsInUnitRange(mesh.geometry)) continue;
    const key = signatureWithout(mat, new Set(['map', 'emissiveMap'])) + `|cs:${mat.map!.colorSpace}|em:${!!em}`;
    const list = groups.get(key);
    if (list) list.push(mesh);
    else groups.set(key, [mesh]);
  }

  let moved = 0;
  for (const group of groups.values()) {
    // Only worth it where two or more different canvases would become one draw.
    const canvases = [...new Set(group.map((m) => (m.material as Mat).map!.image as HTMLCanvasElement))];
    if (canvases.length < 2) continue;
    const places = pack(canvases.map((c) => ({ w: c.width, h: c.height })));
    const pageCount = Math.max(...places.map((p) => p.page)) + 1;
    // Each page is only as big as what was packed onto it. A full PAGE-square page per group was
    // mostly empty (two 256-pixel canvases made a 2048-pixel page): the Wren's ~25 groups made ~25
    // pages, 540 MB of the 959 MB of textures it uploaded on Low (tools/texture-sources.mjs).
    const pageW = new Array<number>(pageCount).fill(0);
    const pageH = new Array<number>(pageCount).fill(0);
    for (const place of places) {
      pageW[place.page] = Math.max(pageW[place.page], place.x + place.w + PAD * 2);
      pageH[place.page] = Math.max(pageH[place.page], place.y + place.h + PAD * 2);
    }
    const first = group[0].material as Mat;
    const pages: THREE.CanvasTexture[] = [];
    const pageMats: Mat[] = [];
    for (let p = 0; p < pageCount; p++) {
      const canvas = document.createElement('canvas');
      canvas.width = pageW[p];
      canvas.height = pageH[p];
      // In ordinary memory, like the canvases it copies (paintCanvas.ts): a GPU canvas had every one
      // of them uploaded to be drawn, then the page rasterised in the GPU process at its own upload.
      const g = canvas.getContext('2d', PAINT_CONTEXT)!;
      canvases.forEach((c, i) => {
        if (places[i].page === p) blitPadded(g, c, places[i].x, places[i].y);
      });
      const tex = new THREE.CanvasTexture(canvas);
      tex.userData.atlas = true;
      tex.colorSpace = first.map!.colorSpace;
      tex.anisotropy = Math.max(...group.map((m) => (m.material as Mat).map!.anisotropy));
      pages.push(tex);
      const mat = first.clone() as Mat;
      mat.map = tex;
      if ((first as THREE.MeshStandardMaterial).emissiveMap) (mat as THREE.MeshStandardMaterial).emissiveMap = tex;
      mat.name = `${first.name || 'canvas'}-atlas-${p}`;
      pageMats.push(mat);
    }
    const index = new Map(canvases.map((c, i) => [c, i]));
    for (const mesh of group) {
      const place = places[index.get((mesh.material as Mat).map!.image as HTMLCanvasElement)!];
      const w = pageW[place.page];
      const h = pageH[place.page];
      // flipY: the texture's v runs bottom-up while the canvas is laid out top-down.
      const geo = mesh.geometry.clone();
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        const u = (place.x + PAD + uv.getX(i) * place.w) / w;
        const v = 1 - (place.y + PAD + (1 - uv.getY(i)) * place.h) / h;
        uv.setXY(i, u, v);
      }
      uv.needsUpdate = true;
      mesh.geometry = geo;
      mesh.material = pageMats[place.page];
      moved++;
    }
  }
  return moved;
}

/** Returns how many meshes were moved onto shared tint materials. */
export function mergeTints(meshes: THREE.Mesh[], animated: Set<THREE.Material>, noMerge: Set<THREE.Object3D>): number {
  const groups = new Map<string, THREE.Mesh[]>();
  for (const mesh of meshes) {
    if (noMerge.has(mesh) || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) continue;
    const mat = mesh.material;
    if (animated.has(mat) || !isPlainMat(mat) || mat.vertexColors) continue;
    if (mesh.geometry.getAttribute('color')) continue;
    const key = signatureWithout(mat, new Set(['color', 'opacity'])) + `|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`;
    const list = groups.get(key);
    if (list) list.push(mesh);
    else groups.set(key, [mesh]);
  }
  let moved = 0;
  for (const group of groups.values()) {
    const distinct = new Set(group.map((m) => m.material as Mat));
    if (distinct.size < 2) continue;
    const first = group[0].material as Mat;
    const shared = first.clone() as Mat;
    shared.color.setRGB(1, 1, 1);
    shared.opacity = 1;
    shared.vertexColors = true;
    shared.name = `${first.name || 'tinted'}-tints`;
    for (const mesh of group) {
      const mat = mesh.material as Mat;
      const geo = mesh.geometry.clone();
      const n = geo.getAttribute('position').count;
      const rgba = new Float32Array(n * 4);
      const a = mat.transparent ? mat.opacity : 1;
      for (let i = 0; i < n; i++) {
        rgba[i * 4] = mat.color.r;
        rgba[i * 4 + 1] = mat.color.g;
        rgba[i * 4 + 2] = mat.color.b;
        rgba[i * 4 + 3] = a;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
      mesh.geometry = geo;
      mesh.material = shared;
      moved++;
    }
  }
  return moved;
}
