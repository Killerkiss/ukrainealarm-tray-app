import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The renderer is a plain TS/CSS settings window. `base: './'` keeps asset URLs
// relative so the built page loads over the file:// protocol inside Electron.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome128',
    sourcemap: true,
  },
  server: {
    port: 5273,
    strictPort: true,
  },
});
