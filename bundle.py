#!/usr/bin/env python3
"""Build a single-file Blackhole.io for static hosting.

The game normally needs TWO files (index.html + sim.js). This inlines sim.js into
index.html so you can upload ONE file to any static host (Netlify Drop, GitHub Pages,
itch.io, etc.). Solo mode works; Create/Join needs the Node server (server.js).

Usage:
    python3 bundle.py            # writes blackhole-standalone.html
"""
import pathlib

root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")
sim = (root / "sim.js").read_text(encoding="utf-8")
progression = (root / "progression.js").read_text(encoding="utf-8")
plinko = (root / "plinko.js").read_text(encoding="utf-8")

marker = '<script src="sim.js"></script>'
assert marker in html, "expected the sim.js script tag in index.html"
out = html.replace(marker, "<script>\n" + sim + "\n</script>", 1)
out = out.replace('<script src="progression.js"></script>', "<script>\n" + progression + "\n</script>", 1)
out = out.replace('<script src="plinko.js"></script>', "<script>\n" + plinko + "\n</script>", 1)

dest = root / "blackhole-standalone.html"
dest.write_text(out, encoding="utf-8")
print("wrote", dest, f"({len(out)} bytes)")
