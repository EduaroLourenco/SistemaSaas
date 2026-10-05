/**
 * As três ofertas do pré-acordo, conferidas na API: rodando, programada ou não existe.
 *
 * ── De onde vem a resposta ──
 *
 * `/items/{id}/prices` devolve TODAS as regras de preço do anúncio, cada uma
 * com valor, início e fim. É o único endpoint que responde isso para esta
 * aplicação: `/seller-promotions/*`, que diria também o NOME da campanha,
 * devolve 403 por falta de escopo.
 *
 * ── Como cada regra é atribuída a um patamar ──
 *
 * A API não diz "esta é a oferta do dia". Então o patamar sai da JANELA, que
 * é o que define cada tipo de oferta no canal, medido nas regras reais do
 * acordo:
 *
 *     mês            20 dias ou mais
 *     oferta do dia  de 12 a 48 horas
 *     relâmpago      até 6 horas
 *     outra          o que sobra (campanha do canal, 15 dias etc.)
 *
 * E o valor acordado serve de confirmação: quando a regra da janela certa bate
 * com o preço acordado, a leitura é segura; quando não bate, a coluna "bate o
 * preço?" avisa, porque aí pode ser regra de outra campanha ocupando a mesma
 * janela.
 *
 * Uso:
 *   node scripts/local/conferir-ofertas-api.mjs ["<pre-acordo.xlsx>" "<aba>"]
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const req = createRequire(RAIZ + "/");
const ExcelJS = req("exceljs");
const { createClient } = req("@supabase/supabase-js");

for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) {
    process.env[l.slice(0, i)] = l.slice(i + 1).trim();
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ARQUIVO = process.argv[2] ?? "C:/Users/dudu4/Downloads/Controle Probel 2026 (2).xlsx";
const ABA = process.argv[3] ?? "08-PRÉ-ACORDO OUTUBRO";

const TOKENS = [
  "C:/Users/dudu4/OneDrive/Desktop/Meli+/.meli/token.json",
  "C:/Users/dudu4/OneDrive/Desktop/apis/Mercado Livre Principal/.meli/token.json",
];

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
const SP = { timeZone: "America/Sao_Paulo" };
const quando = (ms) =>
  ms == null ? "" : new Date(ms).toLocaleString("pt-BR", { ...SP, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dia = (ms) => (ms == null ? "" : new Date(ms).toLocaleDateString("pt-BR", { ...SP, day: "2-digit", month: "2-digit" }));

/* ── O acordo ── */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);
const ws = wb.getWorksheet(ABA) ?? wb.worksheets[0];

let cab = 0;
for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
  const linha = [];
  for (let c = 1; c <= ws.columnCount; c++) linha.push(txt(ws.getCell(r, c).value).trim().toUpperCase());
  if (linha.includes("SKU") && linha.includes("MLB")) { cab = r; break; }
}

/*
 * `SOMENTE=MLB1,MLB2` restringe a conferência a esses anúncios. Serve para
 * olhar só o grupo que já está acertado, sem gastar chamada nos que ainda
 * vão ser enviados de novo.
 */
const SOMENTE = process.env.SOMENTE
  ? new Set(process.env.SOMENTE.split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))
  : null;

/** As datas que foram pedidas para as ofertas curtas (DATA 1..DATA 5). */
function datasPedidas(r) {
  const saida = [];
  for (const c of [19, 20, 21, 22, 23]) {
    const v = ws.getCell(r, c).value;
    const d = v instanceof Date ? v : typeof v === "object" && v?.result instanceof Date ? v.result : null;
    if (d && !Number.isNaN(d.getTime())) saida.push(d);
  }
  return saida;
}

const itens = [];
for (let r = cab + 1; r <= ws.rowCount; r++) {
  const mlb = txt(ws.getCell(r, 2).value).trim();
  if (!/^MLB\d+/.test(mlb)) continue;
  if (SOMENTE && !SOMENTE.has(mlb.toUpperCase())) continue;
  itens.push({
    mlb,
    sku: txt(ws.getCell(r, 1).value).trim(),
    nome: txt(ws.getCell(r, 3).value).trim(),
    tipo: txt(ws.getCell(r, 4).value).trim(),
    rebate: num(ws.getCell(r, 6).value),
    acordo: { mes: num(ws.getCell(r, 7).value), dia: num(ws.getCell(r, 15).value), rel: num(ws.getCell(r, 11).value) },
    retorno: txt(ws.getCell(r, 8).value).trim(),
    datas: datasPedidas(r),
  });
}
console.log(`${itens.length} anúncios${SOMENTE ? ` (filtrado de ${SOMENTE.size} pedidos)` : ""} no acordo "${ws.name}"`);

/* ── Conta, estoque e situação, do sistema ── */
const todas = async (t, c) => {
  const s = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from(t).select(c).range(d, d + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    s.push(...data);
    if (data.length < 1000) break;
  }
  return s;
};
const [anuncios, contas] = await Promise.all([
  todas("anuncios", "codigo_externo,status,estoque,conta_canal_id"),
  todas("contas_canal", "id,nome,identificador"),
]);
const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
const vendedorDaConta = new Map(contas.filter((c) => c.identificador).map((c) => [c.id, String(c.identificador)]));
const porMlb = new Map(anuncios.map((a) => [String(a.codigo_externo).toUpperCase(), a]));

/* ── Tokens ── */
const H = new Map();
for (const caminho of TOKENS) {
  if (!fs.existsSync(caminho)) continue;
  const t = JSON.parse(fs.readFileSync(caminho, "utf8").replace(/^\uFEFF/, ""));
  if (Date.parse(t.createdAt ?? 0) + (t.expires_in ?? 21600) * 1000 < Date.now() + 60_000) {
    console.log(`\u2717 token vencido em ${caminho} — rode "node ./src/cli.mjs me" naquela pasta`);
    process.exit(1);
  }
  H.set(String(t.user_id), { Authorization: "Bearer " + t.access_token, Accept: "application/json" });
}
if (!H.size) { console.log("\u2717 nenhum token encontrado."); process.exit(1); }

/* ── As regras, uma consulta por anúncio ── */
const AGORA = Date.now();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let lidos = 0;
const falhas = [];
for (const it of itens) {
  const b = porMlb.get(it.mlb);
  it.conta = b ? (nomeConta.get(b.conta_canal_id) ?? "") : "";
  it.situacao = b?.status ?? "não sincronizado";
  it.estoque = b?.estoque ?? null;
  const dono = b ? vendedorDaConta.get(b.conta_canal_id) : null;
  const ordem = dono && H.has(dono) ? [H.get(dono), ...[...H.values()].filter((h) => h !== H.get(dono))] : [...H.values()];
  it.regras = null;
  for (const h of ordem) {
    const r = await fetch(`https://api.mercadolibre.com/items/${it.mlb}/prices`, { headers: h });
    if (r.ok) { it.regras = (await r.json()).prices ?? []; lidos++; break; }
    await espera(200);
  }
  if (!it.regras) falhas.push(it.mlb);
  await espera(240);
}
console.log(`regras lidas na API: ${lidos} de ${itens.length}${falhas.length ? ` · sem resposta: ${falhas.join(", ")}` : ""}`);

/* ── Janela → patamar ── */
const HORA = 3600_000;
function patamarDaJanela(ini, fim) {
  if (ini == null || fim == null) return "sem janela";
  const h = (fim - ini) / HORA;
  if (h <= 6) return "rel";
  if (h >= 12 && h <= 48) return "dia";
  if (h >= 20 * 24) return "mes";
  return "outra";
}

const PERTO = 0.75; /* a planilha guarda 2495,145 e o canal publica 2495,15 */
const PATAMARES = [
  { k: "mes", nome: "Mês" },
  { k: "dia", nome: "Oferta do dia" },
  { k: "rel", nome: "Relâmpago" },
];

for (const it of itens) {
  it.linhas = {};
  if (!it.regras) {
    for (const p of PATAMARES) it.linhas[p.k] = { estado: "sem resposta da API" };
    continue;
  }
  const regras = it.regras
    .filter((p) => p.type !== "standard")
    .map((p) => {
      const ini = Date.parse(p.conditions?.start_time ?? "") || null;
      const fim = Date.parse(p.conditions?.end_time ?? "") || null;
      return {
        valor: Number(p.amount),
        ini,
        fim,
        patamar: patamarDaJanela(ini, fim),
        horas: ini != null && fim != null ? (fim - ini) / HORA : null,
        estado: ini != null && AGORA < ini ? "PROGRAMADA" : fim != null && AGORA > fim ? "encerrada" : "ativa",
      };
    });
  it.padrao = it.regras.find((p) => p.type === "standard")?.amount ?? null;
  it.outras = regras.filter((r) => r.patamar === "outra" || r.patamar === "sem janela");

  /*
   * As datas pedidas para as ofertas curtas: existe regra COMEÇANDO naquele
   * dia? É a pergunta direta — "a oferta do dia de 09/10 está programada?".
   * Comparo pelo dia no fuso de São Paulo, porque a API responde em UTC.
   */
  const diaSP = (ms) => new Intl.DateTimeFormat("en-CA", { ...SP, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  it.agenda = (it.datas ?? []).map((d) => {
    const alvoDia = diaSP(d.getTime());
    const achada = regras.find((r) => r.ini != null && diaSP(r.ini) === alvoDia && (r.patamar === "dia" || r.patamar === "rel"));
    const qualquer = regras.find((r) => r.ini != null && diaSP(r.ini) === alvoDia);
    return {
      data: d,
      dia: dia(d.getTime()),
      passou: d.getTime() < AGORA,
      achada: achada ?? qualquer ?? null,
      tipo: achada ? (achada.patamar === "dia" ? "oferta do dia" : "relâmpago") : qualquer ? "outra janela" : null,
    };
  });

  for (const p of PATAMARES) {
    const alvo = it.acordo[p.k];
    const doPatamar = regras.filter((r) => r.patamar === p.k);
    if (alvo == null) {
      it.linhas[p.k] = { estado: doPatamar.length ? "existe, mas não foi acordada" : "não foi acordada", achadas: doPatamar };
      continue;
    }
    if (!doPatamar.length) { it.linhas[p.k] = { estado: "NÃO EXISTE", alvo, achadas: [] }; continue; }
    /* a que bate o preço primeiro; se nenhuma bater, a mais perto */
    const bate = doPatamar.filter((r) => Math.abs(r.valor - alvo) <= PERTO);
    const esc = (bate.length ? bate : doPatamar)
      .sort((a, b) => (a.estado === "ativa" ? -1 : b.estado === "ativa" ? 1 : 0) || Math.abs(a.valor - alvo) - Math.abs(b.valor - alvo))[0];
    it.linhas[p.k] = {
      estado: esc.estado === "PROGRAMADA" ? `PROGRAMADA para ${quando(esc.ini)}` : esc.estado === "ativa" ? "ATIVA" : `encerrada em ${dia(esc.fim)}`,
      cru: esc.estado,
      alvo,
      valor: esc.valor,
      dif: esc.valor - alvo,
      batePreco: Math.abs(esc.valor - alvo) <= PERTO ? "sim" : "NÃO",
      inicio: esc.ini,
      fim: esc.fim,
      janela: esc.ini != null && esc.fim != null ? `${quando(esc.ini)} a ${quando(esc.fim)}` : "",
      horas: esc.horas,
      quantas: doPatamar.length,
      achadas: doPatamar,
    };
  }
}

/* ── Console ── */
const R = (v) => (v == null ? "—" : v.toFixed(2));
const resumo = {};
for (const p of PATAMARES) {
  const c = new Map();
  for (const it of itens) {
    const e = it.linhas[p.k]?.cru ?? it.linhas[p.k]?.estado ?? "?";
    const k = e === "ativa" ? "ATIVA" : e === "PROGRAMADA" ? "PROGRAMADA" : e === "encerrada" ? "encerrada" : String(e);
    c.set(k, (c.get(k) ?? 0) + 1);
  }
  resumo[p.nome] = c;
}
console.log(`\nO QUE A API DIZ, agora (${new Date().toLocaleString("pt-BR", SP)})\n`);
for (const [nome, c] of Object.entries(resumo)) {
  console.log(`  ${nome}`);
  for (const [k, v] of [...c].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(3)}  ${k}`);
}

const programadas = itens.flatMap((it) =>
  PATAMARES.filter((p) => it.linhas[p.k]?.cru === "PROGRAMADA").map((p) => ({ it, p, l: it.linhas[p.k] }))
);
if (programadas.length) {
  console.log(`\nAS PROGRAMADAS — quando começam\n`);
  console.log("  MLB            patamar        começa em         termina em        valor     acordado  bate?");
  for (const { it, p, l } of programadas.sort((a, b) => a.l.inicio - b.l.inicio)) {
    console.log(
      `  ${it.mlb}  ${p.nome.padEnd(13)}  ${quando(l.inicio).padEnd(16)}  ${quando(l.fim).padEnd(16)}  ${R(l.valor).padStart(8)}  ${R(l.alvo).padStart(8)}  ${l.batePreco}`
    );
  }
}

console.log(`\nDETALHE POR ANÚNCIO\n`);
for (const it of itens) {
  const e = (k) => it.linhas[k]?.estado ?? "—";
  console.log(`── ${it.mlb}  ${it.sku}  ${it.tipo}  rebate ${it.rebate != null ? Math.round(it.rebate * 100) + "%" : "—"}  (${it.conta})  estoque ${it.estoque ?? "—"}`);
  for (const p of PATAMARES) {
    const l = it.linhas[p.k];
    if (!l) continue;
    const extra = l.valor != null ? `  ${R(l.valor)} (acordo ${R(l.alvo)}${l.batePreco === "NÃO" ? ", NÃO BATE" : ""})  ${l.janela}` : l.alvo != null ? `  acordo ${R(l.alvo)}` : "";
    console.log(`     ${p.nome.padEnd(13)} ${l.estado}${extra}`);
  }
  if (it.agenda?.length) {
    console.log(
      `     datas pedidas:  ${it.agenda
        .map((a) => `${a.dia} ${a.achada ? `tem regra (${a.tipo}, ${R(a.achada.valor)})` : a.passou ? "PASSOU SEM NADA" : "nada agendado"}`)
        .join("  ·  ")}`
    );
  }
  if (it.outras.length) {
    console.log(`     outras regras: ${it.outras.map((r) => `${R(r.valor)} ${r.estado} ${dia(r.ini)}-${dia(r.fim)}`).join("  ·  ")}`);
  }
}

/* ── A planilha ── */
const TINTA = "FF1F2430", SUAVE = "FF6B7280", RISCO = "FFE5E7EB", FUNDO = "FFF3F4F6";
const out = new ExcelJS.Workbook();
out.creator = "Plataforma Probel";
const aba = out.addWorksheet("Ofertas na API", { views: [{ state: "frozen", xSplit: 2, ySplit: 5 }] });

const COLS = [
  { h: "SKU", k: "sku", w: 12 },
  { h: "MLB", k: "mlb", w: 15 },
  { h: "Produto", k: "nome", w: 40 },
  { h: "Tipo", k: "tipo", w: 9 },
  { h: "Conta", k: "conta", w: 20, suave: true },
  { h: "Estoque", k: "estoque", w: 9, fmt: "#,##0" },
  { h: "Rebate", k: "rebateTxt", w: 8 },
  { h: "Retorno do Meli", k: "retorno", w: 22, suave: true },
];
for (const p of PATAMARES) {
  COLS.push(
    { h: `${p.nome}: situação`, k: `${p.k}Estado`, w: 20, forte: true },
    { h: `${p.nome}: começa`, k: `${p.k}Inicio`, w: 15 },
    { h: `${p.nome}: termina`, k: `${p.k}Fim`, w: 15 },
    { h: `${p.nome}: configurado`, k: `${p.k}Valor`, w: 13, fmt: "#,##0.00" },
    { h: `${p.nome}: acordado`, k: `${p.k}Alvo`, w: 13, fmt: "#,##0.00" },
    { h: `${p.nome}: dif.`, k: `${p.k}Dif`, w: 10, fmt: "#,##0.00" },
    { h: `${p.nome}: bate o preço?`, k: `${p.k}Bate`, w: 11 }
  );
}
COLS.push({ h: "Preço cheio", k: "padrao", w: 12, fmt: "#,##0.00", suave: true });
COLS.push({ h: "Datas pedidas para as ofertas curtas", k: "agendaTxt", w: 70, forte: true });
COLS.push({ h: "Outras regras no anúncio", k: "outrasTxt", w: 60, suave: true });
aba.columns = COLS.map((c) => ({ key: c.k, width: c.w }));

aba.mergeCells(1, 1, 1, COLS.length);
aba.getCell(1, 1).value = "Pré-acordo de outubro — as três ofertas conferidas na API do Mercado Livre";
aba.getCell(1, 1).font = { size: 13, bold: true, color: { argb: TINTA } };
aba.getRow(1).height = 22;
aba.mergeCells(2, 1, 2, COLS.length);
aba.getCell(2, 1).value = `${itens.length} anúncios · lido de /items/{id}/prices em ${new Date().toLocaleString("pt-BR", SP)}`;
aba.getCell(2, 1).font = { size: 9, color: { argb: SUAVE } };
aba.mergeCells(3, 1, 4, COLS.length);
aba.getCell(3, 1).value =
  'ATIVA = rodando agora. PROGRAMADA = já criada e começa na data da coluna "começa". NÃO EXISTE = o canal não criou essa oferta. ' +
  'O patamar de cada regra sai da JANELA (mês = 20 dias ou mais, oferta do dia = 12 a 48 horas, relâmpago = até 6 horas), porque a API não diz de qual campanha a regra é. ' +
  'Quando "bate o preço?" diz NÃO, a regra ocupa a janela certa com outro valor — pode ser de outra campanha; confirme o nome no painel.';
aba.getCell(3, 1).font = { size: 9, italic: true, color: { argb: "FF8A5A06" } };
aba.getCell(3, 1).alignment = { wrapText: true, vertical: "top" };
aba.getRow(3).height = 30;

const linhaCab = aba.getRow(5);
COLS.forEach((c, k) => {
  const cel = linhaCab.getCell(k + 1);
  cel.value = c.h;
  cel.font = { size: 9, bold: true, color: { argb: TINTA } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUNDO } };
  cel.alignment = { vertical: "middle", horizontal: c.fmt ? "right" : "left", wrapText: true };
  cel.border = { bottom: { style: "thin", color: { argb: RISCO } } };
});
linhaCab.height = 30;

const TOM = { ATIVA: "FF15803D", PROGRAMADA: "FF1D4ED8", "NÃO EXISTE": "FFB91C1C", encerrada: "FFB45309" };
const corDoEstado = (e) => (e?.startsWith("ATIVA") ? TOM.ATIVA : e?.startsWith("PROGRAMADA") ? TOM.PROGRAMADA : e?.startsWith("NÃO EXISTE") ? TOM["NÃO EXISTE"] : e?.startsWith("encerrada") ? TOM.encerrada : null);

/* ativa primeiro, depois programada, e o que não existe por último */
const peso = (it) => PATAMARES.reduce((s, p) => s + ({ ativa: 0, PROGRAMADA: 1 }[it.linhas[p.k]?.cru] ?? 2), 0);
for (const it of [...itens].sort((a, b) => peso(a) - peso(b) || a.sku.localeCompare(b.sku))) {
  const reg = {
    sku: it.sku, mlb: it.mlb, nome: it.nome, tipo: it.tipo, conta: it.conta, estoque: it.estoque,
    rebateTxt: it.rebate != null ? `${Math.round(it.rebate * 100)}%` : "",
    retorno: it.retorno, padrao: it.padrao,
    outrasTxt: (it.outras ?? []).map((r) => `${R(r.valor)} ${r.estado} ${dia(r.ini)}-${dia(r.fim)}`).join("  ·  "),
    agendaTxt: (it.agenda ?? [])
      .map((a) => `${a.dia}: ${a.achada ? `${a.tipo} ${R(a.achada.valor)}` : a.passou ? "PASSOU SEM NADA" : "nada agendado"}`)
      .join("  ·  "),
  };
  for (const p of PATAMARES) {
    const l = it.linhas[p.k] ?? {};
    reg[`${p.k}Estado`] = l.estado ?? "";
    reg[`${p.k}Inicio`] = l.inicio != null ? quando(l.inicio) : "";
    reg[`${p.k}Fim`] = l.fim != null ? quando(l.fim) : "";
    reg[`${p.k}Valor`] = l.valor ?? null;
    reg[`${p.k}Alvo`] = l.alvo ?? null;
    reg[`${p.k}Dif`] = l.dif ?? null;
    reg[`${p.k}Bate`] = l.batePreco ?? "";
  }
  const linha = aba.addRow(reg);
  linha.height = 15;
  COLS.forEach((c, k) => {
    const cel = linha.getCell(k + 1);
    cel.font = { size: 9, color: { argb: c.suave ? SUAVE : TINTA } };
    if (c.fmt) { cel.numFmt = c.fmt; cel.alignment = { horizontal: "right" }; }
    if (c.forte) cel.font = { size: 9, bold: true, color: { argb: TINTA } };
    cel.border = { bottom: { style: "hair", color: { argb: RISCO } } };
  });
  for (const p of PATAMARES) {
    const i = COLS.findIndex((c) => c.k === `${p.k}Estado`);
    const cor = corDoEstado(it.linhas[p.k]?.estado);
    if (i >= 0 && cor) linha.getCell(i + 1).font = { size: 9, bold: true, color: { argb: cor } };
    const j = COLS.findIndex((c) => c.k === `${p.k}Bate`);
    if (j >= 0 && it.linhas[p.k]?.batePreco === "NÃO") linha.getCell(j + 1).font = { size: 9, bold: true, color: { argb: "FFB91C1C" } };
  }
}
aba.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: COLS.length } };

const destino = process.env.SAIDA ?? "C:/Users/dudu4/Downloads/Ofertas-na-API.xlsx";
await out.xlsx.writeFile(destino);
console.log(`\n\u2713 ${destino}`);
