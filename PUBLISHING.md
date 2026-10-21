# Publishing the Seven Physics Lab

The site is a Next.js **static export**. `npm run build` writes a plain `out/`
folder of HTML, CSS, JavaScript and SVG. There is no server, no database and
nothing to keep running.

Vercel detects Next.js from `package.json` and handles `output: 'export'` on
its own, so there is **no `vercel.json` and nothing to configure**. Adding one
is the usual way this goes wrong: overriding the output directory on a Next.js
project makes Vercel look in the wrong place.

---

## One-off: get it live on your domain

1. Put this project in a GitHub repository (private is fine).
2. Go to **vercel.com → Add New → Project**, sign in with GitHub, and import
   the repository.
3. Leave every build setting alone. Framework should already read **Next.js**.
   Press **Deploy**. The first build takes about a minute.
4. Open **Settings → Domains → Add**, type your domain, and set the DNS records
   Vercel shows you at your registrar. Use the values on that screen rather
   than any written down elsewhere, because they change. Vercel issues the
   HTTPS certificate itself once the records resolve.

### If the site lives in a subfolder

If the address is `yourdomain.com/physics` rather than the root of the domain,
open `next.config.mjs`, uncomment `basePath` and set it to `/physics`, then
commit. Otherwise every link points one level too high.

---

## After that: adding a simulation

Vercel rebuilds on every push to `main` and the live site follows a minute or
two later. Nothing is ever uploaded by hand again. Pushing to any other branch
gives a preview URL instead, which is the safer habit: look at the new
simulation on a real page, then merge.

Adding a simulation touches four things, and only the first has real work in
it:

1. `src/sims/sims/<name>.js` — the simulation itself.
2. `src/sims/index.js` — one line, so the page can load it.
3. `src/data/registry.json` — its entry, and its slug under a subtopic.
4. `tools-card-diagrams/part1.py` or `part2.py` — its card picture, then
   `python3 tools-card-diagrams/build.py` to write the SVG.

Then commit and push.

---

## Checking before you push

    npm run build                 # must finish with no errors

    python3 -m http.server 8731 & # for the verification suites
    cp tools-verification/harness-work.html harness.html
    python3 tools-verification/verify_work.py

Each simulation with a suite in `tools-verification/` has its own harness file
beside it. Every check must pass before the simulation goes on the site.
