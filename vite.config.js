import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    open: true,
    // Enable HMR with fast refresh
    hmr: {
      overlay: true
    }
  },
  build: {
    outDir: 'dist',
    // Keep your existing structure for Firebase hosting
    rollupOptions: {
      input: {
        main: 'index.html',
        dashboard: 'dashboard.html'
      }
    }
  },
  // Handle Firebase imports
  optimizeDeps: {
    exclude: ['firebase/app', 'firebase/auth', 'firebase/firestore']
  }
});
