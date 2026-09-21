import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

function singleHtmlPlugin(): Plugin {
  return {
    name: 'evcrate-single-html',
    enforce: 'post',
    generateBundle(_, bundle) {
      let htmlFile: any = null;
      let jsCode = '';
      let cssCode = '';

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.endsWith('.html') && (chunk as any).source) {
          htmlFile = chunk;
        } else if (chunk.type === 'chunk' && chunk.code) {
          jsCode += chunk.code;
        } else if (chunk.type === 'asset' && fileName.endsWith('.css') && typeof chunk.source === 'string') {
          cssCode += chunk.source;
        }
      }

      if (htmlFile) {
        let html = typeof htmlFile.source === 'string' ? htmlFile.source : Buffer.from(htmlFile.source).toString('utf8');
        // Remove external module scripts and stylesheets
        html = html.replace(/<script\b[^>]*\bsrc=["'][^"']*["'][^>]*><\/script>/gi, '');
        html = html.replace(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\/?>/gi, '');
        // Inject inlined style and classic script
        const styleTag = cssCode ? `<style>\n${cssCode}\n</style>` : '';
        const scriptTag = jsCode ? `<script>\n${jsCode}\n</script>` : '';
        html = html.replace('</head>', () => `${styleTag}\n</head>`);
        html = html.replace('</body>', () => `${scriptTag}\n</body>`);

        htmlFile.source = html;
        // Also write directly to plugin/ui/index.html for package inclusion
        fs.writeFileSync(path.resolve(rootDir, 'index.html'), html, 'utf8');
      }
    }
  };
}

export default defineConfig({
  root: rootDir,
  base: './',
  build: {
    outDir: path.resolve(rootDir, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      input: path.resolve(rootDir, 'plugin-document.html'),
      output: {
        format: 'iife',
        name: 'EvcrateAdvisorPluginApp'
      }
    }
  },
  plugins: [singleHtmlPlugin()]
});
