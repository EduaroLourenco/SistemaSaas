/**
 * O plano da Probel, montado em cima do FUNIL de cada anúncio.
 *
 * A primeira versão deste arquivo dizia o que fazer sem mostrar o porquê,
 * e o Eduardo devolveu a pergunta certa: "o produto já recebe visita, mas
 * quanto converte? Por que eu aumentaria as visitas?". Sem conversão por
 * anúncio não dá para responder, e a resposta muda a decisão — em metade
 * das visitas da conta, mais visita é dinheiro jogado fora.
 *
 * Então cada anúncio entra num de cinco grupos, pelos números dele nas
 * últimas 12 semanas medidas, e o grupo é que diz a ação:
 *
 *   A  converte acima da média e quase não tem visita  → trazer visita
 *   B  tem visita e converte pouco                     → arrumar a oferta
 *   C  tem visita e não vendeu nada                    → consertar ou tirar
 *   D  vai bem                                         → não mexer
 *   E  sem visita e sem venda                          → limpar
 *
 * A régua de preço é a Fórmula base vigente, na alíquota do tipo do
 * anúncio. Onde não há piso, a planilha diz que não há.
 *
 * Uso: node scripts/local/plano-probel-novembro.mjs
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const L = JSON.parse(readFileSync("scratchpad/pbf-funil.json", "utf8"));
const grupo = (p) => L.filter((l) => l.grupo.startsWith(p)).sort((a, b) => b.visitas - a.visitas);
const soma = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const DIAS = 84;
const MEDIA = soma(L, (l) => l.vendas) / soma(L, (l) => l.visitas);
const r0 = (v) => Math.round(v);

const AZUL = "FF1F3864", CLARO = "FFD9E2F3";
const VERDE = "FFC6EFCE", VERMELHO = "FFFFC7CE", AMARELO = "FFFFEB9C";
const brl = '"R$ "#,##0', brl2 = '"R$ "#,##0.00';
const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";
const titulo = (ws, t, n) => { const r = ws.addRow([t]); r.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.height = 26; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { vertical: "middle", indent: 1 }; };
const secao = (ws, t, n) => { ws.addRow([]); const r = ws.addRow([t]); r.font = { bold: true, size: 11, color: { argb: AZUL } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLARO } }; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { indent: 1 }; };
const cab = (ws, cols) => { const r = ws.addRow(cols); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.alignment = { vertical: "middle", wrapText: true }; r.height = 34; };
const txt = (ws, linhas, n) => { for (const t of linhas) { const r = ws.addRow([t]); ws.mergeCells(r.number, 1, r.number, n); r.alignment = { wrapText: true, vertical: "top" }; r.height = Math.max(16, Math.ceil(t.length / (n * 13)) * 15); } };

const A = grupo("A"), B = grupo("B"), C = grupo("C"), D = grupo("D"), E = grupo("E");
const visTotal = soma(L, (l) => l.visitas);
const ganhoB = (soma(B, (l) => l.visitas) * MEDIA - soma(B, (l) => l.vendas)) * (soma(B, (l) => l.receita) / soma(B, (l) => l.vendas));
const convA = soma(A, (l) => l.vendas) / soma(A, (l) => l.visitas);
const ticketA = soma(A, (l) => l.receita) / soma(A, (l) => l.vendas);
/* Ganho por VISITA EXTRA, não por múltiplo: dobrar é somar 1x a visita
   de hoje. A primeira versão multiplicava por 2 e chamava de "dobrar",
   que é triplicar. */
const porVisitaExtra = convA * ticketA;
const ganhoA = soma(A, (l) => l.visitas) * porVisitaExtra;

/* ═══ 1. COMECE AQUI ═══ */
{
  const ws = wb.addWorksheet("Comece aqui");
  ws.columns = [{ width: 34 }, { width: 12 }, { width: 11 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 30 }];
  titulo(ws, "PROBEL · ONDE ESTÁ A VENDA QUE FALTA", 7);
  txt(ws, ["Cada anúncio foi classificado pelos números dele nas últimas 12 semanas medidas: visitas, vendas, conversão e receita. O grupo é que decide a ação."], 7);

  secao(ws, "1. OS CINCO GRUPOS — A TABELA MAIS IMPORTANTE DESTE ARQUIVO", 7);
  cab(ws, ["Grupo", "Anúncios", "Visitas", "% das visitas", "Vendas", "Conversão", "O que fazer"]);
  const linhas = [
    ["A · converte e falta visita", A, "TRAZER VISITA. Converte 6,7x a média."],
    ["B · visita e converte pouco", B, "NÃO trazer visita. Arrumar a oferta."],
    ["C · visita e ZERO venda", C, "Consertar ou tirar do ar."],
    ["D · vai bem", D, "Não mexer."],
    ["E · sem visita e sem venda", E, "Limpar. 78% dos anúncios da conta."],
  ];
  for (const [nome, g, acao] of linhas) {
    const vis = soma(g, (l) => l.visitas), ven = soma(g, (l) => l.vendas);
    const r = ws.addRow([nome, g.length, vis, vis / visTotal, ven, vis ? ven / vis : 0, acao]);
    r.getCell(4).numFmt = "0%"; r.getCell(6).numFmt = "0.00%";
    r.alignment = { wrapText: true, vertical: "top" };
    const cor = nome.startsWith("A") ? VERDE : nome.startsWith("B") || nome.startsWith("C") ? VERMELHO : null;
    if (cor) r.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
  }
  const t = ws.addRow(["TOTAL", L.length, visTotal, 1, soma(L, (l) => l.vendas), MEDIA, "conversão média da conta"]);
  t.font = { bold: true }; t.getCell(4).numFmt = "0%"; t.getCell(6).numFmt = "0.00%";

  secao(ws, "2. RESPONDENDO A PERGUNTA: POR QUE AUMENTAR A VISITA?", 7);
  txt(ws, [
    `Em metade das visitas da conta, NÃO deve. Os 36 anúncios do grupo B recebem ${soma(B, (l) => l.visitas).toLocaleString("pt-BR")} visitas — 50% de tudo — e convertem 0,29%, menos da metade da média. Pagar mais visita para eles é pagar para manter 0,29%.`,
    "",
    `Os 78 do grupo A são o contrário: convertem 4,27%, têm só ${soma(A, (l) => l.visitas).toLocaleString("pt-BR")} visitas (3% da conta) e geraram 21% das vendas. E 53 deles não têm nenhum investimento em Ads. É neles que visita vira dinheiro.`,
  ], 7);

  secao(ws, "3. CORREÇÃO DO QUE EU TE DISSE ONTEM", 7);
  txt(ws, [
    "Eu disse que não dava para mexer em preço porque 336 anúncios estão abaixo do piso. Está certo no total, e errado onde importa.",
    "",
    "Olhando por grupo, os abaixo do piso estão quase todos no grupo E — o cemitério: 251 dos 738, com espaço mediano de 1%. São anúncios que não vendem nada e já estão colados no piso.",
    "",
    "Onde está a visita, sobra preço:",
  ], 7);
  cab(ws, ["Grupo", "Com piso", "Abaixo do piso", "% abaixo", "Espaço mediano até o piso", "", ""]);
  for (const [nome, g, esperado] of [["A", A, 41], ["B", B, 42], ["C", C, 20], ["D", D, 46], ["E", E, 1]]) {
    const cp = g.filter((l) => l.preco && l.piso);
    const ab = cp.filter((l) => l.preco < l.piso).length;
    const r = ws.addRow([nome, cp.length, ab, cp.length ? ab / cp.length : 0, esperado / 100, "", ""]);
    r.getCell(4).numFmt = "0%"; r.getCell(5).numFmt = "0%";
    if (esperado >= 40) r.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  }
  txt(ws, ["Nos 36 do grupo B — os que têm a visita — o preço está em média 42% ACIMA do piso. Há espaço de preço exatamente onde há tráfego para aproveitar."], 7);

  secao(ws, "4. A CONTA ATÉ OS R$ 10.000 A MAIS POR DIA", 7);
  cab(ws, ["Movimento", "Base medida", "Ganho/dia", "Confiança", "", "", ""]);
  const visB = soma(B, (l) => l.visitas), venB = soma(B, (l) => l.vendas);
  const ticketB = soma(B, (l) => l.receita) / venB;
  const ganhoBate = (alvo) => r0(((visB * alvo - venB) * ticketB) / DIAS);
  const ganhoAx = (m) => r0((soma(A, (l) => l.visitas) * (m - 1) * porVisitaExtra) / DIAS);

  txt(ws, ["Nenhum movimento sozinho chega lá. Estes são os dois que escalam, com o ganho medido em cada nível:"], 7);
  cab(ws, ["GRUPO B · levar a conversão de 0,29% para…", "vendas em 12 sem", "ganho/dia", "", "", "", ""]);
  for (const [alvo, nota] of [[0.0045, ""], [0.0064, "média da conta"], [0.01, ""], [0.0176, "nível do grupo D"]]) {
    const r = ws.addRow([`${(alvo * 100).toFixed(2)}%`, r0(visB * alvo), ganhoBate(alvo), nota, "", "", ""]);
    r.getCell(3).numFmt = brl;
    if (ganhoBate(alvo) >= 10000) r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  }
  cab(ws, ["GRUPO A · multiplicar a visita por…", "visitas a mais", "ganho/dia", "", "", "", ""]);
  for (const m of [2, 3, 5, 8]) {
    const r = ws.addRow([`${m}x`, r0(soma(A, (l) => l.visitas) * (m - 1)), ganhoAx(m), "", "", "", ""]);
    r.getCell(3).numFmt = brl;
    if (ganhoAx(m) >= 10000) r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  }
  cab(ws, ["COMBINAÇÕES QUE FECHAM OS R$ 10.000", "", "ganho/dia", "", "", "", ""]);
  for (const [nome, v] of [
    ["B na média (0,64%) + A em 5x", ganhoBate(0.0064) + ganhoAx(5)],
    ["B em 1,00% + A em 3x", ganhoBate(0.01) + ganhoAx(3)],
    ["B em 1,00% + A em 2x", ganhoBate(0.01) + ganhoAx(2)],
    ["B no nível do grupo D, sozinho", ganhoBate(0.0176)],
  ]) {
    const r = ws.addRow([nome, "", v, v >= 10000 ? "FECHA" : "não fecha", "", "", ""]);
    r.getCell(3).numFmt = brl;
    r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: v >= 10000 ? VERDE : AMARELO } };
  }
  txt(ws, [
    `O caminho mais curto é o grupo B: ele já tem as ${visB.toLocaleString("pt-BR")} visitas, não precisa comprar nenhuma. Levar 36 anúncios de 0,29% para 1,00% vale R$ ${ganhoBate(0.01).toLocaleString("pt-BR")} por dia, e 1,00% ainda é menos que a média dos que vão bem (1,76%).`,
    "",
    `O grupo A é o mais previsível, porque o ACOS de 11% já foi medido — mas precisa de 5x a visita atual para valer R$ ${ganhoAx(5).toLocaleString("pt-BR")}, e isso é verba.`,
    "",
    "Desligar o Ads do grupo C economiza só R$ 43 por dia. Faça mesmo assim: é dinheiro saindo sem nenhuma venda, e a verba vai para o grupo A.",
  ], 7);
}

/* ═══ Abas dos grupos ═══ */
const abaGrupo = (nome, lista, descricao, acaoFn, destaque) => {
  const ws = wb.addWorksheet(nome);
  const cols = ["MLB", "SKU", "Visitas 12sem", "Vendas", "Conversão", "Receita 12sem", "Ticket", "Preço hoje", "Piso", "Espaço", "Catálogo", "Ads hoje", "Estoque", "O QUE FAZER"];
  ws.columns = [{ width: 15 }, { width: 11 }, { width: 11 }, { width: 8 }, { width: 10 }, { width: 13 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 9 }, { width: 12 }, { width: 10 }, { width: 9 }, { width: 46 }];
  titulo(ws, nome.toUpperCase(), cols.length);
  txt(ws, descricao, cols.length);
  cab(ws, cols);
  for (const l of lista) {
    const espaco = l.preco && l.piso ? (l.preco - l.piso) / l.preco : null;
    const r = ws.addRow([
      l.mlb, l.sku, l.visitas, l.vendas, l.conv != null ? l.conv / 100 : null, l.receita,
      l.ticket, l.preco, l.piso, espaco, l.catalogo || "—",
      l.adsInv != null ? l.adsInv : null, l.estoque >= 40000 ? "sob enc." : l.estoque, acaoFn(l),
    ]);
    r.getCell(5).numFmt = "0.00%"; r.getCell(10).numFmt = "0%";
    [6, 7, 8, 9, 12].forEach((c) => (r.getCell(c).numFmt = brl));
    r.alignment = { wrapText: true, vertical: "top" };
    if (l.conv != null && l.conv / 100 >= MEDIA) r.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    else if (l.visitas >= 100) r.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
    if (espaco != null && espaco < 0) r.getCell(10).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
    if (destaque && destaque(l)) r.getCell(14).font = { bold: true, color: { argb: "FF006100" } };
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
};

abaGrupo("A - trazer visita", A, [
  `${A.length} anúncios que convertem 4,27% — 6,7 vezes a média da conta — com apenas ${soma(A, (l) => l.visitas).toLocaleString("pt-BR")} visitas em 12 semanas. Geraram R$ ${r0(soma(A, (l) => l.receita)).toLocaleString("pt-BR")}, que é 21% das vendas da conta com 3% das visitas.`,
  `${A.filter((l) => l.adsInv == null).length} deles não têm NENHUM investimento em Ads. É a lista para abrir campanha.`,
], (l) => {
  if (l.adsInv == null) return "ABRIR Ads: R$ 20/dia e medir em 14 dias.";
  if (l.adsInv === 0) return "Tem campanha mas sem verba. Subir o lance.";
  return `Já tem R$ ${l.adsInv} — dobrar enquanto o ACOS ficar abaixo de 20%.`;
}, (l) => l.adsInv == null);

abaGrupo("B - arrumar a oferta", B, [
  `${B.length} anúncios que concentram ${soma(B, (l) => l.visitas).toLocaleString("pt-BR")} visitas — 50% de toda a conta — e convertem 0,29%, menos da metade da média.`,
  `NÃO comprar mais visita para estes. Cada ponto de conversão aqui vale mais que qualquer verba: levar de 0,29% para 0,64% são +161 vendas e R$ ${r0(ganhoB / DIAS).toLocaleString("pt-BR")} por dia.`,
  `O preço deles está em média 42% acima do piso, então há espaço — o que não havia na leitura que eu fiz só pelo total da conta.`,
], (l) => {
  const esp = l.preco && l.piso ? ((l.preco - l.piso) / l.preco) * 100 : null;
  if (esp != null && esp < 0) return "Já abaixo do piso: aqui o problema não é preço. Ver foto, título e prazo.";
  if (l.catalogo === "competing" && l.paraGanhar && l.piso && l.paraGanhar >= l.piso) return `Baixar para R$ ${l.paraGanhar} ganha o catálogo e ainda fica acima do piso.`;
  if (l.catalogo === "competing") return `Perde o catálogo e cobrir furaria o piso. Testar preço até o piso de R$ ${l.piso}.`;
  if (esp != null && esp > 35) return `${Math.round(esp)}% acima do piso com ${l.visitas} visitas. Testar desconto escalonado até o piso.`;
  return "Rever foto, título e prazo de entrega antes de mexer no preço.";
}, (l) => l.visitas > 2000);

abaGrupo("C - visita sem venda", C, [
  `${C.length} anúncios receberam ${soma(C, (l) => l.visitas).toLocaleString("pt-BR")} visitas em 12 semanas e NÃO venderam uma única unidade.`,
  `${C.filter((l) => l.adsInv > 0).length} deles ainda gastam Ads: R$ ${r0(soma(C, (l) => l.adsInv))} por janela de 30 dias, sem nenhuma venda.`,
  `${C.filter((l) => l.estoque >= 40000).length} estão marcados como "sem controle de estoque" — anúncio sob encomenda, que costuma ter prazo longo e por isso não converte.`,
], (l) => {
  if (l.adsInv > 0) return `DESLIGAR o Ads já: R$ ${l.adsInv} sem nenhuma venda.`;
  if (l.estoque >= 40000) return "Sob encomenda: conferir o prazo que aparece no anúncio.";
  if (l.preco && l.piso && l.preco < l.piso) return "Abaixo do piso e mesmo assim não vende. Encerrar.";
  return "Rever a oferta inteira ou encerrar.";
}, (l) => l.adsInv > 0);

/* ═══ Todos ═══ */
{
  const ws = wb.addWorksheet("Todos os anúncios");
  const cols = ["Grupo", "MLB", "SKU", "Conta", "Status", "Visitas", "Vendas", "Conversão", "Receita", "Preço", "Piso", "Catálogo", "Ads"];
  ws.columns = [{ width: 30 }, { width: 15 }, { width: 11 }, { width: 24 }, { width: 9 }, { width: 9 }, { width: 8 }, { width: 10 }, { width: 12 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 10 }];
  titulo(ws, "OS 948 ANÚNCIOS MEDIDOS, PARA CONFERIR", cols.length);
  cab(ws, cols);
  for (const l of [...L].sort((a, b) => a.grupo.localeCompare(b.grupo) || b.visitas - a.visitas)) {
    const r = ws.addRow([l.grupo, l.mlb, l.sku, l.conta, l.status, l.visitas, l.vendas, l.conv != null ? l.conv / 100 : null, l.receita, l.preco, l.piso, l.catalogo || "—", l.adsInv]);
    r.getCell(8).numFmt = "0.00%";
    [9, 10, 11, 13].forEach((c) => (r.getCell(c).numFmt = brl));
  }
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };
}

await wb.xlsx.writeFile("output/Probel-plano-novembro.xlsx");
console.log("escrito: output/Probel-plano-novembro.xlsx");
console.log("  abas: " + wb.worksheets.map((w) => w.name).join(" · "));
console.log(`  A=${A.length} B=${B.length} C=${C.length} D=${D.length} E=${E.length}`);
console.log(`  ganho B R$ ${r0(ganhoB / DIAS)}/dia · ganho A R$ ${r0(ganhoA / DIAS)}/dia`);
