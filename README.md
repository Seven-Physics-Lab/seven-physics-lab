# SEVEN Physics Lab

Twenty-five interactive IB Physics simulations, with a landing page, a searchable
dashboard and a page per simulation.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # writes a static site into ./out
```

`npm run build` produces a plain `out/` folder. Any host will serve it: Vercel,
Netlify, GitHub Pages, or a school server. Nothing runs on a server at request
time.

If the site lives in a subfolder — `example.com/physics` — set `basePath` in
`next.config.mjs` and rebuild.

## What is where

```
src/app/page.tsx               the landing page
src/app/simulations/page.tsx   the dashboard
src/app/sim/[slug]/page.tsx    one page per simulation
src/components/Dashboard.tsx   topic column, search, card grid
src/components/SimMount.tsx    mounts a simulation into a div, and takes it down
src/data/registry.json         names, topics, syllabus lines, descriptions
src/sims/                      the simulations themselves, and the kit they share
public/thumbs/                 one card picture per simulation
```

## Adding a simulation

1. Drop the module in `src/sims/sims/`. It must export one default function
   `mount(container, options)` returning `{ destroy() }`, which is the contract
   every simulation here already follows.
2. Add a line to `src/sims/index.js`.
3. Add an entry to `src/data/registry.json`, and put its slug under a subtopic
   in the same file.
4. Put a card picture at `public/thumbs/<slug>.webp`, 760 × 340.

Nothing else needs touching. The dashboard, the search, the topic counts and the
static routes all read the registry.

## The simulations

They are plain ES modules with no dependencies. They bring their own stylesheet,
scoped to `.ibs`, their own animation loop and their own resize handling, and
they read their colours from CSS variables, so the host page controls the theme.
Each one is verified by a Python script that re-implements its physics
independently and drives it through a real browser; those scripts live with the
simulation sources, outside this project.
