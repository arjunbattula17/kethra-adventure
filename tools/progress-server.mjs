// Live progress view for the interior review loop.  node tools/progress-server.mjs [port]
// Serves the repo root as static files and renders a dashboard at / from renders/status.json.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, relative, isAbsolute } from 'node:path';

const port = Number(process.argv[2]) || 5190;
const root = resolve('.');
const TYPES = { '.png': 'image/png', '.json': 'application/json', '.html': 'text/html; charset=utf-8' };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Ship interior — review progress</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0c0d11;color:#dfe3ea;font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
header{position:sticky;top:0;padding:14px 20px;background:#12141a;border-bottom:1px solid #23262f;display:flex;gap:18px;align-items:baseline;flex-wrap:wrap}
h1{font-size:16px;margin:0;letter-spacing:.04em;text-transform:uppercase}
.meta{color:#8b93a3;font-size:12px}
.grid{padding:20px;display:grid;gap:20px}
.card{background:#12141a;border:1px solid #23262f;border-radius:10px;overflow:hidden}
.card h2{margin:0;padding:11px 14px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;display:flex;gap:10px;align-items:center;border-bottom:1px solid #23262f}
.tag{font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid currentColor;letter-spacing:.03em}
.won{color:#5fd39a}.iter{color:#e0b64f}.wait{color:#7b8394}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#23262f}
.pair figure{margin:0;background:#0c0d11}
.pair img{width:100%;display:block}
.pair figcaption{padding:6px 10px;font-size:11px;color:#8b93a3;letter-spacing:.05em;text-transform:uppercase}
.note{padding:12px 14px;font-size:13px;color:#b4bccb;border-top:1px solid #23262f}
.note b{color:#dfe3ea;font-weight:600}
.empty{padding:40px;text-align:center;color:#6b7280}
</style></head><body>
<header><h1>Ship interior &mdash; AAA review loop</h1><span class="meta" id="meta">loading&hellip;</span></header>
<div class="grid" id="grid"></div>
<script>
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
async function tick() {
  let s;
  try { s = await (await fetch('/renders/status.json?t=' + Date.now())).json(); }
  catch { document.getElementById('grid').innerHTML = '<div class="empty">No status yet &mdash; the first round has not finished rendering.</div>'; return; }
  const done = s.pieces.filter(p => p.won).length;
  document.getElementById('meta').textContent =
    'round ' + s.round + ' \\u00b7 ' + done + '/' + s.pieces.length + ' pieces won on the blind test \\u00b7 updated ' + s.updated;
  document.getElementById('grid').innerHTML = s.pieces.map(p => \`
    <section class="card">
      <h2>\${esc(p.name)}
        <span class="tag \${p.won ? 'won' : p.round ? 'iter' : 'wait'}">\${p.won ? 'ours preferred' : p.round ? 'round ' + p.round : 'queued'}</span>
      </h2>
      <div class="pair">
        <figure><img src="/renders/latest/\${esc(p.view)}.png?t=\${Date.now()}"><figcaption>ours</figcaption></figure>
        <figure><img src="/reference/crops/\${esc(p.name)}.png"><figcaption>reference</figcaption></figure>
      </div>
      \${p.note ? '<div class="note"><b>Biggest remaining gap:</b> ' + esc(p.note) + '</div>' : ''}
    </section>\`).join('');
}
tick(); setInterval(tick, 4000);
</script></body></html>`;

createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(PAGE);
  }
  const target = resolve(join(root, normalize(urlPath)));
  const rel = relative(root, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  try {
    if ((await stat(target)).isDirectory()) throw new Error('dir');
    res.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(target));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, () => console.log('progress page: http://localhost:' + port + '/'));
