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
import {
  Cell,
  cloneGrid,
  colorStats,
  computeGridSize,
  EngineSettings,
  floodFillErase,
  Grid,
  nearestColor,
  processImageData,
  replaceGridColor,
  rgbFromHex,
  sanitizeGrid,
  serializableGrid,
} from "./bead-engine";
import { exportBomCsv, exportGuidePng, exportMatrixCsv, exportProjectJson } from "./exporters";
import { BEAD_PALETTE, BRAND_OPTIONS, BeadColor, Brand, PALETTE_BY_HEX } from "./palette";

type Tool = "paint" | "erase" | "region" | "picker" | "replace";
type Transform = { rotation: 0 | 90 | 180 | 270; flipX: boolean; flipY: boolean };

const INITIAL_SETTINGS: EngineSettings = {
  width: 29,
  preserveAspect: true,
  colorLimit: 18,
  mergeStrength: 24,
  brightness: 1,
  contrast: 1.06,
  saturation: 1.06,
  removeBackground: true,
  backgroundTolerance: 48,
  fit: "cover",
  sampleMode: "dominant",
  cropX: 50,
  cropY: 50,
};
const INITIAL_TRANSFORM: Transform = { rotation: 0, flipX: false, flipY: false };
const STORAGE_KEY = "pindou-project-v2";
const LEGACY_STORAGE_KEY = "doudap-project-v2";
const DEMO_PATTERN = [
  "............", "...PP..PP...", "..PPPPPPPP..", ".PPWWPPWWPP.", ".PPBKPPKBPP.",
  ".PPPPPPPPPP.", "..PPWPPWPP..", "...PPRRPP...", "....PPPP....", "....GPPG....",
  "...GG..GG...", "............",
];

function cellKey(x: number, y: number) {
  return x + "-" + y;
}

function formatTime(minutes: number) {
  if (minutes < 60) return "约 " + Math.max(1, Math.round(minutes)) + " 分钟";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return "约 " + hours + " 小时" + (rest ? " " + rest + " 分" : "");
}

function formatClock(seconds: number) {
  const values = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  return values.map((value) => String(value).padStart(2, "0")).join(":");
}

function isDark(hex: string) {
  const rgb = rgbFromHex(hex);
  return rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114 < 145;
}

function safeSettings(value: unknown): Partial<EngineSettings> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const result: Partial<EngineSettings> = {};
  if (typeof raw.width === "number") result.width = Math.max(8, Math.min(100, raw.width));
  if (typeof raw.preserveAspect === "boolean") result.preserveAspect = raw.preserveAspect;
  if (typeof raw.colorLimit === "number") result.colorLimit = Math.max(2, Math.min(60, raw.colorLimit));
  if (typeof raw.mergeStrength === "number") result.mergeStrength = Math.max(0, Math.min(60, raw.mergeStrength));
  if (typeof raw.brightness === "number") result.brightness = Math.max(0.7, Math.min(1.35, raw.brightness));
  if (typeof raw.contrast === "number") result.contrast = Math.max(0.7, Math.min(1.45, raw.contrast));
  if (typeof raw.saturation === "number") result.saturation = Math.max(0.5, Math.min(1.6, raw.saturation));
  if (typeof raw.removeBackground === "boolean") result.removeBackground = raw.removeBackground;
  if (typeof raw.backgroundTolerance === "number") result.backgroundTolerance = Math.max(8, Math.min(90, raw.backgroundTolerance));
  if (raw.fit === "contain" || raw.fit === "cover") result.fit = raw.fit;
  if (raw.sampleMode === "average" || raw.sampleMode === "dominant") result.sampleMode = raw.sampleMode;
  if (typeof raw.cropX === "number") result.cropX = Math.max(0, Math.min(100, raw.cropX));
  if (typeof raw.cropY === "number") result.cropY = Math.max(0, Math.min(100, raw.cropY));
  return result;
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const matrixInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const isDrawingRef = useRef(false);
  const restoredRef = useRef(false);
  const [sourceVersion, setSourceVersion] = useState(0);
  const [fileName, setFileName] = useState("");
  const [sourcePreview, setSourcePreview] = useState("");
  const [settings, setSettings] = useState<EngineSettings>(INITIAL_SETTINGS);
  const [transform, setTransform] = useState<Transform>(INITIAL_TRANSFORM);
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
  const [assistantNote, setAssistantNote] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [focusColor, setFocusColor] = useState("");
  const [completedCells, setCompletedCells] = useState<Set<string>>(new Set());
  const [focusSeconds, setFocusSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [activeHexes, setActiveHexes] = useState<Set<string>>(() => new Set(BEAD_PALETTE.map((color) => color.hex)));
  const [inventoryDraft, setInventoryDraft] = useState<Set<string>>(() => new Set(BEAD_PALETTE.map((color) => color.hex)));
  const [restoreNote, setRestoreNote] = useState("");

  const hasSource = sourceVersion > 0;
  const hasWorkspace = hasSource || grid.length > 0;
  const activePalette = useMemo(() => BEAD_PALETTE.filter((color) => activeHexes.has(color.hex)), [activeHexes]);
  const stats = useMemo(() => colorStats(grid), [grid]);
  const totalBeads = useMemo(() => stats.reduce((sum, item) => sum + item.count, 0), [stats]);
  const focusedTotal = useMemo(() => grid.reduce((sum, row) => sum + row.filter((cell) => !cell.external && cell.color && (!focusColor || cell.color.hex === focusColor)).length, 0), [grid, focusColor]);
  const focusedDone = useMemo(() => {
    let count = 0;
    completedCells.forEach((key) => {
      const parts = key.split("-").map(Number);
      const cell = grid[parts[1]]?.[parts[0]];
      if (cell && !cell.external && cell.color && (!focusColor || cell.color.hex === focusColor)) count += 1;
    });
    return count;
  }, [completedCells, focusColor, grid]);
  const focusProgress = focusedTotal ? Math.round(focusedDone / focusedTotal * 100) : 0;

  const renderSource = useCallback(() => {
    const image = sourceImageRef.current;
    if (!image) return;
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const scale = Math.min(1, 1400 / Math.max(naturalWidth, naturalHeight));
    const imageWidth = Math.max(1, Math.round(naturalWidth * scale));
    const imageHeight = Math.max(1, Math.round(naturalHeight * scale));
    const swapped = transform.rotation === 90 || transform.rotation === 270;
    const canvas = document.createElement("canvas");
    canvas.width = swapped ? imageHeight : imageWidth;
    canvas.height = swapped ? imageWidth : imageHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(transform.rotation * Math.PI / 180);
    context.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
    context.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const size = computeGridSize(canvas.width, canvas.height, settings.width, settings.preserveAspect);
    setGrid(processImageData(imageData, size.width, size.height, settings, activePalette));
    setUndoStack([]);
    setRedoStack([]);
    setCompletedCells(new Set());
    setProcessing(false);
  }, [activePalette, settings, transform]);

  useEffect(() => {
    if (!hasSource) return;
    const timer = window.setTimeout(() => {
      setProcessing(true);
      window.requestAnimationFrame(renderSource);
    }, 90);
    return () => window.clearTimeout(timer);
  }, [hasSource, renderSource, sourceVersion]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const timer = window.setTimeout(() => {
      try {
      const saved = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!saved) return;
        const project = JSON.parse(saved) as Record<string, unknown>;
        const savedGrid = sanitizeGrid(project.grid);
        if (!savedGrid) return;
        setGrid(savedGrid);
        setSettings((current) => ({ ...current, ...safeSettings(project.settings) }));
        if (BRAND_OPTIONS.includes(project.brand as Brand)) setBrand(project.brand as Brand);
        if (Array.isArray(project.activePalette)) {
          const valid = new Set((project.activePalette as unknown[]).filter((hex): hex is string => typeof hex === "string" && PALETTE_BY_HEX.has(hex)));
          if (valid.size) setActiveHexes(valid);
        }
        if (Array.isArray(project.completed)) setCompletedCells(new Set((project.completed as unknown[]).filter((key): key is string => typeof key === "string")));
        if (typeof project.focusSeconds === "number") setFocusSeconds(Math.max(0, Math.round(project.focusSeconds)));
        if (project.transform && typeof project.transform === "object") setTransform({ ...INITIAL_TRANSFORM, ...(project.transform as Transform) });
        setFileName(typeof project.name === "string" ? project.name : "已恢复的工程");
        setRestoreNote("已从本机自动恢复上次工程；原图从未被保存或上传。");
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!grid.length) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2,
        name: fileName || "拼豆工程",
        savedAt: new Date().toISOString(),
        settings,
        transform,
        brand,
        activePalette: [...activeHexes],
        completed: [...completedCells],
        focusSeconds,
        grid: serializableGrid(grid),
      }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [grid, settings, transform, brand, activeHexes, completedCells, focusSeconds, fileName]);

  useEffect(() => {
    if (!timerRunning) return;
    const timer = window.setInterval(() => setFocusSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid.length) return;
    const rows = grid.length;
    const cols = grid[0].length;
    const baseCell = cols <= 32 ? 20 : cols <= 60 ? 13 : 9;
    const cellSize = Math.max(6, Math.round(baseCell * zoom / 100));
    const ratio = window.devicePixelRatio || 1;
    canvas.width = cols * cellSize * ratio;
    canvas.height = rows * cellSize * ratio;
    canvas.style.width = cols * cellSize + "px";
    canvas.style.height = rows * cellSize + "px";
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.fillStyle = "#f7f7f3";
    context.fillRect(0, 0, cols * cellSize, rows * cellSize);
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
      const cell = grid[y][x];
      const px = x * cellSize;
      const py = y * cellSize;
      if (cell.external || !cell.color) {
        context.fillStyle = (x + y) % 2 ? "#f5f5f0" : "#e9eae4";
        context.fillRect(px, py, cellSize, cellSize);
      } else {
        context.fillStyle = cell.color.hex;
        context.fillRect(px, py, cellSize, cellSize);
        context.fillStyle = "rgba(255,255,255,.3)";
        context.beginPath();
        context.arc(px + cellSize * 0.32, py + cellSize * 0.29, Math.max(1, cellSize * 0.08), 0, Math.PI * 2);
        context.fill();
        if (focusMode && focusColor && cell.color.hex !== focusColor) {
          context.fillStyle = "rgba(245,246,242,.8)";
          context.fillRect(px, py, cellSize, cellSize);
        }
        if (showCodes && cellSize >= 16 && (!focusMode || !focusColor || cell.color.hex === focusColor)) {
          context.fillStyle = isDark(cell.color.hex) ? "rgba(255,255,255,.93)" : "rgba(20,20,20,.78)";
          context.font = "700 " + Math.max(7, cellSize * 0.3) + "px ui-monospace, monospace";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(cell.color.codes[brand], px + cellSize / 2, py + cellSize / 2 + 1);
        }
        if (completedCells.has(cellKey(x, y))) {
          context.fillStyle = "rgba(255,255,255,.7)";
          context.fillRect(px, py, cellSize, cellSize);
          context.fillStyle = "#16634a";
          context.beginPath();
          context.arc(px + cellSize / 2, py + cellSize / 2, Math.max(2, cellSize * 0.15), 0, Math.PI * 2);
          context.fill();
        }
      }
      const boardLine = x > 0 && x % 29 === 0 || y > 0 && y % 29 === 0;
      const guideLine = x > 0 && x % 5 === 0 || y > 0 && y % 5 === 0;
      context.strokeStyle = boardLine ? "rgba(24,61,49,.58)" : guideLine ? "rgba(31,35,32,.3)" : "rgba(31,35,32,.12)";
      context.lineWidth = boardLine ? 1.5 : guideLine ? 0.85 : 0.5;
      context.strokeRect(px, py, cellSize, cellSize);
    }
  }, [grid, zoom, showCodes, brand, completedCells, focusMode, focusColor]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const loadImage = useCallback((url: string, name: string, revoke: boolean) => {
    const image = new Image();
    image.onload = () => {
      if (objectUrlRef.current && objectUrlRef.current !== url) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = revoke ? url : null;
      sourceImageRef.current = image;
      setFileName(name);
      setSourcePreview(url);
      setRestoreNote("");
      setSourceVersion((version) => version + 1);
    };
    image.onerror = () => window.alert("图片读取失败，请换一张 PNG、JPG 或 WebP。");
    image.src = url;
  }, []);

  const acceptFile = useCallback((file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("请选择 PNG、JPG 或 WebP 图片。");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      window.alert("图片请控制在 20MB 以内。");
      return;
    }
    loadImage(URL.createObjectURL(file), file.name, true);
  }, [loadImage]);

  const loadDemo = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 680;
    const context = canvas.getContext("2d");
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, 900, 680);
    gradient.addColorStop(0, "#cdeeff");
    gradient.addColorStop(1, "#fff0d9");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 900, 680);
    context.fillStyle = "#ff9f83";
    context.beginPath();
    context.arc(450, 340, 245, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#8a4c38";
    context.beginPath();
    context.moveTo(270, 225);
    context.lineTo(315, 65);
    context.lineTo(390, 205);
    context.moveTo(510, 205);
    context.lineTo(585, 65);
    context.lineTo(630, 225);
    context.fill();
    context.fillStyle = "#fff7e9";
    context.beginPath();
    context.ellipse(450, 360, 165, 190, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#22252b";
    context.beginPath();
    context.arc(390, 320, 19, 0, Math.PI * 2);
    context.arc(510, 320, 19, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#e8649e";
    context.beginPath();
    context.moveTo(433, 382);
    context.lineTo(467, 382);
    context.lineTo(450, 404);
    context.closePath();
    context.fill();
    loadImage(canvas.toDataURL("image/png"), "演示-小猫.png", false);
  }, [loadImage]);

  const pushHistory = useCallback(() => {
    setUndoStack((stack) => [...stack.slice(-24), cloneGrid(grid)]);
    setRedoStack([]);
  }, [grid]);

  const editCell = useCallback((x: number, y: number, startAction: boolean) => {
    const cell = grid[y]?.[x];
    if (!cell) return;
    if (focusMode) {
      if (cell.external || !cell.color || focusColor && cell.color.hex !== focusColor) return;
      setCompletedCells((current) => {
        const next = new Set(current);
        const key = cellKey(x, y);
        if (next.has(key)) next.delete(key); else next.add(key);
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
    setCompletedCells((current) => {
      const next = new Set(current);
      next.delete(cellKey(x, y));
      return next;
    });
    if (tool === "region") {
      setGrid((current) => floodFillErase(current, x, y));
    } else if (tool === "replace") {
      if (cell.color && !cell.external) setGrid((current) => replaceGridColor(current, cell.color!.hex, selectedColor));
    } else {
      setGrid((current) => {
        const next = cloneGrid(current);
        next[y][x] = tool === "erase" ? { color: null, external: true } : { color: selectedColor, external: false };
        return next;
      });
    }
  }, [grid, focusMode, focusColor, tool, selectedColor, pushHistory]);

  const cellFromEvent = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !grid.length) return null;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - bounds.left) / bounds.width * grid[0].length);
    const y = Math.floor((event.clientY - bounds.top) / bounds.height * grid.length);
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
    if (!value) return;
    const notes: string[] = [];
    const patch: Partial<EngineSettings> = {};
    const colorMatch = value.match(/(?:颜色|色彩|色号|改成|限制)\D{0,4}(\d{1,2})\s*色?/);
    if (colorMatch) {
      patch.colorLimit = Math.max(2, Math.min(60, Number(colorMatch[1])));
      notes.push("颜色上限设为 " + patch.colorLimit + " 色");
    }
    if (/去除?背景|透明背景|抠图/.test(value)) { patch.removeBackground = true; notes.push("启用边缘连通去背景"); }
    if (/保留背景|不要去背景|关闭背景/.test(value)) { patch.removeBackground = false; notes.push("保留背景"); }
    if (/鲜艳|饱和/.test(value) && !/降低|减少|不要/.test(value)) { patch.saturation = 1.28; notes.push("提高饱和度"); }
    if (/降低饱和|柔和|淡一点/.test(value)) { patch.saturation = 0.82; notes.push("降低饱和度"); }
    if (/更亮|亮一点/.test(value)) { patch.brightness = 1.15; notes.push("提高亮度"); }
    if (/更暗|暗一点/.test(value)) { patch.brightness = 0.88; notes.push("降低亮度"); }
    if (/减少杂色|合并碎色|更干净|平滑/.test(value)) { patch.mergeStrength = 44; notes.push("加强孤立色合并"); }
    if (/保留细节|更清晰|不要合并/.test(value)) { patch.mergeStrength = 5; notes.push("优先保留细节"); }
    if (/主体完整|不要裁切|完整显示/.test(value)) { patch.fit = "contain"; notes.push("完整显示主体"); }
    if (!notes.length) {
      setAssistantNote("没有改动：暂未识别。可尝试“限制 12 色、去背景、更鲜艳、减少杂色、主体完整”。");
      return;
    }
    setSettings((current) => ({ ...current, ...patch }));
    setAssistantNote(notes.join("；"));
    setPrompt("");
  };

  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const project = JSON.parse(await file.text()) as Record<string, unknown>;
      const importedGrid = sanitizeGrid(project.grid);
      if (!importedGrid) throw new Error("invalid");
      sourceImageRef.current = null;
      setSourceVersion(0);
      setSourcePreview("");
      setGrid(importedGrid);
      setSettings((current) => ({ ...current, ...safeSettings(project.settings) }));
      if (BRAND_OPTIONS.includes(project.brand as Brand)) setBrand(project.brand as Brand);
      if (Array.isArray(project.activePalette)) {
        const valid = new Set((project.activePalette as unknown[]).filter((hex): hex is string => typeof hex === "string" && PALETTE_BY_HEX.has(hex)));
        if (valid.size) setActiveHexes(valid);
      }
      if (Array.isArray(project.completed)) setCompletedCells(new Set((project.completed as unknown[]).filter((key): key is string => typeof key === "string")));
      if (typeof project.focusSeconds === "number") setFocusSeconds(Math.max(0, Math.round(project.focusSeconds)));
      setFileName(typeof project.name === "string" ? project.name : file.name);
      setRestoreNote("工程已导入；可继续编辑、施工与导出。");
    } catch {
      window.alert("工程文件无法读取，请确认它由拼豆导出且内容完整。");
    }
  };

  const importMatrix = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").trim().split(/\r?\n/);
      if (!/^row,column,hex/i.test(lines[0] || "")) throw new Error("header");
      const cells = lines.slice(1).map((line) => line.split(","));
      const height = Math.max(...cells.map((columns) => Number(columns[0]) || 0));
      const width = Math.max(...cells.map((columns) => Number(columns[1]) || 0));
      if (width < 1 || height < 1 || width > 100 || height > 100) throw new Error("size");
      const next: Grid = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ color: null, external: true })));
      cells.forEach((columns) => {
        const y = Number(columns[0]) - 1;
        const x = Number(columns[1]) - 1;
        const color = PALETTE_BY_HEX.get((columns[2] || "").toUpperCase()) || null;
        if (next[y]?.[x] && color) next[y][x] = { color, external: false };
      });
      sourceImageRef.current = null;
      setSourceVersion(0);
      setSourcePreview("");
      setGrid(next);
      setUndoStack([]);
      setRedoStack([]);
      setCompletedCells(new Set());
      setFileName(file.name);
      setRestoreNote("矩阵 CSV 已导入。");
    } catch {
      window.alert("矩阵 CSV 无法读取，请使用拼豆导出的矩阵 CSV。");
    }
  };

  const openInventory = () => {
    setInventoryDraft(new Set(activeHexes));
    setInventoryOpen(true);
  };

  const applyInventory = () => {
    if (!inventoryDraft.size) {
      window.alert("至少保留一种库存色。");
      return;
    }
    const palette = BEAD_PALETTE.filter((color) => inventoryDraft.has(color.hex));
    if (!hasSource && grid.length) {
      pushHistory();
      setGrid((current) => current.map((row) => row.map((cell) => {
        if (cell.external || !cell.color || inventoryDraft.has(cell.color.hex)) return { ...cell };
        return { ...cell, color: nearestColor(rgbFromHex(cell.color.hex), palette) };
      })));
    }
    setActiveHexes(new Set(inventoryDraft));
    setInventoryOpen(false);
  };

  const filteredInventory = useMemo(() => {
    const query = inventorySearch.trim().toLowerCase();
    if (!query) return BEAD_PALETTE;
    return BEAD_PALETTE.filter((color) => {
      const values = [color.name, color.hex, ...BRAND_OPTIONS.map((item) => color.codes[item])];
      return values.some((value) => value.toLowerCase().includes(query));
    });
  }, [inventorySearch]);

  const removeColor = (color: BeadColor) => {
    const remaining = activePalette.filter((item) => item.hex !== color.hex);
    if (!remaining.length) return;
    pushHistory();
    setGrid((current) => replaceGridColor(current, color.hex, nearestColor(rgbFromHex(color.hex), remaining)));
    setActiveHexes((current) => {
      const next = new Set(current);
      next.delete(color.hex);
      return next;
    });
  };

  const exportProject = () => exportProjectJson(grid, {
    name: fileName,
    settings,
    transform,
    brand,
    activePalette: [...activeHexes],
    completed: [...completedCells],
    focusSeconds,
  });

  return (
    <main className={"app-shell" + (focusMode ? " is-focus" : "")}>
      <header className="topbar">
        <button className="brand-mark" type="button" aria-label="拼豆首页" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <span className="brand-beads" aria-hidden="true"><i /><i /><i /><i /></span>
          <span><b>拼豆</b><small>PERLER STUDIO</small></span>
        </button>
        <div className="top-actions">
          <span className="privacy-note"><i />图片只在本机处理</span>
          <button className="ghost-button" type="button" onClick={() => projectInputRef.current?.click()}>导入工程</button>
          <button className="dark-button" type="button" onClick={() => fileInputRef.current?.click()}>{hasWorkspace ? "换一张图" : "开始制作"}</button>
        </div>
      </header>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => acceptFile(event.target.files?.[0])} />
      <input ref={projectInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importProject} />
      <input ref={matrixInputRef} className="visually-hidden" type="file" accept="text/csv,.csv" onChange={importMatrix} />

      {!hasWorkspace ? (
        <section className="landing">
          <div className="hero-copy">
            <span className="eyebrow"><i />从照片到可施工图纸</span>
            <h1>把你想留住的<br />变成一颗颗<em>拼豆</em></h1>
            <p>上传照片，拼豆会在浏览器里完成取色、去背景与色号匹配。你可以逐格修正、按库存限色、保存工程，再导出带坐标和分板线的制作图。</p>
            <div className="feature-line"><span>291 色 · 5 品牌</span><span>透明 PNG 友好</span><span>工程自动恢复</span><span>本地处理</span></div>
          </div>
          <div className="upload-stage">
            <div className="mosaic-shadow" />
            <div className="mini-mosaic" aria-hidden="true">
              {DEMO_PATTERN.flatMap((row, y) => row.split("").map((code, x) => <i key={cellKey(x, y)} data-code={code} />))}
            </div>
            <div
              className={"upload-card" + (dragging ? " is-dragging" : "")}
              onDragOver={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]); }}
            >
              <div className="upload-icon" aria-hidden="true">＋</div>
              <h2>上传一张照片</h2>
              <p>拖到这里，或从设备选择图片</p>
              <button className="primary-button" type="button" onClick={() => fileInputRef.current?.click()}>选择图片</button>
              <button className="text-button" type="button" onClick={loadDemo}>先用示例体验完整流程 →</button>
              <small>支持 PNG / JPG / WebP · 最大 20MB · 不上传服务器</small>
            </div>
          </div>
          <div className="landing-bottom"><span>取色</span><i /><span>编辑</span><i /><span>备料</span><i /><span>施工</span></div>
        </section>
      ) : (
        <section className="studio">
          <aside className="panel left-panel">
            <div className="panel-heading">
              <span><small className="step-kicker">01 · 生成设置</small><h2>图纸规格</h2></span>
              <span className="file-chip">{hasSource ? "原图就绪" : "工程模式"}</span>
            </div>
            {sourcePreview ? <div className="source-thumb"><span className="source-thumb-image" role="img" aria-label="上传原图预览" style={{ backgroundImage: "url(" + sourcePreview + ")" }} /><span>{fileName}</span></div> : <p className="restore-note">{restoreNote || fileName}</p>}
            <p className="section-label">板面宽度</p>
            <div className="size-presets">
              {[29, 58].map((value) => (
                <button key={value} type="button" className={settings.width === value ? "active" : ""} onClick={() => setSettings((current) => ({ ...current, width: value }))}>
                  <b>{value} 格</b><small>{value === 29 ? "单板" : "2 × 2 板宽"}</small>
                </button>
              ))}
            </div>
            <div className="control-group">
              <div className="control-title"><span>自定义宽度</span><b>{settings.width} 格</b></div>
              <input aria-label="自定义板面宽度" type="range" min="16" max="100" value={settings.width} onChange={(event) => setSettings((current) => ({ ...current, width: Number(event.target.value) }))} />
            </div>
            <label className="toggle-row" aria-label="保持原图比例">
              <span><b>保持原图比例</b><small>输出 N × M 图纸，不强制裁方形</small></span>
              <input type="checkbox" checked={settings.preserveAspect} onChange={(event) => setSettings((current) => ({ ...current, preserveAspect: event.target.checked }))} /><i />
            </label>
            {!settings.preserveAspect && (
              <>
                <div className="fit-switch">
                  <button type="button" className={settings.fit === "cover" ? "active" : ""} onClick={() => setSettings((current) => ({ ...current, fit: "cover" }))}>铺满裁切</button>
                  <button type="button" className={settings.fit === "contain" ? "active" : ""} onClick={() => setSettings((current) => ({ ...current, fit: "contain" }))}>完整留白</button>
                </div>
                {settings.fit === "cover" && <div className="crop-controls">
                  <label>水平焦点<input aria-label="裁切水平焦点" type="range" min="0" max="100" value={settings.cropX} onChange={(event) => setSettings((current) => ({ ...current, cropX: Number(event.target.value) }))} /></label>
                  <label>垂直焦点<input aria-label="裁切垂直焦点" type="range" min="0" max="100" value={settings.cropY} onChange={(event) => setSettings((current) => ({ ...current, cropY: Number(event.target.value) }))} /></label>
                </div>}
              </>
            )}
            <div className="transform-row">
              <button type="button" onClick={() => setTransform((current) => ({ ...current, rotation: (current.rotation + 90) % 360 as Transform["rotation"] }))}>↻ 旋转</button>
              <button type="button" className={transform.flipX ? "active" : ""} onClick={() => setTransform((current) => ({ ...current, flipX: !current.flipX }))}>↔ 水平</button>
              <button type="button" className={transform.flipY ? "active" : ""} onClick={() => setTransform((current) => ({ ...current, flipY: !current.flipY }))}>↕ 垂直</button>
            </div>
            <div className="control-group">
              <div className="control-title"><span>颜色上限</span><b>{settings.colorLimit} 色</b></div>
              <input aria-label="颜色上限" type="range" min="2" max="40" value={settings.colorLimit} onChange={(event) => setSettings((current) => ({ ...current, colorLimit: Number(event.target.value) }))} />
            </div>
            <div className="control-group">
              <div className="control-title"><span>碎色合并</span><b>{settings.mergeStrength}</b></div>
              <input aria-label="碎色合并强度" type="range" min="0" max="60" value={settings.mergeStrength} onChange={(event) => setSettings((current) => ({ ...current, mergeStrength: Number(event.target.value) }))} />
            </div>
            <div className="fit-switch">
              <button type="button" className={settings.sampleMode === "dominant" ? "active" : ""} onClick={() => setSettings((current) => ({ ...current, sampleMode: "dominant" }))}>主体色取样</button>
              <button type="button" className={settings.sampleMode === "average" ? "active" : ""} onClick={() => setSettings((current) => ({ ...current, sampleMode: "average" }))}>平均色取样</button>
            </div>
            <label className="toggle-row" aria-label="自动去背景">
              <span><b>自动去背景</b><small>先识别边缘背景，再执行限色</small></span>
              <input type="checkbox" checked={settings.removeBackground} onChange={(event) => setSettings((current) => ({ ...current, removeBackground: event.target.checked }))} /><i />
            </label>
            {settings.removeBackground && <div className="control-group compact-control">
              <div className="control-title"><span>背景容差</span><b>{settings.backgroundTolerance}</b></div>
              <input aria-label="去背景容差" type="range" min="8" max="90" value={settings.backgroundTolerance} onChange={(event) => setSettings((current) => ({ ...current, backgroundTolerance: Number(event.target.value) }))} />
            </div>}
            <button className="inventory-button" type="button" onClick={openInventory}><span>库存色板</span><b>{activeHexes.size} / {BEAD_PALETTE.length} 色</b></button>
            <p className="estimate-note">当前约需 <b>{totalBeads}</b> 颗，预计 {formatTime(totalBeads * 0.11)}。开工前请对照实物色卡。</p>
          </aside>

          <section className="panel canvas-panel">
            <div className="canvas-topline">
              <span><small className="step-kicker">02 · 精修图纸</small><h2>{fileName || "未命名工程"}</h2></span>
              <div className="canvas-status"><b>{grid[0]?.length || 0} × {grid.length}</b><i /><span>{stats.length} 色</span><i /><span>{totalBeads} 颗</span></div>
            </div>
            {restoreNote && <div className="inline-notice">{restoreNote}<button type="button" onClick={() => setRestoreNote("")}>×</button></div>}
            <div className="toolbar" role="toolbar" aria-label="拼豆编辑工具">
              {([
                ["paint", "✎", "画笔"], ["erase", "⌫", "橡皮"], ["region", "◉", "区域擦除"],
                ["picker", "⌾", "吸色"], ["replace", "⇄", "全局替换"],
              ] as const).map((item) => <button key={item[0]} type="button" className={tool === item[0] ? "active" : ""} onClick={() => setTool(item[0])}><span>{item[1]}</span>{item[2]}</button>)}
              <div className="toolbar-divider" />
              <button type="button" disabled={!undoStack.length} onClick={undo}><span>↶</span>撤销</button>
              <button type="button" disabled={!redoStack.length} onClick={redo}><span>↷</span>重做</button>
              <label className="code-toggle"><input type="checkbox" checked={showCodes} onChange={(event) => setShowCodes(event.target.checked)} />显示色号</label>
            </div>
            <div className="canvas-frame">
              {processing && <div className="processing"><span /><b>正在重算取色与图纸…</b></div>}
              <div className="canvas-scroller">
                <canvas
                  ref={canvasRef}
                  aria-label="可编辑拼豆图纸"
                  onPointerDown={(event) => {
                    const target = cellFromEvent(event);
                    if (!target) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    isDrawingRef.current = tool === "paint" || tool === "erase";
                    editCell(target.x, target.y, true);
                  }}
                  onPointerMove={(event) => {
                    const target = cellFromEvent(event);
                    setHovered(target);
                    if (target && isDrawingRef.current) editCell(target.x, target.y, false);
                  }}
                  onPointerLeave={() => { setHovered(null); isDrawingRef.current = false; }}
                  onPointerUp={() => { isDrawingRef.current = false; }}
                />
              </div>
              {hovered && <div className="hover-card"><i style={{ background: hovered.cell.color?.hex || "#eee" }} /><span><b>第 {hovered.y + 1} 行 · 第 {hovered.x + 1} 列</b><small>{hovered.cell.external || !hovered.cell.color ? "空格" : hovered.cell.color.codes[brand] + " · " + hovered.cell.color.name}</small></span></div>}
              <div className="zoom-control"><span>−</span><input aria-label="画布缩放" type="range" min="55" max="180" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><span>＋</span><b>{zoom}%</b></div>
            </div>
            <div className="palette-strip">
              <div className="palette-title"><span>当前画笔</span><b>{selectedColor.codes[brand]} · {selectedColor.name}</b><i style={{ background: selectedColor.hex }} /></div>
              <div className="swatches">
                {stats.map((item) => <button key={item.color.hex} type="button" aria-label={"选择 " + item.color.name} title={item.color.codes[brand] + " · " + item.color.name} className={selectedColor.hex === item.color.hex ? "selected" : ""} style={{ background: item.color.hex }} onClick={() => setSelectedColor(item.color)} />)}
                <button type="button" className="more-swatch" aria-label="打开完整库存色板" onClick={openInventory}>＋</button>
              </div>
            </div>
          </section>

          <aside className="panel right-panel">
            <div className="panel-heading">
              <span><small className="step-kicker">03 · 备料与施工</small><h2>交付中心</h2></span>
              <span className="local-ai">本地规则助手</span>
            </div>
            <div className="assistant-bubble"><span>豆</span><p>{assistantNote || "用中文快速调参。只有识别成功的指令才会修改图纸。"}</p></div>
            <div className="prompt-box">
              <textarea aria-label="本地规则指令" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：限制 12 色，去背景，减少杂色…" />
              <button type="button" aria-label="应用指令" disabled={!prompt.trim()} onClick={applyPrompt}>↑</button>
            </div>
            <div className="quick-prompts">{["限制 12 色", "主体完整", "减少杂色", "更鲜艳"].map((value) => <button key={value} type="button" onClick={() => setPrompt(value)}>{value}</button>)}</div>
            <p className="ai-boundary">这是可解释的本地规则，不发送图片或指令，也不会把未识别指令伪装成已执行。</p>
            <div className="divider" />
            <div className="brand-select-row"><span><b>品牌色号</b><small>共 {BEAD_PALETTE.length} 色，购买前核对实物色卡</small></span></div>
            <div className="brand-tabs five-tabs">{BRAND_OPTIONS.map((item) => <button key={item} type="button" className={brand === item ? "active" : ""} onClick={() => setBrand(item)}>{item}</button>)}</div>
            <div className="summary-head"><span><b>用色清单</b><small>点击设画笔，× 可移出库存</small></span><strong>{totalBeads}<small>颗</small></strong></div>
            <div className="color-list">
              {stats.slice(0, 12).map((item) => <div className="color-list-row" key={item.color.hex}>
                <button type="button" onClick={() => setSelectedColor(item.color)}>
                  <i style={{ background: item.color.hex }} /><span><b>{item.color.codes[brand]} · {item.color.name}</b><small>{item.color.hex}</small></span><strong>{item.count}</strong>
                  <em style={{ width: Math.max(4, item.count / Math.max(1, stats[0]?.count || 1) * 100) + "%" }} />
                </button>
                <button className="exclude-color" type="button" aria-label={"移出 " + item.color.name} title="移出库存并匹配到最接近颜色" onClick={() => removeColor(item.color)}>×</button>
              </div>)}
            </div>
            {stats.length > 12 && <button className="more-colors" type="button" onClick={openInventory}>另有 {stats.length - 12} 种颜色 · 查看完整色板</button>}
            <div className="result-summary"><span><small>预计耗时</small><b>{formatTime(totalBeads * 0.11)}</b></span><span><small>备料建议</small><b>{Math.ceil(totalBeads * 1.08)} 颗</b></span></div>
            <button className="focus-button" type="button" onClick={() => { setFocusMode(true); setTimerRunning(true); }}>◎ 进入专注制作模式</button>
            <div className="export-wrap">
              <button className="export-main" type="button" onClick={() => exportGuidePng(grid, brand)}>下载施工图 <span>PNG</span></button>
              <button className="export-toggle" type="button" aria-label="打开更多导出选项" onClick={() => setExportOpen((value) => !value)}>⌃</button>
              {exportOpen && <div className="export-menu">
                <button type="button" onClick={() => exportGuidePng(grid, brand)}><b>坐标施工图 PNG</b><small>分板线与用色图例</small></button>
                <button type="button" onClick={() => exportBomCsv(grid, brand)}><b>采购清单 CSV</b><small>真实用量与 8% 余量</small></button>
                <button type="button" onClick={() => exportMatrixCsv(grid, brand)}><b>矩阵数据 CSV</b><small>逐格坐标，可再次导入</small></button>
                <button type="button" onClick={exportProject}><b>可恢复工程 JSON</b><small>设置、矩阵与进度</small></button>
                <button type="button" onClick={() => matrixInputRef.current?.click()}><b>导入矩阵 CSV</b><small>继续编辑已有矩阵</small></button>
              </div>}
            </div>
            <small className="palette-disclaimer">预览、清单、施工图和工程文件全部来自同一份当前矩阵。</small>
          </aside>
        </section>
      )}

      {focusMode && <div className="focus-bar">
        <button type="button" onClick={() => { setFocusMode(false); setTimerRunning(false); }}>← 退出专注</button>
        <span><b>点击格子标记已完成</b><small>按颜色筛选后，其余颜色会自动淡化</small></span>
        <label className="focus-filter">只看颜色<select value={focusColor} onChange={(event) => setFocusColor(event.target.value)}>
          <option value="">全部颜色</option>
          {stats.map((item) => <option key={item.color.hex} value={item.color.hex}>{item.color.codes[brand]} · {item.count} 颗</option>)}
        </select></label>
        <button type="button" onClick={() => setTimerRunning((value) => !value)}>{timerRunning ? "暂停" : "继续"} {formatClock(focusSeconds)}</button>
        <div className="focus-progress"><i><em style={{ width: focusProgress + "%" }} /></i><b>{focusProgress}%</b><small>{focusedDone} / {focusedTotal} 颗已标记</small></div>
        <button className="reset-progress" type="button" onClick={() => setCompletedCells(new Set())}>重置进度</button>
      </div>}

      {inventoryOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setInventoryOpen(false); }}>
        <section className="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-title">
          <header><span><small>库存驱动取色</small><h2 id="inventory-title">选择手上真实拥有的颜色</h2></span><button type="button" aria-label="关闭库存色板" onClick={() => setInventoryOpen(false)}>×</button></header>
          <div className="inventory-tools">
            <input aria-label="搜索颜色或色号" value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder={"搜索名称、HEX 或 " + brand + " 色号"} />
            <button type="button" onClick={() => setInventoryDraft(new Set(BEAD_PALETTE.map((color) => color.hex)))}>全选</button>
            <button type="button" onClick={() => setInventoryDraft(new Set(stats.map((item) => item.color.hex)))}>仅当前用色</button>
          </div>
          <p className="inventory-count">已选 {inventoryDraft.size} / {BEAD_PALETTE.length} 色 · 当前显示 {filteredInventory.length} 色</p>
          <div className="inventory-grid">
            {filteredInventory.map((color) => {
              const selected = inventoryDraft.has(color.hex);
              return <button key={color.hex} type="button" className={selected ? "selected" : ""} onClick={() => setInventoryDraft((current) => {
                const next = new Set(current);
                if (next.has(color.hex)) next.delete(color.hex); else next.add(color.hex);
                return next;
              })}><i style={{ background: color.hex }} /><span><b>{color.codes[brand]}</b><small>{color.name}</small></span><em>{selected ? "✓" : ""}</em></button>;
            })}
          </div>
          <footer><span>应用后只使用所选库存色，缺色会匹配到最近库存色。</span><button type="button" onClick={applyInventory}>应用库存色板</button></footer>
        </section>
      </div>}
    </main>
  );
}
