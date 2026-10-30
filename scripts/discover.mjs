// Auto-discovers trending open-source Blender add-ons and engines via the GitHub Search API,
// so the site grows beyond the hand-curated list in sources.mjs. A repo qualifies only if it is
// actually a Blender add-on/tool (not a tutorial, asset pack or script dump), is actively
// maintained and ships real GitHub Releases we can show.
import { TOOLS, DISCOVERY } from './sources.mjs';

const DAY = 86400e3;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

const NEGATIVE = /\bawesome\b|tutorial|\bcourses?\b|\bguides?\b|\btips\b|\bcheat ?sheet|\blist of\b|\bcollection of (scripts|snippets)\b|\bcurated\b|\bbook\b|\bdataset\b|\bpaper\b|\bhomework\b|\bassignment\b|\bportfolio\b|\bmy (blender )?(scripts|configs?|dotfiles)\b/i;
const ENGINE = /\brender engine\b|\bpath ?tracer\b|\bgame engine\b|\braytracer\b/i;
const TOOLISH = /\blauncher\b|\bpipeline\b|\brender farm\b|\bexporter\b|\bimporter\b/i;

const CATEGORY = (r) => {
  const s = `${r.description} ${(r.topics || []).join(' ')}`;
  if (ENGINE.test(s)) return 'engine';
  if (TOOLISH.test(s) && !/\badd-?on\b/i.test(s)) return 'tool';
  return 'addon';
};

const pretty = (r) => DISCOVERY.names[r.full_name.toLowerCase()]
  || (/[A-Z]/.test(r.name) ? r.name.replace(/[-_]/g, ' ') : r.name.split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));

// Stable accent derived from the repo name.
const colorFor = (s) => {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 65% 60%)`;
};

/** Candidate repos (search results) that pass the niche filter, best first. */
export async function searchCandidates(get, ghHeaders) {
  const pushed = iso(Date.now() - DISCOVERY.maxIdleDays * DAY);
  const known = new Set(TOOLS.filter((t) => t.github).map((t) => t.github.toLowerCase()));
  const deny = new Set(DISCOVERY.deny.map((s) => s.toLowerCase()));
  const base = `stars:>${DISCOVERY.minStars} pushed:>${pushed} archived:false fork:false`;
  const queries = [
    ...DISCOVERY.topics.map((t) => `topic:${t} ${base}`),
    `"blender add-on" in:description ${base}`,
    `"blender addon" in:description ${base}`,
    `"blender extension" in:description ${base}`,
  ];
  const seen = new Map();
  for (const q of queries) { // sequential: the Search API allows ~30 req/min
    const res = await get(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100`, { json: true, headers: ghHeaders() });
    for (const r of res.items || []) seen.set(r.full_name.toLowerCase(), r);
  }
  return [...seen.values()].filter((r) => {
    const key = r.full_name.toLowerCase();
    if (known.has(key) || deny.has(key)) return false;
    if (DISCOVERY.allow.some((a) => a.toLowerCase() === key)) return true;
    const desc = r.description || '';
    return r.stargazers_count >= DISCOVERY.minStars && /blender/i.test(`${desc} ${(r.topics || []).join(' ')}`) && !NEGATIVE.test(`${desc} ${r.name}`);
  });
}

/** Turns a qualifying repo into a tool entry shaped like those in sources.mjs. */
export function toTool(r) {
  return {
    id: `gh-${r.full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: pretty(r), vendor: r.owner.login, category: CATEGORY(r),
    site: r.homepage && /^https?:/.test(r.homepage) ? r.homepage : r.html_url,
    avatar: r.owner.avatar_url, color: colorFor(r.full_name),
    blurb: (r.description || '').replace(/\s+/g, ' ').trim(),
    github: r.full_name, discovered: true, createdAt: r.created_at,
  };
}
