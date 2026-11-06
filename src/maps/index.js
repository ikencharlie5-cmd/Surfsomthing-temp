// Map registry: 10 themes x 5 difficulty tiers. Within a theme the easy map
// is open and each harder map unlocks after finishing the one before it.
// Every map has a twist that matches its name (see `twist`).
import tutorial from './tutorial.js';
import lostTemple from './lost-temple.js';
import theKeep from './the-keep.js';
import { buildInteriorMap, INTERIORS } from './interiors.js';
import { THEMES, themeById, generatedMap } from './themes.js';
import { TIERS } from './generator.js';

// The hand-built tutorial gets the beach look.
function restyle(map, themeId, seed) {
  const th = themeById(themeId);
  map.env = th.env(seed);
  map.theme = th.theme(seed);
  if (th.cvars) map.cvars = th.cvars;
  if (th.post) th.post({ map }, seed);
  map.twist = 'Tutorial hints';
  return map;
}

/** G(theme, tier, id, name, description, twist, seed) */
const G = (theme, tier, id, name, description, twist, seed) => () => generatedMap(theme, tier, { id, name, description, seed, twist });

const PACKS = {
  beach: [
    () => restyle(tutorial(), 'beach', 101),
    () => buildInteriorMap(INTERIORS.beach),
    G('beach', 'hard', 'beach-riptide', 'Riptide', 'Rip currents drag you sideways: constant side switches and shifting gaps.', { label: 'Side switches', switchP: 0.65, sections: 1 }, 72374),
    G('beach', 'expert', 'beach-coral-crown', 'Coral Crown', 'Duck and dodge through a coral sea cave, then thread the reef arches.', { label: 'Sea cave', structure: { kind: 'seacave' }, needles: 1 }, 325783),
    G('beach', 'insane', 'beach-tsunami', 'Tsunami', 'Giant rolling wave ramps and sudden plunges.', { label: 'Giant waves', waveP: 0.6, waveAmp: 1.8, plungeP: 0.15 }, 903871),
    G('beach', 'extreme', 'beach-rogue-wave', 'Rogue Wave', 'Kick off monster waves into double needles. Long, fast, brutal.', { label: 'Wave kickers', waveP: 0.35, waveAmp: 1.6 }, 587112),
  ],
  canyon: [
    G('canyon', 'easy', 'canyon-dust-devil', 'Dust Devil', 'Get caught in the whirlwind: a long corkscrew down the canyon.', { label: 'Spiral', spiral: 1 }, 41696),
    () => buildInteriorMap(INTERIORS.canyon),
    G('canyon', 'hard', 'canyon-mesa-mirage', 'Mesa Mirage', 'Rock gates to thread between towering mesas.', { label: 'Rock gates', needles: 2 }, 2103),
    G('canyon', 'expert', 'canyon-rattlesnake-pass', 'Rattlesnake Pass', 'A snaking pass: back-to-back side switches and wiggling ramps.', { label: 'Slalom', switchP: 0.7, waveP: 0.3, waveAmp: 1.3 }, 81294),
    G('canyon', 'insane', 'canyon-badlands', 'Badlands', 'Huge jumps across bottomless chasms.', { label: 'Long jumps', jumps: 2 }, 160485),
    G('canyon', 'extreme', 'canyon-grand-chasm', 'Grand Chasm', 'Launch across the biggest gaps in the desert, threading rock gates mid-air.', { label: 'Chasm launches', jumps: 1 }, 667302),
  ],
  cave: [
    G('cave', 'easy', 'cave-echo-hollow', 'Echo Hollow', 'Duck under stalactites and dodge stalagmites in a hollow cavern.', { label: 'Duck & dodge', dodge: 1 }, 3101),
    () => buildInteriorMap(INTERIORS.cave),
    G('cave', 'hard', 'cave-glowworm-grotto', 'Glowworm Grotto', 'A grotto lit by glowworms, with narrow rock windows to thread.', { label: 'Glowworm grotto', structure: { kind: 'glowworm' }, needles: 1 }, 3103),
    G('cave', 'expert', 'cave-the-deep', 'The Deep', 'Plunge after plunge, deeper into the dark.', { label: 'Plunges', plungeP: 0.5 }, 3104),
    G('cave', 'insane', 'cave-abyssal-drop', 'Abyssal Drop', 'Leap across the abyss. Huge jumps, steep drops.', { label: 'Abyss jumps', jumps: 2, plungeP: 0.3 }, 280270),
    G('cave', 'extreme', 'cave-underworld', 'Underworld', 'Crystal chambers and kicker jumps through the deepest dark.', { label: 'Underworld', structure: { kind: 'crystal' } }, 565355),
  ],
  city: [
    G('city', 'easy', 'neon-drift', 'Neon Drift', 'Drift over flowing wave ramps between the towers.', { label: 'Wave ramps', waveP: 0.45 }, 4101),
    () => buildInteriorMap(INTERIORS.city),
    G('city', 'hard', 'city-rooftop-run', 'Rooftop Run', 'Leap from rooftop to rooftop across the avenues.', { label: 'Rooftop jumps', jumps: 2 }, 83293),
    G('city', 'expert', 'city-downtown-blitz', 'Downtown Blitz', 'Dodge billboards and signs bolted across the ramps.', { label: 'Duck & dodge', dodge: 2, needles: -2, forks: -2 }, 99132),
    G('city', 'insane', 'city-megacity', 'Megacity', 'Blast straight through the atriums of two megatowers.', { label: 'Megatower atriums', structure: { kind: 'atrium', count: 2 }, needles: -2, jumps: -1, forks: -2 }, 400055),
    G('city', 'extreme', 'city-neon-apocalypse', 'Neon Apocalypse', 'Kick off the skyline and thread two signs in one jump.', { label: 'Skyline kickers', boost: 1 }, 1033576),
  ],
  station: [
    G('station', 'easy', 'station-docking-bay', 'Docking Bay', 'Fly through the docking hangar, dodging cargo.', { label: 'Hangar', structure: { kind: 'hangar' } }, 20939),
    () => buildInteriorMap(INTERIORS.station),
    G('station', 'hard', 'orbital', 'Orbital', 'Swing a full orbit around the station.', { label: 'Orbit spiral', spiral: 1 }, 100131),
    G('station', 'expert', 'station-zero-g', 'Zero-G', 'Gravity is almost gone: floaty, enormous jumps.', { label: 'Very low gravity', gravity: 420, jumps: 1 }, 36780),
    G('station', 'insane', 'station-event-horizon', 'Event Horizon', 'Spiral toward the black hole, threading the hatches.', { label: 'Gravity well spiral', spiral: 1, boost: 1, needles: -2, jumps: -1, forks: -2 }, 5105),
    G('station', 'extreme', 'station-supernova', 'Supernova', 'Low-gravity kickers into the blast: huge, floaty, double-needle jumps.', { label: 'Supernova jumps', gravity: 560 }, 377299),
  ],
  servers: [
    G('servers', 'easy', 'night-tunnel', 'Night Tunnel', 'Duck the cable bundles strung across the shaft.', { label: 'Duck & dodge', dodge: 1 }, 29858),
    () => buildInteriorMap(INTERIORS.servers),
    G('servers', 'hard', 'data-core', 'Data Core', 'Break into the core vault and dodge its server blocks.', { label: 'Core vault', structure: { kind: 'vault' } }, 61536),
    G('servers', 'expert', 'servers-firewall', 'Firewall', 'Thread the firewall at speed.', { label: 'Firewall slots', needles: 2 }, 45699),
    G('servers', 'insane', 'servers-kernel-panic', 'Kernel Panic', 'Everything glitches: side switches, blocks and boosts.', { label: 'Chaos', switchP: 0.7, dodge: 1, boost: 1 }, 552516),
    G('servers', 'extreme', 'servers-blue-screen', 'Blue Screen', 'Crash through the vault and launch over the server stacks.', { label: 'Fatal error', structure: { kind: 'vault', blocks: 2 } }, 4171500),
  ],
  jungle: [
    G('jungle', 'easy', 'jungle-canopy-glide', 'Canopy Glide', 'Glide over rolling treetop waves.', { label: 'Canopy waves', waveP: 0.5, waveAmp: 1.2 }, 15020),
    lostTemple,
    G('jungle', 'hard', 'jungle-serpent-river', 'Serpent River', 'Follow the serpent: winding side switches over the river.', { label: 'Serpent slalom', switchP: 0.65, waveP: 0.35 }, 117969),
    G('jungle', 'expert', 'jungle-jaguar-ruins', 'Jaguar Ruins', 'Dodge fallen pillars and thread the ruined gates.', { label: 'Ruin dodge', dodge: 2 }, 1480038),
    G('jungle', 'insane', 'jungle-green-hell', 'Green Hell', 'An overgrown ruin to duck through, then huge leaps.', { label: 'Overgrown ruin', structure: { kind: 'ruin' }, jumps: 1 }, 1012818),
    G('jungle', 'extreme', 'jungle-temple-of-doom', 'Temple of Doom', 'Run the temple, then leap the ravines through ruined gates.', { label: 'Temple of doom', structure: { kind: 'temple', blocks: 2 } }, 2153155),
  ],
  volcano: [
    G('volcano', 'easy', 'volcano-ash-fields', 'Ash Fields', 'Rolling waves of cooled ash.', { label: 'Ash waves', waveP: 0.4 }, 8101),
    () => buildInteriorMap(INTERIORS.volcano),
    G('volcano', 'hard', 'magma-run', 'Magma Run', 'Dive through a glowing lava tube.', { label: 'Lava tube', structure: { kind: 'lavatube' } }, 118969),
    G('volcano', 'expert', 'volcano-pyroclast', 'Pyroclast', 'Eruption boosts and huge jumps over rivers of fire.', { label: 'Eruption jumps', jumps: 2, boost: 1 }, 285269),
    G('volcano', 'insane', 'volcano-caldera', 'Caldera', 'Plunge down into the caldera.', { label: 'Caldera plunges', plungeP: 0.45, jumps: 1, needles: -1 }, 142728),
    G('volcano', 'extreme', 'volcano-eruption', 'Eruption', 'Blast off erupting kickers over a sea of lava.', { label: 'Eruption launches', boost: 1, plungeP: 0.2 }, 1053414),
  ],
  vortex: [
    G('vortex', 'easy', 'vortex-warp-lane', 'Warp Lane', 'Boost rings light the way through the warp.', { label: 'Boost rings', boost: 3 }, 17020),
    () => buildInteriorMap(INTERIORS.vortex),
    G('vortex', 'hard', 'vortex-lightspeed', 'Lightspeed', 'Boost to lightspeed, then make the long warp jumps.', { label: 'Boost jumps', boost: 2, jumps: 1 }, 48698),
    G('vortex', 'expert', 'final-overdrive', 'Final Overdrive', 'Overdrive through a warp gate corridor, boosts all the way.', { label: 'Warp gate', structure: { kind: 'warpgate' }, boost: 2 }, 1054412),
    G('vortex', 'insane', 'vortex-singularity', 'Singularity', 'Spiral into the singularity through tightening gates.', { label: 'Death spiral', spiral: 1, needles: -3, jumps: -2, forks: -2, boost: 1 }, 2266020),
    G('vortex', 'extreme', 'vortex-big-bang', 'Big Bang', 'The end of everything: the fastest, longest warp run there is.', { label: 'Big bang', boost: 2 }, 943548),
  ],
  castle: [
    G('castle', 'easy', 'castle-gatehouse', 'Gatehouse', 'Ride through the gatehouse and along the walls.', { label: 'Gates', needles: 1 }, 10101),
    theKeep,
    G('castle', 'hard', 'castle-moonlit-keep', 'Moonlit Keep', 'Ride right through the great hall of the keep.', { label: 'Great hall', structure: { kind: 'hall' } }, 97212),
    G('castle', 'expert', 'castle-dragon-spire', 'Dragon Spire', 'Leap between spires and thread narrow portcullises.', { label: 'Spire jumps', jumps: 1, needles: 1 }, 453568),
    G('castle', 'insane', 'castle-siege', 'Siege', 'Storm the hall, dodge the barricades, break through the gates.', { label: 'Full siege', structure: { kind: 'hall' }, dodge: 1, boost: 1 }, 1205874),
    G('castle', 'extreme', 'castle-dragons-lair', 'Dragonfire Lair', 'Through the great hall, then leap the towers threading two gates at once.', { label: 'Dragon leaps', structure: { kind: 'hall' } }, 912872),
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
