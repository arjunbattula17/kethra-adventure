// Registers the self-hosted Rajdhani weights via the CSS Font Loading API instead of a static
// @font-face url() in style.css — see the comment above the removed rule in style.css for why:
// Vite's dev-mode CSS HMR resolves relative url()s against the document, not the stylesheet, so
// a static path is only ever correct in one of dev/GitHub-Pages/Render's three different base
// paths. import.meta.env.BASE_URL is resolved correctly by Vite in every mode.
const WEIGHTS: Array<[string, number]> = [
  ['rajdhani-500.woff2', 500],
  ['rajdhani-600.woff2', 600],
  ['rajdhani-700.woff2', 700],
];

export function loadFonts(): void {
  const base = import.meta.env.BASE_URL;
  for (const [file, weight] of WEIGHTS) {
    const face = new FontFace('Rajdhani', `url(${base}fonts/${file})`, { weight: String(weight) });
    face
      .load()
      .then((loaded) => document.fonts.add(loaded))
      .catch((err) => console.error(`[loadFonts] failed to load ${file}`, err));
  }
}
