import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PACE, Pacer } from './prepare';

let sharedEnvironment: THREE.Texture | null = null;
let pending: Promise<THREE.Texture> | null = null;

const SIGMA = 0.04;

export function initSharedEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  if (sharedEnvironment) return sharedEnvironment;
  const pmrem = new THREE.PMREMGenerator(renderer);
  sharedEnvironment = pmrem.fromScene(new RoomEnvironment(), SIGMA).texture;
  pmrem.dispose();
  return sharedEnvironment;
}

/** A stand-in for the generator's filter planes, with the same attributes (position, uv, faceIndex). */
function filterPlane(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geometry.setAttribute('faceIndex', new THREE.Float32BufferAttribute([0, 0, 0], 1));
  return geometry;
}

type PmremInternals = {
  _setSize?: (size: number) => void;
  _allocateTargets?: () => THREE.WebGLRenderTarget;
  _blurMaterial?: THREE.Material | null;
  _ggxMaterial?: THREE.Material | null;
  _sceneToCubeUV?: (scene: THREE.Scene, near: number, far: number, target: THREE.WebGLRenderTarget, position: THREE.Vector3) => void;
  _blur?: (target: THREE.WebGLRenderTarget, lodIn: number, lodOut: number, sigma: number) => void;
  _applyGGXFilter?: (target: THREE.WebGLRenderTarget, lodIn: number, lodOut: number) => void;
  _lodMeshes?: THREE.Mesh[];
};

/**
 * PMREMGenerator.fromScene's own steps (r185), with the GPU given time to finish each before the next:
 * the room onto the cube's six faces, the blur, then the GGX filter one mip level at a time (256
 * samples a texel, the bulk of the GPU work). Run as one burst, that work held the GPU for 0.3-0.8 s on
 * an Intel UHD laptop, and the title screen stopped drawing meanwhile. Null if the generator's
 * internals are not as expected; the caller then uses fromScene.
 */
async function renderInSteps(renderer: THREE.WebGLRenderer, pmrem: PmremInternals, room: THREE.Scene): Promise<THREE.Texture | null> {
  const { _allocateTargets, _sceneToCubeUV, _blur, _applyGGXFilter, _lodMeshes } = pmrem;
  if (!_allocateTargets || !_sceneToCubeUV || !_blur || !_applyGGXFilter || !_lodMeshes?.length) return null;
  const pacer = new Pacer(PACE.idle, renderer.getContext() as WebGL2RenderingContext);
  const previous = renderer.getRenderTarget();
  const xr = renderer.xr.enabled;
  const output = _allocateTargets.call(pmrem);
  output.depthBuffer = true;
  const restore = () => {
    renderer.xr.enabled = xr;
    renderer.setRenderTarget(previous);
  };
  renderer.xr.enabled = false;
  _sceneToCubeUV.call(pmrem, room, 0.1, 100, output, new THREE.Vector3());
  restore();
  await pacer.breathe();
  renderer.xr.enabled = false;
  _blur.call(pmrem, output, 0, 0, SIGMA);
  restore();
  for (let lod = 1; lod < _lodMeshes.length; lod++) {
    await pacer.breathe();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.xr.enabled = false;
    _applyGGXFilter.call(pmrem, output, lod - 1, lod);
    renderer.autoClear = autoClear;
    restore();
  }
  // What fromScene's _cleanup leaves the target as.
  output.scissorTest = false;
  output.viewport.set(0, 0, output.width, output.height);
  output.scissor.set(0, 0, output.width, output.height);
  return output.texture;
}

/**
 * The same environment map, with its shaders compiled off the page's thread first.
 *
 * On a first visit nearly all of the ~0.9-1.3 s the environment map takes is compiling its shaders
 * (the room's materials and the generator's blur and GGX filters; a second visit takes ~110 ms), and
 * done synchronously that froze the title screen right after it appeared (docs/PERF_LOG.md,
 * 2026-09-28). Compiled with the parallel compiler first, only the render itself (a few ms) blocks.
 *
 * Reaches into PMREMGenerator for its filter materials: _allocateTargets creates them, and a second
 * call at the same size keeps the same ones, which fromScene then uses. If a three.js upgrade changes
 * that, this compiles what it can and fromScene compiles the rest the old way. `target` is any
 * off-screen render target: the generator draws into render targets, which selects the programs'
 * no-tone-mapping variants (see Engine.warmScene).
 */
export function initSharedEnvironmentAsync(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): Promise<THREE.Texture> {
  if (sharedEnvironment) return Promise.resolve(sharedEnvironment);
  if (pending) return pending;
  pending = (async () => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const internals = pmrem as unknown as PmremInternals;
    const stand: THREE.Mesh[] = [];
    if (typeof internals._setSize === 'function' && typeof internals._allocateTargets === 'function') {
      internals._setSize(256);
      internals._allocateTargets().dispose();
      for (const material of [internals._blurMaterial, internals._ggxMaterial]) {
        // Attributes as the generator's own meshes have them (_createPlanes): which ones a geometry
        // has is part of a program's key (hasPositionAttribute, hasNormalAttribute, ...).
        if (material) stand.push(new THREE.Mesh(filterPlane(), material));
      }
    }
    // What the generator draws behind the room: a back-faced basic box (_sceneToCubeUV).
    stand.push(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false })));
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    let compiled: Promise<unknown>[];
    try {
      const flat = new THREE.OrthographicCamera();
      compiled = [renderer.compileAsync(room, new THREE.PerspectiveCamera(90, 1, 0.1, 100)), ...stand.map((m) => renderer.compileAsync(m, flat))];
    } finally {
      renderer.setRenderTarget(previous);
    }
    await Promise.all(compiled);
    if (!sharedEnvironment) sharedEnvironment = (await renderInSteps(renderer, internals, room)) ?? pmrem.fromScene(room, SIGMA).texture;
    pmrem.dispose();
    // The stand-in box only kept its program warm until the generator drew with its own.
    (stand[stand.length - 1].material as THREE.Material).dispose();
    return sharedEnvironment;
  })();
  pending.catch(() => (pending = null));
  return pending;
}

export function getSharedEnvironment(): THREE.Texture | null {
  return sharedEnvironment;
}

/**
 * After a GPU context loss the environment map's pixels are gone: they only ever existed on the GPU
 * (PMREM renders them there), so unlike a texture loaded from an image, three.js has nothing to
 * re-upload. Render a fresh one and hand it back for the caller to swap in.
 */
export function rebuildSharedEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  sharedEnvironment = null;
  pending = null;
  return initSharedEnvironment(renderer);
}
