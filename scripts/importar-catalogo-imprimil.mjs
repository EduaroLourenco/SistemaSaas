/**
 * Põe no sistema o catálogo que o Eduardo exportou do Mercado Livre.
 *
 * É o mesmo caminho da tela Importar — o leitor `lerCatalogo`, o mesmo
 * upsert em `anuncios` pela chave (canal, código) e o mesmo registro em
 * `importacoes` — só que sem ele ter que subir o arquivo de novo. Ele já
 * mandou; pedir que repita a mão é trabalho que o script faz.
 *
 * Por que importa: `formula_base_itens` é montada a partir da tabela
 * `anuncios`. Anúncio que o sistema não conhece não ganha linha de tipo, e
 * sem ela o motor de promoções recusa com "MLB não está na aba Base MLB".
 * Então esta carga vem ANTES de `carregar-preco-minimo-imprimil.mjs`.
 *
 * O arquivo é o export "Modifique seus anúncios", que traz o que falta nos
 * outros relatórios: tipo do anúncio, preço da vitrine e estado.
 *
 * Uso: node scripts/importar-catalogo-imprimil.mjs <arquivo.xlsx> [--aplicar]
 */
import { createHash } from "node:crypto";
import { readFileSync as ler } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { lerCatalogo } from "./lib/catalogo.mjs";

const OPERACAO = "123c2f3c-c4ed-48ba-b4c4-753d78265946"; // Imprimil
const CONTA_CANAL = "2d4607c0-54a1-4b38-9d89-b36c1c54717b"; // Mercado Livre
const APLICAR = process.argv.includes("--aplicar");
const ARQUIVO = process.argv.slice(2).find((a) => a.endsWith(".xlsx"));
if (!ARQUIVO) throw new Error("Passe o caminho do .xlsx exportado do canal.");

const raiz = fileURLToPath(new URL("../", import.meta.url));
for (const linha of ler(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.startsWith("#") && !process.env[linha.slice(0, i)]) {
    process.env[linha.slice(0, i)] = linha.slice(i + 1).trim();
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const buffer = ler(ARQUIVO);
const { itens, linhasLidas, semCodigo } = await lerCatalogo(buffer);
console.log(`${path.basename(ARQUIVO)}: ${linhasLidas} linhas lidas, ${itens.length} anúncios, ${semCodigo} sem código\n`);

/* O canal da conta, para a chave do upsert ser a mesma da tela. */
const { data: conta, error: ec } = await sb
  .from("contas_canal")
  .select("canal_id,nome")
  .eq("id", CONTA_CANAL)
  .single();
if (ec || !conta) throw new Error(`Conta de canal não encontrada: ${ec?.message}`);

const { data: existentes } = await sb
  .from("anuncios")
  .select("codigo_externo,tipo,status,preco_atual")
  .eq("operacao_id", OPERACAO);
const antes = new Map((existentes ?? []).map((a) => [a.codigo_externo, a]));

const novos = itens.filter((i) => !antes.has(i.mlb));
const mudaram = itens.filter((i) => {
  const a = antes.get(i.mlb);
  return a && (a.tipo !== i.tipo || a.status !== i.status || Number(a.preco_atual) !== Number(i.preco));
});
console.log(`novos:      ${novos.length}`);
console.log(`mudaram:    ${mudaram.length}`);
console.log(`sem mudar:  ${itens.length - novos.length - mudaram.length}`);
const porTipo = new Map();
for (const i of itens) porTipo.set(i.tipo, (porTipo.get(i.tipo) ?? 0) + 1);
console.log(`tipos:      ${[...porTipo].map(([k, n]) => `${k}=${n}`).join(", ")}`);

if (novos.length) {
  console.log("\nos novos:");
  for (const i of novos) console.log(`  ${i.mlb} ${String(i.sku ?? "").padEnd(18)} ${i.tipo.padEnd(9)} ${String(i.preco ?? "—").padStart(7)}  ${i.titulo.slice(0, 44)}`);
}
if (mudaram.length) {
  console.log("\nos que mudaram:");
  for (const i of mudaram) {
    const a = antes.get(i.mlb);
    const d = [];
    if (a.tipo !== i.tipo) d.push(`tipo ${a.tipo}→${i.tipo}`);
    if (a.status !== i.status) d.push(`estado ${a.status}→${i.status}`);
    if (Number(a.preco_atual) !== Number(i.preco)) d.push(`preço ${a.preco_atual}→${i.preco}`);
    console.log(`  ${i.mlb} ${d.join(" · ")}`);
  }
}

if (!APLICAR) {
  console.log("\nENSAIO — nada foi gravado. Rode com --aplicar.");
  process.exit(0);
}

const hash = createHash("sha256").update(buffer).digest("hex");
const { data: imp, error: ei } = await sb
  .from("importacoes")
  .insert({
    operacao_id: OPERACAO,
    tipo: "catalogo",
    nome_arquivo: path.basename(ARQUIVO),
    hash_arquivo: hash,
    periodo_inicio: null,
    periodo_fim: null,
    linhas_lidas: linhasLidas,
    linhas_validas: itens.length,
    status: "concluida",
  })
  .select("id")
  .single();
if (ei) throw new Error(`Não registrou a importação: ${ei.message}`);

const linhas = itens.map((i) => ({
  operacao_id: OPERACAO,
  canal_id: conta.canal_id,
  conta_canal_id: CONTA_CANAL,
  codigo_externo: i.mlb,
  titulo: i.titulo || i.mlb,
  sku_canal: i.sku || null,
  tipo: i.tipo,
  status: i.status,
  preco_atual: i.preco,
  comissao_atual: i.tarifa,
  sincronizado_em: new Date().toISOString(),
}));
for (let i = 0; i < linhas.length; i += 400) {
  const { error } = await sb
    .from("anuncios")
    .upsert(linhas.slice(i, i + 400), { onConflict: "canal_id,codigo_externo" });
  if (error) throw new Error(`Falha ao gravar anúncios: ${error.message}`);
}
console.log(`\ngravado · importação ${imp.id} · ${linhas.length} anúncios na conta "${conta.nome}"`);
