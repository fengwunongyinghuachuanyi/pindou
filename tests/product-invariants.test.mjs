import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the complete five-brand 291-color mapping", async () => {
  const mapping = JSON.parse(await readFile(new URL("app/color-system-mapping.json", root), "utf8"));
  const entries = Object.entries(mapping);
  assert.equal(entries.length, 291);
  for (const [hex, codes] of entries) {
    assert.match(hex, /^#[0-9A-F]{6}$/);
    assert.deepEqual(Object.keys(codes), ["MARD", "COCO", "漫漫", "盼盼", "咪小窝"]);
    assert.ok(Object.values(codes).every((code) => typeof code === "string" && code.length > 0));
  }
});

test("keeps transparency and removes background before palette compaction", async () => {
  const engine = await readFile(new URL("app/bead-engine.ts", root), "utf8");
  assert.match(engine, /alpha < 0\.14/);
  const backgroundIndex = engine.indexOf("grid = markExternalBackground");
  const compactIndex = engine.indexOf("grid = compactPalette");
  assert.ok(backgroundIndex > 0);
  assert.ok(compactIndex > backgroundIndex);
});

test("all delivery formats use the same current grid", async () => {
  const exporters = await readFile(new URL("app/exporters.ts", root), "utf8");
  for (const functionName of ["exportBomCsv", "exportMatrixCsv", "exportProjectJson", "exportGuidePng"]) {
    assert.match(exporters, new RegExp("function " + functionName + "\\(\\s*grid: Grid"));
  }
  assert.match(exporters, /粗线每 5 格，深线每 29 格/);
  assert.match(exporters, /serializableGrid\(grid\)/);
});
