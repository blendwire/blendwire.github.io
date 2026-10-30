// Everything the site tracks, and where its real data comes from.
// gitea: projects.blender.org tags · github: GitHub Releases API · feeds: official RSS/Atom (kind: blog | changelog)

export const SITE = {
  name: 'Blendwire',
  tagline: 'Every Blender release, add-on and render engine update — live.',
  url: process.env.SITE_URL || 'https://blendwire.github.io',
};

// Category colors follow Blender's axis / data-type colors.
export const CATEGORIES = {
  blender: { label: 'Blender', short: 'Blender', color: '#e87d0d' },
  addon: { label: 'Add-ons', short: 'Add-on', color: '#8bdc00' },
  engine: { label: 'Render & game engines', short: 'Engine', color: '#2890ff' },
  fork: { label: 'Blender forks', short: 'Fork', color: '#ff3352' },
  tool: { label: 'Pipeline tools', short: 'Tool', color: '#b07bff' },
};

export const TOOLS = [
  // ── Blender itself ─────────────────────────────────────
  {
    id: 'blender', name: 'Blender', vendor: 'Blender Foundation', category: 'blender',
    site: 'https://www.blender.org', color: '#e87d0d',
    blurb: 'The free and open-source 3D creation suite: modeling, sculpting, animation, simulation, rendering, compositing and video editing.',
    gitea: 'blender/blender', tagFilter: /^v\d+\.\d+\.\d+$/,
    feeds: [
      { url: 'https://www.blender.org/feed/', kind: 'blog' },
      { url: 'https://code.blender.org/feed/', kind: 'blog' },
    ],
  },
  // ── Pipeline tools ─────────────────────────────────────
  {
    id: 'flamenco', name: 'Flamenco', vendor: 'Blender Studio', category: 'tool',
    site: 'https://flamenco.blender.org', color: '#e8590d',
    blurb: 'Open-source render farm manager from Blender Studio — distribute renders over the machines you have.',
    gitea: 'studio/flamenco', tagFilter: /^v\d+\.\d+(\.\d+)?$/,
  },
  {
    id: 'blender-launcher', name: 'Blender Launcher', vendor: 'Victor-IX', category: 'tool',
    site: 'https://github.com/Victor-IX/Blender-Launcher-V2', color: '#f5a524',
    blurb: 'Manage, download and launch stable, daily and experimental Blender builds side by side.',
    github: 'Victor-IX/Blender-Launcher-V2',
  },
  {
    id: 'send2ue', name: 'Blender for Unreal Engine', vendor: 'xavier150', category: 'tool',
    site: 'https://github.com/xavier150/Blender-For-UnrealEngine-Addons', color: '#cfd8dc',
    blurb: 'Export assets, animations and cameras from Blender to Unreal Engine in one click.',
    github: 'xavier150/Blender-For-UnrealEngine-Addons',
  },
  // ── Add-ons ────────────────────────────────────────────
  {
    id: 'molecular-nodes', name: 'Molecular Nodes', vendor: 'Brady Johnston', category: 'addon',
    site: 'https://bradyajohnston.github.io/MolecularNodes/', color: '#52c7b8',
    blurb: 'Import and animate molecular and cellular data with Geometry Nodes.',
    github: 'BradyAJohnston/MolecularNodes',
  },
  {
    id: 'sverchok', name: 'Sverchok', vendor: 'nortikin', category: 'addon',
    site: 'https://github.com/nortikin/sverchok', color: '#9ccc65',
    blurb: 'Parametric node-based geometry for architects and designers.',
    github: 'nortikin/sverchok',
  },
  {
    id: 'vrm-addon', name: 'VRM Add-on', vendor: 'saturday06', category: 'addon',
    site: 'https://vrm-addon-for-blender.info', color: '#ff8fb1',
    blurb: 'Import, export and edit VRM avatars for VTubing and VR.',
    github: 'saturday06/VRM-Addon-for-Blender',
  },
  {
    id: 'mmd-tools', name: 'MMD Tools', vendor: 'MMD-Blender', category: 'addon',
    site: 'https://mmd-blender.fandom.com', color: '#ce93d8',
    blurb: 'Import and export MikuMikuDance models, motions and poses.',
    github: 'MMD-Blender/blender_mmd_tools',
  },
  {
    id: 'blenderkit', name: 'BlenderKit', vendor: 'BlenderKit', category: 'addon',
    site: 'https://www.blenderkit.com', color: '#ffb300',
    blurb: 'Browse and drop thousands of models, materials, HDRs and brushes straight into your scene.',
    github: 'BlenderKit/BlenderKit',
  },
  {
    id: 'flip-fluids', name: 'FLIP Fluids', vendor: 'Ryan Guy', category: 'addon',
    site: 'https://flipfluids.com', color: '#29b6f6',
    blurb: 'High-quality liquid simulation engine for Blender.',
    github: 'rlguy/Blender-FLIP-Fluids',
  },
  {
    id: 'mcprep', name: 'MCprep', vendor: 'TheDuckCow', category: 'addon',
    site: 'https://theduckcow.com/dev/blender/mcprep/', color: '#7cb342',
    blurb: 'Make Minecraft renders and animations fast: world imports, materials, mobs and rigs.',
    github: 'TheDuckCow/MCprep',
  },
  {
    id: 'jewelcraft', name: 'JewelCraft', vendor: 'Mikhail Rachinskiy', category: 'addon',
    site: 'https://github.com/mrachinskiy/jewelcraft', color: '#4dd0e1',
    blurb: 'Jewelry design toolkit: gems, prongs, cutters, weighting and specs.',
    github: 'mrachinskiy/jewelcraft',
  },
  {
    id: 'sketchfab', name: 'Sketchfab Plugin', vendor: 'Sketchfab', category: 'addon',
    site: 'https://github.com/sketchfab/blender-plugin', color: '#1caad9',
    blurb: 'Import downloadable Sketchfab models and publish your own from Blender.',
    github: 'sketchfab/blender-plugin',
  },
  {
    id: 'retopoflow', name: 'RetopoFlow', vendor: 'CG Cookie', category: 'addon',
    site: 'https://github.com/CGCookie/retopoflow', color: '#ef5350',
    blurb: 'Sketch-based retopology tools for fast, clean topology.',
    github: 'CGCookie/retopoflow',
  },
  {
    id: 'nodeosc', name: 'NodeOSC', vendor: 'maybites', category: 'addon',
    site: 'https://github.com/maybites/blender.NodeOSC', color: '#ffd54f',
    blurb: 'Drive Blender in real time over OSC — for live shows, installations and controllers.',
    github: 'maybites/blender.NodeOSC',
  },
  {
    id: 'phobos', name: 'Phobos', vendor: 'DFKI', category: 'addon',
    site: 'https://github.com/dfki-ric/phobos', color: '#90a4ae',
    blurb: 'Build robot models (URDF/SDF/SMURF) for simulation directly in Blender.',
    github: 'dfki-ric/phobos',
  },
  // ── Render & game engines ──────────────────────────────
  {
    id: 'luxcore', name: 'BlendLuxCore', vendor: 'LuxCoreRender', category: 'engine',
    site: 'https://luxcorerender.org', color: '#5c6bc0',
    blurb: 'Physically based, unbiased LuxCoreRender engine integrated into Blender.',
    github: 'LuxCoreRender/BlendLuxCore',
  },
  {
    id: 'prorender', name: 'Radeon ProRender', vendor: 'AMD', category: 'engine',
    site: 'https://gpuopen.com/radeon-prorender-suite/', color: '#ed1c24',
    blurb: "AMD's physically based GPU path tracer as a Blender render engine.",
    github: 'GPUOpen-LibrariesAndSDKs/RadeonProRenderBlenderAddon',
  },
  {
    id: 'mitsuba', name: 'Mitsuba Blender', vendor: 'Mitsuba', category: 'engine',
    site: 'https://github.com/mitsuba-renderer/mitsuba-blender', color: '#26a69a',
    blurb: 'Use the Mitsuba 3 research renderer from Blender.',
    github: 'mitsuba-renderer/mitsuba-blender',
  },
  {
    id: 'armory', name: 'Armory 3D', vendor: 'Armory3D', category: 'engine',
    site: 'https://armory3d.org', color: '#ab47bc',
    blurb: 'Open-source 3D game engine with full Blender integration.',
    github: 'armory3d/armory',
  },
  // ── Forks ──────────────────────────────────────────────
  {
    id: 'bforartists', name: 'Bforartists', vendor: 'Bforartists', category: 'fork',
    site: 'https://www.bforartists.de', color: '#26c6da',
    blurb: 'A Blender fork focused on a cleaner, friendlier UI and workflow.',
    github: 'Bforartists/Bforartists',
  },
  {
    id: 'upbge', name: 'UPBGE', vendor: 'UPBGE', category: 'fork',
    site: 'https://upbge.org', color: '#66bb6a',
    blurb: 'Blender with a revived, modern real-time game engine built in.',
    github: 'UPBGE/upbge', prerelease: true,
  },
];

// Trending add-on discovery (GitHub Search). Repos already in TOOLS are skipped.
export const DISCOVERY = {
  topics: ['blender-addon', 'blender-extension', 'blender-add-on', 'blender-plugin', 'blender-addons'],
  minStars: 150,
  maxIdleDays: 45,
  maxReleaseAgeDays: 60,
  keepDays: 10,
  max: 24,
  allow: [],
  deny: [],
  names: { 'scenario-labs/blender-plugin': 'Scenario for Blender', 'blenderkit/blendkit': 'BlendKit' },
};

// Hacker News: Blender stories, attributed to tools by name.
export const HN_QUERIES = ['blender', 'blender 3d', 'blender foundation'];
export const HN_MATCH = {
  blender: /\bblender\b/i,
  bforartists: /\bbforartists\b/i,
  upbge: /\bupbge\b/i,
  flamenco: /\bflamenco\b.*\b(render|blender)\b/i,
};

// Articles, videos and community threads. relevant: must look Blender-related (sites that cover more than Blender).
const BLENDER = /\bblender\b|\bcycles\b|\beevee\b|geometry nodes|grease pencil/i;
export const NEWS_FEEDS = [
  { url: 'https://www.blendernation.com/feed/', name: 'BlenderNation', type: 'article' },
  { url: 'https://www.blender.org/feed/', name: 'blender.org', type: 'article', official: true },
  { url: 'https://code.blender.org/feed/', name: 'Developer Blog', type: 'article', official: true },
  { url: 'https://www.cgchannel.com/feed/', name: 'CG Channel', type: 'article', relevant: BLENDER },
  { url: 'https://80.lv/feed/', name: '80 Level', type: 'article', relevant: BLENDER },
  { url: 'https://blenderartists.org/top.rss', name: 'BlenderArtists', type: 'thread' },
  { url: 'https://devtalk.blender.org/latest.rss', name: 'Developer Forum', type: 'thread' },
  { url: 'https://www.reddit.com/r/blender/top/.rss?t=week', name: 'r/blender', type: 'thread' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCSMOQeBJ2RAnuFungnQOxLg', name: 'Blender', type: 'video', official: true },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCOKHwx1VCdgnxwbjyb9Iu1g', name: 'Blender Guru', type: 'video' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCG8AxMVa6eutIGxrdnDxWpQ', name: 'CG Geek', type: 'video' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZFUrFoqvqlN8seaAeEwjlw', name: 'Grant Abbitt', type: 'video' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbmxZRQk-X0p-TOxd6PEYJA', name: 'Ian Hubert', type: 'video' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCIXjev1_mJ1plJhF9lGarQg', name: 'Ryan King Art', type: 'video' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCy1f4m64dwCwk8CBZ_vHfPg', name: 'CGMatter', type: 'video' },
];
