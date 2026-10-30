# Blendwire — Blender, live

A live tracker of everything shipping in the Blender world: Blender releases and the upcoming release schedule, daily builds, new and popular add-ons from the Extensions platform, open-source add-ons on GitHub, render and game engines, Blender forks, pipeline tools, and community news.

The site is styled after Blender's own viewport. The four **viewport shading** buttons in the header (Wireframe · Solid · Material Preview · Rendered) restyle the whole site, and press <kbd>Z</kbd> for the shading pie menu, as in Blender. The home page draws a small 3D scene that follows the active shading mode (drag to orbit). <kbd>F3</kbd> opens search, <kbd>N</kbd> toggles the sidebar.

## Real data only

| Source | Used for |
|---|---|
| projects.blender.org (Gitea API): tags & milestones | Blender and Flamenco versions, release dates, release schedule, LTS support windows |
| builder.blender.org | Daily alpha / beta / RC builds per platform |
| extensions.blender.org: API + listings | Newest, most downloaded and top-rated add-ons and themes, version compatibility |
| GitHub Releases API | Add-ons, render engines, forks and tools (`scripts/sources.mjs`) |
| GitHub Search API | Trending Blender add-ons, ranked by star velocity (`scripts/discover.mjs`) |
| RSS / Atom | blender.org, Developer Blog, BlenderNation, CG Channel, 80 Level, BlenderArtists, Developer Forum, r/blender, YouTube creators |
| Hacker News (Algolia) | Blender discussions |

Each source fails on its own; when one is down, its last snapshot is kept, and nothing is ever made up.

## Develop

```bash
npm install
npm run dev   # fetch → build → serve on http://localhost:4173
```

Add a project in `scripts/sources.mjs`. Outputs in `dist/`: HTML pages, `feed.xml` (RSS), `data.json` (JSON API), `search.json`, `sitemap.xml`.

## Deploy (GitHub Pages)

1. Push to a GitHub repo on `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. Optional repo variables: `SITE_URL` (e.g. `https://blendwire.example.com`) and `CNAME` for a custom domain.

`.github/workflows/deploy.yml` checks every source every 10 minutes and deploys only when something shipped; a full refresh runs every 3 hours.

---

Community project — not affiliated with or endorsed by the Blender Foundation. Blender is a trademark of the Blender Foundation.
