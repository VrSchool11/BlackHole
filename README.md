# Blackhole.io

**A black hole battle royale with real gravity.** You're a black hole — swallow dust, then asteroids, then planets, all spiralling in on real inverse-square gravity and stretched thin as they cross the edge. Then the other holes get smaller than you. Now it's a fight.

**▶ Play it: https://vrschool11.github.io/BlackHole/**

> Multiplayer note: the server runs on a free tier and sleeps when idle — if you're the first to join in a while, give it ~30 seconds to wake up.

![Blackhole.io](blackhole-cover.png)
<!-- Add a screenshot or the cover image here. First thing anyone sees. -->

---

## What it is

Move with your mouse. You're a speck of a black hole in a huge arena. Eat anything smaller to grow; avoid anything bigger. As you grow, your gravity reaches further and debris falls in on its own — but you get slower and heavier, so the late game is a tense circling match.

**Two ways to play:**
- **Multiplayer** — create a room, share the code, and battle real people online.
- **Single-player** — take on human-like AI bots (also the zero-server fallback: [play offline version](blackhole-standalone.html)).

## Why it's interesting (the technical bits)

- **Real Newtonian gravity.** Acceleration is `a = G·M/d²` toward every hole; the body's own mass cancels out, so everything falls at the same rate. A tangential swirl term turns straight in-falls into decaying spirals.
- **Spaghettification.** Bodies near the horizon stretch *along* the line to the singularity via an area-preserving transform (`scale(s, 1/√s)`) — longer and thinner, like real tidal disruption.
- **Real-time multiplayer.** Authoritative server runs the simulation; clients send only their intent point and render interpolated snapshots. Room-code based, isolated rooms, bots fill empty lobbies. Client on GitHub Pages, WebSocket server on Render.
- **Bots that play like people, not solvers.** Limited vision, reaction latency, saccadic world-reads, and a virtual cursor with tremor — so they lag and wobble like a real mouse. Each bot rolls a personality (aggression, greed, caution, skill).
- **Fixed-timestep simulation** so physics is identical at any framerate.
- **Synthesised audio** — ambient drone + pitch-scaled absorption "whoomp," zero audio files.

## Controls

| Action | Input |
|--------|-------|
| Move | Mouse |
| Start / respawn | Click **COLLAPSE** or press Space |
| Multiplayer | **Create** a room or **Join** with a code |
| Toggle sound | Button, bottom-left |

Desktop recommended.

## Tech

Vanilla JavaScript + HTML5 Canvas. Web Audio for sound. WebSocket multiplayer (Node server on Render). No frameworks, no build step.

## Architecture

- **`index.html`** — the client (renders, sends intent, interpolates snapshots)
- **`sim.js`** — the shared simulation (gravity, eating, entities)
- **`server.js`** — authoritative multiplayer server (rooms, snapshots)
- **`blackhole-standalone.html`** — single-player, no server needed

The simulation is fully separated from rendering, which is what let it move server-side for multiplayer with the client only swapping its controller.

## Roadmap

- [ ] Boost mechanic (eject mass for a speed burst)
- [ ] "Being hunted" warning when a bigger hole locks on
- [ ] Performance pass for very large holes

---

*Built for the Hack Club Stardance Challenge, 2026.*
