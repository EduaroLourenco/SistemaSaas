/**
 * Trocar a decisão à mão escreve a célula certa, e só ela.
 *
 * A regra decide por tabela e erra para menos: recusa a linha que não
 * cabe no preço, sem saber que aquele estoque está parado. O Eduardo
 * quer escolher a dedo quem entra — e a planilha tem que sair com a
 * escolha dele, no formato que o canal aceita.
 *
 * O que este teste trava:
 *   · a decisão vai para a coluna de ação daquela linha, com o rótulo
 *     que a célula aceita (muda por campanha: "Participar" ou
 *     "Aplicar proposta");
 *   · nenhuma outra célula é tocada — nem de outra linha, nem de outra
 *     coluna da mesma linha;
 *   · o arquivo continua um .xlsx válido, com a validação de dados e a
 *     formatação que o canal exige;
 *   · linha de oferta já fechada não é editável, e por isso não entra na
 *     lista de ajuste nem por engano.
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
const { surgicallyEditExcel } = await jiti.import(path.join(raiz, "src/lib/planilhas/editor-xlsx.ts"));

/* ── Uma planilha no formato do canal ── */
const CABECALHO = ["SKU", "ITEM_ID", "Preço final", "Preço original", "SALE_FEE", "Status da promoção", "Ação"];
const LINHAS = [
  { mlb: "MLB1", status: "Nova proposta", acao: "", proposta: 50 },
  { mlb: "MLB2", status: "Nova proposta", acao: "", proposta: 90 },
  { mlb: "MLB3", status: "Participando", acao: "Participar", proposta: 90 },
  /* Sem preço de tabela: o sistema recusa, e é esta que o usuário vira. */
  { mlb: "MLB4", status: "Nova proposta", acao: "", proposta: 70, sku: "SEM_TABELA" },
];
const TABELA = 60;

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Promoções");
ws.addRow(CABECALHO);
for (const l of LINHAS) ws.addRow([l.sku ?? "SKU1", l.mlb, l.proposta, 100, null, l.status, l.acao]);
for (let r = 2; r <= LINHAS.length + 1; r++) {
  ws.getCell(r, 7).dataValidation = {
    type: "list", allowBlank: true, formulae: ['"Participar,Não participar"'],
  };
}
const entrada = Buffer.from(await wb.xlsx.writeBuffer());

const formula = {
  baseMlb: new Map(LINHAS.map((l) => [l.mlb, { padrao: 0.115, tipo: "classico" }])),
  precosSKU: new Map([["SKU1", { 0.115: TABELA, 0.165: TABELA }]]),
  precosMLB: new Map(),
};

const r = await processarPlanilha(entrada, "Campanha.xlsx", formula);
const porMlb = new Map(r.linhas.map((l) => [l.mlb, l]));

/* ── O que o processamento precisa entregar para o ajuste existir ── */
assert.equal(r.aba, "Promoções", "o resultado diz em qual aba mexer");
const m1 = porMlb.get("MLB1");
assert.equal(m1.aba, "Promoções");
assert.equal(m1.colunaAcao, "G", "a coluna de ação é a sétima");
assert.equal(m1.acaoPositiva, "Participar", "o rótulo sai da validação da célula");
assert.equal(m1.acaoNegativa, "Não participar");
assert.equal(m1.editavel, true);
assert.equal(porMlb.get("MLB3").editavel, false, "oferta já fechada não se mexe nem a pedido");

/* A linha recusada é a que o usuário quer virar — é o caso de uso. */
const recusada = r.linhas.find((l) => !l.aprovado && l.editavel);
assert.ok(recusada, "o teste precisa de uma linha recusada para virar");

/* ── O ajuste: escreve a célula daquela linha ── */
const ajustado = await surgicallyEditExcel(r.buffer, recusada.aba, [
  { rowIndex: recusada.linha, colLetter: recusada.colunaAcao, value: recusada.acaoPositiva },
]);

const depois = new ExcelJS.Workbook();
await depois.xlsx.load(ajustado);
const aba = depois.getWorksheet("Promoções");
assert.ok(aba, "a aba sobreviveu à edição");
assert.equal(
  String(aba.getCell(recusada.linha, 7).value).trim(),
  "Participar",
  "a linha virada saiu com o rótulo positivo"
);

/* Nada mais mudou: nem outra linha, nem outra coluna desta. */
const antes = new ExcelJS.Workbook();
await antes.xlsx.load(r.buffer);
const abaAntes = antes.getWorksheet("Promoções");
let diferentes = 0;
for (let linha = 1; linha <= LINHAS.length + 1; linha++) {
  for (let col = 1; col <= CABECALHO.length; col++) {
    const a = String(abaAntes.getCell(linha, col).value ?? "");
    const b = String(aba.getCell(linha, col).value ?? "");
    if (a !== b) {
      diferentes++;
      assert.equal(linha, recusada.linha, `mexeu na linha ${linha}, que ninguém pediu`);
      assert.equal(col, 7, `mexeu na coluna ${col} da linha ${linha}, que ninguém pediu`);
    }
  }
}
assert.equal(diferentes, 1, "exatamente uma célula mudou");

/* A validação de dados continua lá: sem ela o canal recusa o arquivo. */
assert.ok(
  aba.getCell(recusada.linha, 7).dataValidation?.formulae?.[0]?.includes("Participar"),
  "a lista de valores aceitos sobreviveu à edição cirúrgica"
);

console.log("OK: a troca manual escreve uma célula só, com o rótulo da campanha, e preserva a validação.");
