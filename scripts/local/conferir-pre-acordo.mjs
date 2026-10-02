/**
 * O pré-acordo contra o que está CONFIGURADO no Mercado Livre.
 *
 * ── Por que o preço do item não serve ──
 *
 * A primeira versão disto comparava o pré-acordo com `item.price`, e
 * concluiu que nada tinha entrado. Estava errado: `price` é o preço PADRÃO,
 * e promoção aceita vive numa regra de preço separada, que pode estar
 * programada para começar depois ou restrita a um canal. Havia anúncio com
 * o preço do acordo configurado ao centavo enquanto o `price` mostrava o
 * valor cheio.
 *
 * Quem responde "está ativa, está programada, o preço está certo" é
 * `/items/{id}/prices`: devolve cada regra com valor, início e fim. É de lá
 * que vem tudo aqui.
 *
 * (`/seller-promotions/*` seria o caminho natural e responde 403 para esta
 * aplicação — falta escopo de promoções.)
 *
 * ── O que ele compara ──
 *
 * Os três patamares da planilha — mês todo, oferta do dia e relâmpago —
 * contra as regras configuradas, dizendo de cada um se está ATIVA,
 * PROGRAMADA, ENCERRADA, com PREÇO DIFERENTE, ou se simplesmente NÃO EXISTE.
 *
 * Uso:
 *   node scripts/local/conferir-pre-acordo.mjs "<arquivo.xlsx>" "<aba>"
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
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ARQUIVO = process.argv[2];
const ABA = process.argv[3];
if (!ARQUIVO || !ABA) {
  console.log('Uso: node scripts/local/conferir-pre-acordo.mjs "<arquivo.xlsx>" "<aba>"');
  process.exit(1);
}

/** Onde cada CLI dono guarda o access token já renovado. */
const TOKENS = [
  "C:/Users/dudu4/OneDrive/Desktop/Meli+/.meli/token.json",
  "C:/Users/dudu4/OneDrive/Desktop/apis/Mercado Livre Principal/.meli/token.json",
];

const txt = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    return String(v.result ?? v.text ?? v.richText?.map((r) => r.text).join("") ?? "");
  }
  return String(v);
};
const num = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = txt(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const x = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(x) ? x : null;
};
const dia = (ms) =>
  ms == null ? "" : new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/* ── O acordo ───────────────────────────────────────────── */

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);
const ws = wb.getWorksheet(ABA);
if (!ws) {
  console.log(`Aba "${ABA}" não existe. Abas: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  process.exit(1);
}

let cab = 0;
for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
  const linha = [];
  for (let c = 1; c <= ws.columnCount; c++) linha.push(txt(ws.getCell(r, c).value).trim().toUpperCase());
  if (linha.includes("SKU") && linha.includes("MLB")) { cab = r; break; }
}
if (!cab) {
  console.log("Não achei a linha de cabeçalho (preciso de uma com SKU e MLB).");
  process.exit(1);
}

const acordo = [];
for (let r = cab + 1; r <= ws.rowCount; r++) {
  const mlb = txt(ws.getCell(r, 2).value).trim().toUpperCase();
  if (!/^MLB\d+/.test(mlb)) continue;
  acordo.push({
    linhaOrigem: r,
    sku: txt(ws.getCell(r, 1).value).trim(),
    mlb,
    nome: txt(ws.getCell(r, 3).value).trim(),
    tipo: txt(ws.getCell(r, 4).value).trim(),
    mesTodo: num(ws.getCell(r, 7).value),
    retornoMeli: txt(ws.getCell(r, 8).value).trim(),
    obs: txt(ws.getCell(r, 9).value).trim(),
    relampago: num(ws.getCell(r, 11).value),
    ofertaDia: num(ws.getCell(r, 15).value),
  });
}
console.log(`${ABA}: ${acordo.length} anúncios`);

/* ── Contexto do banco: conta e situação do anúncio ─────── */

const todas = async (tabela, colunas) => {
  const saida = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tabela).select(colunas).range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    saida.push(...data);
    if (data.length < 1000) break;
  }
  return saida;
};
const anuncios = await todas("anuncios", "codigo_externo,status,conta_canal_id,estoque");
const contas = await todas("contas_canal", "id,nome,identificador");
const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
const vendedorDaConta = new Map(
  contas.filter((c) => c.identificador).map((c) => [c.id, String(c.identificador)])
);
const porMlb = new Map(anuncios.map((a) => [String(a.codigo_externo).toUpperCase(), a]));

/* ── Tokens, um por vendedor ────────────────────────────── */

const H = new Map();
for (const caminho of TOKENS) {
  if (!fs.existsSync(caminho)) continue;
  const t = JSON.parse(fs.readFileSync(caminho, "utf8").replace(/^\uFEFF/, ""));
  if (Date.parse(t.createdAt ?? 0) + (t.expires_in ?? 21600) * 1000 < Date.now() + 60_000) {
    console.log(`\u2717 token vencido em ${caminho}`);
    console.log("  Rode o CLI daquela pasta primeiro: node ./src/cli.mjs me");
    process.exit(1);
  }
  H.set(String(t.user_id), { Authorization: "Bearer " + t.access_token, Accept: "application/json" });
}
if (!H.size) {
  console.log("\u2717 nenhum token encontrado nas pastas dos CLIs.");
  process.exit(1);
}

/* ── As regras de preço de cada anúncio ─────────────────── */

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const AGORA = Date.now();
let lidos = 0;
const falhas = [];

for (const a of acordo) {
  const doBanco = porMlb.get(a.mlb);
  a.conta = doBanco ? (nomeConta.get(doBanco.conta_canal_id) ?? "") : "";
  a.situacao = doBanco?.status ?? "não sincronizado";
  a.estoque = doBanco?.estoque ?? null;

  /* O token da conta do anúncio primeiro; o outro só como tentativa. */
  const dono = doBanco ? vendedorDaConta.get(doBanco.conta_canal_id) : null;
  const ordem = dono && H.has(dono) ? [H.get(dono), ...[...H.values()].filter((h) => h !== H.get(dono))] : [...H.values()];

  a.regras = null;
  for (const h of ordem) {
    const r = await fetch(`https://api.mercadolibre.com/items/${a.mlb}/prices`, { headers: h });
    if (r.ok) {
      a.regras = (await r.json()).prices ?? [];
      lidos++;
      break;
    }
    await espera(200);
  }
  if (!a.regras) falhas.push(a.mlb);
  await espera(260);
}

console.log(`regras de preço lidas: ${lidos} de ${acordo.length}`);
if (falhas.length) console.log("sem resposta: " + falhas.join(", "));

/* ── Casar cada patamar com o que está configurado ──────── */

/*
 * Tolerância de centavos: a planilha guarda 2495.145 e o canal publica
 * 2495.15. Comparar exato marcaria como ausente o que está lá.
 */
const PERTO = 0.75;
/* "Quase certo": erro de até 2% ainda é a mesma oferta mal calculada. */
const QUASE = 0.02;

/**
 * Que tipo de oferta é uma regra de preço, pela DURAÇÃO da janela.
 *
 * Medido nos dados: as 90 regras dos 63 anúncios do acordo caem em duas
 * durações só — 54 de 21+ dias (01/10 a 31/10, o acordo do mês) e 36 de 15
 * dias (28/09 a 13/10, outra campanha). Nenhuma de um dia, nenhuma de horas.
 */
function tipoDeJanela(horas, inicio, mesDoAcordo) {
  if (horas == null) return "sem data";
  if (horas <= 6) return "rel";
  if (horas <= 26) return "dia";
  if (horas < 21 * 24) return "outra";

  /*
   * Janela longa só é a promoção DO ACORDO se começar no mês dele.
   *
   * Um anúncio tinha regra de 38 dias a R$ 2.176 rodando 02/09 a 10/10 — a
   * duração dizia "mês", mas é a de setembro. Sem esta checagem ela era
   * comparada com o preço de outubro e saía como "preço errado em R$ 99",
   * quando a promoção de outubro simplesmente não existe.
   */
  if (mesDoAcordo == null || inicio == null) return "mes";
  const d = new Date(inicio);
  return d.getUTCFullYear() * 12 + d.getUTCMonth() === mesDoAcordo ? "mes" : "outra";
}

/**
 * Qual mês o acordo cobre, deduzido das próprias regras longas.
 *
 * Em vez de confiar no nome da aba: o mês do acordo é aquele em que a maior
 * parte das promoções longas começa. Com 54 das 90 regras começando em
 * 01/10, outubro ganha sozinho — e se a aba for de outro mês, calibra.
 */
function mesPredominante(todasAsRegras) {
  const contagem = new Map();
  for (const r of todasAsRegras) {
    if (r.type === "standard" || r.horas == null || r.horas < 21 * 24 || r.ini == null) continue;
    const d = new Date(r.ini);
    // Começou nos primeiros dias do mês? É o que caracteriza "o mês todo".
    if (d.getUTCDate() > 3) continue;
    const k = d.getUTCFullYear() * 12 + d.getUTCMonth();
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  let melhor = null;
  for (const [k, v] of contagem) if (melhor == null || v > contagem.get(melhor)) melhor = k;
  return melhor;
}

/**
 * O patamar acordado existe entre as regras configuradas?
 *
 * Casa pela JANELA primeiro, e só depois confere o preço. A versão anterior
 * casava por proximidade de valor entre TODAS as regras — e com isso usava
 * a mesma promoção de outra campanha para responder "mês todo" e "oferta do
 * dia" ao mesmo tempo, dizendo "preço diferente" nas duas. Lido assim,
 * parecia erro de valor quando o fato era que a oferta nunca foi criada.
 */
function avaliar(alvo, regras, qual) {
  if (alvo == null) return { estado: "", preco: null, dif: null, vigencia: "", ordem: 9 };

  const minhas = (regras ?? []).filter((p) => p.type !== "standard" && p.janela === qual);
  if (!minhas.length) {
    const temOutra = (regras ?? []).some((p) => p.type !== "standard");
    return {
      estado: temOutra ? "Não criada" : "Nenhuma promoção",
      preco: null,
      dif: null,
      vigencia: "",
      ordem: 0,
    };
  }

  const bate = minhas.filter((p) => Math.abs(p.amount - alvo) <= PERTO);
  const escolhida = bate.length
    ? (bate.find((p) => p.vigente) ?? bate.find((p) => p.futura) ?? bate[0])
    : null;

  if (escolhida) {
    const estado = escolhida.vigente ? "Ativa" : escolhida.futura ? "Programada" : "Encerrada";
    return {
      estado,
      preco: escolhida.amount,
      dif: 0,
      vigencia: `${dia(escolhida.ini)} a ${dia(escolhida.fim)}`,
      ordem: estado === "Ativa" ? 5 : estado === "Programada" ? 4 : 1,
    };
  }

  /* Existe oferta da janela certa, em outro valor. Aí sim é erro de preço. */
  const maisPerto = minhas.reduce(
    (m, p) => (m == null || Math.abs(p.amount - alvo) < Math.abs(m.amount - alvo) ? p : m),
    null
  );
  const erro = Math.abs(maisPerto.amount - alvo) / alvo;
  return {
    estado: erro <= QUASE ? "Preço quase certo" : "Preço diferente",
    preco: maisPerto.amount,
    dif: maisPerto.amount - alvo,
    vigencia: `${dia(maisPerto.ini)} a ${dia(maisPerto.fim)}`,
    ordem: erro <= QUASE ? 3 : 2,
  };
}

/* Datas primeiro, para deduzir o mês do acordo antes de classificar. */
for (const a of acordo) {
  for (const r of a.regras ?? []) {
    r.ini = r.conditions?.start_time ? Date.parse(r.conditions.start_time) : null;
    r.fim = r.conditions?.end_time ? Date.parse(r.conditions.end_time) : null;
    r.horas = r.ini != null && r.fim != null ? (r.fim - r.ini) / 3600000 : null;
  }
}
const MES_ACORDO = mesPredominante(acordo.flatMap((a) => a.regras ?? []));
console.log(
  "mês do acordo deduzido: " +
    (MES_ACORDO == null
      ? "(não deduzi)"
      : new Date(Date.UTC(Math.floor(MES_ACORDO / 12), MES_ACORDO % 12, 1)).toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
          // Sem isto, 1/10 em UTC vira 30/09 no Brasil e o log diz o mês errado.
          timeZone: "UTC",
        }))
);

for (const a of acordo) {
  /* Anota janela e vigência uma vez; avaliar() e o resto leem daqui. */
  for (const r of a.regras ?? []) {
    r.janela = r.type === "standard" ? "padrao" : tipoDeJanela(r.horas, r.ini, MES_ACORDO);
    r.vigente = (!r.ini || AGORA >= r.ini) && (!r.fim || AGORA <= r.fim);
    r.futura = r.ini != null && AGORA < r.ini;
  }

  a.mes = avaliar(a.mesTodo, a.regras, "mes");
  a.dia = avaliar(a.ofertaDia, a.regras, "dia");
  a.rel = avaliar(a.relampago, a.regras, "rel");

  a.precoPadrao = (a.regras ?? []).find((p) => p.type === "standard")?.amount ?? null;

  /*
   * Existe promoção cobrindo O MÊS TODO?
   *
   * O acordo é de 1 a 31 de outubro. Boa parte das promoções configuradas
   * roda 28/09 a 13/10 — são de outra campanha, e não do pré-acordo. Sem
   * esta coluna as duas se misturavam em "preço diferente", e parecia erro
   * de valor quando na verdade a promoção do mês nunca foi criada.
   */
  const promos = (a.regras ?? []).filter((p) => p.type !== "standard");
  a.promoDoMes = promos.some((p) => {
    const ini = p.conditions?.start_time ? new Date(p.conditions.start_time) : null;
    const fim = p.conditions?.end_time ? new Date(p.conditions.end_time) : null;
    if (!ini || !fim) return false;
    // Começa no primeiro dia do mês e vai até o fim dele, com folga de um dia
    // para a diferença de fuso que o canal grava (03:00Z).
    return ini.getUTCDate() <= 2 && fim.getTime() - ini.getTime() > 25 * 86_400_000;
  })
    ? "Sim"
    : promos.length
      ? "Não, só de outra campanha"
      : "Não, nenhuma";

  /* Todas as promoções configuradas, para ver o que existe além do acordo. */
const ROTULO = { mes: "mês", dia: "1 dia", rel: "relâmp", outra: "outra campanha", "sem data": "sem data" };
  a.todas = (a.regras ?? [])
    .filter((p) => p.type !== "standard")
    .map((p) => {
      const marca = p.futura ? "prog" : !p.vigente ? "fim" : "ativa";
      return `${p.amount.toFixed(2)} [${ROTULO[p.janela] ?? p.janela}] ${marca} ${dia(p.ini)}-${dia(p.fim)}`;
    })
    .join("   ·   ");
  a.deOutrasCampanhas = (a.regras ?? []).filter((p) => p.janela === "outra").length;

  /*
   * O resumo separa "não tem nada" de "tem, mas no preço errado". Juntar os
   * dois esconde a diferença que decide a ação: o primeiro precisa ser
   * criado, o segundo só corrigido — e corrigir é muito mais rápido.
   */
  const pedidos = [a.mesTodo, a.ofertaDia, a.relampago].filter((x) => x != null).length;
  const estados = [a.mes, a.dia, a.rel].filter((x) => x.estado);
  const prontos = estados.filter((x) => x.estado === "Ativa" || x.estado === "Programada").length;
  const quase = estados.filter((x) => x.estado === "Preço quase certo").length;
  const temAlgumaPromo = (a.regras ?? []).some((p) => p.type !== "standard");

  /*
   * O resumo espelha os estados de verdade. Antes ele dizia "Preço errado"
   * tanto para quem tem a oferta do mês em outro valor quanto para quem não
   * a tem — e são ações diferentes: a primeira se corrige, a segunda se
   * cria.
   */
  a.resumo =
    a.regras == null
      ? "Não consegui ler"
      : pedidos === 0
        ? "Sem acordo na planilha"
        : prontos === pedidos
          ? `Tudo certo (${prontos}/${pedidos})`
          : prontos > 0
            ? `Parcial (${prontos}/${pedidos})`
            : !temAlgumaPromo
              ? "Nenhuma promoção criada"
              : quase > 0
                ? "Mês quase certo, resto não criado"
                : a.mes.estado === "Preço diferente"
                  ? "Mês com preço errado"
                  : "Acordo não criado";

  a.ordemGeral =
    a.regras == null ? 9
      : prontos === pedidos ? 5
        : prontos > 0 ? 4
          : !temAlgumaPromo ? 0
            : quase > 0 ? 3
              : a.mes.estado === "Preço diferente" ? 2
                : 1;
}

/* O que precisa de ação primeiro. */
acordo.sort((x, y) => x.ordemGeral - y.ordemGeral || x.mes.ordem - y.mes.ordem || x.sku.localeCompare(y.sku));

const resumo = acordo.reduce((m, a) => ((m[a.resumo.replace(/ \(.*/, "")] = (m[a.resumo.replace(/ \(.*/, "")] ?? 0) + 1), m), {});
console.log("resumo: " + JSON.stringify(resumo));
const porEstado = (k) => acordo.reduce((m, a) => ((m[a[k].estado || "—"] = (m[a[k].estado || "—"] ?? 0) + 1), m), {});
console.log("mês todo:      " + JSON.stringify(porEstado("mes")));
console.log("oferta do dia: " + JSON.stringify(porEstado("dia")));
console.log("relâmpago:     " + JSON.stringify(porEstado("rel")));

/* ── A planilha ─────────────────────────────────────────── */

const TINTA = "FF1F2430";
const SUAVE = "FF6B7280";
const LINHA = "FFE5E7EB";
const FUNDO = "FFF3F4F6";
const BANDA = "FFEDF0F4";

const TOM = {
  Ativa: "FF15803D",
  "Não criada": "FFB91C1C",
  Programada: "FF1D4ED8",
  "Preço quase certo": "FF92400E",
  "Preço diferente": "FFB45309",
  Encerrada: "FF6B7280",
  "Nenhuma promoção": "FFB91C1C",
};

const saida = new ExcelJS.Workbook();
saida.creator = "Plataforma Probel";
const aba = saida.addWorksheet("Pré-acordo configurado", {
  views: [{ state: "frozen", xSplit: 2, ySplit: 5 }],
});

const COLS = [
  { h: "SKU", k: "sku", w: 11 },
  { h: "MLB", k: "mlb", w: 15 },
  { h: "Produto", k: "nome", w: 42 },
  { h: "Tipo", k: "tipo", w: 9 },
  { h: "Conta", k: "conta", w: 20, suave: true },
  { h: "Situação", k: "situacao", w: 10, suave: true },
  { h: "Resumo", k: "resumo", w: 22, forte: true },
  { h: "Promo do mês?", k: "promoDoMes", w: 22, suave: true },
  { h: "Regras de outra campanha", k: "deOutrasCampanhas", w: 12, fmt: "#,##0", suave: true },
  { h: "Preço padrão", k: "precoPadrao", w: 12, fmt: "#,##0.00" },

  { h: "Acordado", k: "mesTodo", w: 12, fmt: "#,##0.00", banda: "Mês todo (5%)" },
  { h: "Situação", k: "mesEstado", w: 17, estado: "mes", banda: "Mês todo (5%)" },
  { h: "Configurado", k: "mesPreco", w: 12, fmt: "#,##0.00", banda: "Mês todo (5%)" },
  { h: "Dif.", k: "mesDif", w: 10, fmt: "#,##0.00", banda: "Mês todo (5%)" },
  { h: "Vigência", k: "mesVig", w: 15, suave: true, banda: "Mês todo (5%)" },

  { h: "Acordado", k: "ofertaDia", w: 12, fmt: "#,##0.00", banda: "Oferta do dia (6%)" },
  { h: "Situação", k: "diaEstado", w: 17, estado: "dia", banda: "Oferta do dia (6%)" },
  { h: "Configurado", k: "diaPreco", w: 12, fmt: "#,##0.00", banda: "Oferta do dia (6%)" },
  { h: "Dif.", k: "diaDif", w: 10, fmt: "#,##0.00", banda: "Oferta do dia (6%)" },
  { h: "Vigência", k: "diaVig", w: 15, suave: true, banda: "Oferta do dia (6%)" },

  { h: "Acordado", k: "relampago", w: 12, fmt: "#,##0.00", banda: "Relâmpago (7%)" },
  { h: "Situação", k: "relEstado", w: 17, estado: "rel", banda: "Relâmpago (7%)" },
  { h: "Configurado", k: "relPreco", w: 12, fmt: "#,##0.00", banda: "Relâmpago (7%)" },
  { h: "Dif.", k: "relDif", w: 10, fmt: "#,##0.00", banda: "Relâmpago (7%)" },
  { h: "Vigência", k: "relVig", w: 15, suave: true, banda: "Relâmpago (7%)" },

  { h: "Todas as promoções configuradas", k: "todas", w: 52, suave: true },
  { h: "Retorno MELI", k: "retornoMeli", w: 18, suave: true },
  { h: "Obs", k: "obs", w: 18, suave: true },
];

aba.columns = COLS.map((c) => ({ key: c.k, width: c.w }));

aba.mergeCells(1, 1, 1, COLS.length);
const t1 = aba.getCell(1, 1);
t1.value = `Pré-acordo ${ABA} — o que está configurado no Mercado Livre`;
t1.font = { size: 13, bold: true, color: { argb: TINTA } };
aba.getRow(1).height = 22;

aba.mergeCells(2, 1, 2, COLS.length);
const t2 = aba.getCell(2, 1);
t2.value =
  `Regras de preço lidas da API em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` +
  `   |   ${lidos} de ${acordo.length} anúncios   |   ` +
  Object.entries(resumo).map(([k, v]) => `${k}: ${v}`).join("  ·  ");
t2.font = { size: 9, color: { argb: SUAVE } };

aba.mergeCells(3, 1, 3, COLS.length);
const t3 = aba.getCell(3, 1);
t3.value =
  "Ativa = valendo agora  ·  Programada = aceita, começa depois  ·  Preço diferente = existe promoção, mas em outro valor  ·  Nenhuma promoção = nada configurado";
t3.font = { size: 9, italic: true, color: { argb: SUAVE } };

/* Banda que agrupa os três patamares. */
const linhaBanda = aba.getRow(4);
let i = 0;
while (i < COLS.length) {
  const b = COLS[i].banda;
  if (!b) { i++; continue; }
  let j = i;
  while (j + 1 < COLS.length && COLS[j + 1].banda === b) j++;
  aba.mergeCells(4, i + 1, 4, j + 1);
  const cel = aba.getCell(4, i + 1);
  cel.value = b;
  cel.font = { size: 9, bold: true, color: { argb: TINTA } };
  cel.alignment = { horizontal: "center" };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BANDA } };
  i = j + 1;
}
linhaBanda.height = 16;

const linhaCab = aba.getRow(5);
COLS.forEach((c, k) => {
  const cel = linhaCab.getCell(k + 1);
  cel.value = c.h;
  cel.font = { size: 9, bold: true, color: { argb: TINTA } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUNDO } };
  cel.alignment = { vertical: "middle", horizontal: c.fmt ? "right" : "left", wrapText: true };
  cel.border = { bottom: { style: "thin", color: { argb: LINHA } } };
});
linhaCab.height = 24;

for (const a of acordo) {
  const linha = aba.addRow({
    ...a,
    mesEstado: a.mes.estado, mesPreco: a.mes.preco, mesDif: a.mes.dif, mesVig: a.mes.vigencia,
    diaEstado: a.dia.estado, diaPreco: a.dia.preco, diaDif: a.dia.dif, diaVig: a.dia.vigencia,
    relEstado: a.rel.estado, relPreco: a.rel.preco, relDif: a.rel.dif, relVig: a.rel.vigencia,
  });
  linha.height = 15;
  COLS.forEach((c, k) => {
    const cel = linha.getCell(k + 1);
    cel.font = { size: 9, color: { argb: c.suave ? SUAVE : TINTA } };
    if (c.fmt) { cel.numFmt = c.fmt; cel.alignment = { horizontal: "right" }; }
    if (c.estado) {
      cel.font = { size: 9, bold: true, color: { argb: TOM[a[c.estado].estado] ?? SUAVE } };
    }
    if (c.forte) cel.font = { size: 9, bold: true, color: { argb: TINTA } };
    cel.border = { bottom: { style: "hair", color: { argb: LINHA } } };
  });
}

aba.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: COLS.length } };

const destino = process.env.SAIDA ?? "C:/Users/dudu4/Downloads/Pre-acordo-outubro-configurado.xlsx";
await saida.xlsx.writeFile(destino);
console.log("\n\u2713 " + destino);
