# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Casual browser gamers who land on a link and expect to be playing within seconds — no
signup, no install. They play solo against bots for a few minutes at a time, or spin up a
P2P room with friends using a share-able room code. [Inferred from repo evidence — user
told me to proceed without further Q&A; confirm/correct if wrong.]

## Product Purpose
An agar.io-style browser game where the player is a black hole eating dust, asteroids,
planets, and rival holes, driven by real inverse-square gravity rather than simple
"bigger eats smaller" rules. Runs solo vs bots or in real-time multiplayer.

## Positioning
Two things a neighboring agar.io clone can't truthfully claim: (1) actual physics —
inverse-square gravity, mass, and momentum drive absorption, not a fixed size-ratio rule;
(2) zero-server P2P multiplayer over WebRTC (PeerJS) — any player can CREATE ROOM from
their own browser tab and share a code, no backend to host or pay for.

## Operating Context
Played in a browser tab, mouse-driven (hold shift to boost). Sessions are short — a life
lasts a few minutes. Death leads to a Plinko bonus round (catch a reward multiplier), then
back to the menu or an immediate respawn.

## Capabilities and Constraints
- Must ship as a single deployable entry point: `index.html` (+ `sim.js`) with no build
  step, hostable on GitHub Pages / Netlify / Cloudflare Pages / itch.io.
- `bundle.py` inlines `index.html` + `sim.js` into `blackhole-standalone.html`, a single
  ~95KB file, for one-file hosting. Re-run after every edit to `index.html` or `sim.js`.
- Multiplayer is P2P via PeerJS's public signaling server — no backend required.
  `server.js` (Node + `ws`, authoritative WebSocket server) is legacy/optional, not used
  by the current client.
- Functionality that must survive any visual pass unchanged: boost, rogue holes, bigger
  world, room create/join, cosmetics shop, quest log, token economy, Plinko bonus round,
  respawn/pause flows.

## Brand Commitments
Name "Blackhole.io" stays. Voice is terse and a little menacing (death screen currently
reads "DEVOURED"); keep that register rather than softening it.

## Evidence on Hand
No logos, screenshots, or external brand assets — the shipped `index.html` implementation
is the only asset on hand.

## Product Principles
1. Instant play, zero friction — no signup, no server ops; playable within seconds of load.
2. Physical honesty — gravity, mass, and absorption should read as real physics, not
   arbitrary game rules.
3. Single-file / static-host portability is a hard constraint, not an implementation
   detail — never introduce a build step or backend dependency for the base game.
4. Short-session loop (play → die → bonus round → respawn/menu) must stay fast and
   low-friction; UI must never get in the way of the next life starting.
5. The design must read as deliberately made by one person with a point of view, not
   assembled from a template — this is the explicit driver of the current design pass.
