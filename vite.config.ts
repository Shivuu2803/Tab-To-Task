import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

/**
 * Plain Vite, no crxjs.
 *
 * The usual pick is @crxjs/vite-plugin, but its v2 line has spent a long time
 * in beta and extension HMR is only partly functional anyway. A handful of
 * rollup inputs plus `public/` for the manifest is boring, has no upstream to
 * break on upgrade, and emits exactly the file layout the manifest references.
 *
 * Chrome Web Store policy forbids remote code, so everything must be bundled:
 * no CDN scripts, no eval, no dynamic remote imports.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Extensions ship to a known browser version; no need to down-level.
    target: 'chrome114',
    // Never ship sourcemaps: they are dead weight in the store package and
    // hand a reviewer-facing artifact nothing useful.
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        options: resolve(__dirname, 'options.html'),
        onboarding: resolve(__dirname, 'onboarding.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        // The manifest points at background.js by exact name, so that one entry
        // must not be hashed. Everything else gets normal cache-busting names.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
