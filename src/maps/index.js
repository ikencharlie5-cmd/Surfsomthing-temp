import tutorial from './tutorial.js';
import neonDrift from './neon-drift.js';
import nightTunnel from './night-tunnel.js';
import canyonRun from './canyon-run.js';
import overclock from './overclock.js';
import dataCore from './data-core.js';

export const MAPS = [tutorial, neonDrift, nightTunnel, canyonRun, overclock, dataCore].map((f) => f());
export const getMap = (id) => MAPS.find((m) => m.id === id);
