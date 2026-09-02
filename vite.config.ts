import { defineConfig } from 'vite';

// GitHub Pages serves this repo from a /kethra-adventure/ subpath, so asset URLs need that prefix
// baked in. Render and Cloudflare Pages both serve a static site from the root of their own
// domain instead — each sets its own build-env flag (RENDER, CF_PAGES), so that's what selects
// between the two rather than a separate build script/branch to keep in sync.
const servesFromRoot = process.env.RENDER === 'true' || process.env.CF_PAGES === '1';

export default defineConfig({
  // Empty on purpose: this is a plain static site with no Workers backend, so we don't need
  // @cloudflare/vite-plugin. But Cloudflare's dashboard setup flow codemods this file to inject
  // that plugin and errors ("could not find a valid plugins array") if the array doesn't already
  // exist — this satisfies that without pulling in Workers functionality we don't use.
  plugins: [],
  base: servesFromRoot ? '/' : '/kethra-adventure/',
});
