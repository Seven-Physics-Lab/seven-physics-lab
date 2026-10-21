Simulations that are finished and verified but not listed on the site.

Nothing in this folder is imported by `src/sims/index.js`, so none of it ships.
To put one back: move the file into `src/sims/sims/`, add its line to
`src/sims/index.js` and its entry to `src/data/registry.json`, and rebuild its
card with `tools-card-diagrams/build.py`.

- `a2-friction.js` — A.2 The Friction Bench. Three benches: the stick-slip
  block on a spring balance, the Greenwood–Williamson contact patch with
  Hertzian summits, and the Prandtl–Tomlinson junction. Verified by
  `tools-verification/verify_friction.py` (26 checks, all passing).
