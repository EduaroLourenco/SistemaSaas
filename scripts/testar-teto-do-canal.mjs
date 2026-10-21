/**
 * O preço que o canal propõe é teto: a oferta pode descer, nunca subir.
 *
 * Promoção é desconto. Escrever um preço acima da proposta é contrapropor
 * um desconto MENOR, e o canal devolve a linha com "O preço final que você
 * configurou para a oferta não é confiável".
 *
 * A Imprimil tropeçou nisso duas vezes na campanha 11.11, em 20 e 21/10/2026.
 * Na primeira, o preço de tabela foi escrito por cima da proposta: 16,03
 * onde o canal propunha 15,58. Catorze linhas, catorze recusas. Na segunda,
 * uma tentativa de consertar escreveu porcentagem e preço juntos, e as treze
 * linhas voltaram recusadas igual — porque o que o canal recusa é o preço
 * ter subido, não o par estar desencontrado.
 *
 * (A porcentagem da planilha é arredondada e NÃO descreve o preço nem na
 * proposta do próprio canal: 25,90 com 40% daria 15,54, e ele propõe 15,58.
 * Por isso o teste confere o preço, não a porcentagem.)
 *
 * O que este teste prende, nos três casos que importam:
 *   · mínimo acima da proposta  → fica de fora, e nada é escrito
 *   · mínimo abaixo da proposta → a oferta desce, como sempre
 *   · mínimo igual à proposta   → entra sem contrapor
 */
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { processarPlanilha } from "./lib/processar.mjs";

/* Uma campanha do canal: sem SALE_FEE, com preço proposto por linha. */
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
      l.cheio,
      l.pctDoCanal,
      l.propostaDoCanal,
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

function base(tabelaPorMlb) {
  const baseMlb = new Map();
  const precosMLB = new Map();
  for (const [mlb, preco] of Object.entries(tabelaPorMlb)) {
    baseMlb.set(mlb, { tipo: "Clássico", padrao: 0.115 });
    precosMLB.set(mlb, { 0.115: preco });
  }
  return { baseMlb, precosMLB, precosSKU: new Map() };
}

/* Os números do MLB7711747260 da Imprimil, e dois contrapontos. */
const CASOS = [
  {
    nome: "mínimo acima da proposta",
    mlb: "MLB1",
    sku: "A",
    cheio: 25.9,
    pctDoCanal: 40,
    propostaDoCanal: 15.58,
    tabela: 16.03,
    entra: false,
  },
  {
    nome: "mínimo abaixo da proposta",
    mlb: "MLB2",
    sku: "B",
    cheio: 25.9,
    pctDoCanal: 40,
    propostaDoCanal: 15.58,
    tabela: 14,
    entra: true,
    escreve: 14,
  },
  {
    nome: "mínimo igual à proposta",
    mlb: "MLB3",
    sku: "C",
    cheio: 25.9,
    pctDoCanal: 40,
    propostaDoCanal: 15.58,
    tabela: 15.58,
    entra: true,
    escreve: 15.58,
  },
];

const r = await processarPlanilha(
  await planilha(CASOS),
  "11.11.xlsx",
  base(Object.fromEntries(CASOS.map((c) => [c.mlb, c.tabela]))),
  0,
);

assert.equal(r.linhas.length, 3, "as três linhas foram lidas");

const saida = new ExcelJS.Workbook();
await saida.xlsx.load(r.buffer);
const ws = saida.getWorksheet("Promoções");

/* O que ficou no arquivo gerado, por MLB. */
const noArquivo = new Map();
for (let i = 2; i <= ws.rowCount; i++) {
  const g = (c) => ws.getRow(i).getCell(c).value;
  const mlb = String(g(1));
  if (!/^MLB\d+$/.test(mlb)) continue;
  noArquivo.set(mlb, { final: Number(g(6)), acao: String(g(8) ?? "") });
}

for (const c of CASOS) {
  const linha = r.linhas.find((l) => l.mlb === c.mlb);
  const escrito = noArquivo.get(c.mlb);
  assert.ok(linha && escrito, `${c.nome}: a linha existe`);

  if (!c.entra) {
    assert.equal(linha.aprovado, false, `${c.nome}: fica de fora`);
    assert.equal(escrito.acao, "Não aplicar", `${c.nome}: ação negativa no arquivo`);
    /* E o preço do canal fica intacto: não se contrapõe nem de lembrança. */
    assert.equal(
      escrito.final,
      c.propostaDoCanal,
      `${c.nome}: o preço do canal não foi tocado`,
    );
    assert.match(
      linha.motivo,
      /não pode subir/,
      `${c.nome}: o motivo diz por que`,
    );
    continue;
  }

  assert.equal(linha.aprovado, true, `${c.nome}: entra na campanha`);
  assert.equal(escrito.acao, "Aplicar proposta", `${c.nome}: ação positiva`);
  assert.equal(escrito.final, c.escreve, `${c.nome}: o preço escrito`);
  assert.ok(
    escrito.final <= c.propostaDoCanal + 0.01,
    `${c.nome}: ${escrito.final} não pode passar da proposta ${c.propostaDoCanal}`,
  );
}

console.log("3 casos conferidos: a oferta desce ou fica de fora, nunca sobe");
