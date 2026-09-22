import { test } from "node:test";
import assert from "node:assert/strict";
import { cachePdfSelection } from "../src/services/pdf-cache";
import { LIMITS } from "../shared/analysis";

function copyFile() {
  return { exists: false, size: 0, delete() { this.exists = false; } };
}
test("PDF selection awaits private copies and never moves or deletes originals", async () => {
  const source = { size: 12, delete: () => assert.fail("Original must survive"), copy: async (copy: ReturnType<typeof copyFile>) => {
    await Promise.resolve(); copy.exists = true; copy.size = 12;
  } };
  const copies = await cachePdfSelection([source, source], copyFile);
  assert.equal(copies.length, 2);
  assert.notEqual(copies[0], copies[1]);
  assert.ok(copies.every(copy => copy.exists && copy.size === 12));
});
test("failed or missing PDF copy removes partial copies and hides native error details", async () => {
  const made: ReturnType<typeof copyFile>[] = [];
  const create = () => { const file = copyFile(); made.push(file); return file; };
  await assert.rejects(cachePdfSelection([
    { size: 1, copy: async copy => { copy.exists = true; copy.size = 1; } },
    { size: 1, copy: async copy => { copy.exists = true; throw new Error("private document URI"); } },
  ], create), { message: "No se pudo copiar el PDF. Descárgalo en el móvil y vuelve a seleccionarlo." });
  assert.ok(made.every(copy => !copy.exists));
  await assert.rejects(cachePdfSelection([{ size: 1, copy: async () => {} }], copyFile), /copia legible/);
});
test("PDF copy checks count, actual copied size and total, cleaning rejected copies", async () => {
  let copies = 0;
  const source = { size: 1, copy: async (copy: ReturnType<typeof copyFile>) => { copies++; copy.exists = true; copy.size = LIMITS.fileBytes; } };
  await assert.rejects(cachePdfSelection(Array(7).fill(source), copyFile), /6 archivos/);
  assert.equal(copies, 0);
  await assert.rejects(cachePdfSelection([{ ...source, size: LIMITS.fileBytes + 1 }], copyFile), /4 MB/);
  assert.equal(copies, 0);
  const made: ReturnType<typeof copyFile>[] = [];
  await assert.rejects(cachePdfSelection([source, source, source], () => { const file = copyFile(); made.push(file); return file; }), /10 MB/);
  assert.ok(made.every(copy => !copy.exists));
  await assert.rejects(cachePdfSelection([{ size: 1, copy: async copy => { copy.exists = true; copy.size = LIMITS.fileBytes + 1; } }], copyFile), /4 MB/);
});
