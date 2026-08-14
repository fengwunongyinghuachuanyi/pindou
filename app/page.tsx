"use client";

import {
  ChangeEvent,
  DragEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BEAD_PALETTE, BRAND_OPTIONS, BeadColor, Brand } from "./palette";

type Cell = { color: BeadColor | null; external: boolean };
type Grid = Cell[][];
type Tool = "paint" | "erase" | "picker" | "replace";
type FitMode = "cover" | "contain";

type Settings = {
  size: number;
  colorLimit: number;
  merge: number;
  brightness: number;
  contrast: number;
  saturation: number;
  removeBackground: boolean;
  backgroundTolerance: number;
  fit: FitMode;
};

const INITIAL_SETTINGS: Settings = {
  size: 29,
  colorLimit: 18,
  merge: 26,
  brightness: 1,
  contrast: 1.08,
  saturation: 1.08,
  removeBackground: true,
  backgroundTolerance: 54,
  fit: "cover",
};

const DEMO_PATTERN = [
  "............",
  "...PP..PP...",
  "..PPPPPPPP..",
  ".PPWWPPWWPP.",
  ".PPBKPPKBPP.",
  ".PPPPPPPPPP.",
  "..PPWPPWPP..",
  "...PPRRPP...",
  "....PPPP....",
  "....GPPG....",
  "...GG..GG...",
  "............",
];

function rgbFromHex(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function distance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function nearestColor(rgb: { r: number; g: number; b: number }, palette = BEAD_PALETTE) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const current = distance(rgb, rgbFromHex(color.hex));
    if (current < bestDistance) {
      bestDistance = current;
      best = color;
    }
  }
  return best;
}

function tunePixel(r: number, g: number, b: number, settings: Settings) {
  const brightness = settings.brightness;
  const contrast = settings.contrast;
  const saturation = settings.saturation;
  let rr = r * brightness;
  let gg = g * brightness;
  let bb = b * brightness;
  rr = (rr - 128) * contrast + 128;
  gg = (gg - 128) * contrast + 128;
  bb = (bb - 128) * contrast + 128;
  const luminance = rr * 0.299 + gg * 0.587 + bb * 0.114;
  rr = luminance + (rr - luminance) * saturation;
  gg = luminance + (gg - luminance) * saturation;
  bb = luminance + (bb - luminance) * saturation;
  return {
    r: Math.max(0, Math.min(255, rr)),
    g: Math.max(0, Math.min(255, gg)),
    b: Math.max(0, Math.min(255, bb)),
  };
}

function compactPalette(grid: Grid, colorLimit: number): Grid {
  const counts = new Map<string, number>();
  for (const row of grid) {
    for (const cell of row) {
      if (cell.color) counts.set(cell.color.hex, (counts.get(cell.color.hex) ?? 0) + 1);
    }
  }
  const allowed = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, colorLimit)
    .map(([hex]) => BEAD_PALETTE.find((color) => color.hex === hex)!)
    .filter(Boolean);
  if (!allowed.length) return grid;
  return grid.map((row) =>
    row.map((cell) => {
      if (!cell.color || allowed.some((color) => color.hex === cell.color!.hex)) return cell;
      return { ...cell, color: nearestColor(rgbFromHex(cell.color.hex), allowed) };
    }),
  );
}

function mergeIsolatedColors(grid: Grid, strength: number): Grid {
  if (strength < 8) return grid;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const next = grid.map((row) => row.map((cell) => ({ ...cell })));
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const current = grid[y][x].color;
      if (!current) continue;
      const neighbors: BeadColor[] = [];
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const neighbor = grid[y + dy]?.[x + dx]?.color;
        if (neighbor) neighbors.push(neighbor);
      }
      const counts = new Map<string, { color: BeadColor; count: number }>();
      neighbors.forEach((color) => {
        const found = counts.get(color.hex);
        counts.set(color.hex, { color, count: (found?.count ?? 0) + 1 });
      });
      const winner = [...counts.values()].sort((a, b) => b.count - a.count)[0];
      if (
        winner &&
        winner.count >= 3 &&
        winner.color.hex !== current.hex &&
        distance(rgbFromHex(winner.color.hex), rgbFromHex(current.hex)) < strength * 3.4
      ) {
        next[y][x].color = winner.color;
      }
    }
  }
  return next;
}

function markExternalBackground(grid: Grid, tolerance: number): Grid {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (!rows || !cols) return grid;
  const edgeCounts = new Map<string, { color: BeadColor; count: number }>();
  const addEdge = (cell: Cell) => {
    if (!cell.color) return;
    const current = edgeCounts.get(cell.color.hex);
    edgeCounts.set(cell.color.hex, { color: cell.color, count: (current?.count ?? 0) + 1 });
  };
  for (let x = 0; x < cols; x += 1) {
    addEdge(grid[0][x]);
    addEdge(grid[rows - 1][x]);
  }
  for (let y = 1; y < rows - 1; y += 1) {
    addEdge(grid[y][0]);
    addEdge(grid[y][cols - 1]);
  }
  const dominant = [...edgeCounts.values()].sort((a, b) => b.count - a.count)[0]?.color;
  if (!dominant) return grid;
  const dominantRgb = rgbFromHex(dominant.hex);
  const next = grid.map((row) => row.map((cell) => ({ ...cell, external: false })));
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const queue: Array<[number, number]> = [];
  const maybeQueue = (x: number, y: number) => {
    if (visited[y][x]) return;
    const color = grid[y][x].color;
    if (color && distance(rgbFromHex(color.hex), dominantRgb) <= tolerance) {
      visited[y][x] = true;
      queue.push([x, y]);
    }
  };
  for (let x = 0; x < cols; x += 1) {
    maybeQueue(x, 0);
    maybeQueue(x, rows - 1);
  }
  for (let y = 0; y < rows; y += 1) {
    maybeQueue(0, y);
    maybeQueue(cols - 1, y);
  }
  while (queue.length) {
    const [x, y] = queue.shift()!;
    next[y][x].external = true;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) maybeQueue(nx, ny);
    }
  }
  return next;
}

function processImage(image: HTMLImageElement, settings: Settings): Grid {
  const size = settings.size;
  const sampling = 3;
  const canvas = document.createElement("canvas");
  canvas.width = size * sampling;
  canvas.height = size * sampling;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const imageRatio = image.width / image.height;
  let drawWidth = canvas.width;
  let drawHeight = canvas.height;
  if ((settings.fit === "cover" && imageRatio > 1) || (settings.fit === "contain" && imageRatio < 1)) {
    drawWidth = canvas.height * imageRatio;
  } else {
    drawHeight = canvas.width / imageRatio;
  }
  context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let grid: Grid = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
      for (let sy = 0; sy < sampling; sy += 1) {
        for (let sx = 0; sx < sampling; sx += 1) {
          const index = ((y * sampling + sy) * canvas.width + (x * sampling + sx)) * 4;
          if (pixels[index + 3] < 40) continue;
          const tuned = tunePixel(pixels[index], pixels[index + 1], pixels[index + 2], settings);
          const key = `${Math.round(tuned.r / 24)}-${Math.round(tuned.g / 24)}-${Math.round(tuned.b / 24)}`;
          const bucket = buckets.get(key);
          buckets.set(key, {
            r: (bucket?.r ?? 0) + tuned.r,
            g: (bucket?.g ?? 0) + tuned.g,
            b: (bucket?.b ?? 0) + tuned.b,
            count: (bucket?.count ?? 0) + 1,
          });
        }
      }
      const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0] ?? {
        r: 255,
        g: 255,
        b: 255,
        count: 1,
      };
      return {
        color: nearestColor({
          r: dominant.r / dominant.count,
          g: dominant.g / dominant.count,
          b: dominant.b / dominant.count,
        }),
        external: false,
      };
    }),
  );
  grid = compactPalette(grid, settings.colorLimit);
  grid = mergeIsolatedColors(grid, settings.merge);
  if (settings.removeBackground) grid = markExternalBackground(grid, settings.backgroundTolerance);
  return grid;
}

function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function formatTime(minutes: number) {
  if (minutes < 60) return `约 ${Math.max(1, Math.round(minutes))} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return `约 ${hours} 小时${rest ? ` ${rest} 分` : ""}`;
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const isDrawingRef = useRef(false);
  const [sourceVersion, setSourceVersion] = useState(0);
  const [fileName, setFileName] = useState("");
  const [sourcePreview, setSourcePreview] = useState("");
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [brand, setBrand] = useState<Brand>("MARD");
  const [grid, setGrid] = useState<Grid>([]);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tool, setTool] = useState<Tool>("paint");
  const [selectedColor, setSelectedColor] = useState<BeadColor>(BEAD_PALETTE[18]);
  const [hovered, setHovered] = useState<{ x: number; y: number; cell: Cell } | null>(null);
  const [zoom, setZoom] = useState(100);
  const [showCodes, setShowCodes] = useState(true);
  const [undoStack, setUndoStack] = useState<Grid[]>([]);
  const [redoStack, setRedoStack] = useState<Grid[]>([]);
  const [prompt, setPrompt] = useState("");
  const [promptNotes, setPromptNotes] = useState<string[]>([]);
  const [focusMode, setFocusMode] = useState(false);
  const [completedCells, setCompletedCells] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);

  const hasImage = sourceVersion > 0;

  const colorStats = useMemo(() => {
    const result = new Map<string, { color: BeadColor; count: number }>();
    grid.forEach((row) =>
      row.forEach((cell) => {
        if (!cell.external && cell.color) {
          const current = result.get(cell.color.hex);
          result.set(cell.color.hex, { color: cell.color, count: (current?.count ?? 0) + 1 });
        }
      }),
    );
    return [...result.values()].sort((a, b) => b.count - a.count);
  }, [grid]);

  const totalBeads = useMemo(() => colorStats.reduce((sum, item) => sum + item.count, 0), [colorStats]);
  const occupiedRatio = grid.length ? totalBeads / (grid.length * grid[0].length) : 0.72;
  const makeMinutes = totalBeads * 0.11;
  const completedCount = completedCells.size;
  const focusProgress = totalBeads ? Math.min(100, Math.round((completedCount / totalBeads) * 100)) : 0;

  useEffect(() => {
    if (!sourceImageRef.current || !hasImage) return;
    setProcessing(true);
    const timer = window.setTimeout(() => {
      const next = processImage(sourceImageRef.current!, settings);
      setGrid(next);
      setUndoStack([]);
      setRedoStack([]);
      setCompletedCells(new Set());
      setProcessing(false);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [sourceVersion, settings, hasImage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid.length) return;
    const rows = grid.length;
    const cols = grid[0].length;
    const baseCell = settings.size <= 32 ? 20 : 13;
    const cellSize = Math.max(7, Math.round(baseCell * (zoom / 100)));
    const ratio = window.devicePixelRatio || 1;
    canvas.width = cols * cellSize * ratio;
    canvas.height = rows * cellSize * ratio;
    canvas.style.width = `${cols * cellSize}px`;
    canvas.style.height = `${rows * cellSize}px`;
    const context = canvas.getContext("2d")!;
    context.scale(ratio, ratio);
    context.fillStyle = "#f7f7f3";
    context.fillRect(0, 0, cols * cellSize, rows * cellSize);
    grid.forEach((row, y) =>
      row.forEach((cell, x) => {
        const px = x * cellSize;
        const py = y * cellSize;
        if (cell.external || !cell.color) {
          context.fillStyle = (x + y) % 2 ? "#f5f5f0" : "#ebebe5";
          context.fillRect(px, py, cellSize, cellSize);
        } else {
          context.fillStyle = cell.color.hex;
          context.fillRect(px, py, cellSize, cellSize);
          context.fillStyle = "rgba(255,255,255,.28)";
          context.beginPath();
          context.arc(px + cellSize * 0.33, py + cellSize * 0.3, Math.max(1, cellSize * 0.09), 0, Math.PI * 2);
          context.fill();
          if (showCodes && cellSize >= 17) {
            const rgb = rgbFromHex(cell.color.hex);
            const dark = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114 < 145;
            context.fillStyle = dark ? "rgba(255,255,255,.92)" : "rgba(20,20,20,.78)";
            context.font = `600 ${Math.max(7, cellSize * 0.32)}px ui-monospace, monospace`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(cell.color.codes[brand], px + cellSize / 2, py + cellSize / 2 + 1);
          }
          if (completedCells.has(`${x}-${y}`)) {
            context.fillStyle = "rgba(255,255,255,.68)";
            context.fillRect(px, py, cellSize, cellSize);
            context.fillStyle = "#16634a";
            context.beginPath();
            context.arc(px + cellSize / 2, py + cellSize / 2, Math.max(2, cellSize * 0.15), 0, Math.PI * 2);
            context.fill();
          }
        }
        context.strokeStyle = cellSize >= 17 ? "rgba(31,35,32,.17)" : "rgba(31,35,32,.1)";
        context.lineWidth = 0.55;
        context.strokeRect(px, py, cellSize, cellSize);
      }),
    );
  }, [grid, settings.size, zoom, showCodes, brand, completedCells]);

  const loadImage = useCallback((url: string, name: string, revoke = false) => {
    const image = new Image();
    image.onload = () => {
      if (objectUrlRef.current && objectUrlRef.current !== url) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = revoke ? url : null;
      sourceImageRef.current = image;
      setFileName(name);
      setSourcePreview(url);
      setSourceVersion((version) => version + 1);
    };
    image.src = url;
  }, []);

  const acceptFile = useCallback(
    (file?: File) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) return;
      if (file.size > 15 * 1024 * 1024) {
        window.alert("图片请控制在 15MB 以内。");
        return;
      }
      loadImage(URL.createObjectURL(file), file.name, true);
    },
    [loadImage],
  );

  const loadDemo = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 720;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 720, 720);
    gradient.addColorStop(0, "#cdeeff");
    gradient.addColorStop(1, "#fff0d9");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 720, 720);
    context.fillStyle = "#ff9f83";
    context.beginPath();
    context.arc(360, 350, 220, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#8a4c38";
    context.beginPath();
    context.moveTo(205, 220);
    context.lineTo(250, 90);
    context.lineTo(320, 205);
    context.moveTo(400, 205);
    context.lineTo(470, 90);
    context.lineTo(520, 225);
    context.fill();
    context.fillStyle = "#fff7e9";
    context.beginPath();
    context.ellipse(360, 365, 150, 175, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#22252b";
    context.beginPath();
    context.arc(305, 330, 18, 0, Math.PI * 2);
    context.arc(415, 330, 18, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#e8649e";
    context.beginPath();
    context.moveTo(345, 385);
    context.lineTo(375, 385);
    context.lineTo(360, 404);
    context.closePath();
    context.fill();
    context.strokeStyle = "#8a4c38";
    context.lineWidth = 9;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(360, 404);
    context.quadraticCurveTo(330, 438, 305, 416);
    context.moveTo(360, 404);
    context.quadraticCurveTo(390, 438, 415, 416);
    context.stroke();
    loadImage(canvas.toDataURL("image/png"), "演示-小猫.png");
  }, [loadImage]);

  const pushHistory = useCallback(() => {
    setUndoStack((stack) => [...stack.slice(-18), cloneGrid(grid)]);
    setRedoStack([]);
  }, [grid]);

  const editCell = useCallback(
    (x: number, y: number, startAction: boolean) => {
      const cell = grid[y]?.[x];
      if (!cell) return;
      if (focusMode) {
        if (cell.external || !cell.color) return;
        setCompletedCells((current) => {
          const next = new Set(current);
          const key = `${x}-${y}`;
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        return;
      }
      if (tool === "picker") {
        if (cell.color) setSelectedColor(cell.color);
        setTool("paint");
        return;
      }
      if (startAction) pushHistory();
      setGrid((current) => {
        const next = cloneGrid(current);
        const target = next[y][x];
        if (tool === "erase") {
          next[y][x] = { ...target, external: true };
        } else if (tool === "replace") {
          const from = target.color?.hex;
          if (!from) return current;
          return next.map((row) =>
            row.map((item) =>
              !item.external && item.color?.hex === from ? { color: selectedColor, external: false } : item,
            ),
          );
        } else {
          next[y][x] = { color: selectedColor, external: false };
        }
        return next;
      });
    },
    [grid, focusMode, tool, selectedColor, pushHistory],
  );

  const cellFromEvent = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !grid.length) return null;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * grid[0].length);
    const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * grid.length);
    if (x < 0 || y < 0 || x >= grid[0].length || y >= grid.length) return null;
    return { x, y, cell: grid[y][x] };
  }, [grid]);

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((stack) => [...stack, cloneGrid(grid)]);
    setGrid(cloneGrid(previous));
    setUndoStack((stack) => stack.slice(0, -1));
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((stack) => [...stack, cloneGrid(grid)]);
    setGrid(cloneGrid(next));
    setRedoStack((stack) => stack.slice(0, -1));
  };

  const applyPrompt = () => {
    const value = prompt.trim();
    if (!value || !hasImage) return;
    const notes: string[] = [];
    setSettings((current) => {
      const next = { ...current };
      if (/29|小尺寸|省时|快一点/.test(value)) {
        next.size = 29;
        notes.push("切换为 29×29 快速方案");
      }
      if (/58|更清晰|更精细|细节/.test(value)) {
        next.size = 58;
        notes.push("切换为 58×58 精细方案");
      }
      if (/颜色少|少一点颜色|简洁|大色块|好买豆/.test(value)) {
        next.colorLimit = Math.min(next.colorLimit, 12);
        next.merge = Math.max(next.merge, 46);
        notes.push("减少过渡色并合并杂色");
      }
      if (/去.*背景|白底|只保留|主体|抠图/.test(value)) {
        next.removeBackground = true;
        next.backgroundTolerance = Math.max(next.backgroundTolerance, 72);
        notes.push("清理与边缘相连的背景");
      }
      if (/鲜艳|明亮|提亮|通透/.test(value)) {
        next.saturation = 1.32;
        next.brightness = 1.08;
        notes.push("提高亮度与饱和度");
      }
      if (/轮廓|清晰|对比|眼睛|五官/.test(value)) {
        next.contrast = 1.28;
        next.merge = Math.max(next.merge, 34);
        notes.push("增强主体对比和轮廓");
      }
      if (/柔和|低饱和|莫兰迪/.test(value)) {
        next.saturation = 0.82;
        next.contrast = 0.96;
        notes.push("降低饱和度并软化对比");
      }
      if (!notes.length) {
        next.merge = Math.max(next.merge, 38);
        next.contrast = Math.max(next.contrast, 1.16);
        notes.push("已按“更干净、更可拼”的方向整理画面");
      }
      return next;
    });
    setPromptNotes(notes);
    setPrompt("");
  };

  const renderExportCanvas = () => {
    const cellSize = settings.size <= 32 ? 36 : 25;
    const margin = 48;
    const header = 96;
    const legendColumns = 3;
    const legendRows = Math.ceil(colorStats.length / legendColumns);
    const legendHeight = 72 + legendRows * 34;
    const canvas = document.createElement("canvas");
    canvas.width = grid[0].length * cellSize + margin * 2;
    canvas.height = header + grid.length * cellSize + legendHeight;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fffdf8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#17221d";
    context.font = "700 28px system-ui, sans-serif";
    context.fillText("豆搭 · 拼豆制作图纸", margin, 42);
    context.fillStyle = "#66706b";
    context.font = "14px system-ui, sans-serif";
    context.fillText(
      `${settings.size}×${settings.size} 格 · ${brand} 色号 · ${totalBeads} 颗 · 成品约 ${(settings.size * 0.5).toFixed(1)}cm`,
      margin,
      68,
    );
    grid.forEach((row, y) =>
      row.forEach((cell, x) => {
        const px = margin + x * cellSize;
        const py = header + y * cellSize;
        if (cell.external || !cell.color) {
          context.fillStyle = "#ffffff";
        } else {
          context.fillStyle = cell.color.hex;
        }
        context.fillRect(px, py, cellSize, cellSize);
        context.strokeStyle = "rgba(28,34,31,.24)";
        context.strokeRect(px, py, cellSize, cellSize);
        if (!cell.external && cell.color) {
          const rgb = rgbFromHex(cell.color.hex);
          const dark = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114 < 145;
          context.fillStyle = dark ? "white" : "#202622";
          context.font = `600 ${settings.size <= 32 ? 10 : 7}px ui-monospace, monospace`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(cell.color.codes[brand], px + cellSize / 2, py + cellSize / 2);
        }
      }),
    );
    const legendY = header + grid.length * cellSize + 44;
    context.textAlign = "left";
    context.fillStyle = "#17221d";
    context.font = "700 18px system-ui, sans-serif";
    context.fillText("用豆清单", margin, legendY - 16);
    const columnWidth = (canvas.width - margin * 2) / legendColumns;
    colorStats.forEach((item, index) => {
      const column = index % legendColumns;
      const row = Math.floor(index / legendColumns);
      const x = margin + column * columnWidth;
      const y = legendY + row * 34;
      context.fillStyle = item.color.hex;
      context.fillRect(x, y, 22, 22);
      context.strokeStyle = "rgba(0,0,0,.18)";
      context.strokeRect(x, y, 22, 22);
      context.fillStyle = "#26302b";
      context.font = "13px system-ui, sans-serif";
      context.fillText(`${item.color.codes[brand]}  ${item.color.name}  ×${item.count}`, x + 31, y + 15);
    });
    return canvas;
  };

  const exportPng = () => {
    if (!grid.length) return;
    renderExportCanvas().toBlob((blob) => blob && downloadBlob(blob, `豆搭-${settings.size}x${settings.size}-图纸.png`));
    setExportOpen(false);
  };

  const exportCsv = () => {
    const rows = [
      ["品牌", "色号", "颜色名", "HEX", "数量"],
      ...colorStats.map((item) => [brand, item.color.codes[brand], item.color.name, item.color.hex, String(item.count)]),
      ["", "", "合计", "", String(totalBeads)],
    ];
    const csv = `\ufeff${rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n")}`;
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `豆搭-${brand}-采购清单.csv`);
    setExportOpen(false);
  };

  const printPattern = () => {
    if (!grid.length) return;
    const dataUrl = renderExportCanvas().toDataURL("image/png");
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>豆搭拼豆图纸</title><style>body{margin:0;display:grid;place-items:center}img{max-width:100%;height:auto}@media print{img{width:100%}}</style></head><body><img src="${dataUrl}" onload="window.print()" /></body></html>`);
    printWindow.document.close();
    setExportOpen(false);
  };

  const candidateDetails = (size: number) => {
    const beads = Math.round(size * size * occupiedRatio);
    return {
      beads,
      minutes: beads * 0.11,
      cost: Math.max(3, beads * 0.018),
    };
  };

  const candidate29 = candidateDetails(29);
  const candidate58 = candidateDetails(58);

  return (
    <main className={`app-shell ${focusMode ? "is-focus" : ""}`}>
      <header className="topbar">
        <button className="brand-mark" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="回到顶部">
          <span className="brand-beads" aria-hidden="true"><i /><i /><i /><i /></span>
          <span><b>豆搭</b><small>BEAD STUDIO</small></span>
        </button>
        <nav className="top-actions" aria-label="顶部操作">
          {hasImage && <span className="privacy-note"><i />图片仅在本机处理</span>}
          {hasImage && (
            <button className="ghost-button" onClick={() => fileInputRef.current?.click()}>换一张图</button>
          )}
          {hasImage && (
            <button className="dark-button" onClick={() => setFocusMode(true)}>◉ 专心拼豆</button>
          )}
        </nav>
      </header>

      {!hasImage ? (
        <section className="landing">
          <div className="hero-copy">
            <span className="eyebrow"><i /> 一句话，把照片变成真正能拼的图纸</span>
            <h1>把你想留住的，<br /><em>一颗颗拼出来。</em></h1>
            <p>上传人像、宠物或旅行照，自动清理背景、匹配实体豆色号，还可以直接说“颜色少一点”继续修改。</p>
            <div className="feature-line">
              <span>29 / 58 格方案</span><span>真实品牌色号</span><span>PNG / CSV 导出</span>
            </div>
          </div>

          <div className="upload-stage">
            <div className="mosaic-shadow" />
            <div className="mini-mosaic" aria-hidden="true">
              {DEMO_PATTERN.flatMap((row, y) => row.split("").map((code, x) => (
                <i key={`${x}-${y}`} data-code={code} />
              )))}
            </div>
            <div
              className={`upload-card ${dragging ? "is-dragging" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                setDragging(false);
                acceptFile(event.dataTransfer.files[0]);
              }}
            >
              <span className="upload-icon" aria-hidden="true">↑</span>
              <h2>上传一张照片</h2>
              <p>拖到这里，或选择 JPG、PNG 图片</p>
              <button className="primary-button" onClick={() => fileInputRef.current?.click()}>选择图片</button>
              <button className="text-button" onClick={loadDemo}>没有图片？试试小猫示例 →</button>
              <small>无需登录 · 不上传原图 · 免费导出</small>
            </div>
          </div>

          <div className="landing-bottom">
            <span>01 上传照片</span><i />
            <span>02 说出想要的效果</span><i />
            <span>03 带着图纸去拼豆</span>
          </div>
        </section>
      ) : (
        <section className="studio">
          <aside className="left-panel panel">
            <div className="panel-heading">
              <div><span className="step-kicker">STEP 01</span><h2>选择制作方案</h2></div>
              <span className="file-chip" title={fileName}>已导入</span>
            </div>
            <div className="source-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sourcePreview} alt="已上传的原图预览" />
              <span>{fileName}</span>
            </div>
            <h3 className="section-label">尺寸对比</h3>
            <button className={`candidate-card ${settings.size === 29 ? "is-selected" : ""}`} onClick={() => setSettings((value) => ({ ...value, size: 29 }))}>
              <span className="radio-dot" />
              <span className="candidate-main"><b>29 × 29</b><small>快速入门 · 约 14.5 cm</small></span>
              <strong>{candidate29.beads}<small>颗</small></strong>
              <span className="candidate-meta"><i>{formatTime(candidate29.minutes)}</i><i>材料约 ¥{candidate29.cost.toFixed(0)}</i></span>
            </button>
            <button className={`candidate-card ${settings.size === 58 ? "is-selected" : ""}`} onClick={() => setSettings((value) => ({ ...value, size: 58 }))}>
              <span className="radio-dot" />
              <span className="candidate-main"><b>58 × 58</b><small>细节丰富 · 约 29 cm</small></span>
              <strong>{candidate58.beads}<small>颗</small></strong>
              <span className="candidate-meta"><i>{formatTime(candidate58.minutes)}</i><i>材料约 ¥{candidate58.cost.toFixed(0)}</i></span>
            </button>

            <div className="control-group">
              <div className="control-title"><span>颜色数量</span><b>{settings.colorLimit} 色</b></div>
              <input type="range" min="6" max="36" value={settings.colorLimit} onChange={(event) => setSettings((value) => ({ ...value, colorLimit: Number(event.target.value) }))} />
              <div className="range-labels"><span>更好制作</span><span>更多细节</span></div>
            </div>
            <div className="control-group">
              <div className="control-title"><span>杂色合并</span><b>{settings.merge}</b></div>
              <input type="range" min="0" max="70" value={settings.merge} onChange={(event) => setSettings((value) => ({ ...value, merge: Number(event.target.value) }))} />
              <div className="range-labels"><span>保留细节</span><span>色块干净</span></div>
            </div>
            <label className="toggle-row">
              <span><b>自动清理背景</b><small>去掉与图片边缘相连的底色</small></span>
              <input type="checkbox" checked={settings.removeBackground} onChange={(event) => setSettings((value) => ({ ...value, removeBackground: event.target.checked }))} />
              <i />
            </label>
            <div className="fit-switch" aria-label="图片适配方式">
              <button className={settings.fit === "cover" ? "active" : ""} onClick={() => setSettings((value) => ({ ...value, fit: "cover" }))}>填满画布</button>
              <button className={settings.fit === "contain" ? "active" : ""} onClick={() => setSettings((value) => ({ ...value, fit: "contain" }))}>保留全图</button>
            </div>
            <p className="estimate-note">估算按 5mm 豆、手工摆放测算，实际时间与材料价格会因人和门店不同。</p>
          </aside>

          <section className="canvas-panel panel">
            <div className="canvas-topline">
              <div><span className="step-kicker">STEP 02</span><h2>预览与精修</h2></div>
              <div className="canvas-status">
                <span>{settings.size} × {settings.size}</span><i />
                <span>{colorStats.length} 色</span><i />
                <span>{totalBeads} 颗</span>
              </div>
            </div>
            <div className="toolbar" role="toolbar" aria-label="图纸编辑工具">
              {([
                ["paint", "●", "画笔"],
                ["erase", "◇", "橡皮"],
                ["picker", "◎", "取色"],
                ["replace", "⇄", "换色"],
              ] as Array<[Tool, string, string]>).map(([value, icon, label]) => (
                <button key={value} className={tool === value ? "active" : ""} onClick={() => setTool(value)} title={label}><span>{icon}</span>{label}</button>
              ))}
              <span className="toolbar-divider" />
              <button onClick={undo} disabled={!undoStack.length} title="撤销"><span>↶</span></button>
              <button onClick={redo} disabled={!redoStack.length} title="重做"><span>↷</span></button>
              <label className="code-toggle"><input type="checkbox" checked={showCodes} onChange={(event) => setShowCodes(event.target.checked)} /> 显示色号</label>
            </div>
            <div className="canvas-frame">
              {processing && <div className="processing"><span /><b>正在重新计算图纸…</b></div>}
              <div className="canvas-scroller">
                <canvas
                  ref={canvasRef}
                  aria-label="可编辑的拼豆图纸"
                  onPointerDown={(event) => {
                    const target = cellFromEvent(event);
                    if (!target) return;
                    isDrawingRef.current = true;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    editCell(target.x, target.y, true);
                  }}
                  onPointerMove={(event) => {
                    const target = cellFromEvent(event);
                    setHovered(target);
                    if (isDrawingRef.current && target && !focusMode && (tool === "paint" || tool === "erase")) editCell(target.x, target.y, false);
                  }}
                  onPointerUp={() => { isDrawingRef.current = false; }}
                  onPointerLeave={() => { isDrawingRef.current = false; setHovered(null); }}
                />
              </div>
              {hovered?.cell.color && !hovered.cell.external && (
                <div className="hover-card">
                  <i style={{ background: hovered.cell.color.hex }} />
                  <span><b>{hovered.cell.color.codes[brand]} · {hovered.cell.color.name}</b><small>第 {hovered.x + 1} 列 / {hovered.y + 1} 行</small></span>
                </div>
              )}
              <div className="zoom-control"><span>−</span><input type="range" min="65" max="180" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><span>＋</span><b>{zoom}%</b></div>
            </div>

            <div className="palette-strip">
              <div className="palette-title"><span>当前画笔</span><b>{selectedColor.codes[brand]} · {selectedColor.name}</b><i style={{ background: selectedColor.hex }} /></div>
              <div className="swatches" role="list" aria-label="可选拼豆颜色">
                {BEAD_PALETTE.map((color) => (
                  <button key={color.hex} style={{ background: color.hex }} className={selectedColor.hex === color.hex ? "selected" : ""} onClick={() => { setSelectedColor(color); setTool("paint"); }} title={`${color.codes[brand]} ${color.name}`} aria-label={`${color.codes[brand]} ${color.name}`} />
                ))}
              </div>
            </div>
          </section>

          <aside className="right-panel panel">
            <div className="panel-heading">
              <div><span className="step-kicker">STEP 03</span><h2>用话修改效果</h2></div>
              <span className="local-ai">本地计算</span>
            </div>
            <div className="assistant-bubble">
              <span>豆</span>
              <p>{promptNotes.length ? `已完成：${promptNotes.join("；")} 。你还可以继续告诉我要怎么改。` : "试试告诉我：“只保留主体，颜色少一点，轮廓更清晰”。"}</p>
            </div>
            <div className="prompt-box">
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") applyPrompt(); }} placeholder="例如：去掉背景，让颜色更鲜艳，控制在 12 色左右…" />
              <button onClick={applyPrompt} disabled={!prompt.trim()} aria-label="应用文字修改">↑</button>
            </div>
            <div className="quick-prompts">
              {["去掉杂乱背景", "颜色少一点", "轮廓更清晰", "换成 58×58"].map((text) => (
                <button key={text} onClick={() => setPrompt(text)}>+ {text}</button>
              ))}
            </div>
            <p className="ai-boundary">当前版本能理解尺寸、背景、颜色数量、明暗和轮廓类要求；对“只修改眼睛”等部位级语义指令仍是演示能力。</p>

            <div className="divider" />
            <div className="brand-select-row"><span><b>豆子品牌</b><small>切换图纸上的实体色号</small></span></div>
            <div className="brand-tabs">
              {BRAND_OPTIONS.map((option) => <button key={option} className={brand === option ? "active" : ""} onClick={() => setBrand(option)}>{option}</button>)}
            </div>

            <div className="divider" />
            <div className="summary-head"><span><b>用豆清单</b><small>{colorStats.length} 种颜色</small></span><strong>{totalBeads}<small>颗</small></strong></div>
            <div className="color-list">
              {colorStats.slice(0, 8).map((item) => (
                <button key={item.color.hex} onClick={() => { setSelectedColor(item.color); setTool("paint"); }}>
                  <i style={{ background: item.color.hex }} />
                  <span><b>{item.color.codes[brand]}</b><small>{item.color.name}</small></span>
                  <strong>{item.count}</strong>
                  <em style={{ width: `${Math.max(8, (item.count / (colorStats[0]?.count || 1)) * 100)}%` }} />
                </button>
              ))}
            </div>
            {colorStats.length > 8 && <p className="more-colors">还有 {colorStats.length - 8} 种颜色，可在采购清单中查看</p>}
            <div className="result-summary">
              <span><small>成品尺寸</small><b>{(settings.size * 0.5).toFixed(1)} × {(settings.size * 0.5).toFixed(1)} cm</b></span>
              <span><small>预计制作</small><b>{formatTime(makeMinutes).replace("约 ", "")}</b></span>
            </div>
            <div className="export-wrap">
              <button className="export-main" onClick={exportPng}>下载带色号图纸 <span>PNG</span></button>
              <button className="export-toggle" onClick={() => setExportOpen((open) => !open)} aria-label="展开其他导出选项">⌄</button>
              {exportOpen && (
                <div className="export-menu">
                  <button onClick={exportCsv}><b>采购清单</b><small>CSV 表格</small></button>
                  <button onClick={printPattern}><b>打印 / 存为 PDF</b><small>浏览器打印</small></button>
                </div>
              )}
            </div>
            <small className="palette-disclaimer">色号为原型映射，实体制作前请对照品牌最新实物色卡。</small>
          </aside>
        </section>
      )}

      <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => { acceptFile(event.target.files?.[0]); event.target.value = ""; }} />

      {focusMode && (
        <div className="focus-bar">
          <button onClick={() => setFocusMode(false)}>← 返回编辑</button>
          <span><b>专心拼豆</b><small>点击已摆放的格子标记进度</small></span>
          <div className="focus-progress"><i><em style={{ width: `${focusProgress}%` }} /></i><b>{focusProgress}%</b><small>{completedCount} / {totalBeads} 颗</small></div>
          <button className="reset-progress" onClick={() => setCompletedCells(new Set())}>清空进度</button>
        </div>
      )}
    </main>
  );
}
