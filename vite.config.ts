import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // En GitHub Pages el sitio vive en /<repo>/: el workflow pasa BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
