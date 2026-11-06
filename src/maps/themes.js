// Theme definitions: environment, scenery, ramp palette and the per-map
// setup each theme needs (terrain fall height, sea level, city blocks...).
import { MapBuilder, addCourse, addCity, COLORS } from './builder.js';
import { generateCourse, TIER } from './generator.js';

const P = {
  pink: [1.0, 0.45, 0.75], teal: [0.2, 1.0, 0.85], lilac: [0.75, 0.55, 1.0], gold: [1.0, 0.8, 0.25],
  jade: [0.2, 1.0, 0.6], ice: [0.45, 0.85, 1.0], steel: [0.55, 0.65, 0.85], magma: [1.0, 0.35, 0.08], ember: [1.0, 0.65, 0.2],
  torch: [1.0, 0.6, 0.25], moon: [0.75, 0.8, 1.0],
};

export const THEMES = [
  {
    id: 'beach', label: 'Beach', blurb: 'Wild sunset coastline',
    palette: [P.pink, P.teal, P.lilac], platform: P.teal,
    env: () => ({ floorMode: 'sea', mountains: false, fogColor: [0.5, 0.18, 0.38], fogNear: 14000, fogFar: 90000 }),
    theme: (seed) => ({ type: 'beach', seed, sandDrop: 700 }),
    post: (b) => {
      const low = Math.min(...b.map.line.map((e) => e.p[1] - e.height));
      const seaY = low - 700 - 60;
      b.map.theme.seaY = seaY; b.map.env.floorAbs = seaY; b.map.waterY = seaY + 110; b.map.groundDrop = 700;
    },
  },
  {
    id: 'canyon', label: 'Canyon', blurb: 'Red rock under a desert moon',
    palette: [COLORS.yellow, COLORS.orange, COLORS.red], platform: COLORS.orange, forks: false,
    tunnel: { side: 520, top: 1600, bottom: 900, ceiling: false, hidden: true, color: COLORS.orange },
    needle: { color: [0.6, 0.3, 0.15], edge: 1.6 },
    env: () => ({ sky: 'desert', mountains: false, floor: false, fogColor: [0.06, 0.04, 0.1], fogNear: 7000, fogFar: 50000 }),
    theme: (seed) => ({ type: 'canyon', seed }),
  },
  {
    id: 'cave', label: 'Cave', blurb: 'Crystals and an underground river',
    palette: [P.ice, COLORS.cyan, COLORS.purple], platform: P.ice, forks: false,
    tunnel: { side: 360, top: 700, bottom: 600, ceiling: true, hidden: true, color: [0.25, 0.5, 0.9] },
    needle: { color: [0.35, 0.55, 0.9], edge: 1.6 },
    env: () => ({ sky: false, mountains: false, floor: false, fogColor: [0.0, 0.015, 0.03], fogNear: 2500, fogFar: 17000 }),
    theme: (seed) => ({ type: 'cave', seed }),
  },
  {
    id: 'city', label: 'City', blurb: 'Neon towers and street traffic',
    palette: [COLORS.magenta, COLORS.cyan, COLORS.yellow, COLORS.purple], platform: COLORS.magenta,
    needle: { color: [0.2, 0.9, 1.0], edge: 1.4 },
    env: () => ({ mountains: false, floorMode: 'city', fogColor: [0.1, 0.02, 0.16], fogNear: 7000, fogFar: 60000 }),
    theme: (seed) => ({ type: 'city', seed }),
    post: (b, seed) => {
      const minY = Math.min(...b.map.line.map((e) => e.p[1] - e.height));
      const streetY = minY - 3500;
      addCity(b.map, { seed, streetY, grid: 3000 });
      b.map.theme.streetY = streetY; b.map.env.floorAbs = streetY;
    },
  },
  {
    id: 'station', label: 'Space Station', blurb: 'Corridors, scaffolds, low gravity',
    palette: [COLORS.cyan, P.steel, COLORS.magenta], platform: COLORS.cyan, tunnelToggle: true,
    tunnel: { side: 380, top: 720, bottom: 600, ceiling: true, hidden: true, color: P.steel },
    needle: { color: P.steel, edge: 1.2 },
    cvars: { gravity: 650 },
    env: () => ({ sky: 'space', mountains: false, floor: false, fogColor: [0.01, 0.01, 0.03], fogNear: 15000, fogFar: 80000 }),
    theme: (seed) => ({ type: 'station', seed }),
  },
  {
    id: 'servers', label: 'Server Farm', blurb: 'LED racks and data streams',
    palette: [COLORS.green, COLORS.cyan], platform: COLORS.green, forks: false, jumpScale: 0.75, // low ceiling
    tunnel: { side: 300, top: 600, bottom: 550, ceiling: true, hidden: true, color: COLORS.green },
    needle: { color: [0.15, 0.8, 0.45], edge: 1.5 },
    env: () => ({ sky: false, mountains: false, floor: false, fogColor: [0.0, 0.025, 0.02], fogNear: 2000, fogFar: 14000 }),
    theme: (seed) => ({ type: 'servers', seed }),
  },
  {
    id: 'jungle', label: 'Jungle', blurb: 'Giant trees, ruins and fireflies',
    palette: [P.jade, P.gold, COLORS.cyan], platform: P.gold,
    needle: { color: [0.35, 0.8, 0.45], edge: 1.4 },
    env: () => ({ sky: 'desert', mountains: false, floor: false, fogColor: [0.02, 0.06, 0.045], fogNear: 5000, fogFar: 42000 }),
    theme: (seed) => ({ type: 'jungle', seed, groundDrop: 900 }),
    post: (b) => { b.map.groundDrop = 900; },
  },
  {
    id: 'volcano', label: 'Volcano', blurb: 'Lava rivers and falling ash',
    palette: [P.magma, P.ember], platform: P.ember,
    needle: { color: [0.6, 0.2, 0.06], edge: 1.6 },
    env: () => ({ sky: 'volcanic', mountains: false, floor: false, fogColor: [0.13, 0.03, 0.02], fogNear: 6000, fogFar: 52000 }),
    theme: (seed) => ({ type: 'volcano', seed, groundDrop: 800 }),
    post: (b) => { b.map.groundDrop = 800; },
  },
  {
    id: 'vortex', label: 'Warp', blurb: 'Light tunnels through deep space',
    palette: [COLORS.magenta, COLORS.cyan, COLORS.purple], platform: COLORS.cyan,
    needle: { color: [1.0, 0.3, 0.9], edge: 1.6 },
    env: () => ({ sky: 'space', mountains: false, floor: false, fogColor: [0.03, 0.0, 0.06], fogNear: 15000, fogFar: 75000 }),
    theme: (seed) => ({ type: 'vortex', seed }),
  },
  {
    id: 'castle', label: 'Castle', blurb: 'Weave through a moonlit fortress',
    palette: [P.torch, P.moon, COLORS.purple], platform: [0.6, 0.6, 0.7],
    needle: { color: [0.42, 0.42, 0.46], edge: 0.35, kind: 'wall', lintel: 900, castle: true },
    env: () => ({ sky: 'desert', mountains: false, floor: false, fogColor: [0.05, 0.06, 0.1], fogNear: 6000, fogFar: 48000 }),
    theme: (seed) => ({ type: 'castle', seed, groundDrop: 900 }),
    post: (b) => { b.map.groundDrop = 900; },
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id);

/** Looks for the set pieces you pass through (interior walls, ribs, blocks). */
export const STRUCTURES = {
  temple: { wallColor: [0.42, 0.45, 0.32], ribColor: [1.0, 0.6, 0.2], blockColor: [0.5, 0.52, 0.4] },
  ruin: { wallColor: [0.3, 0.38, 0.28], ribColor: [0.4, 1.0, 0.5], blockColor: [0.42, 0.46, 0.36] },
  hall: { wallColor: [0.4, 0.4, 0.45], ribColor: [1.0, 0.55, 0.2], blockColor: [0.48, 0.46, 0.5] },
  hangar: { wallColor: [0.45, 0.5, 0.6], ribColor: [0.3, 0.9, 1.0], blockColor: [0.6, 0.62, 0.7] },
  vault: { wallColor: [0.12, 0.2, 0.16], ribColor: [1.0, 0.25, 0.2], blockColor: [0.2, 0.3, 0.25] },
  atrium: { wallColor: [0.15, 0.2, 0.35], ribColor: [1.0, 0.3, 0.85], blockColor: [0.25, 0.7, 0.9] },
  lavatube: { wallColor: [0.12, 0.07, 0.07], ribColor: [1.0, 0.4, 0.08], blockColor: [0.18, 0.1, 0.1] },
  seacave: { wallColor: [0.35, 0.2, 0.3], ribColor: [0.3, 1.0, 0.9], blockColor: [0.9, 0.45, 0.55] },
  crystal: { wallColor: [0.2, 0.25, 0.4], ribColor: [0.5, 0.9, 1.0], blockColor: [0.45, 0.75, 1.0] },
  glowworm: { wallColor: [0.1, 0.12, 0.16], ribColor: [0.3, 0.8, 1.0], blockColor: [0.2, 0.25, 0.3] },
  sandstone: { wallColor: [0.5, 0.25, 0.15], ribColor: [1.0, 0.6, 0.3], blockColor: [0.7, 0.4, 0.25] },
  warpgate: { wallColor: [0.15, 0.05, 0.25], ribColor: [1.0, 0.3, 0.9], blockColor: [0.4, 0.9, 1.0] },
};

/** Build one generated map for a theme and tier. */
export function generatedMap(themeId, tier, { id, name, description, seed, twist = {} }) {
  const th = themeById(themeId);
  const T = TIER[tier];
  // each map gets its own slightly shifted fog/sky tint so a theme's maps don't look cloned
  const env = th.env(seed);
  if (env.fogColor) {
    const j = (k) => 0.82 + (((seed * (k + 3) * 2654435761) >>> 0) % 1000) / 1000 * 0.36;
    env.fogColor = env.fogColor.map((c, k) => Math.min(1, c * j(k)));
  }
  const b = new MapBuilder(id, name, {
    difficulty: tier, description,
    env, theme: th.theme(seed), cvars: twist.gravity ? { ...(th.cvars || {}), gravity: twist.gravity } : th.cvars || null,
  });
  const tw = { ...twist };
  if (tw.structure) tw.structure = { ...tw.structure, opts: { ...STRUCTURES[tw.structure.kind], ...(tw.structure.opts || {}) } };
  addCourse(b, {
    ramp: { width: T.width, height: Math.round(T.width * 1.45), color: th.palette[0], minSpeed: T.minSpeed, tunnel: th.tunnel || null },
    platformColor: th.platform,
    build: (c) => generateCourse(c, {
      seed, tier, palette: th.palette, needle: th.needle, forks: th.forks !== false, jumpScale: th.jumpScale, twist: tw,
      tunnel: th.tunnel || null, tunnelToggle: !!th.tunnelToggle,
    }),
  });
  if (th.post) th.post(b, seed);
  b.map.twist = twist.label || null;
  return b.build();
}
