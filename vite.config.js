import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const pwaFiles = ['sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', '_headers'];

function emitPwaFiles() {
  return {
    name: 'fieldstamp-pwa-files',
    generateBundle() {
      for (const fileName of pwaFiles) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: readFileSync(resolve(publicRoot, fileName))
        });
      }
    }
  };
}

export default defineConfig({
  root: 'public',
  publicDir: false,
  base: './',
  plugins: [emitPwaFiles()],
  build: { outDir: '../dist', emptyOutDir: true }
});
