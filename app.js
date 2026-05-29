"use strict";

const state = {
	filter: IDENTITY_FILTER,
	index: -1, // index into presets, or -1 for a dropped custom .flt
	presets: /** @type {{ id: string, name: string, matrix: number[], luts: Uint8Array[] }[]} */ ([]),
	image: /** @type {{ name: string, bitmap: ImageBitmap } | null} */ (null),
};

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const beforeCanvas = document.getElementById("canvasBefore");
const beforeCtx = beforeCanvas.getContext("2d");
const compare = document.getElementById("compare");
const divider = document.getElementById("divider");
const dropImage = document.getElementById("dropImage");
const picker = document.getElementById("picker");
const actions = document.getElementById("actions");
const filterName = document.getElementById("filterName");
const fltInput = document.getElementById("fltInput");

// --- filters -------------------------------------------------------------
loadPresets();

async function loadPresets() {
	try {
		const res = await fetch("presets.json");
		const raw = await res.json();
		state.presets = raw.map((p) => ({ ...p, luts: p.luts.map((arr) => Uint8Array.from(arr)) }));
	} catch {
		state.presets = [];
	}

	picker.innerHTML = "";
	state.presets.forEach((p, i) => {
		const btn = document.createElement("button");
		btn.type = "button";
		const title = document.createElement("span");
		title.className = "b-name";
		title.textContent = p.name;
		const file = document.createElement("span");
		file.className = "b-file";
		file.textContent = p.id + ".flt";
		btn.append(title, file);
		btn.addEventListener("click", () => selectFilter(i));
		picker.appendChild(btn);
	});

	const load = document.createElement("button");
	load.type = "button";
	load.className = "load-flt";
	load.textContent = "+ .flt";
	load.title = "Load a custom .flt file";
	load.addEventListener("click", () => fltInput.click());
	picker.appendChild(load);

	if (state.presets.length) { selectFilter(0); }
}

function selectFilter(i) {
	if (i < 0 || i >= state.presets.length) { return; }
	state.index = i;
	state.filter = state.presets[i];
	filterName.textContent = state.filter.name;
	[...picker.querySelectorAll("button:not(.load-flt)")].forEach((el, idx) => el.classList.toggle("active", idx === i));
	picker.children[i]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
	render();
}

document.getElementById("prevFilter").addEventListener("click", () => step(-1));
document.getElementById("nextFilter").addEventListener("click", () => step(1));

function step(dir) {
	if (!state.presets.length) { return; }
	const base = state.index < 0 ? 0 : state.index;
	selectFilter((base + dir + state.presets.length) % state.presets.length);
}

window.addEventListener("keydown", (e) => {
	if (!state.image) { return; }
	if (e.key === "ArrowLeft") { step(-1); }
	else if (e.key === "ArrowRight") { step(1); }
});

// --- image: drop / pick / clear -----------------------------------------
const imageInput = document.getElementById("imageInput");
imageInput.addEventListener("change", () => imageInput.files[0] && loadImage(imageInput.files[0]));
dropImage.addEventListener("dragover", (e) => { e.preventDefault(); dropImage.classList.add("over"); });
dropImage.addEventListener("dragleave", () => dropImage.classList.remove("over"));
dropImage.addEventListener("drop", (e) => {
	e.preventDefault();
	dropImage.classList.remove("over");
	if (e.dataTransfer.files[0]) { loadImage(e.dataTransfer.files[0]); }
});

async function loadImage(file) {
	if (!file.type.startsWith("image/")) { return; }
	state.image = { name: file.name, bitmap: await createImageBitmap(file) };
	dropImage.hidden = true;
	compare.hidden = false;
	picker.hidden = false;
	actions.hidden = false;
	render();
}

document.getElementById("clearImage").addEventListener("click", () => {
	state.image = null;
	imageInput.value = "";
	compare.hidden = true;
	picker.hidden = true;
	actions.hidden = true;
	dropImage.hidden = false;
});

// --- custom .flt ---------------------------------------------------------
fltInput.addEventListener("change", () => fltInput.files[0] && loadFlt(fltInput.files[0]));

async function loadFlt(file) {
	const filter = parseFlt(await file.text());
	fltInput.value = "";
	if (!filter) { filterName.textContent = "couldn't parse file"; return; }
	state.filter = filter;
	state.index = -1;
	filterName.textContent = file.name.replace(/\.flt$/i, "");
	picker.querySelectorAll("button").forEach((el) => el.classList.remove("active"));
	render();
}

// --- rendering -----------------------------------------------------------
function render() {
	const img = state.image;
	if (!img) { return; }
	canvas.width = beforeCanvas.width = img.bitmap.width;
	canvas.height = beforeCanvas.height = img.bitmap.height;

	beforeCtx.drawImage(img.bitmap, 0, 0);

	ctx.drawImage(img.bitmap, 0, 0);
	const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
	applyCampSnapFilter(data, state.filter);
	ctx.putImageData(data, 0, 0);
}

// --- before/after split --------------------------------------------------
let split = 50;
setSplit(50);

function setSplit(pct) {
	split = Math.max(0, Math.min(100, pct));
	beforeCanvas.style.clipPath = `inset(0 ${100 - split}% 0 0)`;
	divider.style.left = split + "%";
}

divider.addEventListener("pointerdown", (e) => {
	e.preventDefault();
	divider.setPointerCapture(e.pointerId);
	const move = (ev) => {
		const rect = compare.getBoundingClientRect();
		setSplit(((ev.clientX - rect.left) / rect.width) * 100);
	};
	const up = () => {
		divider.removeEventListener("pointermove", move);
		divider.removeEventListener("pointerup", up);
	};
	divider.addEventListener("pointermove", move);
	divider.addEventListener("pointerup", up);
});

// --- export --------------------------------------------------------------
document.getElementById("download").addEventListener("click", () => {
	if (!state.image) { return; }
	canvas.toBlob((blob) => {
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = state.image.name.replace(/\.[^.]+$/, "") + "_filtered.jpg";
		a.click();
		URL.revokeObjectURL(a.href);
	}, "image/jpeg", 0.92);
});

// --- PWA -----------------------------------------------------------------
if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}

// --- install prompt ------------------------------------------------------
const installBanner = document.getElementById("installBanner");
const installBtn = document.getElementById("installBtn");
const iosModal = document.getElementById("iosModal");

const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const dismissed = () => localStorage.getItem("installDismissed") === "1";

let deferredPrompt = null;

// Android / desktop Chromium: a real, native install prompt.
window.addEventListener("beforeinstallprompt", (e) => {
	e.preventDefault();
	deferredPrompt = e;
	if (!dismissed()) { installBanner.hidden = false; }
});

installBtn.addEventListener("click", async () => {
	if (deferredPrompt) {
		deferredPrompt.prompt();
		await deferredPrompt.userChoice;
		deferredPrompt = null;
		installBanner.hidden = true;
	} else if (isIOS) {
		iosModal.hidden = false; // iOS has no native prompt — show instructions.
	}
});

document.getElementById("installClose").addEventListener("click", () => {
	installBanner.hidden = true;
	localStorage.setItem("installDismissed", "1");
});
document.getElementById("iosModalClose").addEventListener("click", () => { iosModal.hidden = true; });
iosModal.addEventListener("click", (e) => { if (e.target === iosModal) { iosModal.hidden = true; } });

window.addEventListener("appinstalled", () => { installBanner.hidden = true; });

// iOS can't fire beforeinstallprompt, so surface the banner manually.
if (isIOS && !isStandalone && !dismissed()) { installBanner.hidden = false; }
