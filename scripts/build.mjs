// Builds the static site from data/snapshot.json into dist/.
// Pages are plain template literals; the look lives in src/styles.css and behaviour in src/app.js.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { TOOLS, CATEGORIES, SITE } from './sources.mjs';

const ROOT = new URL('../', import.meta.url);
const DIST = new URL('dist/', ROOT);
const NOW = Date.now();
const DAY = 86400e3;
const SITE_NAME = SITE.name;
const SITE_URL = SITE.url.replace(/\/$/, '');
// Path the site is served under ('/' on a custom domain, '/blendwire/' on <user>.github.io/blendwire).
const BASE = `${new URL(SITE_URL).pathname.replace(/\/$/, '')}/`;

const snap = JSON.parse(await readFile(new URL('data/snapshot.json', ROOT), 'utf8'));
const ASSET_V = createHash('sha1').update(readdirSync(new URL('src/', ROOT)).map((f) => readFileSync(new URL(`src/${f}`, ROOT))).join('')).digest('hex').slice(0, 8);

// ── helpers ───────────────────────────────────────────────
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clampDesc = (s, max = 158) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, t.lastIndexOf(' ', max - 1))}…` : t; };
const lazyImgs = (html) => html.replace(/<img\b(?![^>]*\bloading=)/g, '<img loading="lazy" decoding="async"').replace(/<img\b(?![^>]*\balt=)/g, '<img alt=""');
const absLinks = (html, base) => html.replace(/(<(?:a|img)\b[^>]*?\s(?:href|src)=")(?![a-z][a-z0-9+.-]*:|#)([^"]+)"/gi, (m, pre, u) => {
  try { return `${pre}${new URL(u, base).href}"`; } catch { return m; }
});
const ago = (iso) => {
  const s = Math.max(0, (NOW - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  if (s < 86400 * 365) return `${Math.round(s / 86400 / 30)}mo ago`;
  return `${(s / 86400 / 365).toFixed(1).replace(/\.0$/, '')}y ago`;
};
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtShort = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtMonth = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const time = (iso, cls = '') => `<time class="${cls}" datetime="${esc(iso)}" title="${esc(fmtDate(iso))}">${ago(iso)}</time>`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const KIND = { release: 'Release', changelog: 'Changelog', blog: 'Blog', discussion: 'Discussion' };
const vcmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });

// Small line icons, drawn for the site (24×24, stroke = currentColor).
const ICON = {
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  releases: '<path d="M12 3l6 9-6 9-6-9z"/>',
  addons: '<path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0zM12 16v5"/>',
  engines: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/>',
  news: '<path d="M5 5h14v14H5zM8 9h8M8 12h8M8 15h5"/>',
  outliner: '<path d="M4 5h6M8 10h8M8 15h8M8 20h6M6 5v15"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  rss: '<path d="M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8"/><circle cx="6" cy="18" r="1.4"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  star: '<path d="M12 4l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  tri: '<path d="M8 5l9 7-9 7z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
};
const ico = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

// ── corrective-release fixes ──────────────────────────────
// Each Blender patch release's published bug-fix list, labelled crash / security / data loss.
const FIXES = snap.fixes || {};
const FIX_KIND = [
  ['security', /security|auto-?run|unsanitized|untrusted|malicious|exploit|\bcve\b|\beval\(|arbitrary code|corrupt(ed)? (dna|\.?blend|global|linked|thumbnails?|point|window|files?)|reading corrupt|invalid blend file|malformed/i],
  ['dataloss', /data loss|\bdeletes?\b.*\b(work|unsaved)\b|unsaved (work|changes|data)|lose (work|data)|loses? (your )?(work|data)|(user count|data) corruption|file (is )?lost/i],
  ['crash', /crash|freez|hang\b|hangs|segfault|assert|deadlock|abort/i],
];
const nFixes = (n, w = 'bug fix') => `${n} ${w}${n === 1 ? '' : 'es'}`;
const seriesOfVersion = (v) => v.split('.').slice(0, 2).join('.');
const fixKind = (t) => FIX_KIND.find(([, re]) => re.test(t))?.[0] || 'fix';
const FIX_LABEL = { security: 'Security', dataloss: 'Data loss', crash: 'Crash', fix: 'Fix' };
const fixStats = (v) => {
  const list = FIXES[v] || [];
  const s = { n: list.length, crash: 0, security: 0, dataloss: 0 };
  for (const f of list) { const k = fixKind(f.t); if (k !== 'fix') s[k]++; }
  return s;
};
const fixSummary = (v, series, lts) => {
  const s = fixStats(v);
  if (!s.n) return null;
  const parts = [s.security && `${s.security} security`, s.dataloss && `${s.dataloss} data-loss`, s.crash && `${s.crash} crash`].filter(Boolean);
  return `Corrective release for Blender ${series}${lts ? ' LTS' : ''}: ${nFixes(s.n)}${parts.length ? `, including ${parts.join(', ')} fix${s.security + s.dataloss + s.crash === 1 ? '' : 'es'}` : ''}.`;
};

// ── tools ─────────────────────────────────────────────────
const discovered = snap.discovered || [];
// Blender patch releases get a real summary from their fix list.
for (const i of snap.tools?.blender?.items || []) {
  if (i.kind !== 'release' || !i.patch) continue;
  const sum = fixSummary(i.version, i.series, snap.schedule?.series?.[i.series]?.lts);
  if (sum) i.summary = sum;
}
const tools = [...TOOLS, ...discovered].map((t) => {
  const entry = snap.tools?.[t.id] || { items: [], meta: {} };
  const items = entry.items || [];
  const latestRelease = items.find((i) => i.kind === 'release');
  const latest = latestRelease || items[0];
  const discussions = (snap.discussions || []).filter((d) => (d.toolIds || [d.toolId]).includes(t.id));
  return { ...t, items, meta: entry.meta || {}, latest, latestRelease, discussions, lastActive: latest?.date || '1970-01-01T00:00:00Z' };
}).filter((t) => t.items.length).sort((a, b) => b.lastActive.localeCompare(a.lastActive));
const byId = Object.fromEntries(tools.map((t) => [t.id, t]));
const catColor = (t) => CATEGORIES[t.category]?.color || '#888';
const initials = (name) => name.replace(/^Blender\s+(?=\S)/, '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const toolIcon = (t, size = '') => `<span class="tico ${size}" style="--c:${t.color}" aria-hidden="true">${t.avatar ? `<img src="${esc(t.avatar)}&s=64" alt="" loading="lazy" decoding="async">` : esc(initials(t.name))}</span>`;

// ── release archive ───────────────────────────────────────
// Every release gets a permanent page (tools/<id>/<slug>/). Fetches only keep each tool's latest items,
// so data/releases.json archives everything seen: once a page is indexed it never 404s.
const ARCHIVE = new URL('data/releases.json', ROOT);
const archive = JSON.parse(await readFile(ARCHIVE, 'utf8').catch(() => '{}'));
const slugify = (s) => s.toLowerCase().replace(/^v(?=\d)/, '').replace(/[^a-z0-9.]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);
for (const t of tools) {
  const list = archive[t.id] ||= [];
  const known = new Map(list.map((r) => [r.id, r]));
  const taken = new Set(['releases', ...list.map((r) => r.slug)]);
  for (const i of t.items) {
    if (i.kind !== 'release') continue;
    const rec = { id: i.id, kind: i.kind, version: i.version || '', title: i.title, url: i.url, date: i.date, summary: i.summary || '', html: (i.html || '').length > 60000 ? '' : i.html || '' };
    if (known.has(i.id)) { Object.assign(known.get(i.id), rec); continue; }
    const base = slugify(i.version || i.title) || 'update';
    let slug = taken.has(base) ? `${base}-${i.date.slice(0, 10)}` : base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    list.push({ slug, ...rec });
  }
  list.sort((a, b) => b.date.localeCompare(a.date));
  list.length = Math.min(list.length, 1000);
}
const relPath = (toolId, r) => `tools/${toolId}/${r.slug}/`;
const relPathById = new Map(tools.flatMap((t) => archive[t.id].map((r) => [r.id, relPath(t.id, r)])));
const thinRelease = (r) => (r.html ? r.html.replace(/<[^>]+>/g, '').length : r.summary.length) < 160;

// ── Blender data ──────────────────────────────────────────
const blender = byId.blender;
const schedule = snap.schedule?.series || {};
const blenderReleases = (blender?.items || []).filter((i) => i.kind === 'release');
const seriesList = Object.values(schedule).sort((a, b) => vcmp(b.series, a.series));
const releasedSeries = (s) => blenderReleases.filter((r) => r.series === s).sort((a, b) => vcmp(b.version, a.version));
const firstOf = (s) => releasedSeries(s).at(-1);
const latestStable = blenderReleases.slice().sort((a, b) => vcmp(b.version, a.version))[0];
const latestOfSeries = (s) => releasedSeries(s)[0];
// Upcoming: the nearest open, unreleased series with a scheduled release date.
const upcoming = seriesList
  .filter((s) => !firstOf(s.series) && s.phases.some((p) => p.phase === 'Release' && Date.parse(p.date) > NOW - DAY))
  .sort((a, b) => a.phases.find((p) => p.phase === 'Release').date.localeCompare(b.phases.find((p) => p.phase === 'Release').date))[0];
const releaseDay = (s) => s?.phases.find((p) => p.phase === 'Release')?.date;
// Supported series: LTS still in its window, plus the newest non-LTS until the next release lands.
const supportEnd = (s) => {
  if (s.supportUntil) return s.supportUntil;
  const later = seriesList.filter((x) => vcmp(x.series, s.series) > 0 && firstOf(x.series)).map((x) => firstOf(x.series).date).sort()[0];
  return later || null;
};
const ltsActive = seriesList.filter((s) => s.lts && firstOf(s.series) && s.supportUntil && Date.parse(s.supportUntil) > NOW).sort((a, b) => vcmp(b.series, a.series));
const builds = snap.builds || [];
const ext = snap.extensions;
const news = snap.news || [];
const articles = news.filter((n) => n.type === 'article');
const videos = news.filter((n) => n.type === 'video');
const threads = news.filter((n) => n.type === 'thread');

// ── layout ────────────────────────────────────────────────
const NAV = [
  ['', 'Layout', 'layout'],
  ['releases/', 'Releases', 'releases'],
  ['addons/', 'Add-ons', 'addons'],
  ['engines/', 'Engines', 'engines'],
  ['news/', 'News', 'news'],
  ['tools/', 'Outliner', 'outliner'],
];

// Viewport shading, as in Blender's header: each mode restyles the whole site.
const SHADES = [
  ['wire', 'Wireframe', '<circle cx="12" cy="12" r="8" fill="none"/><path d="M4 12h16M12 4c-3.5 3-3.5 13 0 16M12 4c3.5 3 3.5 13 0 16" fill="none"/>'],
  ['solid', 'Solid', '<circle cx="12" cy="12" r="8" fill="currentColor" stroke="none"/>'],
  ['material', 'Material preview', '<defs><radialGradient id="shm" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="currentColor"/><stop offset="1" stop-color="#222"/></radialGradient></defs><circle cx="12" cy="12" r="8" fill="url(#shm)" stroke="none"/>'],
  ['rendered', 'Rendered', '<defs><radialGradient id="shr" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#ffe2b8"/><stop offset=".4" stop-color="#e87d0d"/><stop offset="1" stop-color="#1a0d00"/></radialGradient></defs><circle cx="12" cy="12" r="8" fill="url(#shr)" stroke="none"/>'],
];
const shadingSwitch = () => `<div class="shading" role="radiogroup" aria-label="Viewport shading (Z)">${SHADES.map(([id, label, svg]) => `<button type="button" role="radio" aria-checked="${id === 'solid'}" data-shade="${id}" title="${label}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true">${svg}</svg><span class="sr">${label}</span></button>`).join('')}</div>`;

function layout({ path = '', title, description, body, active = '', jsonld, noindex = false, ogImage = 'og.png', absolute = false }) {
  const depth = path.split('/').filter(Boolean).length - (path.endsWith('.html') ? 1 : 0);
  // Pages served at any URL (404, offline) need absolute asset paths.
  const root = absolute ? BASE : '../'.repeat(Math.max(0, depth));
  const canonical = `${SITE_URL}/${path.replace(/index\.html$/, '')}`;
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`;
  return `<!doctype html>
<html lang="en" data-shade="solid">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(clampDesc(description))}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="canonical" href="${esc(canonical)}">
<meta name="theme-color" content="#1d1d1d">
<meta property="og:type" content="website"><meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(clampDesc(description))}">
<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${SITE_URL}/${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml"><link rel="icon" href="${root}favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="${root}apple-touch-icon.png"><link rel="manifest" href="${root}manifest.webmanifest">
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME}" href="${root}feed.xml">
<link rel="preload" href="${root}fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${root}assets/styles.css?v=${ASSET_V}">
<script>try{var s=localStorage.getItem('shade');if(/^(wire|solid|material|rendered)$/.test(s))document.documentElement.dataset.shade=s;if(localStorage.getItem('sidebar')==='0')document.documentElement.classList.add('no-side')}catch(e){}</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>\n` : ''}</head>
<body data-root="${root}">
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <a class="brand" href="${root}" aria-label="${SITE_NAME} home"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="brand-wire" d="M5 17C11 17 13 7 19 7" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/><circle cx="5" cy="17" r="3.4" fill="var(--accent)" stroke="var(--area)" stroke-width="1.4"/><circle cx="19" cy="7" r="3.4" fill="var(--ink)" stroke="var(--area)" stroke-width="1.4"/></svg><span>${SITE_NAME}</span></a>
  <nav class="workspaces" aria-label="Workspaces">${NAV.map(([href, label, key]) => `<a href="${root}${href}"${active === key ? ' aria-current="page"' : ''}>${ico(key)}<span>${label}</span></a>`).join('')}</nav>
  <div class="topbar-r">
    <button class="btn-search" type="button" data-search aria-label="Search (F3)">${ico('search')}<span>Search</span><kbd>F3</kbd></button>
    ${shadingSwitch()}
    <button class="btn-follow" type="button" data-follow-open aria-haspopup="dialog">${ico('bell')}<span>Follow</span></button>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-foot">
<div class="foot-cols">
  <p><strong>${SITE_NAME}</strong> tracks Blender, its add-ons, render engines and forks from official sources — projects.blender.org, builder.blender.org, the Extensions platform, GitHub Releases and community feeds. Refreshed every few minutes.</p>
  <p class="foot-links"><a href="${root}follow/">Follow</a> · <a href="${root}calendar.ics">Calendar</a> · <a href="${root}feed.xml">RSS</a> · <a href="${root}data.json">JSON API</a> · <a href="${root}about/">About</a> · <a href="${root}privacy/">Privacy</a></p>
  <p class="disclaimer">Community project — not affiliated with or endorsed by the Blender Foundation. Blender is a trademark of the Blender Foundation.</p>
</div>
</footer>
<div class="statusbar" role="status">
  <span class="sb-hints"><span><kbd>F3</kbd> Search</span><span><kbd>N</kbd> Sidebar</span><span><kbd>Z</kbd> Shading</span></span>
  <span class="sb-report" data-report hidden></span>
  <a class="sb-mine" data-mine-sb hidden href="${root}"></a>
  <span class="sb-stats">${latestStable ? `<span>Blender ${esc(latestStable.version)}</span>` : ''}<span>${plural(tools.length, 'project')}</span><span>Updated <time datetime="${snap.generatedAt}">${ago(snap.generatedAt)}</time></span></span>
</div>
<div class="popover" data-follow hidden role="dialog" aria-label="Follow Blender releases"><div class="popover-box"><header class="popover-h"><b>Follow Blender releases</b><span>No sign-up</span><button type="button" class="btn-ico" data-follow-close aria-label="Close">✕</button></header>${followPanelCached(root)}<a class="popover-more" href="${root}follow/">All follow options →</a></div></div>
<div class="pie" data-pie hidden role="menu" aria-label="Viewport shading">
  <span class="pie-title">Shading</span>
  ${SHADES.map(([id, label, svg], i) => `<button type="button" role="menuitem" class="pie-${['w', 'n', 'e', 's'][i]}" data-shade="${id}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>${label}<kbd>${i + 1}</kbd></button>`).join('')}
</div>
<div class="palette" data-palette hidden>
  <div class="palette-box" role="dialog" aria-label="Search">
    <label class="palette-in">${ico('search')}<input type="search" placeholder="Search releases, add-ons, engines, news…" autocomplete="off" spellcheck="false" data-palette-input></label>
    <ul class="palette-list" data-palette-list role="listbox"></ul>
    <p class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></p>
  </div>
</div>
<script type="application/json" id="bw-versions">${JSON.stringify({ series: MINE_DATA, root }).replace(/</g, '\\u003c')}</script>
<script src="${root}assets/app.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

// ── components ────────────────────────────────────────────
// Feed items are drawn as nodes: a coloured header by category, sockets on both edges.
function nodeCard(item, root) {
  const t = byId[item.toolId];
  const href = relPathById.get(item.id) ? `${root}${relPathById.get(item.id)}` : item.url;
  const external = !relPathById.get(item.id);
  return `<article class="node" style="--c:${catColor(t)}" data-cat="${t.category}" data-id="${esc(item.id)}">
  <header class="node-h"><span class="sock sock-in"></span>${toolIcon(t, 'sm')}<a href="${root}tools/${t.id}/">${esc(t.name)}</a><span class="node-kind">${KIND[item.kind]}</span><span class="sock sock-out"></span></header>
  <div class="node-b">
    <h3><a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${esc(item.title)}</a></h3>
    ${item.summary ? `<p>${esc(item.summary)}</p>` : ''}
    <div class="node-f">${item.version ? `<span class="field"><span>Version</span><b>${esc(item.version)}</b></span>` : `<span class="field"><span>Source</span><b>${esc(item.source)}</b></span>`}${time(item.date, 'node-t')}</div>
  </div>
</article>`;
}

const catFilter = (counts) => `<div class="seg" role="group" aria-label="Filter by category" data-filter>
  <button type="button" aria-pressed="true" data-cat="all">All <small>${Object.values(counts).reduce((a, b) => a + b, 0)}</small></button>
  ${Object.entries(CATEGORIES).filter(([k]) => counts[k]).map(([k, c]) => `<button type="button" aria-pressed="false" data-cat="${k}" style="--c:${c.color}"><i></i>${esc(c.label)} <small>${counts[k]}</small></button>`).join('')}
</div>`;

function videoCard(v) {
  return `<a class="vid" href="${esc(v.url)}" target="_blank" rel="noopener">
  <span class="vid-thumb">${v.image ? `<img src="${esc(v.image)}" alt="" loading="lazy" decoding="async">` : ''}<span class="vid-play">${ico('play')}</span></span>
  <span class="vid-meta"><b>${esc(v.title)}</b><small>${esc(v.source)} · ${ago(v.date)}${v.views ? ` · ${compact(v.views)} views` : ''}</small></span>
</a>`;
}

function articleCard(n, { lead = false } = {}) {
  return `<article class="art${lead ? ' art-lead' : ''}" data-tag="${esc(n.tag || 'Other')}">
  ${n.image ? `<a class="art-img" href="${esc(n.url)}" target="_blank" rel="noopener" tabindex="-1"><img src="${esc(n.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>` : ''}
  <div class="art-b">
    <p class="art-k">${n.tag ? `<span class="tag">${esc(n.tag)}</span>` : ''}<span>${esc(n.source)}</span>${n.official ? '<span class="official">Official</span>' : ''}${time(n.date)}</p>
    <h3><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></h3>
    ${n.summary ? `<p>${esc(n.summary)}</p>` : ''}
  </div>
</article>`;
}

function threadRow(n) {
  return `<li class="thread"><a href="${esc(n.url)}" target="_blank" rel="noopener"><span class="thread-src">${esc(n.source)}</span><b>${esc(n.title)}</b>${n.summary ? `<small>${esc(n.summary)}</small>` : ''}</a>${time(n.date)}</li>`;
}

function hnRow(d) {
  return `<li class="thread"><a href="${esc(d.hnUrl)}" target="_blank" rel="noopener"><span class="thread-src hn">HN</span><b>${esc(d.title)}</b><small>${d.points} points · ${plural(d.comments, 'comment')}</small></a>${time(d.date)}</li>`;
}

// "Your Blender": the visitor picks the version they run; app.js tells them if they're behind or unsupported.
const MINE_DATA = seriesList.filter((s) => firstOf(s.series)).map((s) => ({
  // per version: [version, date, fixes, crash, security, data loss]
  s: s.series, lts: s.lts, end: supportEnd(s), v: releasedSeries(s.series).map((r) => { const f = fixStats(r.version); return [r.version, r.date.slice(0, 10), f.n, f.crash, f.security, f.dataloss]; }),
}));
const mineWidget = () => `<div class="mine" data-mine>
  <label class="mine-pick"><span class="mine-k">Your Blender</span>
    <select data-mine-select aria-label="Which Blender version do you use?">
      <option value="">Pick your version…</option>
      ${MINE_DATA.map((s) => `<optgroup label="Blender ${esc(s.s)}${s.lts ? ' LTS' : ''}">${s.v.map(([v]) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</optgroup>`).join('')}
    </select></label>
  <div class="mine-out" data-mine-out><span class="mine-hint">See if you're behind, still supported, and which add-ons work for you.</span></div>
</div>`;

function extCard(e, mode = '') {
  return `<a class="ext" href="${esc(e.url)}" target="_blank" rel="noopener"${e.min ? ` data-min="${esc(e.min)}"` : ''}${e.max ? ` data-max="${esc(e.max)}"` : ''}>
  <span class="ext-thumb">${e.thumb ? `<img src="${esc(e.thumb)}" alt="" loading="lazy" decoding="async">` : `<span class="ext-ph">${esc(initials(e.name))}</span>`}${e.min ? `<span class="ext-min" title="Requires Blender ${esc(e.min)}+">${esc(e.min.replace(/\.0$/, ''))}+</span>` : ''}</span>
  <span class="ext-b"><b>${esc(e.name)}</b><small>${esc(e.tagline)}</small>
  <span class="ext-f">${e.rating ? `<span>${ico('star')}${e.rating.toFixed(1)}<em>(${e.reviews})</em></span>` : ''}${e.downloads != null ? `<span>${ico('download')}${compact(e.downloads)}</span>` : ''}${e.version ? `<span class="mono">v${esc(e.version)}</span>` : ''}${mode === 'new' && e.tags?.[0] ? `<span>${esc(e.tags[0])}</span>` : ''}</span></span>
</a>`;
}

function projectNode(t, root) {
  const r = t.latestRelease;
  return `<a class="pnode" href="${root}tools/${t.id}/" style="--c:${catColor(t)}" data-cat="${t.category}">
  <span class="pnode-h">${toolIcon(t, 'sm')}<b>${esc(t.name)}</b>${t.discovered ? '<span class="trend" title="Trending on GitHub">↗</span>' : ''}</span>
  <span class="pnode-blurb">${esc(clampDesc(t.blurb || '', 110))}</span>
  <span class="pnode-f">${r ? `<span class="field"><span>Latest</span><b>${esc(r.version)}</b></span>` : ''}${t.meta.stars ? `<span class="pnode-stars">${ico('star')}${compact(t.meta.stars)}</span>` : ''}${r ? time(r.date) : ''}</span>
</a>`;
}

// Blender-style number field: label on the left, value on the right.
const field = (label, value, cls = '') => `<div class="nfield ${cls}"><span>${esc(label)}</span><b>${value}</b></div>`;

// Activity: monthly release counts over the last two years as little bars.
function activity(dates, months = 24) {
  const now = new Date(NOW);
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    return { key: d.toISOString().slice(0, 7), label: fmtMonth(d.toISOString()), n: 0 };
  });
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const d of dates) { const i = idx.get(d.slice(0, 7)); if (i != null) buckets[i].n++; }
  const max = Math.max(1, ...buckets.map((b) => b.n));
  return `<div class="act" role="img" aria-label="Releases per month, last ${months} months">${buckets.map((b) => `<span style="--h:${(b.n / max) * 100}%" title="${b.label}: ${plural(b.n, 'release')}"><i></i></span>`).join('')}</div>
  <div class="act-axis"><span>${buckets[0].label}</span><span>${buckets.at(-1).label}</span></div>`;
}

// ── home ──────────────────────────────────────────────────
function viewport(root) {
  const lts = latestStable && schedule[latestStable.series]?.lts;
  const up = upcoming;
  const upDate = releaseDay(up);
  const nightly = builds.filter((b) => b.risk === 'alpha')[0];
  return `<section class="viewport" aria-label="Current Blender version">
  <div class="vp-grid" aria-hidden="true"></div>
  <canvas class="vp-scene" data-scene aria-hidden="true"></canvas>
  <div class="vp-gizmo" aria-hidden="true"><svg viewBox="0 0 80 80"><line x1="40" y1="40" x2="68" y2="50" stroke="#ff3352"/><line x1="40" y1="40" x2="18" y2="54" stroke="#8bdc00"/><line x1="40" y1="40" x2="40" y2="10" stroke="#2890ff"/><circle cx="68" cy="50" r="7" fill="#ff3352"/><circle cx="18" cy="54" r="7" fill="#8bdc00"/><circle cx="40" cy="10" r="7" fill="#2890ff"/><text x="68" y="53" text-anchor="middle">X</text><text x="18" y="57" text-anchor="middle">Y</text><text x="40" y="13" text-anchor="middle">Z</text></svg></div>
  <p class="vp-label">User Perspective · <span data-shade-label>Solid</span><br><span>(1) Scene | Blender ${latestStable ? esc(latestStable.version) : ''}</span></p>
  <p class="vp-hint" aria-hidden="true">Drag to orbit · <kbd>Z</kbd> shading</p>
  <div class="vp-copy">
    <p class="eyebrow">Latest stable release</p>
    <h1>Blender <span class="ver">${esc(latestStable?.version || '')}</span>${lts ? '<span class="pill pill-lts">LTS</span>' : ''}</h1>
    <p class="vp-sub">${latestStable ? `Released ${fmtDate(latestStable.date)} · ${ago(latestStable.date)}` : ''}${ltsActive.length ? ` · LTS lines: ${ltsActive.map((s) => `<b>${esc(latestOfSeries(s.series)?.version || s.series)}</b>`).join(', ')}` : ''}</p>
    <div class="vp-actions">
      <a class="btn btn-primary" href="https://www.blender.org/download/" target="_blank" rel="noopener">${ico('download')} Download</a>
      ${latestStable ? `<a class="btn" href="${esc(latestStable.url)}" target="_blank" rel="noopener">Release notes</a>` : ''}
      <a class="btn btn-ghost" href="${root}releases/">All versions →</a>
    </div>
    ${mineWidget()}
  </div>
  <aside class="npanel" aria-label="Sidebar">
    <div class="npanel-tabs" aria-hidden="true"><span class="on">Item</span><span>Tool</span><span>View</span></div>
    <details open><summary>Next release</summary>
      ${up ? `${field('Version', esc(up.series))}${field('Release', esc(fmtDate(upDate)))}<div class="countdown" data-countdown="${esc(upDate)}"><b>${Math.max(0, Math.ceil((Date.parse(upDate) - NOW) / DAY))}</b><span>days to go</span></div><a class="np-link" href="${root}releases/${esc(up.series)}/">What's new in ${esc(up.series)} →</a>` : '<p class="muted">No release scheduled.</p>'}
    </details>
    <details open><summary>Daily builds</summary>
      ${builds.slice(0, 4).map((b) => field(`${b.version}`, `<span class="risk risk-${esc(b.risk)}">${esc(b.risk)}</span>`)).join('')}
      ${nightly ? `<p class="np-note">Main updated ${ago(nightly.date)} · <code>${esc(nightly.hash)}</code></p>` : ''}
    </details>
    <details open><summary>Extensions</summary>
      ${ext ? `${field('Add-ons', compact(ext.counts['add-on'] || 0))}${field('Themes', compact(ext.counts.theme || 0))}` : ''}
    </details>
  </aside>
</section>`;
}

// The upcoming release, told with its own demo videos: a cinematic band under the hero.
function comingSoonBand(root) {
  const up = upcoming;
  const hl = up && highlightsOf(up.series);
  if (!hl || !hl.spotlight.length) return '';
  const day = releaseDay(up);
  const days = Math.max(0, Math.ceil((Date.parse(day) - NOW) / DAY));
  const reel = [...hl.spotlight.filter((f) => f.video), ...hl.spotlight.filter((f) => !f.video)].slice(0, 4);
  return `<section class="coming" aria-labelledby="h-coming">
  <div class="coming-copy">
    <p class="eyebrow">Coming ${fmtShort(day)}</p>
    <h2 id="h-coming">Blender ${esc(up.series)} lands in <span data-countdown="${esc(day)}"><b>${days}</b></span> day${days === 1 ? '' : 's'}</h2>
    <p>${hl.all.length} changes across ${hl.sections.length} areas, including ${hl.spotlight.slice(0, 3).map((f) => `<b>${esc(f.title)}</b>`).join(', ')}.</p>
    <div class="coming-cta"><a class="btn btn-primary" href="${root}releases/${esc(up.series)}/">See what's new in ${esc(up.series)} →</a><button type="button" class="btn" data-follow-open>${ico('bell')} Add release day to calendar</button></div>
  </div>
  <div class="coming-reel">${reel.map((f) => `<a class="reel-item" href="${root}releases/${esc(up.series)}/" title="${esc(f.title)}">${media(f)}<span><small>${esc(f.area)}</small>${esc(f.title)}</span></a>`).join('')}</div>
</section>`;
}

// One node per project for the week: its newest update up front, the rest stacked beneath.
function groupNode(t, items, root) {
  const [lead, ...rest] = items;
  const href = relPathById.get(lead.id) ? `${root}${relPathById.get(lead.id)}` : lead.url;
  const ext = !relPathById.get(lead.id);
  const releases = items.filter((i) => i.kind === 'release').length;
  const label = releases > 1 ? `${releases} releases` : KIND[lead.kind];
  return `<article class="node gnode${t.id === 'blender' ? ' gnode-hero' : ''}" style="--c:${catColor(t)}" data-cat="${t.category}" data-id="${esc(lead.id)}" data-ids="${esc(items.map((i) => i.id).join(' '))}">
  <header class="node-h"><span class="sock sock-in"></span>${toolIcon(t, 'sm')}<a href="${root}tools/${t.id}/">${esc(t.name)}</a>${t.discovered ? '<span class="trend" title="Trending on GitHub">↗</span>' : ''}<span class="node-kind">${label}</span><span class="sock sock-out"></span></header>
  <div class="node-b">
    <h3><a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${esc(lead.title)}</a></h3>
    ${lead.summary ? `<p>${esc(lead.summary)}</p>` : ''}
    ${rest.length ? `<ul class="gnode-more">${rest.slice(0, 3).map((i) => { const h = relPathById.get(i.id); return `<li><a href="${esc(h ? `${root}${h}` : i.url)}"${h ? '' : ' target="_blank" rel="noopener"'}>${i.version ? `<code>${esc(i.version)}</code>` : ''}<span>${esc(i.version ? KIND[i.kind] : i.title)}</span></a>${time(i.date)}</li>`; }).join('')}${rest.length > 3 ? `<li class="gnode-x"><a href="${root}tools/${t.id}/">+${rest.length - 3} more</a></li>` : ''}</ul>` : ''}
    <div class="node-f">${lead.version ? `<span class="field"><span>Latest</span><b>${esc(lead.version)}</b></span>` : `<span class="field"><span>Source</span><b>${esc(lead.source)}</b></span>`}${time(lead.date, 'node-t')}</div>
  </div>
</article>`;
}

function indexPage() {
  const root = '';
  // This week, grouped by project: Blender first, then curated projects, then (at most 8) trending repos.
  const groupsFor = (days) => tools.map((t) => [t, t.items.filter((i) => NOW - Date.parse(i.date) < days * DAY)]).filter(([, l]) => l.length);
  let days = 14, groups = groupsFor(days);
  if (groups.length < 9) groups = groupsFor(days = 30);
  const rank = ([t]) => (t.id === 'blender' ? 0 : t.discovered ? 2 : 1);
  groups.sort((a, b) => rank(a) - rank(b) || b[1][0].date.localeCompare(a[1][0].date));
  let trendingShown = 0;
  groups = groups.filter(([t]) => !t.discovered || ++trendingShown <= 8);
  const counts = groups.reduce((m, [t]) => { m[t.category] = (m[t.category] || 0) + 1; return m; }, {});
  const totalUpdates = groups.reduce((n, [, l]) => n + l.length, 0);
  const trending = tools.filter((t) => t.discovered).slice(0, 6);
  const body = `${viewport(root)}
${comingSoonBand(root)}
<div class="ws">
  <section class="area area-feed" aria-labelledby="h-feed">
    <header class="area-h"><h2 id="h-feed">${ico('releases')} ${days === 14 ? 'Last two weeks' : 'This month'} <small class="area-sub">${plural(totalUpdates, 'update')} from ${plural(groups.length, 'project')}</small></h2>${catFilter(counts)}</header>
    <div class="nodes" data-feed>${groups.map(([t, l]) => groupNode(t, l, root)).join('')}</div>
    ${videos.length ? `<section class="feed-vids" aria-labelledby="h-vid"><header class="area-h"><h2 id="h-vid">${ico('play')} Fresh videos</h2><a href="${root}news/#videos">All videos →</a></header>
      <div class="vids vids-grid">${videos.slice(0, 6).map(videoCard).join('')}</div></section>` : ''}
  </section>
  <aside class="area area-side">
    <section class="panel"><header class="panel-h"><h2>${ico('news')} Headlines</h2><a href="${root}news/">All news →</a></header>
      <div class="arts arts-compact">${articles.slice(0, 6).map((n) => articleCard(n)).join('')}</div></section>
    <section class="panel"><header class="panel-h"><h2>${ico('addons')} New on Extensions</h2><a href="${root}addons/">More →</a></header>
      <div class="exts exts-compact">${(ext?.newest || []).slice(0, 5).map((e) => extCard(e, 'new')).join('')}</div></section>
    ${trending.length ? `<section class="panel"><header class="panel-h"><h2>${ico('star')} Trending on GitHub</h2></header>
      <ol class="rank">${trending.map((t, i) => `<li><span class="rank-n">${i + 1}</span><a href="${root}tools/${t.id}/">${toolIcon(t, 'sm')}<b>${esc(t.name)}</b></a><small>${t.starsPerWeek ? `+${compact(t.starsPerWeek)}★/wk` : t.meta.stars ? `${compact(t.meta.stars)}★` : ''}</small></li>`).join('')}</ol></section>` : ''}
  </aside>
</div>`;
  return layout({
    path: 'index.html', title: `${SITE_NAME} — Blender releases, add-ons & news, live`, active: 'layout',
    description: `Live tracker for Blender: the latest release${latestStable ? ` (${latestStable.version})` : ''}, upcoming versions, daily builds, new add-ons and extensions, render engines and community news.`,
    body, jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: `${SITE_URL}/` },
  });
}

// ── releases ──────────────────────────────────────────────
// Version history: one row per Blender series, a dot per release, a bar for its support window.
function dopeSheet(root) {
  const shown = seriesList.filter((s) => firstOf(s.series) || (s.state === 'open' && releaseDay(s)))
    .filter((s) => { const end = supportEnd(s); return !end || Date.parse(end) > NOW - 400 * DAY; })
    .sort((a, b) => vcmp(b.series, a.series));
  if (!shown.length) return '';
  const starts = shown.map((s) => Date.parse(firstOf(s.series)?.date || s.phases[0]?.date || releaseDay(s)));
  const ends = shown.map((s) => Date.parse(supportEnd(s) || releaseDay(s) || NOW));
  const start = Date.UTC(new Date(Math.min(...starts)).getUTCFullYear(), 0, 1);
  const end = Date.UTC(new Date(Math.max(...ends, NOW + 180 * DAY)).getUTCFullYear() + 1, 0, 1);
  const pos = (ms) => (((ms - start) / (end - start)) * 100).toFixed(3);
  const years = [];
  for (let y = new Date(start).getUTCFullYear(); Date.UTC(y, 0, 1) < end; y++) years.push(y);
  const rows = shown.map((s) => {
    const rels = releasedSeries(s.series);
    const from = Date.parse(firstOf(s.series)?.date || releaseDay(s));
    const to = Date.parse(supportEnd(s) || (rels.length ? NOW : releaseDay(s)));
    const live = to > NOW && rels.length;
    const planned = !rels.length;
    const phases = planned ? s.phases.map((p) => `<span class="ds-phase" style="left:${pos(Date.parse(p.date))}%" data-tip="${esc(`${p.phase} · ${fmtDate(p.date)}`)}">${esc(p.phase[0])}</span>`).join('') : '';
    return `<div class="ds-row${s.lts ? ' is-lts' : ''}${live ? ' is-live' : ''}${planned ? ' is-planned' : ''}">
  <a class="ds-label" href="${root}releases/${s.series}/"><span class="ds-eye">${ico('eye')}</span><b>${esc(s.series)}</b>${s.lts ? '<span class="pill pill-lts">LTS</span>' : ''}${planned ? '<span class="pill">Planned</span>' : ''}</a>
  <div class="ds-track"><span class="ds-nowl" style="left:${pos(NOW)}%"></span><span class="ds-bar" style="left:${pos(from)}%;width:${Math.max(0.4, pos(to) - pos(from))}%" title="${esc(`${s.series}: ${fmtDate(new Date(from).toISOString())} → ${fmtDate(new Date(to).toISOString())}`)}"></span>${phases}${rels.map((r) => `<a class="ds-key${r.patch === 0 ? ' major' : ''}" style="left:${pos(Date.parse(r.date))}%" href="${root}${relPathById.get(r.id)}" data-tip="${esc(`${r.version} · ${fmtDate(r.date)}`)}" aria-label="${esc(r.version)}"></a>`).join('')}</div>
</div>`;
  }).join('');
  return `<div class="dope">
  <div class="ds-row ds-ruler"><span class="ds-label">Series</span><div class="ds-track"><span class="ds-nowl" style="left:${pos(NOW)}%"><b>Today</b></span>${years.map((y) => `<span class="ds-year" style="left:${pos(Date.UTC(y, 0, 1))}%">${y}</span>`).join('')}</div></div>
  ${rows}
</div>`;
}

function phaseBar(s) {
  if (!s) return '';
  const ph = s.phases;
  const first = Date.parse(ph[0].date), last = Date.parse(ph.at(-1).date);
  const p = Math.min(100, Math.max(0, ((NOW - first) / (last - first)) * 100));
  const current = [...ph].reverse().find((x) => Date.parse(x.date) <= NOW)?.phase || 'Planning';
  return `<div class="phases" style="--p:${p.toFixed(1)}%">
  <div class="phases-track"><span class="phases-fill"></span>${ph.map((x) => `<span class="phases-key${Date.parse(x.date) <= NOW ? ' done' : ''}" style="left:${(((Date.parse(x.date) - first) / (last - first)) * 100).toFixed(2)}%"><i></i><b>${esc(x.phase)}</b><small>${fmtShort(x.date)}</small></span>`).join('')}<span class="phases-head"></span></div>
  <p class="phases-now">Now in <b>${esc(current)}</b></p>
</div>`;
}

const PLATFORM = { windows: 'Windows', darwin: 'macOS', linux: 'Linux' };
function buildsTable() {
  if (!builds.length) return '<p class="muted">No daily builds available right now.</p>';
  return `<div class="tablewrap"><table class="tbl">
  <thead><tr><th>Version</th><th>Stage</th><th>Branch</th><th>Commit</th><th>Built</th><th>Downloads</th></tr></thead>
  <tbody>${builds.map((b) => `<tr>
    <td class="mono"><b>${esc(b.version)}</b></td><td><span class="risk risk-${esc(b.risk)}">${esc(b.risk)}</span></td><td class="mono">${esc(b.branch)}</td>
    <td class="mono"><a href="https://projects.blender.org/blender/blender/commit/${esc(b.hash)}" target="_blank" rel="noopener">${esc(b.hash)}</a></td><td>${time(b.date)}</td>
    <td class="dl">${b.files.map((f) => `<a href="${esc(f.url)}" rel="noopener nofollow" title="${esc(`${PLATFORM[f.platform] || f.platform} ${f.arch} · .${f.ext} · ${compact(f.size)}B`)}">${esc(PLATFORM[f.platform] || f.platform)} <small>${esc(f.arch)}</small></a>`).join('')}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

function releasesPage() {
  const root = '../';
  const up = upcoming;
  const body = `<section class="wrap page-h">
  <p class="eyebrow">${ico('releases')} Releases</p>
  <h1>Blender versions, schedule &amp; builds</h1>
  <p class="lede">Every Blender release since ${esc(seriesList.filter((s) => firstOf(s.series)).at(-1)?.series || '2.8')}, long-term support windows, the next release date and today's daily builds — straight from projects.blender.org and builder.blender.org.</p>
</section>
${up ? `<section class="wrap panel big-next">
  <div class="big-next-copy"><p class="eyebrow">Up next</p><h2>Blender ${esc(up.series)}${up.lts ? ' <span class="pill pill-lts">LTS</span>' : ''}</h2>
  <p>Scheduled for <b>${fmtDate(releaseDay(up))}</b>${HIGHLIGHTS[up.series] ? ` · ${highlightsOf(up.series).all.length} new features and changes so far` : ''}</p><p class="props-links"><a class="btn btn-primary" href="${root}releases/${esc(up.series)}/">See what's new in ${esc(up.series)} →</a></p></div>
  <div class="countdown countdown-lg" data-countdown="${esc(releaseDay(up))}"><b>${Math.max(0, Math.ceil((Date.parse(releaseDay(up)) - NOW) / DAY))}</b><span>days</span></div>
  ${phaseBar(up)}
</section>` : ''}
<section class="wrap panel">
  <header class="panel-h"><h2>Version history <small>release history &amp; support windows</small></h2><span class="ds-legend"><span class="lg-key"></span>corrective release <span class="lg-key major"></span>major release <span class="lg-bar"></span>supported</span></header>
  ${dopeSheet(root)}
</section>
<section class="wrap panel" id="builds">
  <header class="panel-h"><h2>Daily builds <small>alpha · beta · release candidates</small></h2><a href="https://builder.blender.org/download/daily/" target="_blank" rel="noopener">builder.blender.org ${ico('ext')}</a></header>
  <p class="muted small">Experimental builds for testing, rebuilt every day. Not for production work.</p>
  ${buildsTable()}
</section>
<section class="wrap panel">
  <header class="panel-h"><h2>All series</h2></header>
  <div class="series-grid">${seriesList.filter((s) => firstOf(s.series)).map((s) => {
    const latest = latestOfSeries(s.series);
    const end = supportEnd(s);
    const supported = end ? Date.parse(end) > NOW : true;
    return `<a class="series" href="${root}releases/${s.series}/"><b>${esc(s.series)}</b>${s.lts ? '<span class="pill pill-lts">LTS</span>' : ''}<small>${esc(latest.version)} · ${fmtMonth(firstOf(s.series).date)}</small><span class="sup ${supported ? 'on' : ''}">${supported ? 'Supported' : 'Ended'}</span></a>`;
  }).join('')}</div>
</section>`;
  return layout({ path: 'releases/index.html', title: 'Blender releases, LTS schedule & daily builds', active: 'releases', body,
    description: `All Blender versions with release dates, LTS support windows, the ${up ? `Blender ${up.series} release date (${fmtDate(releaseDay(up))})` : 'next release'} and today's alpha, beta and RC daily builds.` });
}

// ── what's new (per series) ───────────────────────────────
// Feature highlights from the official release notes (developer.blender.org, CC BY-SA 4.0).
const HIGHLIGHTS = snap.highlights || {};
const AREA_ORDER = ['Cycles', 'EEVEE & Viewport', 'Geometry Nodes', 'Sculpt, Paint, Texture', 'Grease Pencil', 'Animation & Rigging', 'Modeling & UV', 'Compositor', 'Rendering', 'Video Sequencer', 'User Interface', 'Assets', 'Pipeline & I/O', 'Core', 'Python API'];
const areaRank = (a) => { const i = AREA_ORDER.findIndex((x) => a.toLowerCase().startsWith(x.toLowerCase().slice(0, 6))); return i < 0 ? 50 : i; };
const areaSlug = (a) => a.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const highlightsOf = (series) => {
  const h = HIGHLIGHTS[series];
  if (!h) return null;
  const sections = h.sections.slice().sort((a, b) => areaRank(a.area) - areaRank(b.area));
  // Headings like "Added" or "Others" only make sense under their parent; borrow the parent's name.
  const GENERIC = /^(added|changed|changes|others?|improvements?|new( features)?|general|fixed|updates?|enhancements?|features)$/i;
  const named = (f, area) => (GENERIC.test(f.title) ? { ...f, title: `${f.group || area}${/^others?$/i.test(f.title) ? ': other changes' : ''}`, group: f.group ? area : null } : f);
  for (const s of sections) s.features = s.features.map((f) => named(f, s.area));
  const all = sections.flatMap((s) => s.features.map((f) => ({ ...f, area: s.area })));
  // Spotlight: features with a demo, user-facing areas first, at most two per area.
  const perArea = {};
  const spotlight = all.filter((f) => (f.video || f.img) && areaRank(f.area) < 13)
    .sort((a, b) => Number(!!b.video) - Number(!!a.video) || areaRank(a.area) - areaRank(b.area))
    .filter((f) => (perArea[f.area] = (perArea[f.area] || 0) + 1) <= 2).slice(0, 9);
  return { sections, all, spotlight };
};
const media = (f, cls = '') => (f.video
  ? `<video class="${cls}" src="${esc(f.video)}" muted loop playsinline preload="none" data-autoplay aria-label="${esc(f.title)} demo"></video>`
  : f.img ? `<img class="${cls}" src="${esc(f.img)}" alt="${esc(f.title)}" loading="lazy" decoding="async">` : '');

function seriesPage(s) {
  const root = '../../';
  const rels = releasedSeries(s.series);
  const first = rels.at(-1);
  const end = supportEnd(s);
  const day = releaseDay(s);
  const upcomingRelease = !first && day && Date.parse(day) > NOW;
  const hl = highlightsOf(s.series);
  const daysLeft = upcomingRelease ? Math.max(0, Math.ceil((Date.parse(day) - NOW) / DAY)) : 0;
  const status = first ? `Released ${fmtDate(first.date)}${rels.length > 1 ? ` · latest ${esc(rels[0].version)}` : ''}${end ? ` · ${Date.parse(end) > NOW ? 'supported until' : 'support ended'} ${fmtMonth(end)}` : ''}`
    : day ? `Coming ${fmtDate(day)} · in development` : 'In development';
  const body = `<section class="whatsnew-h">
  <div class="wrap">
    <p class="crumbs"><a href="${root}releases/">Releases</a> / ${esc(s.series)}</p>
    <p class="eyebrow">${upcomingRelease ? 'Coming soon' : first ? 'Release overview' : 'In development'}</p>
    <h1>What's new in <span>Blender ${esc(s.series)}</span>${s.lts ? ' <span class="pill pill-lts">LTS</span>' : ''}</h1>
    <p class="lede">${s.summary ? `${esc(s.summary)} ` : ''}${status}.</p>
    <div class="wn-stats">
      ${hl ? field('Changes', String(hl.all.length), 'big') + field('Areas', String(hl.sections.length), 'big') + field('Demos', String(hl.all.filter((f) => f.video || f.img).length), 'big') : ''}
      ${upcomingRelease ? `<div class="countdown countdown-lg" data-countdown="${esc(day)}"><b>${daysLeft}</b><span>days to release</span></div>` : ''}
    </div>
    <p class="props-links"><a class="btn btn-primary" href="${esc(s.notes)}" target="_blank" rel="noopener">Full release notes ${ico('ext')}</a>${upcomingRelease ? ` <a class="btn" href="https://builder.blender.org/download/daily/" target="_blank" rel="noopener">${ico('download')} Try the ${esc(builds.find((b) => b.version.startsWith(`${s.series}.`))?.risk || 'daily')} build</a>` : first ? ` <a class="btn" href="https://download.blender.org/release/Blender${esc(s.series)}/" target="_blank" rel="noopener">${ico('download')} Download ${esc(rels[0].version)}</a>` : ''}</p>
  </div>
</section>
${hl ? `${hl.spotlight.length ? `<section class="wrap spot" aria-label="Spotlight">
  ${hl.spotlight.map((f, i) => `<a class="spot-card${i === 0 ? ' spot-lead' : ''}" href="${esc(f.url)}" target="_blank" rel="noopener">
    <span class="spot-media">${media(f)}${f.video ? `<span class="spot-badge">${ico('play')} Demo</span>` : ''}</span>
    <span class="spot-b"><small>${esc(f.area)}${f.group ? ` · ${esc(f.group)}` : ''}</small><b>${esc(f.title)}</b>${f.text ? `<span>${esc(f.text)}</span>` : ''}</span>
  </a>`).join('')}
</section>` : ''}
<nav class="wrap wn-areas" aria-label="Areas">${hl.sections.map((x) => `<a href="#${areaSlug(x.area)}">${esc(x.area)} <small>${x.features.length}</small></a>`).join('')}</nav>
<div class="wrap wn-list">${hl.sections.map((x) => `<section class="wn-area" id="${areaSlug(x.area)}">
  <header class="panel-h"><h2>${esc(x.area)} <small>${plural(x.features.length, 'change')}</small></h2><a href="${esc(x.url)}" target="_blank" rel="noopener">Notes ${ico('ext')}</a></header>
  <div class="wn-cards">${x.features.map((f) => `<a class="wn-card${f.video || f.img ? ' has-media' : ''}" href="${esc(f.url)}" target="_blank" rel="noopener">${f.video || f.img ? `<span class="wn-media">${media(f)}</span>` : ''}<span class="wn-b">${f.group ? `<small>${esc(f.group)}</small>` : ''}<b>${esc(f.title)}</b>${f.text ? `<span>${esc(f.text)}</span>` : f.items ? `<span class="muted">${plural(f.items, 'change')} listed in the notes</span>` : ''}</span></a>`).join('')}</div>
</section>`).join('')}</div>
<p class="wrap attribution">Feature descriptions, images and videos: <a href="${esc(s.notes)}" target="_blank" rel="noopener">Blender ${esc(s.series)} release notes</a> by the Blender developers, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Excerpted.</p>`
  : `<section class="wrap panel"><p class="muted">Release notes for ${esc(s.series)} aren't available yet. <a href="${esc(s.notes)}" target="_blank" rel="noopener">Check the official notes ${ico('ext')}</a></p></section>`}
<section class="wrap props">
  <div class="panel">
    <h2 class="panel-t">At a glance</h2>
    ${field('First release', first ? fmtDate(first.date) : esc(day ? `${fmtDate(day)} (planned)` : '—'))}
    ${field('Latest', rels[0] ? esc(rels[0].version) : '—')}
    ${field('Releases', String(rels.length))}
    ${field('Support', end ? `${Date.parse(end) > NOW ? 'until' : 'ended'} ${fmtMonth(end)}` : 'current')}
  </div>
  <div class="panel">
    ${s.phases.length ? `<h2 class="panel-t">Schedule</h2>${phaseBar(s)}` : ''}
    <h2 class="panel-t">Releases</h2>
    <ul class="rel-list">${rels.map((r) => `<li><a href="${root}${relPathById.get(r.id)}"><code>${esc(r.version)}</code><span>${r.patch === 0 ? 'Major release' : FIXES[r.version] ? nFixes(FIXES[r.version].length) : 'Corrective release'}</span><small>${fmtDate(r.date)}</small></a></li>`).join('') || '<li class="muted">Not released yet.</li>'}</ul>
  </div>
</section>`;
  const top = hl?.spotlight.slice(0, 3).map((f) => f.title).join(', ');
  return layout({ path: `releases/${s.series}/index.html`, title: `What's new in Blender ${s.series}${s.lts ? ' LTS' : ''}${hl ? `: ${hl.all.length} new features & changes` : ''}`, active: 'releases', body,
    ogImage: 'og.png',
    description: `Blender ${s.series}${s.lts ? ' LTS' : ''} new features${top ? ` — ${top}, and more` : ''}. ${upcomingRelease ? `Releasing ${fmtDate(day)}.` : first ? `Released ${fmtDate(first.date)}.` : ''}` });
}

// ── add-ons ───────────────────────────────────────────────
function addonsPage() {
  const root = '../';
  const gh = tools.filter((t) => t.category === 'addon');
  const compat = ext ? Object.entries(ext.compat).sort((a, b) => vcmp(a[0], b[0])) : [];
  const cmax = Math.max(1, ...compat.map(([, n]) => n));
  const tab = (id, label, list, mode) => `<section class="tabpanel" id="tab-${id}" role="tabpanel" ${id === 'new' ? '' : 'hidden'}><div class="exts">${list.map((e) => extCard(e, mode)).join('')}</div></section>`;
  const body = `<section class="wrap page-h">
  <p class="eyebrow">${ico('addons')} Add-ons &amp; extensions</p>
  <h1>Blender add-ons, live</h1>
  <p class="lede">What's new and popular on the official Blender Extensions platform, plus open-source add-ons shipping releases on GitHub — tracked automatically.</p>
</section>
${ext ? `<section class="wrap stats">
  ${field('Extensions', compact(ext.total), 'big')}${field('Add-ons', compact(ext.counts['add-on'] || 0), 'big')}${field('Themes', compact(ext.counts.theme || 0), 'big')}${field('On GitHub', String(gh.length), 'big')}
</section>
<section class="wrap panel">
  <div class="mine mine-bar" data-mine>
    <label class="mine-pick"><span class="mine-k">Check compatibility for</span>
      <select data-mine-select aria-label="Which Blender version do you use?"><option value="">Pick your Blender…</option>${MINE_DATA.map((s) => `<optgroup label="Blender ${esc(s.s)}${s.lts ? ' LTS' : ''}">${s.v.map(([v]) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <div class="mine-out" data-mine-compat><span class="mine-hint">Add-ons that need a newer Blender get flagged.</span></div>
    <label class="mine-toggle"><input type="checkbox" data-mine-hide> Hide incompatible</label>
  </div>
  <div class="tabs" role="tablist" data-tabs>
    <button role="tab" aria-selected="true" aria-controls="tab-new">Newest</button>
    <button role="tab" aria-selected="false" aria-controls="tab-pop">Most downloaded</button>
    <button role="tab" aria-selected="false" aria-controls="tab-rated">Top rated</button>
    <button role="tab" aria-selected="false" aria-controls="tab-themes">New themes</button>
  </div>
  ${tab('new', 'Newest', ext.newest, 'new')}${tab('pop', 'Popular', ext.popular)}${tab('rated', 'Top rated', ext.rated)}${tab('themes', 'Themes', ext.themes, 'new')}
  <p class="muted small">Source: <a href="https://extensions.blender.org" target="_blank" rel="noopener">extensions.blender.org</a> · refreshed ${ago(ext.fetchedAt)}</p>
</section>
<section class="wrap panel">
  <header class="panel-h"><h2>Minimum Blender version <small>across all ${compact(ext.total)} extensions</small></h2></header>
  <ul class="hbars">${compat.map(([v, n]) => `<li style="--w:${((n / cmax) * 100).toFixed(1)}%"><span>${esc(v)}+</span><span class="hbar"><i></i></span><b>${n}</b></li>`).join('')}</ul>
</section>` : ''}
<section class="wrap panel">
  <header class="area-h"><h2>${ico('addons')} Open-source add-ons on GitHub</h2>${''}</header>
  <div class="pnodes">${gh.map((t) => projectNode(t, root)).join('')}</div>
</section>`;
  return layout({ path: 'addons/index.html', title: 'New & popular Blender add-ons and extensions', active: 'addons', body,
    description: `The newest, most downloaded and top-rated Blender add-ons on the Extensions platform${ext ? ` (${compact(ext.total)} extensions)` : ''}, plus open-source add-ons with fresh GitHub releases.` });
}

// ── engines, forks & tools ────────────────────────────────
function enginesPage() {
  const root = '../';
  const group = (cat) => tools.filter((t) => t.category === cat);
  const section = (cat, lede) => group(cat).length ? `<section class="wrap panel">
  <header class="area-h"><h2 style="--c:${CATEGORIES[cat].color}"><i class="dot"></i>${esc(CATEGORIES[cat].label)}</h2><p class="muted small">${lede}</p></header>
  <div class="pnodes">${group(cat).map((t) => projectNode(t, root)).join('')}</div>
</section>` : '';
  const body = `<section class="wrap page-h">
  <p class="eyebrow">${ico('engines')} Engines &amp; tools</p>
  <h1>Render engines, forks &amp; pipeline tools</h1>
  <p class="lede">Third-party render and game engines that plug into Blender, community forks of Blender itself, and the tools that move your work in and out.</p>
</section>
${section('engine', 'Alternatives and companions to Cycles and EEVEE.')}
${section('fork', 'Builds of Blender with a different focus.')}
${section('tool', 'Render farms, launchers and exporters.')}`;
  return layout({ path: 'engines/index.html', title: 'Blender render engines, forks & pipeline tools', active: 'engines', body,
    description: 'Latest releases of render engines for Blender (LuxCore, Radeon ProRender, Mitsuba), game engines, Blender forks like Bforartists and UPBGE, and pipeline tools like Flamenco.' });
}

// ── news ──────────────────────────────────────────────────
function newsPage() {
  const root = '../';
  const tags = [...new Set(articles.map((n) => n.tag).filter(Boolean))];
  const hn = snap.discussions || [];
  const body = `<section class="wrap page-h">
  <p class="eyebrow">${ico('news')} News</p>
  <h1>Blender news, videos &amp; community</h1>
  <p class="lede">Articles from BlenderNation, blender.org and the CG press, new videos from Blender creators, and the threads people are talking about.</p>
</section>
<section class="wrap panel" id="articles">
  <header class="area-h"><h2>Articles</h2>
  <div class="seg" role="group" aria-label="Filter by topic" data-tagfilter><button type="button" aria-pressed="true" data-tag="all">All</button>${tags.map((t) => `<button type="button" aria-pressed="false" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div></header>
  <div class="arts arts-grid">${articles.map((n, i) => articleCard(n, { lead: i === 0 })).join('')}</div>
</section>
<section class="wrap panel" id="videos">
  <header class="area-h"><h2>${ico('play')} Videos</h2></header>
  <div class="vids vids-grid">${videos.map(videoCard).join('')}</div>
</section>
<section class="wrap cols2">
  <div class="panel" id="threads"><header class="panel-h"><h2>${ico('chat')} Community threads</h2></header><ul class="threads">${threads.map(threadRow).join('')}</ul></div>
  <div class="panel"><header class="panel-h"><h2>Hacker News</h2></header><ul class="threads">${hn.map(hnRow).join('') || '<li class="muted">Nothing on Hacker News lately.</li>'}</ul></div>
</section>`;
  return layout({ path: 'news/index.html', title: 'Blender news, videos & community threads', active: 'news', body,
    description: 'The latest Blender news from BlenderNation, blender.org and the CG press, new videos from Blender creators and the top community threads.' });
}

// ── outliner (all projects) ───────────────────────────────
function toolsIndexPage() {
  const root = '../';
  const body = `<section class="wrap page-h">
  <p class="eyebrow">${ico('outliner')} Outliner</p>
  <h1>Everything we track</h1>
  <p class="lede">${plural(tools.length, 'project')} in ${Object.keys(CATEGORIES).length} collections. Toggle a collection's eye to hide it.</p>
</section>
<section class="wrap panel outliner" data-outliner>
  <label class="ol-search">${ico('search')}<input type="search" placeholder="Filter…" data-ol-filter aria-label="Filter projects"></label>
  <ul class="ol-tree">
    <li class="ol-scene"><span class="ol-row"><span class="ol-ico scene"></span><b>Scene Collection</b></span>
    <ul>${Object.entries(CATEGORIES).map(([k, c]) => {
      const list = tools.filter((t) => t.category === k);
      if (!list.length) return '';
      return `<li class="ol-coll" data-coll="${k}" style="--c:${c.color}"><span class="ol-row"><button class="ol-twist" type="button" aria-expanded="true" aria-label="Collapse ${esc(c.label)}">${ico('tri')}</button><span class="ol-ico coll"></span><b>${esc(c.label)}</b><small>${list.length}</small><button class="ol-eye" type="button" aria-pressed="true" aria-label="Hide ${esc(c.label)}">${ico('eye')}</button></span>
      <ul>${list.map((t) => `<li class="ol-obj" data-name="${esc(`${t.name} ${t.vendor} ${t.blurb || ''}`.toLowerCase())}"><a class="ol-row" href="${root}tools/${t.id}/">${toolIcon(t, 'xs')}<b>${esc(t.name)}</b>${t.discovered ? '<span class="trend">↗</span>' : ''}<span class="ol-ver">${esc(t.latestRelease?.version || '')}</span>${t.latest ? time(t.latest.date, 'ol-t') : ''}</a></li>`).join('')}</ul></li>`;
    }).join('')}</ul></li>
  </ul>
</section>`;
  return layout({ path: 'tools/index.html', title: 'All tracked Blender projects', active: 'outliner', body,
    description: `All ${tools.length} projects tracked: Blender, add-ons, render engines, forks and pipeline tools, with their latest versions.` });
}

// ── tool pages ────────────────────────────────────────────
function toolPage(t) {
  const root = '../../';
  const list = archive[t.id] || [];
  const posts = t.items.filter((i) => i.kind !== 'release').slice(0, 12);
  const dates = [...new Set([...(t.meta.cadence || []), ...list.map((r) => r.date)])];
  const repo = t.meta.repoUrl || (t.github ? `https://github.com/${t.github}` : null);
  const body = `<section class="wrap page-h tool-h" style="--c:${t.color}">
  <p class="crumbs"><a href="${root}tools/">Outliner</a> / <span style="color:${catColor(t)}">${esc(CATEGORIES[t.category]?.label || '')}</span></p>
  <div class="tool-title">${toolIcon(t, 'lg')}<div><h1>${esc(t.name)}</h1><p class="muted">${esc(t.vendor)}${t.discovered ? ' · <span class="trend">↗ Trending on GitHub</span>' : ''}</p></div></div>
  ${t.blurb ? `<p class="lede">${esc(t.blurb)}</p>` : ''}
</section>
<section class="wrap props" data-props>
  <nav class="props-tabs" aria-label="Sections">
    <a href="#overview" title="Overview">${ico('layout')}</a><a href="#releases" title="Releases">${ico('releases')}</a><a href="#activity" title="Activity">${ico('engines')}</a>${posts.length ? `<a href="#posts" title="Posts">${ico('news')}</a>` : ''}${t.discussions.length ? `<a href="#discussion" title="Discussion">${ico('chat')}</a>` : ''}
  </nav>
  <div class="props-body">
    <details class="ppanel" id="overview" open><summary>Overview</summary>
      ${t.latestRelease ? field('Latest version', esc(t.latestRelease.version)) : ''}
      ${t.latestRelease ? field('Released', `${fmtDate(t.latestRelease.date)} <small>(${ago(t.latestRelease.date)})</small>`) : ''}
      ${field('Releases tracked', String(list.length))}
      ${t.meta.stars != null ? field('GitHub stars', compact(t.meta.stars)) : ''}
      ${t.meta.license ? field('License', esc(t.meta.license)) : ''}
      <p class="props-links"><a class="btn" href="${esc(t.site)}" target="_blank" rel="noopener">Website ${ico('ext')}</a>${repo ? ` <a class="btn btn-ghost" href="${esc(repo)}" target="_blank" rel="noopener">Source ${ico('ext')}</a>` : ''}</p>
    </details>
    <details class="ppanel" id="releases" open><summary>Releases <small>${list.length}</small></summary>
      ${list.length ? `<ul class="rel-list">${list.slice(0, 15).map((r) => `<li><a href="${root}${relPath(t.id, r)}"><code>${esc(r.version)}</code><span>${esc(r.summary.slice(0, 120))}</span><small>${fmtDate(r.date)}</small></a></li>`).join('')}</ul>${list.length > 15 ? `<p><a href="${root}tools/${t.id}/releases/">All ${list.length} releases →</a></p>` : ''}` : '<p class="muted">No releases yet.</p>'}
    </details>
    <details class="ppanel" id="activity" open><summary>Activity</summary>${activity(dates)}</details>
    ${posts.length ? `<details class="ppanel" id="posts" open><summary>Posts <small>${posts.length}</small></summary><div class="nodes nodes-1">${posts.map((i) => nodeCard(i, root)).join('')}</div></details>` : ''}
    ${t.discussions.length ? `<details class="ppanel" id="discussion" open><summary>Discussion</summary><ul class="threads">${t.discussions.map(hnRow).join('')}</ul></details>` : ''}
  </div>
</section>`;
  return layout({ path: `tools/${t.id}/index.html`, title: `${t.name}${t.latestRelease ? ` ${t.latestRelease.version}` : ''} — releases & changelog`, active: 'outliner', body,
    description: `${t.name} latest release${t.latestRelease ? `: ${t.latestRelease.version} (${fmtDate(t.latestRelease.date)})` : 's'}. ${t.blurb || ''}`,
    jsonld: { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: t.name, applicationCategory: 'MultimediaApplication', url: t.site, ...(t.latestRelease ? { softwareVersion: t.latestRelease.version } : {}), author: { '@type': 'Organization', name: t.vendor } } });
}

function releasesIndexPage(t) {
  const root = '../../../';
  const list = archive[t.id];
  const body = `<section class="wrap page-h"><p class="crumbs"><a href="${root}tools/">Outliner</a> / <a href="${root}tools/${t.id}/">${esc(t.name)}</a> / Releases</p>
  <h1>${esc(t.name)} releases</h1><p class="lede">${plural(list.length, 'release')} since ${fmtMonth(list.at(-1).date)}.</p></section>
<section class="wrap panel"><ul class="rel-list">${list.map((r) => `<li><a href="${root}${relPath(t.id, r)}"><code>${esc(r.version)}</code><span>${esc(r.summary.slice(0, 140))}</span><small>${fmtDate(r.date)}</small></a></li>`).join('')}</ul></section>`;
  return layout({ path: `tools/${t.id}/releases/index.html`, title: `All ${t.name} releases`, active: 'outliner', body,
    description: `Every ${t.name} release with dates and release notes — ${plural(list.length, 'release')}, latest ${list[0].version}.` });
}

function fixList(v) {
  const list = FIXES[v];
  if (!list?.length) return '';
  const s = fixStats(v);
  const order = { security: 0, dataloss: 1, crash: 2, fix: 3 };
  const sorted = list.map((f) => ({ ...f, k: fixKind(f.t) })).sort((a, b) => order[a.k] - order[b.k]);
  return `<div class="fixes">
  <div class="fix-stats">${field('Bug fixes', String(s.n), 'big')}${s.security ? field('Security', String(s.security), 'big k-security') : ''}${s.dataloss ? field('Data loss', String(s.dataloss), 'big k-dataloss') : ''}${s.crash ? field('Crashes', String(s.crash), 'big k-crash') : ''}</div>
  <ul class="fix-list">${sorted.map((f) => `<li class="k-${f.k}"><span class="fix-k">${FIX_LABEL[f.k]}</span><span class="fix-t">${esc(f.t)}</span>${f.url ? `<a class="fix-ref" href="${esc(f.url)}" target="_blank" rel="noopener nofollow">${esc(f.ref || 'link')}</a>` : ''}</li>`).join('')}</ul>
</div>`;
}

function releasePage(t, r, i, list) {
  const root = '../../../';
  // Blender's prev/next stays within the release's own series (4.5.14 → 4.5.15, not 5.2.3).
  const sameLine = t.id === 'blender' ? list.filter((x) => seriesOfVersion(x.version) === seriesOfVersion(r.version)) : list;
  const at = sameLine.indexOf(r);
  const newer = sameLine[at - 1], older = sameLine[at + 1];
  const fixesHtml = t.id === 'blender' ? fixList(r.version) : '';
  const notes = fixesHtml || (r.html ? lazyImgs(absLinks(r.html, r.url)) : '');
  const body = `<section class="wrap page-h"><p class="crumbs"><a href="${root}tools/">Outliner</a> / <a href="${root}tools/${t.id}/">${esc(t.name)}</a> / ${esc(r.version)}</p>
  <div class="tool-title">${toolIcon(t, 'lg')}<div><h1>${esc(r.title)}</h1><p class="muted">Released ${fmtDate(r.date)} · ${ago(r.date)}</p></div></div></section>
<section class="wrap props">
  <div class="panel">
    ${notes ? `<div class="notes">${notes}</div>` : `<p class="lede">${esc(r.summary)}</p>`}
    <p class="props-links"><a class="btn btn-primary" href="${esc(r.url)}" target="_blank" rel="noopener">${t.id === 'blender' ? 'Official release notes' : 'View release'} ${ico('ext')}</a></p>
  </div>
  <nav class="relnav" aria-label="Other releases">
    ${newer ? `<a href="${root}${relPath(t.id, newer)}"><small>Newer</small><b>${esc(newer.version)}</b></a>` : '<span></span>'}
    ${older ? `<a class="older" href="${root}${relPath(t.id, older)}"><small>Older</small><b>${esc(older.version)}</b></a>` : '<span></span>'}
  </nav>
</section>`;
  return layout({ path: `${relPath(t.id, r)}index.html`, title: fixesHtml ? `${r.title}: ${nFixes(fixStats(r.version).n)}` : r.title, active: 'outliner', body, noindex: thinRelease(r) && t.id !== 'blender',
    description: `${r.title}, released ${fmtDate(r.date)}. ${r.summary}` });
}

function simplePage(path, title, description, html) {
  return layout({ path, title, description, body: `<section class="wrap page-h"><h1>${esc(title)}</h1></section><section class="wrap panel prose">${html}</section>` });
}

// ── outputs ───────────────────────────────────────────────
function rss(items, { path = 'feed.xml', title = 'Blender releases & updates', description = 'New Blender releases, add-on and render engine updates.' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${esc(`${SITE_NAME} — ${title}`)}</title><link>${SITE_URL}/</link>
<atom:link href="${SITE_URL}/${path}" rel="self" type="application/rss+xml"/>
<description>${esc(description)}</description>
<lastBuildDate>${new Date(NOW).toUTCString()}</lastBuildDate>
${items.map((i) => `<item><title>${esc(i.title)}</title><link>${esc(relPathById.get(i.id) ? `${SITE_URL}/${relPathById.get(i.id)}` : i.url)}</link><guid isPermaLink="false">${esc(i.id)}</guid><pubDate>${new Date(i.date).toUTCString()}</pubDate><category>${esc(i.toolId ? byId[i.toolId]?.name || '' : i.source || '')}</category><description>${esc(i.summary || '')}</description></item>`).join('\n')}
</channel></rss>`;
}

// ── follow: calendar + focused feeds ──────────────────────
// calendar.ics: every scheduled phase of upcoming Blender releases, recent major releases and LTS
// end-of-support dates. Calendar apps re-fetch the subscription, so new dates appear on their own.
function calendar() {
  const ics = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const fold = (line) => { const out = []; let l = line; while (Buffer.byteLength(l) > 74) { let n = 74; while (Buffer.byteLength(l.slice(0, n)) > 74) n--; out.push(l.slice(0, n)); l = ` ${l.slice(n)}`; } out.push(l); return out.join('\r\n'); };
  const day = (iso) => iso.slice(0, 10).replace(/-/g, '');
  const next = (iso) => new Date(Date.parse(iso) + DAY).toISOString();
  const stamp = new Date(NOW).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const events = [];
  const ev = (uid, date, summary, description, url) => events.push(['BEGIN:VEVENT', `UID:${uid}@${new URL(SITE_URL).hostname}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(date)}`, `DTEND;VALUE=DATE:${day(next(date))}`,
    `SUMMARY:${ics(summary)}`, `DESCRIPTION:${ics(description)}`, `URL:${url}`, 'TRANSP:TRANSPARENT', 'END:VEVENT']);
  const PHASE = { Alpha: 'alpha starts', Beta: 'beta starts', 'Release Candidate': 'release candidate', Release: 'release' };
  for (const s of seriesList) {
    const page = firstOf(s.series) || releaseDay(s) ? `${SITE_URL}/releases/${s.series}/` : `${SITE_URL}/releases/`;
    for (const p of s.phases) {
      if (Date.parse(p.date) < NOW - 120 * DAY) continue;
      ev(`blender-${s.series}-${p.phase.toLowerCase().replace(/\s+/g, '-')}`, p.date, `Blender ${s.series}${s.lts ? ' LTS' : ''} ${PHASE[p.phase] || p.phase}`,
        `${p.phase} of Blender ${s.series}${p.phase === 'Release' ? ' is scheduled for today' : ''}. What's new: ${page}`, page);
    }
    if (s.lts && s.supportUntil && Date.parse(s.supportUntil) > NOW - 30 * DAY && firstOf(s.series)) {
      ev(`blender-${s.series}-lts-end`, s.supportUntil, `Blender ${s.series} LTS support ends`, `Blender ${s.series} LTS stops receiving fixes. Time to move to a newer LTS. ${page}`, page);
    }
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${SITE_NAME}//Blender releases//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:Blender releases (${SITE_NAME})`, 'X-WR-CALDESC:Upcoming Blender alpha\\, beta\\, RC and release dates\\, and LTS end-of-support.', 'X-PUBLISHED-TTL:PT12H', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    ...events.flat(), 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}

// The Follow panel: calendar subscription + focused feeds, in the topbar popover and on /follow/.
const upcomingDates = () => seriesList.flatMap((s) => s.phases.filter((p) => Date.parse(p.date) > NOW - DAY).map((p) => ({ s, p })))
  .sort((a, b) => a.p.date.localeCompare(b.p.date));
function followPanel(root) {
  const dates = upcomingDates();
  const feeds = Object.entries(FEEDS());
  const feedRow = ([path, [title, description]]) => {
    const series = path.match(/blender-(\d+\.\d+)\.xml$/)?.[1];
    return `<li class="feed-row"${series ? ` data-feed-series="${series}"` : ''}><span class="feed-ico">${ico('rss')}</span><span class="feed-b"><b>${esc(title)}</b><small>${esc(description)}</small></span>
    <span class="feed-act"><button type="button" class="btn btn-sm btn-ghost" data-copy="${SITE_URL}/${path}">Copy link</button><a class="btn btn-sm" href="${root}${path}">Open</a></span></li>`;
  };
  const main = feeds.filter(([p]) => !/blender-\d/.test(p));
  const perSeries = feeds.filter(([p]) => /blender-\d/.test(p));
  return `<div class="follow">
  <section class="follow-cal">
    <div class="follow-cal-h"><span class="cal-ico" aria-hidden="true"><b>${new Date(dates[0]?.p.date || NOW).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</b><i>${new Date(dates[0]?.p.date || NOW).getUTCDate()}</i></span>
      <div><h3>Blender release calendar</h3><p>Alpha, beta, release-candidate and release days plus LTS end dates, in your own calendar. It updates by itself when Blender changes the schedule.</p></div></div>
    ${dates.length ? `<ul class="cal-next">${dates.slice(0, 4).map(({ s, p }) => `<li><time>${fmtShort(p.date)}</time><span>Blender ${esc(s.series)} ${esc(p.phase === 'Release' ? 'release' : p.phase.toLowerCase())}</span></li>`).join('')}</ul>` : ''}
    <div class="follow-btns">
      <a class="btn btn-primary" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${SITE_URL.replace(/^https?:\/\//, '')}/calendar.ics`)}" target="_blank" rel="noopener">Google Calendar</a>
      <a class="btn" href="webcal://${SITE_URL.replace(/^https?:\/\//, '')}/calendar.ics">Apple / Outlook</a>
      <a class="btn btn-ghost" href="${root}calendar.ics" download>Download .ics</a>
    </div>
  </section>
  <section class="follow-feeds">
    <h3>Feeds <small>for any RSS reader: Feedly, Inoreader, NetNewsWire, Thunderbird…</small></h3>
    <ul class="feed-list" data-feed-list>${perSeries.map(feedRow).join('')}${main.map(feedRow).join('')}</ul>
  </section>
</div>`;
}

const followCache = new Map();
const followPanelCached = (root) => { if (!followCache.has(root)) followCache.set(root, followPanel(root)); return followCache.get(root); };

function followPage() {
  const root = '../';
  return layout({ path: 'follow/index.html', title: 'Follow Blender releases: calendar & feeds', active: '',
    description: 'Subscribe to Blender release dates in Google, Apple or Outlook calendar, and follow Blender, your LTS version, add-ons or news by RSS. No sign-up.',
    body: `<section class="wrap page-h"><p class="eyebrow">${ico('rss')} Follow</p><h1>Never miss a Blender release</h1><p class="lede">No account, no email. Add the release calendar or pick the feeds you care about. Both update automatically.</p></section>
<section class="wrap panel follow-page">${followPanel(root)}</section>` });
}

// Focused feeds, listed on the Follow panel. path → [title, description, items]
const FEEDS = () => {
  const releases = tools.flatMap((t) => t.items).filter((i) => i.kind === 'release').sort((a, b) => b.date.localeCompare(a.date));
  const blenderRel = releases.filter((i) => i.toolId === 'blender');
  const out = {
    'feed.xml': ['Everything', 'Every release we track: Blender, add-ons, engines, forks and tools.', releases.slice(0, 100)],
    'feeds/blender.xml': ['Blender releases', 'New Blender versions, major and corrective, with their fix counts.', blenderRel.slice(0, 60)],
    'feeds/addons.xml': ['Add-on releases', 'New releases of open-source Blender add-ons, curated and trending.', releases.filter((i) => byId[i.toolId].category === 'addon').slice(0, 80)],
    'feeds/engines.xml': ['Engines, forks & tools', 'Render and game engines, Blender forks and pipeline tools.', releases.filter((i) => ['engine', 'fork', 'tool'].includes(byId[i.toolId].category)).slice(0, 60)],
    'feeds/news.xml': ['News & videos', 'Blender articles and new videos from creators.', news.filter((n) => n.type !== 'thread').slice(0, 80).map((n) => ({ ...n, id: n.id || n.url }))],
  };
  for (const s of seriesList.filter((x) => firstOf(x.series) && (!supportEnd(x) || Date.parse(supportEnd(x)) > NOW))) {
    out[`feeds/blender-${s.series}.xml`] = [`Blender ${s.series}${s.lts ? ' LTS' : ''} updates`, `Only Blender ${s.series} releases: every corrective release with its fixes.`, blenderRel.filter((i) => i.series === s.series)];
  }
  return out;
};

const FONT_DIR = new URL('scripts/fonts/', ROOT);
const fontFiles = readdirSync(FONT_DIR).filter((f) => f.endsWith('.ttf')).map((f) => fileURLToPath(new URL(f, FONT_DIR)));
const png = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Geist' } }).render().asPng();
function ogCard() {
  const grid = Array.from({ length: 25 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="630" stroke="#2a2a2a"/>`).join('') + Array.from({ length: 13 }, (_, i) => `<line x1="0" y1="${i * 50}" x2="1200" y2="${i * 50}" stroke="#2a2a2a"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#1d1d1d"/>${grid}<line x1="0" y1="430" x2="1200" y2="430" stroke="#ff3352" stroke-opacity=".6" stroke-width="2"/><line x1="820" y1="0" x2="820" y2="630" stroke="#8bdc00" stroke-opacity=".5" stroke-width="2"/>
<g transform="translate(90 120)"><path d="M14 66C44 66 46 14 76 14" fill="none" stroke="#e87d0d" stroke-width="8" stroke-linecap="round"/><circle cx="14" cy="66" r="13" fill="#e87d0d" stroke="#1d1d1d" stroke-width="4"/><circle cx="76" cy="14" r="13" fill="#e6e6e6" stroke="#1d1d1d" stroke-width="4"/><text x="104" y="54" font-family="Geist" font-weight="600" font-size="44" fill="#e6e6e6">${SITE_NAME}</text></g>
<text x="90" y="320" font-family="Geist" font-weight="600" font-size="74" fill="#ffffff">Blender, live.</text>
<text x="90" y="384" font-family="Geist" font-size="32" fill="#a8a8a8">Releases · add-ons · render engines · news</text>
${latestStable ? `<g transform="translate(90 470)"><rect width="420" height="64" rx="10" fill="#2b2b2b" stroke="#3d3d3d"/><text x="22" y="42" font-family="Geist" font-size="26" fill="#a8a8a8">Latest</text><text x="398" y="42" text-anchor="end" font-family="Geist Mono" font-size="28" fill="#e87d0d">Blender ${esc(latestStable.version)}</text></g>` : ''}
<g transform="translate(900 180)" fill="none" stroke-width="3"><path d="M100 0 200 55 100 110 0 55Z" fill="#3a3a3a" stroke="#e87d0d"/><path d="M0 55v120l100 55V110Z" fill="#2c2c2c" stroke="#e87d0d"/><path d="M200 55v120l-100 55V110Z" fill="#333" stroke="#e87d0d"/></g>
</svg>`;
}

const out = async (path, content) => {
  const url = new URL(path, DIST);
  await mkdir(new URL('./', url), { recursive: true });
  await writeFile(url, content);
};

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(new URL('src/', ROOT), new URL('assets/', DIST), { recursive: true });
await cp(new URL('static/', ROOT), DIST, { recursive: true });
// Self-hosted fonts from npm (Inter: Blender's own UI typeface since 4.0).
const FONTS = [
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter-latin.woff2'],
  ['@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2', 'inter-latin-ext.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', 'mono-400.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2', 'mono-600.woff2'],
];
await mkdir(new URL('fonts/', DIST), { recursive: true });
for (const [from, to] of FONTS) await cp(new URL(`node_modules/${from}`, ROOT), new URL(`fonts/${to}`, DIST));

// Icons: favicon rasters and PWA icons from the SVG.
const favSvg = await readFile(new URL('static/favicon.svg', ROOT));
const fav32 = png(favSvg, 32);
const icoHead = Buffer.alloc(22);
icoHead.writeUInt16LE(1, 2); icoHead.writeUInt16LE(1, 4); icoHead.writeUInt8(32, 6); icoHead.writeUInt8(32, 7);
icoHead.writeUInt16LE(1, 10); icoHead.writeUInt16LE(32, 12); icoHead.writeUInt32LE(fav32.length, 14); icoHead.writeUInt32LE(22, 18);
await out('favicon.ico', Buffer.concat([icoHead, fav32]));
await out('apple-touch-icon.png', png(favSvg, 180));
await out('icons/pwa-192.png', png(favSvg, 192));
await out('icons/pwa-512.png', png(favSvg, 512));
await out('og.png', png(ogCard(), 1200));
await out('manifest.webmanifest', JSON.stringify({
  name: `${SITE_NAME} — Blender, live`, short_name: SITE_NAME, start_url: BASE, scope: BASE, display: 'standalone', background_color: '#1d1d1d', theme_color: '#1d1d1d',
  icons: [{ src: `${BASE}icons/pwa-192.png`, sizes: '192x192', type: 'image/png' }, { src: `${BASE}icons/pwa-512.png`, sizes: '512x512', type: 'image/png' }, { src: `${BASE}favicon.svg`, sizes: 'any', type: 'image/svg+xml' }],
}));
await out('sw.js', (await readFile(new URL('scripts/sw.js', ROOT), 'utf8')).replace('__VERSION__', `${NOW}-${ASSET_V}`).replace(/'\/(?=[a-z.']|')/g, `'${BASE}`));
await out('offline.html', layout({ path: 'offline.html', title: 'Offline', description: 'You are offline.', noindex: true, absolute: true,
  body: '<section class="wrap page-h" style="text-align:center;padding:12vh 0"><h1>You\'re offline</h1><p class="lede">This page isn\'t saved on this device yet. Pages you\'ve opened before still work.</p><p><a class="btn" href="./">← Back to the latest updates</a></p></section>' }));
await out('404.html', layout({ path: '404.html', title: 'Not found', description: 'Page not found.', noindex: true, absolute: true,
  body: '<section class="wrap page-h" style="text-align:center;padding:12vh 0"><p class="eyebrow">Error 404</p><h1>Nothing selected</h1><p class="lede">This object isn\'t in the scene. It may have been renamed or deleted.</p><p><a class="btn btn-primary" href="' + BASE + '">Return to Layout</a></p></section>' }));

await out('index.html', indexPage());
await out('releases/index.html', releasesPage());
for (const s of seriesList.filter((s) => firstOf(s.series) || releaseDay(s))) await out(`releases/${s.series}/index.html`, seriesPage(s));
await out('addons/index.html', addonsPage());
await out('engines/index.html', enginesPage());
await out('news/index.html', newsPage());
await out('tools/index.html', toolsIndexPage());
for (const t of tools) {
  await out(`tools/${t.id}/index.html`, toolPage(t));
  const list = archive[t.id];
  if (!list.length) continue;
  await out(`tools/${t.id}/releases/index.html`, releasesIndexPage(t));
  for (const [i, r] of list.entries()) await out(`${relPath(t.id, r)}index.html`, releasePage(t, r, i, list));
}
await writeFile(ARCHIVE, `{\n${Object.entries(archive).filter(([, l]) => l.length).map(([id, l]) => `${JSON.stringify(id)}: [\n${l.map((r) => JSON.stringify(r)).join(',\n')}\n]`).join(',\n')}\n}\n`);
await out('about/index.html', simplePage('about/index.html', `About ${SITE_NAME}`, `${SITE_NAME} is a live tracker of Blender releases, add-ons, render engines and news.`, `
<p>${SITE_NAME} watches Blender and its ecosystem so you don't have to. Everything here comes from official, public sources:</p>
<ul>
<li><b>Blender releases and schedule</b> — tags and milestones on <a href="https://projects.blender.org/blender/blender">projects.blender.org</a>.</li>
<li><b>Daily builds</b> — <a href="https://builder.blender.org/download/daily/">builder.blender.org</a>.</li>
<li><b>Extensions</b> — the <a href="https://extensions.blender.org">Blender Extensions platform</a> and its public API.</li>
<li><b>Add-ons, engines and forks</b> — GitHub Releases, with trending add-ons discovered by star velocity.</li>
<li><b>News and community</b> — RSS feeds from blender.org, BlenderNation, CG Channel, 80 Level, BlenderArtists, the developer forum, r/blender, YouTube creators and Hacker News.</li>
</ul>
<p>The site rebuilds automatically every few minutes when something new ships. If a source is down, its last known data is kept — nothing is ever made up.</p>
<p>Data is free to reuse: <a href="../data.json">data.json</a> · <a href="../feed.xml">RSS</a>.</p>
<p class="muted">${SITE_NAME} is a community project and is not affiliated with or endorsed by the Blender Foundation. Blender is a trademark of the Blender Foundation.</p>`));
await out('privacy/index.html', simplePage('privacy/index.html', 'Privacy', `${SITE_NAME} privacy policy.`, `
<p>${SITE_NAME} is a static website. It sets no cookies, runs no analytics and asks for no account.</p>
<p>Your theme and sidebar preferences are stored in your own browser (localStorage) and never leave your device. Thumbnails of videos and extensions load from YouTube and extensions.blender.org, which receive your IP address like any image request.</p>`));

const allItems = tools.flatMap((t) => t.items).sort((a, b) => b.date.localeCompare(a.date));
for (const [path, [title, description, items]] of Object.entries(FEEDS())) await out(path, rss(items, { path, title, description }));
await out('calendar.ics', calendar());
await out('follow/index.html', followPage());
await out('data.json', JSON.stringify({
  generatedAt: snap.generatedAt, source: SITE_URL,
  blender: { latest: latestStable ? { version: latestStable.version, date: latestStable.date } : null, upcoming: upcoming ? { series: upcoming.series, date: releaseDay(upcoming) } : null, lts: ltsActive.map((s) => ({ series: s.series, latest: latestOfSeries(s.series)?.version, supportUntil: s.supportUntil })), builds: builds.map(({ files, ...b }) => b) },
  tools: tools.map((t) => ({ id: t.id, name: t.name, vendor: t.vendor, category: t.category, trending: !!t.discovered, site: t.site, latestVersion: t.latestRelease?.version || null, lastUpdate: t.latest?.date || null, stars: t.meta.stars ?? null, url: `${SITE_URL}/tools/${t.id}/` })),
  updates: allItems.slice(0, 300).map(({ html, ...i }) => i),
  news: news.map(({ id, ...n }) => n),
}));
await out('version.json', JSON.stringify({
  generatedAt: snap.generatedAt,
  cards: allItems.filter((i) => NOW - Date.parse(i.date) < 2 * DAY).slice(0, 20).map((i) => ({ id: i.id, date: i.date, title: i.title, html: nodeCard(i, '') })),
}));
// Search index for the F3 palette. Short keys: t type · n name · s subtitle · u url (site-relative, or absolute when x) · d date · c colour.
// Fix lists for the "what you're missing" panel, loaded on demand: { version: [[kind, title, url, ref]] }.
await out('fixes.json', JSON.stringify(Object.fromEntries(Object.entries(FIXES).map(([v, l]) => [v, l.map((f) => [fixKind(f.t), f.t, f.url, f.ref])]))));
await out('search.json', JSON.stringify({ items: [
  ...NAV.map(([u, n]) => ({ t: 'page', n, s: 'Workspace', u })),
  ...seriesList.filter((s) => firstOf(s.series) || releaseDay(s)).map((s) => ({ t: 'series', n: `Blender ${s.series}${s.lts ? ' LTS' : ''}`, s: firstOf(s.series) ? `latest ${latestOfSeries(s.series).version}` : `planned ${fmtDate(releaseDay(s))}`, u: `releases/${s.series}/`, c: '#e87d0d' })),
  ...tools.map((t) => ({ t: CATEGORIES[t.category]?.short || 'Project', n: t.name, s: `${t.vendor}${t.latestRelease ? ` · ${t.latestRelease.version}` : ''}`, u: `tools/${t.id}/`, d: t.latest?.date, c: catColor(t) })),
  ...(ext ? [...ext.newest, ...ext.popular, ...ext.rated, ...ext.themes].filter((e, i, a) => a.findIndex((x) => x.slug === e.slug) === i).map((e) => ({ t: 'Extension', n: e.name, s: e.tagline, u: e.url, x: 1, c: '#8bdc00' })) : []),
  ...allItems.filter((i) => i.kind === 'release').slice(0, 400).map((i) => ({ t: 'Release', n: i.title, s: byId[i.toolId].name, u: relPathById.get(i.id) || i.url, x: relPathById.get(i.id) ? undefined : 1, d: i.date, c: catColor(byId[i.toolId]) })),
  ...news.map((n) => ({ t: n.type === 'video' ? 'Video' : n.type === 'thread' ? 'Thread' : 'News', n: n.title, s: n.source, u: n.url, x: 1, d: n.date })),
] }));
const urls = [
  ['', snap.generatedAt, 1.0], ['releases/', snap.generatedAt, 0.9], ['addons/', snap.generatedAt, 0.9], ['engines/', snap.generatedAt, 0.8], ['news/', snap.generatedAt, 0.8], ['tools/', snap.generatedAt, 0.7], ['about/', null, 0.3],
  ...seriesList.filter((s) => firstOf(s.series) || releaseDay(s)).map((s) => [`releases/${s.series}/`, latestOfSeries(s.series)?.date || snap.generatedAt, 0.7]),
  ...tools.map((t) => [`tools/${t.id}/`, t.lastActive, 0.6]),
  ...tools.filter((t) => archive[t.id].length).flatMap((t) => [[`tools/${t.id}/releases/`, archive[t.id][0].date, 0.5], ...archive[t.id].filter((r) => !thinRelease(r) || t.id === 'blender').map((r) => [relPath(t.id, r), r.date, 0.4])]),
];
await out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d, p]) => `<url><loc>${SITE_URL}/${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}<priority>${p.toFixed(1)}</priority></url>`).join('\n')}\n</urlset>\n`);
await out('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
if (process.env.CNAME) await out('CNAME', process.env.CNAME);
await out('.nojekyll', '');
console.log(`Built ${urls.length} indexable pages (${tools.length} projects, ${Object.values(archive).reduce((n, l) => n + l.length, 0)} release pages) → dist/`);
