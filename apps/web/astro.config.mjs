import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import wasm from 'vite-plugin-wasm';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  site: 'https://timus.dev',
  base: '/github-trend-daily',
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
