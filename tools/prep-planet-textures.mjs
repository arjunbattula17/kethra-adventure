// Builds this game's fictional planet textures out of real Solar System Scope equirect maps
// (CC BY 4.0, NASA-derived -- see public/textures/CREDITS.md).
//
// The point is NOT to ship Earth/Mars/Jupiter/Neptune with a tint on top: at cinematic distance a
// viewer still reads the continents and the Great Red Spot, which fights a "galaxy no chart has
// ever mapped" premise. Instead each source is re-mapped through a per-planet three-stop luminance
// ramp, which keeps the source's real geological/atmospheric STRUCTURE (that's the part worth
// having) while replacing its colour signature wholesale. A small fraction of the source chroma is
// mixed back so the result doesn't posterise into flat bands.
//
// Image work runs in a headless Chromium canvas rather than a native image library, because
// Playwright is already a devDependency here and sharp/jimp are not -- same reason
// tools/prep-planet-models.mjs stayed dependency-free.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

// Sourced from Solar System Scope's own download endpoint rather than the Wikimedia mirror: the
// mirror rate-limits a burst of full-size originals from one client with 429s that a retry loop
// could not clear, and this is the original publisher either way.
const SRC = {
  earthClouds: 'https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg',
  // Venus's radar topography: real highland/lowland terrain with none of Earth's instantly
  // recognizable coastlines -- see the kethra entry below for why that matters.
  venusSurface: 'https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg',
  mars: 'https://www.solarsystemscope.com/textures/download/2k_mars.jpg',
  jupiter: 'https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg',
  neptune: 'https://www.solarsystemscope.com/textures/download/2k_neptune.jpg',
  sun: 'https://www.solarsystemscope.com/textures/download/2k_sun.jpg',
  ringAlpha: 'https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png',
};


// deep/mid/bright are the colours the source's darkest, mid and brightest luminances land on.
// Each planet's ramp is built from its own PLANETS entry colour (src/galaxy/planetData.ts) and the
// tagline that entry ships with, so the surface actually depicts the world the fiction describes.
const PLANETS = {
  // "Terraced ruins beneath a bioluminescent canopy". Built on Venus's radar topography, NOT the
  // earth daymap: a recolour cannot hide a coastline, and a green Earth still reads as Earth --
  // Africa and the Americas survived the ramp intact when this was tried. Venus's highland/lowland
  // relief ramps into exactly the terrace-and-basin structure the tagline describes while being
  // unrecognizable to anyone who hasn't studied Magellan radar maps. Contrast is pushed first
  // because that source's own histogram is narrow, which would otherwise ramp to near-flat green.
  kethra: {
    source: 'venusSurface',
    contrast: 1.55,
    ramp: ['#08222c', '#2f6b3f', '#a8c98c'],
    chroma: 0.1,
    // Highlands are the bright end of the ramp, so the canopy glow lands on land, not on the seas.
    night: { color: '#3ff2b0', gamma: 3.4, intensity: 0.9 },
    clouds: true,
  },
  // "A shattered ring-station civilization clinging to the void" -- jupiter's banding reads as a
  // gas giant the stations would orbit; the ramp swings its browns to the entry's violet.
  vessek: {
    source: 'jupiter',
    ramp: ['#20172f', '#7d6aa8', '#ded2f0'],
    chroma: 0.1,
    night: { color: '#b9a6ff', gamma: 3.2, intensity: 0.3 },
    ring: '#c9bcd8',
  },
  // "A storm-wracked desert world of buried machinery" -- mars is already desert, so the ramp is
  // mostly a contrast push, and the night side glows faintly where the machinery is buried.
  orrun: {
    source: 'mars',
    ramp: ['#2b160c', '#a4663a', '#efc394'],
    chroma: 0.22,
    night: { color: '#ff9b42', gamma: 4.0, intensity: 0.5 },
  },
  // "An ocean moon where an ancient signal still sings" -- neptune gives a deep banded ocean with
  // no landmass to give the game away; the night side carries the signal's glow.
  isilthe: {
    source: 'neptune',
    ramp: ['#03152b', '#17608f', '#a6dcef'],
    chroma: 0.12,
    night: { color: '#5fe0ff', gamma: 3.0, intensity: 0.55 },
    clouds: true,
    ring: '#9fc4d8',
  },
};

const outDir = 'public/textures/planets';
mkdirSync(outDir, { recursive: true });
const cacheDir = 'node_modules/.cache/planet-src';
mkdirSync(cacheDir, { recursive: true });

async function fetchCached(name, url) {
  const ext = url.endsWith('.png') ? 'png' : 'jpg';
  const path = `${cacheDir}/${name}.${ext}`;
  if (!existsSync(path)) {
    // Retry with backoff so one flaky response doesn't fail the whole prep run partway through.
    let lastStatus = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 2000 * attempt));
      const res = await fetch(url, { headers: { 'User-Agent': 'kethra-adventure asset prep' } });
      if (res.ok) {
        writeFileSync(path, Buffer.from(await res.arrayBuffer()));
        console.log('downloaded', name);
        return `data:${ext === 'png' ? 'image/png' : 'image/jpeg'};base64,${readFileSync(path).toString('base64')}`;
      }
      lastStatus = res.status;
    }
    throw new Error(`${url} -> HTTP ${lastStatus} after 5 attempts`);
  }
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

const sources = {};
for (const [k, url] of Object.entries(SRC)) sources[k] = await fetchCached(k, url);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');

await page.evaluate(() => {
  window.loadImage = (dataUrl) =>
    new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = dataUrl;
    });
  window.hexToRgb = (h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  // Piecewise-linear through the three ramp stops, then a little of the source's own chroma
  // (colour minus its own luminance) added back so flat regions keep some variation.
  window.rampPixels = (data, ramp, chroma, contrast) => {
    const stops = ramp.map(window.hexToRgb);
    const [d, m, b] = stops;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const bl = data[i + 2];
      let lum = (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255;
      // Widen a narrow source histogram around mid-grey before it hits the ramp, so a low-contrast
      // source still spans all three stops instead of collapsing onto the middle one.
      if (contrast !== 1) lum = Math.max(0, Math.min(1, (lum - 0.5) * contrast + 0.5));
      let out;
      if (lum < 0.5) {
        const t = lum / 0.5;
        out = [d[0] + (m[0] - d[0]) * t, d[1] + (m[1] - d[1]) * t, d[2] + (m[2] - d[2]) * t];
      } else {
        const t = (lum - 0.5) / 0.5;
        out = [m[0] + (b[0] - m[0]) * t, m[1] + (b[1] - m[1]) * t, m[2] + (b[2] - m[2]) * t];
      }
      const l255 = lum * 255;
      data[i] = Math.max(0, Math.min(255, out[0] + (r - l255) * chroma));
      data[i + 1] = Math.max(0, Math.min(255, out[1] + (g - l255) * chroma));
      data[i + 2] = Math.max(0, Math.min(255, out[2] + (bl - l255) * chroma));
    }
  };
});

const written = [];
function save(name, dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(`${outDir}/${name}`, buf);
  written.push(`${name} (${(buf.length / 1024).toFixed(0)}KB)`);
}

// One shared cloud sheet for every world that has weather, rather than a per-planet copy: the
// shader multiplies it by that planet's own colour and rotates it at its own rate, so a second
// identical 570KB file bought nothing. Halved to 1024x512 and desaturated on the way out -- the
// shader only reads .r as coverage, and cloud coverage is low-frequency enough that the full 2K
// resolution was invisible at every distance this cutscene ever views a planet from.
const cloudSheet = await page.evaluate(
  async ({ src }) => {
    const img = await window.loadImage(src);
    const c = document.createElement('canvas');
    c.width = img.width / 2;
    c.height = img.height / 2;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const data = d.data;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = lum;
    }
    ctx.putImageData(d, 0, 0);
    return c.toDataURL('image/jpeg', 0.8);
  },
  { src: sources.earthClouds },
);
save('clouds.jpg', cloudSheet);

for (const [id, def] of Object.entries(PLANETS)) {
  const day = await page.evaluate(
    async ({ src, ramp, chroma, contrast }) => {
      const img = await window.loadImage(src);
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      window.rampPixels(d.data, ramp, chroma, contrast);
      ctx.putImageData(d, 0, 0);
      return c.toDataURL('image/jpeg', 0.88);
    },
    { src: sources[def.source], ramp: def.ramp, chroma: def.chroma, contrast: def.contrast ?? 1 },
  );
  save(`${id}_day.jpg`, day);

  // Night side: the source's own bright features drive where the glow sits, raised to a gamma so
  // only the strongest features survive -- Kethra's canopy, Orrun's buried machinery, Isilthe's
  // signal. Rendered from the same source as the day map so the two line up exactly.
  const night = await page.evaluate(
    async ({ src, color, gamma, intensity, contrast }) => {
      const img = await window.loadImage(src);
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      const night = window.hexToRgb(color);
      const data = d.data;
      for (let i = 0; i < data.length; i += 4) {
        let lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        if (contrast !== 1) lum = Math.max(0, Math.min(1, (lum - 0.5) * contrast + 0.5));
        const g = Math.pow(lum, gamma) * intensity;
        data[i] = night[0] * g;
        data[i + 1] = night[1] * g;
        data[i + 2] = night[2] * g;
      }
      ctx.putImageData(d, 0, 0);
      return c.toDataURL('image/jpeg', 0.82);
    },
    { src: sources[def.source], ...def.night, contrast: def.contrast ?? 1 },
  );
  save(`${id}_night.jpg`, night);

  if (def.ring) {
    // The Solar System Scope ring strip is a 2048x125 radial slice with real alpha. Kept as PNG
    // (the alpha is the whole point) and tinted toward the planet's own palette.
    const ring = await page.evaluate(
      async ({ src, color }) => {
        const img = await window.loadImage(src);
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const tint = window.hexToRgb(color);
        const data = d.data;
        for (let i = 0; i < data.length; i += 4) {
          const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
          data[i] = tint[0] * lum;
          data[i + 1] = tint[1] * lum;
          data[i + 2] = tint[2] * lum;
        }
        ctx.putImageData(d, 0, 0);
        return c.toDataURL('image/png');
      },
      { src: sources.ringAlpha, color: def.ring },
    );
    save(`${id}_ring.png`, ring);
  }
}

// The star this system orbits: kept photographic (real granulation and active regions read far
// better than any procedural noise at this size) but pushed warmer than Sol.
const sun = await page.evaluate(
  async ({ src }) => {
    const img = await window.loadImage(src);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const data = d.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * 1.05 + 30);
      data[i + 1] = Math.min(255, data[i + 1] * 1.0 + 14);
      data[i + 2] = Math.min(255, data[i + 2] * 0.82);
    }
    ctx.putImageData(d, 0, 0);
    return c.toDataURL('image/jpeg', 0.86);
  },
  { src: sources.sun },
);
save('sun.jpg', sun);

await browser.close();
console.log(`wrote to ${outDir}:`);
for (const w of written) console.log('  ' + w);
