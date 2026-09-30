// Shader compile micro-benchmark (driven by tools/shader-bench.mjs). Compiles one lit material under
// the Wren's Performance-tier light rig (8 point, 2 spot, 3 directional, 1 hemisphere, ambient, IBL,
// fog) with a chosen formulation of three.js's light loop, and times how long the browser takes to
// finish it, with every compile made new to every cache (a per-compile term appended to the source).
// Also times drawing a screen-filling plane with it, so a cheaper compile can be checked against
// its cost per frame.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const STOCK = THREE.ShaderChunk.lights_fragment_begin;
const STOCK_PARS = THREE.ShaderChunk.lights_pars_begin;
const DIRECT_CALL = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

let nonce = 1;
for (const proto of [WebGL2RenderingContext.prototype]) {
  const orig = proto.shaderSource;
  proto.shaderSource = function (this: WebGL2RenderingContext, shader: WebGLShader, src: string) {
    const m = /void\s+main\s*\(\s*(?:void)?\s*\)\s*\{/.exec(src);
    if (!m) return orig.call(this, shader, src);
    const k = `${1000000 + nonce}.5`;
    let tail: string | null = null;
    if (/gl_Position\s*=/.test(src)) tail = `void main() { kethra_nonce_main(); gl_Position.x += step(${k}, gl_Position.y) * 1e-20; }`;
    else {
      const out = /\bout\s+(?:highp\s+|mediump\s+|lowp\s+)?vec4\s+(\w+)\s*;/.exec(src)?.[1];
      if (out) tail = `void main() { kethra_nonce_main(); ${out}.a += step(${k}, gl_FragCoord.x) * 1e-20; }`;
    }
    if (!tail) return orig.call(this, shader, src);
    return orig.call(this, shader, `${src.slice(0, m.index)}void kethra_nonce_main() {${src.slice(m.index + m[0].length)}\n${tail}\n`);
  };
}

/** Removes the unroll pragmas around one light type's loop, leaving a real GLSL loop. */
function dynamicLoop(chunk: string, type: 'POINT' | 'SPOT' | 'DIR'): string {
  const head = `#if ( NUM_${type}_LIGHTS > 0 ) && defined( RE_Direct )`;
  const start = chunk.indexOf(head);
  const end = chunk.indexOf('#pragma unroll_loop_end', start) + '#pragma unroll_loop_end'.length;
  // The shadow and spot-map lines index sampler arrays by UNROLLED_LOOP_INDEX; with no shadows (the
  // Performance tier) they are compiled out anyway, so drop those blocks from the dynamic version.
  const out: string[] = [];
  let skipping = 0;
  for (const line of chunk.slice(start, end).split('\n')) {
    const t = line.trim();
    if (skipping) {
      if (t.startsWith('#if')) skipping++;
      else if (t.startsWith('#endif')) skipping--;
      continue;
    }
    if (t.startsWith('#if') && /UNROLLED_LOOP_INDEX|SPOT_LIGHT_MAP_INDEX/.test(t)) {
      skipping = 1;
      continue;
    }
    if (/^#(define|undef) SPOT_LIGHT_MAP_INDEX/.test(t) || t.startsWith('#pragma unroll_loop')) continue;
    out.push(line);
  }
  return chunk.slice(0, start) + out.join('\n') + chunk.slice(end);
}

function branch(chunk: string, types: ('POINT' | 'SPOT')[]): string {
  for (const type of types) {
    const head = `#if ( NUM_${type}_LIGHTS > 0 ) && defined( RE_Direct )`;
    const start = chunk.indexOf(head);
    const end = chunk.indexOf('\n#if (', start + head.length);
    const section = chunk.slice(start, end).split(DIRECT_CALL).join(`if ( directLight.visible ) ${DIRECT_CALL}`);
    chunk = chunk.slice(0, start) + section + chunk.slice(end);
  }
  return chunk;
}

/** A loop bound the HLSL compiler can't fold (a uniform nothing sets, so always 0): it keeps the
 * loop a loop instead of unrolling it. */
function runtimeBound(chunk: string): string {
  return chunk.replace(/i < NUM_(POINT|SPOT|DIR)_LIGHTS;/g, 'i < NUM_$1_LIGHTS + kethraLoopZero;');
}

const CHUNKS: Record<string, string> = {
  uniformLoopAll: runtimeBound(branch(dynamicLoop(dynamicLoop(dynamicLoop(STOCK, 'POINT'), 'SPOT'), 'DIR'), ['POINT', 'SPOT'])),
  uniformLoopAllNoBranch: runtimeBound(dynamicLoop(dynamicLoop(dynamicLoop(STOCK, 'POINT'), 'SPOT'), 'DIR')),
  stock: STOCK,
  patched: branch(STOCK, ['POINT', 'SPOT']),
  loopPoint: branch(dynamicLoop(STOCK, 'POINT'), ['POINT', 'SPOT']),
  loopPointNoBranch: dynamicLoop(STOCK, 'POINT'),
  loopAll: branch(dynamicLoop(dynamicLoop(dynamicLoop(STOCK, 'POINT'), 'SPOT'), 'DIR'), ['POINT', 'SPOT']),
  loopAllNoBranch: dynamicLoop(dynamicLoop(dynamicLoop(STOCK, 'POINT'), 'SPOT'), 'DIR'),
};

const renderer = new THREE.WebGLRenderer({ antialias: false, depth: false, powerPreference: 'high-performance' });
renderer.setSize(1366, 768);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.debug.checkShaderErrors = true;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext() as WebGL2RenderingContext;
const ext = gl.getExtension('KHR_parallel_shader_compile');
const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const target = new THREE.WebGLRenderTarget(1366, 768, { type: THREE.HalfFloatType });

function rig(scene: THREE.Scene, points: number, opts: { env?: boolean; fog?: boolean; others?: boolean }): void {
  if (opts.env !== false) scene.environment = env;
  if (opts.fog !== false) scene.fog = new THREE.FogExp2(0x05070c, 0.045);
  for (let i = 0; i < points; i++) {
    const l = new THREE.PointLight(0xffc27a, 2, 6 + i * 0.4, 2);
    l.position.set(-5 + i * 1.4, 2.5, -2 + (i % 3));
    scene.add(l);
  }
  if (opts.others === false) return;
  for (let i = 0; i < 2; i++) {
    const s = new THREE.SpotLight(0x9fd8ff, 3, 9, 0.6, 0.4, 2);
    s.position.set(-2 + i * 4, 4, 1);
    scene.add(s, s.target);
  }
  for (let i = 0; i < 3; i++) {
    const d = new THREE.DirectionalLight(0x8090b0, 0.3);
    d.position.set(i - 1, 3, 2);
    scene.add(d);
  }
  scene.add(new THREE.HemisphereLight(0x405060, 0x101010, 0.4), new THREE.AmbientLight(0x202020, 0.3));
}

function tex(): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array(64 * 64 * 4).fill(180), 64, 64);
  t.needsUpdate = true;
  return t;
}

function material(kind: string): THREE.Material {
  if (kind === 'basic') return new THREE.MeshBasicMaterial({ map: tex() });
  const m = new THREE.MeshStandardMaterial({ color: 0x808890, roughness: 0.6, metalness: 0.4 });
  if (kind === 'full') {
    m.map = tex();
    m.normalMap = tex();
    m.roughnessMap = tex();
    m.metalnessMap = m.roughnessMap;
    m.emissiveMap = tex();
    m.emissive.set(0x222222);
  }
  return m;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function compileOnce(chunk: string, kind: string, points: number, opts: { env?: boolean; fog?: boolean; others?: boolean } = {}): Promise<{ compileMs: number; firstDrawMs: number; frameMs: number }> {
  nonce++;
  THREE.ShaderChunk.lights_fragment_begin = CHUNKS[chunk];
  THREE.ShaderChunk.lights_pars_begin = chunk.startsWith('uniform') ? `uniform int kethraLoopZero;
${STOCK_PARS}` : STOCK_PARS;
  const scene = new THREE.Scene();
  rig(scene, points, opts);
  const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.1, 100);
  camera.position.set(0, 1.6, 6);
  const mat = material(kind);
  mat.customProgramCacheKey = () => `${chunk}-${nonce}`;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), mat);
  plane.position.z = -2;
  scene.add(plane);
  renderer.setRenderTarget(target);
  const t0 = performance.now();
  renderer.compile(scene, camera);
  const program = (renderer.properties.get(mat) as { currentProgram: { program: WebGLProgram } }).currentProgram.program;
  if (ext) {
    while (!gl.getProgramParameter(program, ext.COMPLETION_STATUS_KHR)) await wait(1);
  }
  const compileMs = performance.now() - t0;
  const t1 = performance.now();
  renderer.render(scene, camera);
  gl.finish();
  const firstDrawMs = performance.now() - t1;
  const times: number[] = [];
  for (let i = 0; i < 30; i++) {
    const t = performance.now();
    renderer.render(scene, camera);
    gl.finish();
    times.push(performance.now() - t);
  }
  renderer.setRenderTarget(null);
  times.sort((a, b) => a - b);
  mat.dispose();
  plane.geometry.dispose();
  THREE.ShaderChunk.lights_fragment_begin = STOCK;
  return { compileMs: +compileMs.toFixed(0), firstDrawMs: +firstDrawMs.toFixed(0), frameMs: +times[15].toFixed(2) };
}

(window as unknown as { bench: typeof compileOnce; chunks: string[]; parallel: boolean }).bench = compileOnce;
(window as unknown as { chunks: string[] }).chunks = Object.keys(CHUNKS);
(window as unknown as { parallel: boolean }).parallel = !!ext;
document.title = 'ready';
