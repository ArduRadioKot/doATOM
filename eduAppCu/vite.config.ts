import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = {
  '/api': {
    target: 'http://127.0.0.1:5001',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    proxy,
  },
});
