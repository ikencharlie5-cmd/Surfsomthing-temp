// Map registry: 10 themes x 5 difficulty tiers. Within a theme the easy map
// is open and each harder map unlocks after finishing the one before it.
import tutorial from './tutorial.js';
import neonDrift from './neon-drift.js';
import nightTunnel from './night-tunnel.js';
import canyonRun from './canyon-run.js';
import overclock from './overclock.js';
import dataCore from './data-core.js';
import skylineRush from './skyline-rush.js';
import vaporCoast from './vapor-coast.js';
import crystalCave from './crystal-cave.js';
import orbital from './orbital.js';
import lostTemple from './lost-temple.js';
import magmaRun from './magma-run.js';
import finalOverdrive from './final-overdrive.js';
import { THEMES, themeById, generatedMap } from './themes.js';
import { TIERS } from './generator.js';

// Hand-built maps that predate their theme get its look applied.
function restyle(map, themeId, seed) {
  const th = themeById(themeId);
  map.env = th.env(seed);
  map.theme = th.theme(seed);
  if (th.cvars) map.cvars = th.cvars;
  if (th.post) th.post({ map }, seed);
  return map;
}

const G = (theme, tier, id, name, description, seed) => () => generatedMap(theme, tier, { id, name, description, seed });

/** Per theme, the five maps from easy to insane. */
const PACKS = {
  beach: [
    () => restyle(tutorial(), 'beach', 101),
    vaporCoast,
    G('beach', 'hard', 'beach-riptide', 'Riptide', 'Long dune runs and the first slots to thread above the surf.', 24860),
    G('beach', 'expert', 'beach-coral-crown', 'Coral Crown', 'Thin ramps along the reef, long jumps over the lagoon.', 333702),
    G('beach', 'insane', 'beach-tsunami', 'Tsunami', 'The coast at full speed: tight slots, huge jumps, no mercy.', 389136),
  ],
  canyon: [
    G('canyon', 'easy', 'canyon-dust-devil', 'Dust Devil', 'A gentle first ride down a moonlit canyon.', 2101),
    canyonRun,
    G('canyon', 'hard', 'canyon-mesa-mirage', 'Mesa Mirage', 'Rock gates to thread between towering mesas.', 2103),
    G('canyon', 'expert', 'canyon-rattlesnake-pass', 'Rattlesnake Pass', 'Twisting narrows and long jumps over the riverbed.', 2104),
    G('canyon', 'insane', 'canyon-badlands', 'Badlands', 'The longest, tightest canyon run there is.', 144647),
  ],
  cave: [
    G('cave', 'easy', 'cave-echo-hollow', 'Echo Hollow', 'A wide, glowing cavern to learn the dark.', 3101),
    crystalCave,
    G('cave', 'hard', 'cave-glowworm-grotto', 'Glowworm Grotto', 'Narrow rock windows deep underground.', 3103),
    G('cave', 'expert', 'cave-the-deep', 'The Deep', 'Long falls into the dark and tight crystal slots.', 3104),
    G('cave', 'insane', 'cave-abyssal-drop', 'Abyssal Drop', 'Thread the abyss. Thin ramps, tiny gaps.', 106052),
  ],
  city: [
    () => restyle(neonDrift(), 'city', 4101),
    skylineRush,
    G('city', 'hard', 'city-rooftop-run', 'Rooftop Run', 'Slip between towers through glowing sign frames.', 4103),
    G('city', 'expert', 'city-downtown-blitz', 'Downtown Blitz', 'Long jumps across avenues, tight slots downtown.', 91213),
    G('city', 'insane', 'city-megacity', 'Megacity', 'An endless skyline at maximum speed.', 439650),
  ],
  station: [
    G('station', 'easy', 'station-docking-bay', 'Docking Bay', 'Float out of the docking bay into open space.', 5101),
    () => restyle(overclock(), 'station', 5102),
    orbital,
    G('station', 'expert', 'station-zero-g', 'Zero-G', 'Hatches to thread and huge low-gravity jumps.', 84294),
    G('station', 'insane', 'station-event-horizon', 'Event Horizon', 'The station at the edge of everything.', 646544),
  ],
  servers: [
    nightTunnel,
    G('servers', 'medium', 'servers-packet-storm', 'Packet Storm', 'Data streams and your first firewall slots.', 6102),
    dataCore,
    G('servers', 'expert', 'servers-firewall', 'Firewall', 'Thread the firewall at speed.', 6104),
    G('servers', 'insane', 'servers-kernel-panic', 'Kernel Panic', 'Everything at once, deep in the core.', 69457),
  ],
  jungle: [
    G('jungle', 'easy', 'jungle-canopy-glide', 'Canopy Glide', 'Glide over the treetops in the moonlight.', 15020),
    lostTemple,
    G('jungle', 'hard', 'jungle-serpent-river', 'Serpent River', 'Follow the winding river through stone ruins.', 15022),
    G('jungle', 'expert', 'jungle-jaguar-ruins', 'Jaguar Ruins', 'Ancient gates to thread, long leaps over the falls.', 474325),
    G('jungle', 'insane', 'jungle-green-hell', 'Green Hell', 'The deepest, fastest jungle run.', 284270),
  ],
  volcano: [
    G('volcano', 'easy', 'volcano-ash-fields', 'Ash Fields', 'A first ride over cooling lava fields.', 8101),
    G('volcano', 'medium', 'volcano-obsidian-slopes', 'Obsidian Slopes', 'Glassy black slopes and obsidian gates.', 16021),
    magmaRun,
    G('volcano', 'expert', 'volcano-pyroclast', 'Pyroclast', 'Huge jumps over rivers of fire.', 8104),
    G('volcano', 'insane', 'volcano-caldera', 'Caldera', 'Down into the caldera at full speed.', 633706),
  ],
  vortex: [
    G('vortex', 'easy', 'vortex-warp-lane', 'Warp Lane', 'Your first trip through the light rings.', 9101),
    G('vortex', 'medium', 'vortex-hyperdrive', 'Hyperdrive', 'Faster rings and light gates to thread.', 40778),
    G('vortex', 'hard', 'vortex-lightspeed', 'Lightspeed', 'Long warp jumps between the rings.', 32860),
    finalOverdrive,
    G('vortex', 'insane', 'vortex-singularity', 'Singularity', 'The end of the line. Survive the singularity.', 998980),
  ],
  castle: [
    G('castle', 'easy', 'castle-gatehouse', 'Gatehouse', 'Ride through the gatehouse and along the walls.', 10101),
    G('castle', 'medium', 'castle-battlements', 'Battlements', 'Weave past towers and through archways.', 25940),
    G('castle', 'hard', 'castle-moonlit-keep', 'Moonlit Keep', 'Thread the keep\'s gates under the moon.', 25941),
    G('castle', 'expert', 'castle-dragon-spire', 'Dragon Spire', 'Leap between spires, thread narrow portcullises.', 239755),
    G('castle', 'insane', 'castle-siege', 'Siege', 'The whole fortress, at full tilt.', 477326),
  ],
};

export const MAPS = [];
for (const th of THEMES) {
  let prev = null;
  PACKS[th.id].forEach((make, i) => {
    const m = make();
    m.group = th.id;
    m.difficulty = TIERS[i];
    m.unlock = prev ? { after: [prev.id] } : null;
    MAPS.push(m);
    prev = m;
  });
}
export { THEMES };
export const getMap = (id) => MAPS.find((m) => m.id === id);

/** A map is unlocked when every map in its unlock.after list has a finished time. */
export function isUnlocked(map, hasFinished) {
  return !map.unlock || map.unlock.after.every((id) => hasFinished(id));
}
