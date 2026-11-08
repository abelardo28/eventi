import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Rutas relativas: la app funciona en cualquier carpeta o dominio estático.
  base: './',
  plugins: [react()],
  // UN_ARCHIVO=1 junta todo en un solo script (para la demo de una sola página).
  ...(process.env.UN_ARCHIVO && { build: { outDir: 'dist-demo', rolldownOptions: { output: { inlineDynamicImports: true } } } }),
})
