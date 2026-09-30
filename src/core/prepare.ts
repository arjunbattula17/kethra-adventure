import * as THREE from 'three';
import { span } from './perfMarks';

/**
 * Cooperative scene preparation: the expensive first-time work of a scene (shader programs, texture
 * uploads, geometry uploads) done in small pieces, so the page keeps drawing while it happens.
 *
 * Measured on an Intel UHD laptop with a cold browser (docs/PERF_LOG.md, 2026-09-28): compiling the
 * Wren's programs all at once queued ~70 s of Direct3D shader compiling across every core. Chrome's GPU
 * process then waited on that queue in its own main thread, which is where every tab's frames are
 * drawn, so the loading screen froze for 8 s with the page's own thread idle. Fed a few programs at a
 * time, the queue never fills and frames keep coming.
 */

/**
 * How much work a scene's preparation may do between frames. `sliceMs` is main-thread time per
 * frame; `uploadBytes` is how much texture data a slice may hand the GPU process; `programsInFlight`
 * is how many shader programs may be compiling there at once. The flow changes the pace as the
 * situation changes: generous behind a loading screen, frugal while the intro plays or the title
 * screen waits.
 */
export interface Pace {
  sliceMs: number;
  uploadBytes: number;
  programsInFlight: number;
}

const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
const MB = 1 << 20;

/**
 * Programs compiling at once. Shader compiling is processor-bound: on a 4-core, 8-thread Intel laptop
 * the Wren's 37 programs took 8.8 s with 3 at a time, 8.6-9.2 s with 4, and 9.5-10.2 s with 6, which
 * also froze the loading screen for up to 0.9 s (docs/PERF_LOG.md, 2026-09-28). About half the
 * hardware threads, less the two the page and the GPU process need to keep drawing.
 */
const COMPILE_THREADS = Math.max(1, Math.min(3, Math.floor(cores / 2) - 1));

export const PACE = {
  /** Behind a loading screen: finish soon, but let the loading screen's own animation keep moving. */
  loading: { sliceMs: 40, uploadBytes: 24 * MB, programsInFlight: COMPILE_THREADS },
  /** While a cinematic plays: stay inside a 60 fps frame. */
  playing: { sliceMs: 5, uploadBytes: 4 * MB, programsInFlight: COMPILE_THREADS },
  /** While a menu waits for a click: never delay the click. */
  idle: { sliceMs: 4, uploadBytes: 4 * MB, programsInFlight: Math.max(1, COMPILE_THREADS - 1) },
} satisfies Record<string, Pace>;

/** Lets the browser draw a frame (and handle input) before the next piece of work. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    // A hidden tab runs no animation frames; a timer still fires there (throttled, which is fine).
    if (document.hidden) {
      setTimeout(resolve, 0);
      return;
    }
    // After the frame, not before it: the work then lands in the idle part of the frame.
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

/**
 * Time-slices a loop: `await pacer.tick()` between pieces of work.
 *
 * Main-thread time alone doesn't pace GPU work: a texture upload returns in microseconds and the GPU
 * process does the copy later. Queued faster than the GPU drains them, uploads fill the command
 * buffer's transfer space, and then some later call blocks the page until the GPU catches up: the
 * Wren's uploads produced single 300-500 ms stalls that way on an Intel UHD laptop, though each costs
 * 8-80 ms on its own (docs/PERF_LOG.md, 2026-09-28). So a slice also ends when it has queued
 * `uploadBytes`, and with a WebGL context the next slice waits for a fence: the GPU has finished
 * everything the last one asked for.
 */
export class Pacer {
  pace: Pace;
  private sliceStart = performance.now();
  private queued = 0;
  private gl: WebGL2RenderingContext | null;

  constructor(pace: Pace, gl: WebGL2RenderingContext | null = null) {
    this.pace = pace;
    this.gl = gl;
  }

  /** Counts texture data this slice has handed to the GPU. */
  spend(bytes: number): void {
    this.queued += bytes;
  }

  /** Yields to the browser once this frame's slice is used up. */
  async tick(): Promise<void> {
    if (performance.now() - this.sliceStart < this.pace.sliceMs && this.queued < this.pace.uploadBytes) return;
    await this.breathe();
  }

  /** Always yields: for work that is about to be long regardless of what's left of the slice. */
  async breathe(): Promise<void> {
    const gl = this.gl;
    const fence = gl && !gl.isContextLost() ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    if (gl && fence) {
      gl.flush();
      // WebGL updates a fence's status between tasks, so this polls once per yield. Capped: a lost
      // context never signals, and preparation must not hang on it.
      const giveUp = performance.now() + 2000;
      do await yieldToBrowser();
      while (!gl.isContextLost() && gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED && performance.now() < giveUp);
      gl.deleteSync(fence);
    } else {
      await yieldToBrowser();
    }
    this.queued = 0;
    this.sliceStart = performance.now();
  }
}

type ProgramHandle = { isReady(): boolean };
type Drawable = THREE.Mesh | THREE.Points | THREE.Line | THREE.Sprite;

function drawablesOf(root: THREE.Object3D): Drawable[] {
  const list: Drawable[] = [];
  root.traverse((o) => {
    const d = o as Drawable;
    if (((d as THREE.Mesh).isMesh || (d as THREE.Points).isPoints || (d as THREE.Line).isLine || (d as THREE.Sprite).isSprite) && d.material) list.push(d);
  });
  return list;
}

/**
 * Compiles every program `scene` will draw with, a few at a time.
 *
 * three.js's compile(root, camera, targetScene) walks `root` for materials and takes lights, fog and
 * environment from `targetScene`. Handing it a one-object "root" compiles exactly that object's
 * program against the real scene's lighting, so the programs are the ones the first frame will ask for.
 * The stand-in root has no lights of its own to add (its traverseVisible visits nothing), which keeps
 * the light count, and with it every program, identical to a whole-scene compile.
 *
 * `target` must be bound while compiling: programs are keyed on the render target they draw into
 * (see Engine.compileForComposer). Progress is reported as compiled / total objects.
 */
export async function compileProgressively(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  target: THREE.WebGLRenderTarget,
  pacer: Pacer,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const registry = renderer.info.programs as unknown as ProgramHandle[] | null;
  const known = new Set<ProgramHandle>(registry ?? []);
  const inFlight: ProgramHandle[] = [];
  const settle = () => {
    for (let i = inFlight.length - 1; i >= 0; i--) if (inFlight[i].isReady()) inFlight.splice(i, 1);
  };
  const objects = drawablesOf(scene);
  for (let i = 0; i < objects.length; i++) {
    await pacer.tick();
    // Hold the next program until the GPU process has room for it.
    settle();
    while (inFlight.length >= pacer.pace.programsInFlight) {
      await pacer.breathe();
      settle();
    }
    const object = objects[i];
    const root = { traverse: (visit: (o: THREE.Object3D) => void) => visit(object), traverseVisible: () => {} } as unknown as THREE.Object3D;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    try {
      renderer.compile(root, camera, scene);
    } finally {
      renderer.setRenderTarget(previous);
    }
    if (registry && registry.length !== known.size) {
      for (const p of registry) {
        if (!known.has(p)) {
          known.add(p);
          inFlight.push(p);
        }
      }
    }
    onProgress?.((i + 1) / objects.length);
  }
  while (inFlight.length) {
    await pacer.breathe();
    settle();
  }
}

const MAP_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap',
  'specularMap', 'envMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap',
  'transmissionMap', 'thicknessMap', 'iridescenceMap', 'iridescenceThicknessMap', 'displacementMap', 'matcap', 'gradientMap',
] as const;

/** Every texture a scene's materials and background use, each once. */
export function texturesOf(scene: THREE.Scene): THREE.Texture[] {
  const found = new Set<THREE.Texture>();
  const add = (t: unknown) => {
    if ((t as THREE.Texture)?.isTexture) found.add(t as THREE.Texture);
  };
  add(scene.background);
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      const record = mat as unknown as Record<string, unknown>;
      for (const slot of MAP_SLOTS) add(record[slot]);
      const uniforms = (mat as THREE.ShaderMaterial).uniforms;
      if (uniforms) for (const u of Object.values(uniforms)) add(u?.value);
    }
  });
  return [...found];
}

function describe(t: THREE.Texture): string {
  const image = t.image as { src?: string; width?: number; height?: number; constructor?: { name: string } } | null;
  const src = image?.src ? image.src.split('/').slice(-2).join('/') : image?.constructor?.name ?? 'none';
  return `${t.name || src} ${image?.width}x${image?.height}`;
}

/**
 * Uploads a scene's textures one at a time between frames (three.js otherwise uploads every one of
 * them inside the first frame that draws the scene). Skips textures whose image hasn't arrived.
 */
export async function uploadProgressively(renderer: THREE.WebGLRenderer, textures: THREE.Texture[], pacer: Pacer, onProgress?: (fraction: number) => void): Promise<void> {
  for (let i = 0; i < textures.length; i++) {
    await pacer.tick();
    const t = textures[i];
    const image = t.image as { width?: number } | null;
    const ready = (t as THREE.CubeTexture).isCubeTexture || (t as THREE.DataTexture).isDataTexture || (image && (image.width ?? 0) > 0);
    if (ready && !(t as THREE.VideoTexture).isVideoTexture) {
      const start = performance.now();
      renderer.initTexture(t);
      // Anything slow enough to drop frames gets its own entry on the timeline, named by its source.
      if (performance.now() - start > 30) span(`upload:slow ${describe(t)}`, start);
      // RGBA bytes, plus a third for the mipmap chain.
      pacer.spend(((image?.width ?? 0) * ((image as { height?: number } | null)?.height ?? 0) * 4 * 4) / 3);
    }
    onProgress?.((i + 1) / textures.length);
  }
}

/** A layer nothing in the game uses: the progressive draw's camera sees only what it puts there. */
const WARM_LAYER = 31;

/**
 * Draws a scene a few objects at a time into a small off-screen target, so each object's first draw
 * (geometry upload, the program's first use, the driver's own first-draw work) happens in a slice of
 * its own instead of all inside one frame.
 *
 * Each partial draw is selected by a layer the camera alone looks at, not by hiding the rest: hiding
 * a mesh hides its children too, and three.js gathers lights by the same layer test, so the lights
 * join that layer for the duration and every partial draw uses the programs the real frame will.
 * Hidden meshes are shown for it (the scene may show them later), and nothing is culled. Objects the
 * real camera can't see (raycast-only proxies) are left out.
 */
export async function drawProgressively(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  target: THREE.WebGLRenderTarget,
  pacer: Pacer,
  batch = 24,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const objects = drawablesOf(scene).filter((o) => o.layers.test(camera.layers));
  const lights: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight && o.layers.test(camera.layers)) lights.push(o);
  });
  const saved = objects.map((o) => ({ visible: o.visible, culled: o.frustumCulled, mask: o.layers.mask }));
  const lightMasks = lights.map((l) => l.layers.mask);
  const cameraMask = camera.layers.mask;
  const autoShadow = renderer.shadowMap.autoUpdate;
  const needsShadow = renderer.shadowMap.needsUpdate;
  // Partial frames must not paint (and, for a static-shadow scene, keep) a shadow map of a partial scene.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = false;
  try {
    for (const o of objects) {
      o.visible = true;
      o.frustumCulled = false;
    }
    for (const l of lights) l.layers.enable(WARM_LAYER);
    camera.layers.set(WARM_LAYER);
    for (let start = 0; start < objects.length; start += batch) {
      await pacer.breathe();
      const end = Math.min(objects.length, start + batch);
      for (let i = start; i < end; i++) objects[i].layers.enable(WARM_LAYER);
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      try {
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(previous);
        for (let i = start; i < end; i++) objects[i].layers.disable(WARM_LAYER);
      }
      onProgress?.(end / objects.length);
    }
  } finally {
    objects.forEach((o, i) => {
      o.visible = saved[i].visible;
      o.frustumCulled = saved[i].culled;
      o.layers.mask = saved[i].mask;
    });
    lights.forEach((l, i) => (l.layers.mask = lightMasks[i]));
    camera.layers.mask = cameraMask;
    renderer.shadowMap.autoUpdate = autoShadow;
    renderer.shadowMap.needsUpdate = needsShadow;
  }
}
