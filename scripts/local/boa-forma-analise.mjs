/**
 * Os recortes da linha Boa Forma, do jeito que a apresentação mostra.
 *
 * Duas fontes, e cada uma responde uma coisa:
 *   - o relatório semanal do canal dá VISITA, que só existe lá;
 *   - o pedido dá RECEITA e CANAL, que o semanal não enxerga — ele é do
 *     Mercado Livre e não sabe de Magalu nem de Shopee.
 *
 * A janela fechada vai de 29/06 a 25/10 (S27 a S43). A S44 começou em
 * 26/10 e ainda está correndo: entra separada, nunca somada.
 *
 * O "modelo" dos slides antigos (Sport Light, Encantado, Capri) saiu dos
 * títulos, e os títulos foram reescritos — hoje quase nenhum carrega o
 * nome. Então o corte passa a ser o que o SKU garante: construção
 * (espuma a vácuo ou mola ensacada) e tamanho.
 *
 * Uso: node scripts/local/boa-forma-analise.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const d = JSON.parse(readFileSync("scratchpad/bf/dados.json", "utf8"));
const SEM_INI = 202627, SEM_FIM = 202643;
const chave = (s) => s.ano_iso * 100 + s.semana_iso;
const fechada = (s) => chave(s) >= SEM_INI && chave(s) <= SEM_FIM;
const r2 = (v) => Math.round(v * 100) / 100;
const brl = (v) => v == null ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * O que o SKU é. Vem da ficha, não do título.
 *
 * O título foi reescrito e quase nenhum carrega mais o nome do modelo —
 * "Sport Light", "Encantado", "Casablanca" sumiram de 38 dos 42 anúncios.
 * O nome continua na apresentação porque é como a linha é falada; o que
 * amarra um ao outro é o SKU, que não muda.
 */
const FICHA = {
  PAA8725: { tam: "Solteiro", constr: "Espuma D28", modelo: "Sport Light", curto: "Sport Light · Solteiro D28" },
  PAA8728: { tam: "Casal", constr: "Espuma D28", modelo: "Sport Light", curto: "Sport Light · Casal D28" },
  PAA8767: { tam: "Solteiro", constr: "Espuma D33", modelo: "Sport Light", curto: "Sport Light · Solteiro D33" },
  PAA8770: { tam: "Casal", constr: "Espuma D33", modelo: "Sport Light", curto: "Sport Light · Casal D33" },
  PAA8820: { tam: "Solteiro", constr: "Espuma D45", modelo: "Sport Light", curto: "Sport Light · Solteiro D45" },
  PAA8823: { tam: "Casal", constr: "Espuma D45", modelo: "Sport Light", curto: "Sport Light · Casal D45" },
  PAA8824: { tam: "Queen", constr: "Espuma D45", modelo: "Sport Light", curto: "Sport Light · Queen D45" },
  PAA8639: { tam: "Solteiro", constr: "Mola 20cm", modelo: "Casablanca", curto: "Casablanca · Solteiro" },
  PAA8642: { tam: "Casal", constr: "Mola 20cm", modelo: "Casablanca", curto: "Casablanca · Casal" },
  PAA8643: { tam: "Queen", constr: "Mola 20cm", modelo: "Casablanca", curto: "Casablanca · Queen" },
  PAA8631: { tam: "Solteiro", constr: "Mola 26cm", modelo: "Encantado", curto: "Encantado · Solteiro" },
  PAA8635: { tam: "Casal", constr: "Mola 26cm", modelo: "Encantado", curto: "Encantado · Casal" },
  PAA8627: { tam: "Casal", constr: "Mola 30cm", modelo: "Capri", curto: "Capri · Casal" },
  PAB0007: { tam: "Casal", constr: "Mola 30cm", modelo: "Arctic Springs", curto: "Arctic Springs · Casal" },
  PAB0008: { tam: "Queen", constr: "Mola 30cm", modelo: "Arctic Springs", curto: "Arctic Springs · Queen" },
};
const rotulo = (sku) => FICHA[sku] ? `${sku} · ${FICHA[sku].tam} · ${FICHA[sku].constr}` : sku;
const familia = (sku) => FICHA[sku] ? (FICHA[sku].constr.startsWith("Espuma") ? "Espuma a vácuo" : "Mola ensacada") : "?";

const A = new Map(d.anuncios.map((a) => [a.id, a]));
/* A mesma janela das visitas, para os dois números poderem ser divididos
   um pelo outro. Fora dela há 2 unidades: uma da loja própria em 02/06 e
   uma do Meli em 14/06, ambas anteriores à primeira semana medida. */
const DE = "2026-06-29", ATE = "2026-10-25";
const naJanela = (v) => v.data >= DE && v.data <= ATE;
const vivas = d.vendas.filter((v) => !v.cancelado && naJanela(v));
const canceladas = d.vendas.filter((v) => v.cancelado && naJanela(v));
const foraDaJanela = d.vendas.filter((v) => !v.cancelado && !naJanela(v));

/* ── Semana a semana ── */
const semanas = new Map();
for (const s of d.semanal) {
  const k = `${s.ano_iso}-S${String(s.semana_iso).padStart(2, "0")}`;
  const g = semanas.get(k) ?? { vis: 0, ven: 0, rec: 0, ini: s.inicio, fim: s.fim, aberta: !fechada(s) };
  g.vis += Number(s.visitas) || 0; g.ven += Number(s.vendas) || 0; g.rec += Number(s.receita) || 0;
  semanas.set(k, g);
}
const ordemSem = [...semanas.keys()].sort();

/* ── Por anúncio, só a janela fechada ── */
const porAnuncio = new Map();
for (const s of d.semanal) {
  if (!fechada(s)) continue;
  const g = porAnuncio.get(s.anuncio_id) ?? { vis: 0, ven: 0, rec: 0, sem: 0 };
  g.vis += Number(s.visitas) || 0; g.ven += Number(s.vendas) || 0; g.rec += Number(s.receita) || 0; g.sem++;
  porAnuncio.set(s.anuncio_id, g);
}

/* ── Receita e canal saem do pedido ── */
const porSkuVenda = new Map();
for (const v of vivas) {
  const g = porSkuVenda.get(v.sku) ?? { q: 0, r: 0, precos: [] };
  g.q += v.quantidade; g.r += v.total;
  if (v.unitario > 0) g.precos.push({ preco: v.unitario, data: v.data, q: v.quantidade });
  porSkuVenda.set(v.sku, g);
}
const porCanal = new Map();
for (const v of vivas) {
  const g = porCanal.get(v.canal ?? "?") ?? { q: 0, r: 0, de: null, ate: null };
  g.q += v.quantidade; g.r += v.total;
  if (!g.de || v.data < g.de) g.de = v.data;
  if (!g.ate || v.data > g.ate) g.ate = v.data;
  porCanal.set(v.canal ?? "?", g);
}

/* ── Agregados ── */
const soma = (filtro) => {
  const t = { anuncios: 0, vis: 0, ven: 0 };
  for (const [id, g] of porAnuncio) {
    const a = A.get(id);
    if (!a || !filtro(a)) continue;
    t.anuncios++; t.vis += g.vis; t.ven += g.ven;
  }
  return t;
};
const ehPremium = (a) => String(a.tipo || "").toLowerCase().startsWith("prem");
const total = soma(() => true);
const classico = soma((a) => !ehPremium(a));
const premium = soma(ehPremium);

const receitaTotal = vivas.reduce((s, v) => s + v.total, 0);
const unidadesTotal = vivas.reduce((s, v) => s + v.quantidade, 0);

/* Ticket pelo pedido, não pelo relatório semanal: o semanal traz receita
   de anúncio, e um pedido com duas unidades aparece como uma venda. */
const ticket = unidadesTotal ? receitaTotal / unidadesTotal : null;

const porFamilia = new Map();
for (const [id, g] of porAnuncio) {
  const a = A.get(id); if (!a) continue;
  const f = familia(String(a.sku_canal).toUpperCase());
  const q = porFamilia.get(f) ?? { anuncios: 0, vis: 0, ven: 0, r: 0, q: 0 };
  q.anuncios++; q.vis += g.vis; q.ven += g.ven;
  porFamilia.set(f, q);
}
for (const v of vivas) {
  const f = familia(v.sku);
  const q = porFamilia.get(f); if (!q) continue;
  q.r += v.total; q.q += v.quantidade;
}

/* Por modelo, que é como o slide 4 corta. */
const porModelo = new Map();
for (const [id, g] of porAnuncio) {
  const a = A.get(id); if (!a) continue;
  const m = FICHA[String(a.sku_canal).toUpperCase()]?.modelo ?? "?";
  const q = porModelo.get(m) ?? { anuncios: 0, vis: 0, ven: 0, r: 0, q: 0 };
  q.anuncios++; q.vis += g.vis; q.ven += g.ven;
  porModelo.set(m, q);
}
for (const v of vivas) {
  const m = FICHA[v.sku]?.modelo ?? "?";
  const q = porModelo.get(m); if (!q) continue;
  q.r += v.total; q.q += v.quantidade;
}

/* O mapa de calor do slide 5: produto × semana, em unidades vendidas. */
const semanaDe = (data) => {
  const s = d.semanal.find((x) => x.inicio <= data && data <= x.fim);
  return s ? `${s.ano_iso}-S${String(s.semana_iso).padStart(2, "0")}` : null;
};
const calor = new Map();
for (const v of vivas) {
  const k = semanaDe(v.data); if (!k) continue;
  const linha = calor.get(v.sku) ?? {};
  linha[k] = (linha[k] ?? 0) + v.quantidade;
  calor.set(v.sku, linha);
}

const porTamanho = new Map();
for (const [id, g] of porAnuncio) {
  const a = A.get(id); if (!a) continue;
  const t = FICHA[String(a.sku_canal).toUpperCase()]?.tam ?? "?";
  const q = porTamanho.get(t) ?? { anuncios: 0, vis: 0, ven: 0, r: 0, q: 0 };
  q.anuncios++; q.vis += g.vis; q.ven += g.ven;
  porTamanho.set(t, q);
}
for (const v of vivas) {
  const t = FICHA[v.sku]?.tam ?? "?";
  const q = porTamanho.get(t); if (!q) continue;
  q.r += v.total; q.q += v.quantidade;
}

/* ── Por SKU, juntando visita (semanal) com receita (pedido) ── */
const porSku = new Map();
for (const [id, g] of porAnuncio) {
  const a = A.get(id); if (!a) continue;
  const sku = String(a.sku_canal).toUpperCase();
  const q = porSku.get(sku) ?? { anuncios: 0, vis: 0, venSem: 0, q: 0, r: 0, melhor: null, ultima: null };
  q.anuncios++; q.vis += g.vis; q.venSem += g.ven;
  porSku.set(sku, q);
}
for (const [sku, g] of porSkuVenda) {
  const q = porSku.get(sku) ?? { anuncios: 0, vis: 0, venSem: 0, q: 0, r: 0, melhor: null, ultima: null };
  q.q += g.q; q.r += g.r;
  /* O preço que mais vendeu: o preço unitário que soma mais unidades. */
  const porPreco = new Map();
  for (const p of g.precos) {
    const k = r2(p.preco);
    const x = porPreco.get(k) ?? { q: 0, ultima: null };
    x.q += p.q;
    if (!x.ultima || p.data > x.ultima) x.ultima = p.data;
    porPreco.set(k, x);
  }
  const melhor = [...porPreco].sort((a, b) => b[1].q - a[1].q || b[0] - a[0])[0];
  q.melhor = melhor ? { preco: melhor[0], unidades: melhor[1].q } : null;
  q.ultima = g.precos.length ? g.precos.sort((a, b) => String(b.data).localeCompare(String(a.data)))[0] : null;
  porSku.set(sku, q);
}

const saida = { total, classico, premium, receitaTotal: r2(receitaTotal), unidadesTotal, ticket: r2(ticket),
  semanas: ordemSem.map((k) => ({ sem: k, ...semanas.get(k) })),
  canais: [...porCanal].map(([c, g]) => ({ canal: c, ...g, r: r2(g.r) })),
  familias: [...porFamilia].map(([f, g]) => ({ familia: f, ...g, r: r2(g.r) })),
  tamanhos: [...porTamanho].map(([t, g]) => ({ tamanho: t, ...g, r: r2(g.r) })),
  modelos: [...porModelo].map(([m, g]) => ({ modelo: m, ...g, r: r2(g.r) })).sort((a, b) => b.q - a.q),
  calor: [...calor].map(([sku, linha]) => ({ sku, curto: FICHA[sku]?.curto ?? sku, linha })),
  skus: [...porSku].map(([s, g]) => ({ sku: s, rotulo: rotulo(s), curto: FICHA[s]?.curto ?? s, ...g, r: r2(g.r) })).sort((a, b) => b.q - a.q || b.vis - a.vis),
};
writeFileSync("scratchpad/bf/analise.json", JSON.stringify(saida, null, 1));

/* ── O que vai para os slides ── */
const pc = (a, b) => b ? (a / b * 100).toFixed(2) + "%" : "—";
console.log("══ PORTFÓLIO · S27 a S43 · 29/jun a 25/out · 17 semanas fechadas ══");
console.log(`  anúncios medidos ${total.anuncios} · visitas ${total.vis.toLocaleString("pt-BR")} · vendas ${total.ven} · conversão ${pc(total.ven, total.vis)}`);
console.log(`  receita (pedidos) ${brl(receitaTotal)} em ${unidadesTotal} unidades · ticket ${brl(ticket)}`);
const s44 = semanas.get("2026-S44");
console.log(`  S44 (26/10 a 01/11) ainda correndo: ${s44.vis} visitas, ${s44.ven} vendas — fora dos totais`);

console.log("\n══ CLÁSSICO vs PREMIUM ══");
for (const [n, t] of [["CLÁSSICO", classico], ["PREMIUM", premium]])
  console.log(`  ${n.padEnd(9)} anúncios ${String(t.anuncios).padStart(3)} · visitas ${String(t.vis).padStart(5)} · vendas ${String(t.ven).padStart(3)} · conversão ${pc(t.ven, t.vis)}`);

console.log("\n══ POR CANAL (pedidos na janela) ══");
for (const c of saida.canais.sort((a, b) => b.r - a.r))
  console.log(`  ${String(c.canal).padEnd(16)} ${String(c.q).padStart(3)} un · ${brl(c.r).padStart(14)} · ${c.de} → ${c.ate}`);
console.log(`  Magalu              0 un · sem venda — canal em ativação`);
console.log(`  Shopee              0 un · sem venda — canal novo`);
console.log(`  (fora da janela: ${foraDaJanela.length} unidades · ${foraDaJanela.map((v) => `${v.canal} ${v.data} ${brl(v.total)}`).join(" · ")})`);
console.log(`  (canceladas na janela: ${canceladas.reduce((s, v) => s + v.quantidade, 0)} un · ${brl(canceladas.reduce((s, v) => s + v.total, 0))})`);

console.log("\n══ POR MODELO (o corte do slide 4) ══");
for (const m of saida.modelos)
  console.log(`  ${m.modelo.padEnd(16)} anúncios ${String(m.anuncios).padStart(2)} · visitas ${String(m.vis).padStart(5)} · vendas ${String(m.q).padStart(3)} · conv ${pc(m.ven, m.vis)} · ticket ${brl(m.q ? m.r / m.q : null)}`);
console.log(`  ${"TOTAL".padEnd(16)} anúncios ${String(total.anuncios).padStart(2)} · visitas ${String(total.vis).padStart(5)} · vendas ${String(unidadesTotal).padStart(3)} · conv ${pc(total.ven, total.vis)} · ticket ${brl(ticket)}`);

console.log("\n══ POR FAMÍLIA ══");
for (const f of saida.familias.sort((a, b) => b.q - a.q))
  console.log(`  ${f.familia.padEnd(16)} anúncios ${String(f.anuncios).padStart(2)} · visitas ${String(f.vis).padStart(5)} · vendas ${String(f.q).padStart(3)} · conv ${pc(f.ven, f.vis)} · ticket ${brl(f.q ? f.r / f.q : null)}`);

console.log("\n══ POR TAMANHO ══");
for (const t of saida.tamanhos.sort((a, b) => b.q - a.q))
  console.log(`  ${t.tamanho.padEnd(10)} anúncios ${String(t.anuncios).padStart(2)} · visitas ${String(t.vis).padStart(5)} · vendas ${String(t.q).padStart(3)} · conv ${pc(t.ven, t.vis)} · ticket ${brl(t.q ? t.r / t.q : null)}`);

console.log("\n══ POR SKU ══");
console.log("  rótulo                              anún  visitas  vendas  conv     receita        melhor preço (un)");
for (const s of saida.skus)
  console.log(`  ${s.rotulo.padEnd(34)} ${String(s.anuncios).padStart(3)} ${String(s.vis).padStart(7)} ${String(s.q).padStart(7)}  ${pc(s.venSem, s.vis).padStart(6)} ${brl(s.r).padStart(13)}  ${s.melhor ? brl(s.melhor.preco) + " (" + s.melhor.unidades + ")" : "—"}`);

console.log("\n══ SEMANA A SEMANA ══");
for (const s of saida.semanas)
  console.log(`  ${s.sem} ${s.ini} → ${s.fim} · visitas ${String(s.vis).padStart(5)} · vendas ${String(s.ven).padStart(2)}${s.aberta ? "  (semana aberta)" : ""}`);
