/**
 * Oferta JÁ ACEITA não é tocada pelo processamento.
 *
 * É a regra que protege dinheiro que já está no ar: reescrever a ação ou o
 * preço de uma oferta aceita troca um acordo vigente, no preço em que foi
 * aprovado, por outro que ainda precisaria passar pelo canal — e o anúncio
 * sai da campanha nesse meio-tempo, sem avisar ninguém.
 *
 * O código tinha a proteção e nenhum teste. Este monta uma planilha no
 * formato da Central de Promoções, roda o processamento REAL e confere, por
 * célula, que a linha aceita saiu idêntica à que entrou — com o contraste
 * que torna a prova decisiva: quatro linhas com os MESMOS números, duas
 * aceitas e duas em aberto. As em aberto vão de 80 para 54,15; as aceitas
 * ficam em 80.
 *
 * O que faz as em aberto descerem é o DESCONTO EXTRA de 5%. Sem ele, desde
 * 21/10/2026, nenhuma delas seria reescrita: a proposta do canal cobre o
 * mínimo e quem entra entra no preço dele (ver `testar-teto-do-canal.mjs`).
 * O desconto extra é um pedido explícito de descer, e é o que mantém este
 * teste com um preço novo para comparar.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

/* Jiti e não `--experimental-strip-types`: `processar.ts` importa
   `./motor-promocoes` sem extensão, e o carregador do Node não resolve. */
const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src") }, interopDefault: true });
const { processarPlanilha, ofertaJaFechada, acaoEditavel } = await jiti.import(
  path.join(raiz, "src/lib/planilhas/processar.ts")
);

/* ── A unidade: quais status contam como fechado ── */
for (const fechado of [
  "Participando",
  "participando",
  "Aceita",
  "Oferta aceita",
  "Negociado com o vendedor",
  "Aprovada",
  "Vigente",
  "Ativa",
  "Em campanha",
  "Confirmada",
]) {
  assert.equal(ofertaJaFechada(fechado), true, `"${fechado}" deveria contar como oferta fechada`);
}

/* A negação é o caso em que errar INVERTE a regra: "Não participando"
   contém "participando" e é justamente a linha que se quer processar. */
for (const aberto of [
  "Não participando",
  "Nao participando",
  "Sem participação",
  "Fora da campanha",
  "Nova proposta",
  "Pendente",
  "",
]) {
  assert.equal(ofertaJaFechada(aberto), false, `"${aberto}" deveria seguir para análise`);
}

/* A segunda porta: a célula de ação precisa oferecer entrar na campanha. */
assert.equal(acaoEditavel(["Participar", "Não participar"]), true);
assert.equal(acaoEditavel(["Sair da campanha"]), false);
assert.equal(acaoEditavel(null), true, "sem validação, a planilha antiga continua processável");

/* ── O caminho inteiro, numa planilha de verdade ── */
const CABECALHO = ["SKU", "item_id", "Preço final", "Preço original", "SALE_FEE", "Status da promoção", "Ação"];

const LINHAS = [
  { mlb: "MLB1", status: "Nova proposta", acao: "", fechada: false },
  { mlb: "MLB2", status: "Participando", acao: "Participar", fechada: true },
  { mlb: "MLB3", status: "Oferta aceita", acao: "Participar", fechada: true },
  { mlb: "MLB4", status: "Não participando", acao: "", fechada: false },
];
const PROPOSTA = 80;
const PUBLICADO = 100;
const TABELA = 60;
const EXTRA = 0.05; // fração, como a tela manda ("5 ou 0,05")
/* O extra parte do PISO: 60 − 5% = 57, e 57 − 5% = 54,15. */
const RECALCULADO = 54.15;

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Promoções");
ws.addRow(CABECALHO);
for (const l of LINHAS) ws.addRow(["SKU1", l.mlb, PROPOSTA, PUBLICADO, null, l.status, l.acao]);
/* A validação da coluna de ação: é dela que o processamento descobre os
   rótulos que o canal aceita naquela célula. */
for (let r = 2; r <= LINHAS.length + 1; r++) {
  ws.getCell(r, 7).dataValidation = { type: "list", allowBlank: true, formulae: ['"Participar,Não participar"'] };
}
const entrada = Buffer.from(await wb.xlsx.writeBuffer());

const formula = {
  baseMlb: new Map(LINHAS.map((l) => [l.mlb, { padrao: 0.115, tipo: "classico" }])),
  /* A chave é a comissão em FRAÇÃO, arredondada a três casas — é como
     `precoDaFormula` indexa a tabela. Em porcentagem não casa nada, e o
     motor devolveria "sem preço de tabela" para todas as linhas, fazendo o
     teste passar por não escrever nada em lugar nenhum. */
  precosSKU: new Map([["SKU1", { 0.115: TABELA, 0.165: TABELA }]]),
  precosMLB: new Map(),
};

const r = await processarPlanilha(entrada, "Campanha de teste.xlsx", formula, EXTRA);
const porMlb = new Map(r.linhas.map((l) => [l.mlb, l]));
const relatorio = new Map(r.itensRelatorio.map((i) => [i.mlb, i]));
assert.equal(r.linhas.length, LINHAS.length, "todas as linhas aparecem no relatório");

for (const l of LINHAS.filter((x) => x.fechada)) {
  const linha = porMlb.get(l.mlb);
  /* `decisao` conserva a ação que JÁ ESTAVA na planilha: a linha é
     analisada, e o que o motor diria fica no relatório, não na célula. */
  assert.equal(linha.decisao, l.acao, `${l.mlb} deveria conservar a ação que já estava lá`);
  assert.equal(linha.recalculado, false, `${l.mlb} aceita não pode constar como recalculada`);
  assert.equal(linha.precoOferta, PROPOSTA, `${l.mlb} aceita conserva o preço aprovado`);
  assert.match(linha.motivo, /já fechada|não alterada/i, `${l.mlb} deveria dizer por que não foi mexida`);
  assert.ok(linha.tags.includes("participando"), `${l.mlb} deveria vir marcada como participando`);
  assert.equal(relatorio.get(l.mlb).status, "Mantido", `${l.mlb} deveria sair como Mantido no relatório`);
}

for (const l of LINHAS.filter((x) => !x.fechada)) {
  const linha = porMlb.get(l.mlb);
  assert.equal(linha.recalculado, true, `${l.mlb} em aberto deveria ser recalculada`);
  assert.equal(linha.precoOferta, RECALCULADO, `${l.mlb} em aberto deveria receber o preço da tabela`);
}

/* ── A prova que vale: as células do arquivo que volta ── */
const saida = new ExcelJS.Workbook();
await saida.xlsx.load(r.buffer);
const planilha = saida.worksheets[0];
const valor = (linha, col) => {
  const v = planilha.getCell(linha, col).value;
  return v == null ? "" : typeof v === "object" ? (v.result ?? v.text ?? "") : v;
};

for (const [indice, l] of LINHAS.entries()) {
  const linha = indice + 2; // a linha 1 é o cabeçalho
  if (l.fechada) {
    assert.equal(valor(linha, 3), PROPOSTA, `${l.mlb}: o preço final da oferta aceita MUDOU`);
    assert.equal(valor(linha, 7), l.acao, `${l.mlb}: a ação da oferta aceita foi REESCRITA`);
    assert.equal(valor(linha, 6), l.status, `${l.mlb}: o status foi alterado`);
  } else {
    /* O contraste: com os mesmos números, a linha em aberto foi reescrita.
       Sem esta asserção o teste passaria mesmo se o processamento não
       escrevesse nada em lugar nenhum. */
    assert.equal(valor(linha, 3), RECALCULADO, `${l.mlb}: linha em aberto não recebeu o preço novo`);
    assert.equal(valor(linha, 7), "Participar", `${l.mlb}: linha em aberto ficou sem decisão`);
  }
}

console.log("ok: oferta aceita sai idêntica; linha em aberto com os mesmos números vai de 80 para 54,15.");
