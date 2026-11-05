import tutorial from './tutorial.js';
import neonDrift from './neon-drift.js';
import overclock from './overclock.js';

export const MAPS = [tutorial, neonDrift, overclock].map((f) => f());
export const getMap = (id) => MAPS.find((m) => m.id === id);
