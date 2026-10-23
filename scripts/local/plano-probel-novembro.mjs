/**
 * O plano da Probel para somar R$ 10.000 por dia.
 *
 * Tudo sai dos dados da operação: 9.106 pedidos, 1.267 anúncios, 10 meses
 * de venda diária, a disputa de catálogo dia a dia, o relatório de Ads e a
 * Fórmula base vigente.
 *
 * A régua de preço aqui é a FÓRMULA BASE, não o custo: a Probel tem 1.533
 * SKUs com preço de tabela e só uma fração com custo cadastrado. Onde não
 * há piso, a planilha diz que não há — não inventa.
 *
 * Uso: node scripts/local/plano-probel-novembro.mjs
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const d = JSON.parse(readFileSync("scratchpad/pb.json", "utf8"));
const abaixo = JSON.parse(readFileSync("scratchpad/pb-abaixo.json", "utf8"));
const semAds = JSON.parse(readFileSync("scratchpad/pb-semads.json", "utf8"));
const cobrir = JSON.parse(readFileSync("scratchpad/pb-cobrir.json", "utf8"));
const nm = (s) => String(s ?? "").trim().toUpperCase();
const anPor = new Map(d.anuncios.map((a) => [a.id, a]));
const nmConta = new Map(d.contas.map((c) => [c.id, c.nome]));

const AZUL = "FF1F3864", CLARO = "FFD9E2F3";
const VERDE = "FFC6EFCE", VERMELHO = "FFFFC7CE", AMARELO = "FFFFEB9C";
const brl = '"R$ "#,##0', brl2 = '"R$ "#,##0.00';
const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";

const titulo = (ws, t, n) => { const r = ws.addRow([t]); r.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.height = 26; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { vertical: "middle", indent: 1 }; };
const secao = (ws, t, n) => { ws.addRow([]); const r = ws.addRow([t]); r.font = { bold: true, size: 11, color: { argb: AZUL } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLARO } }; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { indent: 1 }; };
const cab = (ws, cols) => { const r = ws.addRow(cols); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.alignment = { vertical: "middle", wrapText: true }; r.height = 32; };
const txt = (ws, linhas, n) => { for (const t of linhas) { const r = ws.addRow([t]); ws.mergeCells(r.number, 1, r.number, n); r.alignment = { wrapText: true, vertical: "top" }; r.height = Math.max(16, Math.ceil(t.length / (n * 13)) * 15); } };

/* ═══ 1. COMECE AQUI ═══ */
{
  const ws = wb.addWorksheet("Comece aqui");
  ws.columns = [{ width: 32 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 24 }];
  titulo(ws, "PROBEL · COMO SOMAR R$ 10.000 POR DIA", 6);
  txt(ws, ["Feito em 23/10/2026 com os dados do sistema: 9.106 pedidos, 1.267 anúncios, 10 meses de venda diária."], 6);

  secao(ws, "1. O TAMANHO DO PEDIDO", 6);
  cab(ws, ["", "Hoje (outubro)", "Alvo", "Aumento", "", ""]);
  const r1 = ws.addRow(["Receita por dia", 66610, 76610, 0.15, "", ""]);
  r1.getCell(2).numFmt = brl; r1.getCell(3).numFmt = brl; r1.getCell(4).numFmt = "0%";
  const r2 = ws.addRow(["Receita no mês", 1998300, 2298300, 0.15, "", ""]);
  r2.getCell(2).numFmt = brl; r2.getCell(3).numFmt = brl; r2.getCell(4).numFmt = "0%";
  txt(ws, ["São 15% a mais. Diferente de pedir o dobro: é um alvo que cabe no que a operação já faz — desde que venha do lugar certo."], 6);

  secao(ws, "2. O DINHEIRO ESTÁ NO MERCADO LIVRE, E ELE CAIU SOZINHO", 6);
  cab(ws, ["Canal", "jan (R$/dia)", "out (R$/dia)", "Diferença", "", ""]);
  for (const [c, a, b] of [["Loja própria", 16143, 55169], ["Mercado Livre", 28363, 9894], ["Todos os outros", 4898, 1547]]) {
    const r = ws.addRow([c, a, b, b - a, "", ""]);
    [2, 3, 4].forEach((x) => (r.getCell(x).numFmt = brl));
    r.getCell(4).font = { bold: true, color: { argb: b - a < 0 ? "FFC00000" : "FF006100" } };
  }
  txt(ws, [
    "A Loja própria mais que triplicou e segura a operação. O Mercado Livre caiu de R$ 28.363 para R$ 9.894 por dia — uma perda de R$ 18.469 por dia, quase o DOBRO dos R$ 10.000 que você quer somar.",
    "",
    "Ou seja: não precisa inventar canal novo. Recuperar metade do que o Meli já foi resolve o pedido.",
  ], 6);

  secao(ws, "3. NÃO É FALTA DE VISITA. É CONVERSÃO.", 6);
  cab(ws, ["Mês", "Visitas", "Pedidos", "Conversão", "Ticket", "Receita/dia"]);
  for (const [m, v, p, t, rd] of [["junho", 33037, 515, 1381, 23708], ["julho", 44606, 423, 1253, 17101], ["agosto", 42565, 279, 1074, 9664], ["setembro", 27140, 189, 900, 5668], ["outubro", 24043, 189, 1204, 9894]]) {
    const r = ws.addRow([m, v, p, p / v, t, rd]);
    r.getCell(4).numFmt = "0.00%"; r.getCell(5).numFmt = brl; r.getCell(6).numFmt = brl;
    if (p / v < 0.009) r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
  }
  txt(ws, [
    "Em julho as visitas SUBIRAM para 44.606 e os pedidos caíram. A conversão foi de 1,56% para 0,70% — menos da metade. Trazer mais visita para um funil que converte 0,70% é jogar dinheiro fora; o que precisa subir primeiro é a conversão.",
  ], 6);

  secao(ws, "4. A CONTA ATÉ OS R$ 10.000 A MAIS", 6);
  cab(ws, ["De onde vem", "Por dia", "No mês", "Confiança", "", ""]);
  const conta = [
    ["Escalar Ads de R$ 10,7 mil para R$ 35 mil/mês", 5833, 175000, "alta — ACOS de 11% já medido"],
    ["Ligar Ads nos 54 anúncios que têm visita e não têm", 1800, 54000, "média — visita existe, falta verba"],
    ["Cortar o desperdício e remanejar", 350, 10500, "alta — R$ 3.370 sem retorno hoje"],
    ["Conversão de 0,70% para 0,90% nas visitas de hoje", 2063, 61900, "média — depende das ações 4 e 5"],
  ];
  let soma = 0;
  for (const c of conta) { const r = ws.addRow(c); r.getCell(2).numFmt = brl; r.getCell(3).numFmt = brl; soma += c[1]; }
  const t = ws.addRow(["SOMA", soma, soma * 30, "", "", ""]);
  t.font = { bold: true }; t.getCell(2).numFmt = brl; t.getCell(3).numFmt = brl;
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: soma >= 10000 ? VERDE : AMARELO } };
  txt(ws, [`Fecha em R$ ${soma.toLocaleString("pt-BR")} por dia, com folga de R$ ${(soma - 10000).toLocaleString("pt-BR")} para o que não sair como planejado.`], 6);

  secao(ws, "5. O QUE NÃO FAZER: BAIXAR PREÇO", 6);
  txt(ws, [
    `336 dos 1.038 anúncios ativos — 33% — JÁ ESTÃO ABAIXO do piso da Fórmula base. A mediana está 2,2% abaixo, e alguns colchões a vácuo chegam a 9%.`,
    "",
    `E 172 anúncios estão perdendo a disputa de catálogo. Parece barato ganhar: a maioria está a menos de 1% do preço necessário. Mas quando se compara com o piso, só 5 dos 170 podem ser cobertos sem vender abaixo da tabela. Nos outros 165 o concorrente está abaixo do que a Probel aguenta.`,
    "",
    "Conclusão: o caminho aqui NÃO é preço. É verba de mídia e conversão.",
  ], 6);
}

/* ═══ 2. O PLANO ═══ */
{
  const ws = wb.addWorksheet("O plano");
  ws.columns = [{ width: 5 }, { width: 32 }, { width: 66 }, { width: 13 }, { width: 14 }, { width: 10 }];
  titulo(ws, "O QUE FAZER, EM ORDEM DE IMPACTO", 6);
  cab(ws, ["#", "Ação", "Como fazer, passo a passo", "Vale por dia", "Quando", "Esforço"]);
  const P = [
    [1, "Escalar o Ads — é a melhor alavanca que existe aqui",
     "Nos últimos 30 dias: R$ 10.724 investidos viraram R$ 101.144. ACOS de 11% — cada R$ 1 voltou R$ 9,43. Nenhuma outra ação deste plano tem retorno medido parecido.\n\n1. Subir de R$ 10,7 mil para R$ 35 mil por mês, em degraus semanais de R$ 5 mil.\n2. Começar pela campanha 'DG - Foco': 15 anúncios, ACOS de 6%, R$ 2.420 viraram R$ 41.346. É R$ 17 por real investido.\n3. Depois 'Cotia G2' (ACOS 12%) e 'DG - Colchão Casal Excede' (13%).\n4. Parar de subir quando o ACOS da conta passar de 20%.\n5. Mesmo degradando de 11% para 15% de ACOS, R$ 35 mil viram R$ 233 mil.",
     5833, "Começar hoje", "Baixo"],
    [2, "Ligar Ads nos 54 anúncios que têm visita e não têm verba",
     "54 anúncios ativos tiveram mais de 100 visitas em 8 semanas e estão sem nenhum investimento.\n\nOs maiores: MLB4039549407 (PA66724, 2.146 visitas), MLB4039601405 (1.615), MLB3553688529 (PA85368, 1.068), MLB4530736830 (1.044).\n\n1. Entrar com R$ 20/dia em cada um dos 20 maiores.\n2. Medir em 14 dias e manter só quem ficar abaixo de 20% de ACOS.\n3. A lista completa está na aba Ads — onde crescer.",
     1800, "Esta semana", "Baixo"],
    [3, "Cortar o que gasta e não vende",
     "27 anúncios gastaram mais de R$ 20 e não venderam nada: R$ 3.027 no período.\n\nE duas campanhas inteiras estão queimando:\n  DG - Boa Forma: R$ 505 gastos, R$ 508 de receita. ACOS de 99%.\n  DG - Colchão Volare: R$ 90, zero receita.\n  DG - Recuperação: R$ 253, zero receita.\n\n1. Pausar os 27 anúncios e as três campanhas.\n2. Remanejar os R$ 3.370 para a 'DG - Foco'.",
     350, "Hoje", "Baixo"],
    [4, "Descobrir por que a conversão caiu pela metade",
     "De 1,56% em junho para 0,70% hoje, com as visitas estáveis. Isso vale mais que qualquer verba: nas 24.043 visitas de outubro, cada 0,1 ponto de conversão são 24 pedidos a mais — R$ 29 mil no mês.\n\nO que conferir, nesta ordem:\n1. Preço: a curva A subiu 12% em agosto, que é o mês em que a queda acelerou.\n2. Prazo de entrega: a 2ª conta é 'venda a prazo' e tem 748 anúncios ativos para só R$ 51 mil de receita.\n3. Perguntas sem resposta e reputação por anúncio.\n4. Foto e título dos 20 com mais visita e menos venda.",
     2063, "Investigar esta semana", "Médio"],
    [5, "Arrumar a 2ª conta, que tem anúncio demais e venda de menos",
     "São Paulo — pronta entrega: 297 anúncios ativos, R$ 176.309 em outubro.\n2ª conta — venda a prazo: 748 anúncios ativos, R$ 51.246.\n\nDois ativos e meio para cada um da primeira conta, e um terço da receita.\n\n1. Ver se os 748 estão com prazo de entrega competitivo.\n2. Concentrar verba de Ads na conta que converte.\n3. Pausar o que não teve visita nenhuma em 8 semanas.",
     0, "Novembro", "Médio"],
    [6, "Cobrir o catálogo só onde cabe — são 5, não 172",
     "172 anúncios perdendo a disputa. Parece que falta pouco (menos de 1% na maioria), mas comparando com a Fórmula base só 5 podem ser cobertos sem vender abaixo do piso.\n\nMLB6802090556 (PA94864): falta R$ 4,60, sobra R$ 28,54 do piso.\nMLB5966613168 (PA64714): falta R$ 1,70, sobra R$ 0,13.\nMLB6809278682 (PAA2678): falta R$ 5,07, sobra R$ 0,64.\nMLB3663599169 (PA65751): falta R$ 96, sobra R$ 470,72.\nMLB4443041318 (PA66410): falta R$ 1.053, sobra R$ 3,72.\n\nNos outros 165 o concorrente está abaixo do que a Probel aguenta. Não cobrir.",
     120, "Esta semana", "Baixo"],
  ];
  for (const p of P) {
    const r = ws.addRow(p);
    r.alignment = { wrapText: true, vertical: "top" };
    r.getCell(1).font = { bold: true, size: 13 };
    r.getCell(2).font = { bold: true };
    r.getCell(4).numFmt = brl;
    r.height = Math.max(70, p[2].split("\n").length * 14);
    r.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: p[5] === "Baixo" ? VERDE : AMARELO } };
  }
  ws.views = [{ state: "frozen", ySplit: 2 }];
}

/* ═══ 3. ADS: ONDE CRESCER ═══ */
{
  const ws = wb.addWorksheet("Ads — onde crescer");
  const cols = ["MLB", "SKU", "Visitas 8 sem", "Preço", "Conta", "O que fazer"];
  ws.columns = [{ width: 15 }, { width: 12 }, { width: 13 }, { width: 11 }, { width: 26 }, { width: 50 }];
  titulo(ws, "54 ANÚNCIOS COM VISITA E SEM NENHUM INVESTIMENTO", cols.length);
  txt(ws, ["Ordenados pela visita das últimas 8 semanas. Entrar com R$ 20/dia nos 20 primeiros e medir em 14 dias."], cols.length);
  cab(ws, cols);
  for (const [i, s] of semAds.entries()) {
    const r = ws.addRow([s.mlb, s.sku, s.vis, s.preco, s.conta, i < 20 ? "ENTRAR com R$ 20/dia agora" : "Segunda onda, depois de medir os 20 primeiros"]);
    r.getCell(4).numFmt = brl2;
    if (i < 20) r.getCell(6).font = { bold: true, color: { argb: "FF006100" } };
  }
  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
}

/* ═══ 4. CUIDADO COM O PREÇO ═══ */
{
  const ws = wb.addWorksheet("Cuidado com o preço");
  const cols = ["MLB", "SKU", "Tipo", "Preço hoje", "Piso da tabela", "Falta", "% abaixo", "Produto"];
  ws.columns = [{ width: 15 }, { width: 11 }, { width: 10 }, { width: 11 }, { width: 13 }, { width: 10 }, { width: 10 }, { width: 44 }];
  titulo(ws, "336 ANÚNCIOS JÁ ESTÃO ABAIXO DO PISO DA FÓRMULA BASE", cols.length);
  txt(ws, [
    "Piso da Fórmula base vigente de 30/09/2026, na alíquota do tipo do anúncio: 11,5% no clássico, 16,5% no premium. Estes anúncios vendem abaixo do que a tabela diz que preserva a margem — por isso qualquer plano que dependa de baixar preço está descartado.",
  ], cols.length);
  cab(ws, cols);
  for (const a of abaixo) {
    const r = ws.addRow([a.mlb, a.sku, a.tipo, a.preco, a.piso, a.dif, a.pct / 100, String(a.titulo).slice(0, 42)]);
    [4, 5, 6].forEach((c) => (r.getCell(c).numFmt = brl2));
    r.getCell(7).numFmt = "0.0%";
    if (a.pct >= 5) r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
    else if (a.pct >= 3) r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO } };
  }
  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
}

/* ═══ 5. CATÁLOGO ═══ */
{
  const ws = wb.addWorksheet("Catálogo");
  const cols = ["MLB", "SKU", "Meu preço", "Para ganhar", "Falta", "% falta", "Piso", "Cabe no piso?", "Conta"];
  ws.columns = [{ width: 15 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 10 }, { width: 9 }, { width: 11 }, { width: 13 }, { width: 24 }];
  titulo(ws, "OS 5 QUE DÁ PARA GANHAR", cols.length);
  txt(ws, ["Dos 172 anúncios em disputa, estes são os únicos em que o preço necessário para ganhar ainda fica acima do piso da Fórmula base. Nos outros 165 o concorrente está abaixo do que a Probel aguenta."], cols.length);
  cab(ws, cols);
  for (const c of cobrir) {
    const r = ws.addRow([c.mlb, c.sku, c.meu, c.alvo, c.falta, c.faltaPct / 100, c.piso, "sim", c.conta]);
    [3, 4, 5, 7].forEach((x) => (r.getCell(x).numFmt = brl2));
    r.getCell(6).numFmt = "0.0%";
    r.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  }
  ws.views = [{ state: "frozen", ySplit: 4 }];
}

await wb.xlsx.writeFile("output/Probel-plano-novembro.xlsx");
console.log("escrito: output/Probel-plano-novembro.xlsx");
console.log("  abas: " + wb.worksheets.map((w) => w.name).join(" · "));
console.log(`  ${abaixo.length} abaixo do piso · ${semAds.length} sem Ads · ${cobrir.length} cobríveis`);
