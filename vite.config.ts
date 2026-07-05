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
          'admin': [
            './src/components/AdminPanel',
            './src/components/AdminLogin',
          ],
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
