import { BEAD_PALETTE, BeadColor, PALETTE_BY_HEX } from "./palette";

export type Cell = { color: BeadColor | null; external: boolean };
export type Grid = Cell[][];
export type FitMode = "cover" | "contain";
export type SampleMode = "dominant" | "average";

export type EngineSettings = {
  width: number;
  preserveAspect: boolean;
  colorLimit: number;
  mergeStrength: number;
  brightness: number;
  contrast: number;
  saturation: number;
  removeBackground: boolean;
  backgroundTolerance: number;
  fit: FitMode;
  sampleMode: SampleMode;
  cropX: number;
  cropY: number;
};

export type ColorStat = { color: BeadColor; count: number };

export function rgbFromHex(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  // A light-weight perceptual distance: green differences matter most to human vision.
  const redMean = (a.r + b.r) / 2;
  const red = a.r - b.r;
  const green = a.g - b.g;
  const blue = a.b - b.b;
  return Math.sqrt((2 + redMean / 256) * red * red + 4 * green * green + (2 + (255 - redMean) / 256) * blue * blue);
}

export function nearestColor(rgb: { r: number; g: number; b: number }, palette: BeadColor[] = BEAD_PALETTE) {
  if (!palette.length) throw new Error("至少需要保留一种库存色");
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const current = colorDistance(rgb, rgbFromHex(color.hex));
    if (current < bestDistance) {
      bestDistance = current;
      best = color;
    }
  }
  return best;
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

export function computeGridSize(sourceWidth: number, sourceHeight: number, width: number, preserveAspect: boolean) {
  const safeWidth = Math.max(8, Math.min(100, Math.round(width)));
  if (!preserveAspect || !sourceWidth || !sourceHeight) return { width: safeWidth, height: safeWidth };
  return {
    width: safeWidth,
    height: Math.max(8, Math.min(100, Math.round((safeWidth * sourceHeight) / sourceWidth))),
  };
}

function tunePixel(r: number, g: number, b: number, settings: EngineSettings) {
  let rr = r * settings.brightness;
  let gg = g * settings.brightness;
  let bb = b * settings.brightness;
  rr = (rr - 128) * settings.contrast + 128;
  gg = (gg - 128) * settings.contrast + 128;
  bb = (bb - 128) * settings.contrast + 128;
  const luminance = rr * 0.299 + gg * 0.587 + bb * 0.114;
  rr = luminance + (rr - luminance) * settings.saturation;
  gg = luminance + (gg - luminance) * settings.saturation;
  bb = luminance + (bb - luminance) * settings.saturation;
  return {
    r: Math.max(0, Math.min(255, rr)),
    g: Math.max(0, Math.min(255, gg)),
    b: Math.max(0, Math.min(255, bb)),
  };
}

function sourceBounds(
  x: number,
  y: number,
  sourceWidth: number,
  sourceHeight: number,
  gridWidth: number,
  gridHeight: number,
  settings: EngineSettings,
) {
  const scale = settings.fit === "cover"
    ? Math.max(gridWidth / sourceWidth, gridHeight / sourceHeight)
    : Math.min(gridWidth / sourceWidth, gridHeight / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = settings.fit === "cover"
    ? (gridWidth - renderedWidth) * (settings.cropX / 100)
    : (gridWidth - renderedWidth) / 2;
  const offsetY = settings.fit === "cover"
    ? (gridHeight - renderedHeight) * (settings.cropY / 100)
    : (gridHeight - renderedHeight) / 2;
  const left = (x - offsetX) / scale;
  const right = (x + 1 - offsetX) / scale;
  const top = (y - offsetY) / scale;
  const bottom = (y + 1 - offsetY) / scale;
  if (right <= 0 || bottom <= 0 || left >= sourceWidth || top >= sourceHeight) return null;
  return {
    left: Math.max(0, left),
    right: Math.min(sourceWidth, right),
    top: Math.max(0, top),
    bottom: Math.min(sourceHeight, bottom),
  };
}

function sampleCell(
  pixels: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  bounds: { left: number; right: number; top: number; bottom: number } | null,
  settings: EngineSettings,
) {
  if (!bounds) return null;
  const xSamples = Math.max(2, Math.min(7, Math.ceil(bounds.right - bounds.left)));
  const ySamples = Math.max(2, Math.min(7, Math.ceil(bounds.bottom - bounds.top)));
  const buckets = new Map<string, { r: number; g: number; b: number; weight: number }>();
  let average = { r: 0, g: 0, b: 0, weight: 0 };
  for (let sy = 0; sy < ySamples; sy += 1) {
    for (let sx = 0; sx < xSamples; sx += 1) {
      const px = Math.max(0, Math.min(sourceWidth - 1, Math.floor(bounds.left + ((sx + 0.5) / xSamples) * (bounds.right - bounds.left))));
      const py = Math.max(0, Math.min(sourceHeight - 1, Math.floor(bounds.top + ((sy + 0.5) / ySamples) * (bounds.bottom - bounds.top))));
      const index = (py * sourceWidth + px) * 4;
      const alpha = pixels[index + 3] / 255;
      if (alpha < 0.14) continue;
      const tuned = tunePixel(pixels[index], pixels[index + 1], pixels[index + 2], settings);
      average = {
        r: average.r + tuned.r * alpha,
        g: average.g + tuned.g * alpha,
        b: average.b + tuned.b * alpha,
        weight: average.weight + alpha,
      };
      const key = `${Math.round(tuned.r / 20)}-${Math.round(tuned.g / 20)}-${Math.round(tuned.b / 20)}`;
      const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 };
      bucket.r += tuned.r * alpha;
      bucket.g += tuned.g * alpha;
      bucket.b += tuned.b * alpha;
      bucket.weight += alpha;
      buckets.set(key, bucket);
    }
  }
  if (average.weight < xSamples * ySamples * 0.08) return null;
  const winner = settings.sampleMode === "average"
    ? average
    : [...buckets.values()].sort((a, b) => b.weight - a.weight)[0] ?? average;
  return { r: winner.r / winner.weight, g: winner.g / winner.weight, b: winner.b / winner.weight };
}

export function markExternalBackground(grid: Grid, tolerance: number): Grid {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (!rows || !cols) return grid;
  const next = cloneGrid(grid);
  const edgeCounts = new Map<string, { color: BeadColor; count: number }>();
  const add = (cell: Cell) => {
    if (!cell.color || cell.external) return;
    const current = edgeCounts.get(cell.color.hex);
    edgeCounts.set(cell.color.hex, { color: cell.color, count: (current?.count ?? 0) + 1 });
  };
  for (let x = 0; x < cols; x += 1) { add(grid[0][x]); add(grid[rows - 1][x]); }
  for (let y = 1; y < rows - 1; y += 1) { add(grid[y][0]); add(grid[y][cols - 1]); }
  const dominant = [...edgeCounts.values()].sort((a, b) => b.count - a.count)[0]?.color;
  if (!dominant) return next;
  const dominantRgb = rgbFromHex(dominant.hex);
  const visited = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const queue: Array<[number, number]> = [];
  const maybeQueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows || visited[y][x]) return;
    visited[y][x] = true;
    const cell = grid[y][x];
    if (!cell.color || cell.external) return;
    if (colorDistance(rgbFromHex(cell.color.hex), dominantRgb) <= tolerance * 2.8) queue.push([x, y]);
  };
  for (let x = 0; x < cols; x += 1) { maybeQueue(x, 0); maybeQueue(x, rows - 1); }
  for (let y = 0; y < rows; y += 1) { maybeQueue(0, y); maybeQueue(cols - 1, y); }
  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head];
    next[y][x].external = true;
    maybeQueue(x - 1, y); maybeQueue(x + 1, y); maybeQueue(x, y - 1); maybeQueue(x, y + 1);
  }
  return next;
}

export function compactPalette(grid: Grid, colorLimit: number, palette: BeadColor[]): Grid {
  const counts = new Map<string, number>();
  for (const row of grid) for (const cell of row) {
    if (!cell.external && cell.color) counts.set(cell.color.hex, (counts.get(cell.color.hex) ?? 0) + 1);
  }
  const allowed = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, colorLimit))
    .map(([hex]) => palette.find((color) => color.hex === hex) ?? PALETTE_BY_HEX.get(hex))
    .filter((color): color is BeadColor => Boolean(color));
  if (!allowed.length) return grid;
  return grid.map((row) => row.map((cell) => {
    if (cell.external || !cell.color || allowed.some((color) => color.hex === cell.color?.hex)) return { ...cell };
    return { ...cell, color: nearestColor(rgbFromHex(cell.color.hex), allowed) };
  }));
}

export function mergeIsolatedColors(grid: Grid, strength: number): Grid {
  if (strength < 8) return cloneGrid(grid);
  const next = cloneGrid(grid);
  for (let y = 0; y < grid.length; y += 1) for (let x = 0; x < (grid[0]?.length ?? 0); x += 1) {
    const current = grid[y][x];
    if (!current.color || current.external) continue;
    const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]]
      .map(([dx, dy]) => grid[y + dy]?.[x + dx])
      .filter((cell): cell is Cell => Boolean(cell?.color && !cell.external));
    const counts = new Map<string, { color: BeadColor; count: number }>();
    for (const neighbor of neighbors) {
      const color = neighbor.color!;
      counts.set(color.hex, { color, count: (counts.get(color.hex)?.count ?? 0) + 1 });
    }
    const winner = [...counts.values()].sort((a, b) => b.count - a.count)[0];
    if (winner && winner.count >= 3 && winner.color.hex !== current.color.hex && colorDistance(rgbFromHex(winner.color.hex), rgbFromHex(current.color.hex)) < strength * 6) {
      next[y][x].color = winner.color;
    }
  }
  return next;
}

export function processImageData(
  imageData: ImageData,
  gridWidth: number,
  gridHeight: number,
  settings: EngineSettings,
  palette: BeadColor[],
) {
  const activePalette = palette.length ? palette : BEAD_PALETTE;
  let grid: Grid = Array.from({ length: gridHeight }, (_, y) => Array.from({ length: gridWidth }, (_, x) => {
    const bounds = sourceBounds(x, y, imageData.width, imageData.height, gridWidth, gridHeight, settings);
    const sampled = sampleCell(imageData.data, imageData.width, imageData.height, bounds, settings);
    return sampled ? { color: nearestColor(sampled, activePalette), external: false } : { color: null, external: true };
  }));
  // Background removal happens before palette limiting so background colors never consume the user's color budget.
  if (settings.removeBackground) grid = markExternalBackground(grid, settings.backgroundTolerance);
  grid = compactPalette(grid, settings.colorLimit, activePalette);
  grid = mergeIsolatedColors(grid, settings.mergeStrength);
  return grid;
}

export function floodFillErase(grid: Grid, startX: number, startY: number): Grid {
  const target = grid[startY]?.[startX];
  if (!target || target.external || !target.color) return grid;
  const next = cloneGrid(grid);
  const targetHex = target.color.hex;
  const visited = new Set<string>();
  const queue: Array<[number, number]> = [[startX, startY]];
  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head];
    const key = `${x}-${y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const cell = grid[y]?.[x];
    if (!cell || cell.external || cell.color?.hex !== targetHex) continue;
    next[y][x] = { color: null, external: true };
    queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  return next;
}

export function replaceGridColor(grid: Grid, fromHex: string, to: BeadColor | null): Grid {
  return grid.map((row) => row.map((cell) => !cell.external && cell.color?.hex === fromHex
    ? to ? { color: to, external: false } : { color: null, external: true }
    : { ...cell }));
}

export function colorStats(grid: Grid): ColorStat[] {
  const result = new Map<string, ColorStat>();
  for (const row of grid) for (const cell of row) if (!cell.external && cell.color) {
    result.set(cell.color.hex, { color: cell.color, count: (result.get(cell.color.hex)?.count ?? 0) + 1 });
  }
  return [...result.values()].sort((a, b) => b.count - a.count);
}

export function sanitizeGrid(input: unknown): Grid | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) return null;
  const width = Array.isArray(input[0]) ? input[0].length : 0;
  if (width < 1 || width > 100 || input.some((row) => !Array.isArray(row) || row.length !== width)) return null;
  const grid: Grid = [];
  for (const row of input) {
    const nextRow: Cell[] = [];
    for (const raw of row as unknown[]) {
      if (!raw || typeof raw !== "object") return null;
      const value = raw as { hex?: unknown; external?: unknown };
      const color = typeof value.hex === "string" ? PALETTE_BY_HEX.get(value.hex.toUpperCase()) ?? null : null;
      const external = Boolean(value.external) || !color;
      nextRow.push({ color, external });
    }
    grid.push(nextRow);
  }
  return grid;
}

export function serializableGrid(grid: Grid) {
  return grid.map((row) => row.map((cell) => ({ hex: cell.color?.hex ?? null, external: cell.external })));
}
