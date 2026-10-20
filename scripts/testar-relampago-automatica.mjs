/**
 * Relâmpago automática: o preço é do canal, e não se reescreve.
 *
 * Em 19/10/2026 a Bom de Compras mandou 36 linhas e recebeu 15 de volta.
 * Sete delas eram `PROMO_SUB_TYPE = AUTOMATIC` e tinham o preço de tabela
 * escrito por cima da proposta do Mercado Livre — GP331 virou R$ 28,90
 * onde o canal pedia R$ 27,86, 2GP304 virou R$ 10,78 onde ele pedia
 * R$ 10,24. O retorno foi "Devido a um erro, não foi possível programar
 * este produto" em todas. As outras oito linhas do mesmo arquivo, que não
 * são automáticas, mantiveram o preço e entraram.
 *
 * A planilha não dá pista: ela diz "Você pode alterar esta coluna" em
 * todas as linhas, sem bloqueio por célula. O único sinal é a coluna
 * técnica PROMO_SUB_TYPE.
 *
 * Este teste trava as três situações da linha automática:
 *   · proposta acima do mínimo  → participa NO PREÇO DO CANAL, sem reescrever
 *   · proposta igual ao mínimo  → participa, ainda sem reescrever
 *   · proposta abaixo do mínimo → fica de fora, com o motivo
 * e confere que a linha não-automática continua sendo recalculada.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const vazio = path.join(mkdtempSync(path.join(tmpdir(), "gerizo-")), "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { processarPlanilha } = await jiti.import(path.join(raiz, "src/lib/planilhas/processar.ts"));

/* A linha técnica, como o canal exporta. */
const CABECALHO = [
  "TITLE", "ITEM_ID", "SKU", "ORIGINAL_PRICE", "FINAL_PRICE", "SALE_FEE",
  "STATUS", "ACTION", "PROMO_TYPE", "CANDIDATE_ID", "PROMO_SUB_TYPE",
];
const TABELA = 28.9; // o nosso mínimo, igual ao caso real do GP331

const LINHAS = [
  { mlb: "MLB1", sub: "AUTOMATIC", proposta: 30.0, espera: "Participar", escreve: false, nota: "proposta acima do mínimo" },
  { mlb: "MLB2", sub: "AUTOMATIC", proposta: 28.9, espera: "Participar", escreve: false, nota: "proposta exatamente no mínimo" },
  { mlb: "MLB3", sub: "AUTOMATIC", proposta: 27.86, espera: "Não participar", escreve: false, nota: "proposta abaixo do mínimo — o caso real" },
  { mlb: "MLB4", sub: "LIGHTNING", proposta: 27.86, espera: "Participar", escreve: true, nota: "não é automática: continua recalculando" },
];

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Promoções");
ws.addRow(CABECALHO);
for (const l of LINHAS) {
  ws.addRow(["Carretilha", l.mlb, "SKU1", 45.9, l.proposta, null, "Nova proposta", "", "LIGHTNING", "CAND-" + l.mlb, l.sub]);
}
for (let r = 2; r <= LINHAS.length + 1; r++) {
  ws.getCell(r, 8).dataValidation = {
    type: "list", allowBlank: true, formulae: ['"Participar,Não participar"'],
  };
}
const entrada = Buffer.from(await wb.xlsx.writeBuffer());

const formula = {
  baseMlb: new Map(LINHAS.map((l) => [l.mlb, { padrao: 0.115, tipo: "classico" }])),
  precosSKU: new Map([["SKU1", { 0.115: TABELA, 0.165: TABELA }]]),
  precosMLB: new Map(),
};

const r = await processarPlanilha(entrada, "Participe da oferta relâmpago.xlsx", formula);
const porMlb = new Map(r.linhas.map((l) => [l.mlb, l]));
assert.equal(r.linhas.length, LINHAS.length);

for (const l of LINHAS) {
  const linha = porMlb.get(l.mlb);
  assert.ok(linha, `${l.mlb} não apareceu no resultado`);
  assert.equal(linha.decisao, l.espera, `${l.mlb} (${l.nota}): decisão errada`);
  assert.equal(
    linha.recalculado,
    l.escreve,
    `${l.mlb} (${l.nota}): ${l.escreve ? "deveria" : "NÃO deveria"} reescrever o preço`
  );
}

/* O preço que vai para o canal na linha automática é o DELE, não o nosso. */
assert.equal(porMlb.get("MLB1").precoOferta, 30.0, "a automática aprovada mantém o preço do canal");
assert.equal(porMlb.get("MLB2").precoOferta, 28.9);
/* E a não-automática recebe o nosso mínimo por cima, como sempre. */
assert.equal(porMlb.get("MLB4").precoOferta, TABELA, "a não-automática continua recebendo o preço de tabela");

/* A recusa tem que dizer POR QUE, senão vira um "não" sem recurso. */
const motivo = r.itensRelatorio.find((i) => i.mlb === "MLB3")?.motivo ?? "";
assert.match(motivo, /autom[áa]tica/i, "a recusa precisa citar a campanha automática");
assert.match(motivo, /27,86/, "a recusa precisa citar o preço proposto pelo canal");
assert.match(motivo, /28,90/, "a recusa precisa citar o nosso mínimo");

console.log("OK: automática aprovada não reescreve preço, abaixo do mínimo fica de fora com motivo, não-automática segue recalculando.");
