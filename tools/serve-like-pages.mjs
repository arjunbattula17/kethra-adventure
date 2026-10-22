// Serves dist/ the way GitHub Pages serves the live game: gzip for everything except images and
// audio (Pages compresses .js, .gltf, .bin...; JPEG/PNG/OGG go as they are), max-age=600, under
// /kethra-adventure/. vite preview sends everything uncompressed, so byte counts taken against it
// overstate what a player downloads (a tree's .bin: 0.77 MB raw, 0.33 MB from Pages).
//
//   node tools/serve-like-pages.mjs [port=4193]
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const PORT = Number(process.argv[2] || 4193);
const ROOT = 'dist';
const PREFIX = '/kethra-adventure/';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain',
};
const RAW = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ogg', '.mp3', '.woff2', '.woff']);
const gz = new Map();

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith(PREFIX)) {
    res.writeHead(404).end();
    return;
  }
  let path = normalize(join(ROOT, decodeURIComponent(url.pathname.slice(PREFIX.length))));
  if (!path.startsWith(normalize(ROOT))) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!existsSync(path)) {
    res.writeHead(404).end();
    return;
  }
  const ext = extname(path).toLowerCase();
  const headers = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' };
  let body = readFileSync(path);
  if (!RAW.has(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    const key = `${path}:${statSync(path).mtimeMs}`;
    if (!gz.has(key)) gz.set(key, gzipSync(body, { level: 6 }));
    body = gz.get(key);
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers).end(body);
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} like GitHub Pages at http://127.0.0.1:${PORT}${PREFIX}`));
