/**
 * A campanha de Pix nos anúncios premium da Probel.
 *
 * Mesma ideia da Boa Forma, agora em escala: o preço publicado NÃO muda,
 * o comprador ganha desconto ao pagar no Pix, e quem paga esse desconto
 * depende de o anúncio estar ou não no pré-acordo de outubro.
 *
 *   FORA do pré-acordo  → COFINANCIADO, o Meli entra com parte:
 *        5%  = 2 pontos Meli + 3 nossos  → recebemos 97% do preço
 *       10%  = 4 pontos Meli + 6 nossos  → recebemos 94%
 *
 *   DENTRO do pré-acordo → 100% PROBEL, porque quem já tem rebate do canal
 *        não ganha mais:
 *        5%  → recebemos 95%
 *       10%  → recebemos 90%
 *
 * "Dentro do pré-acordo" é a coluna "retorno MELI" preenchida na aba
 * 08-PRÉ-ACORDO OUTUBRO do Controle Probel: é ali que se vê o que o canal
 * aceitou.
 *
 * A coluna que decide nada tem a ver com margem inventada: é a FAIXA
 * EQUIVALENTE. A Fórmula base dá, para cada SKU, o preço certo em cada
 * faixa de comissão, de 4,5% a 20,5%. Então basta perguntar em que faixa
 * cai o que sobra para nós. Premium paga 16,5% cheio: se o que recebemos
 * equivale à faixa de 13,5%, o Pix está consumindo 3 pontos de rebate —
 * e se não cobre nem a faixa de 4,5%, saiu da tabela e não deveria entrar.
 *
 * Uso: node scripts/local/probel-pix-premium.mjs
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const d = JSON.parse(readFileSync("scratchpad/pix.json", "utf8"));
const PA = JSON.parse(readFileSync("scratchpad/preacordo-out.json", "utf8"));
const nm = (s) => String(s ?? "").trim().toUpperCase();
const r2 = (v) => Math.round(v * 100) / 100;
const nmC = new Map(d.contas.map((c) => [c.id, String(c.nome).includes("São Paulo") ? "São Paulo" : "A prazo"]));

/* Quem está no pré-acordo de outubro.
   Por MLB são só DOIS anúncios premium: o acordo foi fechado quase todo em
   cima dos clássicos. Mas 49 premium vendem o mesmo SKU de um item que está
   no acordo, e aí a pergunta "esse produto já tem rebate?" tem resposta sim.
   As duas situações vão juntas na aba, com a coluna "Como entrou" dizendo
   qual é qual — quem decide se o acordo vale para o anúncio irmão é o
   Eduardo com o Meli, não este script. */
const porMlb = new Map(PA.filter((p) => p.retornoMeli).map((p) => [nm(p.mlb), p]));
const porSku = new Map(PA.filter((p) => p.retornoMeli).map((p) => [nm(p.sku), p]));

/* ── A Fórmula base vigente ── */
const vig = [...new Set(d.precos.map((x) => x.vigente_de))].sort().pop();
const tab = { sku: new Map(), mlb: new Map() };
for (const x of d.precos) {
  if (x.vigente_de !== vig) continue;
  const alvo = x.chave_tipo === "mlb" ? tab.mlb : tab.sku;
  const k = nm(x.chave), g = alvo.get(k) ?? {};
  g[Math.round(Number(x.comissao) * 1000) / 1000] = Number(x.preco);
  alvo.set(k, g);
}
/* O MLB tem precedência sobre o SKU: é o caso do mesmo SKU em kit e unidade. */
const tabelaDe = (a) => tab.mlb.get(nm(a.codigo_externo)) ?? tab.sku.get(nm(a.sku_canal)) ?? null;
/**
 * Em que faixa de comissão cai um preço: a maior faixa cujo preço de tabela
 * ele ainda cobre. null quer dizer que nem a faixa mais barata ele cobre.
 */
const faixaDe = (tabela, preco) => {
  let f = null;
  for (const b of Object.keys(tabela).map(Number).sort((x, y) => x - y)) if (preco >= tabela[b] - 0.01) f = b;
  return f;
};

/* ── O preço que está no ar ── */
const noAr = new Map();
for (const x of [...d.diario].sort((a, b) => String(a.data).localeCompare(String(b.data)))) if (Number(x.preco) > 0) noAr.set(x.anuncio_id, Number(x.preco));
const cat = new Map();
for (const c of [...d.catalogo].sort((a, b) => String(a.data).localeCompare(String(b.data)))) cat.set(c.anuncio_id, c.situacao);

/* ── Desempenho: as 12 semanas fechadas e o histórico de pedidos ── */
const SEMANAS = new Set(["2026-S32","2026-S33","2026-S34","2026-S35","2026-S36","2026-S37","2026-S38","2026-S39","2026-S40","2026-S41","2026-S42","2026-S43"]);
const fun = new Map();
for (const s of d.semanal) {
  const k = `${s.ano_iso}-S${String(s.semana_iso).padStart(2, "0")}`;
  if (!SEMANAS.has(k)) continue;
  const g = fun.get(s.anuncio_id) ?? { vis: 0, ven: 0, rec: 0, semanas: 0 };
  g.vis += Number(s.visitas) || 0; g.ven += Number(s.vendas) || 0; g.rec += Number(s.receita) || 0; g.semanas++;
  fun.set(s.anuncio_id, g);
}
const pedPor = new Map(d.pedidos.map((p) => [p.id, p]));
const hist = new Map();
for (const i of d.itens) {
  const p = pedPor.get(i.pedido_id);
  if (!p || p.cancelado || !i.anuncio_id) continue;
  const g = hist.get(i.anuncio_id) ?? { q: 0, r: 0 };
  g.q += Number(i.quantidade) || 0; g.r += Number(i.total) || 0;
  hist.set(i.anuncio_id, g);
}

const linhas = [];
let semTabela = 0, mortos = 0;
for (const a of d.anuncios) {
  if (a.status !== "ativo") continue;
  const f = fun.get(a.id) ?? { vis: 0, ven: 0, rec: 0, semanas: 0 };
  const hi = hist.get(a.id) ?? { q: 0, r: 0 };
  /* Sem visita e sem venda nenhuma não é candidato a campanha. */
  if (f.vis === 0 && hi.q === 0) { mortos++; continue; }
  const preco = noAr.get(a.id) ?? (Number(a.preco_atual) || null);
  const tabela = tabelaDe(a);
  if (!preco || !tabela) { semTabela++; continue; }
  linhas.push({
    mlb: a.codigo_externo, sku: nm(a.sku_canal), titulo: a.titulo,
    conta: nmC.get(a.conta_canal_id) ?? "?", preco, tabela,
    faixaHoje: faixaDe(tabela, preco),
    vis: f.vis, ven: f.ven, rec: r2(f.rec), semanas: f.semanas,
    conv: f.vis ? f.ven / f.vis : null,
    histQtd: hi.q, histRec: r2(hi.r),
    catalogo: cat.get(a.id) ?? "", estoque: a.estoque,
    /* Entra de cara quem vendeu nas 12 semanas, ou já vendeu e segue recebendo visita. */
    entra: f.ven > 0 || (hi.q > 0 && f.vis > 0),
    acordo: porMlb.get(nm(a.codigo_externo)) ?? porSku.get(nm(a.sku_canal)) ?? null,
    peloMlb: porMlb.has(nm(a.codigo_externo)),
  });
}
/* "Melhor desempenho": quem vendeu nas 12 semanas na frente, depois quem já
   vendeu algum dia, depois quem ao menos recebe visita. */
linhas.sort((a, b) => b.ven - a.ven || b.histRec - a.histRec || b.vis - a.vis);

/* ── A planilha ── */
const AZUL = "FF1F3864", VERDE = "FFC6EFCE", VERMELHO = "FFFFC7CE", AMARELO = "FFFFEB9C", CINZA = "FFF2F2F2";
const brl = '"R$ "#,##0.00';
const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";
const titulo = (ws, t, n) => { const r = ws.addRow([t]); r.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.height = 26; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { vertical: "middle", indent: 1 }; };
const txt = (ws, ls, n) => { for (const t of ls) { const r = ws.addRow([t]); ws.mergeCells(r.number, 1, r.number, n); r.alignment = { wrapText: true, vertical: "top" }; r.height = Math.max(16, Math.ceil(t.length / (n * 12)) * 15); } };
const cab = (ws, cols) => { const r = ws.addRow(cols); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.alignment = { vertical: "middle", wrapText: true, horizontal: "center" }; r.height = 42; return r.number; };

/* O resumo é criado antes para ficar como primeira aba; as linhas entram depois. */
const rs = wb.addWorksheet("Resumo");

/* Quanto o comprador paga e quanto SOBRA para nós em cada desenho. */
const CEN = {
  cofinanciado: [
    { nome: "5%", paga: 0.95, recebe: 0.97, meli: 0.02, nosso: 0.03 },
    { nome: "10%", paga: 0.90, recebe: 0.94, meli: 0.04, nosso: 0.06 },
  ],
  probel: [
    { nome: "5%", paga: 0.95, recebe: 0.95, meli: 0, nosso: 0.05 },
    { nome: "10%", paga: 0.90, recebe: 0.90, meli: 0, nosso: 0.10 },
  ],
};

const aba = (nome, lista, tipo, descricao) => {
  const cen = CEN[tipo];
  const ws = wb.addWorksheet(nome);
  const cols = [
    "MLB", "SKU", "Produto", "Entra?", "Preço publicado", "Faixa de hoje",
    `Pix ${cen[0].nome}: comprador paga`, `Pix ${cen[0].nome}: nós recebemos`, `Pix ${cen[0].nome}: faixa`,
    `Pix ${cen[1].nome}: comprador paga`, `Pix ${cen[1].nome}: nós recebemos`, `Pix ${cen[1].nome}: faixa`,
    "Visitas 12s", "Vendas 12s", "Conversão", "Semanas medidas", "Unid. vendidas (histórico)", "Receita (histórico)", "Catálogo", "Estoque",
    ...(tipo === "probel" ? ["Como entrou no pré-acordo", "MLB do acordo", "Rebate do acordo"] : []),
  ];
  ws.columns = [{ width: 15 }, { width: 11 }, { width: 34 }, { width: 11 }, { width: 13 }, { width: 10 },
    { width: 13 }, { width: 13 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 11 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 13 }, { width: 11 }, { width: 9 },
    ...(tipo === "probel" ? [{ width: 34 }, { width: 15 }, { width: 12 }] : [])];
  titulo(ws, nome.toUpperCase(), cols.length);
  txt(ws, descricao, cols.length);
  const h = cab(ws, cols);
  const conta = { fora: 0, entra: 0 };
  for (const l of lista) {
    const cel = [l.mlb, l.sku, String(l.titulo).slice(0, 32), l.entra ? "SIM" : "só p/ volume", l.preco, l.faixaHoje ?? "fora da tabela"];
    const faixas = [];
    for (const c of cen) {
      const nosso = r2(l.preco * c.recebe);
      const fx = faixaDe(l.tabela, nosso);
      faixas.push(fx);
      cel.push(r2(l.preco * c.paga), nosso, fx);
    }
    cel.push(l.vis, l.ven, l.conv, l.semanas, l.histQtd, l.histRec, l.catalogo || "—", l.estoque >= 40000 ? "sob enc." : l.estoque);
    if (tipo === "probel") cel.push(l.peloMlb ? "o próprio MLB está no acordo" : "mesmo SKU — o MLB do acordo é clássico", l.acordo.mlb, l.acordo.rebatePct ?? "—");
    const r = ws.addRow(cel);
    [5, 7, 8, 10, 11, 18].forEach((c) => (r.getCell(c).numFmt = brl));
    [6, 9, 12].forEach((c) => (r.getCell(c).numFmt = "0.0%"));
    if (l.faixaHoje == null) r.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
    r.getCell(15).numFmt = "0.00%";
    r.getCell(8).font = { bold: true };
    r.getCell(11).font = { bold: true };
    /* Vermelho = saiu da tabela, ou rebate equivalente passando de 4 pontos. */
    for (const [cl, fx] of [[9, faixas[0]], [12, faixas[1]]]) {
      if (fx == null) { r.getCell(cl).value = "fora da tabela"; conta.fora++; }
      r.getCell(cl).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fx == null ? VERMELHO : fx >= 0.145 ? VERDE : fx >= 0.125 ? AMARELO : VERMELHO } };
    }
    if (l.entra) { r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } }; r.getCell(4).font = { bold: true }; conta.entra++; }
    else for (let c = 1; c <= cols.length; c++) if (!r.getCell(c).fill) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
    if (l.catalogo === "winning") r.getCell(19).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: h }];
  ws.autoFilter = { from: { row: h, column: 1 }, to: { row: h, column: cols.length } };
  return conta;
};

const resumo = [];
for (const conta of ["São Paulo", "A prazo"]) {
  const curto = conta === "São Paulo" ? "SP" : "Prazo";
  const daConta = linhas.filter((l) => l.conta === conta);
  const fora = daConta.filter((l) => !l.acordo), dentro = daConta.filter((l) => l.acordo);
  const c1 = aba(`${curto} cofinanciado`, fora, "cofinanciado", [
    `Conta ${conta} · ${fora.length} anúncios premium que NÃO estão no pré-acordo de outubro. ${fora.filter((l) => l.entra).length} já vendem e entram de cara (SIM, em verde); os cinza só recebem visita, servem se o objetivo for volume.`,
    "Pix cofinanciado: no cenário de 5% o Meli põe 2 pontos e nós 3 — o comprador paga 95% do preço publicado e recebemos 97%. No de 10% o Meli põe 4 e nós 6 — o comprador paga 90% e recebemos 94%. O preço do anúncio não muda em nenhum dos dois.",
    "A coluna 'faixa' diz a que faixa de comissão da Fórmula base equivale o que sobra para nós. Premium paga 16,5% cheio, então 13,5% quer dizer que o Pix consumiu 3 pontos de rebate. Verde = 14,5% ou mais. Amarelo = entre 12,5% e 14,5%. Vermelho = abaixo disso, ou fora da tabela.",
  ]);
  const estoura = (ls, rec) => ls.filter((l) => faixaDe(l.tabela, r2(l.preco * rec)) == null).length;
  const c2 = aba(`${curto} 100% Probel`, dentro, "probel", [
    `Conta ${conta} · ${dentro.length} anúncios premium ligados ao pré-acordo de outubro (coluna "retorno MELI" preenchida). ${dentro.filter((l) => l.entra).length} já vendem. Destes, ${dentro.filter((l) => l.peloMlb).length} estão no acordo pelo próprio MLB e ${dentro.filter((l) => !l.peloMlb).length} entram porque vendem o mesmo SKU de um item do acordo — nesses o MLB que o Meli aprovou é um clássico, e vale conferir com ele se o rebate cobre o irmão premium. A coluna "Como entrou no pré-acordo" separa os dois casos.`,
    "Como esses já têm rebate do canal, o Pix sai 100% da Probel: no cenário de 5% o comprador paga 95% e recebemos os mesmos 95%; no de 10%, paga 90% e recebemos 90%.",
    `Atenção: aqui o desconto se soma ao rebate que o canal já deu, e é nesta aba que a faixa desaba. ${estoura(dentro, 0.95)} dos ${dentro.length} já saem da tabela no cenário de 5%, e ${estoura(dentro, 0.90)} no de 10%. Esses não deveriam entrar — o preço de hoje já consome o rebate inteiro.`,
  ]);
  resumo.push({ conta, fora: fora.length, dentro: dentro.length, c1, c2, vendas: daConta.reduce((s, l) => s + l.ven, 0) });
}

/* ── Resumo ── */
rs.columns = [{ width: 26 }, { width: 15 }, { width: 15 }, { width: 14 }, { width: 14 }, { width: 24 }, { width: 10 }];
titulo(rs, "PROBEL · PIX NOS ANÚNCIOS PREMIUM", 7);
txt(rs, [
  `${linhas.length} anúncios premium ativos entram na análise — de ${d.anuncios.filter((a) => a.status === "ativo").length} premium ativos, ${mortos} ficaram fora por não ter nem uma visita nem uma venda, e ${semTabela} por não ter preço na Fórmula base.`,
  "O preço publicado não muda em nenhum cenário. Muda quanto o comprador paga ao escolher Pix e quanto sobra para nós.",
  `O pré-acordo de outubro tem 52 linhas com MLB, 38 com retorno do Meli — e só 2 delas são anúncios premium. O acordo foi fechado em cima dos clássicos. Por isso o grupo "100% Probel" é pequeno: são os 2 anúncios do acordo mais ${linhas.filter((l) => l.acordo && !l.peloMlb).length} premium que vendem o mesmo SKU de um item do acordo, separados na planilha pela coluna "Como entrou no pré-acordo". Todo o resto cai no cofinanciado.`,
  `Só ${linhas.filter((l) => l.ven > 0).length} anúncios premium venderam nas últimas 12 semanas, somando ${linhas.reduce((s, l) => s + l.ven, 0)} unidades. Vale saber disso antes: esta campanha é para aquecer um catálogo premium que recebe visita e quase não converte, não para defender vendas que já existem.`,
], 7);
rs.addRow([]);
cab(rs, ["Conta", "Cofinanciado (fora do pré-acordo)", "100% Probel (no pré-acordo)", "Vendas 12s", "", "", ""]);
for (const r of resumo) rs.addRow([r.conta, r.fora, r.dentro, r.vendas, "", "", ""]);
rs.addRow([]);
cab(rs, ["Cenário", "Comprador paga", "Meli cobre", "Probel cobre", "Nós recebemos", "Está na aba", ""]);
for (const [nome, c, onde] of [
  ["Cofinanciado 5%", CEN.cofinanciado[0], "SP / Prazo cofinanciado"],
  ["Cofinanciado 10%", CEN.cofinanciado[1], "SP / Prazo cofinanciado"],
  ["100% Probel 5%", CEN.probel[0], "SP / Prazo 100% Probel"],
  ["100% Probel 10%", CEN.probel[1], "SP / Prazo 100% Probel"],
]) {
  const row = rs.addRow([nome, c.paga, c.meli, c.nosso, c.recebe, onde, ""]);
  [2, 3, 4, 5].forEach((x) => (row.getCell(x).numFmt = "0%"));
}
rs.addRow([]);
txt(rs, [
  "Como ler a coluna 'faixa': a Fórmula base dá, para cada SKU, o preço certo em cada faixa de comissão, de 4,5% a 20,5%. A faixa mostrada é a que aquele valor ainda cobre. Premium paga 16,5% de comissão cheia, então uma faixa de 13,5% quer dizer que o Pix está consumindo 3 pontos de rebate — exatamente a conta do pré-acordo. 'Fora da tabela' é o que não cobre nem a faixa de 4,5%: esse não entra.",
  "Nenhum número aqui foi estimado. O preço é o que está no ar no último dia medido, não o de cadastro. A faixa vem da Fórmula base vigente. Visitas e vendas são as 12 semanas fechadas, e o histórico vem dos pedidos não cancelados.",
], 7);

await wb.xlsx.writeFile("output/PROBEL-Pix-premium.xlsx");
console.log("escrito: output/PROBEL-Pix-premium.xlsx");
console.log("  abas: " + wb.worksheets.map((w) => w.name).join(" · "));
for (const r of resumo) console.log(`  ${r.conta}: cofin ${r.fora} (${r.c1.entra} entram, ${r.c1.fora} células fora da tabela) · 100% Probel ${r.dentro} (${r.c2.entra} entram, ${r.c2.fora} fora da tabela)`);
