/**
 * As planilhas de Pix da Black: financiada por nós e cofinanciada com o
 * Mercado Livre, uma aba por conta.
 *
 * O preço publicado NÃO muda em nenhuma delas. O que muda é quanto o
 * comprador paga ao escolher Pix e quanto sobra para nós:
 *
 *   FINANCIADA (clássico) · 5% nosso
 *       comprador paga 95%  ·  recebemos 95%
 *
 *   COFINANCIADA (premium) · o Meli só cofinancia o premium
 *       cenário 1 — Pix 5%:  3 nossos + 2 dele → paga 95%, recebemos 97%
 *       cenário 2 — Pix 10%: 6 nossos + 4 dele → paga 90%, recebemos 94%
 *
 * Um anúncio por SKU em cada conta: o de melhor desempenho nos últimos
 * oito meses. Concentrar o desconto no anúncio que já vende é o contrário
 * de espalhar por doze irmãos que dividem a mesma visita.
 *
 * A coluna que diz se cabe é a FAIXA: em que comissão da Fórmula base o
 * que sobra para nós ainda fecha. Premium paga 16,5% cheio e clássico
 * 11,5%; se o que recebemos equivale a 13,5% num premium, o Pix consumiu
 * 3 pontos de rebate.
 *
 * Uso: node scripts/local/pix-black.mjs
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const d = JSON.parse(readFileSync("scratchpad/bf/probel.json", "utf8"));
const tabela = JSON.parse(readFileSync("scratchpad/bf/precos-rebate.json", "utf8"));
const nm = (s) => String(s ?? "").trim().toUpperCase();
const r2 = (v) => Math.round(v * 100) / 100;

/* A tabela de rebate que ele mandou, por MLB. "Proncipal" é a conta a
   prazo e "Cotia" é a de São Paulo — é como ela nomeia as duas. */
const rebate = new Map(tabela.map((l) => [nm(l.mlb), l]));

const CONTAS = [
  { chave: "São Paulo — pronta entrega", curto: "São Paulo" },
  { chave: "2ª conta — venda a prazo", curto: "A prazo" },
];

/* ── Desempenho dos últimos oito meses ── */
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
  const g = visita.get(s.anuncio_id) ?? { vis: 0, ven: 0, semanas: 0 };
  g.vis += Number(s.visitas) || 0; g.ven += Number(s.vendas) || 0; g.semanas++;
  visita.set(s.anuncio_id, g);
}
/* O preço que está no ar: o último dia medido, não o de cadastro. */
const noAr = new Map();
for (const x of [...d.diario].sort((a, b) => String(a.data).localeCompare(String(b.data))))
  if (Number(x.preco) > 0) noAr.set(x.anuncio_id, Number(x.preco));
const catalogo = new Map();
for (const c of [...d.catalogo].sort((a, b) => String(a.data).localeCompare(String(b.data))))
  catalogo.set(c.anuncio_id, c.situacao);

/** O preço que mais vendeu unidades neste anúncio. */
const melhorPreco = (g) => {
  if (!g?.precos.length) return null;
  const m = new Map();
  for (const p of g.precos) m.set(p.p, (m.get(p.p) ?? 0) + p.q);
  const [preco, q] = [...m].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return { preco, unidades: q };
};

/**
 * Em que faixa de comissão um preço fecha, pela tabela de rebate dele.
 *
 * A tabela traz 5%, 6%, 7% e — só no premium — 8% de rebate, com passo
 * constante. Devolve quantos pontos de rebate o preço consome; acima de
 * 8 significa que passou do que a tabela cobre.
 */
const rebateConsumido = (linha, preco) => {
  if (!linha?.r5 || !linha?.r6) return null;
  const passo = linha.r5 - linha.r6;
  if (passo <= 0) return null;
  return r2(5 + (linha.r5 - preco) / passo);
};

/* ── Um anúncio por SKU em cada conta, o que mais vendeu ── */
function melhores(conta, tipo) {
  const porSku = new Map();
  for (const a of d.anuncios) {
    if (a.conta !== conta) continue;
    if (a.status !== "ativo") continue;
    if ((String(a.tipo || "").toLowerCase().startsWith("prem")) !== (tipo === "premium")) continue;
    const preco = noAr.get(a.id) ?? (Number(a.preco_atual) || null);
    if (!preco) continue;
    const v = venda.get(a.id) ?? { q: 0, r: 0 };
    const f = visita.get(a.id) ?? { vis: 0, ven: 0, semanas: 0 };
    if (v.q === 0 && f.vis === 0) continue;       // sem sinal de vida
    const sku = nm(a.sku_canal) || `SEM-SKU-${a.codigo_externo}`;
    const linha = {
      mlb: a.codigo_externo, sku, titulo: a.titulo, conta, tipo,
      preco, estoque: a.estoque, catalogo: catalogo.get(a.id) ?? "",
      unidades: v.q, receita: r2(v.r), visitas: f.vis, vendasRel: f.ven,
      conv: f.vis ? v.q / f.vis : null,
      melhor: melhorPreco(venda.get(a.id)),
      tab: rebate.get(nm(a.codigo_externo)) ?? null,
    };
    const atual = porSku.get(sku);
    if (!atual || linha.receita > atual.receita || (linha.receita === atual.receita && linha.visitas > atual.visitas))
      porSku.set(sku, linha);
  }
  /* Só entra quem já vendeu: é uma campanha para concentrar desconto em
     quem converte, não para descobrir anúncio novo. */
  return [...porSku.values()].filter((l) => l.unidades > 0).sort((a, b) => b.receita - a.receita);
}

/* ── A planilha ── */
const AZUL = "FF1F3864", VERDE = "FFC6EFCE", VERMELHO = "FFFFC7CE", AMARELO = "FFFFEB9C";
const brl = '"R$ "#,##0.00';
const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";
const titulo = (ws, t, n) => { const r = ws.addRow([t]); r.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.height = 26; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { vertical: "middle", indent: 1 }; };
const txt = (ws, ls, n) => { for (const t of ls) { const r = ws.addRow([t]); ws.mergeCells(r.number, 1, r.number, n); r.alignment = { wrapText: true, vertical: "top" }; r.height = Math.max(16, Math.ceil(t.length / (n * 11)) * 15); } };
const cab = (ws, cols) => { const r = ws.addRow(cols); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.alignment = { vertical: "middle", wrapText: true, horizontal: "center" }; r.height = 40; return r.number; };

const resumo = [];

function aba(nome, lista, modo, descricao) {
  const ws = wb.addWorksheet(nome);
  const cen = modo === "financiada"
    ? [{ rot: "Pix 5% (nosso)", paga: 0.95, recebe: 0.95 }]
    : [{ rot: "Cenário 1 · Pix 5%", paga: 0.95, recebe: 0.97 }, { rot: "Cenário 2 · Pix 10%", paga: 0.90, recebe: 0.94 }];

  const cols = ["MLB", "Conta", "SKU", "Produto", "Preço publicado"];
  for (const c of cen) cols.push(`${c.rot} · comprador paga`, `${c.rot} · nós recebemos`, `${c.rot} · rebate que consome`);
  cols.push("Melhor preço vendido", "Unid. 8 meses", "Receita 8 meses", "Visitas", "Conversão", "Estoque", "Catálogo");

  ws.columns = [{ width: 15 }, { width: 11 }, { width: 10 }, { width: 38 }, { width: 13 },
    ...cen.flatMap(() => [{ width: 13 }, { width: 13 }, { width: 12 }]),
    { width: 13 }, { width: 11 }, { width: 13 }, { width: 9 }, { width: 10 }, { width: 9 }, { width: 11 }];
  titulo(ws, nome.toUpperCase(), cols.length);
  txt(ws, descricao, cols.length);
  const h = cab(ws, cols);

  let furados = 0;
  for (const l of lista) {
    const cel = [l.mlb, l.conta === "São Paulo — pronta entrega" ? "São Paulo" : "A prazo", l.sku, String(l.titulo).slice(0, 46), l.preco];
    const consome = [];
    for (const c of cen) {
      const nosso = r2(l.preco * c.recebe);
      const rb = rebateConsumido(l.tab, nosso);
      consome.push(rb);
      cel.push(r2(l.preco * c.paga), nosso, rb);
    }
    cel.push(l.melhor?.preco ?? null, l.unidades, l.receita, l.visitas, l.conv, l.estoque >= 40000 ? "sob enc." : l.estoque, l.catalogo || "—");
    const r = ws.addRow(cel);
    const base = 5;
    r.getCell(base).numFmt = brl;
    cen.forEach((_, i) => {
      r.getCell(base + 1 + i * 3).numFmt = brl;
      r.getCell(base + 2 + i * 3).numFmt = brl;
      r.getCell(base + 2 + i * 3).font = { bold: true };
      const cl = r.getCell(base + 3 + i * 3);
      cl.numFmt = '0.0" pts"';
      const rb = consome[i];
      if (rb == null) { cl.value = "sem tabela"; }
      else {
        cl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rb <= 6 ? VERDE : rb <= 8 ? AMARELO : VERMELHO } };
        if (rb > 8) furados++;
      }
    });
    const pos = base + cen.length * 3;
    r.getCell(pos + 1).numFmt = brl;
    r.getCell(pos + 3).numFmt = brl;
    r.getCell(pos + 5).numFmt = "0.00%";
    if (l.catalogo === "winning") r.getCell(cols.length).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: h }];
  ws.autoFilter = { from: { row: h, column: 1 }, to: { row: h, column: cols.length } };
  resumo.push({ aba: nome, itens: lista.length, furados, receita: r2(lista.reduce((s, l) => s + l.receita, 0)) });
  return lista.length;
}

const rs = wb.addWorksheet("Resumo");

for (const c of CONTAS) {
  aba(`Financiada ${c.curto}`, melhores(c.chave, "classico"), "financiada", [
    `Conta ${c.curto} · anúncios CLÁSSICOS, um por SKU: o que mais faturou nos últimos oito meses, entre os que estão ativos e já venderam.`,
    "Pix de 5% por nossa conta: o comprador paga 95% do preço publicado e recebemos os mesmos 95%. O preço do anúncio não muda.",
    "A coluna 'rebate que consome' usa a sua tabela de preços por rebate: quantos pontos o desconto come. Verde até 6 pontos, amarelo até 8, vermelho acima — aí passou do que a tabela cobre.",
  ]);
}
for (const c of CONTAS) {
  aba(`Cofinanciada ${c.curto}`, melhores(c.chave, "premium"), "cofinanciada", [
    `Conta ${c.curto} · anúncios PREMIUM, um por SKU: o que mais faturou nos últimos oito meses. É o premium que o Mercado Livre pode cofinanciar — por isso esta aba repete produto que já tem Pix no clássico.`,
    "Cenário 1 · Pix 5%: 3 pontos nossos e 2 dele — o comprador paga 95% e recebemos 97%.",
    "Cenário 2 · Pix 10%: 6 pontos nossos e 4 dele — o comprador paga 90% e recebemos 94%.",
  ]);
}

/* ── Resumo ── */
rs.columns = [{ width: 26 }, { width: 13 }, { width: 15 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 14 }];
titulo(rs, "PROBEL · PIX DA BLACK", 7);
txt(rs, [
  "O preço publicado não muda em nenhum cenário. Muda quanto o comprador paga ao escolher Pix e quanto sobra para nós.",
  "Um anúncio por SKU em cada conta — o que mais faturou nos últimos oito meses, ativo e com venda. Clássico na aba financiada, premium na cofinanciada, porque é o premium que o Mercado Livre cofinancia.",
], 7);
rs.addRow([]);
cab(rs, ["Aba", "Anúncios", "Receita 8 meses", "Acima de 8 pts de rebate", "", "", ""]);
for (const r of resumo) {
  const row = rs.addRow([r.aba, r.itens, r.receita, r.furados, "", "", ""]);
  row.getCell(3).numFmt = brl;
  if (r.furados > 0) row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
}
rs.addRow([]);
cab(rs, ["Desenho", "Comprador paga", "Meli põe", "Probel põe", "Nós recebemos", "Onde", ""]);
for (const [nome, paga, meli, nos, recebe, onde] of [
  ["Financiada 5%", 0.95, 0, 0.05, 0.95, "Financiada SP / A prazo"],
  ["Cofinanciada 5%", 0.95, 0.02, 0.03, 0.97, "Cofinanciada SP / A prazo"],
  ["Cofinanciada 10%", 0.90, 0.04, 0.06, 0.94, "Cofinanciada SP / A prazo"],
]) {
  const row = rs.addRow([nome, paga, meli, nos, recebe, onde, ""]);
  [2, 3, 4, 5].forEach((c) => (row.getCell(c).numFmt = "0%"));
}
rs.addRow([]);
txt(rs, [
  "'Rebate que consome' sai da sua aba Preços por rebate: ela dá o preço do MLB com 5%, 6%, 7% e 8% de rebate, com passo constante. A coluna diz em quantos pontos de rebate cai o que sobra para nós. Acima de 8 o desconto passou do que a tabela cobre, e a linha vem em vermelho.",
  "Preço publicado é o do último dia medido, não o de cadastro. Unidades e receita são de pedidos não cancelados dos últimos oito meses. Visitas são do relatório semanal.",
], 7);

await wb.xlsx.writeFile("output/PROBEL-Pix-Black.xlsx");
console.log("escrito: output/PROBEL-Pix-Black.xlsx");
for (const r of resumo) console.log(`  ${r.aba.padEnd(24)} ${String(r.itens).padStart(4)} anúncios · R$ ${r.receita.toLocaleString("pt-BR")} · ${r.furados} acima de 8 pts`);
