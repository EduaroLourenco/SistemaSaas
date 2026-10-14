/**
 * Custo e frete por SKU da Bom de Compras, da aba "Preço Mínimo".
 *
 * A aba tem quatro colunas que interessam: Código, Produto, Custo e Frete.
 * O custo vai para `produtos.custo_unitario` e o frete para
 * `produtos.frete_unitario` — que é ESTIMATIVA de propósito: perde do frete
 * médio praticado nas vendas reais e ganha da faixa de peso (db/35). É o que
 * o cliente pediu: usar a estimativa só enquanto não há venda para medir.
 *
 * SKU da planilha que ainda não existe no cadastro é CRIADO com o custo já
 * preenchido. O cadastro nasce da venda (`abastecerProdutos`), então produto
 * que nunca vendeu não está lá — e, sem isto, a primeira venda dele sairia
 * com custo zero e margem errada justamente no dia em que ninguém olha.
 * `--sem-criar` deixa de fora.
 *
 * Uso: node scripts/importar-custos-bdc.mjs <planilha.xlsx> [--aplicar] [--sem-criar]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const OPERACAO = "01b057f3-4541-4423-ada4-288cfbbc6dd7"; // Bom de Compras
const ABA = "Preço Mínimo";

const raiz = fileURLToPath(new URL("../", import.meta.url));
for (const linha of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.startsWith("#") && !process.env[linha.slice(0, i)]) {
    process.env[linha.slice(0, i)] = linha.slice(i + 1).trim();
  }
}

const ARQUIVO = process.argv[2];
const APLICAR = process.argv.includes("--aplicar");
const CRIAR = !process.argv.includes("--sem-criar");
if (!ARQUIVO) throw new Error("Informe o caminho da planilha.");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* O código vem com TAB no fim em metade das linhas ("GP502\t"): sem limpar,
   nenhum casa com o cadastro. */
const texto = (v) => {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text) return v.text;
    if (v.result != null) return String(v.result);
    return "";
  }
  return String(v);
};
const limpar = (v) => texto(v).replace(/\s+/g, " ").trim();

/* Célula vazia é diferente de zero: zero é "o vendedor não paga frete neste
   produto" e vale gravar; vazia é "não sei" e tem de ficar fora. */
const numero = (v) => {
  if (v == null || v === "") return null;
  const bruto = typeof v === "object" ? (v.result ?? v.text ?? null) : v;
  if (bruto == null || bruto === "") return null;
  const n = typeof bruto === "number" ? bruto : Number(String(bruto).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);
const ws = wb.getWorksheet(ABA);
if (!ws) throw new Error(`A planilha não tem a aba "${ABA}".`);

const cabecalho = [1, 2, 3, 4].map((c) => limpar(ws.getRow(1).getCell(c).value).toLowerCase());
const esperado = ["código", "produto", "custo", "frete"];
if (cabecalho.join("|") !== esperado.join("|")) {
  throw new Error(`Colunas inesperadas na aba: ${cabecalho.join(", ")}. Esperava ${esperado.join(", ")}.`);
}

const linhas = [];
const repetidos = new Map();
for (let r = 2; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const sku = limpar(row.getCell(1).value);
  if (!sku) continue;
  const item = {
    linha: r,
    sku,
    titulo: limpar(row.getCell(2).value),
    custo: numero(row.getCell(3).value),
    frete: numero(row.getCell(4).value),
  };
  const antes = linhas.find((l) => l.sku.toLowerCase() === sku.toLowerCase());
  if (antes) {
    repetidos.set(sku, [antes, item]);
    continue;
  }
  linhas.push(item);
}

const { data: produtos, error } = await sb
  .from("produtos")
  .select("id,sku,titulo,custo_unitario,frete_unitario")
  .eq("operacao_id", OPERACAO);
if (error) throw new Error(error.message);
const porSku = new Map(produtos.map((p) => [String(p.sku).toLowerCase(), p]));

const gravar = [];
const semCadastro = [];
const semCusto = [];
const iguais = [];
for (const l of linhas) {
  if (l.custo == null) {
    semCusto.push(l);
    continue;
  }
  const p = porSku.get(l.sku.toLowerCase());
  if (!p) {
    semCadastro.push(l);
    continue;
  }
  /* O banco guarda duas casas; a planilha traz três (176,904). Arredonda
     aqui para o "já está igual" não acusar diferença que não existe. */
  const custo = Math.round(l.custo * 100) / 100;
  const frete = l.frete == null ? null : Math.round(l.frete * 100) / 100;
  const atualCusto = p.custo_unitario == null ? null : Number(p.custo_unitario);
  const atualFrete = p.frete_unitario == null ? null : Number(p.frete_unitario);
  if (atualCusto === custo && atualFrete === frete) {
    iguais.push(l);
    continue;
  }
  gravar.push({ id: p.id, sku: p.sku, titulo: p.titulo, custo, frete, atualCusto, atualFrete });
}

const reais = (n) => (n == null ? "—" : "R$ " + n.toFixed(2));
console.log(`aba "${ABA}": ${linhas.length} SKUs`);
console.log(`cadastrados na Bom de Compras: ${produtos.length} produtos`);
console.log(`a gravar: ${gravar.length} · já iguais: ${iguais.length}`);
console.log(`frete zero (vendedor não paga): ${gravar.filter((g) => g.frete === 0).length}`);
console.log(`frete em branco (fica sem estimativa, cai na faixa de peso): ${gravar.filter((g) => g.frete == null).length}`);
if (repetidos.size) {
  console.log(`\nSKU repetido na planilha — usei a primeira linha: ${[...repetidos.keys()].join(", ")}`);
}
if (semCusto.length) {
  console.log(`\nsem custo na planilha, deixei como está: ${semCusto.map((l) => l.sku).join(", ")}`);
}
if (semCadastro.length) {
  console.log(
    `\nainda não vendidos, fora do cadastro (${semCadastro.length}) — ${CRIAR ? "vou criar com o custo" : "deixados de fora"}:`
  );
  for (const l of semCadastro) console.log(`  ${l.sku.padEnd(14)} ${l.titulo.slice(0, 40)}`);
}
console.log("\namostra do que vai gravar:");
for (const g of gravar.slice(0, 12)) {
  console.log(
    `  ${String(g.sku).padEnd(14)} custo ${reais(g.atualCusto)} → ${reais(g.custo)}   frete ${reais(g.atualFrete)} → ${reais(g.frete)}`
  );
}

if (!APLICAR) {
  console.log("\nensaio. rode com --aplicar para gravar.");
  process.exit(0);
}

let feitos = 0;
for (const g of gravar) {
  const { error: e } = await sb
    .from("produtos")
    .update({ custo_unitario: g.custo, frete_unitario: g.frete, atualizado_em: new Date().toISOString() })
    .eq("id", g.id);
  if (e) throw new Error(`Falha em ${g.sku}: ${e.message}`);
  feitos++;
}
console.log(`\natualizados: ${feitos}`);

if (CRIAR && semCadastro.length) {
  const novos = semCadastro.map((l) => ({
    operacao_id: OPERACAO,
    sku: l.sku,
    titulo: l.titulo || l.sku,
    custo_unitario: Math.round(l.custo * 100) / 100,
    frete_unitario: l.frete == null ? null : Math.round(l.frete * 100) / 100,
  }));
  const { error: e } = await sb.from("produtos").insert(novos);
  if (e) throw new Error(`Falha ao criar produtos: ${e.message}`);
  console.log(`criados: ${novos.length}`);
}

const contar = (f) => f.eq("operacao_id", OPERACAO);
const { count: comCusto } = await contar(
  sb.from("produtos").select("*", { count: "exact", head: true })
).not("custo_unitario", "is", null);
const { count: total } = await contar(sb.from("produtos").select("*", { count: "exact", head: true }));
console.log(`produtos com custo na Bom de Compras: ${comCusto} de ${total}`);
