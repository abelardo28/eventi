import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Rutas relativas: la app funciona en cualquier carpeta o dominio estático.
  base: './',
  plugins: [react()],
})
