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
import finalOverdrive from './final-overdrive.js';

export const MAPS = [
  tutorial, neonDrift, nightTunnel, canyonRun, overclock, dataCore,
  skylineRush, vaporCoast, crystalCave, orbital, finalOverdrive,
].map((f) => f());
export const getMap = (id) => MAPS.find((m) => m.id === id);

/** A map is unlocked when every map in its unlock.after list has a finished time. */
export function isUnlocked(map, hasFinished) {
  return !map.unlock || map.unlock.after.every((id) => hasFinished(id));
}
