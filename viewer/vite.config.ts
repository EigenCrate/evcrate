import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const CSP_DIRECTIVE =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

export default defineConfig({
  root: rootDir,
  base: './',
  build: {
    outDir: path.resolve(rootDir, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020'
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    headers: {
      'Content-Security-Policy': CSP_DIRECTIVE
    }
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    headers: {
      'Content-Security-Policy': CSP_DIRECTIVE
    }
  }
});
