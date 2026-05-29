# CampSnap Filter

A tiny, installable PWA that applies CampSnap `.flt` camera filters to photos
after they've been taken. Zero dependencies, works offline, runs in the browser.

## Run

It's a static site — serve the folder over HTTP (service workers need a server,
not `file://`):

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

Or any static host (`npx serve`, GitHub Pages, etc.). "Install" it from the
browser's address bar to use it like a native app, online or off.

## Use

1. Drop one or more photos.
2. Pick a built-in preset, or drop your own `.flt` file.
3. Optionally tweak brightness/contrast/saturation (applied *after* the filter).
4. Download the current photo, or batch-export all of them.

## The `.flt` format

A CampSnap `.flt` is plain text:

```
line 1     : 7 header values  (the editor's source sliders; not used at runtime)
lines 2-4  : a 3x3 colour matrix, fixed-point /1024  (1024 = 1.0)
lines 5-7  : three 256-entry tone-curve LUTs, one each for R, G, B
```

The header values are only the editor's inputs — they're already *compiled into*
the matrix and curves, which are the complete filter. The runtime pipeline,
per pixel, is exactly:

```
m   = clamp(round( matrix · [r,g,b] / 1024 ))   // colour mix
out = [ lutR[m.r], lutG[m.g], lutB[m.b] ]        // per-channel tone curve
```

Matrix first, then LUT — proven by Cyanotype, whose matrix collapses to
greyscale while the blue tone lives entirely in the curves (LUT-first would
wipe it). This makes the reproduction pixel-exact, not an approximation.

The 14 official filters are bundled in [`presets.json`](presets.json),
generated directly from the `.flt` files.
