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
2. Drop a `.flt` file, or adjust the sliders by hand.
3. Download the current photo, or batch-export all of them.

## How `.flt` parsing works

CampSnap `.flt` files are plain text. The exact key names aren't officially
documented, so [`filter.js`](filter.js) parses tolerantly (`key=value`,
`key:value`, or `key value`; `#`/`;` comments) and reports any keys it doesn't
recognise in the UI. The recognised keys map to a fixed processing pipeline:

per-channel gain → white balance (temperature/tint) → brightness → contrast →
gamma → saturation.

If a real `.flt` uses different field names or value ranges, update
`KEY_ALIASES` and the math in `applyFilter` to match.

## Roadmap

- Ship the official CampSnap presets as bundled JSON (convert from `.flt`).
- Calibrate the pipeline against real camera output.
