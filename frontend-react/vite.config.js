import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base '/app/': el build se sirve desde el mismo backend NestJS en esa ruta.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
