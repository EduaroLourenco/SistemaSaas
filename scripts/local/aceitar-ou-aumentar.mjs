/**
 * Aceitar direto, aumentar a porcentagem, ou aumentar e trocar de faixa?
 *
 * ── A mecânica ──
 *
 * Na campanha com redução de tarifas o canal abate a comissão num VALOR FIXO
 * em reais (`SALE_FEE`). Como é valor fixo, a redução em PORCENTAGEM depende
 * do preço final:
 *
 *     reduzida = SALE_FEE / preço final
 *
 * Baixar o preço faz essa porcentagem SUBIR, e por isso a comissão que vale
 * para a consulta na tabela CAI:
 *
 *     faixa = arredonda para cima (comissão cheia − reduzida) em passos de 1
 *             ponto, com piso em 4,5%
 *
 * E a tabela tem um preço mínimo por faixa. Então empurrar o desconto pode
 * mudar a faixa — e aí o piso muda junto, quase sempre para baixo, abrindo
 * mais espaço. É o que torna a decisão não óbvia, e é exatamente o que esta
 * planilha responde, anúncio por anúncio:
 *
 *   ACEITAR DIRETO            a proposta do canal já cabe na tabela.
 *   AUMENTAR % — mesma faixa  dá para baixar mais e a faixa não muda.
 *   AUMENTAR % — muda a faixa dá para baixar e a faixa troca; a planilha
 *                             mostra as duas faixas, os dois preços de
 *                             tabela e a diferença entre eles.
 *   NÃO DÁ                    nem a proposta cabe, nem baixando.
 *
 * A regra de aceite é a mesma do motor (`motor-promocoes.ts`, caso A):
 * aprovado quando o preço final fica no máximo 5% abaixo da tabela da faixa.
 *
 * Uso:
 *   node scripts/local/aceitar-ou-aumentar.mjs "<pre-acordo.xlsx>" "<aba>"
 *
 * Ambiente:
 *   CENTRAIS  exportações "Com redução de tarifas" do canal, separadas por ";"
 *   API       planilha de "conferir-ofertas-api.mjs" (preço no ar hoje)
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const req = createRequire(RAIZ + "/");
const ExcelJS = req("exceljs");
const { createClient } = req("@supabase/supabase-js");

for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ARQUIVO = process.argv[2] ?? "C:/Users/dudu4/Downloads/Controle Probel 2026 (2).xlsx";
const ABA = process.argv[3] ?? "08-PRÉ-ACORDO OUTUBRO";
const API = process.env.API ?? "C:/Users/dudu4/Downloads/Ofertas-na-API.xlsx";
const CENTRAIS = (process.env.CENTRAIS ??
  "C:/Users/dudu4/Downloads/1_Com_reducao_de_tarifas-9ad89986-56fa-4525-80a0-3434de4be271-2026_10_04-23_03.xlsx"
).split(";").map((s) => s.trim()).filter(Boolean);

/* ── Os mesmos números do motor ── */
const DESCONTO_MINIMO = 0.05;
const COMISSAO_MINIMA = 0.045;
const CHEIA = { Clássico: 0.115, Premium: 0.165 };
const roundup = (x, d = 0) => {
  const m = 10 ** d;
  const v = x * m;
  return v > 0 ? Math.ceil(v - 1e-9) / m : -Math.ceil(-v - 1e-9) / m;
};

const txt = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return String(v.result ?? v.text ?? v.richText?.map((r) => r.text).join("") ?? "");
  return String(v);
};
const num = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && typeof v.result === "number") return v.result;
  const s = txt(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const x = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(x) ? x : null;
};
const R = (v) => (v == null ? "—" : (v < 0 ? "-" : "") + "R$ " + Math.abs(v).toFixed(2));
const Rk = (v) => (v == null ? "—" : "R$ " + Math.round(v).toLocaleString("pt-BR"));
const P = (v) => (v == null ? "—" : (v * 100).toFixed(1) + "%");

/* ── 1. A tabela de preço por faixa de comissão, do banco ── */
const paginar = async (t, c, filtro) => {
  const s = [];
  for (let d = 0; ; d += 1000) {
    let q = sb.from(t).select(c).range(d, d + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${t}: ${error.message}`);
    s.push(...data);
    if (data.length < 1000) break;
  }
  return s;
};
const versoes = await paginar("formula_base_precos", "vigente_de");
const vigente = [...new Set(versoes.map((v) => v.vigente_de))].sort().at(-1);
const precos = await paginar("formula_base_precos", "chave_tipo,chave,comissao,preco", (q) => q.eq("vigente_de", vigente));
const porSku = new Map(), porMlb = new Map();
for (const p of precos) {
  const alvo = p.chave_tipo === "mlb" ? porMlb : porSku;
  const k = String(p.chave);
  const linha = alvo.get(k) ?? {};
  linha[Math.round(Number(p.comissao) * 1000) / 1000] = Number(p.preco);
  alvo.set(k, linha);
}
const FAIXAS = [...new Set(precos.map((p) => Math.round(Number(p.comissao) * 1000) / 1000))].sort((a, b) => a - b);
console.log(`tabela vigente de ${vigente}: ${precos.length} preços, faixas ${FAIXAS.map(P).join(" ")}`);

const tabelaEm = (sku, mlb, comissao) => {
  const k = Math.round(comissao * 1000) / 1000;
  return porSku.get(sku)?.[k] ?? porMlb.get(mlb)?.[k] ?? null;
};

/* A faixa que vale para um preço final, dada a tarifa reduzida fixa. */
const faixaDe = (cheia, saleFee, preco) =>
  Math.max(Math.round(((roundup((cheia - saleFee / preco) * 100) + 0.5) / 100) * 10000) / 10000, COMISSAO_MINIMA);

/* Cabe? Mesma tolerância do motor. */
const cabe = (preco, tabela) => tabela == null ? false : tabela - preco < 0 || preco >= tabela * (1 - DESCONTO_MINIMO);

/* ── 2. O pré-acordo ── */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);
const ws = wb.getWorksheet(ABA) ?? wb.worksheets[0];
let cab = 0;
for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
  const l = [];
  for (let c = 1; c <= ws.columnCount; c++) l.push(txt(ws.getCell(r, c).value).trim().toUpperCase());
  if (l.includes("SKU") && l.includes("MLB")) { cab = r; break; }
}
const acordo = new Map();
for (let r = cab + 1; r <= ws.rowCount; r++) {
  const mlb = txt(ws.getCell(r, 2).value).trim();
  if (!/^MLB\d+/.test(mlb)) continue;
  const linha = {
    mlb, sku: txt(ws.getCell(r, 1).value).trim(), nome: txt(ws.getCell(r, 3).value).trim(),
    tipo: txt(ws.getCell(r, 4).value).trim(), rebate: num(ws.getCell(r, 6).value),
    acordado: num(ws.getCell(r, 7).value), retorno: txt(ws.getCell(r, 8).value).trim(),
  };
  const a = acordo.get(mlb);
  if (!a || (linha.acordado != null && (a.acordado == null || linha.acordado < a.acordado))) acordo.set(mlb, linha);
}
console.log(`pré-acordo: ${acordo.size} anúncios`);

/* ── 3. O preço no ar hoje ── */
const hoje = new Map();
if (fs.existsSync(API)) {
  const wa = new ExcelJS.Workbook();
  await wa.xlsx.readFile(API);
  const wsa = wa.worksheets[0];
  const cabA = [];
  for (let c = 1; c <= wsa.columnCount; c++) cabA.push(txt(wsa.getCell(5, c).value));
  const I = (n) => cabA.indexOf(n) + 1;
  for (let r = 6; r <= wsa.rowCount; r++) {
    const m = txt(wsa.getCell(r, I("MLB")).value).trim();
    if (/^MLB\d+/.test(m)) hoje.set(m, num(wsa.getCell(r, I("Mês: configurado")).value));
  }
}

/* ── 4. As candidaturas da central ── */
const cands = new Map();
for (const arq of CENTRAIS) {
  if (!fs.existsSync(arq)) { console.log(`aviso: não achei ${arq}`); continue; }
  const wc = new ExcelJS.Workbook();
  await wc.xlsx.readFile(arq);
  const wsc = wc.getWorksheet("Promoções") ?? wc.worksheets.at(-1);
  const tec = [];
  for (let c = 1; c <= wsc.columnCount; c++) tec.push(txt(wsc.getCell(1, c).value).trim().toUpperCase());
  const C = (n) => tec.indexOf(n) + 1;
  const cI = C("ITEM_ID"), cF = C("FINAL_PRICE"), cO = C("ORIGINAL_PRICE"), cS = C("SALE_FEE");
  const cSub = C("PROMO_SUB_TYPE"), cSt = C("STATUS"), cIni = C("START_DATE"), cFim = C("FINISH_DATE");
  if (cI < 1 || cF < 1 || cS < 1) { console.log(`aviso: ${arq.split("/").pop()} sem ITEM_ID/FINAL_PRICE/SALE_FEE`); continue; }
  let n = 0;
  for (let r = 2; r <= wsc.rowCount; r++) {
    const m = txt(wsc.getCell(r, cI).value).trim();
    if (!/^MLB\d+/.test(m)) continue;
    const final = num(wsc.getCell(r, cF).value), saleFee = num(wsc.getCell(r, cS).value);
    if (final == null || saleFee == null || !(final > 0)) continue;
    if (!cands.has(m)) cands.set(m, []);
    cands.get(m).push({
      final, saleFee, original: num(wsc.getCell(r, cO).value),
      sub: txt(wsc.getCell(r, cSub).value).trim(), status: txt(wsc.getCell(r, cSt).value).trim(),
      de: txt(wsc.getCell(r, cIni).value).slice(0, 10), ate: txt(wsc.getCell(r, cFim).value).slice(0, 10),
    });
    n++;
  }
  console.log(`central: ${n} candidaturas em "${arq.split("/").pop()}"`);
}

/* ── 5. Receita de 4 meses ── */
const [pedidos, itensPed, canais, contas, anuncios] = await Promise.all([
  paginar("pedidos", "id,data,conta_canal_id,cancelado"),
  paginar("pedido_itens", "pedido_id,codigo_externo,quantidade,preco_unitario"),
  paginar("canais", "id,codigo"),
  paginar("contas_canal", "id,nome,canal_id"),
  paginar("anuncios", "codigo_externo,sku_canal,estoque,conta_canal_id"),
]);
const idML = canais.filter((c) => c.codigo === "mercado_livre").map((c) => c.id);
const setML = new Set(contas.filter((c) => idML.includes(c.canal_id)).map((c) => c.id));
const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
const pedML = new Map(pedidos.filter((p) => !p.cancelado && setML.has(p.conta_canal_id)).map((p) => [p.id, p]));
const corte = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10);
const rec = new Map();
for (const it of itensPed) {
  const p = pedML.get(it.pedido_id);
  if (!p || String(p.data) < corte) continue;
  const m = String(it.codigo_externo).toUpperCase();
  rec.set(m, (rec.get(m) ?? 0) + Number(it.quantidade) * Number(it.preco_unitario));
}
const banco = new Map(anuncios.map((a) => [String(a.codigo_externo).toUpperCase(), a]));

/* ── 6. A decisão, candidatura por candidatura ── */
const linhas = [];
for (const [mlb, a] of acordo) {
  const lista = cands.get(mlb);
  if (!lista?.length) continue;
  /*
   * A coluna "SKU" da aba do pré-acordo é uma fórmula que tira o "MLB" do
   * código — ou seja, vem o número do anúncio, não o SKU. Usar aquilo na
   * tabela de preços não acha nada e todos caem em "não dá". O SKU de
   * verdade é o do anúncio no banco.
   */
  const skuReal = banco.get(mlb)?.sku_canal ? String(banco.get(mlb).sku_canal).trim() : a.sku;
  const cheia = CHEIA[a.tipo] ?? CHEIA.Clássico;
  const b = banco.get(mlb);

  /* a melhor candidatura: a que permite o menor preço que ainda cabe */
  let melhorCand = null;
  for (const c of lista) {
    const faixaProposta = faixaDe(cheia, c.saleFee, c.final);
    const tabProposta = tabelaEm(skuReal, mlb, faixaProposta);
    const propostaCabe = cabe(c.final, tabProposta);

    /*
     * Varredura de um centavo, do piso possível até a proposta. A aprovação
     * não é monótona no preço — a tarifa reduzida é fixa em reais, então
     * baixar o preço muda a faixa e muda o alvo —, por isso não dá para
     * parar na primeira recusa: varre tudo e pega o menor que cabe.
     */
    const menorTab = Math.min(...FAIXAS.map((f) => tabelaEm(skuReal, mlb, f)).filter((x) => x != null), c.final);
    const de = Math.max(1, Math.floor(menorTab * (1 - DESCONTO_MINIMO) * 100));
    const ate = Math.round(c.final * 100);
    let melhorPreco = null, faixaMelhor = null, tabMelhor = null;
    for (let cent = de; cent <= ate; cent++) {
      const p = cent / 100;
      const f = faixaDe(cheia, c.saleFee, p);
      const t = tabelaEm(skuReal, mlb, f);
      if (!cabe(p, t)) continue;
      melhorPreco = p; faixaMelhor = f; tabMelhor = t;
      break; /* varrendo de baixo para cima, o primeiro que cabe é o menor */
    }
    const cand = {
      ...c, faixaProposta, tabProposta, propostaCabe,
      melhorPreco, faixaMelhor, tabMelhor,
      podeBaixar: melhorPreco != null ? c.final - melhorPreco : null,
    };
    if (!melhorCand || (cand.melhorPreco ?? Infinity) < (melhorCand.melhorPreco ?? Infinity)) melhorCand = cand;
  }
  if (!melhorCand) continue;
  const c = melhorCand;

  const mudaFaixa = c.faixaMelhor != null && Math.abs(c.faixaMelhor - c.faixaProposta) > 1e-9;
  const acao =
    c.melhorPreco == null
      ? "NÃO DÁ — nem a proposta nem baixando cabe na tabela"
      : c.propostaCabe && c.podeBaixar < 0.01
        ? "ACEITAR DIRETO — a proposta já cabe e não há espaço"
        : c.propostaCabe
          ? mudaFaixa
            ? "ACEITAR ou AUMENTAR % — se aumentar, a faixa muda"
            : "ACEITAR ou AUMENTAR % — a faixa não muda"
          : mudaFaixa
            ? "AUMENTAR % — e a faixa muda"
            : "AUMENTAR % — a faixa não muda";

  linhas.push({
    sku: skuReal, mlb, nome: a.nome, tipo: a.tipo,
    conta: b ? (nomeConta.get(b.conta_canal_id) ?? "") : "",
    estoque: b?.estoque ?? null,
    receita: rec.get(mlb) ?? 0,
    rebatePedido: a.rebate, acordado: a.acordado, retorno: a.retorno,
    hoje: hoje.get(mlb) ?? null,
    comissaoCheia: cheia,
    saleFee: c.saleFee,
    cheio: c.original,
    propostaML: c.final,
    descProposto: c.original ? 1 - c.final / c.original : null,
    reduzidaProposta: c.saleFee / c.final,
    faixaProposta: c.faixaProposta,
    tabProposta: c.tabProposta,
    propostaCabe: c.propostaCabe ? "sim" : "NÃO",
    melhorPreco: c.melhorPreco,
    descMelhor: c.original && c.melhorPreco ? 1 - c.melhorPreco / c.original : null,
    reduzidaMelhor: c.melhorPreco ? c.saleFee / c.melhorPreco : null,
    faixaMelhor: c.faixaMelhor,
    tabMelhor: c.tabMelhor,
    mudaFaixa: c.melhorPreco == null ? "" : mudaFaixa ? "SIM" : "não",
    difFaixa: c.faixaMelhor != null ? c.faixaMelhor - c.faixaProposta : null,
    difTabela: c.tabMelhor != null && c.tabProposta != null ? c.tabMelhor - c.tabProposta : null,
    podeBaixar: c.podeBaixar,
    podeBaixarPct: c.podeBaixar != null && c.final ? c.podeBaixar / c.final : null,
    melhorVsAcordo: c.melhorPreco != null && a.acordado != null ? c.melhorPreco - a.acordado : null,
    acao,
    campanha: c.sub, janela: `${c.de} a ${c.ate}`, statusCamp: c.status,
  });
}
linhas.sort((x, y) => y.receita - x.receita);

const grupo = (f) => linhas.filter(f);
const g1 = grupo((l) => l.acao.startsWith("ACEITAR DIRETO"));
const g2 = grupo((l) => l.acao.includes("a faixa não muda"));
const g3 = grupo((l) => l.acao.includes("faixa muda"));
const g4 = grupo((l) => l.acao.startsWith("NÃO DÁ"));

console.log(`\n${linhas.length} anúncios do pré-acordo estão na campanha de redução\n`);
for (const [nome, g] of [["ACEITAR DIRETO (sem espaço para mais)", g1], ["pode AUMENTAR % e a faixa NÃO muda", g2], ["pode AUMENTAR % e a FAIXA MUDA", g3], ["NÃO DÁ", g4]]) {
  console.log(`  ${String(g.length).padStart(3)}  ${nome.padEnd(40)} ${Rk(g.reduce((s, l) => s + l.receita, 0)).padStart(12)} em 4 meses`);
}

console.log(`\n\nOS QUE MUDAM DE FAIXA — a diferença que você pediu\n`);
console.log("  SKU          MLB            receita   proposta   faixa  tabela      melhor    faixa  tabela      dif. faixa  dif. tabela  pode baixar");
for (const l of g3.slice(0, 20)) {
  console.log(
    `  ${String(l.sku || "—").padEnd(11)}  ${l.mlb}  ${Rk(l.receita).padStart(9)}  ${R(l.propostaML).padStart(9)}  ${P(l.faixaProposta).padStart(5)}  ${R(l.tabProposta).padStart(9)}  ` +
    `${R(l.melhorPreco).padStart(9)}  ${P(l.faixaMelhor).padStart(5)}  ${R(l.tabMelhor).padStart(9)}  ` +
    `${(l.difFaixa != null ? (l.difFaixa > 0 ? "+" : "") + (l.difFaixa * 100).toFixed(1) + "pp" : "—").padStart(10)}  ${R(l.difTabela).padStart(11)}  ${R(l.podeBaixar).padStart(11)}`
  );
}

console.log(`\n\nOS QUE DÁ PARA AUMENTAR SEM MUDAR DE FAIXA\n`);
console.log("  SKU          MLB            receita   proposta    melhor    pode baixar   faixa   acordado   melhor vs acordo");
for (const l of g2.slice(0, 20)) {
  console.log(
    `  ${String(l.sku || "—").padEnd(11)}  ${l.mlb}  ${Rk(l.receita).padStart(9)}  ${R(l.propostaML).padStart(9)}  ${R(l.melhorPreco).padStart(9)}  ` +
    `${R(l.podeBaixar).padStart(12)}  ${P(l.faixaMelhor).padStart(6)}  ${R(l.acordado).padStart(9)}  ${R(l.melhorVsAcordo).padStart(16)}`
  );
}

/* ── 7. A planilha ── */
const TINTA = "FF1F2430", SUAVE = "FF6B7280", RISCO = "FFE5E7EB", FUNDO = "FFF3F4F6";
const out = new ExcelJS.Workbook();
out.creator = "Plataforma Probel";
const aba = out.addWorksheet("Aceitar ou aumentar", { views: [{ state: "frozen", xSplit: 2, ySplit: 6 }] });
const COLS = [
  { h: "SKU", k: "sku", w: 12 }, { h: "MLB", k: "mlb", w: 15 },
  { h: "Produto", k: "nome", w: 38 }, { h: "Tipo", k: "tipo", w: 9 },
  { h: "Conta", k: "conta", w: 18, suave: true },
  { h: "Receita 4 meses", k: "receita", w: 13, fmt: "#,##0.00", forte: true },
  { h: "Estoque", k: "estoque", w: 9, fmt: "#,##0" },
  { h: "O QUE FAZER", k: "acao", w: 42, forte: true },
  { h: "Rebate pedido no acordo", k: "rebatePedido", w: 11, fmt: "0%", suave: true },
  { h: "Acordado no pré-acordo", k: "acordado", w: 13, fmt: "#,##0.00" },
  { h: "No ar hoje", k: "hoje", w: 12, fmt: "#,##0.00" },
  { h: "Preço cheio", k: "cheio", w: 12, fmt: "#,##0.00", suave: true },
  { h: "Comissão cheia", k: "comissaoCheia", w: 10, fmt: "0.0%", suave: true },
  { h: "Tarifa reduzida R$ (SALE_FEE)", k: "saleFee", w: 12, fmt: "#,##0.00" },
  { h: "PROPOSTA do ML", k: "propostaML", w: 13, fmt: "#,##0.00", forte: true },
  { h: "Desconto da proposta", k: "descProposto", w: 11, fmt: "0.0%" },
  { h: "Redução % na proposta", k: "reduzidaProposta", w: 11, fmt: "0.00%" },
  { h: "FAIXA na proposta", k: "faixaProposta", w: 11, fmt: "0.0%", forte: true },
  { h: "Tabela dessa faixa", k: "tabProposta", w: 13, fmt: "#,##0.00" },
  { h: "A proposta cabe?", k: "propostaCabe", w: 11 },
  { h: "MELHOR PREÇO aumentando %", k: "melhorPreco", w: 14, fmt: "#,##0.00", forte: true },
  { h: "Desconto no melhor", k: "descMelhor", w: 11, fmt: "0.0%" },
  { h: "Redução % no melhor", k: "reduzidaMelhor", w: 11, fmt: "0.00%" },
  { h: "FAIXA no melhor", k: "faixaMelhor", w: 11, fmt: "0.0%", forte: true },
  { h: "Tabela dessa faixa", k: "tabMelhor", w: 13, fmt: "#,##0.00" },
  { h: "A FAIXA MUDA?", k: "mudaFaixa", w: 11, forte: true },
  { h: "Diferença de faixa", k: "difFaixa", w: 11, fmt: "0.0%", forte: true },
  { h: "Diferença de tabela", k: "difTabela", w: 13, fmt: "#,##0.00", forte: true },
  { h: "Pode baixar R$", k: "podeBaixar", w: 12, fmt: "#,##0.00", forte: true },
  { h: "Pode baixar %", k: "podeBaixarPct", w: 11, fmt: "0.0%" },
  { h: "Melhor − acordado", k: "melhorVsAcordo", w: 13, fmt: "#,##0.00" },
  { h: "Retorno do Meli", k: "retorno", w: 22, suave: true },
  { h: "Campanha", k: "campanha", w: 14, suave: true },
  { h: "Vigência", k: "janela", w: 22, suave: true },
];
aba.columns = COLS.map((c) => ({ key: c.k, width: c.w }));
aba.mergeCells(1, 1, 1, COLS.length);
aba.getCell(1, 1).value = "Campanha com redução de tarifas — aceitar direto, aumentar a porcentagem, ou aumentar e trocar de faixa";
aba.getCell(1, 1).font = { size: 13, bold: true, color: { argb: TINTA } };
aba.getRow(1).height = 22;
aba.mergeCells(2, 1, 2, COLS.length);
aba.getCell(2, 1).value =
  `${linhas.length} anúncios · ${g1.length} aceitar direto · ${g2.length} aumentar sem mudar de faixa · ${g3.length} aumentar mudando de faixa · ${g4.length} não dá · tabela de ${vigente} · ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
aba.getCell(2, 1).font = { size: 9, color: { argb: SUAVE } };
aba.mergeCells(3, 1, 5, COLS.length);
aba.getCell(3, 1).value =
  'A tarifa reduzida é um VALOR FIXO em reais, então a redução em porcentagem = SALE_FEE ÷ preço final: baixar o preço aumenta a redução e DERRUBA a faixa de comissão usada na tabela. ' +
  'FAIXA na proposta é a faixa que vale no preço que o canal mandou; FAIXA no melhor é a que passa a valer se você aumentar o desconto até o limite. ' +
  'Quando as duas diferem, a coluna "Diferença de tabela" mostra quanto o seu piso muda — é a conta que decide se vale aumentar. ' +
  'Aceite pela mesma regra do sistema: o preço final pode ficar até 5% abaixo da tabela da faixa.';
aba.getCell(3, 1).font = { size: 9, italic: true, color: { argb: "FF8A5A06" } };
aba.getCell(3, 1).alignment = { wrapText: true, vertical: "top" };
aba.getRow(3).height = 42;
const linhaCab = aba.getRow(6);
COLS.forEach((c, k) => {
  const cel = linhaCab.getCell(k + 1);
  cel.value = c.h;
  cel.font = { size: 9, bold: true, color: { argb: TINTA } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUNDO } };
  cel.alignment = { vertical: "middle", horizontal: c.fmt ? "right" : "left", wrapText: true };
  cel.border = { bottom: { style: "thin", color: { argb: RISCO } } };
});
linhaCab.height = 34;
const COR = { aceitar: "FF15803D", mesma: "FF1D4ED8", muda: "FFB45309", nao: "FFB91C1C" };
const classe = (l) => (l.acao.startsWith("ACEITAR DIRETO") ? "aceitar" : l.acao.includes("faixa muda") ? "muda" : l.acao.startsWith("NÃO DÁ") ? "nao" : "mesma");
const FUNDOS = { aceitar: "FFF0FDF4", mesma: "FFEFF6FF", muda: "FFFFF7ED", nao: "FFFEF2F2" };
for (const l of linhas) {
  const linha = aba.addRow(l);
  linha.height = 15;
  const k = classe(l);
  COLS.forEach((c, i) => {
    const cel = linha.getCell(i + 1);
    cel.font = { size: 9, color: { argb: c.suave ? SUAVE : TINTA } };
    if (c.fmt) { cel.numFmt = c.fmt; cel.alignment = { horizontal: "right" }; }
    if (c.forte) cel.font = { size: 9, bold: true, color: { argb: TINTA } };
    cel.border = { bottom: { style: "hair", color: { argb: RISCO } } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUNDOS[k] } };
  });
  for (const chave of ["acao", "mudaFaixa", "difFaixa", "difTabela"]) {
    const i = COLS.findIndex((c) => c.k === chave);
    if (i >= 0) linha.getCell(i + 1).font = { size: 9, bold: true, color: { argb: COR[k] } };
  }
}
aba.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: COLS.length } };
const destino = process.env.SAIDA ?? "C:/Users/dudu4/Downloads/Aceitar-ou-aumentar.xlsx";
await out.xlsx.writeFile(destino);
console.log(`\n\u2713 ${destino}`);
