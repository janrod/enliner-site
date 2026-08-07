# enliner.jp — marketing site

Minimal black-and-white single-page site for **Enliner**. No framework, no build
step — plain `index.html` + `style.css` + `main.js`. Lives on the **`gh-pages`**
branch of the `enliner` repo (an orphan branch — no Swift source here).

## Files
- `index.html` — landing (hero · 3 pillars · price anchor · essay mount · early-access) + footer
- `style.css` — the whole design system (CSS variables, parallax, reveal, responsive, dark mode)
- `main.js` — parallax bg, reveal-on-scroll, nav state, early-access form submit
- `assets/favicon.svg` — the ◐ wordmark glyph
- `CNAME` — custom domain (`enliner.jp`)
- `.nojekyll` — tell Pages to serve files as-is

Copy is sourced from `Docs/marketing/positioning.md` and `case-study-outline.md` (on `main`).

## Preview locally
```sh
cd /Users/jan.rod/dev/enliner-site
python3 -m http.server 8080     # → http://localhost:8080
```

## Before it goes live — two TODOs
1. **Wire the email form.** `index.html` → `#access-form` `action`/`data-endpoint`
   both say `REPLACE_WITH_FORM_ID`. Create a free [Formspree](https://formspree.io)
   form (or Buttondown) and paste the endpoint into both. Until then the form falls
   back to a normal browser POST.
2. **Enable Pages + DNS.**
   - GitHub → repo **Settings → Pages** → Source: **Deploy from a branch**,
     Branch: **`gh-pages`** / **`/ (root)`**.
   - DNS for `enliner.jp` (at the registrar):
     - Apex `A` records → `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`
       (GitHub Pages IPs), **or** an `ALIAS`/`ANAME` to `janrod.github.io`.
     - `www` `CNAME` → `janrod.github.io` (optional).
   - Then in Pages settings, tick **Enforce HTTPS** once the cert provisions.

## Deploy an update
This branch *is* the deploy. Commit + push to `gh-pages` and Pages redeploys.
```sh
git add -A && git commit -m "site: <change>"
unset GITHUB_TOKEN && git push origin gh-pages
```
