/**
 * Roda o processamento de promoções fora da Vercel, cronometrando cada
 * etapa.
 *
 * Existe porque "não consegui falar com o servidor" não diz nada: pode ser
 * tempo, memória, limite de corpo ou erro dentro da função. Medir aqui
 * separa as hipóteses antes de mexer no código.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { processarPlanilha } from "./lib/processar.mjs";

const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_KEY;
if (!URL_BASE || !CHAVE) {
  console.error("faltam SUPABASE_URL/SUPABASE_KEY");
  process.exit(1);
}

const h = { apikey: CHAVE, authorization: `Bearer ${CHAVE}` };
const marcos = [];
let ultimo = Date.now();
const marcar = (nome) => {
  const agora = Date.now();
  marcos.push([nome, agora - ultimo]);
  ultimo = agora;
};

async function pagina(caminho, offset) {
  const j = caminho.includes("?") ? "&" : "?";
  const r = await fetch(`${URL_BASE}/rest/v1${caminho}${j}limit=1000&offset=${offset}`, {
    headers: h,
  });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** Mesma estratégia da aplicação: paralelo em blocos. */
async function lerTudo(caminho, simultaneas = 8) {
  const primeira = await pagina(caminho, 0);
  if (primeira.length < 1000) return primeira;
  const todos = [...primeira];
  let off = 1000;
  for (;;) {
    const lote = await Promise.all(
      Array.from({ length: simultaneas }, (_, i) => pagina(caminho, off + i * 1000))
    );
    let acabou = false;
    for (const p of lote) {
      todos.push(...p);
      if (p.length < 1000) acabou = true;
    }
    if (acabou) return todos;
    off += simultaneas * 1000;
  }
}

/* ── 1. Fórmula base do banco ─────────────────────────────── */

const [itens, precos] = await Promise.all([
  lerTudo("/formula_base_itens?select=mlb,tipo_anuncio,comissao_padrao"),
  lerTudo("/formula_base_precos?select=chave_tipo,chave,comissao,preco"),
]);
marcar("carregar Fórmula base do banco");

const baseMlb = new Map();
for (const i of itens) {
  baseMlb.set(String(i.mlb), {
    tipo: i.tipo_anuncio === "premium" ? "Premium" : "Clássico",
    padrao: Number(i.comissao_padrao),
  });
}
const precosSKU = new Map();
const precosMLB = new Map();
for (const p of precos) {
  const alvo = p.chave_tipo === "mlb" ? precosMLB : precosSKU;
  const chave = String(p.chave);
  const linha = alvo.get(chave) ?? {};
  linha[Math.round(Number(p.comissao) * 1000) / 1000] = Number(p.preco);
  alvo.set(chave, linha);
}
const formulaData = { baseMlb, precosSKU, precosMLB };
marcar("montar os mapas");

console.log(`base: ${baseMlb.size} anúncios, ${precosSKU.size} SKUs, ${precosMLB.size} MLBs\n`);

/* ── 2. Processar as planilhas ────────────────────────────── */

const arquivos = process.argv.slice(2);
const todasLinhas = [];

for (const caminho of arquivos) {
  const buffer = readFileSync(caminho);
  const r = await processarPlanilha(buffer, basename(caminho), formulaData, 0);
  todasLinhas.push(...r.linhas);
  marcar(`processar ${basename(caminho).slice(0, 42)}`);
  console.log(
    `  ${basename(caminho).slice(0, 52)}\n    campanha "${r.campanha}" · ${r.linhas.length} linhas · ` +
      `${r.linhas.filter((l) => l.aprovado).length} participam`
  );
}

/* ── 3. Simular a gravação ────────────────────────────────── */

const codigos = [...new Set(todasLinhas.map((l) => l.mlb.toUpperCase()))];
const achados = new Map();
for (let i = 0; i < codigos.length; i += 200) {
  const lista = codigos.slice(i, i + 200).map((c) => `"${c}"`).join(",");
  const r = await fetch(
    `${URL_BASE}/rest/v1/anuncios?select=id,codigo_externo&codigo_externo=in.(${lista})`,
    { headers: h }
  );
  for (const a of await r.json()) achados.set(a.codigo_externo.toUpperCase(), a.id);
}
marcar(`buscar ${codigos.length} anúncios (${Math.ceil(codigos.length / 200)} lotes)`);

console.log(`\n${todasLinhas.length} linhas · ${achados.size} de ${codigos.length} MLBs no catálogo`);

console.log("\n=== tempo por etapa ===");
let total = 0;
for (const [nome, ms] of marcos) {
  total += ms;
  console.log(`  ${(ms / 1000).toFixed(1).padStart(6)}s  ${nome}`);
}
console.log(`  ${(total / 1000).toFixed(1).padStart(6)}s  TOTAL`);
