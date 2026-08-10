# RapidFire AutoCare — Coming Soon

Animated React + Three.js landing page for RapidFire AutoCare while the platform is under development.

## Stack

- Vite + React + TypeScript
- Three.js via `@react-three/fiber` and `@react-three/drei`

## Scripts

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Deploy (GitHub Pages)

Pushes to `main` build and deploy via [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml).

One-time setup in the repo:

1. **Settings → Pages → Build and deployment → Source:** GitHub Actions
2. Push to `main` (or run the **Deploy GitHub Pages** workflow manually)

Site URL: `https://rapidfire-autocare.github.io/RapidFire-Construct/`

## Brand assets

Assets live in `public/brand/`:

- `logo-dark.png` / `logo-light.png`
- `wallpaper-engines.png` / `wallpaper-transmissions.png`
