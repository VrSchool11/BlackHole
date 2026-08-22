# Blackhole.io

Play it here: https://vrschool11.github.io/BlackHole/

You're a black hole. Eat dust, then asteroids, then planets, then every other hole out
there — real gravity pulls it all in, not some fake "bigger number wins" rule.

Play solo against bots or open a station and play with friends over a room code, no
server needed (it's peer to peer). Move with your mouse, hold shift to boost.

## playing

Just open `index.html` in a browser, or grab `blackhole-standalone.html` which is the
whole game in one file. That's it, no install.

## running it locally / hosting it

No build step, nothing to compile. To deploy, upload `blackhole-standalone.html`
anywhere static (GitHub Pages, Netlify, itch.io, whatever) — see DEPLOY.md for details.

If you want to poke at the source, `index.html` + `sim.js` is the actual game,
`plinko.js` and `progression.js` handle the bonus round and the shop/quests. More on how
it's put together in CONTEXT.md.

## modes

Classic (just play), timed matches, last-hole-standing, and teams if you want red vs
blue with friends. Pick before you start a station.
