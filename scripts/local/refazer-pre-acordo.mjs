/**
 * Refaz a planilha de pré-acordo para subir de volta para o Mercado Livre.
 *
 * ── O que ela faz com cada retorno do Meli ──
 *
 * A aba tem TRÊS patamares, cada um com o seu preço e o seu retorno:
 *
 *     mês          preço col 7    retorno col 8
 *     relâmpago    preço col 11   retorno col 14
 *     oferta dia   preço col 15   retorno col 18
 *
 * E o crível aparece na coluna do patamar que ele responde — por isso o
 * mesmo anúncio pode ter crível no mês e outro, diferente, na oferta do dia.
 * Cada patamar é tratado por conta.
 *
 *   CRÍVEL          aceita: o preço do patamar passa a ser o crível, e o
 *                   retorno daquele patamar é apagado para subir limpo.
 *   INATIVO         com estoque, voltou: apaga o retorno e devolve a linha
 *                   ao acordo com o preço que já estava. Sem estoque, sai da
 *                   planilha e vai para a lista de pendentes.
 *   MARGEM NEGATIVA sai da planilha, vai para a lista à parte.
 *   CAMPANHA MASSIVA  idem.
 *   vazio / Agd. liberação / CAMPANHA CADASTRADA
 *                   deu certo: replica a linha inteira, retorno incluído.
 *
 * ── Ordem ──
 *
 * Em cima o que já está certo (nada mudou). Embaixo o que estava errado e
 * agora vai dar certo (crível aceito, inativo que voltou).
 *
 * ── Os rebates em R$ são recalculados ──
 *
 * A planilha guarda `REBATE SOLICITADO = preço × rebate %` como fórmula
 * (col 5 do mês, col 13 do relâmpago, col 16 da oferta do dia). Trocar o
 * preço sem refazer essa conta deixaria o R$ apontando para o preço velho,
 * então ele é recalculado. O rebate % não se mexe: é o que foi negociado.
 *
 * Uso:
 *   node scripts/local/refazer-pre-acordo.mjs "<arquivo.xlsx>" "<aba>"
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

const txt = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    return String(v.result ?? v.text ?? v.richText?.map((r) => r.text).join("") ?? "");
  }
  return String(v);
};
const num = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && typeof v.result === "number") return v.result;
  const s = txt(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  /* "602,23" tem a vírgula como decimal; "3229.71" tem o ponto. */
  const x = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(x) ? x : null;
};
/** O valor do crível, se o texto for um crível. */
const crivelDe = (bruto) => {
  const s = txt(bruto).trim();
  if (!/crivel/.test(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())) return null;
  const m = s.match(/([\d.]+,\d+|\d+\.\d+|\d+)\s*$/);
  return m ? num(m[1]) : null;
};
const semAcento = (s) => txt(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/* ── A planilha de origem ── */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);
const ws = wb.getWorksheet(ABA);
if (!ws) {
  console.log(`Aba "${ABA}" não existe. Abas: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  process.exit(1);
}

/* Onde o cabeçalho está, para não depender de a linha 3 continuar sendo a 3. */
let cab = 0;
for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
  const linha = [];
  for (let c = 1; c <= ws.columnCount; c++) linha.push(semAcento(ws.getCell(r, c).value).toUpperCase());
  if (linha.includes("SKU") && linha.includes("MLB")) { cab = r; break; }
}
if (!cab) {
  console.log("não achei a linha de cabeçalho (preciso de SKU e MLB na mesma linha)");
  process.exit(1);
}

const N_COLS = 23; /* SKU..DATA 5 — o resto da aba é vazio */
const CABECALHO = [];
for (let c = 1; c <= N_COLS; c++) CABECALHO.push(txt(ws.getCell(cab, c).value));

/* Cada linha vira um vetor de valores puros: nada de fórmula, para colar limpo. */
const linhas = [];
for (let r = cab + 1; r <= ws.rowCount; r++) {
  const mlb = txt(ws.getCell(r, 2).value).trim();
  if (!/^MLB\d+/.test(mlb)) continue;
  /*
   * Só valor puro sai daqui. Uma fórmula compartilhada sem `result`
   * (`{sharedFormula:"M4"}`) copiada para um arquivo novo quebra a escrita,
   * porque o mestre dela não existe mais lá.
   */
  const cel = [];
  for (let c = 1; c <= N_COLS; c++) {
    const v = ws.getCell(r, c).value;
    if (v == null || v instanceof Date || typeof v !== "object") { cel.push(v ?? null); continue; }
    const puro = v.result ?? v.text ?? v.richText?.map((x) => x.text).join("") ?? null;
    /*
     * A data pode vir como resultado de fórmula — as colunas DATA 2..DATA 5
     * são assim. Date é `typeof "object"`, então jogar todo objeto fora
     * apagava as datas das ofertas.
     */
    cel.push(puro instanceof Date || typeof puro !== "object" ? puro : null);
  }
  linhas.push({ mlb, cel, origem: r, mudou: [], motivoSaida: null });
}
console.log(`${linhas.length} anúncios na aba "${ABA}"`);


/* ── Estoque, do sistema ── */
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
const anuncios = await todas("anuncios", "codigo_externo,status,estoque");
const doBanco = new Map(anuncios.map((a) => [String(a.codigo_externo).toUpperCase(), a]));

/* ── Os três patamares, cada um com o seu preço, rebate % e retorno ── */
/*
 * A tabela de preço por rebate, da aba irmã do mesmo arquivo.
 *
 * O rebate É a redução da comissão: Clássico 11,5% com rebate de 7% faz o
 * Meli cobrar 4,5%, e a coluna "Rebate de 7%" já tem esses 4,5% dentro. É
 * contra ela que se mede se um crível honrou o rebate que foi pedido.
 */
const tabelaRebate = new Map();
{
  const wr = wb.worksheets.find((w) => /rebate/i.test(w.name) && /pre[cç]/i.test(w.name));
  if (wr) {
    for (let r = 2; r <= wr.rowCount; r++) {
      const mlb = txt(wr.getCell(r, 1).value).trim();
      if (!/^MLB\d+/.test(mlb)) continue;
      tabelaRebate.set(mlb, { 5: num(wr.getCell(r, 6).value), 6: num(wr.getCell(r, 7).value), 7: num(wr.getCell(r, 8).value), 8: num(wr.getCell(r, 9).value) });
    }
    console.log(`tabela por rebate: ${tabelaRebate.size} MLBs (aba "${wr.name}")`);
  } else {
    console.log('aviso: não achei a aba "Preços por rebate" — vou aceitar todo crível sem poder conferir o rebate');
  }
}

/** O rebate de um patamar, em pontos inteiros. */
const pct = (l, c) => {
  const v = num(l.cel[c - 1]);
  return v == null ? null : Math.round(v * 100);
};

const PATAMARES = [
  { nome: "mês", preco: 7, pct: 6, reais: 5, retorno: 8 },
  { nome: "relâmpago", preco: 11, pct: 12, reais: 13, retorno: 14 },
  { nome: "oferta do dia", preco: 15, pct: 17, reais: 16, retorno: 18 },
];

const SAIU = { massiva: "Meli pôs em campanha massiva", margem: "Margem negativa (Meli)", inativoSemEstoque: "Inativo e sem estoque", rebateMenor: "Subiu com rebate menor — não instruído", outro: "Retorno não reconhecido", repetido: "MLB repetido — ficou a linha mais completa" };

/*
 * ── MLB repetido ──
 *
 * `MLB5185287806` vinha duas vezes no acordo de outubro, com rebate de 7% e
 * preço 3451,47 numa linha e 5% com 3575,48 na outra, essa com relâmpago e
 * oferta do dia. O canal não guarda dois preços de mês para o mesmo anúncio:
 * pega um e ignora o outro.
 *
 * Fica a linha mais completa — a que tem os três patamares preenchidos. A
 * outra sai e vai para a lista à parte, para a decisão não desaparecer.
 */
const PATAMAR_COL = [7, 11, 15];
const repetidas = [];
{
  const porMlb = new Map();
  for (const l of linhas) {
    if (!porMlb.has(l.mlb)) porMlb.set(l.mlb, []);
    porMlb.get(l.mlb).push(l);
  }
  for (const [mlb, grupo] of porMlb) {
    if (grupo.length < 2) continue;
    const completude = (l) => PATAMAR_COL.filter((c) => num(l.cel[c - 1]) != null).length;
    const fica = grupo.reduce((a, b) => (completude(b) > completude(a) ? b : a));
    for (const l of grupo) {
      if (l === fica) continue;
      l.motivoSaida = SAIU.repetido;
      repetidas.push(`${mlb}: ficou a linha ${fica.origem} (${completude(fica)} patamares), saiu a ${l.origem} (${completude(l)})`);
    }
  }
}
if (repetidas.length) {
  console.log("MLB repetido, ficou a linha mais completa:");
  for (const r of repetidas) console.log(`  ${r}`);
}

const conferir = [];

for (const l of linhas) {
  const g = (c) => l.cel[c - 1];
  const p = (c, v) => { l.cel[c - 1] = v; };
  const banco = doBanco.get(l.mlb);
  const estoque = banco?.estoque == null ? null : Number(banco.estoque);
  l.estoque = estoque;
  l.statusAnuncio = banco?.status ?? "não sincronizado";

  /*
   * 1. O crível, patamar por patamar.
   *
   * O crível é a contraproposta do canal, e ela não vem necessariamente com
   * o rebate que se pediu: medindo o rebate que cada crível embute (a tabela
   * é linear, então dá para extrapolar o preço a 0%), oito deles embutem
   * rebate NEGATIVO — crível acima do preço sem desconto nenhum. São
   * justamente as linhas cujo preço foi pedido inflado.
   *
   * Então a regra é uma só, e resolve os dois casos:
   *
   *   crível <= tabela do rebate pedido  ->  aceita o crível (ele deu melhor)
   *   crível  > tabela do rebate pedido  ->  usa a tabela (o rebate pedido
   *                                          não foi concedido)
   */
  const tb = tabelaRebate.get(l.mlb);
  for (const pt of PATAMARES) {
    const c = crivelDe(g(pt.retorno));
    if (c == null) continue;
    l.teveCrivel = true;
    const antes = num(g(pt.preco));
    const nivel = pct(l, pt.pct);
    const daTabela = tb && nivel != null ? (tb[nivel] ?? null) : null;
    if (daTabela != null && c > daTabela + 0.01) {
      p(pt.preco, Number(daTabela.toFixed(2)));
      l.mudou.push(
        `${pt.nome}: crível ${c.toFixed(2)} não honrava o rebate de ${nivel}% — usei a tabela, ${daTabela.toFixed(2)} (era ${antes?.toFixed(2) ?? "—"})`
      );
    } else {
      p(pt.preco, c);
      l.mudou.push(`${pt.nome}: crível aceito, ${antes?.toFixed(2) ?? "—"} → ${c.toFixed(2)}`);
    }
    p(pt.retorno, null);
  }

  /* O rebate em R$ é sempre preço × rebate %, mexido ou não o preço. */
  for (const pt of PATAMARES) {
    const preco = num(g(pt.preco));
    const pct = num(g(pt.pct));
    p(pt.reais, preco != null && pct != null ? Number((preco * pct).toFixed(4)) : null);
  }

  /* 2. O retorno do mês decide se a linha fica ou sai. */
  const rMes = semAcento(g(8));
  if (l.motivoSaida) { /* já saiu por repetição */ }
  else if (/campanha massiva/.test(rMes)) l.motivoSaida = SAIU.massiva;
  else if (/margem negativa/.test(rMes)) l.motivoSaida = SAIU.margem;
  else if (/inativo/.test(rMes)) {
    if (estoque != null && estoque > 0) {
      p(8, null);
      l.mudou.push(`inativo com ${estoque} em estoque: voltou ao acordo`);
    } else {
      l.motivoSaida = SAIU.inativoSemEstoque;
    }
  } else if (/rebate menor/.test(rMes)) l.motivoSaida = SAIU.rebateMenor;
  else if (rMes && !/agd|aguard|campanha cadastrada/.test(rMes)) l.motivoSaida = SAIU.outro;

  /*
   * 3. "Subiu com rebate menor" no relâmpago ou na oferta do dia não derruba
   *    a linha — o mês dela está bom. Fica na planilha com o texto intacto e
   *    entra na lista de conferir, para você decidir.
   */
  for (const pt of PATAMARES.slice(1)) {
    if (/rebate menor/.test(semAcento(g(pt.retorno)))) {
      conferir.push({ mlb: l.mlb, onde: pt.nome, texto: txt(g(pt.retorno)), nota: "não instruído — a linha ficou na planilha com o texto como estava" });
    }
  }
}

/*
 * ── O que já está no ar e o que falta agendar ──
 *
 * Quem sabe se a promoção foi criada é o painel (`painel-pre-acordo.mjs`),
 * que lê as regras de preço da API. Sem ele, cai no que a própria planilha
 * mostra: patamar com preço acordado é patamar a cadastrar.
 */
const faltaCadastrar = new Map();
{
  const arq = process.env.PAINEL ?? "C:/Users/dudu4/Downloads/Pre-acordo-com-rebate.xlsx";
  if (fs.existsSync(arq)) {
    const wp = new ExcelJS.Workbook();
    await wp.xlsx.readFile(arq);
    const wsp = wp.worksheets[0];
    const cabP = [], bandaP = [];
    let atual = "";
    for (let c = 1; c <= wsp.columnCount; c++) {
      cabP.push(txt(wsp.getCell(6, c).value));
      const b = txt(wsp.getCell(5, c).value);
      if (b) atual = b;
      bandaP.push(atual);
    }
    const col = (f) => {
      for (let c = 1; c <= wsp.columnCount; c++) {
        if (bandaP[c - 1] === "O que está configurado no Meli" && cabP[c - 1] === f) return c;
      }
      return -1;
    };
    const iMlb = cabP.indexOf("MLB") + 1, iDia = col("Oferta dia"), iRel = col("Relâmpago"), iMes = col("Mês: situação");
    for (let r = 7; r <= wsp.rowCount; r++) {
      const m = txt(wsp.getCell(r, iMlb).value);
      if (!/^MLB\d+/.test(m)) continue;
      const naoCriada = (c) => /não criada|nao criada/i.test(txt(wsp.getCell(r, c).value));
      faltaCadastrar.set(m, {
        dia: naoCriada(iDia),
        rel: naoCriada(iRel),
        /* "Ativa" e "Preço quase certo" são promoção do mês no ar. */
        mesNoAr: /ativa|quase certo/i.test(txt(wsp.getCell(r, iMes).value)),
      });
    }
    console.log(`status de oferta do dia / relâmpago: ${faltaCadastrar.size} MLBs (de "${arq.split("/").pop()}")`);
  } else {
    console.log("aviso: não achei o painel — a cor do grupo 5/6/7 vai pelo preço acordado, não pelo status real");
  }
}

/*
 * O AMARELO: mês a 5% de rebate, promoção do mês já no ar, nem oferta do dia
 * nem relâmpago criadas — e o canal NÃO respondeu nesses dois patamares.
 *
 * O crível fica fora: linha com crível é resposta recebida, e vai no verde
 * junto com as outras que eu arrumei. Assim o amarelo quer dizer uma coisa
 * só: "ele não respondeu e não agendou, cobra".
 */
for (const l of linhas) {
  const st = faltaCadastrar.get(l.mlb);
  const temDia = num(l.cel[14]) != null, temRel = num(l.cel[10]) != null;
  l.faltaOsDois = st ? st.dia && st.rel : temDia && temRel;
  l.mesNoAr = st ? st.mesNoAr : null;
  l.amarelo = pct(l, 6) === 5 && l.faltaOsDois && l.mesNoAr !== false && !l.teveCrivel;
}

const saem = linhas.filter((l) => l.motivoSaida);
const ficam = linhas.filter((l) => !l.motivoSaida);

/*
 * A ordem pedida: o que deu certo, o que está aguardando liberação, e por
 * último o que deu errado no crível e foi arrumado.
 */
const temCrivel = (l) => l.teveCrivel;
const aguardando = (l) => /agd|aguard/.test(semAcento(l.cel[7]));
const voltouDoInativo = (l) => l.mudou.some((m) => /inativo/.test(m));

const blocos = [
  { nome: "1. Deu certo — já ativa, sem erro", cor: null, linhas: ficam.filter((l) => !temCrivel(l) && !aguardando(l) && !voltouDoInativo(l)) },
  { nome: "2. Aguardando liberação interna", cor: null, linhas: ficam.filter((l) => !temCrivel(l) && aguardando(l)) },
  { nome: "3. Crível arrumado", cor: "VERDE", linhas: ficam.filter(temCrivel) },
  { nome: "4. Estava inativo e voltou (tem estoque)", cor: "VERDE", linhas: ficam.filter((l) => !temCrivel(l) && !aguardando(l) && voltouDoInativo(l)) },
];
/* Dentro de cada bloco, o amarelo primeiro, para ficar agrupado. */
for (const b of blocos) b.linhas = [...b.linhas.filter((l) => l.amarelo), ...b.linhas.filter((l) => !l.amarelo)];

console.log(`\n  ficam na planilha: ${ficam.length}`);
console.log(`  saem da planilha: ${saem.length}`);
for (const [m, n] of Object.entries(
  saem.reduce((a, l) => ({ ...a, [l.motivoSaida]: (a[l.motivoSaida] ?? 0) + 1 }), {})
)) console.log(`    ${String(n).padStart(2)}  ${m}`);
if (conferir.length) console.log(`  para conferir (ficaram na planilha): ${conferir.length}`);

/* ── 1. A planilha para colar no Meli ── */
const FMT = { 5: "#,##0.0000", 7: "#,##0.00", 11: "#,##0.00", 13: "#,##0.0000", 15: "#,##0.0000", 16: "#,##0.0000" };
/* DATA 1..DATA 5: sem formato a data sai como número de série no Excel. */
const FMT_DATA = { 19: true, 20: true, 21: true, 22: true, 23: true };
const out = new ExcelJS.Workbook();
out.creator = "Plataforma Probel";
const aba = out.addWorksheet("Pre-acordo outubro", { views: [{ state: "frozen", ySplit: 1 }] });

const linhaCab = aba.addRow(CABECALHO);
linhaCab.font = { bold: true, size: 10 };
linhaCab.height = 18;
for (let c = 1; c <= N_COLS; c++) {
  linhaCab.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
}
aba.columns = CABECALHO.map((h, i) => ({ width: i === 2 ? 48 : Math.max(10, Math.min(18, h.length + 4)) }));

/*
 * Duas cores, e só para a vista — elas não vão no copiar e colar, o que vai
 * é o valor. AMARELO: mês a 5% já no ar, falta agendar oferta do dia e
 * relâmpago. VERDE: linha que eu arrumei.
 */
const AMARELO = "FFFEF3C7", VERDE = "FFF0FDF4";
for (const b of blocos) {
  for (const l of b.linhas) {
    const linha = aba.addRow(l.cel);
    linha.height = 15;
    const fundo = l.amarelo ? AMARELO : b.cor === "VERDE" ? VERDE : null;
    for (let c = 1; c <= N_COLS; c++) {
      const cel = linha.getCell(c);
      cel.font = { size: 10 };
      if (FMT[c] && typeof cel.value === "number") { cel.numFmt = FMT[c]; cel.alignment = { horizontal: "right" }; }
      if (FMT_DATA[c] && cel.value instanceof Date) { cel.numFmt = "dd/mm/yyyy"; cel.alignment = { horizontal: "center" }; }
      if (fundo) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fundo } };
    }
  }
}
aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: N_COLS } };

const destino = process.env.SAIDA ?? "C:/Users/dudu4/Downloads/Pre-acordo-outubro-para-subir.xlsx";
await out.xlsx.writeFile(destino);
console.log(`\n\u2713 ${destino}`);
console.log(`  cole da linha 2 para baixo (a linha 1 é o cabeçalho) — ${ficam.length} linhas`);
let n = 1;
for (const b of blocos) {
  for (const [rotulo, filtro] of [
    ["AMARELO: falta agendar oferta do dia e relâmpago", (l) => l.amarelo],
    [b.cor === "VERDE" ? "verde" : "sem cor", (l) => !l.amarelo],
  ]) {
    const q = b.linhas.filter(filtro).length;
    if (!q) continue;
    console.log(`    linhas ${n + 1}–${n + q}  ${b.nome} · ${rotulo}  (${q})`);
    n += q;
  }
}

/* ── 2. Os que saíram e o que conferir ── */
const wb2 = new ExcelJS.Workbook();
wb2.creator = "Plataforma Probel";
const TINTA = "FF1F2430", SUAVE = "FF6B7280", RISCO = "FFE5E7EB", FUNDO = "FFF3F4F6";
const a2 = wb2.addWorksheet("Fora da planilha", { views: [{ state: "frozen", ySplit: 3 }] });
const C2 = [
  { h: "Motivo da saída", k: "motivo", w: 34, forte: true },
  { h: "MLB", k: "mlb", w: 15 },
  { h: "Produto", k: "nome", w: 46 },
  { h: "Tipo", k: "tipo", w: 10 },
  { h: "Anúncio no sistema", k: "status", w: 15, suave: true },
  { h: "Estoque", k: "estoque", w: 9, fmt: "#,##0" },
  { h: "Rebate pedido", k: "pct", w: 11, fmt: "0%" },
  { h: "Preço mínimo do mês", k: "mes", w: 14, fmt: "#,##0.00" },
  { h: "Relâmpago", k: "rel", w: 12, fmt: "#,##0.00" },
  { h: "Oferta do dia", k: "dia", w: 12, fmt: "#,##0.00" },
  { h: "Texto do Meli", k: "retorno", w: 42, suave: true },
];
a2.columns = C2.map((c) => ({ key: c.k, width: c.w }));
a2.mergeCells(1, 1, 1, C2.length);
a2.getCell(1, 1).value = "Pré-acordo de outubro — anúncios que saíram da planilha";
a2.getCell(1, 1).font = { size: 13, bold: true, color: { argb: TINTA } };
a2.getRow(1).height = 22;
a2.mergeCells(2, 1, 2, C2.length);
a2.getCell(2, 1).value =
  `${saem.length} anúncios · gerado de "${ABA}" em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
a2.getCell(2, 1).font = { size: 9, color: { argb: SUAVE } };
const cab2 = a2.getRow(3);
C2.forEach((c, k) => {
  const cel = cab2.getCell(k + 1);
  cel.value = c.h;
  cel.font = { size: 9, bold: true, color: { argb: TINTA } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUNDO } };
  cel.alignment = { vertical: "middle", horizontal: c.fmt ? "right" : "left", wrapText: true };
  cel.border = { bottom: { style: "thin", color: { argb: RISCO } } };
});
cab2.height = 26;
const ORDEM_MOTIVO = [SAIU.margem, SAIU.massiva, SAIU.inativoSemEstoque, SAIU.repetido, SAIU.rebateMenor, SAIU.outro];
for (const l of saem.sort((a, b) => ORDEM_MOTIVO.indexOf(a.motivoSaida) - ORDEM_MOTIVO.indexOf(b.motivoSaida))) {
  const linha = a2.addRow({
    motivo: l.motivoSaida,
    mlb: l.mlb,
    nome: txt(l.cel[2]),
    tipo: txt(l.cel[3]),
    status: l.statusAnuncio,
    estoque: l.estoque,
    pct: num(l.cel[5]),
    mes: num(l.cel[6]),
    rel: num(l.cel[10]),
    dia: num(l.cel[14]),
    retorno: [txt(l.cel[7]), txt(l.cel[13]), txt(l.cel[17])].filter(Boolean).join("  ·  "),
  });
  linha.height = 15;
  C2.forEach((c, k) => {
    const cel = linha.getCell(k + 1);
    cel.font = { size: 9, color: { argb: c.suave ? SUAVE : TINTA } };
    if (c.fmt) { cel.numFmt = c.fmt; cel.alignment = { horizontal: "right" }; }
    if (c.forte) cel.font = { size: 9, bold: true, color: { argb: "FFB91C1C" } };
    cel.border = { bottom: { style: "hair", color: { argb: RISCO } } };
  });
}
a2.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: C2.length } };

/* o que foi mexido, para auditoria */
const a3 = wb2.addWorksheet("O que eu mudei");
a3.columns = [{ width: 15 }, { width: 70 }];
a3.addRow(["MLB", "Mudança"]).font = { bold: true, size: 10 };
for (const l of ficam.filter((x) => x.mudou.length)) for (const m of l.mudou) a3.addRow([l.mlb, m]).font = { size: 9 };

if (conferir.length) {
  const a4 = wb2.addWorksheet("Conferir");
  a4.columns = [{ width: 15 }, { width: 14 }, { width: 28 }, { width: 60 }];
  a4.addRow(["MLB", "Onde", "Texto do Meli", "Nota"]).font = { bold: true, size: 10 };
  for (const c of conferir) a4.addRow([c.mlb, c.onde, c.texto, c.nota]).font = { size: 9 };
}

const destino2 = process.env.SAIDA2 ?? "C:/Users/dudu4/Downloads/Pre-acordo-outubro-fora-da-planilha.xlsx";
await wb2.xlsx.writeFile(destino2);
console.log(`\u2713 ${destino2}`);
