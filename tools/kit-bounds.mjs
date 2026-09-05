// Prints world-space bounds of kit pieces straight from the glTF accessor min/max, applying each
// node's own TRS. Ground truth for placement math in walls.ts / airlock.ts / props.ts.
import { readFileSync } from 'node:fs';
const base = 'public/models/quaternius/glTF';
const dirs = { Walls: 'Walls', Columns: 'Columns', Platforms: 'Platforms', Props: 'Props', Decals: 'Decals' };

function mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function trs(n) {
  if (n.matrix) return n.matrix;
  const t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  const [x, y, z, w] = r;
  const m = [
    (1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0], 0,
    (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1], 0,
    (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
  return m;
}
function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }

export function bounds(dir, name) {
  const g = JSON.parse(readFileSync(`${base}/${dir}/${name}.gltf`, 'utf8'));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const perMat = new Map();
  const walk = (idx, parent) => {
    const n = g.nodes[idx];
    const m = mul(parent, trs(n));
    if (n.mesh !== undefined) {
      for (const prim of g.meshes[n.mesh].primitives) {
        const acc = g.accessors[prim.attributes.POSITION];
        const mat = prim.material !== undefined ? g.materials[prim.material].name : '(none)';
        const corners = [];
        for (let i = 0; i < 8; i++) corners.push([i & 1 ? acc.max[0] : acc.min[0], i & 2 ? acc.max[1] : acc.min[1], i & 4 ? acc.max[2] : acc.min[2]]);
        let e = perMat.get(mat);
        if (!e) { e = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], tris: 0 }; perMat.set(mat, e); }
        e.tris += (prim.indices !== undefined ? g.accessors[prim.indices].count : acc.count) / 3;
        for (const c of corners) { const w = xf(m, c); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); e.min[k] = Math.min(e.min[k], w[k]); e.max[k] = Math.max(e.max[k], w[k]); } }
      }
    }
    for (const c of n.children || []) walk(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const s of g.scenes[g.scene ?? 0].nodes) walk(s, I);
  return { min, max, perMat };
}

if (process.argv[2]) {
  for (const arg of process.argv.slice(2)) {
    const [dir, name] = arg.includes('/') ? arg.split('/') : [null, arg];
    const d = dir || Object.keys(dirs).find((k) => { try { readFileSync(`${base}/${k}/${name}.gltf`); return true; } catch { return false; } });
    const b = bounds(d, name);
    const f = (a) => '[' + a.map((v) => v.toFixed(3).padStart(7)).join(', ') + ']';
    console.log(`${name}  min=${f(b.min)} max=${f(b.max)} size=${f(b.max.map((v, i) => v - b.min[i]))}`);
    for (const [mat, e] of b.perMat) console.log(`    ${mat.padEnd(24)} tris=${String(e.tris).padStart(6)} min=${f(e.min)} max=${f(e.max)}`);
  }
}
