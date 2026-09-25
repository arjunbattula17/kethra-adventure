// Registers the self-hosted Rajdhani weights via the CSS Font Loading API instead of a static
// @font-face url() in style.css — see the comment above the removed rule in style.css for why:
// Vite's dev-mode CSS HMR resolves relative url()s against the document, not the stylesheet, so
// a static path is only ever correct in one of dev/GitHub-Pages/Render's three different base
// paths. import.meta.env.BASE_URL is resolved correctly by Vite in every mode.
// 600 and 700 only: style.css uses var(--font-display) in exactly four places and every one sets
// font-weight 600 or 700, so the 500 weight was a third of the font payload fetched for nothing.
// Atkinson Hyperlegible is the body face (docs/STYLE_BIBLE.md, Type): regular, italic and bold.
const FACES: Array<[family: string, file: string, weight: number, style: 'normal' | 'italic']> = [
  ['Rajdhani', 'rajdhani-600.woff2', 600, 'normal'],
  ['Rajdhani', 'rajdhani-700.woff2', 700, 'normal'],
  ['Atkinson Hyperlegible', 'atkinson-400-normal.woff2', 400, 'normal'],
  ['Atkinson Hyperlegible', 'atkinson-400-italic.woff2', 400, 'italic'],
  ['Atkinson Hyperlegible', 'atkinson-700-normal.woff2', 700, 'normal'],
];

let ready: Promise<void> = Promise.resolve();

/** Resolves once every weight has loaded or failed — for a scene whose first frame shows display
 * type and must not swap fonts mid-animation. Never rejects. */
export function displayFontsReady(): Promise<void> {
  return ready;
}

export function loadFonts(): void {
  const base = import.meta.env.BASE_URL;
  const loads: Promise<void>[] = [];
  for (const [family, file, weight, style] of FACES) {
    // display: 'swap' so text paints in the fallback stack immediately instead of staying
    // invisible until the woff2 lands — these fetches overlap almost the whole boot window.
    const face = new FontFace(family, `url(${base}fonts/${file})`, { weight: String(weight), style, display: 'swap' });
    loads.push(
      face
        .load()
        .then((loaded) => void document.fonts.add(loaded))
        .catch((err) => console.error(`[loadFonts] failed to load ${file}`, err)),
    );
  }
  ready = Promise.all(loads).then(() => {});
}
