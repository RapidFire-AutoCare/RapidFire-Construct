import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project-site path on github.io; local `vite` / `vite preview` use `/`
const base =
  process.env.GITHUB_PAGES === 'true' ? '/RapidFire-Construct/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
})
