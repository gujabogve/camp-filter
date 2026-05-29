"use strict";

// A CampSnap .flt is plain text:
//   line 1: 7 header values (the editor's source sliders — NOT used at runtime,
//           they were already compiled into the matrix + curves below)
//   lines 2-4: a 3x3 colour matrix, fixed-point /1024 (1024 = 1.0)
//   lines 5-7: three 256-entry tone-curve LUTs, one each for R, G, B
//
// The firmware pipeline, per pixel, is exactly:
//   m   = clamp(round( matrix · [r,g,b] / 1024 ))   // colour mix
//   out = [ lutR[m.r], lutG[m.g], lutB[m.b] ]        // per-channel tone curve
// Matrix first, then LUT (proven by Cyanotype: its matrix is greyscale and the
// blue tone lives entirely in the LUTs — LUT-first would wipe it).

const IDENTITY_FILTER = {
	matrix: [1024, 0, 0, 0, 1024, 0, 0, 0, 1024],
	luts: [identityLut(), identityLut(), identityLut()],
};

function identityLut() {
	const t = new Uint8Array(256);
	for (let i = 0; i < 256; i++) { t[i] = i; }
	return t;
}

/**
 * Parse a CampSnap .flt file into a runtime filter.
 * @param {string} text
 * @returns {{ matrix: number[], luts: Uint8Array[] } | null}
 */
function parseFlt(text) {
	const rows = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => l.split(",").map((s) => s.trim()).filter((s) => s !== "").map(Number));

	if (rows.length < 7) { return null; }

	const matrix = [...rows[1], ...rows[2], ...rows[3]];
	const luts = [rows[4], rows[5], rows[6]].map((row) => {
		const t = new Uint8Array(256);
		for (let i = 0; i < 256; i++) { t[i] = clamp255(row[i]); }
		return t;
	});

	if (matrix.length !== 9 || matrix.some(Number.isNaN)) { return null; }
	return { matrix, luts };
}

/**
 * Apply a CampSnap filter (matrix + LUTs) to ImageData in place.
 * @param {ImageData} imageData
 * @param {{ matrix: number[], luts: Uint8Array[] }} filter
 */
function applyCampSnapFilter(imageData, filter) {
	const data = imageData.data;
	const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = filter.matrix;
	const [lr, lg, lb] = filter.luts;

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];

		const mr = clamp255Round((m0 * r + m1 * g + m2 * b) / 1024);
		const mg = clamp255Round((m3 * r + m4 * g + m5 * b) / 1024);
		const mb = clamp255Round((m6 * r + m7 * g + m8 * b) / 1024);

		data[i] = lr[mr];
		data[i + 1] = lg[mg];
		data[i + 2] = lb[mb];
	}
	return imageData;
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function clamp255Round(v) {
	const r = Math.round(v);
	return r < 0 ? 0 : r > 255 ? 255 : r;
}

// --- filter authoring (used by the creator tool) ------------------------
// Edit controls compile down into the same matrix + LUTs the firmware reads.
// Saturation lives in the matrix; everything else is per-channel tone curves.
const DEFAULT_EDIT = {
	brightness: 0,   // -100..100
	contrast: 0,     // -100..100
	saturation: 0,   // -100..100  (-100 = greyscale)
	gamma: 1,        // 0.2..3
	temperature: 0,  // -100..100  (+ warmer)
	tint: 0,         // -100..100  (+ magenta)
	fade: 0,         // 0..100  (lifts the blacks)
};

const LUMA = [0.299, 0.587, 0.114];

/**
 * Compile edit params into a { matrix, luts } filter.
 * @param {typeof DEFAULT_EDIT} p
 */
function buildFilter(p) {
	const sat = Math.max(0, 1 + p.saturation / 100);
	const matrix = [];
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			const v = (i === j ? sat : 0) + (1 - sat) * LUMA[j];
			matrix.push(Math.round(v * 1024));
		}
	}

	const muls = [1 + p.temperature / 200, 1 - p.tint / 200, 1 - p.temperature / 200];
	const cf = 1 + p.contrast / 100;
	const bright = p.brightness / 200;
	const lift = (p.fade / 100) * 0.35;
	const invGamma = 1 / (p.gamma || 1);

	const luts = muls.map((mul) => {
		const t = new Uint8Array(256);
		for (let i = 0; i < 256; i++) {
			let n = i / 255;
			n = (n - 0.5) * cf + 0.5;                  // contrast
			n += bright;                                // brightness
			n = Math.pow(Math.max(0, n), invGamma);     // gamma
			n *= mul;                                   // channel gain (temp/tint)
			n = lift + n * (1 - lift);                  // fade
			t[i] = clamp255(Math.round(n * 255));
		}
		return t;
	});

	return { matrix, luts };
}

/**
 * Serialize a { matrix, luts } filter to CampSnap .flt text (neutral header).
 * @param {{ matrix: number[], luts: Uint8Array[] }} filter
 */
function serializeFlt(filter) {
	const m = filter.matrix;
	const line = (t) => Array.from(t).join(", ");
	return [
		"0, 1, 1, 0, 1, 1, 1",
		`${m[0]}, ${m[1]}, ${m[2]}, `,
		`${m[3]}, ${m[4]}, ${m[5]}, `,
		`${m[6]}, ${m[7]}, ${m[8]}`,
		line(filter.luts[0]),
		line(filter.luts[1]),
		line(filter.luts[2]),
	].join("\n") + "\n";
}
