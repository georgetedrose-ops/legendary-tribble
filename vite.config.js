import { defineConfig } from 'vite';

// Static SPA build. The /api directory is handled by Vercel serverless
// functions, not Vite, so it is left untouched by the bundler.
export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
