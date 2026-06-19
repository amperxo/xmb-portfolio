1# XMB Portfolio

A personal portfolio styled after the PlayStation 3 **XrossMediaBar (XMB)** — a
generative wave background on `<canvas>`, a cold-boot intro, and arrow-key
navigation through your content. Built with React + Vite, no UI dependencies.

> Visual homage only — *inspired by* the PS3 XMB. It ships no Sony assets,
> logos, or fonts, and isn't affiliated with or endorsed by Sony.

## Features

- 🌊 **Generative wave background** (Canvas API): a central ribbon of morphing
  Bézier paths, a gradient that drifts through a 12-color palette and shifts
  with the local time of day, ambient particles, and a staged intro reveal.
- 🎮 **XMB navigation**: categories and items driven entirely by config, with
  keyboard (`← → ↑ ↓`, `Enter`, `Esc`) and click/tap support.
- 🚀 **Cold-boot intro** with a configurable wordmark.
- ⚙️ **One file to make it yours** — `src/config.js`.

## Quick start

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Make it yours

Everything personal lives in **`src/config.js`** — you shouldn't need to touch
any other file:

- `siteTitle` — browser tab title.
- `boot.wordmark` — the name shown on the boot screen.
- `profile.name` / `profile.tagline` — header identity.
- `startCategory` — which column the XMB opens on (a category `id`).
- `categories[]` — your content columns. Each item supports `title`,
  `subtitle`, `body`, an optional `href` (adds an "Open ↗" link), and an
  optional `logo` (`gmail` | `github` | `linkedin`).

Add more brand logos by dropping a 24×24 path into
`src/components/BrandIcon.jsx`, and category glyphs into
`src/components/Icon.jsx`.

## Tech

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- Canvas 2D for the wave (no WebGL/Three.js dependency)

## License

[MIT](./LICENSE) © Harshavardan PD
