/**
 * Porcentagem e preço final têm de descrever o mesmo desconto.
 *
 * A planilha da Central de Promoções diz, na própria coluna de preço
 * final: "o preço final deve corresponder ao desconto que você adicionar
 * na coluna anterior". Quem reescreve só o preço deixa o par inconsistente,
 * e o canal devolve a linha com "O preço final que você configurou para a
 * oferta não é confiável".
 *
 * Em 20/10/2026 as catorze linhas da campanha 11.11 da Imprimil voltaram
 * assim. O preço de tabela estava certo; a porcentagem continuava a do
 * canal, e nenhuma das duas descrevia a outra.
 *
 * O que este teste prende: o par que SAI da planilha fecha na conta do
 * canal — `final == original × (1 − pct/100)`, truncado no centavo — e o
 * preço nunca cai abaixo do mínimo nosso.
 */
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { processarPlanilha } from "./lib/processar.mjs";
import { precoDaPorcentagem } from "./lib/motor-promocoes.mjs";

/* Uma planilha de campanha do canal, montada aqui: ITEM_ID/SKU/ORIGINAL_PRICE/
   DISCOUNT_PERCENTAGE/FINAL_PRICE/ACTION, com a porcentagem proposta pelo
   canal deliberadamente desencontrada do preço de tabela. */
async function planilha(linhas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Promoções");
  ws.addRow([
    "ITEM_ID",
    "SKU",
    "PROMO_NAME",
    "ORIGINAL_PRICE",
    "DISCOUNT_PERCENTAGE",
    "FINAL_PRICE",
    "STATUS",
    "ACTION",
    "PROMO_TYPE",
  ]);
  for (const l of linhas) {
    const r = ws.addRow([
      l.mlb,
      l.sku,
      "11.11",
      l.original,
      l.pctDoCanal,
      l.finalDoCanal,
      "Nova proposta",
      "",
      "TIERS",
    ]);
    r.getCell(8).dataValidation = {
      type: "list",
      formulae: ['"Aplicar proposta,Não aplicar"'],
    };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* Base com preço de tabela por MLB na comissão de clássico (11,5%). */
function base(tabelaPorMlb) {
  const precosMLB = new Map();
  const baseMlb = new Map();
  for (const [mlb, preco] of Object.entries(tabelaPorMlb)) {
    baseMlb.set(mlb, { tipo: "Clássico", padrao: 0.115 });
    precosMLB.set(mlb, { 0.115: preco });
  }
  return { baseMlb, precosMLB, precosSKU: new Map() };
}

const ENTRADA = [
  /* Cabe: a tabela de 16,03 sobre 25,90 pede 38% de desconto. */
  { mlb: "MLB1", sku: "A", original: 25.9, pctDoCanal: 40, finalDoCanal: 15.54 },
  /* Cabe com folga larga: 50,00 sobre 64,90 são 22%. */
  { mlb: "MLB2", sku: "B", original: 64.9, pctDoCanal: 27, finalDoCanal: 47.38 },
  /* NÃO cabe: a tabela está a 0,1% do preço cheio, e o canal exige 5%. */
  { mlb: "MLB3", sku: "C", original: 299.35, pctDoCanal: 3, finalDoCanal: 290.36 },
];

const TABELA = { MLB1: 16.03, MLB2: 50, MLB3: 299 };

const r = await processarPlanilha(
  await planilha(ENTRADA),
  "11.11.xlsx",
  base(TABELA),
  0
);

assert.equal(r.linhas.length, 3, "as três linhas foram lidas");

const saida = new ExcelJS.Workbook();
await saida.xlsx.load(r.buffer);
const ws = saida.getWorksheet("Promoções");

let conferidas = 0;
for (let i = 2; i <= ws.rowCount; i++) {
  const g = (c) => ws.getRow(i).getCell(c).value;
  const mlb = String(g(1));
  const original = Number(g(4));
  const pct = Number(g(5));
  const final = Number(g(6));
  const acao = String(g(8) ?? "");

  if (acao === "Não aplicar") {
    /* Linha recusada não é escrita: o par que está ali é o do canal, e o
       canal ignora o preço de quem não participa. */
    assert.equal(mlb, "MLB3", "só a linha sem 5% de espaço foi recusada");
    conferidas++;
    continue;
  }

  assert.equal(acao, "Aplicar proposta", `${mlb} entrou na campanha`);

  /* O par fecha na conta do canal. */
  assert.equal(
    final,
    precoDaPorcentagem(original, pct),
    `${mlb}: ${original} × (1−${pct}%) tem de dar ${final}`
  );

  /* A porcentagem é inteira e dentro do que o canal aceita. */
  assert.ok(Number.isInteger(pct), `${mlb}: porcentagem sem decimal`);
  assert.ok(pct >= 5 && pct <= 80, `${mlb}: porcentagem entre 5% e 80%`);

  /* E o preço não furou o mínimo. */
  assert.ok(
    final >= TABELA[mlb] - 0.005,
    `${mlb}: ${final} não pode ficar abaixo da tabela ${TABELA[mlb]}`
  );
  conferidas++;
}

assert.equal(conferidas, 3, "as três linhas foram conferidas no arquivo gerado");
console.log("3 linhas conferidas: o par porcentagem/preço fecha e respeita o mínimo");
