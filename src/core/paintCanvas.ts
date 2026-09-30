/**
 * Context options for canvases that paint a texture once: the ship's procedural textures.
 *
 * `willReadFrequently` keeps the canvas in ordinary memory and rasterises it on the page's own thread.
 * Without it Chrome puts most canvases on the GPU, and these painters read many of them back
 * (height fields become normal maps, roughness and metalness are packed into one map): each read made
 * the page wait while Chrome's GPU process drew the canvas and copied it back. On a first visit that
 * process is also compiling its own shaders for those drawings and the game's, so the Wren's painters
 * spent most of their time waiting (1.2 s of 3.3 s on an Intel UHD laptop), and the uploads to WebGL
 * took twice as long (docs/PERF_LOG.md, 2026-09-28). Rasterised here instead, the same drawing costs
 * a fraction of that and doesn't depend on how busy the GPU is.
 *
 * Not for canvases that are redrawn every frame (the Anchorage's board), which gain from staying on
 * the GPU.
 */
export const PAINT_CONTEXT: CanvasRenderingContext2DSettings = { willReadFrequently: true };
