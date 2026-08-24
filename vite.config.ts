import { defineConfig } from 'vite';

// GitHub Pages serves this repo from a /kethra-adventure/ subpath, so asset URLs need that prefix
// baked in. Render serves a static site from the root of its own domain instead — Render sets
// RENDER=true in every build environment, so that's what selects between the two rather than a
// separate build script/branch to keep in sync.
export default defineConfig({
  base: process.env.RENDER === 'true' ? '/' : '/kethra-adventure/',
});
