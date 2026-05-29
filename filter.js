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

// --- optional extra adjustments, applied AFTER the filter --------------------
const DEFAULT_PARAMS = {
	brightness: 0,   // -100..100
	contrast: 0,     // -100..100
	saturation: 0,   // -100..100
};

function isNeutral(p) {
	return p.brightness === 0 && p.contrast === 0 && p.saturation === 0;
}

/**
 * @param {ImageData} imageData
 * @param {typeof DEFAULT_PARAMS} p
 */
function applyAdjustments(imageData, p) {
	if (isNeutral(p)) { return imageData; }
	const data = imageData.data;
	const bright = p.brightness * 2.55;
	const cVal = p.contrast * 2.55;
	const cFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));
	const satFactor = 1 + p.saturation / 100;

	for (let i = 0; i < data.length; i += 4) {
		let r = data[i] + bright;
		let g = data[i + 1] + bright;
		let b = data[i + 2] + bright;

		r = cFactor * (r - 128) + 128;
		g = cFactor * (g - 128) + 128;
		b = cFactor * (b - 128) + 128;

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
function clamp255Round(v) {
	const r = Math.round(v);
	return r < 0 ? 0 : r > 255 ? 255 : r;
}
