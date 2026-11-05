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
| Back to stage start | `T` |
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

Start with **First Wave**, the tutorial map. It shows hints at each stage.

## What's in it

- **Source-style movement:** air-accelerate with the 30-unit air speed cap,
  surfable slopes (normal < 0.7), ClipVelocity sliding, Source-style gravity
  steps, auto-bhop, a 100-tick fixed timestep, and rendering interpolated
  between ticks.
- **Exact collision:** ramps are convex brushes. Box traces use the brush's
  Minkowski sum with the player box (face, axis and edge-bevel planes), so you
  don't snag on seams between ramp segments.
- **Three maps:** *First Wave* (tutorial), *Neon Drift* (easy), *Overclock* (hard),
  each split into stages with teleport gates.
- **Endless mode:** a seeded procedural course that streams in as you go and
  gets harder (thinner ramps, longer gaps, side shifts). It controls speed with
  climbs, and has random and daily seeds.
- **Ghosts and records:** your personal-best run replays as a ghost. The top-10
  local leaderboard per map shows stage splits compared to your PB.
- **HUD:** speed, timer, stage, strafe sync %, split deltas, key display.
- **Visuals:** striped synthwave sun, wireframe mountains, glowing grid floor,
  neon-edged glass ramps, bloom, speed particles, and a slight FOV widening at
  speed. **Auto quality** lowers the settings on slow machines unless you pick
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
A surf bot also plays every stage of every map, plus 20+ pieces of several
endless seeds, using the real physics. A map change that makes a stage
impossible fails the tests.

### Making a map

Maps are built in code with the `Course` helper:

```js
addStage(b, {
  origin: [0, 0, 0], heading: 0,
  ramp: { width: 260, height: 380, color: COLORS.cyan },
  build: (c) => c.straight(4000, 900).curve(60, 5000, 950).gap(700).straight(3000, 700),
});
```

`straight(length, drop)`, `curve(angleDeg, radius, drop)`, `wave(length, drop, amplitude)`
and `gap(length, sideShift)` chain together. Gap drops are computed
automatically so a slow player still clears the next ramp.

## Ideas for later

- Multiplayer racing (WebSocket server) and online leaderboards
- In-game map editor and shareable map codes
- Replays of any run, spectator camera
- Controller support
