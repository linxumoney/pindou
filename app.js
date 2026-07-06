const els = {
  imageUpload: document.querySelector("#imageUpload"),
  dropZone: document.querySelector("#dropZone"),
  sourcePreview: document.querySelector("#sourcePreview"),
  fileMeta: document.querySelector("#fileMeta"),
  statusText: document.querySelector("#statusText"),
  generateBtn: document.querySelector("#generateBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  gridWidth: document.querySelector("#gridWidth"),
  gridHeight: document.querySelector("#gridHeight"),
  finishedWidth: document.querySelector("#finishedWidth"),
  finishedHeight: document.querySelector("#finishedHeight"),
  beadSize: document.querySelector("#beadSize"),
  maxColors: document.querySelector("#maxColors"),
  lockRatio: document.querySelector("#lockRatio"),
  fitMode: document.querySelector("#fitMode"),
  colorMode: document.querySelector("#colorMode"),
  backgroundMode: document.querySelector("#backgroundMode"),
  customBackground: document.querySelector("#customBackground"),
  customBackgroundWrap: document.querySelector("#customBackgroundWrap"),
  showGrid: document.querySelector("#showGrid"),
  showCodes: document.querySelector("#showCodes"),
  exportCodes: document.querySelector("#exportCodes"),
  zoomSlider: document.querySelector("#zoomSlider"),
  canvas: document.querySelector("#patternCanvas"),
  emptyState: document.querySelector("#emptyState"),
  patternTitle: document.querySelector("#patternTitle"),
  beadCount: document.querySelector("#beadCount"),
  colorCount: document.querySelector("#colorCount"),
  finishedSize: document.querySelector("#finishedSize"),
  colorBreakdown: document.querySelector("#colorBreakdown"),
  paletteNote: document.querySelector("#paletteNote"),
  gridSizeControls: document.querySelector("#gridSizeControls"),
  physicalSizeControls: document.querySelector("#physicalSizeControls")
};

const ctx = els.canvas.getContext("2d");
const MAX_SOURCE_SIDE = 1800;
const MAX_GRID = 200;
const MIN_GRID = 8;

const beadPalette = [
  ["W01", "白色", "#ffffff"], ["K01", "黑色", "#111111"], ["G01", "浅灰", "#d9d9d9"], ["G02", "深灰", "#6b7280"],
  ["R01", "正红", "#d62828"], ["R02", "珊瑚红", "#f25f5c"], ["R03", "酒红", "#8f1d2c"], ["P01", "浅粉", "#ffb3c6"],
  ["P02", "桃粉", "#ff7aa2"], ["O01", "橙色", "#f77f00"], ["O02", "浅橙", "#f7a072"], ["Y01", "柠檬黄", "#ffe066"],
  ["Y02", "金黄", "#ffbf00"], ["B01", "米色", "#f1dabf"], ["B02", "棕色", "#8b5e34"], ["B03", "深棕", "#4a2c2a"],
  ["L01", "浅绿", "#b7e4c7"], ["L02", "草绿", "#70ad47"], ["L03", "翠绿", "#2a9d8f"], ["L04", "深绿", "#1b5e20"],
  ["C01", "薄荷", "#8bd3dd"], ["C02", "青色", "#00a6a6"], ["U01", "天蓝", "#74c0fc"], ["U02", "蓝色", "#247ba0"],
  ["U03", "深蓝", "#1d3557"], ["V01", "淡紫", "#c8b6ff"], ["V02", "紫色", "#7b2cbf"], ["V03", "深紫", "#4b3869"],
  ["N01", "肤色", "#ffd6a5"], ["N02", "杏色", "#f4b183"], ["N03", "浅咖", "#c08457"], ["M01", "玫红", "#d81159"],
  ["A01", "荧光绿", "#a7c957"], ["A02", "湖蓝", "#4cc9f0"], ["A03", "靛蓝", "#4361ee"], ["A04", "奶油", "#fff3b0"]
].map(([code, name, hex]) => ({ code, name, hex, rgb: hexToRgb(hex), lab: rgbToLab(hexToRgb(hex)) }));

let source = null;
let pattern = null;
let sizeMode = "grid";
let lastObjectUrl = null;
let pendingGenerate = 0;

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function srgbToLinear(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(rgb) {
  let x = srgbToLinear(rgb.r) * 0.4124 + srgbToLinear(rgb.g) * 0.3576 + srgbToLinear(rgb.b) * 0.1805;
  let y = srgbToLinear(rgb.r) * 0.2126 + srgbToLinear(rgb.g) * 0.7152 + srgbToLinear(rgb.b) * 0.0722;
  let z = srgbToLinear(rgb.r) * 0.0193 + srgbToLinear(rgb.g) * 0.1192 + srgbToLinear(rgb.b) * 0.9505;

  x /= 0.95047;
  z /= 1.08883;

  const f = (value) => value > 0.008856 ? value ** (1 / 3) : (7.787 * value) + (16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    l: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function labDistance(a, b) {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return (dl * dl * 1.15) + (da * da) + (db * db);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function setStatus(message, type = "normal") {
  els.statusText.textContent = message;
  els.statusText.classList.toggle("error", type === "error");
}

function getBackgroundColor() {
  if (els.backgroundMode.value === "transparent") return null;
  if (els.backgroundMode.value === "custom") return els.customBackground.value;
  return "#ffffff";
}

function updatePhysicalSizeFromGrid() {
  const beadMm = Number(els.beadSize.value);
  const width = clampNumber(els.gridWidth.value, MIN_GRID, MAX_GRID, 48);
  const height = clampNumber(els.gridHeight.value, MIN_GRID, MAX_GRID, 48);
  els.finishedWidth.value = ((width * beadMm) / 10).toFixed(1);
  els.finishedHeight.value = ((height * beadMm) / 10).toFixed(1);
}

function updateGridSizeFromPhysical() {
  const beadMm = Number(els.beadSize.value);
  const widthCm = clampNumber(els.finishedWidth.value, 2, 80, 24);
  const heightCm = clampNumber(els.finishedHeight.value, 2, 80, 24);
  els.gridWidth.value = Math.round((widthCm * 10) / beadMm);
  els.gridHeight.value = Math.round((heightCm * 10) / beadMm);
  normalizeGridInputs();
}

function normalizeGridInputs() {
  els.gridWidth.value = clampNumber(els.gridWidth.value, MIN_GRID, MAX_GRID, 48);
  els.gridHeight.value = clampNumber(els.gridHeight.value, MIN_GRID, MAX_GRID, 48);
}

function syncRatio(changedAxis) {
  if (!source || !els.lockRatio.checked) return;
  const ratio = source.width / source.height;

  if (changedAxis === "width") {
    els.gridHeight.value = Math.round(clampNumber(els.gridWidth.value, MIN_GRID, MAX_GRID, 48) / ratio);
  } else {
    els.gridWidth.value = Math.round(clampNumber(els.gridHeight.value, MIN_GRID, MAX_GRID, 48) * ratio);
  }
  normalizeGridInputs();
  updatePhysicalSizeFromGrid();
}

async function fileToSource(file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("请选择 JPG、PNG、WEBP 等图片文件。");
  }

  const image = await decodeImage(file);
  const originalWidth = image.width;
  const originalHeight = image.height;
  const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const canvasCtx = canvas.getContext("2d", { willReadFrequently: true });
  canvasCtx.imageSmoothingEnabled = true;
  canvasCtx.imageSmoothingQuality = "high";
  canvasCtx.drawImage(image, 0, 0, width, height);
  if (image.close) image.close();

  return {
    name: file.name.replace(/\.[^.]+$/, ""),
    type: file.type,
    size: file.size,
    canvas,
    width,
    height,
    originalWidth,
    originalHeight
  };
}

function decodeImage(file) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片解码失败，请换一张图片。"));
    };
    image.src = url;
  });
}

function renderSourcePreview(file) {
  if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
  lastObjectUrl = URL.createObjectURL(file);
  els.sourcePreview.classList.remove("empty");
  els.sourcePreview.innerHTML = "";
  const image = document.createElement("img");
  image.alt = "上传图片预览";
  image.src = lastObjectUrl;
  els.sourcePreview.append(image);
}

function formatSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function handleFile(file) {
  try {
    setStatus("正在读取图片...");
    renderSourcePreview(file);
    source = await fileToSource(file);
    els.fileMeta.textContent = `${source.width}×${source.height} / ${formatSize(file.size)}`;
    els.generateBtn.disabled = false;

    if (els.lockRatio.checked) {
      const starterWidth = clampNumber(els.gridWidth.value, MIN_GRID, MAX_GRID, 48);
      els.gridHeight.value = Math.round(starterWidth / (source.width / source.height));
      normalizeGridInputs();
      updatePhysicalSizeFromGrid();
    }

    await generatePattern();
  } catch (error) {
    setStatus(error.message || "图片读取失败，请换一张图片。", "error");
    els.generateBtn.disabled = true;
  }
}

function getDrawRect(sourceWidth, sourceHeight, targetWidth, targetHeight, mode) {
  const imageRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  let drawWidth = targetWidth;
  let drawHeight = targetHeight;
  let x = 0;
  let y = 0;

  if (mode === "contain") {
    if (imageRatio > targetRatio) {
      drawHeight = targetWidth / imageRatio;
      y = (targetHeight - drawHeight) / 2;
    } else {
      drawWidth = targetHeight * imageRatio;
      x = (targetWidth - drawWidth) / 2;
    }
  } else if (imageRatio > targetRatio) {
    drawWidth = targetHeight * imageRatio;
    x = (targetWidth - drawWidth) / -2;
  } else {
    drawHeight = targetWidth / imageRatio;
    y = (targetHeight - drawHeight) / -2;
  }

  return { x, y, width: drawWidth, height: drawHeight };
}

function sampleImage(width, height) {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
  const background = getBackgroundColor();

  tempCtx.clearRect(0, 0, width, height);
  if (background) {
    tempCtx.fillStyle = background;
    tempCtx.fillRect(0, 0, width, height);
  }
  tempCtx.imageSmoothingEnabled = true;
  tempCtx.imageSmoothingQuality = "high";

  const rect = getDrawRect(source.width, source.height, width, height, els.fitMode.value);
  tempCtx.drawImage(source.canvas, rect.x, rect.y, rect.width, rect.height);
  return tempCtx.getImageData(0, 0, width, height).data;
}

function buildPixels(imageData) {
  const pixels = [];
  const cells = [];
  const background = getBackgroundColor();

  for (let index = 0; index < imageData.length; index += 4) {
    const alpha = imageData[index + 3];
    if (!background && alpha < 80) {
      cells.push(null);
      continue;
    }

    const pixel = {
      r: Math.round(((imageData[index] * alpha) + 255 * (255 - alpha)) / 255),
      g: Math.round(((imageData[index + 1] * alpha) + 255 * (255 - alpha)) / 255),
      b: Math.round(((imageData[index + 2] * alpha) + 255 * (255 - alpha)) / 255)
    };
    pixel.lab = rgbToLab(pixel);
    cells.push(pixel);
    pixels.push(pixel);
  }

  return { pixels, cells };
}

function quantizePixels(pixels, maxColors) {
  if (!pixels.length) return [];

  const bucketMap = new Map();
  pixels.forEach((pixel) => {
    const key = `${pixel.r >> 3},${pixel.g >> 3},${pixel.b >> 3}`;
    const item = bucketMap.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    item.r += pixel.r;
    item.g += pixel.g;
    item.b += pixel.b;
    item.count += 1;
    bucketMap.set(key, item);
  });

  const buckets = [...bucketMap.values()]
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.count),
      g: Math.round(bucket.g / bucket.count),
      b: Math.round(bucket.b / bucket.count),
      count: bucket.count
    }))
    .sort((a, b) => b.count - a.count);

  const total = Math.min(maxColors, buckets.length);
  let centers = buckets.slice(0, total).map((bucket) => {
    const rgb = { r: bucket.r, g: bucket.g, b: bucket.b };
    return { ...rgb, lab: rgbToLab(rgb) };
  });

  // Small k-means pass: enough for stable craft palettes without freezing big grids.
  for (let pass = 0; pass < 7; pass += 1) {
    const groups = centers.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    pixels.forEach((pixel) => {
      let bestIndex = 0;
      let bestDistance = Infinity;
      centers.forEach((center, index) => {
        const distance = labDistance(pixel.lab, center.lab);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      groups[bestIndex].r += pixel.r;
      groups[bestIndex].g += pixel.g;
      groups[bestIndex].b += pixel.b;
      groups[bestIndex].count += 1;
    });

    centers = centers.map((center, index) => {
      const group = groups[index];
      if (!group.count) return center;
      const rgb = {
        r: Math.round(group.r / group.count),
        g: Math.round(group.g / group.count),
        b: Math.round(group.b / group.count)
      };
      return { ...rgb, lab: rgbToLab(rgb) };
    });
  }

  return centers;
}

function closestPaletteColor(pixel, palette) {
  let best = palette[0];
  let bestDistance = Infinity;

  palette.forEach((color) => {
    const distance = labDistance(pixel.lab, color.lab);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  });

  return best;
}

function makeApproxColor(rgb, index) {
  const hex = rgbToHex(rgb);
  return {
    code: `C${String(index + 1).padStart(2, "0")}`,
    name: "近似色",
    hex,
    rgb: hexToRgb(hex),
    lab: rgbToLab(hexToRgb(hex))
  };
}

function buildPatternGrid(width, height, cells, colors) {
  const rows = [];
  const counts = new Map();

  for (let row = 0; row < height; row += 1) {
    const line = [];
    for (let col = 0; col < width; col += 1) {
      const pixel = cells[row * width + col];
      if (!pixel) {
        line.push(null);
        continue;
      }
      const color = closestPaletteColor(pixel, colors);
      line.push(color);
      const existing = counts.get(color.code) || { color, count: 0 };
      existing.count += 1;
      counts.set(color.code, existing);
    }
    rows.push(line);
  }

  return { rows, counts: [...counts.values()].sort((a, b) => b.count - a.count) };
}

async function generatePattern() {
  if (!source) return;

  window.clearTimeout(pendingGenerate);
  pendingGenerate = window.setTimeout(() => {
    normalizeGridInputs();
    if (sizeMode === "physical") updateGridSizeFromPhysical();

    const width = clampNumber(els.gridWidth.value, MIN_GRID, MAX_GRID, 48);
    const height = clampNumber(els.gridHeight.value, MIN_GRID, MAX_GRID, 48);
    const maxColors = clampNumber(els.maxColors.value, 2, 48, 24);
    els.maxColors.value = maxColors;
    setStatus("正在生成拼豆图纸...");

    try {
      const imageData = sampleImage(width, height);
      const { pixels, cells } = buildPixels(imageData);
      const colorMode = els.colorMode.value;
      const sourceColors = colorMode === "palette"
        ? beadPalette
        : quantizePixels(pixels, maxColors).map(makeApproxColor);
      const limitedColors = colorMode === "palette"
        ? quantizePixels(pixels, maxColors).map((color) => closestPaletteColor(color, beadPalette))
        : sourceColors;
      const uniqueLimited = [...new Map(limitedColors.map((color) => [color.code || color.hex, color])).values()];
      const { rows, counts } = buildPatternGrid(width, height, cells, uniqueLimited.length ? uniqueLimited : sourceColors);
      const beadMm = Number(els.beadSize.value);

      pattern = {
        name: source.name || "bead-pattern",
        width,
        height,
        beadMm,
        rows,
        counts,
        finishedWidthCm: (width * beadMm) / 10,
        finishedHeightCm: (height * beadMm) / 10
      };

      renderPattern();
      renderColorBreakdown();
      setStatus(`已生成 ${width} × ${height} 图纸。`);
      els.downloadBtn.disabled = false;
      els.emptyState.classList.add("hidden");
    } catch (error) {
      setStatus(error.message || "生成失败，请降低点阵尺寸后重试。", "error");
    }
  }, 80);
}

function renderPattern(targetCtx = ctx, options = {}) {
  if (!pattern) return;

  const showGrid = options.showGrid ?? els.showGrid.checked;
  const showCodes = options.showCodes ?? els.showCodes.checked;
  const exportScale = options.exportScale || 1;
  const padding = 38 * exportScale;
  const titleHeight = 56 * exportScale;
  const cellSize = Math.max(8 * exportScale, Math.floor((1200 * exportScale - padding * 2) / Math.max(pattern.width, pattern.height)));
  const boardWidth = pattern.width * cellSize;
  const boardHeight = pattern.height * cellSize;
  const canvasWidth = boardWidth + padding * 2;
  const canvasHeight = boardHeight + padding * 2 + titleHeight;

  targetCtx.canvas.width = canvasWidth;
  targetCtx.canvas.height = canvasHeight;
  targetCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  targetCtx.fillStyle = "#ffffff";
  targetCtx.fillRect(0, 0, canvasWidth, canvasHeight);

  targetCtx.fillStyle = "#17202a";
  targetCtx.font = `${18 * exportScale}px Microsoft YaHei, Arial`;
  targetCtx.fillText(`${pattern.width} × ${pattern.height} 拼豆图纸`, padding, 30 * exportScale);
  targetCtx.fillStyle = "#64748b";
  targetCtx.font = `${12 * exportScale}px Microsoft YaHei, Arial`;
  targetCtx.fillText(`${pattern.finishedWidthCm.toFixed(1)} × ${pattern.finishedHeightCm.toFixed(1)} cm / ${pattern.beadMm}mm 拼豆`, padding, 50 * exportScale);

  const x0 = padding;
  const y0 = padding + titleHeight;
  targetCtx.fillStyle = "#f8fafc";
  targetCtx.fillRect(x0, y0, boardWidth, boardHeight);
  targetCtx.textAlign = "center";
  targetCtx.textBaseline = "middle";

  for (let row = 0; row < pattern.height; row += 1) {
    for (let col = 0; col < pattern.width; col += 1) {
      const color = pattern.rows[row][col];
      const x = x0 + col * cellSize;
      const y = y0 + row * cellSize;

      if (color) {
        targetCtx.fillStyle = color.hex;
        targetCtx.fillRect(x, y, cellSize, cellSize);
      } else {
        targetCtx.fillStyle = "#ffffff";
        targetCtx.fillRect(x, y, cellSize, cellSize);
      }

      if (showCodes && color && cellSize >= 16 * exportScale) {
        const rgb = color.rgb || hexToRgb(color.hex);
        const luminance = (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114);
        targetCtx.fillStyle = luminance > 150 ? "#111827" : "#ffffff";
        targetCtx.font = `${Math.max(7 * exportScale, cellSize * 0.26)}px Arial`;
        targetCtx.fillText(color.code, x + cellSize / 2, y + cellSize / 2);
      }
    }
  }

  if (showGrid) {
    targetCtx.strokeStyle = "rgba(23, 32, 42, 0.28)";
    targetCtx.lineWidth = Math.max(1, exportScale);
    targetCtx.beginPath();
    for (let col = 0; col <= pattern.width; col += 1) {
      const x = x0 + col * cellSize;
      targetCtx.moveTo(x, y0);
      targetCtx.lineTo(x, y0 + boardHeight);
    }
    for (let row = 0; row <= pattern.height; row += 1) {
      const y = y0 + row * cellSize;
      targetCtx.moveTo(x0, y);
      targetCtx.lineTo(x0 + boardWidth, y);
    }
    targetCtx.stroke();
  }

  if (targetCtx === ctx) {
    els.canvas.style.width = `${Math.round(canvasWidth * Number(els.zoomSlider.value) / 100)}px`;
    els.canvas.style.height = `${Math.round(canvasHeight * Number(els.zoomSlider.value) / 100)}px`;
    updateStats();
  }
}

function updateStats() {
  if (!pattern) return;
  const total = pattern.counts.reduce((sum, item) => sum + item.count, 0);
  els.patternTitle.textContent = `${pattern.width} × ${pattern.height} 拼豆图纸`;
  els.beadCount.textContent = total;
  els.colorCount.textContent = pattern.counts.length;
  els.finishedSize.textContent = `${pattern.finishedWidthCm.toFixed(1)}×${pattern.finishedHeightCm.toFixed(1)}cm`;
  els.paletteNote.textContent = pattern.counts.length ? `${pattern.counts.length} 种颜色` : "暂无用色";
}

function renderColorBreakdown() {
  els.colorBreakdown.innerHTML = "";

  if (!pattern || !pattern.counts.length) {
    const empty = document.createElement("p");
    empty.className = "status-text";
    empty.textContent = "暂无用色";
    els.colorBreakdown.append(empty);
    return;
  }

  pattern.counts.forEach(({ color, count }) => {
    const item = document.createElement("div");
    item.className = "color-item";

    const chip = document.createElement("span");
    chip.className = "color-chip";
    chip.style.background = color.hex;

    const name = document.createElement("span");
    name.textContent = `${color.name} ${color.hex.toUpperCase()}`;

    const code = document.createElement("span");
    code.className = "color-code";
    code.textContent = color.code;

    const total = document.createElement("span");
    total.className = "color-count";
    total.textContent = `${count} 颗`;

    item.append(chip, name, code, total);
    els.colorBreakdown.append(item);
  });
}

function downloadPng() {
  if (!pattern) return;
  const exportCanvas = document.createElement("canvas");
  const exportCtx = exportCanvas.getContext("2d");
  renderPattern(exportCtx, {
    showGrid: true,
    showCodes: els.exportCodes.checked,
    exportScale: 2
  });

  const link = document.createElement("a");
  const safeName = (pattern.name || "bead-pattern").replace(/[\\/:*?"<>|]+/g, "-");
  link.download = `${safeName}-${pattern.width}x${pattern.height}-bead-pattern.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
}

function setSizeMode(mode) {
  sizeMode = mode;
  document.querySelectorAll("[data-size-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.sizeMode === mode);
  });
  els.gridSizeControls.classList.toggle("hidden", mode !== "grid");
  els.physicalSizeControls.classList.toggle("hidden", mode !== "physical");
  if (mode === "physical") updatePhysicalSizeFromGrid();
}

function bindEvents() {
  els.imageUpload.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) handleFile(file);
  });

  ["dragenter", "dragover"].forEach((name) => {
    els.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((name) => {
    els.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("dragging");
    });
  });

  els.dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  document.querySelectorAll("[data-size-mode]").forEach((button) => {
    button.addEventListener("click", () => setSizeMode(button.dataset.sizeMode));
  });

  els.gridWidth.addEventListener("input", () => {
    syncRatio("width");
    scheduleGenerate();
  });
  els.gridHeight.addEventListener("input", () => {
    syncRatio("height");
    scheduleGenerate();
  });
  els.finishedWidth.addEventListener("input", () => {
    if (sizeMode === "physical") updateGridSizeFromPhysical();
    if (els.lockRatio.checked && source) syncRatio("width");
    scheduleGenerate();
  });
  els.finishedHeight.addEventListener("input", () => {
    if (sizeMode === "physical") updateGridSizeFromPhysical();
    if (els.lockRatio.checked && source) syncRatio("height");
    scheduleGenerate();
  });

  [els.beadSize, els.maxColors, els.fitMode, els.colorMode, els.backgroundMode, els.customBackground].forEach((input) => {
    input.addEventListener("input", () => {
      els.customBackgroundWrap.classList.toggle("hidden", els.backgroundMode.value !== "custom");
      if (sizeMode === "physical") updateGridSizeFromPhysical();
      else updatePhysicalSizeFromGrid();
      scheduleGenerate();
    });
  });

  [els.showGrid, els.showCodes, els.zoomSlider].forEach((input) => {
    input.addEventListener("input", () => renderPattern());
  });

  els.generateBtn.addEventListener("click", generatePattern);
  els.downloadBtn.addEventListener("click", downloadPng);
}

function scheduleGenerate() {
  if (!source) return;
  generatePattern();
}

function init() {
  bindEvents();
  updatePhysicalSizeFromGrid();
  renderColorBreakdown();
}

init();
