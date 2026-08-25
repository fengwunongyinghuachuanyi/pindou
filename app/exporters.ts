import { Grid, colorStats, serializableGrid } from "./bead-engine";
import { Brand } from "./palette";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 600);
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? "\"" + text.replaceAll("\"", "\"\"") + "\"" : text;
}

function isDark(hex: string) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 < 145;
}

export function exportBomCsv(grid: Grid, brand: Brand) {
  const stats = colorStats(grid);
  const total = stats.reduce((sum, item) => sum + item.count, 0);
  const rows = [
    ["品牌", "色号", "颜色名", "HEX", "数量", "建议备料(含8%余量)"].map(csvCell).join(","),
    ...stats.map((item) => [brand, item.color.codes[brand], item.color.name, item.color.hex, item.count, Math.ceil(item.count * 1.08)].map(csvCell).join(",")),
    ["", "", "合计", "", total, Math.ceil(total * 1.08)].map(csvCell).join(","),
  ];
  downloadBlob(new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" }), "豆搭-" + brand + "-采购清单.csv");
}

export function exportMatrixCsv(grid: Grid, brand: Brand) {
  const rows = [["row", "column", "hex", "name", "brand", "code", "status"].join(",")];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    rows.push([
      y + 1,
      x + 1,
      cell.external || !cell.color ? "" : cell.color.hex,
      cell.external || !cell.color ? "" : cell.color.name,
      brand,
      cell.external || !cell.color ? "" : cell.color.codes[brand],
      cell.external || !cell.color ? "empty" : "bead",
    ].map(csvCell).join(","));
  }));
  downloadBlob(new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" }), "豆搭-" + grid[0].length + "x" + grid.length + "-矩阵.csv");
}

export function exportProjectJson(
  grid: Grid,
  options: {
    name: string;
    settings: unknown;
    transform: unknown;
    brand: Brand;
    activePalette: string[];
    completed: string[];
    focusSeconds: number;
  },
) {
  const project = {
    app: "豆搭",
    version: 2,
    exportedAt: new Date().toISOString(),
    name: options.name || "豆搭工程",
    settings: options.settings,
    transform: options.transform,
    brand: options.brand,
    activePalette: options.activePalette,
    completed: options.completed,
    focusSeconds: options.focusSeconds,
    grid: serializableGrid(grid),
  };
  downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), "豆搭-" + grid[0].length + "x" + grid.length + "-工程.json");
}

export function exportGuidePng(grid: Grid, brand: Brand) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (!rows || !cols) return;
  const stats = colorStats(grid);
  const total = stats.reduce((sum, item) => sum + item.count, 0);
  const cellSize = cols > 80 ? 22 : 28;
  const left = 50;
  const top = 70;
  const legendColumns = cols < 40 ? 1 : 2;
  const legendRows = Math.ceil(stats.length / legendColumns);
  const width = Math.max(left + cols * cellSize + 24, 720);
  const gridBottom = top + rows * cellSize;
  const height = gridBottom + 82 + legendRows * 30;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#fffefa";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#183d31";
  context.font = "700 24px Arial, sans-serif";
  context.fillText("豆搭制作图 · " + cols + " × " + rows, left, 32);
  context.fillStyle = "#6b756f";
  context.font = "12px Arial, sans-serif";
  context.fillText(brand + " 色号 · " + stats.length + " 色 · " + total + " 颗 · 粗线每 5 格，深线每 29 格", left, 52);
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
    const cell = grid[y][x];
    const px = left + x * cellSize;
    const py = top + y * cellSize;
    context.fillStyle = cell.external || !cell.color ? "#f1f1ec" : cell.color.hex;
    context.fillRect(px, py, cellSize, cellSize);
    if (!cell.external && cell.color) {
      context.fillStyle = "rgba(255,255,255,.28)";
      context.beginPath();
      context.arc(px + cellSize * 0.31, py + cellSize * 0.28, 2, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = isDark(cell.color.hex) ? "#fff" : "#252a27";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "700 " + (cellSize > 24 ? 8 : 7) + "px ui-monospace, monospace";
      context.fillText(cell.color.codes[brand], px + cellSize / 2, py + cellSize / 2 + 1);
    }
    context.strokeStyle = "rgba(30,40,34,.14)";
    context.lineWidth = 0.5;
    context.strokeRect(px, py, cellSize, cellSize);
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#59645e";
  context.font = "9px Arial, sans-serif";
  for (let x = 0; x < cols; x += 1) if (cols <= 60 || x % 5 === 0) context.fillText(String(x + 1), left + x * cellSize + cellSize / 2, top - 10);
  for (let y = 0; y < rows; y += 1) if (rows <= 60 || y % 5 === 0) context.fillText(String(y + 1), left - 16, top + y * cellSize + cellSize / 2);
  for (let x = 0; x <= cols; x += 1) if (x % 5 === 0 || x === cols) {
    context.beginPath();
    context.moveTo(left + x * cellSize, top);
    context.lineTo(left + x * cellSize, gridBottom);
    context.strokeStyle = x % 29 === 0 ? "#183d31" : "#66766e";
    context.lineWidth = x % 29 === 0 ? 2.4 : 1.1;
    context.stroke();
  }
  for (let y = 0; y <= rows; y += 1) if (y % 5 === 0 || y === rows) {
    context.beginPath();
    context.moveTo(left, top + y * cellSize);
    context.lineTo(left + cols * cellSize, top + y * cellSize);
    context.strokeStyle = y % 29 === 0 ? "#183d31" : "#66766e";
    context.lineWidth = y % 29 === 0 ? 2.4 : 1.1;
    context.stroke();
  }
  const legendTop = gridBottom + 38;
  context.textAlign = "left";
  context.fillStyle = "#183d31";
  context.font = "700 14px Arial, sans-serif";
  context.fillText("用色清单", left, legendTop - 12);
  const columnWidth = (width - left - 24) / legendColumns;
  stats.forEach((item, index) => {
    const column = Math.floor(index / legendRows);
    const row = index % legendRows;
    const x = left + column * columnWidth;
    const y = legendTop + 17 + row * 30;
    context.fillStyle = item.color.hex;
    context.fillRect(x, y - 9, 20, 20);
    context.strokeStyle = "rgba(0,0,0,.2)";
    context.lineWidth = 1;
    context.strokeRect(x, y - 9, 20, 20);
    context.fillStyle = "#26332d";
    context.font = "700 11px Arial, sans-serif";
    context.fillText(item.color.codes[brand] + " · " + item.color.name, x + 29, y);
    context.fillStyle = "#68736d";
    context.font = "11px Arial, sans-serif";
    context.fillText(item.count + " 颗", x + Math.min(columnWidth - 55, 215), y);
  });
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, "豆搭-" + cols + "x" + rows + "-" + brand + "-制作图.png");
  }, "image/png");
}
