/**
 * Formatos em que o Meli devolve a etiqueta.
 *
 * Roda: node scripts/testar-etiquetas.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { PDFDocument } = require("pdf-lib");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": path.join(raiz, "node_modules/server-only/empty.js") },
  interopDefault: true,
});
const { paginasDaEtiqueta } = await jiti.import(path.join(raiz, "src/lib/meli/etiquetas.ts"));

const ETIQUETA = [283.46, 425.2];
const A4_EM_PE = [595, 842];
const A4_DEITADA = [842, 595];

async function rodar(tamanhos) {
  const origem = await PDFDocument.create();
  tamanhos.forEach((t) => origem.addPage(t).drawRectangle({ x: 40, y: 150, width: 100, height: 100 }));
  const doc = await PDFDocument.create();
  const paginas = await paginasDaEtiqueta(doc, origem);
  await doc.save();
  return paginas.map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
}

assert.deepEqual(await rodar([ETIQUETA, ETIQUETA, A4_EM_PE]), [[283, 425], [283, 425]], "10x15 fica, resumo sai");
assert.deepEqual(await rodar([A4_DEITADA, A4_EM_PE]), [[283, 425]], "A4 deitada vira etiqueta 10x15");
assert.deepEqual(await rodar([A4_EM_PE]), [], "só resumo não é etiqueta");
console.log("ok");
