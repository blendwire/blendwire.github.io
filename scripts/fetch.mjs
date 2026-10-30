// Fetches real release + news data for Blender and its ecosystem and writes data/snapshot.json.
// Each source fails independently; a failed source falls back to the previous snapshot.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { TOOLS, HN_MATCH, HN_QUERIES, DISCOVERY, NEWS_FEEDS, SITE } from './sources.mjs';
import { searchCandidates, toTool } from './discover.mjs';

const SNAPSHOT = new URL('../data/snapshot.json', import.meta.url);
const UA = `Mozilla/5.0 (compatible; Blendwire/1.0; +${SITE.url})`;
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const DAY = 86400e3;
const NOW = Date.now();
const MAX_PER_TOOL = 40;
const RELEASES_PAGE = 100;
const MAX_RELEASE_DATES = 1000;
// QUICK=1: the frequent "is there anything new?" run — skips discovery and repo metadata,
// and uses conditional requests so unchanged GitHub repos cost nothing against the rate limit.
const QUICK = process.env.QUICK === '1';
const UNSTABLE = /nightly|alpha|beta|preview|canary|[-.]rc\.?\d*|-pre\b|\bdev\b|daily|experimental/i;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', cdataPropName: false, processEntities: true, htmlEntities: true });

const sanitize = (html) => sanitizeHtml(html, {
  allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'p', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'strong', 'em', 'b', 'i', 'blockquote', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'kbd', 'del'],
  allowedAttributes: { a: ['href'], img: ['src', 'alt'] },
  allowedSchemes: ['https', 'http'],
  transformTags: {
    a: (tag, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener nofollow', target: '_blank' } }),
    img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy', decoding: 'async' } }),
    h1: 'h4', h2: 'h4', h3: 'h5',
  },
});

const toText = (html) => sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} })
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&#8217;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#8230;|&hellip;/g, '…')
  .replace(/\s+/g, ' ').trim();

const excerpt = (text, n = 260) => (text.length > n ? text.slice(0, text.lastIndexOf(' ', n) > 0 ? text.lastIndexOf(' ', n) : n) + '…' : text);

const clipHtml = (html, n = 9000) => {
  if (html.length <= n) return html;
  return sanitize(html.slice(0, html.lastIndexOf('</', n) > 0 ? html.lastIndexOf('</', n) : n)) + '<p class="clipped">…</p>';
};

const str = (v) => (v == null ? '' : typeof v === 'object' ? (v['#text'] ?? '') : String(v));
const httpsUrl = (u, base) => { if (!u) return null; try { const v = new URL(String(u).replace(/&amp;/g, '&'), base); return v.protocol === 'https:' ? v.href : null; } catch { return null; } };

async function get(url, { json = false, headers = {} } = {}, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : '*/*', ...headers }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await (json ? res.json() : res.text());
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return get(url, { json, headers }, attempt + 1);
  }
}

// "Release v1.2.3" / "Tool v1.2.3" → "Tool 1.2.3"; keeps any real release title as a subtitle.
function releaseTitle(tool, version, name) {
  const extra = (name || '')
    .split(tool.name).join('')
    .replace(version, '').replace(version.replace(/^v/, ''), '')
    .replace(/\b(release|version|v)\b/ig, '').replace(/^[\s:|–—-]+|[\s:|–—-]+$/g, '').trim();
  return extra.length > 3 ? `${tool.name} ${version} — ${extra}` : `${tool.name} ${version}`;
}

const ghHeaders = () => ({ Accept: 'application/vnd.github+json', ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}) });

// ── GitHub releases ────────────────────────────────────────
// Discovered repos sometimes publish side-component builds ("partuv-v0.1.6", "desktop"); those are skipped.
const sideTag = (tag) => !/\d/.test(tag) || /^[a-z][\w.]*[-_]v?\d/i.test(tag);
// `old` is the tool's previous snapshot entry: its ETag lets GitHub answer 304 (free) when nothing shipped.
async function fetchGithub(tool, old) {
  const conditional = old?.meta?.etag ? { 'If-None-Match': old.meta.etag } : {};
  const url = `https://api.github.com/repos/${tool.github}/releases?per_page=${RELEASES_PAGE}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...ghHeaders(), ...conditional }, signal: AbortSignal.timeout(30000) });
  if (!res.ok && res.status !== 304) throw new Error(`${res.status} ${url}`);
  if (res.status === 304) {
    const kept = old.items.filter((i) => i.kind === 'release');
    const plain = kept.filter((i) => !sideTag(i.version));
    return { items: tool.discovered && plain.length ? plain : kept, meta: old.meta };
  }
  const releases = await res.json();
  const etag = res.headers.get('etag');
  const repo = QUICK && old?.meta?.repo ? null : await get(`https://api.github.com/repos/${tool.github}`, { json: true, headers: ghHeaders() });
  const meta = repo
    ? { stars: repo.stargazers_count, repo: tool.github, repoUrl: repo.html_url, license: repo.license?.spdx_id || null, etag }
    : { ...old.meta, etag };
  let stable = releases.filter((r) => !r.draft && (tool.prerelease || (!r.prerelease && !UNSTABLE.test(r.tag_name) && !UNSTABLE.test(r.name || ''))) && (!tool.tagFilter || tool.tagFilter.test(r.tag_name)));
  if (tool.discovered && stable.some((r) => !sideTag(r.tag_name))) stable = stable.filter((r) => !sideTag(r.tag_name));
  const cadence = await releaseDates(tool, releases, old);
  const items = stable.slice(0, MAX_PER_TOOL).map((r) => {
    const version = r.tag_name;
    const html = r.body ? clipHtml(sanitize(marked.parse(r.body))) : '';
    return {
      id: `gh:${tool.github}:${r.id}`, toolId: tool.id, kind: 'release', version,
      title: releaseTitle(tool, version, (r.name || '').trim()),
      url: r.html_url, date: r.published_at, summary: excerpt(toText(html)), html, source: 'GitHub Releases',
    };
  });
  return { items, meta: { ...meta, cadence } };
}

// Release dates behind the activity chart: full runs page back through the repo's history.
async function releaseDates(tool, releases, old) {
  const dates = releases.filter((r) => !r.draft).map((r) => r.published_at);
  let complete = releases.length < RELEASES_PAGE;
  for (let page = 2; !complete && !QUICK && page * RELEASES_PAGE <= MAX_RELEASE_DATES; page++) {
    const more = await get(`https://api.github.com/repos/${tool.github}/releases?per_page=${RELEASES_PAGE}&page=${page}`, { json: true, headers: ghHeaders() }).catch(() => null);
    if (!more) break;
    dates.push(...more.filter((r) => !r.draft).map((r) => r.published_at));
    complete = more.length < RELEASES_PAGE;
  }
  if (!complete) dates.push(...(old?.meta?.cadence || []));
  return [...new Set(dates)].sort().reverse();
}

// ── projects.blender.org (Gitea) tags ──────────────────────
// Blender and Flamenco ship from Blender's own Gitea, not GitHub. Tags carry the commit date.
const GITEA = 'https://projects.blender.org/api/v1/repos';
const seriesOf = (v) => v.replace(/^v/, '').split('.').slice(0, 2).join('.');

async function fetchGitea(tool, old, seriesInfo = {}) {
  const tags = [];
  for (let page = 1; page <= (QUICK ? 1 : 8); page++) {
    const batch = await get(`${GITEA}/${tool.gitea}/tags?limit=50&page=${page}`, { json: true });
    tags.push(...batch);
    if (batch.length < 50) break;
  }
  const known = new Map((old?.items || []).filter((i) => i.kind === 'release').map((i) => [i.id, i]));
  const fresh = tags
    .filter((t) => (!tool.tagFilter || tool.tagFilter.test(t.name)) && t.commit?.created)
    .map((t) => {
      const version = t.name.replace(/^v/, '');
      const id = `gitea:${tool.gitea}:${t.name}`;
      if (known.has(id)) return known.get(id);
      const isBlender = tool.id === 'blender';
      const series = seriesOf(version);
      const patch = Number(version.split('.')[2] || 0);
      const info = seriesInfo[series];
      const summary = isBlender
        ? (patch === 0 ? (info?.summary || `Blender ${series} is out.`) : `Corrective release for Blender ${series}${info?.lts ? ' LTS' : ''}: bug fixes and stability updates.`)
        : toText(t.message || '') || `${tool.name} ${version}`;
      return {
        id, toolId: tool.id, kind: 'release', version,
        title: `${tool.name} ${version}${isBlender && patch === 0 ? (info?.lts ? ' LTS' : '') : ''}`,
        url: isBlender ? `https://developer.blender.org/docs/release_notes/${series}/` : `https://projects.blender.org/${tool.gitea}/src/tag/${t.name}`,
        date: new Date(t.commit.created).toISOString(), summary, html: '', source: 'projects.blender.org',
        ...(isBlender ? { series, patch } : {}),
      };
    });
  const merged = new Map([...known, ...fresh.map((i) => [i.id, i])]);
  const all = [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { items: all.slice(0, tool.id === 'blender' ? 400 : MAX_PER_TOOL), meta: { repoUrl: `https://projects.blender.org/${tool.gitea}`, cadence: all.map((i) => i.date) } };
}

// ── Blender release schedule, LTS windows and daily builds ─
const MONTHS = 'January February March April May June July August September October November December'.split(' ');
const parseDay = (s) => { const d = Date.parse(`${s} 12:00 UTC`); return Number.isNaN(d) ? null : new Date(d).toISOString(); };

async function fetchSchedule(prevSchedule) {
  const milestones = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await get(`${GITEA}/blender/blender/milestones?state=all&limit=50&page=${page}`, { json: true });
    milestones.push(...batch);
    if (batch.length < 50) break;
  }
  const series = {};
  for (const m of milestones) {
    const match = m.title.match(/^(\d+\.\d+)(\s+LTS)?$/);
    if (!match) continue;
    const desc = m.description || '';
    const phases = [...desc.matchAll(/^\|\s*(Alpha|Beta|Release Candidate|Release)\s*\|[^|]*\|\s*([A-Z][a-z]+ \d{1,2},? \d{4})\s*\|/gm)]
      .map(([, phase, day]) => ({ phase, date: parseDay(day.replace(',', '')) })).filter((p) => p.date);
    const until = desc.match(/maintained until ([A-Z][a-z]+) (\d{4})/);
    series[match[1]] = {
      series: match[1], lts: !!match[2] || /long term support/i.test(desc), state: m.state, phases,
      supportUntil: until ? new Date(Date.UTC(+until[2], MONTHS.indexOf(until[1]) + 1, 0, 12)).toISOString() : null,
      notes: `https://developer.blender.org/docs/release_notes/${match[1]}/`,
    };
  }
  // The headline sentence from each series' blender.org release page (cached: it never changes).
  await Promise.all(Object.values(series).map(async (s) => {
    const cached = prevSchedule?.series?.[s.series]?.summary;
    if (cached) { s.summary = cached; return; }
    if (s.state === 'open' && !s.lts) return;
    const page = await get(`https://www.blender.org/download/releases/${s.series.replace('.', '-')}/`).catch(() => '');
    const desc = page.match(/<meta (?:name|property)="(?:og:)?description" content="([^"]*)"/)?.[1];
    if (desc) s.summary = toText(desc);
  }));
  return { series, fetchedAt: new Date(NOW).toISOString() };
}

// ── Bug fixes in each corrective release ───────────────────
// LTS series list every patch release's changelog on blender.org/download/lts/<x-y>/; other series
// on the developer docs' corrective_releases page. Published lists never change, so known versions are kept.
const fixItems = (ul) => [...ul.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, li]) => {
  const ref = li.match(/<a href="(https:\/\/projects\.blender\.org\/[^"]+)">([^<]+)<\/a>/);
  const t = toText(li.replace(/\s*[[(]\s*<a [^>]*>[^<]*<\/a>\s*[\])]\s*$/, '')).replace(/\.$/, '');
  return t ? { t, url: ref?.[1] || null, ref: ref?.[2] || null } : null;
}).filter(Boolean);

async function fetchFixes(seriesInfo, releases, prevFixes = {}) {
  const fixes = { ...prevFixes };
  const want = new Map(); // series → versions still missing
  for (const r of releases) if (r.patch > 0 && !fixes[r.version]) want.set(r.series, [...(want.get(r.series) || []), r.version]);
  await Promise.all([...want.keys()].filter((s) => vcmpNum(s, '3.0') >= 0).map(async (s) => {
    const lts = seriesInfo[s]?.lts;
    const url = lts ? `https://www.blender.org/download/lts/${s.replace('.', '-')}/` : `https://developer.blender.org/docs/release_notes/${s}/corrective_releases/`;
    const html = await get(url).catch(() => '');
    if (!html) return;
    // Split the page at each version heading; a version's fixes are the list items in its section that
    // link to projects.blender.org (download links and navigation never do).
    const marks = [...html.matchAll(lts ? /<summary[^>]*>\s*Blender (\d+\.\d+\.\d+)/g : /<h2 id="blender-\d+">Blender (\d+\.\d+\.\d+)/g)];
    marks.forEach((m, i) => {
      const section = html.slice(m.index, marks[i + 1]?.index ?? m.index + 60000);
      const list = fixItems(section).filter((f) => f.url);
      if (list.length) fixes[m[1]] = list;
    });
  }));
  return fixes;
}
const vcmpNum = (a, b) => a.localeCompare(b, undefined, { numeric: true });

// ── Feature highlights from the official release notes ─────
// developer.blender.org/docs/release_notes/<series>/ (CC BY-SA 4.0): each area page is split at its
// h2/h3 headings into features with a short excerpt and the first image or video. Released series never
// change, so they are fetched once; the upcoming one is refreshed on every full run.
const NOTES = 'https://developer.blender.org/docs/release_notes';
const SKIP_HEADINGS = /^(compatibility|bug ?fixes|miscellaneous|other|breaking changes|deprecated|removed|known issues|python api|api changes|performance|notes?)$/i;
const article = (html) => { const a = html.indexOf('<article'); return a < 0 ? '' : html.slice(a, html.indexOf('</article>', a)); };
async function fetchHighlights(seriesInfo, releases, prev = {}) {
  const out = { ...prev };
  const released = new Set(releases.map((r) => r.series));
  const targets = Object.values(seriesInfo).filter((s) => vcmpNum(s.series, '4.0') >= 0 && (released.has(s.series) || (s.state === 'open' && s.phases.length)));
  await Promise.all(targets.map(async (s) => {
    const done = prev[s.series]?.sections?.length && prev[s.series].final;
    const stale = !prev[s.series] || NOW - Date.parse(prev[s.series].fetchedAt) > DAY / 4;
    if (done || (QUICK && !stale)) return;
    const index = article(await get(`${NOTES}/${s.series}/`).catch(() => ''));
    if (!index) return;
    const links = [...new Set([...index.matchAll(/<li><a href="([a-z_]+\/)">([^<]+)<\/a><\/li>/g)].map(([, href, name]) => `${href}|${toText(name)}`))];
    const sections = (await Promise.all(links.map(async (l) => {
      const [href, area] = l.split('|');
      const url = `${NOTES}/${s.series}/${href}`;
      const body = article(await get(url).catch(() => ''));
      if (!body) return null;
      const heads = [...body.matchAll(/<h([23])[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)];
      let group = null;
      const features = heads.map((h, i) => {
        const title = toText(h[3].replace(/<a class="headerlink"[\s\S]*?<\/a>/, ''));
        if (h[1] === '2') group = title;
        const block = body.slice(h.index + h[0].length, heads[i + 1]?.index ?? body.length);
        const text = toText(block.match(/<p>([\s\S]*?)<\/p>/)?.[1] || '');
        const img = block.match(/<img[^>]+src="([^"]+)"/)?.[1];
        const video = block.match(/<(?:video|source)[^>]+src="([^"]+\.(?:mp4|webm))"/)?.[1];
        const items = (block.match(/<li>/g) || []).length;
        if (SKIP_HEADINGS.test(title) || (!text && !img && !video && !items)) return null;
        return {
          title, group: h[1] === '3' ? group : null, url: `${url}#${h[2]}`, text: excerpt(text, 240), items,
          img: img ? httpsUrl(img, url) : null, video: video ? httpsUrl(video, url) : null,
        };
      }).filter(Boolean);
      return features.length ? { area, url, features } : null;
    }))).filter(Boolean);
    if (sections.length) out[s.series] = { sections, fetchedAt: new Date(NOW).toISOString(), final: released.has(s.series) && seriesInfo[s.series].state === 'closed' };
  }));
  return out;
}

async function fetchBuilds() {
  const list = await get('https://builder.blender.org/download/daily/?format=json&v=1', { json: true });
  const builds = new Map();
  for (const b of list) {
    if (b.file_extension === 'sha256' || NOW - b.file_mtime * 1000 > 45 * DAY) continue;
    const key = `${b.version}|${b.branch}|${b.platform}|${b.architecture}`;
    const cur = builds.get(key);
    if (!cur || b.file_mtime > cur.file_mtime) builds.set(key, b);
  }
  // Group platforms under each build line (version + branch).
  const lines = new Map();
  for (const b of builds.values()) {
    const key = `${b.version}|${b.branch}`;
    const line = lines.get(key) || { version: b.version, branch: b.branch, risk: b.risk_id, cycle: b.release_cycle, hash: b.hash, date: 0, files: [] };
    line.date = Math.max(line.date, b.file_mtime * 1000);
    line.files.push({ platform: b.platform, arch: b.architecture, url: b.url, size: b.file_size, ext: b.file_extension });
    lines.set(key, line);
  }
  return [...lines.values()]
    .map((l) => ({ ...l, date: new Date(l.date).toISOString(), files: l.files.sort((a, b) => `${a.platform}${a.arch}`.localeCompare(`${b.platform}${b.arch}`)) }))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
}

// ── Blender Extensions platform ────────────────────────────
// The listing API gives every extension's version and compatibility; the website's sorted listings
// add downloads, ratings and thumbnails. firstSeen dates track when each extension appeared.
const EXT = 'https://extensions.blender.org';
function parseExtCards(html) {
  return html.split('<div class="cards-item">').slice(1).map((card) => {
    const slug = card.match(/href="\/(?:add-ons|themes)\/([a-z0-9-]+)\/"/)?.[1];
    if (!slug) return null;
    const type = card.match(/href="\/(add-ons|themes)\//)?.[1] === 'themes' ? 'theme' : 'add-on';
    const thumb = card.match(/<img [^>]*src="([^"]+)"/)?.[1];
    return {
      slug, type,
      url: `${EXT}/${type === 'theme' ? 'themes' : 'add-ons'}/${slug}/`,
      name: toText(card.match(/<h3 class="cards-item-title">\s*<a [^>]*>([\s\S]*?)<\/a>/)?.[1] || slug),
      tagline: toText(card.match(/<div class="cards-item-excerpt">([\s\S]*?)<\/div>/)?.[1] || ''),
      thumb: thumb ? httpsUrl(thumb, EXT) : null,
      tags: [...card.matchAll(/class="badge badge-tag[^"]*">\s*([^<]+?)\s*<\/a>/g)].map((m) => toText(m[1])),
      author: toText(card.match(/href="\/author\/\d+\/"[^>]*>([^<]+)</)?.[1] || ''),
      rating: Number(card.match(/Rated ([\d.]+) out of 5/)?.[1]) || null,
      reviews: Number(card.match(/<\/span>\s*\((\d+)\)/)?.[1]) || 0,
      downloads: Number(card.match(/title="(\d+) downloads"/)?.[1]) || null,
    };
  }).filter(Boolean);
}

async function fetchExtensions(prevExt) {
  const api = await get(`${EXT}/api/v1/extensions/`, { json: true });
  const byWebsite = new Map(api.data.map((e) => [e.website?.replace(/\/$/, ''), e]));
  const enrich = (c) => {
    const e = byWebsite.get(c.url.replace(/\/$/, ''));
    return e ? { ...c, id: e.id, version: e.version, min: e.blender_version_min, max: e.blender_version_max || null, license: e.license?.[0]?.replace(/^SPDX:/, '') } : c;
  };
  const listing = async (path) => parseExtCards(await get(`${EXT}${path}`)).map(enrich);
  const [newest, popular, rated, themes] = await Promise.all([
    listing('/add-ons/?sort_by=-date_approved'),
    listing('/add-ons/?sort_by=-download_count'),
    listing('/add-ons/?sort_by=-rating_sortkey'),
    listing('/themes/?sort_by=-date_approved'),
  ]);
  const firstSeen = { ...(prevExt?.firstSeen || {}) };
  const today = new Date(NOW).toISOString();
  // First run: everything already listed predates tracking, so it gets no date (only later arrivals do).
  const bootstrap = !prevExt?.firstSeen;
  for (const e of api.data) if (!firstSeen[e.id]) firstSeen[e.id] = bootstrap ? null : today;
  const counts = api.data.reduce((m, e) => ({ ...m, [e.type]: (m[e.type] || 0) + 1 }), {});
  const compat = {};
  for (const e of api.data) { const s = seriesOf(e.blender_version_min || '4.2'); compat[s] = (compat[s] || 0) + 1; }
  return { newest, popular, rated, themes, counts, total: api.data.length, compat, firstSeen, fetchedAt: today };
}

// ── RSS / Atom feeds ───────────────────────────────────────
const feedCache = new Map();
function fetchFeed(url) {
  if (!feedCache.has(url)) feedCache.set(url, get(url).then((xml) => parseFeed(xml, url)));
  return feedCache.get(url);
}

const firstImg = (html, base) => { const m = String(html || '').match(/<img[^>]+src="([^"]+)"/i); return m ? httpsUrl(m[1], base) : null; };
const mediaUrl = (m) => [].concat(m || []).map((x) => x?.['@url']).find(Boolean);

function parseFeed(xml, base) {
  const doc = parser.parse(xml);
  if (doc.rss) {
    const items = [].concat(doc.rss.channel?.item || []);
    return items.map((it) => {
      const content = str(it['content:encoded']) || str(it.description);
      const enclosure = it.enclosure?.['@type']?.startsWith('image') ? it.enclosure['@url'] : null;
      return {
        title: toText(str(it.title)), url: str(it.link) || str(it.guid), date: it.pubDate || it['dc:date'], content,
        author: toText(str(it['dc:creator'])),
        categories: [].concat(it.category || []).map(str),
        image: httpsUrl(mediaUrl(it['media:content']) || mediaUrl(it['media:thumbnail']) || enclosure || '', base) || firstImg(content, base),
      };
    });
  }
  if (doc.feed) {
    const entries = [].concat(doc.feed.entry || []);
    return entries.map((e) => {
      const links = [].concat(e.link || []);
      const alt = links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') || links[0];
      const group = e['media:group'] || {};
      const content = str(e.content) || str(e.summary) || str(group['media:description']);
      return {
        title: toText(str(e.title)), url: alt?.['@href'] || str(e.id), date: e.published || e.updated, content,
        author: toText(str(e.author?.name)),
        categories: [].concat(e.category || []).map((c) => c['@term'] || str(c)),
        videoId: str(e['yt:videoId']) || null,
        views: Number(group['media:community']?.['media:statistics']?.['@views']) || null,
        image: httpsUrl(mediaUrl(group['media:thumbnail']) || mediaUrl(e['media:thumbnail']) || '', base) || firstImg(content, base),
      };
    });
  }
  throw new Error('Unknown feed format');
}

async function fetchFeeds(tool) {
  const out = [];
  for (const f of tool.feeds || []) {
    for (const e of await fetchFeed(f.url)) {
      if (f.filter && !f.filter.test(`${e.title} ${e.categories.join(' ')} ${e.url}`)) continue;
      const d = new Date(e.date);
      if (Number.isNaN(+d) || +d > NOW + 6 * 3600e3) continue;
      out.push({
        id: `feed:${e.url}`, toolId: tool.id, kind: f.kind, title: e.title, url: e.url,
        date: d.toISOString(), summary: excerpt(toText(e.content)), html: f.kind === 'changelog' && e.content ? clipHtml(sanitize(e.content)) : '',
        source: new URL(f.url).hostname.replace(/^www\./, ''), image: e.image || null,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_PER_TOOL);
}

// ── News, videos and community threads ─────────────────────
// [tag, pattern] — the first that matches the title labels the story.
const TAGS = [
  ['Release', /\bblender \d+\.\d+|\breleased?\b|\bis out\b|now available|\bv?\d+\.\d+(\.\d+)? (is|now)\b|\blts\b/i],
  ['Add-on', /\badd-?ons?\b|\bextensions?\b|\bplugins?\b/i],
  ['Engine', /\bcycles\b|\beevee\b|\brender(er|ing)?\b|octane|redshift|\bv-ray\b|path ?trac/i],
  ['Feature', /geometry nodes|grease pencil|sculpt|\bsimulation\b|\bphysics\b|\brigging\b|\bnodes?\b|compositor|\bvse\b|\bvulkan\b|\bmetal\b/i],
  ['Studio', /blender studio|open movie|\bsprite fright\b|\bwing it\b|\bgold\b.*film|\bfilm\b|short film|animation festival/i],
  ['Community', /\bconference\b|bcon|meetup|\bcontest\b|\bchallenge\b|\bdonat|development fund|\bfoundation\b|\bgrant\b/i],
  ['Tutorial', /tutorial|\bhow to\b|beginner|\bguide\b|\btips?\b|\blearn\b|step-by-step|course/i],
  ['Showcase', /showcase|artwork|\brender of\b|made (in|with) blender|\bwip\b|\bfinished\b|my (first|latest)/i],
];
const tagFor = (title, text = '') => TAGS.find(([, re]) => re.test(title))?.[0] || TAGS.find(([, re]) => re.test(text.slice(0, 300)))?.[0] || null;
const LIMITS = { article: 60, video: 48, thread: 45 };

async function fetchNews(prevNews, report) {
  const all = [];
  const prevByUrl = new Map((prevNews || []).map((n) => [n.url, n]));
  await Promise.all(NEWS_FEEDS.map(async (f) => {
    try {
      for (const e of await fetchFeed(f.url)) {
        const text = toText(e.content);
        const d = Date.parse(e.date);
        if (Number.isNaN(d) || NOW - d > 30 * DAY || d > NOW + 6 * 3600e3) continue;
        if (f.relevant && !f.relevant.test(`${e.title} ${text.slice(0, 400)} ${e.categories.join(' ')}`)) continue;
        // Reddit/Discourse thread bodies are mostly link boilerplate; keep a short clean summary.
        const summary = f.type === 'thread' ? excerpt(text.replace(/submitted by .*$/i, '').replace(/\[link\]|\[comments\]/g, ''), 180) : excerpt(text, 240);
        all.push({
          id: `${f.type}:${e.url}`, type: f.type, title: e.title, url: e.url, date: new Date(d).toISOString(), summary,
          source: f.name, official: !!f.official, author: e.author || null,
          image: e.image || prevByUrl.get(e.url)?.image || null,
          ...(e.videoId ? { videoId: e.videoId, image: `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`, views: e.views } : {}),
          tag: f.type === 'video' ? (tagFor(e.title) || 'Video') : tagFor(e.title, text),
        });
      }
    } catch (err) { report.push(`⚠ Feed ${f.name}: ${err.message}`); }
  }));
  // Same story from two feeds (blender.org + BlenderNation): keep the official one.
  const seen = new Map();
  for (const n of all.sort((a, b) => Number(b.official) - Number(a.official) || b.date.localeCompare(a.date))) {
    const key = `${n.type}:${n.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
    if (!seen.has(key) && !seen.has(`url:${n.url}`)) { seen.set(key, n); seen.set(`url:${n.url}`, n); }
  }
  const unique = [...new Set(seen.values())];
  const out = [];
  for (const [type, max] of Object.entries(LIMITS)) out.push(...unique.filter((n) => n.type === type).sort((a, b) => b.date.localeCompare(a.date)).slice(0, max));
  return out;
}

// Articles without a feed image get the page's og:image (cached across runs).
async function newsImages(news) {
  const missing = news.filter((n) => n.type === 'article' && !n.image).slice(0, 30);
  await Promise.all(missing.map(async (n) => {
    const html = await get(n.url).catch(() => '');
    const m = html.match(/<meta[^>]+(?:property|name)="(?:og:image|twitter:image)"[^>]+content="([^"]+)"/i) || html.match(/<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="og:image"/i);
    if (m) n.image = httpsUrl(m[1], n.url);
  }));
  return news;
}

// ── Hacker News discussion ────────────────────────────────
async function fetchHN(allTools) {
  const since = Math.floor((NOW - 90 * DAY) / 1000);
  const seen = new Map();
  await Promise.all(HN_QUERIES.map(async (q) => {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=50&numericFilters=created_at_i>${since},points>10`;
    const { hits } = await get(url, { json: true });
    for (const h of hits) if (h.title && !seen.has(h.objectID)) seen.set(h.objectID, h);
  }));
  const items = [];
  for (const h of seen.values()) {
    const toolIds = allTools.filter((t) => (HN_MATCH[t.id] || t.hnMatch)?.test(h.title)).map((t) => t.id);
    if (!toolIds.length) continue;
    items.push({
      id: `hn:${h.objectID}`, toolId: toolIds.includes('blender') && toolIds.length > 1 ? toolIds.find((id) => id !== 'blender') : toolIds[0], toolIds,
      kind: 'discussion', title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      hnUrl: `https://news.ycombinator.com/item?id=${h.objectID}`, date: new Date(h.created_at_i * 1000).toISOString(),
      summary: '', points: h.points, comments: h.num_comments || 0, source: 'Hacker News',
    });
  }
  return items.sort((a, b) => b.points - a.points).slice(0, 60);
}

// ── Trending discovery ─────────────────────────────────────
const discoveredItems = new Map();
function hnPattern(name) {
  if (name.length < 6 || /\s/.test(name)) return null;
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${n}\\b.*\\bblender\\b|\\bblender\\b.*\\b${n}\\b`, 'i');
}

function starVelocity(history) {
  const recent = history.filter(([d]) => NOW - Date.parse(d) <= 8 * DAY);
  if (recent.length < 2) return null;
  const [d0, s0] = recent[0], [d1, s1] = recent[recent.length - 1];
  const days = (Date.parse(d1) - Date.parse(d0)) / DAY;
  return days >= 1 ? Math.round(((s1 - s0) / days) * 7) : null;
}

async function discover(prev, report) {
  if (QUICK) return prev.discovered || [];
  const prevById = new Map((prev.discovered || []).map((d) => [d.id, d]));
  let candidates;
  try { candidates = await searchCandidates(get, ghHeaders); } catch (e) {
    report.push(`⚠ Discovery: ${e.message} (kept previous list)`);
    return prev.discovered || [];
  }
  const today = new Date(NOW).toISOString().slice(0, 10);
  const qualified = [];
  // Small batches keep us well under GitHub's secondary rate limits.
  for (let i = 0; i < candidates.length; i += 8) {
    await Promise.all(candidates.slice(i, i + 8).map(async (r) => {
      const tool = toTool(r);
      try {
        const { items, meta } = await fetchGithub(tool, prev.tools?.[tool.id]);
        const latest = items[0];
        if (!latest || NOW - Date.parse(latest.date) > DISCOVERY.maxReleaseAgeDays * DAY) return;
        const old = prevById.get(tool.id);
        const stars = [...(old?.stars || []).filter(([d]) => d !== today && NOW - Date.parse(d) < 31 * DAY), [today, r.stargazers_count]];
        const ageDays = Math.max(30, (NOW - Date.parse(r.created_at)) / DAY);
        const velocity = starVelocity(stars);
        qualified.push({
          ...tool, firstSeen: old?.firstSeen || new Date(NOW).toISOString(), lastQualified: new Date(NOW).toISOString(),
          stars, starsPerWeek: velocity, score: velocity ?? Math.round((r.stargazers_count / ageDays) * 7),
        });
        discoveredItems.set(tool.id, { items, meta, errors: [] });
      } catch {}
    }));
  }
  const ids = new Set(qualified.map((q) => q.id));
  const stillCandidates = new Set(candidates.map((r) => toTool(r).id));
  const kept = [...prevById.values()].filter((d) => !ids.has(d.id) && stillCandidates.has(d.id) && NOW - Date.parse(d.lastQualified) < DISCOVERY.keepDays * DAY);
  const out = [...qualified.sort((a, b) => b.score - a.score), ...kept].slice(0, DISCOVERY.max);
  report.push(`✓ Discovery              ${qualified.length} trending add-ons qualified (${candidates.length} candidates, ${kept.length} kept)`);
  return out;
}

// ── Orchestrate ────────────────────────────────────────────
async function step(report, label, fn, fallback) {
  try { const v = await fn(); report.push(`✓ ${label}`); return v; } catch (e) {
    report.push(`⚠ ${label}: ${e.message} (kept previous)`); return fallback;
  }
}

async function main() {
  let prev = { tools: {}, discussions: [] };
  try { prev = JSON.parse(await readFile(SNAPSHOT, 'utf8')); } catch {}
  const report = [];

  // Schedule first: Blender's release items use each series' LTS flag and summary.
  const schedule = await step(report, 'Release schedule', () => fetchSchedule(prev.schedule), prev.schedule || { series: {} });
  const builds = await step(report, 'Daily builds', fetchBuilds, prev.builds || []);
  const extensions = QUICK && prev.extensions && NOW - Date.parse(prev.extensions.fetchedAt) < DAY / 4
    ? prev.extensions
    : await step(report, 'Extensions platform', () => fetchExtensions(prev.extensions), prev.extensions || null);

  const tools = {};
  const discovered = await discover(prev, report);
  const allTools = [...TOOLS, ...discovered.map((d) => ({ ...d, hnMatch: hnPattern(d.name) }))];
  await Promise.all(allTools.map(async (tool) => {
    if (tool.discovered && discoveredItems.has(tool.id)) { tools[tool.id] = discoveredItems.get(tool.id); return; }
    const entry = { items: [], meta: {}, errors: [] };
    const old = prev.tools?.[tool.id];
    const source = tool.github ? ['github', () => fetchGithub(tool, old)] : tool.gitea ? ['gitea', () => fetchGitea(tool, old, schedule.series)] : null;
    if (source) {
      try { const { items, meta } = await source[1](); entry.items.push(...items); entry.meta = meta; } catch (e) {
        entry.errors.push(`${source[0]}: ${e.message}`);
        if (old) { entry.items.push(...old.items.filter((i) => i.kind === 'release')); entry.meta = old.meta || {}; }
      }
    }
    if (tool.feeds) {
      try { entry.items.push(...await fetchFeeds(tool)); } catch (e) {
        entry.errors.push(`feed: ${e.message}`);
        if (old) entry.items.push(...old.items.filter((i) => i.kind !== 'release'));
      }
    }
    const seen = new Set();
    entry.items = entry.items.filter((i) => !seen.has(i.id) && seen.add(i.id)).sort((a, b) => b.date.localeCompare(a.date));
    tools[tool.id] = entry;
    report.push(`${entry.errors.length ? '⚠' : '✓'} ${tool.name.padEnd(22)} ${String(entry.items.length).padStart(3)} items ${entry.errors.join('; ')}`);
  }));

  let discussions = prev.discussions || [];
  try { discussions = await fetchHN(allTools); report.push(`✓ Hacker News            ${discussions.length} stories`); } catch (e) {
    report.push(`⚠ Hacker News: ${e.message}`);
  }

  // Fix lists: quick runs only look for releases from the last month (their changelog may land a day late).
  const blenderReleases = (tools.blender?.items || []).filter((i) => i.kind === 'release' && (!QUICK || NOW - Date.parse(i.date) < 30 * DAY));
  const fixes = await step(report, 'Corrective release fixes', () => fetchFixes(schedule.series, blenderReleases, prev.fixes), prev.fixes || {});
  report.push(`✓ Fix lists              ${Object.keys(fixes).length} releases, ${Object.values(fixes).reduce((n, l) => n + l.length, 0)} fixes`);

  const allBlender = (tools.blender?.items || []).filter((i) => i.kind === 'release');
  const highlights = await step(report, 'Release-note highlights', () => fetchHighlights(schedule.series, allBlender, prev.highlights), prev.highlights || {});
  report.push(`✓ Highlights             ${Object.entries(highlights).map(([s, h]) => `${s}:${h.sections.reduce((n, x) => n + x.features.length, 0)}`).join(' ')}`);

  let news = await fetchNews(prev.news, report);
  if (!news.length) news = prev.news || [];
  report.push(`✓ News                   ${news.filter((n) => n.type === 'article').length} articles · ${news.filter((n) => n.type === 'video').length} videos · ${news.filter((n) => n.type === 'thread').length} threads`);

  // Did anything actually ship? (Ignores vote counts and view counts, which move constantly.)
  const fingerprint = (t) => Object.values(t || {}).flatMap((e) => e.items.map((i) => `${i.id}|${i.version || ''}|${i.title}`)).sort().join('\n');
  const ids = (list) => (list || []).map((d) => d.id || d.hash || d.slug).sort().join();
  const changed = fingerprint(tools) !== fingerprint(prev.tools) || ids(discovered) !== ids(prev.discovered) || ids(news) !== ids(prev.news)
    || ids(builds) !== ids(prev.builds) || ids(extensions?.newest) !== ids(prev.extensions?.newest)
    || Object.keys(fixes).sort().join() !== Object.keys(prev.fixes || {}).sort().join();
  const oldIds = new Set(Object.values(prev.tools || {}).flatMap((e) => e.items.map((i) => i.id)));
  const fresh = Object.values(tools).flatMap((e) => e.items).filter((i) => !oldIds.has(i.id));
  report.push(`${changed ? '★' : '·'} ${changed ? `${fresh.length} new item(s): ${fresh.slice(0, 8).map((i) => i.title).join(' · ')}` : 'No new updates'}`);
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`, { flag: 'a' });
  if (QUICK && !changed) { console.log(report.sort().join('\n')); return; } // nothing new: leave the snapshot untouched

  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(SNAPSHOT, JSON.stringify({
    generatedAt: new Date(NOW).toISOString(), tools, discovered, discussions,
    news: await newsImages(news), schedule, builds, extensions, fixes, highlights,
  }, null, 1));
  console.log(report.sort().join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
