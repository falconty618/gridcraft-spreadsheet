import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function singleFileBuild() {
  return {
    name: 'gridcraft-single-file-build',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      const outputPath = fileURLToPath(new URL('./dist/index.html', import.meta.url));
      let html = await readFile(outputPath, 'utf8');
      const outputRoot = new URL('./dist/', import.meta.url);

      const scriptTag = html.match(/<script\s+type="module"\s+crossorigin\s+src="([^"]+)"\s*><\/script>/);
      if (scriptTag) {
        const scriptPath = fileURLToPath(new URL(scriptTag[1], outputRoot));
        const script = (await readFile(scriptPath, 'utf8')).replace(/<\/script/gi, '<\\/script');
        html = html.replace(scriptTag[0], () => `<script type="module">${script}</script>`);
      }

      const styleTag = html.match(/<link\s+rel="stylesheet"\s+crossorigin\s+href="([^"]+)"\s*>/);
      if (styleTag) {
        const stylePath = fileURLToPath(new URL(styleTag[1], outputRoot));
        const style = await readFile(stylePath, 'utf8');
        html = html.replace(styleTag[0], () => `<style>${style}</style>`);
      }

      await writeFile(outputPath, html, 'utf8');
    },
  };
}

export default defineConfig({
  plugins: [react(), singleFileBuild()],
  base: './',
  server: { host: '127.0.0.1', port: 4173 },
  build: {
    rolldownOptions: {
      output: { codeSplitting: false },
    },
  },
});
