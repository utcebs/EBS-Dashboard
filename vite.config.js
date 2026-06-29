import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Stable vendor split — keeps app code separate from rarely-
        // changing libraries so users get long-term cache hits when
        // we ship app-only updates. ParticleNetwork stays in its own
        // chunk via React.lazy(). Heavy deps (recharts, pptxgenjs,
        // xlsx) are loaded dynamically and end up in their own chunks
        // automatically.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('lucide-react')) return 'vendor-lucide'
          if (id.includes('@supabase')) return 'vendor-supabase'
          // Match react + react-dom + scheduler narrowly so the three.js
          // ecosystem (@react-three/*, three) stays unbundled and lands
          // in the lazy ParticleNetwork chunk where it belongs.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          return undefined
        },
      },
    },
  },
})
