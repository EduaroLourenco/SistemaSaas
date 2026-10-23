/**
 * As três movimentações da Probel, com o dado que sustenta cada uma.
 *
 *  1. Conta a prazo passa a fazer Ads — em quais produtos.
 *  2. Conta São Paulo: o Ads gasta na família e só um produto vende.
 *  3. As duas contas: o catálogo divide a visita entre os irmãos.
 *
 * A terceira foi medida e NÃO se confirma como estava imaginada: em 25
 * produtos quem perde o catálogo converte MELHOR que quem ganha, e
 * desligar a promoção deles pioraria. A planilha separa os 21 em que
 * concentrar ajuda dos 25 em que atrapalha, em vez de aplicar a regra
 * nos 98.
 *
 * E antes das três há um achado que muda o contexto de todas: em 218
 * SKUs o piso da Fórmula base está ACIMA do preço que o mercado pagava
 * quando o produto vendia bem — de 27% a 45% acima. Enquanto isso não
 * for resolvido, nenhuma das três tem onde apoiar o preço.
 *
 * Uso: node scripts/local/probel-movimentacoes.mjs
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const d = JSON.parse(readFileSync("scratchpad/mv.json", "utf8"));
const B = JSON.parse(readFileSync("scratchpad/mv-base.json", "utf8"));
const mov1a = JSON.parse(readFileSync("scratchpad/mv1a.json", "utf8"));
const fams = JSON.parse(readFileSync("scratchpad/mv2f.json", "utf8"));
const split = JSON.parse(readFileSync("scratchpad/mv3split.json", "utf8"));
const nm = (s) => String(s ?? "").trim().toUpperCase();
const r2 = (v) => Math.round(v * 100) / 100;
const soma = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const SP = B.filter((b) => b.conta === "SP"), PZ = B.filter((b) => b.conta === "Prazo");

/* ── O achado: piso contra o preço que o mercado pagava ── */
const pedPor = new Map(d.pedidos.map((p) => [p.id, p]));
const vig = [...new Set(d.precos.map((x) => x.vigente_de))].sort().pop();
const tab = { sku: new Map(), mlb: new Map() };
for (const x of d.precos) {
  if (x.vigente_de !== vig) continue;
  const alvo = x.chave_tipo === "mlb" ? tab.mlb : tab.sku;
  const k = nm(x.chave), g = alvo.get(k) ?? {};
  g[Math.round(Number(x.comissao) * 1000) / 1000] = Number(x.preco);
  alvo.set(k, g);
}
const mesSku = new Map();
for (const i of d.itens) {
  const p = pedPor.get(i.pedido_id); if (!p || p.cancelado) continue;
  const k = nm(i.sku) || nm(i.codigo_externo), m = String(p.data).slice(0, 7);
  if (!mesSku.has(k)) mesSku.set(k, new Map());
  const g = mesSku.get(k).get(m) ?? { q: 0, r: 0 };
  g.q += Number(i.quantidade) || 0; g.r += Number(i.total) || 0;
  mesSku.get(k).set(m, g);
}
const tabela = [];
for (const [sku, g] of mesSku) {
  const piso = tab.sku.get(sku)?.[0.115]; if (!piso) continue;
  const bom = [...g.entries()].filter(([, x]) => x.r > 3000).sort((a, b) => b[1].r - a[1].r)[0];
  if (!bom) continue;
  const pm = bom[1].r / bom[1].q;
  const hoje = g.get("2026-10");
  tabela.push({
    sku, mes: bom[0], rec: r2(bom[1].r), pm: r2(pm), piso,
    acima: r2(((piso - pm) / pm) * 100),
    precoHoje: hoje && hoje.q ? r2(hoje.r / hoje.q) : null,
  });
}
tabela.sort((a, b) => b.rec - a.rec);
const acima = tabela.filter((x) => x.acima > 0);

/* ── MOV 1b: exclusivos da conta a prazo, pouca visita e boa conversão ── */
const skusSP = new Set(SP.map((b) => b.sku));
const MEDIA = soma(B, (b) => b.ven) / soma(B, (b) => b.vis);
const mov1b = PZ.filter((b) =>
  b.status === "ativo" && !skusSP.has(b.sku) && b.vis > 0 && b.vis < 300 && b.conv != null && b.conv / 100 > MEDIA
).sort((a, b) => (b.conv ?? 0) - (a.conv ?? 0));

const AZUL = "FF1F3864", CLARO = "FFD9E2F3", FAIXA = "FFF2F2F2";
const VERDE = "FFC6EFCE", VERMELHO = "FFFFC7CE", AMARELO = "FFFFEB9C";
const brl = '"R$ "#,##0', brl2 = '"R$ "#,##0.00';
const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";
const titulo = (ws, t, n) => { const r = ws.addRow([t]); r.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.height = 26; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { vertical: "middle", indent: 1 }; };
const secao = (ws, t, n) => { ws.addRow([]); const r = ws.addRow([t]); r.font = { bold: true, size: 11, color: { argb: AZUL } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLARO } }; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { indent: 1 }; };
const cab = (ws, cols) => { const r = ws.addRow(cols); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.alignment = { vertical: "middle", wrapText: true }; r.height = 36; return r.number; };
const txt = (ws, linhas, n) => { for (const t of linhas) { const r = ws.addRow([t]); ws.mergeCells(r.number, 1, r.number, n); r.alignment = { wrapText: true, vertical: "top" }; r.height = Math.max(16, Math.ceil(t.length / (n * 13)) * 15); } };

/* ═══ 0. LEIA PRIMEIRO ═══ */
{
  const ws = wb.addWorksheet("0 Leia primeiro");
  ws.columns = [{ width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 34 }];
  titulo(ws, "PROBEL · AS TRÊS MOVIMENTAÇÕES", 7);

  secao(ws, "O QUE ATRAVESSA AS TRÊS: O PREÇO DE TABELA SUBIU ACIMA DO MERCADO", 7);
  txt(ws, [
    `Em ${acima.length} SKUs o piso da Fórmula base vigente (${vig}) está ACIMA do preço médio que o cliente pagava no mês em que o produto mais vendeu. Só 32 ainda cabem.`,
    "Isso aparece em toda movimentação abaixo: na 1 o rebate não alcança o preço que vendia; na 2 a família fica cara; na 3 o anúncio que ganha o catálogo ganha com um preço que não converte.",
  ], 7);
  cab(ws, ["SKU", "Melhor mês", "Receita no mês", "Preço que vendia", "Piso hoje", "Quanto acima", "Preço médio de outubro"]);
  for (const t of acima.slice(0, 15)) {
    const r = ws.addRow([t.sku, t.mes, t.rec, t.pm, t.piso, t.acima / 100, t.precoHoje]);
    [3, 4, 5, 7].forEach((c) => (r.getCell(c).numFmt = brl));
    r.getCell(6).numFmt = "0.0%";
    r.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: t.acima > 25 ? VERMELHO : AMARELO } };
  }

  secao(ws, "AS ABAS", 7);
  for (const [a, b] of [
    ["1a Prazo: veio de SP", `${mov1a.length} SKUs que venderam bem em São Paulo e já têm anúncio na conta a prazo. Com o preço que vendia, o de hoje e o rebate que faltaria.`],
    ["1b Prazo: exclusivos", `${mov1b.length} anúncios só da conta a prazo, com pouca visita e conversão acima da média. São os que merecem tráfego.`],
    ["2 Famílias com Ads", `${fams.length} famílias da conta SP onde o Ads gasta. Marcado quem vende (manter pelo histórico) e quem gasta sem vender.`],
    ["3a Concentrar ajuda", `${split.ajuda.length} produtos de catálogo em que quem ganha converte melhor. Desligar a promoção dos irmãos.`],
    ["3b Concentrar prejudica", `${split.prejudica.length} produtos em que quem NÃO ganha converte melhor. Aqui desligar pioraria.`],
  ]) {
    const r = ws.addRow([a, b, "", "", "", "", ""]);
    ws.mergeCells(r.number, 2, r.number, 7);
    r.getCell(1).font = { bold: true };
    r.alignment = { wrapText: true, vertical: "top" };
    r.height = 30;
  }
}

/* ═══ 1a ═══ */
{
  const ws = wb.addWorksheet("1a Prazo veio de SP");
  const cols = ["SKU", "Produto", "Vendeu em SP (total)", "Melhor mês em SP", "Receita nesse mês", "Unid.", "PREÇO QUE VENDIA", "MLB na conta a prazo", "Tipo", "Preço hoje", "Quanto acima", "Piso", "Visitas 12s", "Vendas", "Conversão", "Ads hoje", "REBATE PARA CHEGAR AO PREÇO QUE VENDIA"];
  ws.columns = [{ width: 11 }, { width: 30 }, { width: 14 }, { width: 11 }, { width: 13 }, { width: 7 }, { width: 13 }, { width: 15 }, { width: 9 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 8 }, { width: 10 }, { width: 9 }, { width: 34 }];
  titulo(ws, "CONTA A PRAZO · PRODUTOS QUE JÁ VENDERAM BEM EM SÃO PAULO", cols.length);
  txt(ws, [
    "O que a conta a prazo precisa para começar Ads: produto com histórico comprovado. Estes venderam em São Paulo e já têm anúncio aberto na conta a prazo.",
    "A coluna do rebate responde a pergunta prática: para chegar ao preço que vendia bem, qual faixa de comissão a Fórmula base exige. 'Nem a 4,5%' quer dizer que nem a menor faixa negociável alcança — o preço de tabela está alto demais, e é o problema da aba 0.",
  ], cols.length);
  const h = cab(ws, cols);
  for (const x of mov1a) {
    const r = ws.addRow([
      x.sku, String(x.titulo).slice(0, 28), x.vendeuSP, x.spMelhorMes, x.spMelhorRec, x.spMelhorQtd,
      x.precoQueVendia, x.pzMlb, x.pzTipo, x.pzPreco,
      x.acimaPct != null ? x.acimaPct / 100 : null, x.pzPiso,
      x.pzVis, x.pzVen, x.pzConv != null ? x.pzConv / 100 : null, x.pzAds,
      x.rebateAlvo ? `${x.rebateAlvo.faixa}% de comissão → R$ ${x.rebateAlvo.preco}` : "nem a 4,5% chega — preço de tabela alto demais",
    ]);
    [3, 5, 7, 10, 12, 16].forEach((c) => (r.getCell(c).numFmt = brl));
    r.getCell(11).numFmt = "0.0%"; r.getCell(15).numFmt = "0.00%";
    r.alignment = { wrapText: true, vertical: "top" };
    if (!x.rebateAlvo) r.getCell(17).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
    else r.getCell(17).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    if (x.pzVis === 0) r.getCell(13).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO } };
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: h }];
  ws.autoFilter = { from: { row: h, column: 1 }, to: { row: h, column: cols.length } };
}

/* ═══ 1b ═══ */
{
  const ws = wb.addWorksheet("1b Prazo exclusivos");
  const cols = ["MLB", "SKU", "Produto", "Tipo", "Visitas 12s", "Vendas", "CONVERSÃO", "Receita 12s", "Preço no ar", "Piso", "Estoque", "Catálogo", "Ads hoje", "O QUE FAZER"];
  ws.columns = [{ width: 15 }, { width: 11 }, { width: 32 }, { width: 9 }, { width: 10 }, { width: 8 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 9 }, { width: 12 }, { width: 9 }, { width: 38 }];
  titulo(ws, "CONTA A PRAZO · EXCLUSIVOS COM POUCA VISITA E BOA CONVERSÃO", cols.length);
  txt(ws, [
    `${mov1b.length} anúncios que existem SÓ na conta a prazo, tiveram menos de 300 visitas em 12 semanas e convertem acima da média da operação (${(MEDIA * 100).toFixed(2)}%).`,
    "São os melhores candidatos a tráfego: já provaram que vendem quando alguém os encontra.",
  ], cols.length);
  const h = cab(ws, cols);
  for (const b of mov1b) {
    const r = ws.addRow([
      b.mlb, b.sku, String(b.titulo).slice(0, 30), b.tipo, b.vis, b.ven,
      b.conv / 100, b.rec, b.noAr, b.piso, b.estoque >= 40000 ? "sob enc." : b.estoque,
      b.catalogo || "—", b.adsInv,
      b.adsInv == null ? "ABRIR Ads: R$ 20/dia, medir em 14 dias." : `Já tem R$ ${b.adsInv} — subir enquanto o ACOS ficar abaixo de 20%.`,
    ]);
    r.getCell(7).numFmt = "0.00%";
    [8, 9, 10, 13].forEach((c) => (r.getCell(c).numFmt = brl));
    r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    r.alignment = { wrapText: true, vertical: "top" };
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: h }];
  ws.autoFilter = { from: { row: h, column: 1 }, to: { row: h, column: cols.length } };
}

/* ═══ 2 FAMÍLIAS ═══ */
{
  const ws = wb.addWorksheet("2 Famílias com Ads");
  const cols = ["Família", "Anúncios", "Investido", "Receita Ads", "ACOS", "Visitas", "Vendas", "MLB", "Tipo", "Preço no ar", "Piso", "Visitas", "Vendas", "Conversão", "Receita 12s", "Ads", "Receita Ads", "ACOS", "DECISÃO"];
  ws.columns = [{ width: 26 }, { width: 8 }, { width: 10 }, { width: 11 }, { width: 8 }, { width: 8 }, { width: 7 }, { width: 15 }, { width: 9 }, { width: 11 }, { width: 11 }, { width: 8 }, { width: 7 }, { width: 10 }, { width: 11 }, { width: 9 }, { width: 10 }, { width: 8 }, { width: 40 }];
  titulo(ws, "CONTA SÃO PAULO · O ADS GASTA NA FAMÍLIA, UM PRODUTO VENDE", cols.length);
  txt(ws, [
    `${fams.length} famílias com investimento em Ads na conta de São Paulo. Investido no total: R$ ${r2(soma(fams, (f) => f.inv)).toLocaleString("pt-BR")}, dos quais R$ ${r2(soma(fams, (f) => f.desperdicio)).toLocaleString("pt-BR")} (${r2((soma(fams, (f) => f.desperdicio) / soma(fams, (f) => f.inv)) * 100)}%) em anúncio que não vendeu nenhuma unidade.`,
    "MANTER (verde): vendeu no período, fica pelo histórico. TIRAR (vermelho): gastou e não vendeu. Os que vendem muito acima dos irmãos são candidatos a anúncio próprio, com tráfego direcionado só neles.",
  ], cols.length);
  const h = cab(ws, cols);
  let linha = h, zebra = false;
  for (const f of fams) {
    const inicio = linha + 1;
    for (const a of f.ans) {
      const vendeu = a.ven > 0;
      const gastaSemVender = (a.adsInv ?? 0) > 0 && (a.adsVen ?? 0) === 0;
      const campeao = f.campeao && a.mlb === f.campeao.mlb && f.comVenda >= 1;
      const dec = campeao ? `MANTER — é quem vende da família (R$ ${a.rec} em 12 semanas). Candidato a anúncio próprio com tráfego exclusivo.`
        : gastaSemVender ? `TIRAR o Ads — R$ ${a.adsInv} gastos, zero venda.`
        : vendeu ? "MANTER — vendeu no período, fica pelo histórico."
        : (a.adsInv ?? 0) > 0 ? "Avaliar: tem verba e não vendeu nesta janela." : "Sem verba e sem venda. Candidato a encerrar.";
      const r = ws.addRow([
        String(f.familia).slice(0, 24), f.n, f.inv, f.rec, f.acos != null ? f.acos / 100 : null, f.vis, f.ven,
        a.mlb, a.tipo, a.noAr, a.piso, a.vis, a.ven, a.conv != null ? a.conv / 100 : null, a.rec,
        a.adsInv, a.adsRec, a.adsAcos != null ? a.adsAcos / 100 : null, dec,
      ]);
      [3, 4, 10, 11, 15, 16, 17].forEach((c) => (r.getCell(c).numFmt = brl));
      [5, 14, 18].forEach((c) => (r.getCell(c).numFmt = "0.0%"));
      r.getCell(14).numFmt = "0.00%";
      r.alignment = { wrapText: true, vertical: "top" };
      if (zebra) for (let c = 1; c <= cols.length; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIXA } };
      if (campeao) { for (const c of [8, 19]) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } }; r.getCell(8).font = { bold: true }; r.getCell(19).font = { bold: true, color: { argb: "FF006100" } }; }
      else if (gastaSemVender) { r.getCell(19).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } }; r.getCell(19).font = { bold: true, color: { argb: "FFC00000" } }; }
      else if (vendeu) r.getCell(19).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      linha++;
    }
    if (f.ans.length > 1) for (const c of [1, 2, 3, 4, 5, 6, 7]) ws.mergeCells(inicio, c, linha, c);
    for (const c of [1, 2, 3, 4, 5, 6, 7]) ws.getCell(inicio, c).alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "center", wrapText: true };
    zebra = !zebra;
  }
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: h }];
  ws.autoFilter = { from: { row: h, column: 8 }, to: { row: h, column: cols.length } };
}

/* ═══ 3a e 3b ═══ */
const abaCatalogo = (nome, lista, descricao, decisaoFn) => {
  const ws = wb.addWorksheet(nome);
  const cols = ["SKU", "Produto", "Anúncios", "Visitas do produto", "Vendas", "Conversão do SKU", "MLB", "CONTA", "Tipo", "Catálogo", "Preço no ar", "Piso", "Visitas", "Vendas", "CONVERSÃO", "Ads", "DECISÃO"];
  ws.columns = [{ width: 11 }, { width: 26 }, { width: 9 }, { width: 11 }, { width: 8 }, { width: 11 }, { width: 15 }, { width: 11 }, { width: 9 }, { width: 12 }, { width: 11 }, { width: 11 }, { width: 9 }, { width: 8 }, { width: 11 }, { width: 9 }, { width: 44 }];
  titulo(ws, nome.toUpperCase(), cols.length);
  txt(ws, descricao, cols.length);
  const h = cab(ws, cols);
  let linha = h, zebra = false;
  for (const p of lista) {
    const inicio = linha + 1;
    for (const a of p.ans) {
      const ganha = a.catalogo === "winning";
      const r = ws.addRow([
        p.sku, String(p.titulo).slice(0, 24), p.n, p.vis, p.ven, p.conv != null ? p.conv / 100 : null,
        a.mlb, a.conta, a.tipo, a.catalogo || "—", a.noAr, a.piso,
        a.vis, a.ven, a.conv != null ? a.conv / 100 : null, a.adsInv, decisaoFn(p, a, ganha),
      ]);
      r.getCell(6).numFmt = "0.00%"; r.getCell(15).numFmt = "0.00%";
      [11, 12, 16].forEach((c) => (r.getCell(c).numFmt = brl));
      r.alignment = { wrapText: true, vertical: "top" };
      if (zebra) for (let c = 1; c <= cols.length; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIXA } };
      r.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: a.conta === "SP" ? CLARO : AMARELO } };
      if (ganha) { r.getCell(10).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } }; r.getCell(7).font = { bold: true }; }
      linha++;
    }
    if (p.ans.length > 1) for (const c of [1, 2, 3, 4, 5, 6]) ws.mergeCells(inicio, c, linha, c);
    for (const c of [1, 2, 3, 4, 5, 6]) ws.getCell(inicio, c).alignment = { vertical: "middle", horizontal: c <= 2 ? "left" : "center", wrapText: true };
    zebra = !zebra;
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: h }];
  ws.autoFilter = { from: { row: h, column: 7 }, to: { row: h, column: cols.length } };
};

abaCatalogo("3a Concentrar ajuda", split.ajuda, [
  `${split.ajuda.length} produtos de catálogo em que o anúncio que GANHA converte melhor que os irmãos. Concentrar aqui rende: somando todos, ${Math.round(soma(split.ajuda, (p) => p.ganhoVendas))} vendas a mais em 12 semanas se as visitas dos outros fossem para o que ganha.`,
  "Ação: desligar a promoção dos que não ganham, para parar de mandar visita para eles.",
], (p, a, ganha) => ganha
  ? `MANTER a promoção. Converte ${a.conv}% contra ${p.convResto}% dos irmãos.`
  : `DESLIGAR a promoção. Traz ${a.vis} visitas a ${a.conv ?? 0}% enquanto o que ganha faz ${p.convGanha}%.`);

abaCatalogo("3b Concentrar prejudica", split.prejudica, [
  `${split.prejudica.length} produtos em que quem NÃO ganha o catálogo converte MELHOR que quem ganha. Aqui a regra se inverte: desligar a promoção dos irmãos tiraria visita de quem vende melhor.`,
  "Isto não estava previsto na ideia original, e é o motivo de a planilha separar os dois casos em vez de aplicar a regra nos 98 produtos.",
], (p, a, ganha) => ganha
  ? `NÃO é o melhor do grupo: converte ${a.conv ?? 0}% e os irmãos fazem ${p.convResto}%. Rever preço e oferta DESTE antes de concentrar nele.`
  : a.conv && p.convGanha != null && a.conv > p.convGanha
    ? `MANTER a promoção: converte ${a.conv}%, melhor que o ${p.convGanha}% de quem ganha o catálogo.`
    : "Manter por enquanto. Pouca visita para decidir.");

await wb.xlsx.writeFile("output/PROBEL-movimentacoes.xlsx");
console.log("escrito: output/PROBEL-movimentacoes.xlsx");
console.log("  abas: " + wb.worksheets.map((w) => w.name).join(" · "));
console.log(`  piso acima do preço que vendia: ${acima.length} SKUs`);
console.log(`  1a=${mov1a.length} · 1b=${mov1b.length} · famílias=${fams.length} · 3a=${split.ajuda.length} · 3b=${split.prejudica.length}`);
