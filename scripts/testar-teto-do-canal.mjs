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
 * O que este teste prende, nos quatro casos que importam:
 *   · mínimo acima da proposta  → fica de fora, e nada é escrito
 *   · proposta acima do mínimo  → entra NO PREÇO DO CANAL, que é a melhor
 *     margem disponível na campanha
 *   · proposta igual ao mínimo  → entra, idem
 *   · desconto extra pedido     → desce, porque descer o canal aceita
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
  return {
    baseMlb,
    precosMLB,
    precosSKU: new Map(),
    /* Tolerância zero de propósito: aqui o assunto é o teto, e com os 5%
       padrão as propostas destes casos cairiam dentro da folga. A folga tem
       teste próprio, em `testar-piso-promocao.mjs`. */
    regra: { modo: "tabela", margemMinima: 0, toleranciaPct: 0 },
  };
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
    nome: "proposta acima do mínimo",
    mlb: "MLB2",
    sku: "B",
    cheio: 25.9,
    pctDoCanal: 40,
    propostaDoCanal: 15.58,
    tabela: 14,
    entra: true,
  },
  {
    nome: "proposta igual ao mínimo",
    mlb: "MLB3",
    sku: "C",
    cheio: 25.9,
    pctDoCanal: 40,
    propostaDoCanal: 15.58,
    tabela: 15.58,
    entra: true,
  },
];

const entrada = await planilha(CASOS);
const formula = base(Object.fromEntries(CASOS.map((c) => [c.mlb, c.tabela])));

const r = await processarPlanilha(entrada, "11.11.xlsx", formula, 0);
assert.equal(r.linhas.length, 3, "as três linhas foram lidas");

/* O que ficou no arquivo gerado, por MLB. */
async function noArquivo(buffer) {
  const saida = new ExcelJS.Workbook();
  await saida.xlsx.load(buffer);
  const ws = saida.getWorksheet("Promoções");
  const m = new Map();
  for (let i = 2; i <= ws.rowCount; i++) {
    const g = (c) => ws.getRow(i).getCell(c).value;
    const mlb = String(g(1));
    if (!/^MLB\d+$/.test(mlb)) continue;
    m.set(mlb, { final: Number(g(6)), acao: String(g(8) ?? "") });
  }
  return m;
}

const escrito = await noArquivo(r.buffer);

for (const c of CASOS) {
  const linha = r.linhas.find((l) => l.mlb === c.mlb);
  const cel = escrito.get(c.mlb);
  assert.ok(linha && cel, `${c.nome}: a linha existe`);

  if (!c.entra) {
    assert.equal(linha.aprovado, false, `${c.nome}: fica de fora`);
    assert.equal(cel.acao, "Não aplicar", `${c.nome}: ação negativa no arquivo`);
    /* O motivo diz os dois números que decidiram: quanto o canal propôs e
       qual era o nosso mínimo. Sem eles a recusa vira um "não" sem recurso. */
    assert.match(linha.motivo, /15,58/, `${c.nome}: o motivo cita a proposta`);
    assert.match(linha.motivo, /16,03/, `${c.nome}: o motivo cita o mínimo`);
  } else {
    assert.equal(linha.aprovado, true, `${c.nome}: entra na campanha`);
    assert.equal(cel.acao, "Aplicar proposta", `${c.nome}: ação positiva`);
  }

  /* A regra, nos três: o preço no arquivo nunca passa da proposta. */
  assert.ok(
    cel.final <= c.propostaDoCanal + 0.01,
    `${c.nome}: ${cel.final} não pode passar da proposta ${c.propostaDoCanal}`,
  );
}

/* Quem entra entra no preço do canal: é a maior margem que a campanha dá. */
assert.equal(escrito.get("MLB2").final, 15.58, "não contrapropõe o mínimo de 14,00");
assert.equal(escrito.get("MLB3").final, 15.58);

/*
 * O desconto extra é o caminho que SOBROU para escrever preço, e tem de
 * continuar funcionando: é um pedido explícito de descer mais, e descer o
 * canal aceita.
 *
 * Em FRAÇÃO, como a tela manda ("5 ou 0,05"), e partindo do piso: a tabela
 * de 14,00 vira 13,30 de piso, e 5% sobre ele dá 12,64. O valor exato é
 * conferido, não só "menor que a proposta" — com o número em porcentagem
 * por engano sai −53,20, que também é menor e passaria calado.
 */
const comExtra = await processarPlanilha(entrada, "11.11.xlsx", formula, 0.05);
const extra = await noArquivo(comExtra.buffer);
assert.equal(extra.get("MLB2").final, 12.64, "com desconto extra o preço desce ao calculado");
assert.equal(extra.get("MLB2").acao, "Aplicar proposta", "e a linha entra");

console.log("3 casos + desconto extra conferidos: a oferta desce ou fica de fora, nunca sobe");
