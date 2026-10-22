/**
 * Preenche a planilha da Black Friday da Zema.
 *
 * Entra: a lista de SKU da Zema (SKU, Preço DE, Preço POR de setembro) e
 * a Fórmula base vigente da Probel. Sai: o modelo "BLACK FRIDAY ONDA 2"
 * preenchido nas colunas B a F, e um arquivo de conferência dizendo o que
 * faltou em cada SKU que ficou de fora.
 *
 * O "Preço POR" é o preço de tabela na faixa de comissão pedida. Não
 * existe faixa de 10% — a Fórmula base vai de ponto em ponto a partir de
 * 4,5% (9,5%, 10,5%) —, e a escolhida é a de CIMA: comissão maior pede
 * preço maior, então 10,5% é a que não fura a margem se a comissão real
 * for 10%. A 9,5% vai no arquivo de conferência, ao lado, para comparar.
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const c = l.trim(), i = c.indexOf("=");
  if (i > 0 && !c.startsWith("#") && !process.env[c.slice(0, i)]) process.env[c.slice(0, i)] = c.slice(i + 1).trim();
}
const U = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: K, authorization: `Bearer ${K}` };
const todas = async (p) => {
  const s = [];
  for (let o = 0; ; o += 1000) {
    const j = await (await fetch(`${U}/rest/v1/${p}&order=id&limit=1000&offset=${o}`, { headers: h })).json();
    if (!Array.isArray(j) || !j.length) break;
    s.push(...j); if (j.length < 1000) break;
  }
  return s;
};
const nm = (s) => String(s ?? "").trim().toUpperCase();
const r2 = (v) => Math.round(v * 100) / 100;
const PROBEL = "00000000-0000-0000-0000-000000000101";
const SELLER = "Probel Colchoes";
const FAIXA = 0.105;

/* ── Nome do produto: o cadastro primeiro, o título do anúncio depois ── */
const prods = await todas(`produtos?operacao_id=eq.${PROBEL}&select=sku,titulo,curva`);
const anun = await todas(`anuncios?operacao_id=eq.${PROBEL}&select=sku_canal,titulo`);
const nome = new Map();
const curva = new Map();
for (const p of prods) {
  if (p.titulo) nome.set(nm(p.sku), p.titulo.trim());
  if (p.curva) curva.set(nm(p.sku), p.curva);
}
for (const a of anun) if (a.titulo && !nome.has(nm(a.sku_canal))) nome.set(nm(a.sku_canal), a.titulo.trim());

/* ── Fórmula base vigente ── */
const precos = await todas(`formula_base_precos?operacao_id=eq.${PROBEL}&select=chave_tipo,chave,comissao,preco,vigente_de`);
const vigente = [...new Set(precos.map((p) => p.vigente_de))].sort().pop();
const tab = new Map();
for (const p of precos) {
  if (p.vigente_de !== vigente || p.chave_tipo !== "sku") continue;
  const k = nm(p.chave);
  if (!tab.has(k)) tab.set(k, {});
  tab.get(k)[Math.round(Number(p.comissao) * 1000) / 1000] = Number(p.preco);
}

/* ── A lista da Zema ── */
const wz = new ExcelJS.Workbook();
await wz.xlsx.readFile("C:/Users/dudu4/Downloads/Preços Zema Setembro - Anderson.xlsx");
const sz = wz.getWorksheet("Resultado da consulta");
const itens = [];
for (let i = 2; i <= sz.rowCount; i++) {
  const g = (c) => sz.getRow(i).getCell(c).value;
  const sku = nm(g(1));
  if (!sku) continue;
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? r2(Number(v)) : null);
  const t = tab.get(sku) ?? {};
  itens.push({
    sku,
    produto: nome.get(sku) ?? null,
    curva: curva.get(sku) ?? "",
    de: num(g(2)),
    porZema: num(g(3)),
    aVista: num(g(4)),
    t95: t[0.095] != null ? r2(t[0.095]) : null,
    t105: t[FAIXA] != null ? r2(t[FAIXA]) : null,
  });
}
for (const i of itens) {
  i.falta = [!i.produto && "nome", i.de == null && "Preço DE", i.t105 == null && "preço de tabela"].filter(Boolean);
  i.completa = i.falta.length === 0;
}
const prontas = itens.filter((i) => i.completa);
const fora = itens.filter((i) => !i.completa);

/* ── 1. O modelo, preenchido ── */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("C:/Users/dudu4/Downloads/BLACK FRIDAY ONDA 2 (1).xlsx");
const ws = wb.getWorksheet("Onda 1");
/* Copia o estilo da linha do cabeçalho para as de dado não é preciso: o
   modelo não formata as linhas de baixo, e a Zema lê o valor. */
let linha = 8;
for (const i of prontas) {
  const r = ws.getRow(linha++);
  r.getCell(2).value = SELLER;
  r.getCell(3).value = i.sku;
  r.getCell(4).value = i.produto;
  r.getCell(5).value = i.de;
  r.getCell(6).value = i.t105;
  r.getCell(5).numFmt = '#,##0.00';
  r.getCell(6).numFmt = '#,##0.00';
  r.commit();
}
await wb.xlsx.writeFile("output/BLACK-FRIDAY-ONDA-2-preenchida.xlsx");

/* ── 2. A conferência ── */
const wc = new ExcelJS.Workbook();
wc.creator = "gerizo";
const c1 = wc.addWorksheet("Conferência");
c1.addRow([`Black Friday Zema · onda 2 · Fórmula base vigente ${vigente} · faixa de comissão 10,5%`]).font = { bold: true };
c1.addRow([]);
const cab = ["SKU", "Produto", "Curva", "Preço DE (Zema)", "Preço POR (tabela 10,5%)", "Tabela 9,5%", "Preço POR da Zema em set.", "DE sobre POR %", "Diferença 10,5% − Zema", "Entra?", "O que falta"];
c1.addRow(cab).font = { bold: true };
c1.columns = [{ width: 12 }, { width: 52 }, { width: 7 }, { width: 15 }, { width: 22 }, { width: 13 }, { width: 22 }, { width: 15 }, { width: 20 }, { width: 9 }, { width: 30 }];
for (const i of itens) {
  const sobre = i.de != null && i.t105 != null ? r2(((i.de / i.t105) - 1) * 100) : null;
  const dif = i.t105 != null && i.porZema != null ? r2(i.t105 - i.porZema) : null;
  const r = c1.addRow([
    i.sku, i.produto ?? "", i.curva, i.de, i.t105, i.t95, i.porZema, sobre, dif,
    i.completa ? "sim" : "não", i.falta.join(" + "),
  ]);
  for (const col of [4, 5, 6, 7, 9]) r.getCell(col).numFmt = '#,##0.00';
  r.getCell(8).numFmt = '0.0';
}
c1.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];
c1.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cab.length } };
await wc.xlsx.writeFile("output/BLACK-FRIDAY-conferencia.xlsx");

/* ── O que dizer ── */
const razoes = prontas.map((i) => i.de / i.t105).sort((a, b) => a - b);
const media = razoes.reduce((s, r) => s + r, 0) / razoes.length;
const pc = (r) => ((r - 1) * 100).toFixed(1);
console.log(`Fórmula base vigente: ${vigente}`);
console.log(`\n${itens.length} SKUs na lista da Zema`);
console.log(`  entram na planilha: ${prontas.length}`);
console.log(`  ficam de fora:      ${fora.length}`);
for (const motivo of ["nome", "Preço DE", "preço de tabela"]) {
  console.log(`    falta ${motivo.padEnd(16)}: ${itens.filter((i) => i.falta.includes(motivo)).length}`);
}
console.log(`\n"Preço DE" sobre o "Preço POR" nas ${prontas.length} que entram:`);
console.log(`  média ${pc(media)}%  ·  mediana ${pc(razoes[Math.floor(razoes.length / 2)])}%  ·  de ${pc(razoes[0])}% a ${pc(razoes[razoes.length - 1])}%`);
const na30 = razoes.filter((r) => r >= 1.25 && r <= 1.35).length;
console.log(`  perto de +30% (entre +25% e +35%): ${na30} de ${razoes.length}`);
console.log("\nescrito:");
console.log("  output/BLACK-FRIDAY-ONDA-2-preenchida.xlsx");
console.log("  output/BLACK-FRIDAY-conferencia.xlsx");
