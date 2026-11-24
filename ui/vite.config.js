import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        configure(proxy) {
          // Development requests are same-origin to Vite; forward them as
          // same-origin to the local API, which does not enable browser CORS.
          proxy.on('proxyReq', (request, original) => {
            if (original.headers.origin === `http://${original.headers.host}`) {
              request.setHeader('Origin', 'http://127.0.0.1:8080');
            }
          });
        },
      },
    },
  },
  build: { outDir: 'build' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.js'],
    clearMocks: true,
  },
});
