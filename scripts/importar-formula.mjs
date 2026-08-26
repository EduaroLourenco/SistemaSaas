/**
 * Importa a Fórmula base.
 *
 *   node scripts/importar-formula.mjs "<Formula_Base.xlsx>" [data-base]
 *
 * Grava duas coisas: o cadastro por anúncio (tipo e comissão padrão) e a
 * matriz de preços por comissão. As duas ficam versionadas por
 * `vigente_de` — a base muda ao longo do ano, e um relatório antigo tem
 * que continuar batendo com a base que valia na época.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { lerFormulaBase } from "./lib/formula-base.mjs";

const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_KEY;
const OPERACAO = "00000000-0000-0000-0000-000000000101";
if (!URL_BASE || !CHAVE) { console.error("faltam SUPABASE_URL/SUPABASE_KEY"); process.exit(1); }

const cab = { apikey: CHAVE, authorization: `Bearer ${CHAVE}`, "content-type": "application/json" };
async function api(caminho, opc = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1${caminho}`, { ...opc, headers: { ...cab, ...(opc.headers ?? {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} em ${caminho}: ${txt.slice(0, 250)}`);
  return txt ? JSON.parse(txt) : null;
}
async function enviar(tabela, linhas, conflito, tamanho = 500) {
  let n = 0;
  for (let i = 0; i < linhas.length; i += tamanho) {
    const lote = linhas.slice(i, i + tamanho);
    await api(`/${tabela}?on_conflict=${conflito}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(lote),
    });
    n += lote.length;
    process.stdout.write(`\r  ${tabela}: ${n}/${linhas.length}`);
  }
  process.stdout.write("\n");
}

const caminho = process.argv[2];
const vigente = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const bytes = readFileSync(caminho);
const r = await lerFormulaBase(bytes);

console.log(`\n=== Fórmula base: ${basename(caminho)} ===`);
console.log(`  ${r.baseMlb.size} anúncios, ${r.precosSKU.size} SKUs, ${r.precosMLB.size} MLBs com preço`);
console.log(`  vigente a partir de ${vigente}`);

const [reg] = await api("/importacoes", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    operacao_id: OPERACAO, tipo: "preco_ideal", nome_arquivo: basename(caminho),
    hash_arquivo: createHash("sha256").update(bytes).digest("hex"),
    periodo_inicio: vigente, periodo_fim: vigente, data_base: vigente,
    linhas_lidas: r.baseMlb.size, linhas_validas: r.baseMlb.size, status: "concluida",
  }),
});

const itens = [];
for (const [mlb, v] of r.baseMlb) {
  const padrao = Number(v.padrao);
  // A tabela exige fração entre 0 e 1. Linha fora disso é erro de origem,
  // e entrar com valor "corrigido" esconderia o problema.
  if (!(padrao > 0 && padrao < 1)) continue;
  itens.push({
    operacao_id: OPERACAO,
    vigente_de: vigente,
    mlb,
    tipo_anuncio: /premium/i.test(v.tipo ?? "") ? "premium" : "classico",
    comissao_padrao: padrao,
    importacao_id: reg.id,
  });
}
console.log(`  itens válidos: ${itens.length} de ${r.baseMlb.size}`);
await enviar("formula_base_itens", itens, "operacao_id,mlb,vigente_de");

const precos = [];
const juntar = (mapa, tipo) => {
  for (const [chave, porComissao] of mapa) {
    const entradas = porComissao instanceof Map ? porComissao : new Map(Object.entries(porComissao ?? {}));
    for (const [com, preco] of entradas) {
      const c = Number(com), p = Number(preco);
      if (!(c > 0 && c < 1) || !Number.isFinite(p) || p < 0) continue;
      precos.push({
        operacao_id: OPERACAO, vigente_de: vigente,
        chave_tipo: tipo, chave, comissao: c, preco: +p.toFixed(2),
        importacao_id: reg.id,
      });
    }
  }
};
juntar(r.precosSKU, "sku");
juntar(r.precosMLB, "mlb");
console.log(`  linhas de preço: ${precos.length}`);
await enviar("formula_base_precos", precos, "operacao_id,chave_tipo,chave,comissao,vigente_de");
console.log("\nconcluído");
