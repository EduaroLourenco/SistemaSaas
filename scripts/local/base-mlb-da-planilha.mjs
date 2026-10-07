/**
 * Completa a Base MLB a partir da planilha "Anúncios" que o Mercado Livre
 * exporta (Modificar anúncios em massa → Baixar).
 *
 * Irmão de `completar-base-mlb.mjs`, que faz o mesmo a partir da tabela
 * `anuncios`. Aquele só enxerga conta que sincroniza por API; a conta a
 * prazo da Probel não sincroniza, então os anúncios dela nunca chegavam à
 * base — e o motor de promoções recusa todo MLB fora da base com "anúncio
 * sem tipo cadastrado", que na tela aparece como "Não participar".
 *
 * Regras, as mesmas do irmão:
 * - só CRIA linha que falta, nunca sobrescreve: a comissão de uma linha
 *   existente pode ter sido negociada, e trocar pela padrão apagaria isso;
 * - comissão padrão do tipo (11,5% clássico, 16,5% premium);
 * - grava na vigência mais recente da operação, que é a que o motor carrega.
 *
 * Também avisa, sem consertar, o que a planilha contradiz na base: tipo
 * diferente, e SKU sem preço de tabela (esse continua recusado mesmo com a
 * linha criada — falta preço, não cadastro).
 *
 * Uso:
 *   node scripts/local/base-mlb-da-planilha.mjs <planilha.xlsx> <operacao_id>
 *   node scripts/local/base-mlb-da-planilha.mjs <planilha.xlsx> <operacao_id> --gravar
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const exigir = createRequire(RAIZ + "/");
const { createClient } = exigir("@supabase/supabase-js");
const ExcelJS = exigir("exceljs");

for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) {
    process.env[l.slice(0, i)] = l.slice(i + 1).trim();
  }
}

const [arquivo, operacaoId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const gravar = process.argv.includes("--gravar");
if (!arquivo || !operacaoId) {
  console.error("uso: base-mlb-da-planilha.mjs <planilha.xlsx> <operacao_id> [--gravar]");
  process.exit(1);
}

const COMISSAO = { classico: 0.115, premium: 0.165 };
const TIPO = { "clássico": "classico", classico: "classico", premium: "premium" };

/* ── A planilha ── */

const texto = (v) => {
  if (v == null) return "";
  if (typeof v === "object") return String(v.text ?? v.result ?? "");
  return String(v);
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(arquivo);
const ws = wb.getWorksheet("Anúncios");
if (!ws) throw new Error('a planilha não tem a aba "Anúncios"');

/* Cabeçalho na linha 1 (códigos em inglês, estáveis entre exportações). */
const col = {};
ws.getRow(1).eachCell((c, n) => (col[texto(c.value).trim()] = n));
for (const k of ["ITEM_ID", "SKU", "TITLE", "LISTING_TYPE", "STATUS"]) {
  if (!col[k]) throw new Error(`coluna ${k} não encontrada — o formato da exportação mudou?`);
}

/*
 * Linhas 2 a 5 são rótulos e "Obrigatório". O dado começa onde ITEM_ID tem
 * cara de MLB — mais seguro que cravar a linha 6.
 *
 * Anúncio com variação ocupa uma linha por variação, todas com o mesmo
 * ITEM_ID: a base é por anúncio, então fica uma só.
 */
const daPlanilha = new Map();
const skuConflito = new Set();
ws.eachRow((row, r) => {
  const mlb = texto(row.getCell(col.ITEM_ID).value).trim().toUpperCase();
  if (!/^MLB\d+$/.test(mlb)) return;
  const sku = texto(row.getCell(col.SKU).value).trim().toUpperCase() || null;
  const tipo = TIPO[texto(row.getCell(col.LISTING_TYPE).value).trim().toLowerCase()] ?? null;
  const status = texto(row.getCell(col.STATUS).value).trim();
  const titulo = texto(row.getCell(col.TITLE).value).trim();
  const ja = daPlanilha.get(mlb);
  if (ja) {
    if (sku && ja.sku && sku !== ja.sku) skuConflito.add(mlb);
    if (!ja.sku && sku) ja.sku = sku;
    return;
  }
  daPlanilha.set(mlb, { mlb, sku, tipo, status, titulo, linha: r });
});

/* ── O banco ── */

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function todas(tabela, colunas, filtro) {
  const saida = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    saida.push(...data);
    if (data.length < 1000) break;
  }
  return saida;
}

const { data: op, error: eOp } = await sb
  .from("operacoes")
  .select("nome,organizacoes(nome)")
  .eq("id", operacaoId)
  .maybeSingle();
if (eOp || !op) throw new Error("operação não encontrada: " + operacaoId);

const { data: vig } = await sb
  .from("formula_base_itens")
  .select("vigente_de")
  .eq("operacao_id", operacaoId)
  .order("vigente_de", { ascending: false })
  .limit(1);
const vigente = vig?.[0]?.vigente_de;
if (!vigente) throw new Error("esta operação não tem Base MLB — importe a Fórmula base primeiro");

const [itens, precos] = await Promise.all([
  todas("formula_base_itens", "mlb,sku,tipo_anuncio,comissao_padrao", (q) =>
    q.eq("operacao_id", operacaoId).eq("vigente_de", vigente)
  ),
  todas("formula_base_precos", "chave_tipo,chave", (q) =>
    q.eq("operacao_id", operacaoId).eq("vigente_de", vigente)
  ),
]);

const naBase = new Map(itens.map((i) => [String(i.mlb).toUpperCase(), i]));
const comPreco = new Set(precos.map((p) => `${p.chave_tipo}:${String(p.chave).toUpperCase()}`));
const temPreco = (a) => (a.sku && comPreco.has("sku:" + a.sku)) || comPreco.has("mlb:" + a.mlb);

/* ── A comparação ── */

const todos = [...daPlanilha.values()];
const faltam = todos.filter((a) => !naBase.has(a.mlb));
const aIncluir = faltam.filter((a) => a.tipo);
const semTipo = faltam.filter((a) => !a.tipo);
const tipoDiverge = todos.filter((a) => {
  const b = naBase.get(a.mlb);
  return b && a.tipo && b.tipo_anuncio !== a.tipo;
});
const premiumBarato = itens.filter(
  (i) => i.tipo_anuncio === "premium" && Number(i.comissao_padrao) < COMISSAO.premium
);
const semPreco = todos.filter((a) => a.tipo && !temPreco(a));

const contar = (xs, f) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});

console.log(`operação:  ${op.organizacoes?.nome} / ${op.nome}`);
console.log(`base:      vigência ${vigente}, ${naBase.size} MLBs`);
console.log(`planilha:  ${todos.length} anúncios  ${JSON.stringify(contar(todos, (a) => a.status || "?"))}`);
console.log("");
console.log(`já na base:            ${todos.length - faltam.length}`);
console.log(`faltam na base:        ${faltam.length}  ${JSON.stringify(contar(faltam, (a) => a.status || "?"))}`);
console.log(`  a incluir:           ${aIncluir.length}  ${JSON.stringify(contar(aIncluir, (a) => a.tipo))}`);
if (semTipo.length) console.log(`  sem tipo na planilha (fica de fora): ${semTipo.length}`);

const amostra = (titulo, xs, f) => {
  if (!xs.length) return;
  console.log(`\n${titulo} (${xs.length})`);
  for (const x of xs.slice(0, 12)) console.log("  " + f(x));
  if (xs.length > 12) console.log(`  … e mais ${xs.length - 12}`);
};

amostra("amostra do que entra", aIncluir, (a) =>
  `${a.mlb.padEnd(14)} ${String(a.sku ?? "sem SKU").padEnd(10)} ${a.tipo.padEnd(8)} ${a.status.padEnd(7)} ${a.titulo.slice(0, 40)}`
);
amostra("⚠ tipo na planilha ≠ tipo na base (NÃO corrigido)", tipoDiverge, (a) =>
  `${a.mlb.padEnd(14)} planilha ${a.tipo.padEnd(8)} base ${naBase.get(a.mlb).tipo_anuncio}`
);
amostra("⚠ premium na base com comissão abaixo de 16,5% (NÃO corrigido)", premiumBarato, (i) =>
  `${String(i.mlb).padEnd(14)} ${String(i.sku ?? "").padEnd(10)} ${(Number(i.comissao_padrao) * 100).toFixed(1)}%`
);
amostra("⚠ sem preço de tabela — promoção segue recusada mesmo na base", semPreco, (a) =>
  `${a.mlb.padEnd(14)} ${String(a.sku ?? "sem SKU").padEnd(10)} ${a.status.padEnd(7)} ${a.titulo.slice(0, 40)}`
);
amostra("⚠ variações do mesmo anúncio com SKUs diferentes (ficou o primeiro)", [...skuConflito], (m) => m);

if (!aIncluir.length) {
  console.log("\nNada a incluir.");
  process.exit(0);
}
if (!gravar) {
  console.log(`\n(ensaio — rode com --gravar para incluir os ${aIncluir.length})`);
  process.exit(0);
}

const linhas = aIncluir.map((a) => ({
  operacao_id: operacaoId,
  vigente_de: vigente,
  mlb: a.mlb,
  sku: a.sku,
  tipo_anuncio: a.tipo,
  comissao_padrao: COMISSAO[a.tipo],
}));

for (let i = 0; i < linhas.length; i += 500) {
  const { error } = await sb
    .from("formula_base_itens")
    .upsert(linhas.slice(i, i + 500), { onConflict: "operacao_id,mlb,vigente_de", ignoreDuplicates: true });
  if (error) throw new Error(`falha ao gravar: ${error.message}`);
}

const { count } = await sb
  .from("formula_base_itens")
  .select("id", { count: "exact", head: true })
  .eq("operacao_id", operacaoId)
  .eq("vigente_de", vigente);
console.log(`\n✓ ${linhas.length} incluídos. A base de ${vigente} agora tem ${count} MLBs (antes ${naBase.size}).`);
