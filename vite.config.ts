import { defineConfig } from 'vite';

// GitHub Pages serves this repo from a /kethra-adventure/ subpath, so asset URLs need that prefix
// baked in. Render and Cloudflare both serve a static site from the root of their own domain
// instead — each sets its own build-env flag, so that's what selects between the two rather than
// a separate build script/branch to keep in sync. Cloudflare has two separate git-integration
// products with two separate flags: classic Pages sets CF_PAGES=1, but a project connected
// through the newer Workers Builds (workers.dev domain, wrangler-based static assets) sets
// WORKERS_CI=1 instead — CF_PAGES is never set there, so both have to be checked.
const servesFromRoot = process.env.RENDER === 'true' || process.env.CF_PAGES === '1' || process.env.WORKERS_CI === '1';

export default defineConfig({
  // Empty on purpose: this is a plain static site with no Workers backend, so we don't need
  // @cloudflare/vite-plugin. But Cloudflare's dashboard setup flow codemods this file to inject
  // that plugin and errors ("could not find a valid plugins array") if the array doesn't already
  // exist — this satisfies that without pulling in Workers functionality we don't use.
  plugins: [],
  base: servesFromRoot ? '/' : '/kethra-adventure/',
  build: {
    rollupOptions: {
      output: {
        // three.js is ~700kB of the bundle and changes only when the dependency does, while the app
        // code around it changes constantly. Emitting it as its own chunk drops the app chunk from
        // 1,015kB to 318kB (276kB to 100kB gzipped), so a code change stops invalidating three.js in
        // every returning player's cache. Total bytes are unchanged, and the >500kB build warning
        // still fires for the three chunk itself — that is not something this project can split
        // further, since the first scene needs the whole renderer.
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  server: {
    // The capture/audit harnesses under tools/ write their screenshots into renders/ and reports/
    // while a Playwright page is mid-run. Those writes land inside the project root, so the default
    // watcher treats them as source changes and full-reloads the page between shots -- which resets
    // the scene the harness just set up. None of these directories are imported by the app.
    watch: { ignored: ['**/tools/**', '**/renders/**', '**/reports/**'] },
  },
});
