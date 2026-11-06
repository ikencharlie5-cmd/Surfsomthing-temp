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
| Restart run | `R` (or `T`) |
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
- **60 maps: 10 themes x 6 difficulties.** Each theme has an easy, medium,
  hard, expert, insane and **extreme** map. Easy is open; finishing a map unlocks the next
  one in its theme. Every map starts with a steep drop-in that flattens out,
  then runs as one continuous line (no teleports, no checkpoints: fall and
  the run restarts). Harder maps are longer (up to ~120k units, about a
  minute at speed).

  Every map has its own **twist** that matches its name:

  | Theme | Easy | Medium | Hard | Expert | Insane |
  | --- | --- | --- | --- | --- | --- |
  | Beach | First Wave (tutorial hints) | Vapor Coast (boost rings) | Riptide (side switches) | Coral Crown (sea cave) | Tsunami (giant waves) |
  | Canyon | Dust Devil (spiral) | Canyon Run (boost rings) | Mesa Mirage (rock gates) | Rattlesnake Pass (slalom) | Badlands (long jumps) |
  | Cave | Echo Hollow (duck & dodge) | Crystal Cave (crystal chamber) | Glowworm Grotto (grotto) | The Deep (plunges) | Abyssal Drop (abyss jumps) |
  | City | Neon Drift (wave ramps) | Skyline Rush (boost rings) | Rooftop Run (rooftop jumps) | Downtown Blitz (duck & dodge) | Megacity (megatower atriums) |
  | Space Station | Docking Bay (hangar) | Overclock (big boosts) | Orbital (orbit spiral) | Zero-G (very low gravity) | Event Horizon (gravity well spiral) |
  | Server Farm | Night Tunnel (duck & dodge) | Packet Storm (boost rings) | Data Core (core vault) | Firewall (firewall slots) | Kernel Panic (chaos) |
  | Jungle | Canopy Glide (canopy waves) | **Lost Temple (temple complex, hand-built)** | Serpent River (serpent slalom) | Jaguar Ruins (ruin dodge) | Green Hell (overgrown ruin) |
  | Volcano | Ash Fields (ash waves) | Obsidian Slopes (spike dodge) | Magma Run (lava tube) | Pyroclast (eruption jumps) | Caldera (plunges) |
  | Warp | Warp Lane (boost rings) | Hyperdrive (hyper boosts) | Lightspeed (boost jumps) | Final Overdrive (warp gate) | Singularity (death spiral) |
  | Castle | Gatehouse (gates) | Battlements (merlon dodge) | Moonlit Keep (great hall) | Dragon Spire (spire jumps) | Siege (full siege) |

  **Extreme maps** (unlocked by finishing a theme's insane map): Rogue Wave,
  Grand Chasm, Underworld, Neon Apocalypse, Supernova, Blue Screen, Temple of
  Doom, Eruption, Big Bang, Dragonfire Lair. They're 160-180k units long
  (80-105 s at speed), with four **kickers** each: the drop-in flipped, so
  the ramp curls up into a lip and launches you up to ~700 units into a
  2500-3100 unit jump. Most kickers have a **double needle**: two walls
  inside the jump, each with a slot you have to fly through.

  **Lost Temple** is a hand-designed set-piece map (`src/maps/lost-temple.js`),
  about 70 seconds of nonstop action. You race around a colossal stepped
  pyramid on the inside face, with gates and a boost on the way, then a
  double-needle kicker. Next is a duck & dodge run down the entrance tunnel,
  a gate between the columns of the Hall of Pillars, two more double-needle
  kickers, the flooded chamber, and a final sprint around the idol in the
  great hall.

  **Banger maps:** each theme's medium slot is a hand-built set piece in the
  Lost Temple style (`src/maps/bangers.js`). You race around a giant landmark
  on the inside face, with gates, boost rings and two double-needle kickers,
  then a duck & dodge run through a building and a finale lap around a second
  landmark. Each takes about 70-85 s at 2500-3000 u/s.

  | Theme | Banger | Landmarks |
  | --- | --- | --- |
  | Beach | Lighthouse Point | neon lighthouse with a sweeping beam, sea stacks |
  | Canyon | Spire Valley | towering red-rock spire, giant natural arch |
  | Cave | Crystal Heart | colossal glowing crystal clusters |
  | City | Spire Tower | two setback megatowers |
  | Space Station | Reactor Core | blazing reactor cores with spinning rings |
  | Server Farm | Mainframe | LED mainframe towers streaming data |
  | Jungle | Lost Temple | pyramid, temple chambers, idol |
  | Volcano | Inferno | erupting volcano, falling river of lava |
  | Warp | Event Zero | black hole with accretion disk, a star |
  | Castle | The Keep | great keep, gate towers |

  **Kickers on every map:** easy 1, medium/hard 2, expert/insane 3,
  extreme 6. Harder tiers use more double needles.

  **The finish is a ring:** you have to fly through the gate. Miss it and you
  fall and restart.

  Twist mechanics:
  - **Set pieces:** the course runs straight through a building, such as a
    temple, great hall, hangar, server vault, megatower atrium, lava tube, sea
    cave, crystal chamber, glowworm grotto or warp gate. It has solid walls
    and a ceiling, lit interiors and duck/dodge blocks inside.
  - **Duck & dodge:** blocks stick out of the ramp face. Magenta blocks cover
    the top of the face, so ride low under them. Amber blocks cover the
    bottom, so ride high over them.
  - **Boost rings:** fly through one for a burst of speed (once per run).
  - **Spirals**, **giant waves**, **plunges**, **slaloms** and **low gravity**
    shape the rest.

  The newer maps are laid out by a seeded generator (`src/maps/generator.js`)
  that varies the section mix per map. A seed is only used once the surf bot
  has finished it, including every fast line (`node tools/seed-search.mjs`).
- **Thread the needle:** real walls across some gaps with one narrow slot to
  fly through. They stand on the ground and rise into the sky, drawn in each
  theme's style: rock faces with a crack (canyon, cave, beach, volcano),
  pairs of skyscrapers (city), bulkheads with hazard stripes (station,
  servers), carved stone with torches (jungle, keep), energy barriers (warp)
  and gatehouses (castle). On the banger maps they reach all the way in to
  the landmark.
  Slots shrink with difficulty, from 260 units on easy to 125 on insane.
  Miss the slot and you crash.
- **Long jumps:** a steep launch ramp, then a 2000-3500 unit gap that only
  riders carrying enough speed can clear.
- **Fast lines:** at some gaps, a long jump straight ahead lands directly on a
  later ramp, but only if you're carrying enough speed. Slower riders take a
  safe detour to the side.
- **Endless mode:** a seeded procedural course that starts with a curved
  drop-in, streams in as you go and gets harder (thinner ramps, longer gaps,
  side shifts). It controls speed with climbs, scores ramps cleared and your
  best combo, and has random and daily seeds.
- **Ghosts and records:** your personal-best run replays as a ghost. The top-10
  local leaderboard per map shows stage splits compared to your PB.
- **HUD:** speed, timer, course progress %, strafe sync %, speed combo,
  scrub warnings, a 6-second speed graph (scrubs marked in red), key display.
- **Visuals:** striped synthwave sun, wireframe mountains, glowing grid floor,
  neon-edged glass ramps, glowing tunnel ribs, per-map fog and lighting, bloom,
  speed particles and streaks, and a slight FOV widening at speed. **Auto quality** lowers the settings on slow machines unless you pick
  a quality yourself.
- **Audio:** everything is synthesized with WebAudio: wind that rises with
  speed, ramp hiss, game sounds, and a procedural synthwave soundtrack.

## Online leaderboards (Supabase, free)

Global top-10 boards per map, with player names. The game works offline
without this and just shows local records.

1. Create a free account and project at https://supabase.com. Any region
   works; save the database password somewhere.
2. In the project, open **SQL Editor**, paste the SQL below and click **Run**.
3. Open **Project Settings → API** and copy the **Project URL** and the
   **anon public** key.
4. Put them in `src/config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`), or send
   them to Claude to commit. The anon key is designed to be public; the
   row-level security rules below are what protect the table.

```sql
create table public.scores (
  id bigint generated always as identity primary key,
  map_id text not null check (map_id ~ '^[a-z0-9-]{3,40}$'),
  player text not null check (char_length(player) between 1 and 16),
  time_ms integer not null check (time_ms between 5000 and 3600000),
  top_speed integer not null default 0 check (top_speed between 0 and 6000),
  combo integer not null default 0 check (combo >= 0),
  created_at timestamptz not null default now()
);
create index scores_map_time on public.scores (map_id, time_ms);

alter table public.scores enable row level security;
-- anyone can read the boards
create policy "read scores" on public.scores for select to anon using (true);
-- anyone can post a run (the checks above reject nonsense); no update/delete
create policy "post scores" on public.scores for insert to anon with check (true);
```

The client also refuses to post times faster than the course length allows
at the 3500 u/s speed cap. It's a basic sanity check, not real anti-cheat:
someone determined could still post a fake time through the API.

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
    .gap(900).checkpoint('optional tutorial hint')
    .straight(3500, 1000)                            // rebuild speed after respawn
    .fork({ length: 4400, speed: 2000, shift: -600 }) // fast line vs detour
    .straight(3000, 300),
});
```

`straight(length, drop)`, `curve(angleDeg, radius, drop)`, `wave(length, drop, amplitude)`,
`gap(length, sideShift, opts)`, `checkpoint(hint)` (now just a tutorial-hint point; there are no respawns) and `fork({...})` chain together.
Gap drops are computed automatically so a slow player still clears the next ramp.

Rules of thumb the bot tests taught us:
- Keep riders on the **outside** of turns. To turn the other way, switch faces
  across a gap with a small offset: `gap(900, -240, { face: 'right' })`.
- Land on a short straight before a curve.
- Add a gentle run-out after steep ramps.
- Widen turns for fast sections. A radius of about v²/650 is comfortable.

Themed scenery (`theme: { type: 'beach' | 'canyon' | 'cave' | 'city' | 'station' | 'servers' | 'jungle' | 'volcano' | 'vortex' }`) is generated
procedurally around the course in `src/render/scenery.js`: low-poly rock and
terrain plus props. It is decoration only. On these maps you collide with a
smooth hidden shell set just inside the rough rock, so bumps never scrub
speed, and prop density follows the graphics quality.

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
