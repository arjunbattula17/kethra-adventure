// Registers the self-hosted Rajdhani weights via the CSS Font Loading API instead of a static
// @font-face url() in style.css — see the comment above the removed rule in style.css for why:
// Vite's dev-mode CSS HMR resolves relative url()s against the document, not the stylesheet, so
// a static path is only ever correct in one of dev/GitHub-Pages/Render's three different base
// paths. import.meta.env.BASE_URL is resolved correctly by Vite in every mode.
// 600 and 700 only: style.css uses var(--font-display) in exactly four places and every one sets
// font-weight 600 or 700, so the 500 weight was a third of the font payload fetched for nothing.
const WEIGHTS: Array<[string, number]> = [
  ['rajdhani-600.woff2', 600],
  ['rajdhani-700.woff2', 700],
];

export function loadFonts(): void {
  const base = import.meta.env.BASE_URL;
  for (const [file, weight] of WEIGHTS) {
    // display: 'swap' so headings paint in the fallback stack immediately instead of staying
    // invisible until the woff2 lands — these three fetches overlap almost the whole boot window.
    const face = new FontFace('Rajdhani', `url(${base}fonts/${file})`, { weight: String(weight), display: 'swap' });
    face
      .load()
      .then((loaded) => document.fonts.add(loaded))
      .catch((err) => console.error(`[loadFonts] failed to load ${file}`, err));
  }
}
