/**
 * O plano da Probel, por anúncio E por produto, com a conta em cada linha.
 *
 * Duas correções do Eduardo moldaram este arquivo:
 *
 *  1. "não mostra os dados do porquê" — então cada anúncio traz visita,
 *     venda e conversão, e é isso que decide a ação. Em metade das visitas
 *     da conta, mais visita é dinheiro jogado fora.
 *
 *  2. "às vezes o preço tá alto em um anúncio e baixo em outro, o mesmo
 *     para vendas" — e estava mesmo. O mesmo SKU aparece em até 11
 *     anúncios ativos, nas duas contas, com até 56% de diferença de preço.
 *     Olhar anúncio solto escondia isso, então entrou a aba por produto e
 *     a coluna de conta em todas as outras.
 *
 * O que a leitura por produto revelou: a conta de São Paulo é a mais CARA
 * e fica com a visita e a venda; a 2ª conta tem o mesmo produto até 56%
 * mais barato, quase não recebe visita e quase não vende. Preço não é o
 * gargalo da Probel.
 *
 * Uso: node scripts/local/plano-probel-novembro.mjs
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const L = JSON.parse(readFileSync("scratchpad/pq-funil.json", "utf8"));
const SKU = JSON.parse(readFileSync("scratchpad/pq-sku.json", "utf8"));
const g = (p) => L.filter((l) => l.grupo.startsWith(p)).sort((a, b) => b.visitas - a.visitas);
const soma = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const DIAS = 84;
const MEDIA = soma(L, (l) => l.vendas) / soma(L, (l) => l.visitas);
const r0 = (v) => Math.round(v);
const A = g("A"), B = g("B"), C = g("C"), D = g("D"), E = g("E");
const visTotal = soma(L, (l) => l.visitas);

const AZUL = "FF1F3864", CLARO = "FFD9E2F3";
const VERDE = "FFC6EFCE", VERMELHO = "FFFFC7CE", AMARELO = "FFFFEB9C";
const brl = '"R$ "#,##0', brl2 = '"R$ "#,##0.00';
const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";
const titulo = (ws, t, n) => { const r = ws.addRow([t]); r.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.height = 26; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { vertical: "middle", indent: 1 }; };
const secao = (ws, t, n) => { ws.addRow([]); const r = ws.addRow([t]); r.font = { bold: true, size: 11, color: { argb: AZUL } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLARO } }; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { indent: 1 }; };
const cab = (ws, cols) => { const r = ws.addRow(cols); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.alignment = { vertical: "middle", wrapText: true }; r.height = 34; };
const txt = (ws, linhas, n) => { for (const t of linhas) { const r = ws.addRow([t]); ws.mergeCells(r.number, 1, r.number, n); r.alignment = { wrapText: true, vertical: "top" }; r.height = Math.max(16, Math.ceil(t.length / (n * 13)) * 15); } };

const porConta = (lista) => {
  const m = new Map();
  for (const l of lista) {
    const x = m.get(l.conta) ?? { n: 0, vis: 0, ven: 0, rec: 0 };
    x.n++; x.vis += l.visitas; x.ven += l.vendas; x.rec += l.receita;
    m.set(l.conta, x);
  }
  return m;
};

/* ═══ COMECE AQUI ═══ */
{
  const ws = wb.addWorksheet("Comece aqui");
  ws.columns = [{ width: 34 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 32 }];
  titulo(ws, "PROBEL · ONDE ESTÁ A VENDA QUE FALTA", 7);

  secao(ws, "1. AS DUAS CONTAS NÃO SÃO PARECIDAS", 7);
  cab(ws, ["Conta", "Anúncios ativos", "Visitas 12sem", "Vendas", "Conversão", "Receita 12sem", "Preço médio"]);
  for (const [nome, n, vis, ven, rec, pm] of [
    ["São Paulo — pronta entrega", 297, 59659, 466, 391180, 2241],
    ["2ª conta — venda a prazo", 748, 22228, 52, 112159, 2091],
  ]) {
    const r = ws.addRow([nome, n, vis, ven, ven / vis, rec, pm]);
    r.getCell(5).numFmt = "0.00%"; r.getCell(6).numFmt = brl; r.getCell(7).numFmt = brl;
    r.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ven / vis > 0.005 ? VERDE : VERMELHO } };
  }
  txt(ws, [
    "A 2ª conta tem 2,5 vezes mais anúncios, um terço das visitas, um nono das vendas e converte 3,4 vezes pior — mesmo sendo 7% mais barata na média.",
  ], 7);

  secao(ws, "2. O QUE VOCÊ APONTOU: O MESMO PRODUTO, PREÇOS DIFERENTES", 7);
  cab(ws, ["SKU", "SP: preço", "SP: visitas", "SP: vendas", "A prazo: preço", "A prazo: visitas", "A prazo: vendas"]);
  for (const r of SKU.filter((x) => x.spread != null).slice(0, 8)) {
    const row = ws.addRow([r.sku, r.spPreco, r.spVis, r.spVen, r.pzPreco, r.pzVis, r.pzVen]);
    row.getCell(2).numFmt = brl2; row.getCell(5).numFmt = brl2;
    row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  }
  txt(ws, [
    "O padrão é o mesmo em todos: a conta de São Paulo é a MAIS CARA e fica com a visita e com a venda. A 2ª conta tem o mesmo produto até 56% mais barato, quase não recebe visita e quase não vende.",
    "",
    "No PA69847 o preço a prazo é R$ 1.330 contra R$ 2.523 em São Paulo — 56% mais barato — e fez 1 venda contra 20.",
    "",
    "Isso responde uma pergunta importante: o gargalo da Probel NÃO é preço. O mesmo produto está pela metade na outra conta e não vende. O que muda entre as duas é o prazo de entrega.",
  ], 7);

  secao(ws, "3. ANÚNCIO REPETIDO ESTÁ DILUINDO A CONTA", 7);
  cab(ws, ["", "Quantidade", "", "", "", "", ""]);
  for (const [k, v] of [["Anúncios ativos", 1045], ["Cópias: mesmo SKU, mesma conta, mesmo tipo", 472], ["Dessas cópias, com menos de 50 visitas em 12 semanas", 459], ["SKUs que aparecem nas duas contas", 66]]) {
    const r = ws.addRow([k, v, "", "", "", "", ""]);
    if (v === 472 || v === 459) r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
  }
  txt(ws, ["45% dos anúncios ativos são cópia de outro igual na mesma conta, e 459 delas não tiveram nem 50 visitas em 12 semanas. Isso divide histórico e relevância entre anúncios que poderiam ser um só."], 7);

  secao(ws, "4. OS CINCO GRUPOS, E QUEM ESTÁ EM CADA CONTA", 7);
  cab(ws, ["Grupo", "Anúncios", "Visitas", "% visitas", "Vendas", "Conversão", "Reparte por conta"]);
  for (const [nome, grp] of [["A · converte e falta visita", A], ["B · visita e converte pouco", B], ["C · visita e ZERO venda", C], ["D · vai bem", D], ["E · sem visita e sem venda", E]]) {
    const vis = soma(grp, (l) => l.visitas), ven = soma(grp, (l) => l.vendas);
    const pc = porConta(grp);
    const reparte = [...pc].map(([k, x]) => `${k}: ${x.n}`).join(" · ");
    const r = ws.addRow([nome, grp.length, vis, vis / visTotal, ven, vis ? ven / vis : 0, reparte]);
    r.getCell(4).numFmt = "0%"; r.getCell(6).numFmt = "0.00%";
    r.alignment = { wrapText: true, vertical: "top" };
    const cor = nome.startsWith("A") ? VERDE : nome.startsWith("B") || nome.startsWith("C") ? VERMELHO : null;
    if (cor) r.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
  }
  txt(ws, [`Conversão média da conta: ${(MEDIA * 100).toFixed(2)}%. Em metade das visitas (grupo B) comprar mais visita é pagar para manter 0,29%.`], 7);

  secao(ws, "5. QUANTO VALE CADA MOVIMENTO", 7);
  const visB = soma(B, (l) => l.visitas), venB = soma(B, (l) => l.vendas);
  const ticketB = soma(B, (l) => l.receita) / venB;
  const convA = soma(A, (l) => l.vendas) / soma(A, (l) => l.visitas);
  const ticketA = soma(A, (l) => l.receita) / soma(A, (l) => l.vendas);
  const ganhoB = (alvo) => r0(((visB * alvo - venB) * ticketB) / DIAS);
  const ganhoA = (m) => r0((soma(A, (l) => l.visitas) * (m - 1) * convA * ticketA) / DIAS);
  cab(ws, ["GRUPO B · conversão de 0,29% para…", "vendas 12sem", "ganho/dia", "", "", "", ""]);
  for (const [alvo, nota] of [[0.0064, "média da conta"], [0.01, ""], [0.0176, "nível do grupo D"]]) {
    const r = ws.addRow([`${(alvo * 100).toFixed(2)}%`, r0(visB * alvo), ganhoB(alvo), nota, "", "", ""]);
    r.getCell(3).numFmt = brl;
    if (ganhoB(alvo) >= 10000) r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  }
  cab(ws, ["GRUPO A · multiplicar a visita por…", "visitas a mais", "ganho/dia", "", "", "", ""]);
  for (const m of [2, 3, 5]) {
    const r = ws.addRow([`${m}x`, r0(soma(A, (l) => l.visitas) * (m - 1)), ganhoA(m), "", "", "", ""]);
    r.getCell(3).numFmt = brl;
  }
  cab(ws, ["COMBINAÇÕES QUE FECHAM +R$ 10.000/dia", "", "ganho/dia", "", "", "", ""]);
  for (const [nome, v] of [["B em 1,00% + A em 3x", ganhoB(0.01) + ganhoA(3)], ["B na média + A em 5x", ganhoB(0.0064) + ganhoA(5)], ["B no nível do grupo D, sozinho", ganhoB(0.0176)]]) {
    const r = ws.addRow([nome, "", v, v >= 10000 ? "FECHA" : "não fecha", "", "", ""]);
    r.getCell(3).numFmt = brl;
    r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: v >= 10000 ? VERDE : AMARELO } };
  }
  txt(ws, [
    "O caminho mais curto é o grupo B: as visitas já existem, não se compra nenhuma. E como o mesmo produto mais barato na outra conta não vende, o que precisa melhorar ali é prazo, foto, título e reputação do anúncio — não preço.",
  ], 7);
}

/* ═══ POR PRODUTO ═══ */
{
  const ws = wb.addWorksheet("Por produto");
  const cols = ["SKU", "Produto", "Anúncios ativos", "SP: anúncios", "SP: menor preço", "SP: visitas", "SP: vendas", "A prazo: anúncios", "A prazo: menor preço", "A prazo: visitas", "A prazo: vendas", "Diferença de preço", "Conversão total", "Piso", "Leitura"];
  ws.columns = [{ width: 11 }, { width: 34 }, { width: 9 }, { width: 9 }, { width: 11 }, { width: 9 }, { width: 8 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 44 }];
  titulo(ws, "O MESMO PRODUTO NAS DUAS CONTAS", cols.length);
  txt(ws, ["140 SKUs com 50 visitas ou mais em 12 semanas. Quando o produto está nas duas contas, dá para ver lado a lado o preço, a visita e a venda de cada uma."], cols.length);
  cab(ws, cols);
  for (const r of SKU) {
    const leitura = r.spread == null
      ? (r.spAnuncios ? "Só em São Paulo." : "Só na conta a prazo.")
      : r.pzPreco < r.spPreco && r.pzVen === 0
        ? `Mais barato a prazo (${r.spread}% abaixo) e não vende. O problema não é preço.`
        : r.pzVen > r.spVen ? "A conta a prazo vende mais neste." : "As duas vendem.";
    const row = ws.addRow([
      r.sku, String(r.titulo).slice(0, 32), r.ativos,
      r.spAnuncios, r.spPreco, r.spVis, r.spVen,
      r.pzAnuncios, r.pzPreco, r.pzVis, r.pzVen,
      r.spread != null ? r.spread / 100 : null, r.conv != null ? r.conv / 100 : null, r.piso, leitura,
    ]);
    [5, 9, 14].forEach((c) => (row.getCell(c).numFmt = brl2));
    row.getCell(12).numFmt = "0%"; row.getCell(13).numFmt = "0.00%";
    row.alignment = { wrapText: true, vertical: "top" };
    if (r.ativos >= 6) row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO } };
    if (r.spread != null && r.spread >= 40) row.getCell(12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
}

/* ═══ Abas por grupo, agora com CONTA ═══ */
const abaGrupo = (nome, lista, descricao, acaoFn) => {
  const ws = wb.addWorksheet(nome);
  const cols = ["MLB", "SKU", "CONTA", "Tipo", "Visitas 12sem", "Vendas", "Conversão", "Receita 12sem", "Preço", "Piso", "Espaço", "Mais barato da casa", "Anúncios do mesmo SKU", "Catálogo", "Ads", "O QUE FAZER"];
  ws.columns = [{ width: 15 }, { width: 11 }, { width: 12 }, { width: 9 }, { width: 11 }, { width: 8 }, { width: 10 }, { width: 12 }, { width: 11 }, { width: 11 }, { width: 9 }, { width: 12 }, { width: 11 }, { width: 12 }, { width: 9 }, { width: 44 }];
  titulo(ws, nome.toUpperCase(), cols.length);
  txt(ws, descricao, cols.length);
  cab(ws, cols);
  for (const l of lista) {
    const r = ws.addRow([
      l.mlb, l.sku, l.conta, l.tipo, l.visitas, l.vendas,
      l.conv != null ? l.conv / 100 : null, l.receita, l.preco, l.piso,
      l.espaco != null ? l.espaco / 100 : null, l.maisBaratoDaCasa, l.irmaosAtivos,
      l.catalogo || "—", l.adsInv, acaoFn(l),
    ]);
    r.getCell(7).numFmt = "0.00%"; r.getCell(11).numFmt = "0%";
    [8, 9, 10, 12, 15].forEach((c) => (r.getCell(c).numFmt = brl));
    r.alignment = { wrapText: true, vertical: "top" };
    r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: l.conta === "São Paulo" ? CLARO : AMARELO } };
    if (l.conv != null && l.conv / 100 >= MEDIA) r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    else if (l.visitas >= 100) r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
    if (l.irmaosAtivos >= 6) r.getCell(13).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO } };
  }
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
};

abaGrupo("A - trazer visita", A, [
  `${A.length} anúncios que convertem ${((soma(A, (l) => l.vendas) / soma(A, (l) => l.visitas)) * 100).toFixed(2)}% com apenas ${soma(A, (l) => l.visitas).toLocaleString("pt-BR")} visitas em 12 semanas — 21% das vendas da conta com 3% das visitas.`,
  `${A.filter((l) => l.adsInv == null).length} não têm nenhum investimento em Ads. ${[...porConta(A)].map(([k, x]) => `${k}: ${x.n}`).join(" · ")}.`,
], (l) => {
  if (l.adsInv == null) return "ABRIR Ads: R$ 20/dia e medir em 14 dias.";
  if (l.adsInv === 0) return "Campanha sem verba. Subir o lance.";
  return `Já tem R$ ${l.adsInv} — dobrar enquanto o ACOS ficar abaixo de 20%.`;
});

abaGrupo("B - arrumar a oferta", B, [
  `${B.length} anúncios concentram ${soma(B, (l) => l.visitas).toLocaleString("pt-BR")} visitas (50% da conta) e convertem 0,29%.`,
  `NÃO comprar visita aqui. E atenção à coluna "mais barato da casa": em vários o mesmo produto está mais barato na outra conta e mesmo assim não vende — nesses, preço não resolve.`,
  `${[...porConta(B)].map(([k, x]) => `${k}: ${x.n} anúncios, ${x.vis.toLocaleString("pt-BR")} visitas, ${x.ven} vendas`).join(" | ")}.`,
], (l) => {
  if (l.maisBaratoDaCasa != null && l.preco && l.maisBaratoDaCasa < l.preco * 0.85)
    return `A casa já tem este produto por R$ ${l.maisBaratoDaCasa} e ele não vende: o problema NÃO é preço. Ver prazo, foto e título.`;
  if (l.espaco != null && l.espaco < 0) return "Já abaixo do piso. Ver prazo, foto e título.";
  if (l.catalogo === "competing" && l.paraGanhar && l.piso && l.paraGanhar >= l.piso) return `Baixar para R$ ${l.paraGanhar} ganha o catálogo e fica acima do piso.`;
  if (l.espaco != null && l.espaco > 35) return `${Math.round(l.espaco)}% acima do piso com ${l.visitas} visitas. Testar desconto até o piso.`;
  return "Rever foto, título e prazo antes de mexer no preço.";
});

abaGrupo("C - visita sem venda", C, [
  `${C.length} anúncios receberam ${soma(C, (l) => l.visitas).toLocaleString("pt-BR")} visitas e NÃO venderam nada.`,
  `${C.filter((l) => l.adsInv > 0).length} ainda gastam Ads: R$ ${r0(soma(C, (l) => l.adsInv))} por janela de 30 dias.`,
  `${[...porConta(C)].map(([k, x]) => `${k}: ${x.n}`).join(" · ")}.`,
], (l) => {
  if (l.adsInv > 0) return `DESLIGAR o Ads: R$ ${l.adsInv} sem nenhuma venda.`;
  if (l.irmaosAtivos >= 4) return `São ${l.irmaosAtivos} anúncios do mesmo SKU. Concentrar em um e encerrar este.`;
  if (l.estoque >= 40000) return "Sob encomenda: conferir o prazo que aparece no anúncio.";
  return "Rever a oferta inteira ou encerrar.";
});

/* ═══ TODOS ═══ */
{
  const ws = wb.addWorksheet("Todos os anúncios");
  const cols = ["Grupo", "MLB", "SKU", "CONTA", "Tipo", "Status", "Visitas", "Vendas", "Conversão", "Receita", "Preço", "Piso", "Irmãos ativos", "Catálogo", "Ads"];
  ws.columns = [{ width: 28 }, { width: 15 }, { width: 11 }, { width: 12 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 8 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 12 }, { width: 9 }];
  titulo(ws, "OS 948 ANÚNCIOS MEDIDOS", cols.length);
  cab(ws, cols);
  for (const l of [...L].sort((a, b) => a.grupo.localeCompare(b.grupo) || b.visitas - a.visitas)) {
    const r = ws.addRow([l.grupo, l.mlb, l.sku, l.conta, l.tipo, l.status, l.visitas, l.vendas, l.conv != null ? l.conv / 100 : null, l.receita, l.preco, l.piso, l.irmaosAtivos, l.catalogo || "—", l.adsInv]);
    r.getCell(9).numFmt = "0.00%";
    [10, 11, 12, 15].forEach((c) => (r.getCell(c).numFmt = brl));
    r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: l.conta === "São Paulo" ? CLARO : AMARELO } };
  }
  ws.views = [{ state: "frozen", xSplit: 4, ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };
}

await wb.xlsx.writeFile("output/Probel-plano-novembro.xlsx");
console.log("escrito: output/Probel-plano-novembro.xlsx");
console.log("  abas: " + wb.worksheets.map((w) => w.name).join(" · "));
console.log(`  A=${A.length} B=${B.length} C=${C.length} D=${D.length} E=${E.length} · ${SKU.length} SKUs`);
