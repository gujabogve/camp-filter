"use strict";

const SLIDERS = ["brightness", "contrast", "saturation", "gamma", "temperature", "tint", "fade"];

const state = {
	params: { ...DEFAULT_EDIT },
	filter: IDENTITY_FILTER,
	image: /** @type {{ name: string, bitmap: ImageBitmap } | null} */ (null),
};

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const beforeCanvas = document.getElementById("canvasBefore");
const beforeCtx = beforeCanvas.getContext("2d");
const compare = document.getElementById("compare");
const divider = document.getElementById("divider");
const dropImage = document.getElementById("dropImage");
const editor = document.getElementById("editor");
const exportBar = document.getElementById("export");
const exportNote = document.getElementById("exportNote");

// --- sliders -------------------------------------------------------------
for (const id of SLIDERS) {
	const input = document.getElementById(id);
	input.addEventListener("input", () => {
		state.params[id] = parseFloat(input.value);
		syncOutputs();
		rebuild();
	});
}
document.getElementById("reset").addEventListener("click", () => {
	state.params = { ...DEFAULT_EDIT };
	for (const id of SLIDERS) { document.getElementById(id).value = String(state.params[id]); }
	syncOutputs();
	rebuild();
});

function syncOutputs() {
	for (const id of SLIDERS) {
		const out = document.getElementById("o" + id[0].toUpperCase() + id.slice(1));
		out.textContent = id === "gamma" ? state.params[id].toFixed(2) : String(state.params[id]);
	}
}

function rebuild() {
	state.filter = buildFilter(state.params);
	render();
}

// --- image ---------------------------------------------------------------
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
	compare.hidden = editor.hidden = exportBar.hidden = exportNote.hidden = false;
	rebuild();
}

document.getElementById("clearImage").addEventListener("click", () => {
	state.image = null;
	imageInput.value = "";
	compare.hidden = editor.hidden = exportBar.hidden = exportNote.hidden = true;
	dropImage.hidden = false;
});

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
setSplit(50);
function setSplit(pct) {
	const v = Math.max(0, Math.min(100, pct));
	beforeCanvas.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
	divider.style.left = v + "%";
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

// --- export .flt ---------------------------------------------------------
document.getElementById("download").addEventListener("click", () => {
	const name = (document.getElementById("filterName").value.trim() || "myfilter").replace(/\.flt$/i, "");
	const blob = new Blob([serializeFlt(state.filter)], { type: "text/plain" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = name + ".flt";
	a.click();
	URL.revokeObjectURL(a.href);
});

syncOutputs();
