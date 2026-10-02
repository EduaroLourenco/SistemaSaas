/**
 * O pré-acordo contra o preço que está no ar: quem já entrou e quem não.
 *
 * Lê a aba de pré-acordo do Controle e compara os três patamares
 * combinados — base, oferta do dia e relâmpago — com o preço publicado.
 *
 * ── De onde vem o "preço hoje" ──
 *
 * Do banco, que é o que a sincronização trouxe por último. A data da
 * leitura vai impressa no cabeçalho da planilha de propósito: dizer "não
 * entrou" com base num retrato de doze horas atrás é o tipo de conclusão
 * que faz alguém mexer no preço sem precisar.
 *
 * Com `--vivo` ele pergunta o preço ao canal na hora, usando o access
 * token que o CLI da pasta dona acabou de renovar. Nunca renova por conta
 * própria: o refresh token do Meli é de uso único, e queimá-lo daqui
 * derrubaria as automações que vivem naquelas pastas.
 *
 * Uso:
 *   node scripts/local/conferir-pre-acordo.mjs "<arquivo.xlsx>" "<aba>"
 *   node scripts/local/conferir-pre-acordo.mjs "<arquivo.xlsx>" "<aba>" --vivo
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
const VIVO = process.argv.includes("--vivo");
if (!ARQUIVO || !ABA) {
  console.log('Uso: node scripts/local/conferir-pre-acordo.mjs "<arquivo.xlsx>" "<aba>" [--vivo]');
  process.exit(1);
}

/** Onde cada CLI dono guarda o access token já renovado. */
const TOKENS = [
  "C:/Users/dudu4/OneDrive/Desktop/Meli+/.meli/token.json",
  "C:/Users/dudu4/OneDrive/Desktop/apis/Mercado Livre Principal/.meli/token.json",
];

const todas = async (tabela, colunas, filtro = (q) => q) => {
  const saida = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    saida.push(...data);
    if (data.length < 1000) break;
  }
  return saida;
};

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
  // Só trata vírgula como decimal quando ela existe — "1292.29" é 1292,29.
  const x = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(x) ? x : null;
};
const comoData = (v) => {
  if (v instanceof Date) return v;
  const s = txt(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/* ── O acordo ───────────────────────────────────────────── */

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);
const ws = wb.getWorksheet(ABA);
if (!ws) {
  console.log(`Aba "${ABA}" não existe. Abas: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  process.exit(1);
}

/* O cabeçalho é a linha que tem SKU e MLB; os dados começam na seguinte. */
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
    sku: txt(ws.getCell(r, 1).value).trim(),
    mlb,
    nome: txt(ws.getCell(r, 3).value).trim(),
    tipo: txt(ws.getCell(r, 4).value).trim(),
    rebatePct: num(ws.getCell(r, 6).value),
    minimo: num(ws.getCell(r, 7).value),
    retornoMeli: txt(ws.getCell(r, 8).value).trim(),
    obs: txt(ws.getCell(r, 9).value).trim(),
    relampago: num(ws.getCell(r, 11).value),
    ofertaDia: num(ws.getCell(r, 15).value),
    datas: [19, 20, 21, 22, 23]
      .map((c) => comoData(ws.getCell(r, c).value))
      .filter(Boolean)
      .map((d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })),
  });
}
console.log(`${ABA}: ${acordo.length} anúncios`);

/* ── O que está no ar ───────────────────────────────────── */

const anuncios = await todas(
  "anuncios",
  "codigo_externo,titulo,preco_atual,status,estoque,sincronizado_em,conta_canal_id,url"
);
const contas = await todas("contas_canal", "id,nome,identificador");
const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
const porMlb = new Map(anuncios.map((a) => [String(a.codigo_externo).toUpperCase(), a]));

let origemPreco = "banco";
let lidoEm = null;
const vivos = new Map();

if (VIVO) {
  /*
   * Token POR CONTA, casado pelo user_id que o próprio arquivo guarda.
   *
   * O Mercado Livre só devolve o anúncio de quem o token representa: pedir
   * um anúncio da conta a prazo com o token de São Paulo volta sem corpo.
   * A primeira versão disto tentava os tokens em ordem e parava no primeiro
   * que respondesse 200 — e o multiget responde 200 mesmo quando cada item
   * dentro dele falhou. Resultado: 15 dos 62 anúncios voltavam vazios.
   *
   * Só o access token é lido. Nada é renovado aqui: o refresh do Meli é de
   * uso único, e queimá-lo daqui derrubaria as automações daquelas pastas.
   */
  const porVendedor = new Map();
  for (const caminho of TOKENS) {
    if (!fs.existsSync(caminho)) continue;
    const t = JSON.parse(fs.readFileSync(caminho, "utf8").replace(/^﻿/, ""));
    const criado = Date.parse(t.createdAt ?? t.created_at ?? 0);
    if (criado + (t.expires_in ?? 21600) * 1000 < Date.now() + 60_000) {
      console.log(`✗ token vencido em ${caminho}`);
      console.log("  Rode o CLI daquela pasta primeiro: node ./src/cli.mjs me");
      process.exit(1);
    }
    porVendedor.set(String(t.user_id), {
      Authorization: "Bearer " + t.access_token,
      Accept: "application/json",
    });
  }
  if (!porVendedor.size) {
    console.log("✗ nenhum token encontrado nas pastas dos CLIs.");
    process.exit(1);
  }

  /* De qual vendedor é cada anúncio, pelo que o banco já sabe. */
  const vendedorDaConta = new Map(
    contas.filter((c) => c.identificador).map((c) => [c.id, String(c.identificador)])
  );
  const grupos = new Map();
  for (const mlb of new Set(acordo.map((a) => a.mlb))) {
    const conta = porMlb.get(mlb)?.conta_canal_id;
    const vendedor = conta ? vendedorDaConta.get(conta) : null;
    const chave = vendedor && porVendedor.has(vendedor) ? vendedor : "?";
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(mlb);
  }

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const ATRIBUTOS = "id,price,original_price,status,available_quantity";
  let pedidos = 0;

  for (const [vendedor, ids] of grupos) {
    // Vendedor desconhecido: tenta todos os tokens, porque é a única chance.
    const tentar = vendedor === "?" ? [...porVendedor.values()] : [porVendedor.get(vendedor)];
    for (let i = 0; i < ids.length; i += 20) {
      const lote = ids.slice(i, i + 20);
      for (const h of tentar) {
        const r = await fetch(
          `https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=${ATRIBUTOS}`,
          { headers: h }
        );
        pedidos++;
        if (!r.ok) continue;
        for (const item of await r.json()) {
          if (item.code === 200 && item.body?.id) {
            vivos.set(String(item.body.id).toUpperCase(), item.body);
          }
        }
        await espera(350);
      }
    }
  }

  const total = new Set(acordo.map((a) => a.mlb)).size;
  origemPreco = `API do Mercado Livre (${vivos.size} de ${total})`;
  lidoEm = new Date();
  console.log(`preço ao vivo: ${vivos.size} de ${total} anúncios, em ${pedidos} chamadas`);
  const faltaram = [...new Set(acordo.map((a) => a.mlb))].filter((m) => !vivos.has(m));
  if (faltaram.length) console.log("sem resposta do canal: " + faltaram.join(", "));
}

/*
 * Tolerância de centavos: a planilha guarda 2495.145 e o canal publica
 * 2495.15. Comparar exato marcaria como "não entrou" o que entrou.
 */
const PERTO = 0.75;
const bate = (a, b) => a != null && b != null && Math.abs(a - b) <= PERTO;

for (const a of acordo) {
  const doBanco = porMlb.get(a.mlb);
  const aoVivo = vivos.get(a.mlb);

  a.precoHoje = aoVivo?.price != null ? Number(aoVivo.price) : doBanco?.preco_atual != null ? Number(doBanco.preco_atual) : null;
  a.precoCheio = aoVivo?.original_price != null ? Number(aoVivo.original_price) : null;
  a.situacao = aoVivo?.status ?? doBanco?.status ?? "não encontrado";
  a.estoque = aoVivo?.available_quantity ?? doBanco?.estoque ?? null;
  a.conta = doBanco ? (nomeConta.get(doBanco.conta_canal_id) ?? "") : "";
  a.url = doBanco?.url ?? "";

  if (!lidoEm && doBanco?.sincronizado_em) {
    const d = new Date(doBanco.sincronizado_em);
    if (!lidoEm || d > lidoEm) lidoEm = d;
  }

  const p = a.precoHoje;
  const alvos = [a.minimo, a.ofertaDia, a.relampago].filter((x) => x != null);

  if (p == null) {
    a.entrou = "Sem preço";
    a.patamar = "";
  } else if (bate(p, a.relampago)) {
    a.entrou = "Entrou";
    a.patamar = "Relâmpago 7%";
  } else if (bate(p, a.ofertaDia)) {
    a.entrou = "Entrou";
    a.patamar = "Oferta do dia 6%";
  } else if (bate(p, a.minimo)) {
    a.entrou = "Entrou";
    a.patamar = "Base 5%";
  } else if (alvos.length && p < Math.min(...alvos) - PERTO) {
    a.entrou = "Abaixo do acordo";
    a.patamar = "menor que o relâmpago";
  } else if (a.minimo != null && p > a.minimo + PERTO) {
    a.entrou = "Não entrou";
    a.patamar = "";
  } else {
    a.entrou = "Entre patamares";
    a.patamar = "";
  }

  /*
   * Tem promocao rodando? `original_price` so vem preenchido quando o canal
   * esta exibindo preco riscado. Separa "nao esta em oferta nenhuma" de
   * "esta em oferta, mas acima do combinado" — a acao e diferente: a
   * primeira precisa entrar na campanha, a segunda precisa de ajuste de
   * porcentagem.
   */
  a.temDesconto = a.precoCheio != null && p != null && a.precoCheio > p + 0.01 ? "Sim" : "Não";
  a.descontoAtivo =
    a.precoCheio != null && p != null && a.precoCheio > 0 ? 1 - p / a.precoCheio : null;

  a.difMinimo = p != null && a.minimo != null ? p - a.minimo : null;
  a.difPct = p != null && a.minimo != null && a.minimo > 0 ? (p - a.minimo) / a.minimo : null;
  /* O desconto que falta aplicar para chegar ao combinado. É a alavanca. */
  a.descontoFalta = p != null && a.minimo != null && p > 0 && a.minimo < p ? 1 - a.minimo / p : null;
}

const PESO = { "Abaixo do acordo": 0, "Não entrou": 1, "Entre patamares": 2, "Sem preço": 3, Entrou: 4 };
acordo.sort(
  (a, b) => PESO[a.entrou] - PESO[b.entrou] || (b.difMinimo ?? 0) - (a.difMinimo ?? 0)
);

const resumo = acordo.reduce((m, a) => ((m[a.entrou] = (m[a.entrou] ?? 0) + 1), m), {});
console.log("resumo: " + JSON.stringify(resumo));

/* ── A planilha ─────────────────────────────────────────── */

const TINTA = "FF1F2430";
const SUAVE = "FF6B7280";
const LINHA = "FFE5E7EB";
const FUNDO_CAB = "FFF3F4F6";

const saida = new ExcelJS.Workbook();
saida.creator = "Plataforma Probel";
const aba = saida.addWorksheet("Pré-acordo x praticado", {
  views: [{ state: "frozen", xSplit: 2, ySplit: 4 }],
});

const COLUNAS = [
  { h: "SKU", k: "sku", w: 11 },
  { h: "MLB", k: "mlb", w: 15 },
  { h: "Produto", k: "nome", w: 46 },
  { h: "Tipo", k: "tipo", w: 10 },
  { h: "Conta", k: "conta", w: 22 },
  { h: "Situação", k: "situacao", w: 11 },
  { h: "Estoque", k: "estoque", w: 9, fmt: "#,##0" },
  { h: "Preço hoje", k: "precoHoje", w: 13, fmt: '#,##0.00' },
  { h: "Preço cheio", k: "precoCheio", w: 13, fmt: '#,##0.00' },
  { h: "Em oferta?", k: "temDesconto", w: 11 },
  { h: "Desc. ativo", k: "descontoAtivo", w: 11, fmt: "0.0%" },
  { h: "Mínimo 5%", k: "minimo", w: 13, fmt: '#,##0.00' },
  { h: "Oferta dia 6%", k: "ofertaDia", w: 13, fmt: '#,##0.00' },
  { h: "Relâmpago 7%", k: "relampago", w: 13, fmt: '#,##0.00' },
  { h: "Entrou?", k: "entrou", w: 18 },
  { h: "Patamar", k: "patamar", w: 20 },
  { h: "Dif. R$", k: "difMinimo", w: 12, fmt: '#,##0.00' },
  { h: "Dif. %", k: "difPct", w: 10, fmt: "0.0%" },
  { h: "Desconto a aplicar", k: "descontoFalta", w: 17, fmt: "0.0%" },
  { h: "Retorno MELI", k: "retornoMeli", w: 20 },
  { h: "Obs", k: "obs", w: 20 },
  { h: "Datas de oferta", k: "datasTexto", w: 28 },
];

aba.columns = COLUNAS.map((c) => ({ key: c.k, width: c.w }));

/* Cabeçalho do relatório. */
aba.mergeCells(1, 1, 1, COLUNAS.length);
const t1 = aba.getCell(1, 1);
t1.value = `Pré-acordo ${ABA} — o que já entrou`;
t1.font = { size: 13, bold: true, color: { argb: TINTA } };
aba.getRow(1).height = 22;

aba.mergeCells(2, 1, 2, COLUNAS.length);
const t2 = aba.getCell(2, 1);
t2.value =
  `Preço praticado lido de: ${origemPreco}` +
  (lidoEm ? ` · ${lidoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "") +
  `   |   ${acordo.length} anúncios   |   ` +
  Object.entries(resumo).map(([k, v]) => `${k}: ${v}`).join("  ·  ");
t2.font = { size: 9, color: { argb: SUAVE } };
aba.getRow(2).height = 16;

const cabRow = aba.getRow(4);
COLUNAS.forEach((c, i) => {
  const cel = cabRow.getCell(i + 1);
  cel.value = c.h;
  cel.font = { size: 9, bold: true, color: { argb: TINTA } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUNDO_CAB } };
  cel.alignment = { vertical: "middle", horizontal: c.fmt ? "right" : "left", wrapText: true };
  cel.border = { bottom: { style: "thin", color: { argb: LINHA } } };
});
cabRow.height = 26;

const TOM = {
  "Abaixo do acordo": "FFB91C1C",
  "Não entrou": "FFB45309",
  "Entre patamares": "FF92400E",
  "Sem preço": SUAVE,
  Entrou: "FF15803D",
};

for (const a of acordo) {
  a.datasTexto = a.datas.join(", ");
  const linha = aba.addRow(a);
  linha.height = 16;
  COLUNAS.forEach((c, i) => {
    const cel = linha.getCell(i + 1);
    cel.font = { size: 9, color: { argb: TINTA } };
    if (c.fmt) {
      cel.numFmt = c.fmt;
      cel.alignment = { horizontal: "right" };
    }
    cel.border = { bottom: { style: "hair", color: { argb: LINHA } } };
  });
  const cEntrou = linha.getCell(COLUNAS.findIndex((c) => c.k === "entrou") + 1);
  cEntrou.font = { size: 9, bold: true, color: { argb: TOM[a.entrou] ?? TINTA } };
  const cPat = linha.getCell(COLUNAS.findIndex((c) => c.k === "patamar") + 1);
  cPat.font = { size: 9, color: { argb: SUAVE } };
  for (const k of ["situacao", "conta", "retornoMeli", "obs", "datasTexto", "temDesconto"]) {
    linha.getCell(COLUNAS.findIndex((c) => c.k === k) + 1).font = { size: 9, color: { argb: SUAVE } };
  }
  if (a.situacao === "pausado") {
    linha.getCell(COLUNAS.findIndex((c) => c.k === "situacao") + 1).font = {
      size: 9, bold: true, color: { argb: "FFB45309" },
    };
  }
}

aba.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLUNAS.length } };

const destino = process.env.SAIDA ?? "C:/Users/dudu4/Downloads/Pre-acordo-outubro-x-praticado.xlsx";
await saida.xlsx.writeFile(destino);
console.log("\n✓ " + destino);
