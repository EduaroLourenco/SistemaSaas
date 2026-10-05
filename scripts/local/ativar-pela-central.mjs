/**
 * O que dá para ativar na central de promoções sem esperar liberação.
 *
 * Três preços, por anúncio do pré-acordo:
 *
 *   ACORDADO   o preço mínimo que entrou no pré-acordo do mês.
 *   ATIVO HOJE a regra de preço que a API mostra rodando agora.
 *   CENTRAL    o menor `FINAL_PRICE` que a central de promoções está
 *              oferecendo para aquele anúncio (exportação "Com redução de
 *              tarifas"), que é o preço que um clique em "Aplicar proposta"
 *              põe no ar.
 *
 * O ponto: enquanto o canal não libera o preço do acordo, a central pode já
 * estar oferecendo algo igual ou melhor. Onde CENTRAL <= ACORDADO, dá para
 * ativar hoje e parar de esperar.
 *
 * Uso:
 *   node scripts/local/ativar-pela-central.mjs "<pre-acordo.xlsx>" "<aba>"
 *
 * Ambiente:
 *   CENTRAIS   caminhos das exportações da central, separados por ";"
 *   API        a planilha de "conferir-ofertas-api.mjs" com o preço de hoje
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
  [
    "C:/Users/dudu4/Downloads/1_Com_reducao_de_tarifas-9ad89986-56fa-4525-80a0-3434de4be271-2026_10_04-23_03.xlsx",
    "C:/Users/dudu4/Downloads/2d464e11-1_Com_reducao_de_tarifas-50ba821f-6e9c-45c2-8edb-e4d3ef64d47f-2026_10_02-10_17.xlsx",
  ].join(";")
).split(";").map((s) => s.trim()).filter(Boolean);

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
/*
 * `NEW_RECEIVES` vem no formato americano — "$ 1,302.60", vírgula de milhar e
 * ponto decimal. Passar isso no `num()` daqui, que trata vírgula como
 * decimal, lia R$ 1,30 em vez de R$ 1.302,60.
 */
const numUS = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && typeof v.result === "number") return v.result;
  const s = txt(v).replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!s) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};

const SP = { timeZone: "America/Sao_Paulo" };
const R = (v) => (v == null ? "—" : (v < 0 ? "-" : "") + "R$ " + Math.abs(v).toFixed(2));

/* ── 1. O acordo ── */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);
const ws = wb.getWorksheet(ABA) ?? wb.worksheets[0];
let cab = 0;
for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
  const linha = [];
  for (let c = 1; c <= ws.columnCount; c++) linha.push(txt(ws.getCell(r, c).value).trim().toUpperCase());
  if (linha.includes("SKU") && linha.includes("MLB")) { cab = r; break; }
}
const acordo = new Map();
for (let r = cab + 1; r <= ws.rowCount; r++) {
  const mlb = txt(ws.getCell(r, 2).value).trim();
  if (!/^MLB\d+/.test(mlb)) continue;
  const atual = acordo.get(mlb);
  const linha = {
    mlb,
    sku: txt(ws.getCell(r, 1).value).trim(),
    nome: txt(ws.getCell(r, 3).value).trim(),
    tipo: txt(ws.getCell(r, 4).value).trim(),
    rebate: num(ws.getCell(r, 6).value),
    mes: num(ws.getCell(r, 7).value),
    retorno: txt(ws.getCell(r, 8).value).trim(),
  };
  /* linha repetida: fica a de menor preço acordado, que é a que interessa */
  if (!atual || (linha.mes != null && (atual.mes == null || linha.mes < atual.mes))) acordo.set(mlb, linha);
}
console.log(`${acordo.size} anúncios no acordo "${ws.name}"`);

/*
 * A tabela de preço por rebate, para o teste de margem.
 *
 * Nas ofertas da central o Meli cofinancia muito pouco — 1 a 4% do desconto
 * nestas aqui —, então o preço baixo sai do seu bolso. Logo "dá para ativar"
 * só vale quando o preço da central fica NO PISO ou acima dele, e o piso é a
 * coluna do rebate pedido.
 */
const tabelaRebate = new Map();
{
  const wr = wb.worksheets.find((w) => /rebate/i.test(w.name) && /pre[cç]/i.test(w.name));
  if (wr) {
    for (let r = 2; r <= wr.rowCount; r++) {
      const m = txt(wr.getCell(r, 1).value).trim();
      if (!/^MLB\d+/.test(m)) continue;
      tabelaRebate.set(m, { 5: num(wr.getCell(r, 6).value), 6: num(wr.getCell(r, 7).value), 7: num(wr.getCell(r, 8).value), 8: num(wr.getCell(r, 9).value) });
    }
    console.log(`tabela por rebate: ${tabelaRebate.size} MLBs`);
  } else {
    console.log('aviso: sem a aba "Preços por rebate" — não vou poder testar a margem');
  }
}

/* ── 2. O preço de hoje, da conferência na API ── */
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
    if (!/^MLB\d+/.test(m)) continue;
    hoje.set(m, {
      estado: txt(wsa.getCell(r, I("Mês: situação")).value),
      valor: num(wsa.getCell(r, I("Mês: configurado")).value),
      cheio: num(wsa.getCell(r, I("Preço cheio")).value),
    });
  }
  console.log(`preço de hoje: ${hoje.size} anúncios (de "${API.split("/").pop()}")`);
} else {
  console.log(`aviso: não achei ${API} — rode conferir-ofertas-api.mjs primeiro`);
}

/* ── 3. A central de promoções ── */
const central = new Map(); /* mlb -> [{final, nome, de, ate, sub, meliPct}] */
for (const arq of CENTRAIS) {
  if (!fs.existsSync(arq)) { console.log(`aviso: não achei ${arq}`); continue; }
  const wc = new ExcelJS.Workbook();
  await wc.xlsx.readFile(arq);
  const wsc = wc.getWorksheet("Promoções") ?? wc.worksheets.at(-1);
  const tec = [];
  for (let c = 1; c <= wsc.columnCount; c++) tec.push(txt(wsc.getCell(1, c).value).trim().toUpperCase());
  const C = (n) => tec.indexOf(n) + 1;
  const cItem = C("ITEM_ID"), cFinal = C("FINAL_PRICE"), cOrig = C("ORIGINAL_PRICE");
  const cNome = C("PROMO_NAME"), cIni = C("START_DATE"), cFim = C("FINISH_DATE");
  const cSub = C("PROMO_SUB_TYPE"), cMeli = C("MELI_PERCENTAGE"), cStatus = C("STATUS");
  /*
   * O que importa para decidir: NEW_RECEIVES é o que sobra para você. A
   * central consegue pôr um preço abaixo do acordado porque o Meli
   * cofinancia parte do desconto (MELI_AMOUNT / MELI_PERCENTAGE), então
   * preço menor NÃO quer dizer margem menor — e sem essa coluna "ativar"
   * seria um chute.
   */
  const cRecebe = C("NEW_RECEIVES"), cSellerPct = C("SELLER_PERCENTAGE"), cMeliAmt = C("MELI_AMOUNT");
  if (cItem < 1 || cFinal < 1) { console.log(`aviso: ${arq.split("/").pop()} sem ITEM_ID/FINAL_PRICE`); continue; }
  let n = 0;
  for (let r = 2; r <= wsc.rowCount; r++) {
    const m = txt(wsc.getCell(r, cItem).value).trim();
    if (!/^MLB\d+/.test(m)) continue;
    const final = num(wsc.getCell(r, cFinal).value);
    if (final == null) continue;
    if (!central.has(m)) central.set(m, []);
    central.get(m).push({
      final,
      original: num(wsc.getCell(r, cOrig).value),
      nome: txt(wsc.getCell(r, cNome).value).trim(),
      de: txt(wsc.getCell(r, cIni).value).slice(0, 10),
      ate: txt(wsc.getCell(r, cFim).value).slice(0, 10),
      sub: txt(wsc.getCell(r, cSub).value).trim(),
      meliPct: num(wsc.getCell(r, cMeli).value),
      status: txt(wsc.getCell(r, cStatus).value).trim(),
      recebe: cRecebe > 0 ? numUS(wsc.getCell(r, cRecebe).value) : null,
      sellerPct: cSellerPct > 0 ? num(wsc.getCell(r, cSellerPct).value) : null,
      meliAmt: cMeliAmt > 0 ? num(wsc.getCell(r, cMeliAmt).value) : null,
    });
    n++;
  }
  console.log(`central: ${n} candidaturas em "${arq.split("/").pop()}"`);
}

/* ── 4. Estoque e situação ── */
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
const anuncios = await todas("anuncios", "codigo_externo,status,estoque,conta_canal_id");
const contas = await todas("contas_canal", "id,nome");
const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
const banco = new Map(anuncios.map((a) => [String(a.codigo_externo).toUpperCase(), a]));

/* ── 5. O cruzamento ── */
const PERTO = 0.02; /* 2% é "semelhante" */
const linhas = [];
for (const [mlb, a] of acordo) {
  const h = hoje.get(mlb);
  const cands = (central.get(mlb) ?? []).slice().sort((x, y) => x.final - y.final);
  const melhor = cands[0] ?? null;
  const b = banco.get(mlb);
  /* o piso: a coluna do rebate que foi pedido naquela linha */
  const nivel = a.rebate != null ? Math.round(a.rebate * 100) : null;
  const piso = nivel != null ? (tabelaRebate.get(mlb)?.[nivel] ?? null) : null;
  const difHoje = h?.valor != null && a.mes != null ? h.valor - a.mes : null;
  const difCentral = melhor && a.mes != null ? melhor.final - a.mes : null;
  const razao = melhor && a.mes ? melhor.final / a.mes : null;
  linhas.push({
    ...a,
    conta: b ? (nomeConta.get(b.conta_canal_id) ?? "") : "",
    situacao: b?.status ?? "não sincronizado",
    estoque: b?.estoque ?? null,
    estadoHoje: h?.estado ?? "—",
    hoje: h?.valor ?? null,
    cheio: h?.cheio ?? null,
    difHoje,
    difHojePct: difHoje != null && a.mes ? difHoje / a.mes : null,
    central: melhor?.final ?? null,
    centralRecebe: melhor?.recebe ?? null,
    centralSellerPct: melhor?.sellerPct != null ? melhor.sellerPct / 100 : null,
    centralMeliAmt: melhor?.meliAmt ?? null,
    /* O Meli cobre quantos % do desconto? É isso que faz o preço cair sem a margem cair. */
    centralParteMeli:
      melhor && melhor.original != null && melhor.original > melhor.final && melhor.meliAmt != null
        ? melhor.meliAmt / (melhor.original - melhor.final)
        : null,
    centralNome: melhor?.nome ?? "",
    centralJanela: melhor ? `${melhor.de} a ${melhor.ate}` : "",
    centralSub: melhor?.sub ?? "",
    centralStatus: melhor?.status ?? "",
    quantasCand: cands.length,
    difCentral,
    difCentralPct: difCentral != null && a.mes ? difCentral / a.mes : null,
    piso,
    centralMenosPiso: melhor && piso != null ? melhor.final - piso : null,
    veredito:
      melhor == null
        ? "sem oferta na central"
        : piso != null && melhor.final < piso - 0.01
          ? `NÃO — central R$ ${(piso - melhor.final).toFixed(2)} abaixo do seu piso`
          : razao == null
            ? "sem preço acordado para comparar"
            : razao <= 1 + 1e-9
              ? "ATIVAR — no piso ou acima, e igual/melhor que o acordo"
              : razao <= 1 + PERTO
                ? "ATIVAR — no piso, e a até 2% do acordo"
                : `central ${((razao - 1) * 100).toFixed(0)}% acima do acordo`,
    /* ganho contra o que está no ar hoje, que é o dinheiro de verdade */
    ganhoVsHoje: melhor && h?.valor != null ? h.valor - melhor.final : null,
  });
}

const ativaveis = linhas.filter((l) => l.veredito.startsWith("ATIVAR"));
const aguardando = linhas.filter((l) => /agd|aguard/i.test(l.retorno));

console.log(`\nDIFERENÇA DO ACORDADO CONTRA O QUE ESTÁ NO AR\n`);
const comHoje = linhas.filter((l) => l.difHoje != null);
const acima = comHoje.filter((l) => l.difHoje > 0.5);
console.log(`  ${comHoje.length} anúncios comparáveis`);
console.log(`  no valor acordado (até R$ 0,50):  ${comHoje.filter((l) => Math.abs(l.difHoje) <= 0.5).length}`);
console.log(`  ACIMA do acordado:                ${acima.length}   soma ${R(acima.reduce((s, l) => s + l.difHoje, 0))}   média +${((acima.reduce((s, l) => s + l.difHojePct, 0) / (acima.length || 1)) * 100).toFixed(1)}%`);
console.log(`  abaixo:                           ${comHoje.filter((l) => l.difHoje < -0.5).length}`);

console.log(`\nDÁ PARA ATIVAR NA CENTRAL AGORA: ${ativaveis.length}\n`);
console.log("  MLB            SKU          acordado      no ar hoje     central    seu piso   central-piso    VC RECEBE   Meli cobre   economiza");
for (const l of ativaveis.sort((a, b) => (b.ganhoVsHoje ?? 0) - (a.ganhoVsHoje ?? 0))) {
  console.log(
    `  ${l.mlb}  ${String(l.sku || "—").padEnd(11)}  ${R(l.mes).padStart(10)}  ${R(l.hoje).padStart(12)}  ${R(l.central).padStart(10)}  ` +
    `${R(l.piso).padStart(10)}  ${R(l.centralMenosPiso).padStart(12)}  ${R(l.centralRecebe).padStart(11)}  ${(l.centralParteMeli != null ? (l.centralParteMeli * 100).toFixed(0) + "%" : "—").padStart(10)}  ${R(l.ganhoVsHoje).padStart(10)}`
  );
}

const aguardAtivavel = ativaveis.filter((l) => /agd|aguard/i.test(l.retorno));
console.log(`\n  dos ${ativaveis.length}, ${aguardAtivavel.length} estão justamente "aguardando liberação" — nesses dá para parar de esperar:`);
for (const l of aguardAtivavel.sort((a, b) => (b.ganhoVsHoje ?? 0) - (a.ganhoVsHoje ?? 0))) {
  console.log(`    ${l.mlb}  ${String(l.sku || "—").padEnd(11)} no ar ${R(l.hoje)} -> central ${R(l.central)}  (acordo ${R(l.mes)})  economiza ${R(l.ganhoVsHoje)}`);
}

/* ── 6. A planilha ── */
const TINTA = "FF1F2430", SUAVE = "FF6B7280", RISCO = "FFE5E7EB", FUNDO = "FFF3F4F6";
const out = new ExcelJS.Workbook();
out.creator = "Plataforma Probel";
const aba = out.addWorksheet("Acordo x hoje x central", { views: [{ state: "frozen", xSplit: 2, ySplit: 5 }] });
const COLS = [
  { h: "SKU", k: "sku", w: 12 },
  { h: "MLB", k: "mlb", w: 15 },
  { h: "Produto", k: "nome", w: 40 },
  { h: "Tipo", k: "tipo", w: 9 },
  { h: "Conta", k: "conta", w: 20, suave: true },
  { h: "Estoque", k: "estoque", w: 9, fmt: "#,##0" },
  { h: "Rebate", k: "rebateTxt", w: 8 },
  { h: "Retorno do Meli", k: "retorno", w: 22, suave: true },
  { h: "ACORDADO (mês)", k: "mes", w: 13, fmt: "#,##0.00", forte: true },
  { h: "Situação no Meli", k: "estadoHoje", w: 16 },
  { h: "NO AR HOJE", k: "hoje", w: 12, fmt: "#,##0.00", forte: true },
  { h: "No ar − acordado", k: "difHoje", w: 13, fmt: "#,##0.00", forte: true },
  { h: "No ar − acordado %", k: "difHojePct", w: 12, fmt: "0.0%" },
  { h: "CENTRAL (melhor)", k: "central", w: 13, fmt: "#,##0.00", forte: true },
  { h: "Central − acordado", k: "difCentral", w: 13, fmt: "#,##0.00", forte: true },
  { h: "Central − acordado %", k: "difCentralPct", w: 12, fmt: "0.0%" },
  { h: "VOCÊ RECEBE (central)", k: "centralRecebe", w: 14, fmt: "#,##0.00", forte: true },
  { h: "Seu piso (tabela do rebate)", k: "piso", w: 13, fmt: "#,##0.00" },
  { h: "Central − piso", k: "centralMenosPiso", w: 12, fmt: "#,##0.00", forte: true },
  { h: "Desconto por sua conta", k: "centralSellerPct", w: 12, fmt: "0%" },
  { h: "O Meli cobre do desconto", k: "centralParteMeli", w: 13, fmt: "0%" },
  { h: "Economiza vs hoje", k: "ganhoVsHoje", w: 13, fmt: "#,##0.00", forte: true },
  { h: "O que fazer", k: "veredito", w: 34, forte: true },
  { h: "Campanha da central", k: "centralSub", w: 16, suave: true },
  { h: "Vigência da central", k: "centralJanela", w: 20, suave: true },
  { h: "Candidaturas", k: "quantasCand", w: 11, fmt: "#,##0", suave: true },
  { h: "Preço cheio", k: "cheio", w: 12, fmt: "#,##0.00", suave: true },
];
aba.columns = COLS.map((c) => ({ key: c.k, width: c.w }));
aba.mergeCells(1, 1, 1, COLS.length);
aba.getCell(1, 1).value = "Pré-acordo de outubro — acordado contra o que está no ar e o que a central oferece";
aba.getCell(1, 1).font = { size: 13, bold: true, color: { argb: TINTA } };
aba.getRow(1).height = 22;
aba.mergeCells(2, 1, 2, COLS.length);
aba.getCell(2, 1).value = `${linhas.length} anúncios · ${ativaveis.length} dá para ativar na central · gerado em ${new Date().toLocaleString("pt-BR", SP)}`;
aba.getCell(2, 1).font = { size: 9, color: { argb: SUAVE } };
aba.mergeCells(3, 1, 4, COLS.length);
aba.getCell(3, 1).value =
  'ACORDADO = o preço mínimo do pré-acordo do mês. NO AR HOJE = a regra de preço que a API mostra rodando. ' +
  'CENTRAL = o menor preço final que a central de promoções oferece hoje para o anúncio, que um clique em "Aplicar proposta" põe no ar. ' +
  'Quando a central chega ao acordado (ou a até 2% dele), dá para ativar agora em vez de esperar a liberação do canal.';
aba.getCell(3, 1).font = { size: 9, italic: true, color: { argb: "FF8A5A06" } };
aba.getCell(3, 1).alignment = { wrapText: true, vertical: "top" };
aba.getRow(3).height = 28;
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

/* ativáveis primeiro, e dentro deles o que economiza mais */
const ordem = (l) => (l.veredito.startsWith("ATIVAR") ? 0 : l.veredito === "sem oferta na central" ? 2 : 1);
for (const l of [...linhas].sort((a, b) => ordem(a) - ordem(b) || (b.ganhoVsHoje ?? -1e9) - (a.ganhoVsHoje ?? -1e9))) {
  const linha = aba.addRow({ ...l, rebateTxt: l.rebate != null ? `${Math.round(l.rebate * 100)}%` : "" });
  linha.height = 15;
  COLS.forEach((c, k) => {
    const cel = linha.getCell(k + 1);
    cel.font = { size: 9, color: { argb: c.suave ? SUAVE : TINTA } };
    if (c.fmt) { cel.numFmt = c.fmt; cel.alignment = { horizontal: "right" }; }
    if (c.forte) cel.font = { size: 9, bold: true, color: { argb: TINTA } };
    cel.border = { bottom: { style: "hair", color: { argb: RISCO } } };
    if (l.veredito.startsWith("ATIVAR")) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
  });
  const pinta = (chave, cor) => {
    const i = COLS.findIndex((c) => c.k === chave);
    if (i >= 0) linha.getCell(i + 1).font = { size: 9, bold: true, color: { argb: cor } };
  };
  if (l.veredito.startsWith("ATIVAR")) pinta("veredito", "FF15803D");
  else if (l.veredito === "sem oferta na central") pinta("veredito", "FF6B7280");
  else pinta("veredito", "FFB45309");
  if (l.difHoje != null && l.difHoje > 0.5) { pinta("difHoje", "FFB91C1C"); pinta("difHojePct", "FFB91C1C"); }
  if (l.ganhoVsHoje != null && l.ganhoVsHoje > 0.5) pinta("ganhoVsHoje", "FF15803D");
}
aba.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: COLS.length } };

const destino = process.env.SAIDA ?? "C:/Users/dudu4/Downloads/Acordo-x-hoje-x-central.xlsx";
await out.xlsx.writeFile(destino);
console.log(`\n\u2713 ${destino}`);
