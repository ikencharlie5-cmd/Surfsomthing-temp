# Slipstream: neon surf

A browser surf game inspired by the Counter-Strike surf game mode. Slide along
angled ramps, air-strafe to steer and build speed, and chase your own ghost
through a synthwave world. It runs in Chrome with nothing to install, so it
works on a Chromebook.

## Play

- **Online:** once GitHub Pages is enabled (see below), the game is at
  `https://<your-username>.github.io/<repo-name>/`.
- **Locally:** any static web server works. ES modules don't load from
  `file://`, so double-clicking `index.html` won't work.

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Controls

| Action | Default |
| --- | --- |
| Move / strafe | `W` `A` `S` `D` |
| Jump (hold to bunny-hop) | `Space` |
| Restart run | `R` |
| Back to last checkpoint | `T` |
| Toggle PB ghost | `G` |
| Pause / menu | `Esc` |

All keys can be rebound in **Settings**. Jump can also go on the mouse wheel.

### How to surf

1. **Don't hold W on a ramp.** Surfing uses the strafe keys and the mouse.
2. **Hold the key toward the ramp.** Ramp on your right? Hold `D`.
3. **Too high? Ease off.** Holding too long climbs you over the top.
4. **Follow the ramp with your mouse**, especially on curves.
5. **Air strafe:** in the air, hold `A` and move the mouse left (or `D` and right).
   Matching the key to the mouse direction is your *sync* %.
6. **Keep your momentum.** Every map starts with a big curved drop-in to build
   speed, then flows as one continuous line. Stay above 1200 u/s to grow a
   **speed combo** (x1 to x10). Slamming into a ramp or clipping an edge
   **scrubs** speed and breaks the combo.

Start with **First Wave**, the tutorial map. It shows hints at each stage.

## What's in it

- **Source-style movement:** air-accelerate with the 30-unit air speed cap,
  surfable slopes (normal < 0.7), ClipVelocity sliding, Source-style gravity
  steps, auto-bhop, a 100-tick fixed timestep, and rendering interpolated
  between ticks.
- **Exact collision:** ramps are convex brushes. Box traces use the brush's
  Minkowski sum with the player box (face, axis and edge-bevel planes), so you
  don't snag on seams between ramp segments.
- **Eleven continuous momentum maps.** None of them teleport you, so you
  never lose speed between sections. Each starts with a steep drop-in that
  flattens out, so you start with speed. Fall and you respawn standing still
  at the last checkpoint (the spinning diamond). Five maps are **earned** by
  finishing others.

  | Map | Difficulty | Space | Unlock |
  | --- | --- | --- | --- |
  | First Wave | tutorial | open sky, with hints | open |
  | Neon Drift | easy | open sky, 1 fast line | open |
  | Night Tunnel | medium | fully enclosed ribbed tunnel | open |
  | Canyon Run | medium | tall canyon walls, red sky | open |
  | Overclock | hard | open sky, thin ramps, 2 fast lines | open |
  | Data Core | hard | tight enclosed shaft | open |
  | Skyline Rush | medium | neon city, lit towers | finish Neon Drift |
  | Vapor Coast | easy | pastel sunset over an ocean | finish Night Tunnel |
  | Crystal Cave | medium | enclosed ice cave, glowing crystals | finish Canyon Run |
  | Orbital | hard | space station + open space, lower gravity | finish Overclock |
  | Final Overdrive | expert | everything: open, canyon, tunnel, 3 fast lines | finish Data Core, Orbital and Crystal Cave |
- **Fast lines:** at some gaps, a long jump straight ahead lands directly on a
  later ramp, but only if you're carrying enough speed. Slower riders take a
  safe detour to the side.
- **Endless mode:** a seeded procedural course that starts with a curved
  drop-in, streams in as you go and gets harder (thinner ramps, longer gaps,
  side shifts). It controls speed with climbs, scores ramps cleared and your
  best combo, and has random and daily seeds.
- **Ghosts and records:** your personal-best run replays as a ghost. The top-10
  local leaderboard per map shows stage splits compared to your PB.
- **HUD:** speed, timer, checkpoint, strafe sync %, split deltas, speed combo,
  scrub warnings, a 6-second speed graph (scrubs marked in red), key display.
- **Visuals:** striped synthwave sun, wireframe mountains, glowing grid floor,
  neon-edged glass ramps, glowing tunnel ribs, per-map fog and lighting, bloom,
  speed particles and streaks, and a slight FOV widening at speed. **Auto quality** lowers the settings on slow machines unless you pick
  a quality yourself.
- **Audio:** everything is synthesized with WebAudio: wind that rises with
  speed, ramp hiss, game sounds, and a procedural synthwave soundtrack.

## Turning on GitHub Pages

1. Merge this work into `main`.
2. In the repository, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. The `Test and deploy to GitHub Pages` workflow runs the tests, then
   publishes the site on every push to `main`.

## Development

There's no build step. The code is plain ES modules, and three.js (r187) is
vendored in `vendor/three`.

```
index.html, style.css     page shell and UI styles
src/main.js               app state machine and main loop
src/game.js               runs, timer, stages, ghosts, endless streaming
src/physics/              vectors, convex brushes, traces, Source movement
src/maps/                 map builder and course helpers, the maps, endless generator
src/sim/bot.js            surf bot (menu background + map validation)
src/render/               renderer, environment shaders, ramp meshes
src/audio.js              synthesized SFX and music
src/ui.js, src/input.js   menus, settings, HUD, keyboard/mouse
test/                     node tests
```

Run the tests (Node 20+):

```bash
npm test
```

The tests cover the physics (landing, friction, surfing, seams, air-strafing).
A surf bot also uses the real physics to play:
- every map from start to finish, checking that speed stays under 3400 u/s
- each checkpoint section from a standing respawn
- every fork's fast line
- 20+ pieces of several endless seeds

The tests also check that every locked map can eventually be unlocked.

A map change that makes any of these impossible fails the tests.

### Making a map

Maps are built in code with the `Course` helper:

```js
const tunnel = { side: 420, top: 750, ceiling: true, color: COLORS.purple };
addCourse(b, {
  ramp: { width: 260, height: 380, color: COLORS.cyan, minSpeed: 1100 },
  build: (c) => c
    .curve(100, 3800, 2300).straight(2500, 300)      // drop-in
    .gap(800, 0, { tunnel }).straight(3500, 380)    // into a tunnel
    .gap(900).checkpoint('optional hint')
    .straight(3500, 1000)                            // rebuild speed after respawn
    .fork({ length: 4400, speed: 2000, shift: -600 }) // fast line vs detour
    .straight(3000, 300),
});
```

`straight(length, drop)`, `curve(angleDeg, radius, drop)`, `wave(length, drop, amplitude)`,
`gap(length, sideShift, opts)`, `checkpoint(hint)` and `fork({...})` chain together.
Gap drops are computed automatically so a slow player still clears the next ramp.

Rules of thumb the bot tests taught us:
- Keep riders on the **outside** of turns. To turn the other way, switch faces
  across a gap with a small offset: `gap(900, -240, { face: 'right' })`.
- Land on a short straight before a curve.
- Add a gentle run-out after steep ramps.
- Widen turns for fast sections. A radius of about v²/650 is comfortable.

Scenery helpers: `addCity(map)` places solid lit towers that stay clear of the
line, and `addCrystals(map)` grows decorative crystals inside enclosures.
Per-map `env` settings control the sky (`true`, `false` or `'space'`), the
floor (`floorMode: 'sea'`), fog and grid colour. Per-map `cvars` override
physics (Orbital uses `{ gravity: 620 }`). `unlock: { after: [...] }` sets the
maps that must be finished first.

## Ideas for later

- Multiplayer racing (WebSocket server) and online leaderboards
- In-game map editor and shareable map codes
- Replays of any run, spectator camera
- Controller support
