/**
 * Anúncio repetido na mesma promoção não pode derrubar o lote.
 *
 * O canal devolve uma linha por OFERTA, não por anúncio: um MLB com
 * variações, ou proposto duas vezes dentro da mesma campanha, volta
 * repetido. O banco grava por (promoção, anúncio) e o Postgres recusa um
 * upsert cujo lote toque a mesma chave duas vezes:
 *
 *   ON CONFLICT DO UPDATE command cannot affect row a second time
 *
 * Em 19/10/2026 isso apareceu nas duas contas da Probel, nas promoções
 * LGH-MLB1000 e P-MLB18073006 — e o lote inteiro de itens se perdia por
 * causa de uma repetição.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const vazio = path.join(mkdtempSync(path.join(tmpdir(), "gerizo-")), "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { semRepetidos } = await jiti.import(path.join(raiz, "src/lib/meli/promocoes-canal.ts"));

const item = (codigo, preco) => ({
  codigoExterno: codigo,
  status: "candidate",
  precoOriginal: 100,
  precoPromocional: preco,
  percentual: null,
  inicio: null,
  fim: null,
});

/* A chave do banco é (promoção, anúncio): duas linhas do mesmo MLB viram uma. */
const comRepetido = [item("MLB1", 90), item("MLB2", 80), item("MLB1", 85), item("MLB3", 70)];
const unicos = semRepetidos(comRepetido);
assert.equal(unicos.length, 3, "três anúncios distintos, três linhas");
assert.deepEqual(
  unicos.map((i) => i.codigoExterno).sort(),
  ["MLB1", "MLB2", "MLB3"]
);

/* Fica a ÚLTIMA: é a mais recente na ordem do cursor do canal. */
assert.equal(
  unicos.find((i) => i.codigoExterno === "MLB1").precoPromocional,
  85,
  "a última ocorrência é a que vale"
);

/* O código vem com caixa diferente em alguns retornos; a chave do banco
   não distingue, então a de-duplicação também não pode distinguir. */
const caixaMista = semRepetidos([item("MLB1", 90), item("mlb1", 85)]);
assert.equal(caixaMista.length, 1, "mesmo MLB em caixa diferente é o mesmo anúncio");
assert.equal(caixaMista[0].precoPromocional, 85);

/* Sem repetição, nada muda — nem a ordem, nem a quantidade. */
const limpo = [item("MLB9", 10), item("MLB8", 20)];
assert.deepEqual(semRepetidos(limpo).map((i) => i.codigoExterno), ["MLB9", "MLB8"]);
assert.deepEqual(semRepetidos([]), []);

console.log("OK: repetido vira uma linha só, fica a última, caixa não engana, lista limpa passa intacta.");
