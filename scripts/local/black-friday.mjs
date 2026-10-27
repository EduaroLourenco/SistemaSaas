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
/* A mesma janela do NMV do canal: quatro meses. */
const NMV_DESDE = "2026-06-27";
const venda4m = new Map();
for (const i of d.itens) {
  if (!i.anuncio_id || !i.data || i.data < NMV_DESDE) continue;
  venda4m.set(i.anuncio_id, (venda4m.get(i.anuncio_id) ?? 0) + (Number(i.total) || 0));
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
    /* O NMV do canal cobre QUATRO meses — conferido contra a nossa receita
       nos 30 MLBs dele, onde quatro meses erra 13% e as janelas vizinhas
       erram de 25% a 118%. Nas linhas que somos nós que trazemos, o NMV
       sai da mesma janela, senão a coluna compara coisas diferentes. */
    nmv: l.nmvCanal ?? r2(venda4m.get(a?.id) ?? 0),
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
  m.motivo = razao.join(" · ");
}

/* ── A planilha, na paleta e nas regras da que o canal mandou ──
   Teal na identificação, azul na campanha do mês, roxo no relâmpago,
   preto na Black Week, cinza no Cyber Monday, e a faixa âmbar com
   PREECHER em vermelho sobre as colunas que a gente preenche.

   OBSERVAÇÃO e Retorno Meli são listas fechadas na planilha dele, com
   validação na célula. Então vai o valor exato da lista e mais nada —
   o porquê da classificação foi para uma coluna ao lado, que é nossa. */
const T_IDENT = "FF134F5C", T_EXTRA = "FF45818E", T_MES = "FF3C78D8", T_REL = "FF674EA7",
      T_WEEK = "FF000000", T_CYBER = "FF666666", T_PREENCHER = "FFF1C232", VERMELHO_TXT = "FFCC0000";
/* As tintas claras da mesma paleta, para marcar célula no corpo. */
const L_VERMELHO = "FFF4CCCC", L_AMARELO = "FFFFF2CC", L_VERDE = "FFD9EAD3", L_ROXO = "FFD9D2E9";
const brl = '"R$ "#,##0.00';
const ARIAL = { name: "Arial", size: 10 };

/* As listas, copiadas da validação das células dele. */
const LISTA_OBS = '"Preço Exclusivo Meli|Super Killer,Preço Exclusivo Meli|Killer,Preço Exclusivo Meli|Aposta"';
const LISTA_RETORNO = '"Campanha Cadastrada,Crível,Margem Meli"';
const dv = (lista) => ({ type: "list", allowBlank: true, showErrorMessage: true, formulae: [lista] });
const OBS = { "SUPER KILLER": "Preço Exclusivo Meli|Super Killer", KILLER: "Preço Exclusivo Meli|Killer", APOSTA: "Preço Exclusivo Meli|Aposta" };

const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";
const ws = wb.addWorksheet("BLACK FRIDAY 2026");

/** [rótulo, largura, cor do bloco, leva a faixa PREECHER] */
const COLS = [
  ["ORIGEM", 15, T_IDENT], ["MLB", 15, T_IDENT], ["OBSERVAÇÃO", 28, T_IDENT, true], ["Por que essa classificação", 56, T_EXTRA],
  ["ITEM ID", 13, T_IDENT], ["CONTA", 11, T_IDENT], ["TIPO", 10, T_IDENT],
  ["Título", 46, T_IDENT], ["MODELO", 11, T_IDENT], ["NMV (R$)", 13, T_IDENT],
  ["Melhor preço vendido", 14, T_IDENT], ["Preço De", 12, T_IDENT], ["Preço no ar hoje", 13, T_IDENT],
  ["Campanha Mês (01/11 a 20/11)", 15, T_MES, true], ["Rebate (R$)", 12, T_MES], ["Rebate (%)", 10, T_MES], ["Retorno Meli", 14, T_MES],
  ["Crível relampago", 14, T_REL], ["11/11", 14, T_REL, true], ["Crível × nosso 8%", 17, T_REL],
  ["Rebate (R$)", 12, T_REL], ["Rebate (%)", 10, T_REL], ["Retorno Meli", 14, T_REL],
  ["Black Week (21/11 a 29/11)", 15, T_WEEK, true], ["Rebate (R$)", 12, T_WEEK], ["Rebate (%)", 10, T_WEEK], ["Retorno Meli", 14, T_WEEK],
  ["Cyber Monday (30/11)", 14, T_CYBER, true], ["Rebate (R$)", 12, T_CYBER], ["Rebate (%)", 10, T_CYBER], ["Retorno Meli", 14, T_CYBER],
  ["Unid. 8 meses", 11, T_EXTRA], ["Visitas", 10, T_EXTRA], ["Vendas 8 sem.", 11, T_EXTRA],
  ["Estoque", 9, T_EXTRA], ["Catálogo", 11, T_EXTRA], ["Preço p/ ganhar", 13, T_EXTRA],
];
const C = {
  obs: 3, porque: 4, nmv: 10, melhor: 11, precoDe: 12, noAr: 13,
  mes: 14, mesR$: 15, mesPct: 16, mesRet: 17,
  crivel: 18, rel: 19, versus: 20, relR$: 21, relPct: 22, relRet: 23,
  week: 24, weekR$: 25, weekPct: 26, weekRet: 27,
  cyber: 28, cyberR$: 29, cyberPct: 30, cyberRet: 31,
  estoque: 35, catalogo: 36, paraGanhar: 37,
};
ws.columns = COLS.map(([, w]) => ({ width: w }));

/* Linha 1: a faixa PREECHER, só sobre o que a gente preenche. */
const faixa = ws.addRow(COLS.map(([, , , p]) => (p ? "PREECHER" : null)));
COLS.forEach(([, , , p], i) => {
  const c = faixa.getCell(i + 1);
  c.font = { ...ARIAL, bold: true, color: { argb: p ? VERMELHO_TXT : "FF000000" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: p ? T_PREENCHER : "FFFFFFFF" } };
  c.alignment = { horizontal: "center" };
});

/* Linha 2: o cabeçalho, cada bloco na sua cor. */
const hr = ws.addRow(COLS.map(([n]) => n));
COLS.forEach(([, , cor], i) => {
  const c = hr.getCell(i + 1);
  c.font = { ...ARIAL, bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
  c.alignment = { vertical: "middle", wrapText: true, horizontal: "center" };
});
hr.height = 42;
const H = hr.number;

const ordem = { "Mercado Livre": 0, "Nossa sugestão": 1, "Boa Forma": 2 };
montadas.sort((a, b) => ordem[a.origem] - ordem[b.origem] || (b.nmv ?? 0) - (a.nmv ?? 0));

for (const m of montadas) {
  const rebateReais = (p) => (p == null ? null : r2(p * REBATE_MES / 100));
  const r = ws.addRow([
    m.origem, m.mlb, OBS[m.classe], m.motivo, m.mlb.replace(/^MLB/i, ""), m.conta, m.tipo,
    String(m.titulo).slice(0, 60), m.modelo, m.nmv, m.melhor?.preco ?? null, m.precoDe, m.precoNoAr,
    m.mes?.valor ?? null, rebateReais(m.mes?.valor), REBATE_MES / 100, "",
    m.crivel, m.relFinal, m.faltaPct != null ? m.faltaPct : (m.aceitouCrivel ? "dá para aceitar o crível" : "cabe no nosso preço"),
    m.rel?.valor != null ? r2(m.relFinal * REBATE_RELAMPAGO / 100) : null, REBATE_RELAMPAGO / 100, "",
    m.week?.valor ?? null, rebateReais(m.week?.valor), REBATE_MES / 100, "",
    null, null, null, "",
    m.unidades, m.visitas, m.venRecente, m.estoque >= 40000 ? "sob enc." : m.estoque, m.catalogo || "—", m.paraGanhar,
  ]);
  r.font = ARIAL;
  for (const c of [C.nmv, C.melhor, C.precoDe, C.noAr, C.mes, C.mesR$, C.crivel, C.rel, C.relR$, C.week, C.weekR$, C.cyber, C.cyberR$, C.paraGanhar]) r.getCell(c).numFmt = brl;
  for (const c of [C.mesPct, C.relPct, C.weekPct, C.cyberPct]) r.getCell(c).numFmt = "0%";
  if (typeof r.getCell(C.versus).value === "number") r.getCell(C.versus).numFmt = "0.0%";
  r.getCell(C.porque).alignment = { wrapText: true, vertical: "top" };

  /* As listas fechadas, como na planilha dele. */
  r.getCell(C.obs).dataValidation = dv(LISTA_OBS);
  for (const c of [C.mesRet, C.relRet, C.weekRet, C.cyberRet]) r.getCell(c).dataValidation = dv(LISTA_RETORNO);

  if (m.origem === "Boa Forma") {
    for (let c = 1; c <= COLS.length; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: L_ROXO } };
    /* Os que mais performaram da linha vêm em negrito — é o destaque que
       ele pediu para saber onde apoiar. */
    if (m.destaqueBoaForma) { r.font = { ...ARIAL, bold: true }; r.getCell(1).value = "Boa Forma ★"; }
  }
  if (m.aceitouCrivel) for (const c of [C.crivel, C.versus]) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: L_VERMELHO } };
  else if (m.faltaPct != null) r.getCell(C.versus).fill = { type: "pattern", pattern: "solid", fgColor: { argb: L_AMARELO } };
  if (m.rel?.extrapolado) r.getCell(C.rel).fill = { type: "pattern", pattern: "solid", fgColor: { argb: L_AMARELO } };
  if (m.classe === "SUPER KILLER") r.getCell(C.obs).font = { ...ARIAL, bold: true, color: { argb: "FF38761D" } };
  if (m.status !== "ativo" || !(Number(m.estoque) > 0)) {
    r.getCell(C.porque).fill = { type: "pattern", pattern: "solid", fgColor: { argb: L_VERMELHO } };
    r.getCell(C.porque).font = { ...ARIAL, bold: true, color: { argb: VERMELHO_TXT } };
    r.getCell(C.estoque).fill = { type: "pattern", pattern: "solid", fgColor: { argb: L_VERMELHO } };
  }
  if (m.catalogo === "winning") r.getCell(C.catalogo).fill = { type: "pattern", pattern: "solid", fgColor: { argb: L_VERDE } };
}

ws.views = [{ state: "frozen", xSplit: 2, ySplit: H }];
ws.autoFilter = { from: { row: H, column: 1 }, to: { row: H, column: COLS.length } };

/* As explicações saem da aba principal: ela tem de poder ser colada na
   planilha do canal sem nada em volta. */
const notas = wb.addWorksheet("Como ler");
notas.columns = [{ width: 28 }, { width: 108 }];
const tn = notas.addRow(["PROBEL · BLACK FRIDAY 2026", ""]);
tn.font = { ...ARIAL, bold: true, size: 14, color: { argb: "FFFFFFFF" } };
tn.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T_IDENT } };
tn.height = 26;
notas.mergeCells(1, 1, 1, 2);
for (const [rotulo, texto] of [
  ["OBSERVAÇÃO", "É a lista fechada da sua planilha: Preço Exclusivo Meli|Super Killer, |Killer ou |Aposta. A célula mantém a validação, então dá para trocar pelo dropdown."],
  ["Por que essa classificação", "Coluna nossa, fora da lista do canal: o motivo da classificação em uma linha. Apague antes de mandar, se quiser."],
  ["Super killer / killer / aposta", "Super killer: ganha o catálogo e está entre os que mais vendem. Killer: uma das duas. Aposta: nenhuma das duas."],
  ["Retorno Meli", "Também é lista fechada: Campanha Cadastrada, Crível ou Margem Meli. Deixei em branco — é o canal que responde."],
  ["Campanha do mês", "Preço com 6% de rebate, da aba Preços por rebate."],
  ["Black Week", "O preço da campanha do mês menos 5% nossos."],
  ["11/11 relâmpago", "Preço com 8% de rebate. É sempre o nosso preço — o crível não manda nesta coluna."],
  ["Clássico a 8%", "A tabela não tem coluna de 8% no clássico: 11,5% menos 8 pontos daria 3,5%, que não existe na Fórmula base. O passo entre faixas é constante nas 1.256 linhas, então o 8% do clássico é a continuação da mesma reta. Essas células vêm em amarelo."],
  ["Crível × nosso 8%", "Cabe no nosso preço = já estamos abaixo do crível. Dá para aceitar o crível (vermelho) = estamos acima dele, dentro dos 5% de tolerância. Um percentual (amarelo) = passou dos 5%, e é quanto faltaria baixar para alcançá-lo."],
  ["Boa Forma", "Usa a Fórmula base de 10/09, a mais antiga que tem esses SKUs — a de 30/09 é cerca de 10% mais barata. Linhas em roxo; a estrela marca os cinco que mais venderam."],
  ["Vermelho no porquê", "Anúncio pausado ou sem estoque. São sugestões do próprio canal, por isso ficaram na lista."],
  ["NMV (R$)", "Quatro meses, de 27/06 a 27/10 — a mesma janela do NMV que o canal usa na planilha dele. Confirmado comparando o número dele com a nossa receita nos 30 MLBs: quatro meses erra 13%, e as janelas vizinhas erram de 25% a 118%."],
  ["Unidades e receita", "As colunas de contexto (Unid. 8 meses, Visitas) são de oito meses, desde 27/02/2026 — janela maior de propósito, para enxergar quem já vendeu bem e esfriou. As visitas vêm do relatório semanal."],
  ["Preço no ar hoje", "O preço do último dia medido, que não é o de cadastro — o Preço De é o cheio."],
]) {
  const r = notas.addRow([rotulo, texto]);
  r.getCell(1).font = { ...ARIAL, bold: true };
  r.getCell(1).alignment = { vertical: "top" };
  r.getCell(2).font = ARIAL;
  r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  r.height = Math.max(15, Math.ceil(texto.length / 100) * 14);
}

await wb.xlsx.writeFile("output/PROBEL-Black-Friday-2026.xlsx");
const porOrigem = {};
for (const m of montadas) porOrigem[m.origem] = (porOrigem[m.origem] ?? 0) + 1;
const classes = {};
for (const m of montadas) classes[m.classe] = (classes[m.classe] ?? 0) + 1;
console.log("escrito: output/PROBEL-Black-Friday-2026.xlsx");
console.log("  linhas por origem:", JSON.stringify(porOrigem));
console.log("  classificação:", JSON.stringify(classes));
console.log("  dá para aceitar o crível:", montadas.filter((m) => m.aceitouCrivel).length);
console.log("  acima do crível por mais de 5%:", montadas.filter((m) => m.faltaPct != null).length);
console.log("  8% extrapolado (clássico):", montadas.filter((m) => m.rel?.extrapolado).length);
console.log("  pausados ou sem estoque:", montadas.filter((m) => m.status !== "ativo" || !(Number(m.estoque) > 0)).length);
