/**
 * A planilha da Black Friday, no formato da que o Mercado Livre mandou.
 *
 * Três origens na mesma tabela, com a coluna ORIGEM separando:
 *   - os 30 que o canal sugeriu, na aba 11-BLACK FRIDAY 2026;
 *   - os nossos, que vieram de oito meses de venda;
 *   - a linha Boa Forma, que é para trabalhar e vai destacada.
 *
 * ── Os preços ──
 *
 * Saem da aba "Preços por rebate" que ele mantém: ela dá, por MLB, o
 * preço com 5%, 6%, 7% e 8% de rebate, com passo constante entre faixas.
 *
 *   Campanha do mês (01/11 a 20/11) ....... preço com 6% de rebate
 *   Black Week (21/11 a 29/11) ............ esse mesmo preço, menos 5%
 *                                            nossos
 *   Relâmpago (11/11) ..................... preço com 8% de rebate
 *
 * No CLÁSSICO a tabela não tem coluna de 8%: 11,5% de comissão menos 8
 * pontos daria 3,5%, que não existe na Fórmula base. Como o passo entre
 * as faixas é exatamente constante nas 1.256 linhas, o 8% do clássico é
 * a continuação da própria tabela dele — e a célula vem marcada para
 * ninguém confundir com número que veio pronto.
 *
 * ── O crível ──
 *
 * O canal publica um "crível" por anúncio: abaixo dele ele considera a
 * oferta pouco crível e recusa. Onde o nosso preço de 8% fica ACIMA do
 * crível, a regra do Eduardo é aceitar o crível até 5% de diferença
 * (célula em vermelho); passando disso, mantém o nosso e a coluna ao
 * lado diz quanto faltaria baixar para alcançá-lo.
 *
 * Uso: node scripts/local/black-friday.mjs
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const d = JSON.parse(readFileSync("scratchpad/bf/probel.json", "utf8"));
const tabela = JSON.parse(readFileSync("scratchpad/bf/precos-rebate.json", "utf8"));
const meli = JSON.parse(readFileSync("scratchpad/bf/bf-meli.json", "utf8"));
const nm = (s) => String(s ?? "").trim().toUpperCase();
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

const SKUS_BOA_FORMA = new Set(["PAA8725","PAA8728","PAA8770","PAA8631","PAA8820","PAB0008","PAA8635","PAA8767","PAA8643","PAA8642","PAB0007","PAA8627","PAA8823","PAA8824","PAA8639"]);

const porMlbTab = new Map(tabela.map((l) => [nm(l.mlb), l]));
const A = new Map(d.anuncios.map((a) => [nm(a.codigo_externo), a]));
const porId = new Map(d.anuncios.map((a) => [a.id, a]));

/* ── Desempenho ── */
const venda = new Map();
for (const i of d.itens) {
  if (!i.anuncio_id) continue;
  const g = venda.get(i.anuncio_id) ?? { q: 0, r: 0, precos: [] };
  g.q += Number(i.quantidade) || 0;
  g.r += Number(i.total) || 0;
  if (Number(i.preco_unitario) > 0) g.precos.push({ p: r2(Number(i.preco_unitario)), q: Number(i.quantidade) || 0, data: i.data });
  venda.set(i.anuncio_id, g);
}
const visita = new Map();
for (const s of d.semanal) {
  const g = visita.get(s.anuncio_id) ?? { vis: 0, ven: 0 };
  g.vis += Number(s.visitas) || 0; g.ven += Number(s.vendas) || 0;
  visita.set(s.anuncio_id, g);
}
/* Últimas 8 semanas, para dizer se ainda está performando. */
const semanasOrdenadas = [...new Set(d.semanal.map((s) => `${s.ano_iso}-${String(s.semana_iso).padStart(2, "0")}`))].sort();
const ULTIMAS = new Set(semanasOrdenadas.slice(-8));
const recente = new Map();
for (const s of d.semanal) {
  if (!ULTIMAS.has(`${s.ano_iso}-${String(s.semana_iso).padStart(2, "0")}`)) continue;
  const g = recente.get(s.anuncio_id) ?? { vis: 0, ven: 0 };
  g.vis += Number(s.visitas) || 0; g.ven += Number(s.vendas) || 0;
  recente.set(s.anuncio_id, g);
}
const noAr = new Map();
for (const x of [...d.diario].sort((a, b) => String(a.data).localeCompare(String(b.data))))
  if (Number(x.preco) > 0) noAr.set(x.anuncio_id, Number(x.preco));
/* Catálogo: a leitura mais recente de cada anúncio. */
const cat = new Map();
for (const c of [...d.catalogo].sort((a, b) => String(a.data).localeCompare(String(b.data)))) cat.set(c.anuncio_id, c);

const melhorPreco = (id) => {
  const g = venda.get(id);
  if (!g?.precos.length) return null;
  const m = new Map();
  for (const p of g.precos) m.set(p.p, (m.get(p.p) ?? 0) + p.q);
  const [preco, q] = [...m].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return { preco, unidades: q };
};

/** Casal, Solteiro, Queen… direto do título, que é onde o tamanho está. */
const MODELOS = ["Super King", "King", "Queen", "Casal", "Solteiro", "Viúva", "Beliche", "Berço", "Univalente"];
const modeloDe = (titulo) => MODELOS.find((m) => nm(titulo).includes(nm(m))) ?? "—";

/**
 * A Boa Forma usa a tabela MAIS ANTIGA, a pedido dele.
 *
 * A Fórmula base da Probel tem duas vigências para esses SKUs: 10/09 e
 * 30/09, e a de 30/09 é cerca de 10% mais barata. A aba "Preços por
 * rebate" foi montada em cima da nova, então para a Boa Forma o preço
 * sai daqui, da de 10/09 — é o piso mais alto, que é o que ele quer
 * defender nessa linha.
 */
const baseBoa = JSON.parse(readFileSync("scratchpad/bf/base-boaforma.json", "utf8"));
function precoRebateBoaForma(sku, tipo, pontos) {
  const t = baseBoa.tabela[`${nm(sku)}|sku`];
  if (!t) return null;
  const cheia = tipo === "Premium" ? 0.165 : 0.115;
  const bandas = Object.keys(t).map(Number).sort((a, b) => a - b);
  const passo = (t[bandas[1]] - t[bandas[0]]) / (bandas[1] - bandas[0]) / 100; // por ponto
  const alvo = Math.round((cheia - pontos / 100) * 1000) / 1000;
  const exata = t[alvo];
  if (exata != null) return { valor: r2(exata), extrapolado: false };
  /* Abaixo da faixa mais barata: continua a tabela no mesmo passo. A
     Fórmula base é uma reta — o passo não varia um centavo em dezesseis
     intervalos — então 3,5% é a reta dela um ponto adiante. */
  const menor = bandas[0];
  return { valor: r2(t[menor] - passo * 100 * (menor - alvo)), extrapolado: true };
}

/** O preço com N pontos de rebate, pela tabela dele. */
function precoRebate(tab, pontos) {
  if (!tab?.r5 || !tab?.r6) return null;
  const passo = tab.r5 - tab.r6;              // igual em todas as 1.256 linhas
  const direto = { 5: tab.r5, 6: tab.r6, 7: tab.r7, 8: tab.r8 }[pontos];
  if (direto) return { valor: r2(direto), extrapolado: false };
  return { valor: r2(tab.r5 - passo * (pontos - 5)), extrapolado: true };
}

/* ── Quem entra ── */
const linhas = [];
const jaTem = new Set();

for (const b of meli) {
  const a = A.get(nm(b.mlb));
  linhas.push({ origem: "Mercado Livre", mlb: nm(b.mlb), anuncio: a, nmvCanal: b.nmv, precoDe: b.precoDe, crivelCanal: b.crivelRel });
  jaTem.add(nm(b.mlb));
}

/* Os nossos: melhor clássico de cada SKU em cada conta, ativo, com
   estoque e com venda nos oito meses. */
const porSku = new Map();
for (const a of d.anuncios) {
  if (a.status !== "ativo" || !(Number(a.estoque) > 0)) continue;
  if (String(a.tipo || "").toLowerCase().startsWith("prem")) continue;
  const g = venda.get(a.id) ?? { q: 0, r: 0 };
  /* Uma venda em oito meses não é sinal — salvo na Boa Forma, que entra
     inteira por ser linha a trabalhar, vendendo ou não. */
  if (g.q < 2 && !SKUS_BOA_FORMA.has(nm(a.sku_canal))) continue;
  const k = `${nm(a.sku_canal)}|${a.conta}`;
  const atual = porSku.get(k);
  if (!atual || g.r > (venda.get(atual.id)?.r ?? 0)) porSku.set(k, a);
}
for (const a of [...porSku.values()].sort((x, y) => (venda.get(y.id)?.r ?? 0) - (venda.get(x.id)?.r ?? 0))) {
  if (jaTem.has(nm(a.codigo_externo))) continue;
  const boa = SKUS_BOA_FORMA.has(nm(a.sku_canal));
  linhas.push({ origem: boa ? "Boa Forma" : "Nossa sugestão", mlb: nm(a.codigo_externo), anuncio: a });
  jaTem.add(nm(a.codigo_externo));
}

/* ── Monta cada linha ── */
const REBATE_MES = 6, REBATE_RELAMPAGO = 8, NOSSO_BLACK_WEEK = 0.05, TOLERANCIA_CRIVEL = 0.05;

const montadas = linhas.map((l) => {
  const a = l.anuncio;
  const tab = porMlbTab.get(l.mlb) ?? null;
  const g = a ? venda.get(a.id) ?? { q: 0, r: 0 } : { q: 0, r: 0 };
  const f = a ? visita.get(a.id) ?? { vis: 0, ven: 0 } : { vis: 0, ven: 0 };
  const rec = a ? recente.get(a.id) ?? { vis: 0, ven: 0 } : { vis: 0, ven: 0 };
  const c = a ? cat.get(a.id) : null;

  const skuAqui = nm(a?.sku_canal ?? tab?.sku ?? "");
  const tipoAqui = tab?.tipo ?? (a && String(a.tipo || "").toLowerCase().startsWith("prem") ? "Premium" : "Clássico");
  const daBoa = SKUS_BOA_FORMA.has(skuAqui);
  const mes = daBoa ? precoRebateBoaForma(skuAqui, tipoAqui, REBATE_MES) ?? precoRebate(tab, REBATE_MES) : precoRebate(tab, REBATE_MES);
  const rel = daBoa ? precoRebateBoaForma(skuAqui, tipoAqui, REBATE_RELAMPAGO) ?? precoRebate(tab, REBATE_RELAMPAGO) : precoRebate(tab, REBATE_RELAMPAGO);
  const week = mes ? { valor: r2(mes.valor * (1 - NOSSO_BLACK_WEEK)), extrapolado: mes.extrapolado } : null;
  const crivel = l.crivelCanal ?? tab?.crivelRel ?? null;

  /*
   * O confronto com o crível — que informa, mas não manda no preço.
   *
   * A oferta do relâmpago é sempre o NOSSO preço com 8% de rebate. O
   * crível entra na coluna ao lado dizendo o que aconteceria: se o nosso
   * já cabe embaixo dele, se dá para aceitar o dele dentro dos 5% de
   * tolerância, ou quanto faltaria baixar para alcançá-lo.
   */
  const relFinal = rel?.valor ?? null;
  let aceitouCrivel = false, faltaPct = null;
  if (rel?.valor != null && crivel != null && rel.valor > crivel + 0.01) {
    const gap = (rel.valor - crivel) / rel.valor;
    if (gap <= TOLERANCIA_CRIVEL) aceitouCrivel = true;
    else faltaPct = gap;
  }

  return {
    ...l,
    conta: a?.conta === "São Paulo — pronta entrega" ? "São Paulo" : a?.conta === "2ª conta — venda a prazo" ? "A prazo" : (tab?.conta === "Cotia" ? "São Paulo" : tab?.conta === "Proncipal" ? "A prazo" : "—"),
    tipo: tab?.tipo ?? (a ? (String(a.tipo || "").toLowerCase().startsWith("prem") ? "Premium" : "Clássico") : "—"),
    sku: nm(a?.sku_canal ?? tab?.sku ?? ""),
    titulo: a?.titulo ?? tab?.produto ?? "",
    modelo: modeloDe(a?.titulo ?? tab?.produto ?? ""),
    status: a?.status ?? "—", estoque: a?.estoque ?? null,
    precoNoAr: a ? (noAr.get(a.id) ?? (Number(a.preco_atual) || null)) : null,
    /* O "Preço De" do canal é o preço cheio, e bate com o cadastro nosso
       até o arredondamento — então nas linhas que não vieram da planilha
       dele o cadastro ocupa o lugar. */
    precoDe: l.precoDe ?? (a ? Number(a.preco_atual) || null : null),
    nmv: l.nmvCanal ?? r2(g.r),
    unidades: g.q, receita: r2(g.r), visitas: f.vis,
    venRecente: rec.ven, visRecente: rec.vis,
    melhor: a ? melhorPreco(a.id) : null,
    catalogo: c?.situacao ?? "", paraGanhar: c?.preco_para_ganhar ?? null,
    mes, week, rel, relFinal, aceitouCrivel, faltaPct, crivel, tab,
  };
});

/* Dentro da Boa Forma, quem mais vendeu leva a estrela. */
const boas = montadas.filter((m) => m.origem === "Boa Forma").sort((a, b) => b.unidades - a.unidades);
for (const m of boas.slice(0, 5)) if (m.unidades > 0) m.destaqueBoaForma = true;

/* ── A observação, com o porquê junto ── */
const vendasOrdenadas = montadas.map((m) => m.unidades).sort((a, b) => b - a);
const corte20 = vendasOrdenadas[Math.floor(vendasOrdenadas.length * 0.2)] ?? 0;
for (const m of montadas) {
  const preco = m.mes?.valor ?? null;
  /* Duas leituras do catálogo, e as duas importam: como ele está HOJE
     (`winning`) e se o preço da campanha segura a posição (`preco_para_
     ganhar`). Um anúncio pode estar ganhando agora e perder quando o
     preço subir para o da campanha. */
  const ganhaHoje = m.catalogo === "winning";
  const seguraComOPreco = preco != null && m.paraGanhar != null && preco <= m.paraGanhar;
  const vendeMuito = m.unidades >= Math.max(corte20, 5);
  m.classe = (ganhaHoje || seguraComOPreco) && vendeMuito ? "SUPER KILLER"
    : (ganhaHoje || seguraComOPreco || vendeMuito) ? "KILLER" : "APOSTA";
  const razao = [];
  if (ganhaHoje) razao.push("ganha o catálogo hoje");
  if (m.paraGanhar != null) razao.push(seguraComOPreco
    ? `o preço da campanha segura a posição (precisa ${m.paraGanhar.toFixed(2)})`
    : `o preço da campanha perde o catálogo (precisa ${m.paraGanhar.toFixed(2)})`);
  else if (!ganhaHoje) razao.push("sem leitura de catálogo");
  if (m.unidades) razao.push(`${m.unidades} un em 8 meses`); else razao.push("sem venda em 8 meses");
  if (m.status !== "ativo") razao.push(`ANÚNCIO ${String(m.status).toUpperCase()}`);
  else if (!(Number(m.estoque) > 0)) razao.push("SEM ESTOQUE");
  m.observacao = `Preço exclusivo ML · ${m.classe} — ${razao.join(" · ")}`;
}

/* ── A planilha ── */
const AZUL = "FF1F3864", VERDE = "FFC6EFCE", VERMELHO = "FFFFC7CE", AMARELO = "FFFFEB9C", ROXO = "FFE4D9F5", CINZA = "FFF2F2F2";
const brl = '"R$ "#,##0.00';
const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";
const ws = wb.addWorksheet("BLACK FRIDAY 2026");

const COLS = [
  ["ORIGEM", 15], ["MLB", 15], ["OBSERVAÇÃO", 52], ["ITEM ID", 13], ["CONTA", 11], ["TIPO", 10],
  ["Título", 44], ["MODELO", 11], ["NMV (R$)", 13], ["Melhor preço vendido", 14], ["Preço De", 12], ["Preço no ar hoje", 13],
  ["Campanha Mês (01/11 a 20/11)", 14], ["Rebate (R$)", 12], ["Rebate (%)", 10], ["Retorno Meli", 12],
  ["Crível relâmpago", 13], ["11/11 relâmpago", 14], ["Crível × nosso 8%", 17], ["Rebate (R$)", 12], ["Rebate (%)", 10], ["Retorno Meli", 12],
  ["Black Week (21/11 a 29/11)", 14], ["Rebate (R$)", 12], ["Rebate (%)", 10], ["Retorno Meli", 12],
  ["Cyber Monday (30/11)", 14], ["Rebate (R$)", 12], ["Rebate (%)", 10], ["Retorno Meli", 12],
  ["Unid. 8 meses", 11], ["Visitas", 10], ["Vendas 8 sem.", 11], ["Estoque", 9], ["Catálogo", 11], ["Preço p/ ganhar", 13],
];
ws.columns = COLS.map(([, w]) => ({ width: w }));

const t1 = ws.addRow(["PROBEL · BLACK FRIDAY 2026"]);
t1.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
t1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
t1.height = 28; ws.mergeCells(1, 1, 1, COLS.length); t1.alignment = { vertical: "middle", indent: 1 };

for (const linha of [
  "Campanha do mês = preço com 6% de rebate. Black Week = esse preço menos 5% nossos. Relâmpago 11/11 = preço com 8% de rebate. Tudo pela aba Preços por rebate.",
  "No clássico a tabela não tem a coluna de 8% — 11,5% menos 8 pontos daria 3,5%, que não existe na Fórmula base. O passo entre as faixas é constante, então o 8% do clássico é a continuação da própria tabela, e vem marcado em amarelo.",
  "Crível × nosso 8%: onde o nosso preço fica acima do crível do canal, aceitamos o crível até 5% de diferença (célula em vermelho). Acima disso fica o nosso preço, e a coluna diz quanto faltaria baixar.",
]) {
  const r = ws.addRow([linha]);
  ws.mergeCells(r.number, 1, r.number, COLS.length);
  r.alignment = { wrapText: true, vertical: "top" };
  r.height = 15;
}

const hr = ws.addRow(COLS.map(([n]) => n));
hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
hr.alignment = { vertical: "middle", wrapText: true, horizontal: "center" };
hr.height = 44;
const H = hr.number;

const ordem = { "Mercado Livre": 0, "Nossa sugestão": 1, "Boa Forma": 2 };
montadas.sort((a, b) => ordem[a.origem] - ordem[b.origem] || (b.nmv ?? 0) - (a.nmv ?? 0));

for (const m of montadas) {
  const rebateReais = (p) => (p == null ? null : r2(p * REBATE_MES / 100));
  const r = ws.addRow([
    m.origem, m.mlb, m.observacao, m.mlb.replace(/^MLB/i, ""), m.conta, m.tipo,
    String(m.titulo).slice(0, 60), m.modelo, m.nmv, m.melhor?.preco ?? null, m.precoDe, m.precoNoAr,
    m.mes?.valor ?? null, rebateReais(m.mes?.valor), REBATE_MES / 100, "",
    m.crivel, m.relFinal, m.faltaPct != null ? m.faltaPct : (m.aceitouCrivel ? "dá para aceitar o crível" : "cabe no nosso preço"),
    m.rel?.valor != null ? r2(m.relFinal * REBATE_RELAMPAGO / 100) : null, REBATE_RELAMPAGO / 100, "",
    m.week?.valor ?? null, rebateReais(m.week?.valor), REBATE_MES / 100, "",
    null, null, null, "",
    m.unidades, m.visitas, m.venRecente, m.estoque >= 40000 ? "sob enc." : m.estoque, m.catalogo || "—", m.paraGanhar,
  ]);
  for (const c of [9, 10, 11, 12, 13, 14, 17, 18, 20, 23, 24, 27, 28, 36]) r.getCell(c).numFmt = brl;
  for (const c of [15, 21, 25, 29]) r.getCell(c).numFmt = "0%";
  if (typeof r.getCell(19).value === "number") r.getCell(19).numFmt = "0.0%";

  if (m.origem === "Boa Forma") {
    for (let c = 1; c <= COLS.length; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROXO } };
    /* Os que mais performaram da linha vêm em negrito — é o destaque
       que ele pediu para saber onde apoiar. */
    if (m.destaqueBoaForma) { r.font = { bold: true }; r.getCell(1).value = "Boa Forma ★"; }
  }
  if (m.aceitouCrivel) { r.getCell(18).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } }; r.getCell(19).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } }; }
  else if (m.faltaPct != null) r.getCell(19).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO } };
  else if (m.rel?.extrapolado) r.getCell(18).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO } };
  if (m.classe === "SUPER KILLER") r.getCell(3).font = { bold: true, color: { argb: "FF087D6B" } };
  if (m.status !== "ativo" || !(Number(m.estoque) > 0)) {
    r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
    r.getCell(34).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
  }
  if (m.catalogo === "winning") r.getCell(35).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
}

ws.views = [{ state: "frozen", xSplit: 2, ySplit: H }];
ws.autoFilter = { from: { row: H, column: 1 }, to: { row: H, column: COLS.length } };

await wb.xlsx.writeFile("output/PROBEL-Black-Friday-2026.xlsx");
const porOrigem = {};
for (const m of montadas) porOrigem[m.origem] = (porOrigem[m.origem] ?? 0) + 1;
const classes = {};
for (const m of montadas) classes[m.classe] = (classes[m.classe] ?? 0) + 1;
console.log("escrito: output/PROBEL-Black-Friday-2026.xlsx");
console.log("  linhas por origem:", JSON.stringify(porOrigem));
console.log("  classificação:", JSON.stringify(classes));
console.log("  aceitaram o crível:", montadas.filter((m) => m.aceitouCrivel).length);
console.log("  acima do crível por mais de 5%:", montadas.filter((m) => m.faltaPct != null).length);
console.log("  8% extrapolado (clássico):", montadas.filter((m) => m.rel?.extrapolado).length);
console.log("  pausados ou sem estoque:", montadas.filter((m) => m.status !== "ativo" || !(Number(m.estoque) > 0)).length);
