/**
 * O plano de novembro da Bom de Compras, em planilha.
 *
 * Tudo aqui sai dos dados da operação — pedidos, desempenho semanal,
 * catálogo, estoque, Ads e a Fórmula base. Nenhum número é estimado sem
 * dizer que é estimativa, e nenhum preço é sugerido sem a margem ao lado:
 * 45 dos 99 SKUs têm custo cadastrado, e nos outros a planilha diz "sem
 * custo" em vez de inventar.
 *
 * Uso: node scripts/local/plano-bdc-novembro.mjs
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const d = JSON.parse(readFileSync("scratchpad/bdc.json", "utf8"));
const acoes = JSON.parse(readFileSync("scratchpad/bdc-acoes.json", "utf8"));
const anuncios = JSON.parse(readFileSync("scratchpad/bdc-anuncios.json", "utf8"));
const porSku = new Map(acoes.map((a) => [a.sku, a]));

/* ── Estilo ── */
const AZUL = "FF1F3864", CLARO = "FFD9E2F3", CINZA = "FFF2F2F2";
const VERDE = "FFC6EFCE", VERMELHO = "FFFFC7CE", AMARELO = "FFFFEB9C";
const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";

const titulo = (ws, texto, largura) => {
  const r = ws.addRow([texto]);
  r.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  r.height = 26;
  ws.mergeCells(r.number, 1, r.number, largura);
  r.alignment = { vertical: "middle", indent: 1 };
  return r;
};
const secao = (ws, texto, largura) => {
  ws.addRow([]);
  const r = ws.addRow([texto]);
  r.font = { bold: true, size: 11, color: { argb: AZUL } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLARO } };
  ws.mergeCells(r.number, 1, r.number, largura);
  r.alignment = { indent: 1 };
  return r;
};
const cabecalho = (ws, cols) => {
  const r = ws.addRow(cols);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  r.alignment = { vertical: "middle", wrapText: true };
  r.height = 32;
  return r;
};
const texto = (ws, linhas, largura) => {
  for (const t of linhas) {
    const r = ws.addRow([t]);
    ws.mergeCells(r.number, 1, r.number, largura);
    r.alignment = { wrapText: true, vertical: "top" };
    r.height = Math.max(16, Math.ceil(t.length / (largura * 14)) * 15);
  }
};
const brl = '"R$ "#,##0';
const brl2 = '"R$ "#,##0.00';

/* ══════════ 1. COMECE AQUI ══════════ */
{
  const ws = wb.addWorksheet("Comece aqui");
  ws.columns = [{ width: 26 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 22 }];
  titulo(ws, "BOM DE COMPRAS · PLANO DE NOVEMBRO", 6);
  texto(ws, [
    "Feito em 23/10/2026 com os dados que estão no sistema: 6.397 pedidos, 341 anúncios, 13 meses de histórico.",
  ], 6);

  secao(ws, "1. ONDE A GENTE ESTÁ", 6);
  cabecalho(ws, ["", "Hoje (outubro)", "Melhor mês (abril)", "Alvo de novembro", "", ""]);
  const l1 = ws.addRow(["Receita por dia", 1970, 4534, 10000, "", ""]);
  [2, 3, 4].forEach((c) => (l1.getCell(c).numFmt = brl));
  const l2 = ws.addRow(["Receita no mês", 59090, 136026, 300000, "", ""]);
  [2, 3, 4].forEach((c) => (l2.getCell(c).numFmt = brl));
  texto(ws, [
    "O alvo de R$ 10.000 por dia é 5,1 vezes o que a casa vende hoje e 2,2 vezes o melhor mês que ela já teve. Isso não quer dizer que não dá — quer dizer que recuperar o que caiu não basta. Precisa disso E de coisa nova.",
  ], 6);

  secao(ws, "2. A QUEDA TEM NOME: QUATRO PRODUTOS", 6);
  cabecalho(ws, ["Produto", "3 melhores meses", "3 últimos meses", "Perdeu", "% da queda", "O que aconteceu"]);
  const quatro = [
    ["GP561 Fatiador de Tomate", 114673, 3215, 111458, 0.68, "11 dos 12 anúncios pausados"],
    ["Q24GP503 24 Canecas Chopp", 70530, 9622, 60908, 0.37, "visitas caíram 90%"],
    ["Q12GP503 12 Canecas Chopp", 36336, 8741, 27595, 0.17, "visitas caíram 58%"],
    ["Q6GP503 6 Canecas Chopp", 28487, 5246, 23241, 0.14, "visitas caíram 75%"],
  ];
  for (const q of quatro) {
    const r = ws.addRow(q);
    [2, 3, 4].forEach((c) => (r.getCell(c).numFmt = brl));
    r.getCell(5).numFmt = "0%";
    r.getCell(4).font = { bold: true, color: { argb: "FFC00000" } };
  }
  texto(ws, [
    "A casa inteira caiu R$ 164.043 comparando os três melhores meses com os três últimos. Esses quatro produtos sozinhos somam R$ 223.202 de queda — ou seja, o resto da operação até CRESCEU R$ 59 mil. O problema não é a loja: são quatro produtos.",
    "",
    "A queda começou em agosto, no mesmo mês em que os preços subiram de 6% a 8%. Agosto também é o pior mês do histórico (R$ 1.663/dia).",
  ], 6);

  secao(ws, "3. O QUE NÃO É O PROBLEMA", 6);
  texto(ws, [
    "Reputação: 5_green silver, 0,48% de reclamação, zero atraso, zero cancelamento. Está saudável.",
    "Tráfego pago: está rodando e dando certo — ACOS de 15%, R$ 2.404 investidos viraram R$ 16.126 nos últimos 30 dias. O problema é que é pouco dinheiro.",
    "Estoque parado: só R$ 22.815 em SKUs sem anúncio ativo. Não é aqui que está o dinheiro.",
  ], 6);

  secao(ws, "4. A CONTA ATÉ OS R$ 10.000 POR DIA", 6);
  cabecalho(ws, ["De onde vem", "Por dia", "No mês", "Confiança", "", ""]);
  const conta = [
    ["O que a casa já vende hoje", 1970, 59090, "certo"],
    ["Recuperar GP561 ao nível de abril", 2079, 62384, "alta — produto e estoque existem"],
    ["Recuperar as 3 canecas ao melhor mês", 1828, 54833, "média — depende de recuperar visita"],
    ["Subir Ads de R$ 2,4 mil para R$ 15 mil/mês", 3333, 100000, "alta — ACOS de 15% já medido"],
    ["Full: hoje a conta tem 17 unidades lá", 500, 15000, "estimativa — ver aba Plano"],
  ];
  let somaDia = 0;
  for (const c of conta) {
    const r = ws.addRow(c);
    r.getCell(2).numFmt = brl; r.getCell(3).numFmt = brl;
    somaDia += c[1];
  }
  const tot = ws.addRow(["SOMA", somaDia, somaDia * 30, "", "", ""]);
  tot.font = { bold: true };
  tot.getCell(2).numFmt = brl; tot.getCell(3).numFmt = brl;
  tot.fill = { type: "pattern", pattern: "solid", fgColor: { argb: somaDia >= 10000 ? VERDE : AMARELO } };
  const falta = ws.addRow(["Falta para o alvo", 10000 - somaDia, (10000 - somaDia) * 30, "", "", ""]);
  falta.getCell(2).numFmt = brl; falta.getCell(3).numFmt = brl;
  falta.font = { bold: true, color: { argb: "FFC00000" } };
  texto(ws, [
    "Mesmo somando tudo que dá para medir, falta. A diferença só fecha com produto novo ou com uma campanha grande (Black Friday) — e isso está na aba Plano, nas ações 7 e 8.",
  ], 6);

  secao(ws, "5. AVISO SOBRE PREÇO", 6);
  texto(ws, [
    "Não dá para resolver isso baixando preço nos campeões. Pela conta que sai do cadastro, dois deles estão negativos no preço de hoje:",
    "     Q12GP503 (12 canecas): vende a R$ 203,90 e sobra MENOS R$ 16,37 por unidade.",
    "     Q6GP503 (6 canecas, premium): vende a R$ 78,90 e sobra MENOS R$ 0,82.",
    "",
    "Antes de mexer em qualquer um, conferir o FRETE cadastrado. O Q12GP503 carrega R$ 75,65 de frete num produto de R$ 203,90 — 37% do preço. Em alguns itens o frete lançado é maior que o próprio preço, o que é erro de cadastro, não prejuízo: a aba da margem marca esses em separado.",
    "A conta de cada um está na aba 'Cuidado com a margem'.",
  ], 6);
}

/* ══════════ 2. O PLANO ══════════ */
{
  const ws = wb.addWorksheet("O plano");
  ws.columns = [{ width: 5 }, { width: 34 }, { width: 62 }, { width: 14 }, { width: 13 }, { width: 11 }, { width: 24 }];
  titulo(ws, "O QUE FAZER, EM ORDEM DE IMPACTO", 7);
  cabecalho(ws, ["#", "Ação", "Como fazer, passo a passo", "Vale por dia", "Quando", "Esforço", "Onde conferir"]);

  const P = [
    [1, "Reativar os anúncios do Fatiador GP561",
     "O anúncio MLB5087858673 estava GANHANDO o catálogo, com 224 visitas nas últimas 8 semanas, e está pausado. O MLB4268381525 tem 391 visitas e também está pausado. Os dois estão com estoque ZERO no anúncio, enquanto outros dez mostram 146 unidades — então é vínculo de estoque, não falta de produto.\n\n1. Confirmar as 146 unidades em Ribeirão Preto.\n2. Vincular o estoque aos dois anúncios que têm tração e reativar.\n3. Voltar o preço para R$ 1.158 (era o de abril, quando vendeu 55 unidades). Hoje está R$ 1.248,90.\n4. O único ativo hoje (MLB4757235019) está 'not_listed' no catálogo e teve ZERO visita em 8 semanas — ele não sustenta o produto sozinho.",
     2079, "Esta semana", "Baixo", "Anúncio por anúncio"],
    [2, "Subir o investimento em Ads",
     "Nos últimos 30 dias: R$ 2.404 investidos, R$ 16.126 de receita, ACOS de 15%. Cada R$ 1 virou R$ 6,70.\n\n1. Subir para R$ 500/dia (R$ 15 mil no mês), em degraus de R$ 100/dia por semana, olhando o ACOS.\n2. Começar pelos que já provaram: MLB3580645603 (R$ 496 → R$ 3.382), MLB3580710019 (R$ 142 → R$ 1.928, ACOS 7%), MLB5188540764 (69 vendas).\n3. Cortar os 18 anúncios que gastaram e não venderam nada (R$ 357 no período).\n4. Teto: parar de subir quando o ACOS passar de 25%.",
     3333, "Começar já", "Baixo", "Tráfego pago"],
    [3, "Recuperar as visitas das canecas",
     "As três famílias têm TODOS os anúncios ativos, então não é pausa — é perda de posição. Q24GP503 caiu de 1.503 para 151 visitas.\n\n1. NÃO baixar preço: Q12 e Q6 já estão no vermelho (ver aba da margem).\n2. Colocar os quatro anúncios de catálogo para ganhar: MLB3831951419 está 'competing'.\n3. Rever título e foto dos que têm zero visita: MLB3580620687, MLB3580620693, MLB3580671541.\n4. Pôr Ads nos que não têm: MLB3580620693, MLB3580671541, MLB3746498145.",
     1828, "Próximas 2 semanas", "Médio", "Anúncio por anúncio"],
    [4, "Repor o GP118 (Jarra Inox 2L)",
     "Vendeu R$ 12.520 nos últimos 3 meses — está CRESCENDO — e os SEIS anúncios estão pausados com estoque 1. Um deles tem 412 visitas em 8 semanas e está 'competing'; outro está 'winning'.\n\n1. Comprar estoque. É o produto com melhor relação visita/venda da casa agora.\n2. Reativar os seis assim que chegar.\n3. Margem atual é confortável — ver aba da margem.",
     420, "Compra esta semana", "Médio", "Anúncio por anúncio"],
    [5, "Mandar estoque para o Full",
     "A conta inteira tem 17 unidades no Full. Tudo o mais sai de Ribeirão Preto (10.352 unidades) por xd_drop_off.\n\n1. Escolher os 10 mais vendidos e mandar 30 dias de venda para o Full.\n2. O Full muda posição de busca, frete e prazo — é o que mais mexe em visita sem mexer em preço.\n3. Medir 2 semanas depois, anúncio a anúncio, antes de mandar mais.",
     500, "Novembro, semana 1", "Alto", "Estoque"],
    [6, "Consertar a margem do Q12GP503 e Q6GP503",
     "Q12GP503 vende a R$ 203,90 com margem de MENOS 8,03%. Q6GP503 a R$ 78,90 com MENOS 1,04%. Cada unidade vendida hoje custa dinheiro.\n\n1. Conferir se o frete de R$ 75,65 por unidade do Q12 está certo — ele é 37% do preço.\n2. Se estiver, o preço tem que subir para R$ 244,93 (o piso da Fórmula base) ou o produto sai de linha.\n3. Enquanto não resolver, NÃO colocar esses dois em promoção nem em Ads.",
     0, "Antes de qualquer promoção", "Baixo", "Cuidado com a margem"],
    [7, "Black Friday nos que têm margem",
     "Os que aguentam desconto de verdade, com a margem que sobra no piso da Fórmula base:\n\nGP384 Campainha: margem 25,66% hoje, 33,65% no piso. 1.937 em estoque, 592 visitas.\nGP730 Funil: margem 20,5%. 1.578 em estoque.\nGP835 Porcionador: 1.985 visitas em 8 semanas e vendeu pouco — é caso de preço.\nGP524 Dispenser: margem 13,1%.\n\n1. Entrar na Black Friday do Meli só com esses.\n2. Usar a tela Promoções > Processar, que já calcula o mínimo de cada um.",
     800, "Planejar até 10/11", "Médio", "Promoções"],
    [8, "Shopee está crescendo sozinha",
     "Shopee saiu de R$ 4.174 em setembro para R$ 7.682 em outubro, +84%, sem ninguém cuidar. Magalu caiu para R$ 152 e Amazon está em R$ 772.\n\n1. Levar os campeões do Meli para a Shopee.\n2. Ver o que já vende lá e dobrar a aposta.\n3. Magalu e Amazon: ou cuida, ou tira da conta — hoje dão trabalho e não dão receita.",
     400, "Novembro", "Médio", "Vendas por canal"],
  ];
  for (const p of P) {
    const r = ws.addRow(p);
    r.alignment = { wrapText: true, vertical: "top" };
    r.getCell(1).font = { bold: true, size: 13 };
    r.getCell(2).font = { bold: true };
    r.getCell(4).numFmt = brl;
    r.height = Math.max(70, p[2].split("\n").length * 14);
    const e = p[5];
    r.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: e === "Baixo" ? VERDE : e === "Médio" ? AMARELO : VERMELHO } };
  }
  ws.views = [{ state: "frozen", ySplit: 3 }];
}

/* ══════════ 3. ANÚNCIO POR ANÚNCIO ══════════ */
{
  const ws = wb.addWorksheet("Anúncio por anúncio");
  const cols = ["SKU", "Anúncio", "Tipo", "Situação hoje", "Preço", "Estoque", "No catálogo?", "Posição", "Visitas 8 sem", "Ads 30d", "O QUE FAZER"];
  ws.columns = [{ width: 12 }, { width: 15 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 9 }, { width: 11 }, { width: 13 }, { width: 11 }, { width: 10 }, { width: 58 }];
  titulo(ws, "OS 50 ANÚNCIOS DOS 11 PRODUTOS QUE IMPORTAM", cols.length);
  cabecalho(ws, cols);

  const acao = (l) => {
    if (l.sku === "GP561") {
      if (l.status === "pausado" && l.visitas8s >= 100) return "REATIVAR JÁ — tem tração e está parado. Vincular estoque.";
      if (l.status === "ativo" && l.situacao === "not_listed") return "Sozinho não sustenta: zero visita em 8 semanas. Pôr no catálogo.";
      if (l.status === "pausado" && Number(l.preco) > 1400) return "Deixar pausado: preço muito acima do que vendeu (R$ 1.158 em abril).";
      return "Reativar na segunda onda, depois dos dois com tração.";
    }
    if (l.status === "pausado") return "Pausado. Repor estoque e reativar — ver ação 4.";
    if (l.visitas8s === 0) return "Zero visita em 8 semanas: rever título e foto, ou encerrar.";
    if (l.situacao === "competing") return `Perdendo o catálogo. Conferir margem antes de cobrir${l.paraGanhar ? ` (para ganhar: R$ ${l.paraGanhar})` : ""}.`;
    if (l.situacao === "not_listed") return "Fora do catálogo. Pedir vínculo ao Meli.";
    if (l.situacao === "winning") return "Ganhando o catálogo. Não mexer no preço; pôr Ads.";
    if (l.adsInvest == null && l.visitas8s > 50) return "Tem visita e não tem Ads. Candidato a campanha.";
    return "Manter. Acompanhar semanalmente.";
  };
  for (const l of anuncios) {
    const r = ws.addRow([
      l.sku, l.mlb, l.tipo, l.status, l.preco, l.estoque,
      l.catalogo ? "sim" : "não", l.situacao || "—", l.visitas8s,
      l.adsInvest != null ? l.adsInvest : null, acao(l),
    ]);
    r.getCell(5).numFmt = brl2;
    r.getCell(10).numFmt = brl;
    r.alignment = { wrapText: true, vertical: "top" };
    if (l.status === "pausado") r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
    if (l.situacao === "winning") r.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    if (l.situacao === "competing" || l.situacao === "not_listed") r.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO } };
    if (String(r.getCell(11).value).startsWith("REATIVAR")) r.getCell(11).font = { bold: true, color: { argb: "FFC00000" } };
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
}

/* ══════════ 4. CUIDADO COM A MARGEM ══════════ */
{
  const ws = wb.addWorksheet("Cuidado com a margem");
  const cols = ["SKU", "Produto", "Preço hoje", "Margem hoje", "Em R$", "Piso da tabela", "Margem no piso", "Espaço p/ desconto", "Veredito"];
  ws.columns = [{ width: 13 }, { width: 38 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 13 }, { width: 13 }, { width: 16 }, { width: 46 }];
  titulo(ws, "ANTES DE MEXER EM PREÇO, OLHE AQUI", cols.length);
  texto(ws, [
    "A margem é o que sobra depois de mercadoria, frete, embalagem, imposto e comissão do canal. Clássico paga 11,5%, premium 16,5%. Onde está escrito 'sem custo', o produto não tem custo cadastrado em Produtos e eu não tenho como calcular — não é zero, é desconhecido.",
  ], cols.length);
  cabecalho(ws, cols);
  const prodPor = new Map(d.produtos.map((p) => [String(p.sku).trim().toUpperCase(), p]));
  const comCusto = acoes.filter((a) => a.margemAtual != null && a.precoAtual).sort((a, b) => a.margemAtual - b.margemAtual);
  for (const a of comCusto.slice(0, 30)) {
    /*
     * Frete maior que 40% do preço quase sempre é cadastro errado — o
     * frete do kit de 24 colado no de 6, por exemplo. Dizer "está no
     * vermelho" nesses seria acusar o produto de um defeito da planilha
     * de custo, e ele mandaria baixar preço de algo que talvez esteja são.
     */
    const p = prodPor.get(a.sku);
    const frete = Number(p?.frete_unitario) || 0;
    const freteSuspeito = a.precoAtual > 0 && frete / a.precoAtual > 0.4;
    const vere = freteSuspeito
      ? `CONFERIR CADASTRO: o frete lançado é R$ ${frete.toFixed(2)} num produto de R$ ${a.precoAtual.toFixed(2)}. Antes de concluir que dá prejuízo, olhar se esse frete é mesmo deste item.`
      : a.margemAtual < 0 ? "NO VERMELHO. Não promover, não anunciar. Rever custo ou preço."
      : a.margemAtual < 8 ? "Margem apertada. Desconto só com a conta na mão."
      : a.margemPiso != null && a.margemPiso < 0 ? "O piso da tabela dá prejuízo — o piso está errado."
      : a.espacoPct != null && a.espacoPct > 15 ? "Tem espaço real para promoção."
      : "Pouco espaço. Segurar o preço.";
    const r = ws.addRow([
      a.sku, String(a.titulo).slice(0, 44), a.precoAtual, a.margemAtual / 100, a.margemAtualRS,
      a.piso, a.margemPiso != null ? a.margemPiso / 100 : null,
      a.espacoPct != null ? a.espacoPct / 100 : null, vere,
    ]);
    r.getCell(3).numFmt = brl2; r.getCell(5).numFmt = brl2; r.getCell(6).numFmt = brl2;
    [4, 7, 8].forEach((c) => (r.getCell(c).numFmt = "0.0%"));
    r.alignment = { wrapText: true, vertical: "top" };
    const cor = a.margemAtual < 0 ? VERMELHO : a.margemAtual < 8 ? AMARELO : VERDE;
    r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
  }
  const semCusto = acoes.filter((a) => a.margemAtual == null && a.tot > 2000);
  ws.addRow([]);
  const sc = ws.addRow([`SEM CUSTO CADASTRADO — ${semCusto.length} produtos que já venderam mais de R$ 2.000 e não dá para calcular margem:`]);
  sc.font = { bold: true, color: { argb: "FFC00000" } };
  ws.mergeCells(sc.number, 1, sc.number, cols.length);
  for (const a of semCusto.slice(0, 14)) {
    const r = ws.addRow([a.sku, String(a.titulo).slice(0, 44), a.precoAtual, null, null, a.piso, null, null, "Cadastrar custo em Produtos antes de promover."]);
    r.getCell(3).numFmt = brl2;
  }
  ws.views = [{ state: "frozen", ySplit: 5 }];
}

/* ══════════ 5. OS NÚMEROS ══════════ */
{
  const ws = wb.addWorksheet("Os números");
  const cols = ["SKU", "Produto", "Receita total", "3 melhores meses", "3 últimos meses", "Caiu", "Anúncios ativos", "Pausados", "Estoque", "Visitas abr-jun", "Visitas set-out"];
  ws.columns = [{ width: 13 }, { width: 40 }, { width: 13 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 13 }, { width: 13 }];
  titulo(ws, "TODOS OS PRODUTOS COM VENDA, PARA CONFERIR", cols.length);
  cabecalho(ws, cols);
  for (const a of acoes) {
    const r = ws.addRow([a.sku, String(a.titulo).slice(0, 46), a.tot, a.bom, a.agora, a.bom - a.agora, a.ativos, a.pausados, a.estoque, a.vAntes, a.vAgora]);
    [3, 4, 5, 6].forEach((c) => (r.getCell(c).numFmt = brl));
    if (a.bom - a.agora > 5000) r.getCell(6).font = { bold: true, color: { argb: "FFC00000" } };
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };
}

await wb.xlsx.writeFile("output/BomDeCompras-plano-novembro.xlsx");
console.log("escrito: output/BomDeCompras-plano-novembro.xlsx");
console.log(`  abas: ${wb.worksheets.map((w) => w.name).join(" · ")}`);
console.log(`  ${acoes.length} SKUs · ${anuncios.length} anúncios detalhados`);
