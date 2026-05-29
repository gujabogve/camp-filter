"use strict";

const SLIDERS = ["brightness", "contrast", "saturation", "gamma", "temperature", "tint"];

const state = {
	params: { ...DEFAULT_PARAMS },
	images: /** @type {{ name: string, bitmap: ImageBitmap }[]} */ ([]),
	active: -1,
};

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const thumbs = document.getElementById("thumbs");
const stage = document.getElementById("stage");

// --- sliders -------------------------------------------------------------
for (const id of SLIDERS) {
	const input = document.getElementById(id);
	input.addEventListener("input", () => {
		state.params[id] = parseFloat(input.value);
		syncOutputs();
		render();
	});
}
document.getElementById("reset").addEventListener("click", () => {
	state.params = { ...DEFAULT_PARAMS };
	syncSliders();
	render();
});

function syncOutputs() {
	for (const id of SLIDERS) {
		const out = document.getElementById("o" + id[0].toUpperCase() + id.slice(1));
		out.textContent = id === "gamma" ? state.params[id].toFixed(2) : String(state.params[id]);
	}
}
function syncSliders() {
	for (const id of SLIDERS) {
		document.getElementById(id).value = String(state.params[id]);
	}
	syncOutputs();
}

// --- file inputs + drag/drop --------------------------------------------
wireDrop("dropImage", "imageInput", handleImages);
wireDrop("dropFlt", "fltInput", (files) => handleFlt(files[0]));

function wireDrop(dropId, inputId, onFiles) {
	const drop = document.getElementById(dropId);
	const input = document.getElementById(inputId);
	input.addEventListener("change", () => input.files.length && onFiles([...input.files]));
	drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
	drop.addEventListener("dragleave", () => drop.classList.remove("over"));
	drop.addEventListener("drop", (e) => {
		e.preventDefault();
		drop.classList.remove("over");
		if (e.dataTransfer.files.length) { onFiles([...e.dataTransfer.files]); }
	});
}

async function handleImages(files) {
	for (const file of files) {
		if (!file.type.startsWith("image/")) { continue; }
		const bitmap = await createImageBitmap(file);
		state.images.push({ name: file.name, bitmap });
	}
	if (state.images.length) {
		stage.hidden = false;
		renderThumbs();
		if (state.active < 0) { setActive(0); } else { render(); }
	}
}

async function handleFlt(file) {
	const text = await file.text();
	const { params, known, unknown } = parseFlt(text);
	state.params = params;
	syncSliders();
	render();

	document.getElementById("fltName").textContent = file.name;
	const box = document.getElementById("parsedBox");
	box.hidden = false;
	document.getElementById("parsedOut").textContent = JSON.stringify(
		{ recognised: known, unrecognised: unknown },
		null,
		2,
	);
}

// --- rendering -----------------------------------------------------------
function renderThumbs() {
	thumbs.innerHTML = "";
	state.images.forEach((img, idx) => {
		const el = document.createElement("img");
		el.alt = img.name;
		const c = document.createElement("canvas");
		c.width = img.bitmap.width; c.height = img.bitmap.height;
		c.getContext("2d").drawImage(img.bitmap, 0, 0);
		el.src = c.toDataURL();
		el.classList.toggle("active", idx === state.active);
		el.addEventListener("click", () => setActive(idx));
		thumbs.appendChild(el);
	});
}

function setActive(idx) {
	state.active = idx;
	[...thumbs.children].forEach((el, i) => el.classList.toggle("active", i === idx));
	render();
}

function render() {
	const img = state.images[state.active];
	if (!img) { return; }
	canvas.width = img.bitmap.width;
	canvas.height = img.bitmap.height;
	ctx.drawImage(img.bitmap, 0, 0);
	const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
	applyFilter(data, state.params);
	ctx.putImageData(data, 0, 0);
}

// --- export --------------------------------------------------------------
document.getElementById("download").addEventListener("click", () => {
	const img = state.images[state.active];
	if (img) { downloadCanvas(canvas, img.name); }
});

document.getElementById("downloadAll").addEventListener("click", async () => {
	for (let i = 0; i < state.images.length; i++) {
		setActive(i);
		await new Promise((r) => requestAnimationFrame(r));
		downloadCanvas(canvas, state.images[i].name);
	}
});

function downloadCanvas(srcCanvas, name) {
	srcCanvas.toBlob((blob) => {
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = name.replace(/\.[^.]+$/, "") + "_filtered.jpg";
		a.click();
		URL.revokeObjectURL(a.href);
	}, "image/jpeg", 0.92);
}

// --- PWA -----------------------------------------------------------------
if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}

syncOutputs();
