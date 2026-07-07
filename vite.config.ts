import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    historyApiFallback: {
      rewrites: [
        { from: /\/quantrihethong/, to: '/index.html' },
        { from: /.*/, to: '/index.html' },
      ],
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js'],
          'icons': ['lucide-react'],
          // AdminPanel được lazy-load (dynamic import) nên Rollup tự tách chunk async riêng.
          // KHÔNG liệt kê ở đây — nếu ép vào manualChunk chung với AdminLogin (import tĩnh)
          // thì cả chunk sẽ bị tải eagerly cho mọi khách, làm hỏng lazy-load.
          'pages': [
            './src/pages/ListingsPage',
            './src/pages/PropertyDetailPage',
            './src/pages/PostListingPage',
            './src/pages/MyListingsPage',
          ],
        },
      },
    },
  },
});
