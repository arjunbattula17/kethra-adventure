# Deploy Checklist

Target: under five minutes from a clean main branch to a verified live link.

## Before deploying
1. `git status`: clean, on `main`/`master`, and everything committed.
2. `npm run build`: type-checks (tsc) and builds to `dist/`. Must finish with no errors.
3. `npx vite preview` in one terminal, then `npm run smoke` in another. All cases must pass.
4. Optional, before a milestone: `node tools/test-tutorial-flow.mjs http://localhost:4173/kethra-adventure/`
   (36 checks).

## Deploy
The site is fully static: `dist/` is the whole game. No server code, no external services.
- **Render** (configured in `render.yaml`): push to the connected branch; Render runs
  `npm install && npm run build` and publishes `dist/`. `RENDER=true` makes Vite serve from the
  domain root.
- **Cloudflare Pages / Workers Builds:** build command `npm run build`, output `dist`. The
  `CF_PAGES` / `WORKERS_CI` flags switch the base path to the root automatically (see
  `vite.config.ts`).
- **GitHub Pages:** serves from `/kethra-adventure/`, which is the default base. Note: a GitHub
  Pages URL contains the account name (DECISIONS D-12).

## After deploying
1. Open the live link in a **private window** (a fresh profile): the game must reach the intro
   with no console errors (F12 → Console).
2. Play to the first tutorial card.
3. Reload: it continues from the save.
4. Check the link from a second device (phone hotspot or another network).
5. Record the date, link and browsers tested in PROGRESS.md.

## Headers
None needed: the game uses no threads or SharedArrayBuffer, so no cross-origin isolation headers
are required on any host.
