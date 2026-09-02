// One-time asset prep: the raw NASA glTF models embed uncompressed 4096x3072 PNG textures
// (~10-50MB of GPU memory each) on top of trivial geometry (1.6k-3k verts) — fine for NASA's own
// AR/print use case, not for a real-time cutscene this project is actively fighting lag on. This
// re-encodes each embedded image as a downscaled JPEG and splices it back into the GLB binary
// chunk in place, so the shipped file only downloads/decodes what the scene actually needs.
// Uses the project's existing playwright/canvas convention (see imgtool.mjs) rather than adding a
// native image dependency.
//
//   node tools/prep-planet-models.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const MAX_DIM = 2048;
const JPEG_QUALITY = 0.85;
const MODELS = ['saturn', 'venus', 'jupiter', 'earth'];

function readGlb(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const binChunkStart = 20 + jsonLen;
  const binChunkLen = buf.readUInt32LE(binChunkStart);
  const binStart = binChunkStart + 8;
  const bin = buf.slice(binStart, binStart + binChunkLen);
  return { json, bin };
}

function writeGlb(path, json, bin) {
  const jsonStr = JSON.stringify(json);
  const jsonPad = (4 - (jsonStr.length % 4)) % 4;
  const jsonBuf = Buffer.concat([Buffer.from(jsonStr, 'utf8'), Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binBuf = Buffer.concat([bin, Buffer.alloc(binPad, 0x00)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // magic 'glTF'
  header.writeUInt32LE(2, 4); // version
  const totalLen = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  header.writeUInt32LE(totalLen, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuf.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  writeFileSync(path, Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binBuf]));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.goto('about:blank');

async function recompress(bytes, mimeType) {
  const b64 = await page.evaluate(
    async ({ dataUrl, maxDim, quality }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', quality);
    },
    { dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`, maxDim: MAX_DIM, quality: JPEG_QUALITY },
  );
  return Buffer.from(b64.split(',')[1], 'base64');
}

for (const name of MODELS) {
  const path = `public/models/planets/${name}.glb`;
  const { json, bin } = readGlb(path);
  const beforeSize = bin.length;

  const chunks = []; // { start, buf } sorted by original start, non-image bufferViews unchanged
  const imageBufferViewIndices = new Set((json.images || []).map((img) => img.bufferView).filter((i) => i !== undefined));

  // New JPEG bytes per image, keyed by bufferView index.
  const newImageBytes = new Map();
  for (const img of json.images || []) {
    if (img.bufferView === undefined) continue;
    const bv = json.bufferViews[img.bufferView];
    const orig = bin.slice(bv.byteOffset, bv.byteOffset + bv.byteLength);
    const recompressed = await recompress(orig, img.mimeType || 'image/png');
    newImageBytes.set(img.bufferView, recompressed);
    img.mimeType = 'image/jpeg';
  }

  // Rebuild the binary buffer: walk bufferViews in original order, copying non-image data
  // verbatim and substituting recompressed bytes for image data, realigning byteOffsets to
  // 4-byte boundaries (required for typed-array accessors; harmless no-op for raw image bytes).
  const newBin = [];
  let cursor = 0;
  const bufferViews = json.bufferViews;
  const order = bufferViews.map((_, i) => i).sort((a, b) => bufferViews[a].byteOffset - bufferViews[b].byteOffset);
  for (const i of order) {
    const bv = bufferViews[i];
    const bytes = newImageBytes.has(i) ? newImageBytes.get(i) : bin.slice(bv.byteOffset, bv.byteOffset + bv.byteLength);
    const pad = (4 - (cursor % 4)) % 4;
    if (pad) newBin.push(Buffer.alloc(pad, 0));
    cursor += pad;
    bv.byteOffset = cursor;
    bv.byteLength = bytes.length;
    newBin.push(bytes);
    cursor += bytes.length;
  }
  const rebuiltBin = Buffer.concat(newBin);
  if (json.buffers?.[0]) json.buffers[0].byteLength = rebuiltBin.length;

  writeGlb(path, json, rebuiltBin);
  console.log(`${name}: ${(beforeSize / 1e6).toFixed(1)}MB -> ${(rebuiltBin.length / 1e6).toFixed(1)}MB`);
}

await browser.close();
