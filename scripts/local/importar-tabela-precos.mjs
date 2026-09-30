/**
 * Carrega a "Tabela de preços - marketplaces" como uma nova vigência.
 *
 *   node --conditions=react-server scripts/local/importar-tabela-precos.mjs <arquivo.xlsx> [AAAA-MM-DD]
 *
 * Lê SÓ as abas ANTECIPADO: é a condição em que o Mercado Livre paga, e é
 * a que gera os números da aba "Preços por rebate" do controle — conferido
 * em 4.391 comparações, sem uma divergência.
 *
 * Três coisas que o formato do banco exige e que não são óbvias:
 *
 *  1. `carregarFormulaBase` escolhe a vigência pela tabela de ITENS e
 *     filtra as duas por ela. Preço novo sem item novo nunca seria lido —
 *     falha em silêncio, com o motor recusando tudo por "sem preço de
 *     tabela". Por isso o mapa MLB → tipo é copiado para a vigência nova.
 *
 *  2. As linhas com chave MLB também são copiadas: a tabela nova é só por
 *     SKU, e anúncio sem SKU no cadastro depende dessa reserva.
 *
 *  3. Na aba Prodormir/BF a faixa de 15,5% vem com erro de fórmula — preço
 *     ACIMA da faixa anterior, em 100% das linhas. O passo entre faixas é
 *     linear, então o valor certo é a média das vizinhas. Só corrige onde
 *     de fato está fora de ordem; se a origem for consertada, não mexe.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import ExcelJS from "file:///C:/Users/dudu4/OneDrive/Desktop/plataforma/node_modules/exceljs/excel.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const ARQUIVO = process.argv[2];
const VIGENTE = process.argv[3] ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
if (!ARQUIVO) {
  console.error("uso: node --conditions=react-server scripts/local/importar-tabela-precos.mjs <arquivo.xlsx> [AAAA-MM-DD]");
  process.exit(1);
}

const env = {};
for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const SB = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY };
const U = env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/";

const ler = async (p) => {
  const s = [];
  for (let o = 0; ; o += 1000) {
    const r = await fetch(U + p + (p.includes("?") ? "&" : "?") + `limit=1000&offset=${o}`, { headers: SB });
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 250));
    s.push(...j); if (j.length < 1000) return s;
  }
};
const gravar = async (tabela, linhas, conflito) => {
  for (let i = 0; i < linhas.length; i += 500) {
    const r = await fetch(U + tabela + "?on_conflict=" + conflito, {
      method: "POST",
      headers: { ...SB, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(linhas.slice(i, i + 500)),
    });
    if (!r.ok) throw new Error(tabela + ": " + r.status + " " + (await r.text()).slice(0, 300));
    process.stdout.write("\r  " + tabela + ": " + Math.min(i + 500, linhas.length) + "/" + linhas.length);
  }
  process.stdout.write("\n");
};

const t = (v) => v == null ? "" : typeof v === "object" ? String(v.result ?? v.text ?? (v.richText?.map((r) => r.text).join("")) ?? "") : String(v);
const n = (v) => { const x = Number(t(v)); return Number.isFinite(x) && t(v) !== "" ? x : null; };

const bytes = fs.readFileSync(ARQUIVO);
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);

const abas = wb.worksheets.map((w) => w.name).filter((nome) => /antecipado/i.test(nome));
if (!abas.length) { console.error("nenhuma aba com 'antecipado' no nome"); process.exit(1); }

const porSku = new Map();
let corrigidas = 0, repetidos = 0;
for (const nome of abas) {
  const ws = wb.getWorksheet(nome);
  const cab = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (cab[i] = t(c.value)));
  const faixas = [];
  for (let i = 1; i <= ws.columnCount; i++) {
    const x = n(cab[i]);
    if (x != null && x > 0 && x < 1) faixas.push({ col: i, faixa: Math.round(x * 1000) / 1000 });
  }
  let lidos = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const sku = t(ws.getCell(r, 1).value).trim().toUpperCase();
    if (!/^PA/.test(sku)) continue;
    const linha = {};
    for (const f of faixas) {
      const v = n(ws.getCell(r, f.col).value);
      if (v != null && v > 0) linha[f.faixa] = v;
    }
    if (!Object.keys(linha).length) continue;
    const acima = linha[0.165], abaixo = linha[0.145];
    if (acima != null && abaixo != null && linha[0.155] > acima) {
      linha[0.155] = Math.round(((acima + abaixo) / 2) * 100) / 100;
      corrigidas++;
    }
    lidos++;
    if (porSku.has(sku)) { repetidos++; continue; }
    porSku.set(sku, linha);
  }
  console.log(nome + ": " + lidos + " SKUs, " + faixas.length + " faixas");
}
console.log("SKUs únicos: " + porSku.size + " | faixas de 15,5% corrigidas: " + corrigidas + " | repetidos entre abas: " + repetidos);

const vigs = await ler("formula_base_itens?select=vigente_de,operacao_id");
const anterior = [...new Set(vigs.map((v) => v.vigente_de))].sort().reverse()[0];
const OPERACAO = vigs[0].operacao_id;
if (anterior >= VIGENTE) {
  console.error(`a vigência ${VIGENTE} não é mais nova que a atual (${anterior}) — o sistema continuaria na antiga`);
  process.exit(1);
}
const itens = await ler("formula_base_itens?select=mlb,tipo_anuncio,comissao_padrao&vigente_de=eq." + anterior);
const mlb = await ler("formula_base_precos?select=chave,comissao,preco&chave_tipo=eq.mlb&vigente_de=eq." + anterior);
console.log("\nvigência anterior " + anterior + ": " + itens.length + " itens, " + mlb.length + " preços por MLB a copiar");

const [reg] = await (await fetch(U + "importacoes", {
  method: "POST",
  headers: { ...SB, "Content-Type": "application/json", Prefer: "return=representation" },
  body: JSON.stringify({
    operacao_id: OPERACAO, tipo: "preco_ideal",
    nome_arquivo: path.basename(ARQUIVO) + " (antecipado)",
    hash_arquivo: createHash("sha256").update(bytes).digest("hex"),
    periodo_inicio: VIGENTE, periodo_fim: VIGENTE, data_base: VIGENTE,
    linhas_lidas: porSku.size, linhas_validas: porSku.size, status: "concluida",
  }),
})).json();

await gravar("formula_base_itens", itens.map((i) => ({
  operacao_id: OPERACAO, vigente_de: VIGENTE, mlb: i.mlb,
  tipo_anuncio: i.tipo_anuncio, comissao_padrao: i.comissao_padrao, importacao_id: reg.id,
})), "operacao_id,mlb,vigente_de");

const precos = [];
for (const [sku, linha] of porSku) {
  for (const [faixa, preco] of Object.entries(linha)) {
    precos.push({
      operacao_id: OPERACAO, vigente_de: VIGENTE, chave_tipo: "sku", chave: sku,
      comissao: Number(faixa), preco: Math.round(preco * 100) / 100, importacao_id: reg.id,
    });
  }
}
for (const p of mlb) {
  precos.push({
    operacao_id: OPERACAO, vigente_de: VIGENTE, chave_tipo: "mlb", chave: p.chave,
    comissao: Number(p.comissao), preco: Number(p.preco), importacao_id: reg.id,
  });
}
await gravar("formula_base_precos", precos, "operacao_id,chave_tipo,chave,comissao,vigente_de");
console.log("\npronto — vigência " + VIGENTE + ", " + precos.length + " linhas de preço");
