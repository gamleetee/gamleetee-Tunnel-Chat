import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve('generated'),
  publicDir: false,
  build: {
    outDir: resolve('www'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022'
  }
});
