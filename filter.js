"use strict";

// Default (identity) filter parameters. Sliders and .flt files both write here.
const DEFAULT_PARAMS = {
	brightness: 0,   // -100..100  (added as value * 2.55)
	contrast: 0,     // -100..100  (classic contrast factor)
	saturation: 0,   // -100..100  (-100 = greyscale, +100 = double)
	gamma: 1,        // 0.1..3
	temperature: 0,  // -100..100  (+ warms: more red, less blue)
	tint: 0,         // -100..100  (+ magenta, - green)
	rGain: 1,        // per-channel multipliers
	gGain: 1,
	bGain: 1,
};

// Known keys a .flt may use, mapped to our param names. CampSnap files are
// plain text; the precise key names aren't documented, so we accept several
// aliases and surface anything we don't recognise.
const KEY_ALIASES = {
	brightness: "brightness", bright: "brightness", b: "brightness",
	contrast: "contrast", c: "contrast",
	saturation: "saturation", sat: "saturation", s: "saturation",
	gamma: "gamma", g: "gamma",
	temperature: "temperature", temp: "temperature", wb: "temperature",
	tint: "tint",
	rgain: "rGain", red: "rGain", r: "rGain",
	ggain: "gGain", green: "gGain",
	bgain: "bGain", blue: "bGain",
};

/**
 * Parse a CampSnap-style .flt text file.
 * Tolerant: accepts `key=value`, `key:value` or `key value` lines,
 * `#`/`;` comments, and reports unrecognised keys so we can refine the mapping.
 * @param {string} text
 * @returns {{ params: typeof DEFAULT_PARAMS, known: Record<string, number>, unknown: Record<string, string> }}
 */
function parseFlt(text) {
	const params = { ...DEFAULT_PARAMS };
	const known = {};
	const unknown = {};

	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#") || line.startsWith(";")) {
			continue;
		}
		const match = line.match(/^([A-Za-z_][\w]*)\s*[=:\s]\s*(-?[\d.]+)/);
		if (!match) {
			continue;
		}
		const key = match[1].toLowerCase();
		const value = parseFloat(match[2]);
		if (Number.isNaN(value)) {
			continue;
		}
		const mapped = KEY_ALIASES[key];
		if (mapped) {
			params[mapped] = value;
			known[key] = value;
		} else {
			unknown[key] = match[2];
		}
	}

	return { params, known, unknown };
}

/**
 * Apply the filter pipeline to ImageData in place.
 * @param {ImageData} imageData
 * @param {typeof DEFAULT_PARAMS} p
 */
function applyFilter(imageData, p) {
	const data = imageData.data;

	const bright = p.brightness * 2.55;
	const cVal = p.contrast * 2.55;
	const cFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));
	const satFactor = 1 + p.saturation / 100;
	const invGamma = 1 / (p.gamma || 1);
	const warm = p.temperature / 100;
	const tintAmt = p.tint / 100;

	for (let i = 0; i < data.length; i += 4) {
		let r = data[i];
		let g = data[i + 1];
		let b = data[i + 2];

		// 1. per-channel gains
		r *= p.rGain; g *= p.gGain; b *= p.bGain;

		// 2. white balance: temperature (R/B) + tint (G)
		r += warm * 30; b -= warm * 30;
		g -= tintAmt * 30;

		// 3. brightness
		r += bright; g += bright; b += bright;

		// 4. contrast
		r = cFactor * (r - 128) + 128;
		g = cFactor * (g - 128) + 128;
		b = cFactor * (b - 128) + 128;

		// 5. gamma
		r = 255 * Math.pow(clamp01(r / 255), invGamma);
		g = 255 * Math.pow(clamp01(g / 255), invGamma);
		b = 255 * Math.pow(clamp01(b / 255), invGamma);

		// 6. saturation (mix toward Rec. 601 luma)
		const luma = 0.299 * r + 0.587 * g + 0.114 * b;
		r = luma + (r - luma) * satFactor;
		g = luma + (g - luma) * satFactor;
		b = luma + (b - luma) * satFactor;

		data[i] = clamp255(r);
		data[i + 1] = clamp255(g);
		data[i + 2] = clamp255(b);
	}

	return imageData;
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
