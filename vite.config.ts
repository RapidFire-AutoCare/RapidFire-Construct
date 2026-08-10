import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Custom domain (rapidfire.care) and local preview both serve from site root.
// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
})
