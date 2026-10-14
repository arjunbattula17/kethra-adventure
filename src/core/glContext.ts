/**
 * The page's one WebGL 2 context.
 *
 * main.ts has to know WebGL 2 works before it loads the game, and used to find out by creating a
 * throwaway context; the engine then created a second one. Creating a context is 180-300 ms on a first
 * visit to an Intel UHD laptop, and the second landed right after the title appeared, freezing it
 * (docs/PERF_LOG.md, 2026-09-28). The check now creates the context the engine will use, with the
 * attributes three.js would have asked for, and the engine takes it over.
 */
export const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  // As three.js's WebGLRenderer creates its own (alpha is always requested; see Engine for the clear).
  alpha: true,
  // The canvas only ever receives the post-processing chain's last full-screen pass (Engine).
  depth: false,
  stencil: false,
  antialias: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
  failIfMajorPerformanceCaveat: false,
};

let probed: { canvas: HTMLCanvasElement; context: WebGL2RenderingContext } | null = null;

/** Whether this browser can create a WebGL 2 context; keeps the one it created for the engine. */
export function probeWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    const context = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
    if (context) probed = { canvas, context };
    return !!context;
  } catch {
    return false;
  }
}

/** The context probeWebGL2 created, handed over once. */
export function takeProbedContext(): { canvas: HTMLCanvasElement; context: WebGL2RenderingContext } | null {
  const p = probed;
  probed = null;
  return p;
}
