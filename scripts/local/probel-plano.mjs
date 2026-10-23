/**
 * O arquivo ÚNICO da Probel.
 *
 * Eu tinha mandado dois: o plano e o comparativo por SKU. A pergunta do
 * Eduardo foi "mas então qual planilha uso?", e ela é justa — dois
 * arquivos sobre a mesma conta, nenhum deles completo. Este junta os dois
 * e substitui ambos.
 *
 * A ordem das abas é a ordem de uso: o diagnóstico primeiro, depois a
 * lista de cada ação, depois a base inteira para conferir.
 *
 * Uso: node scripts/local/probel-plano.mjs
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const d = JSON.parse(readFileSync("scratchpad/pz.json", "utf8"));
const nm = (s) => String(s ?? "").trim().toUpperCase();
const r2 = (v) => Math.round(v * 100) / 100;
const r0 = (v) => Math.round(v);
const nmConta = new Map(d.contas.map((c) => [c.id, c.nome]));
const extra = new Map(d.anuncios.map((t) => [t.id, t]));
const curto = (n) => (String(n).includes("São Paulo") ? "São Paulo" : String(n).includes("prazo") ? "A prazo" : String(n));
const tipoPromo = new Map(d.promocoes.map((x) => [x.id, x.tipo]));

/* ── Piso vigente ── */
const vig = [...new Set(d.precos.map((x) => x.vigente_de))].sort().pop();
const tab = { sku: new Map(), mlb: new Map() };
for (const x of d.precos) {
  if (x.vigente_de !== vig) continue;
  const alvo = x.chave_tipo === "mlb" ? tab.mlb : tab.sku;
  const k = nm(x.chave), g = alvo.get(k) ?? {};
  g[Math.round(Number(x.comissao) * 1000) / 1000] = Number(x.preco);
  alvo.set(k, g);
}
const pisoDe = (a) => { const c = a.tipo === "premium" ? 0.165 : 0.115; return tab.mlb.get(nm(a.codigo_externo))?.[c] ?? tab.sku.get(nm(a.sku_canal))?.[c] ?? null; };

const cat = new Map();
for (const c of [...d.catalogo].sort((a, b) => String(a.data).localeCompare(String(b.data)))) cat.set(c.anuncio_id, c);
const jan = [...new Set(d.ads.map((a) => String(a.inicio).slice(0, 10) + "|" + String(a.fim).slice(0, 10)))].sort().pop();
const ads = new Map();
for (const a of d.ads.filter((x) => String(x.inicio).slice(0, 10) + "|" + String(x.fim).slice(0, 10) === jan)) ads.set(a.anuncio_id, a);

const SEM = new Set(["2026-S32","2026-S33","2026-S34","2026-S35","2026-S36","2026-S37","2026-S38","2026-S39","2026-S40","2026-S41","2026-S42","2026-S43"]);
const fun = new Map();
for (const s of d.semanal) {
  const k = `${s.ano_iso}-S${String(s.semana_iso).padStart(2, "0")}`;
  if (!SEM.has(k)) continue;
  const g = fun.get(s.anuncio_id) ?? { vis: 0, ven: 0, rec: 0 };
  g.vis += Number(s.visitas) || 0; g.ven += Number(s.vendas) || 0; g.rec += Number(s.receita) || 0;
  fun.set(s.anuncio_id, g);
}
/* Promoção ativa de cada anúncio: a de maior desconto. */
/*
 * O PREÇO QUE O CLIENTE VÊ, não o de vitrine.
 *
 * O Eduardo pegou isto: "o PA85351 na conta de São Paulo tá promocionado
 * a 2272". Estava — 2.274,48 — e eu comparava o piso com os 4.212 do
 * cadastro, que é o preço riscado. Pelo cheio o anúncio parecia ter 46%
 * de espaço; pelo praticado ele está R$ 2,66 acima do piso.
 *
 * O retrato diário traz o preço efetivo e a promoção confirma. Com o
 * número certo, 567 dos 1.033 anúncios ativos vendem ABAIXO do piso e só
 * 13 têm mais de 15% de espaço — contra 422 pela leitura errada.
 */
const praticado = new Map();
for (const x of [...d.diario].sort((a, b) => String(a.data).localeCompare(String(b.data))))
  if (Number(x.preco) > 0) praticado.set(x.anuncio_id, Number(x.preco));

const promo = new Map();
for (const p of d.promo) {
  if (p.status !== "started" || !p.anuncio_id) continue;
  const orig = Number(p.preco_original) || 0, pro = Number(p.preco_promocional) || 0;
  if (!(orig > 0 && pro > 0)) continue;
  const desc = r2(((orig - pro) / orig) * 100);
  const atual = promo.get(p.anuncio_id);
  if (!atual || desc > atual.desc) promo.set(p.anuncio_id, { tipo: tipoPromo.get(p.promocao_id) ?? "?", pro, desc });
}

/* ── Linha por anúncio ── */
const porSku = new Map();
for (const a of d.anuncios) { const k = nm(a.sku_canal); if (!k) continue; if (!porSku.has(k)) porSku.set(k, []); porSku.get(k).push(a); }
const L = [];
for (const a of d.anuncios) {
  const f = fun.get(a.id); if (!f) continue;
  const irmaos = (porSku.get(nm(a.sku_canal)) ?? []).filter((x) => x.status === "ativo" && x.preco_atual);
  const pr = promo.get(a.id), c = cat.get(a.id), ad = ads.get(a.id);
  L.push({
    mlb: a.codigo_externo, sku: nm(a.sku_canal), titulo: extra.get(a.id)?.titulo ?? "", tipo: a.tipo, status: a.status,
    conta: curto(nmConta.get(a.conta_canal_id) ?? "?"),
    visitas: f.vis, vendas: f.ven, receita: r2(f.rec),
    conv: f.vis ? r2((f.ven / f.vis) * 100) : null,
    precoCheio: Number(a.preco_atual) || null,
    preco: praticado.get(a.id) ?? pr?.pro ?? (Number(a.preco_atual) || null),
    piso: pisoDe(a),
    promoTipo: pr?.tipo ?? null, promoPreco: pr?.pro ?? null, promoDesc: pr?.desc ?? null,
    catalogo: c?.situacao ?? "", paraGanhar: c?.preco_para_ganhar ?? null,
    estoque: extra.get(a.id)?.estoque ?? null, adsInv: ad ? r2(Number(ad.investimento)) : null,
    irmaos: irmaos.length,
    maisBarato: irmaos.length ? Math.min(...irmaos.map((x) => praticado.get(x.id) ?? Number(x.preco_atual))) : null,
  });
}
for (const l of L) l.espaco = l.preco && l.piso ? r2(((l.preco - l.piso) / l.preco) * 100) : null;
const soma = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const MEDIA = soma(L, (l) => l.vendas) / soma(L, (l) => l.visitas);
for (const l of L) {
  const tem = l.visitas >= 100, conv = l.conv != null && l.conv / 100 >= MEDIA;
  l.grupo = !tem && conv ? "A · converte e falta visita"
    : tem && l.vendas === 0 ? "C · visita e ZERO venda"
    : tem && !conv ? "B · visita e converte pouco"
    : tem && conv ? "D · vai bem" : "E · sem visita e sem venda";
}
const g = (p) => L.filter((l) => l.grupo.startsWith(p)).sort((a, b) => b.visitas - a.visitas);
const A = g("A"), B = g("B"), C = g("C"), D = g("D"), E = g("E");
const visTotal = soma(L, (l) => l.visitas);

/* ── Grupos por SKU, para o comparativo ── */
const grupos = [];
for (const [sku, ans] of porSku) {
  const at = ans.filter((x) => x.status === "ativo");
  if (at.length < 2) continue;
  const linhas = at.map((a) => L.find((l) => l.mlb === a.codigo_externo)).filter(Boolean).sort((a, b) => b.visitas - a.visitas);
  const vis = soma(linhas, (l) => l.visitas);
  if (vis < 100 || !linhas.length) continue;
  /*
   * A comparação é pelo PREÇO FINAL, não pela porcentagem de desconto.
   *
   * Segunda correção do Eduardo: "vc utilizou a maior porcentagem de
   * desconto, porém quem teve mais visitas é justamente o menor preço
   * promocional". O percentual é calculado sobre o preço cheio de cada
   * anúncio, e os cheios diferem — 46% sobre 4.212 dá 2.274, enquanto
   * 55% sobre 5.230 dá 2.331. Pelo percentual o segundo parecia o mais
   * agressivo; pelo preço, o primeiro é mais barato.
   *
   * Com a conta certa os casos caem de 79 para 36, e dos 36 só 10 têm o
   * anúncio mais barato na MESMA conta — nos outros 26 ele está na conta
   * a prazo, que converte 0,23% e não resolveria nada.
   */
  const maisVisto = linhas[0];
  const maisBarato = [...linhas].filter((l) => l.preco).sort((a, b) => a.preco - b.preco)[0];
  const mesmaConta = maisBarato && maisBarato.conta === maisVisto.conta;
  const diferente = maisBarato && maisVisto.preco && maisBarato.preco < maisVisto.preco * 0.98;
  grupos.push({
    sku, titulo: extra.get(at[0].id)?.titulo ?? "", n: at.length, vis,
    ven: soma(linhas, (l) => l.vendas), linhas, melhor: maisBarato,
    acionavel: Boolean(diferente && mesmaConta),
    noutraConta: Boolean(diferente && !mesmaConta),
    dif: diferente ? r2(((maisVisto.preco - maisBarato.preco) / maisVisto.preco) * 100) : null,
  });
}
grupos.sort((a, b) => b.vis - a.vis);
const deslocados = grupos.filter((x) => x.acionavel);
const noutra = grupos.filter((x) => x.noutraConta);

/* ── Estilo ── */
const AZUL = "FF1F3864", CLARO = "FFD9E2F3", FAIXA = "FFF2F2F2";
const VERDE = "FFC6EFCE", VERMELHO = "FFFFC7CE", AMARELO = "FFFFEB9C";
const brl = '"R$ "#,##0', brl2 = '"R$ "#,##0.00';
const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";
const titulo = (ws, t, n) => { const r = ws.addRow([t]); r.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.height = 26; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { vertical: "middle", indent: 1 }; };
const secao = (ws, t, n) => { ws.addRow([]); const r = ws.addRow([t]); r.font = { bold: true, size: 11, color: { argb: AZUL } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLARO } }; ws.mergeCells(r.number, 1, r.number, n); r.alignment = { indent: 1 }; };
const cab = (ws, cols) => { const r = ws.addRow(cols); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; r.alignment = { vertical: "middle", wrapText: true }; r.height = 34; };
const txt = (ws, linhas, n) => { for (const t of linhas) { const r = ws.addRow([t]); ws.mergeCells(r.number, 1, r.number, n); r.alignment = { wrapText: true, vertical: "top" }; r.height = Math.max(16, Math.ceil(t.length / (n * 13)) * 15); } };

/* ═══ 1. COMECE AQUI ═══ */
{
  const ws = wb.addWorksheet("1 Comece aqui");
  ws.columns = [{ width: 36 }, { width: 12 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 30 }];
  titulo(ws, "PROBEL · PLANO DE NOVEMBRO — ARQUIVO ÚNICO", 7);
  txt(ws, [
    "Este arquivo substitui os dois que mandei antes. Use as abas na ordem: 1 é o diagnóstico, 2 a 5 são as listas de trabalho, 6 é a base inteira.",
    "Dados de 23/10/2026, janela de 12 semanas medidas (S32 a S43).",
    "",
    "IMPORTANTE — a coluna Preço é o PREÇO PRATICADO, o que o cliente vê depois da promoção, não o preço riscado do cadastro. A versão anterior deste arquivo usava o preço cheio e por isso dizia que havia espaço de desconto onde não há: o PA85351 em São Paulo aparecia a R$ 4.212 quando está sendo vendido a R$ 2.274,48, R$ 2,66 acima do piso.",
  ], 7);

  secao(ws, "COMO USAR CADA ABA", 7);
  cab(ws, ["Aba", "Para quê", "Quantas linhas", "", "", "", ""]);
  for (const [a, b, c] of [
    ["2 Preço entre irmãos", "Produtos onde outro anúncio da MESMA conta já está mais barato que o que recebe a visita.", `${deslocados.length} produtos`],
    ["3 Trazer visita", "Anúncios que convertem bem e não têm verba. Abrir Ads aqui.", `${A.length} anúncios`],
    ["4 Arrumar a oferta", "Têm 50% das visitas da conta e convertem 0,29%. Não comprar visita.", `${B.length} anúncios`],
    ["5 Visita sem venda", "Receberam visita e não venderam nada. Consertar ou tirar.", `${C.length} anúncios`],
    ["6 Todos os anúncios", "A base, para filtrar e conferir.", `${L.length} anúncios`],
  ]) {
    const r = ws.addRow([a, b, c, "", "", "", ""]);
    r.getCell(1).font = { bold: true };
    r.alignment = { wrapText: true, vertical: "top" };
  }

  secao(ws, "O DIAGNÓSTICO EM QUATRO FATOS", 7);
  txt(ws, [
    "1. O Mercado Livre caiu de R$ 28.363 por dia em janeiro para R$ 9.894 em outubro. São R$ 18.469 por dia — quase o dobro dos R$ 10 mil que você quer somar. A Loja própria triplicou e segurou a operação.",
    "",
    "2. Não é falta de visita, é conversão. Em julho as visitas SUBIRAM para 44.606 e os pedidos caíram. A conversão foi de 1,56% para 0,70%.",
    "",
    "3. Não é preço, por dois caminhos independentes. Primeiro: o preço que o cliente VÊ já está no fundo — dos 1.033 anúncios ativos com piso cadastrado, 567 vendem ABAIXO do piso da Fórmula base e 451 estão a menos de 3% dele. Só 13 têm mais de 15% de espaço. Segundo: o mesmo produto está até 56% mais barato na 2ª conta e mesmo assim não vende — no PA69847 são R$ 1.330 contra R$ 2.523, com 1 venda contra 20. O que muda entre as contas é o prazo de entrega.",
    "",
    `4. A promoção está no anúncio errado em ${deslocados.length} dos ${grupos.length} produtos com mais de um anúncio. São ${soma(deslocados, (x) => x.linhas[0].visitas).toLocaleString("pt-BR")} visitas caindo no anúncio de desconto menor.`,
  ], 7);

  secao(ws, "AS DUAS CONTAS", 7);
  cab(ws, ["Conta", "Anúncios ativos", "Visitas 12sem", "Vendas", "Conversão", "Receita 12sem", ""]);
  const pc = new Map();
  for (const l of L) {
    const x = pc.get(l.conta) ?? { n: 0, vis: 0, ven: 0, rec: 0 };
    x.n++; x.vis += l.visitas; x.ven += l.vendas; x.rec += l.receita;
    pc.set(l.conta, x);
  }
  for (const [k, x] of [...pc].sort((a, b) => b[1].vis - a[1].vis)) {
    const r = ws.addRow([k, x.n, x.vis, x.ven, x.vis ? x.ven / x.vis : 0, x.rec, ""]);
    r.getCell(5).numFmt = "0.00%"; r.getCell(6).numFmt = brl;
    r.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: x.ven / x.vis > 0.005 ? VERDE : VERMELHO } };
  }

  secao(ws, "OS CINCO GRUPOS", 7);
  cab(ws, ["Grupo", "Anúncios", "Visitas", "% visitas", "Vendas", "Conversão", "Onde está a lista"]);
  for (const [nome, grp, aba] of [["A · converte e falta visita", A, "aba 3"], ["B · visita e converte pouco", B, "aba 4"], ["C · visita e ZERO venda", C, "aba 5"], ["D · vai bem", D, "não mexer"], ["E · sem visita e sem venda", E, "aba 6, filtrar"]]) {
    const vis = soma(grp, (l) => l.visitas), ven = soma(grp, (l) => l.vendas);
    const r = ws.addRow([nome, grp.length, vis, vis / visTotal, ven, vis ? ven / vis : 0, aba]);
    r.getCell(4).numFmt = "0%"; r.getCell(6).numFmt = "0.00%";
    const cor = nome.startsWith("A") ? VERDE : nome.startsWith("B") || nome.startsWith("C") ? VERMELHO : null;
    if (cor) r.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
  }

  secao(ws, "QUANTO VALE CADA MOVIMENTO", 7);
  const visB = soma(B, (l) => l.visitas), venB = soma(B, (l) => l.vendas);
  const tB = soma(B, (l) => l.receita) / venB;
  const convA = soma(A, (l) => l.vendas) / soma(A, (l) => l.visitas);
  const tA = soma(A, (l) => l.receita) / soma(A, (l) => l.vendas);
  const gB = (alvo) => r0(((visB * alvo - venB) * tB) / 84);
  const gA = (m) => r0((soma(A, (l) => l.visitas) * (m - 1) * convA * tA) / 84);
  cab(ws, ["Movimento", "", "Ganho/dia", "", "", "", ""]);
  for (const [n, v] of [
    ["Grupo B converter na média (0,64%)", gB(0.0064)],
    ["Grupo B converter a 1,00%", gB(0.01)],
    ["Grupo B no nível do grupo D (1,76%)", gB(0.0176)],
    ["Grupo A com 2x a visita", gA(2)],
    ["Grupo A com 3x a visita", gA(3)],
    ["Grupo A com 5x a visita", gA(5)],
  ]) {
    const r = ws.addRow([n, "", v, v >= 10000 ? "sozinho já fecha" : "", "", "", ""]);
    r.getCell(3).numFmt = brl;
    if (v >= 10000) r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  }
  txt(ws, [
    `Combinações que fecham os +R$ 10.000/dia: B em 1,00% mais A em 3x (R$ ${(gB(0.01) + gA(3)).toLocaleString("pt-BR")}), ou B sozinho no nível do grupo D.`,
    "O caminho mais curto é o B: as visitas já existem, não se compra nenhuma. E a aba 2 é o primeiro passo dentro dele.",
  ], 7);
}

/* ═══ 2. MOVER PROMOÇÃO ═══ */
{
  const ws = wb.addWorksheet("2 Preço entre irmãos");
  const cols = ["SKU", "Produto", "Anúncios", "Visitas do SKU", "Vendas do SKU", "MLB", "CONTA", "Tipo", "Preço cheio", "Promoção", "Preço na promoção", "Desconto", "Visitas", "Vendas", "Conversão", "Piso", "Catálogo", "Ads", "LEITURA"];
  ws.columns = [{ width: 11 }, { width: 26 }, { width: 9 }, { width: 11 }, { width: 11 }, { width: 15 }, { width: 11 }, { width: 9 }, { width: 11 }, { width: 15 }, { width: 12 }, { width: 10 }, { width: 9 }, { width: 8 }, { width: 10 }, { width: 11 }, { width: 12 }, { width: 9 }, { width: 48 }];
  titulo(ws, "O PREÇO ENTRE OS ANÚNCIOS DO MESMO PRODUTO", cols.length);
  txt(ws, [
    "Uma faixa por produto, uma linha por anúncio, ordenadas pela visita. A primeira linha de cada faixa é o anúncio que o Mercado Livre está mostrando.",
    `A comparação é pelo PREÇO FINAL, não pela porcentagem de desconto: o percentual é calculado sobre o preço cheio de cada anúncio, e os cheios diferem. 46% sobre R$ 4.212 dá R$ 2.274; 55% sobre R$ 5.230 dá R$ 2.331. Pelo percentual o segundo parecia mais agressivo; pelo preço, é o primeiro que está mais barato.`,
    `Em ${deslocados.length} dos ${grupos.length} produtos existe outro anúncio da MESMA conta mais barato que o mais visitado — são esses que vêm primeiro. Em outros ${noutra.length} o mais barato está na conta a prazo, que converte 0,23%: igualar lá não resolve.`,
  ], cols.length);
  cab(ws, cols);
  let linha = ws.lastRow.number, zebra = false;
  const ordenados = [...grupos].sort((a, b) => {
    const da = a.acionavel ? 2 : a.noutraConta ? 1 : 0;
    const db = b.acionavel ? 2 : b.noutraConta ? 1 : 0;
    return db - da || b.vis - a.vis;
  });
  for (const x of ordenados) {
    const inicio = linha + 1;
    const desl = x.acionavel;
    for (const [i, a] of x.linhas.entries()) {
      const primeiro = i === 0;
      const leitura = desl
        ? primeiro
          ? `BAIXAR PARA R$ ${x.melhor.preco}: este recebe ${a.visitas} visitas a R$ ${a.preco}, e o ${x.melhor.mlb} — mesma conta — já está ${x.dif}% mais barato com só ${x.melhor.visitas} visitas.`
          : a.mlb === x.melhor.mlb ? `É o mais barato do grupo, e traz só ${a.visitas} visitas.` : ""
        : x.noutraConta
          ? primeiro ? `O mais barato do produto está na conta ${x.melhor.conta}, que converte 0,23%. Igualar lá não resolve; se quiser o preço menor, é neste aqui.` : ""
          : primeiro ? "Recebe a visita E tem o menor preço do grupo. Nada a mover." : "";
      const r = ws.addRow([
        x.sku, String(x.titulo).slice(0, 24), x.n, x.vis, x.ven,
        a.mlb, a.conta, a.tipo, a.preco, a.promoTipo ?? "—", a.promoPreco,
        a.promoDesc != null ? a.promoDesc / 100 : null,
        a.visitas, a.vendas, a.conv != null ? a.conv / 100 : null,
        a.piso, a.catalogo || "—", a.adsInv, leitura,
      ]);
      [9, 11, 16, 18].forEach((c) => (r.getCell(c).numFmt = brl2));
      r.getCell(12).numFmt = "0.0%"; r.getCell(15).numFmt = "0.00%";
      r.alignment = { vertical: "top", wrapText: true };
      if (zebra) for (let c = 1; c <= cols.length; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIXA } };
      r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: a.conta === "São Paulo" ? CLARO : AMARELO } };
      if (primeiro) {
        r.getCell(6).font = { bold: true }; r.getCell(13).font = { bold: true };
        r.getCell(12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: desl ? VERMELHO : VERDE } };
        if (desl) r.getCell(19).font = { bold: true, color: { argb: "FFC00000" } };
      } else if (desl && a.mlb === x.melhor.mlb) {
        r.getCell(12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      }
      linha++;
    }
    if (x.linhas.length > 1) for (const c of [1, 2, 3, 4, 5]) ws.mergeCells(inicio, c, linha, c);
    for (const c of [1, 2, 3, 4, 5]) {
      const cel = ws.getCell(inicio, c);
      cel.alignment = { vertical: "middle", horizontal: c <= 2 ? "left" : "center", wrapText: true };
      if (desl) cel.font = { bold: true };
    }
    zebra = !zebra;
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 6 }, to: { row: 4, column: cols.length } };
}

/* ═══ 3 a 5. GRUPOS ═══ */
const abaGrupo = (nome, lista, descricao, acaoFn) => {
  const ws = wb.addWorksheet(nome);
  const cols = ["MLB", "SKU", "CONTA", "Tipo", "Visitas 12sem", "Vendas", "Conversão", "Receita 12sem", "Preço", "Promoção", "Desconto", "Piso", "Espaço", "Mais barato da casa", "Anúncios do SKU", "Catálogo", "Ads", "O QUE FAZER"];
  ws.columns = [{ width: 15 }, { width: 11 }, { width: 11 }, { width: 9 }, { width: 11 }, { width: 8 }, { width: 10 }, { width: 12 }, { width: 11 }, { width: 15 }, { width: 10 }, { width: 11 }, { width: 9 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 9 }, { width: 44 }];
  titulo(ws, nome.toUpperCase(), cols.length);
  txt(ws, descricao, cols.length);
  cab(ws, cols);
  for (const l of lista) {
    const r = ws.addRow([
      l.mlb, l.sku, l.conta, l.tipo, l.visitas, l.vendas,
      l.conv != null ? l.conv / 100 : null, l.receita, l.preco,
      l.promoTipo ?? "—", l.promoDesc != null ? l.promoDesc / 100 : null,
      l.piso, l.espaco != null ? l.espaco / 100 : null, l.maisBarato, l.irmaos,
      l.catalogo || "—", l.adsInv, acaoFn(l),
    ]);
    r.getCell(7).numFmt = "0.00%"; r.getCell(11).numFmt = "0.0%"; r.getCell(13).numFmt = "0%";
    [8, 9, 12, 14, 17].forEach((c) => (r.getCell(c).numFmt = brl));
    r.alignment = { wrapText: true, vertical: "top" };
    r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: l.conta === "São Paulo" ? CLARO : AMARELO } };
    if (l.conv != null && l.conv / 100 >= MEDIA) r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    else if (l.visitas >= 100) r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
    if (l.irmaos >= 6) r.getCell(15).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO } };
  }
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
};

abaGrupo("3 Trazer visita", A, [
  `${A.length} anúncios que convertem ${((soma(A, (l) => l.vendas) / soma(A, (l) => l.visitas)) * 100).toFixed(2)}% com apenas ${soma(A, (l) => l.visitas).toLocaleString("pt-BR")} visitas em 12 semanas — 21% das vendas da conta com 3% das visitas.`,
  `${A.filter((l) => l.adsInv == null).length} não têm nenhum investimento em Ads. É aqui que verba vira venda.`,
], (l) => l.adsInv == null ? "ABRIR Ads: R$ 20/dia e medir em 14 dias." : l.adsInv === 0 ? "Campanha sem verba. Subir o lance." : `Já tem R$ ${l.adsInv} — dobrar enquanto o ACOS ficar abaixo de 20%.`);

abaGrupo("4 Arrumar a oferta", B, [
  `${B.length} anúncios concentram ${soma(B, (l) => l.visitas).toLocaleString("pt-BR")} visitas (50% da conta) e convertem 0,29%.`,
  `NÃO comprar visita aqui. E preço também não resolve: a coluna Preço é a praticada, e ${B.filter((l) => l.espaco != null && l.espaco < 0).length} destes ${B.length} já vendem ABAIXO do piso. Os outros estão colados nele.`,
], (l) => {
  if (l.maisBarato != null && l.preco && l.maisBarato < l.preco * 0.85) return `A casa já tem por R$ ${l.maisBarato} e não vende: o problema NÃO é preço. Ver prazo, foto e título.`;
  if (l.espaco != null && l.espaco < 0) return "Já abaixo do piso. Ver prazo, foto e título.";
  if (l.catalogo === "competing" && l.paraGanhar && l.piso && l.paraGanhar >= l.piso) return `Baixar para R$ ${l.paraGanhar} ganha o catálogo e fica acima do piso.`;
  if (l.espaco != null && l.espaco > 35) return `${Math.round(l.espaco)}% acima do piso com ${l.visitas} visitas. Testar desconto até o piso.`;
  return "Rever foto, título e prazo antes de mexer no preço.";
});

abaGrupo("5 Visita sem venda", C, [
  `${C.length} anúncios receberam ${soma(C, (l) => l.visitas).toLocaleString("pt-BR")} visitas e NÃO venderam nada.`,
  `${C.filter((l) => l.adsInv > 0).length} ainda gastam Ads: R$ ${r0(soma(C, (l) => l.adsInv))} por janela de 30 dias.`,
], (l) => {
  if (l.adsInv > 0) return `DESLIGAR o Ads: R$ ${l.adsInv} sem nenhuma venda.`;
  if (l.irmaos >= 4) return `São ${l.irmaos} anúncios do mesmo SKU. Concentrar em um e encerrar este.`;
  if (l.estoque >= 40000) return "Sob encomenda: conferir o prazo que aparece no anúncio.";
  return "Rever a oferta inteira ou encerrar.";
});

/* ═══ 6. TODOS ═══ */
{
  const ws = wb.addWorksheet("6 Todos os anúncios");
  const cols = ["Grupo", "MLB", "SKU", "CONTA", "Tipo", "Status", "Visitas", "Vendas", "Conversão", "Receita", "Preço", "Promoção", "Desconto", "Piso", "Irmãos", "Catálogo", "Ads"];
  ws.columns = [{ width: 28 }, { width: 15 }, { width: 11 }, { width: 11 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 8 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 15 }, { width: 10 }, { width: 11 }, { width: 8 }, { width: 12 }, { width: 9 }];
  titulo(ws, `OS ${L.length} ANÚNCIOS MEDIDOS`, cols.length);
  cab(ws, cols);
  for (const l of [...L].sort((a, b) => a.grupo.localeCompare(b.grupo) || b.visitas - a.visitas)) {
    const r = ws.addRow([l.grupo, l.mlb, l.sku, l.conta, l.tipo, l.status, l.visitas, l.vendas, l.conv != null ? l.conv / 100 : null, l.receita, l.preco, l.promoTipo ?? "—", l.promoDesc != null ? l.promoDesc / 100 : null, l.piso, l.irmaos, l.catalogo || "—", l.adsInv]);
    r.getCell(9).numFmt = "0.00%"; r.getCell(13).numFmt = "0.0%";
    [10, 11, 14, 17].forEach((c) => (r.getCell(c).numFmt = brl));
    r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: l.conta === "São Paulo" ? CLARO : AMARELO } };
  }
  ws.views = [{ state: "frozen", xSplit: 4, ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };
}

await wb.xlsx.writeFile("output/PROBEL.xlsx");
console.log("escrito: output/PROBEL.xlsx");
console.log("  abas: " + wb.worksheets.map((w) => w.name).join(" · "));
console.log(`  A=${A.length} B=${B.length} C=${C.length} D=${D.length} E=${E.length}`);
console.log(`  ${grupos.length} produtos com 2+ anúncios · ${deslocados.length} com promoção deslocada`);
