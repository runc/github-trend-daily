import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import wasm from 'vite-plugin-wasm';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // GitHub Pages default subpath; Cloudflare Pages workflow sets BASE_PATH=/
  site: process.env.SITE_URL || 'https://timus.dev',
  base: process.env.BASE_PATH || '/github-trend-daily',
  integrations: [tailwind()],
  output: 'static',
  trailingSlash: 'ignore',
  vite: {
    plugins: [wasm()],
    optimizeDeps: {
      exclude: ['@ternlight/base'],
    },
    resolve: {
      alias: {
        '~': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});
