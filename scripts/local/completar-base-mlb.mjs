/**
 * Completa a Base MLB com o tipo que a API já sabe.
 *
 * O motor de promoções, na campanha SEM redução de tarifa, precisa saber se
 * o anúncio é clássico ou premium — são cinco pontos de comissão, e sem
 * isso ele devolve "anúncio sem tipo cadastrado" e recusa a linha. O que
 * aparece na tela é "Não participar", como se a margem não desse; a causa
 * real é cadastro faltando.
 *
 * A planilha de preços traz os anúncios que existiam quando ela foi feita.
 * Anúncio criado depois fica de fora até a próxima planilha — e enquanto
 * isso toda promoção dele é recusada. Este script preenche a lacuna com o
 * tipo que a sincronização já trouxe do canal.
 *
 * A comissão é a PADRÃO do tipo (11,5% clássico, 16,5% premium). Onde a
 * planilha trouxer uma taxa negociada diferente, ela manda: este script
 * nunca sobrescreve linha existente, só cria o que falta.
 *
 * Uso:
 *   node scripts/local/completar-base-mlb.mjs          (mostra, não grava)
 *   node scripts/local/completar-base-mlb.mjs --gravar
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const { createClient } = createRequire(RAIZ + "/")("@supabase/supabase-js");

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

/** A comissão cheia de cada tipo no Mercado Livre. */
const COMISSAO = { classico: 0.115, premium: 0.165 };

const gravar = process.argv.includes("--gravar");

/* PostgREST entrega no máximo 1000 linhas por chamada. */
async function todas(tabela, colunas, filtro = (q) => q) {
  const saida = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    saida.push(...data);
    if (data.length < 1000) break;
  }
  return saida;
}

/* A vigência mais recente é a que o motor carrega. */
const { data: vig, error: eVig } = await sb
  .from("formula_base_itens")
  .select("vigente_de,operacao_id")
  .order("vigente_de", { ascending: false })
  .limit(1);
if (eVig) throw new Error(eVig.message);

const vigente = vig?.[0]?.vigente_de;
const operacaoId = vig?.[0]?.operacao_id;
if (!vigente) {
  console.log("Nenhuma vigência em formula_base_itens — importe a tabela de preços primeiro.");
  process.exit(1);
}
console.log(`vigência: ${vigente}`);

const [itens, anuncios] = await Promise.all([
  todas("formula_base_itens", "mlb", (q) => q.eq("vigente_de", vigente)),
  todas("anuncios", "codigo_externo,sku_canal,tipo,status,titulo"),
]);

const cadastrados = new Set(itens.map((i) => String(i.mlb).toUpperCase()));

/*
 * Só anúncios de tipo conhecido. `outro` existe no enum e não diz nada
 * sobre comissão — inventar 11,5% ali produziria preço de tabela errado,
 * que é pior que a recusa honesta de hoje.
 */
const faltando = anuncios.filter((a) => {
  const mlb = String(a.codigo_externo ?? "").toUpperCase();
  return mlb && !cadastrados.has(mlb) && (a.tipo === "classico" || a.tipo === "premium");
});

const semTipo = anuncios.filter((a) => {
  const mlb = String(a.codigo_externo ?? "").toUpperCase();
  return mlb && !cadastrados.has(mlb) && a.tipo !== "classico" && a.tipo !== "premium";
});

console.log(`anúncios sincronizados: ${anuncios.length}`);
console.log(`já na Base MLB:         ${cadastrados.size}`);
console.log(`a incluir:              ${faltando.length}`);
console.log(
  `  clássico: ${faltando.filter((a) => a.tipo === "classico").length}` +
    ` | premium: ${faltando.filter((a) => a.tipo === "premium").length}`
);
if (semTipo.length) {
  console.log(
    `sem tipo nem na API (fica de fora): ${semTipo.length} — ` +
      JSON.stringify(semTipo.reduce((m, a) => ((m[a.tipo ?? "nulo"] = (m[a.tipo ?? "nulo"] ?? 0) + 1), m), {}))
  );
}

if (!faltando.length) {
  console.log("\nNada a fazer.");
  process.exit(0);
}

console.log("\namostra do que entra:");
for (const a of faltando.slice(0, 8)) {
  console.log(
    `  ${a.codigo_externo}  ${String(a.sku_canal ?? "?").padEnd(10)} ` +
      `${a.tipo.padEnd(8)} ${(COMISSAO[a.tipo] * 100).toFixed(1)}%  ${String(a.titulo ?? "").slice(0, 38)}`
  );
}

if (!gravar) {
  console.log(`\n(ensaio — rode com --gravar para incluir os ${faltando.length})`);
  process.exit(0);
}

const linhas = faltando.map((a) => ({
  operacao_id: operacaoId,
  vigente_de: vigente,
  mlb: String(a.codigo_externo).toUpperCase(),
  sku: a.sku_canal ? String(a.sku_canal).toUpperCase() : null,
  tipo_anuncio: a.tipo,
  comissao_padrao: COMISSAO[a.tipo],
}));

let gravadas = 0;
for (let i = 0; i < linhas.length; i += 500) {
  const lote = linhas.slice(i, i + 500);
  /*
   * `ignoreDuplicates` em vez de merge: se a linha já existe, a taxa dela
   * veio da planilha e pode ser negociada — sobrescrever com a padrão
   * apagaria a negociação sem ninguém notar.
   */
  const { error } = await sb
    .from("formula_base_itens")
    .upsert(lote, { onConflict: "operacao_id,mlb,vigente_de", ignoreDuplicates: true });
  if (error) throw new Error(`falha ao gravar: ${error.message}`);
  gravadas += lote.length;
}

console.log(`\n✓ ${gravadas} anúncios incluídos na Base MLB de ${vigente}.`);
