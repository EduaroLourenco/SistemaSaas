/**
 * A tabela de preços da Bom de Compras vira Fórmula base no sistema.
 *
 *   node scripts/importar-base-bdc.mjs [--gravar] [--custos]
 *
 * Sem `--gravar` só mostra o que faria.
 *
 * ── O que a planilha é, e o que ela não é ──
 *
 * "base price bom de compras.xlsx", aba "Preços dos Anúncios", NÃO traz
 * preço mínimo. Ela traz um preço que alguém DIGITOU (coluna M) e diz se
 * ele passa de 7% de lucro líquido — a coluna Status, que é
 * `IF(%lucro>=7%, "Bora Vender", "Reprovado Ajustar Preço")`. Metade das
 * linhas está reprovada, ou seja: o preço que está lá é o que se cobra
 * hoje, não o menor que se pode cobrar.
 *
 * O motor de promoção precisa do contrário — o PISO. Então aqui a fórmula
 * da planilha é invertida: acha-se o preço em que o lucro dá exatamente os
 * 7% que ela própria exige para aprovar.
 *
 *   lucro  = M − (custo + embalagem + frete? + extra? + 0,056·M + 0,13·M + comissão·M)
 *   piso   = (custo + embalagem + frete? + extra?) ÷ (1 − 0,056 − 0,13 − comissão − 0,07)
 *
 * Os dois "?" são degraus, não constantes, e é por isso que o piso não sai
 * de uma divisão só:
 *   · frete  — o vendedor paga só quando o preço fica em R$ 79 ou mais
 *              (`IF(M>=79; E; 0)`: acima disso o frete é grátis para o
 *              comprador e sai do bolso da loja);
 *   · extra  — R$ 6,75 fixos quando o preço fica em R$ 79 ou menos.
 * Como os dois dependem do próprio preço que se quer achar, o script
 * resolve os dois ramos e fica com o que é coerente com a sua condição.
 *
 * ── Por que o mesmo piso em todas as faixas de comissão ──
 *
 * A planilha tem UMA comissão (12,5%). A decisão foi não inventar as
 * outras faixas: o piso é gravado igual em toda a escada de comissão, de
 * 4,5% a 20,5%. Consequência, de propósito: campanha com tarifa reduzida
 * não ganha desconto nenhum no piso — o preço mínimo é o mesmo. Quando os
 * custos estiverem cadastrados em Financeiro › Custos, a regra de margem
 * passa a calcular faixa por faixa e isto aqui pode ser refeito.
 *
 * Sem a repetição o motor simplesmente não acharia preço: ele busca
 * `row[comissão]`, e uma planilha de campanha com SALE_FEE de 9,5% cairia
 * num `undefined` e recusaria todos os itens em silêncio.
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const req = createRequire("C:/Users/dudu4/OneDrive/Desktop/plataforma/");
const { createClient } = req("@supabase/supabase-js");
const ExcelJS = req("exceljs");

const ARQUIVO = "C:/Users/dudu4/Downloads/Sistema Saas E commerce/base price bom de compras.xlsx";
const ABA = "Preços dos Anúncios";
const OPERACAO = "01b057f3-4541-4423-ada4-288cfbbc6dd7"; // Bom de Compras
const VIGENTE_DE = new Date().toISOString().slice(0, 10);

/* As taxas que a própria planilha aplica, lidas das fórmulas dela. */
const MARGEM_CONTRIB = 0.056; // H = M×0,056
const IMPOSTO = 0.13; //         I = M×0,13
const LUCRO_MINIMO = 0.07; //    Status aprova a partir de 7%
const CORTE_FRETE = 79; //       IF(M>=79; frete; 0) e IF(M<=79; 6,75; 0)
const EXTRA = 6.75;

/** A escada de comissão do Meli, a mesma da base da Probel. */
const FAIXAS = Array.from({ length: 33 }, (_, i) => Math.round((0.045 + i * 0.005) * 1000) / 1000);

const gravar = process.argv.includes("--gravar");
const comCustos = process.argv.includes("--custos");

for (const l of fs.readFileSync("C:/Users/dudu4/OneDrive/Desktop/plataforma/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
async function todos(q) {
  let o = [], i = 0;
  for (;;) { const { data, error } = await q().range(i, i + 999); if (error) throw error; o.push(...data); if (data.length < 1000) break; i += 1000; }
  return o;
}
const nrm = (s) => String(s ?? "").trim().toUpperCase();
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * O menor preço que ainda deixa 7% de lucro líquido.
 *
 * Devolve também o ramo escolhido, porque é o que explica um piso que
 * parece alto: abaixo de R$ 79 entra o custo extra de R$ 6,75, e num
 * produto de R$ 20 de custo isso é um terço do preço.
 */
function piso({ custo, emb, frete, comissao }) {
  const k = 1 - MARGEM_CONTRIB - IMPOSTO - comissao - LUCRO_MINIMO;
  if (k <= 0) return null;
  const fixoBaixo = custo + emb + EXTRA; // ≤ 79: paga o extra, não paga frete
  const fixoAlto = custo + emb + frete; //  ≥ 79: paga o frete, não paga extra
  const baixo = fixoBaixo / k;
  const alto = fixoAlto / k;
  if (baixo <= CORTE_FRETE) return { preco: r2(baixo), ramo: "até R$ 79 (custo extra de R$ 6,75)" };
  if (alto >= CORTE_FRETE) return { preco: r2(alto), ramo: "R$ 79 ou mais (frete por conta da loja)" };
  /* Nenhum ramo fecha: o piso cai exatamente no degrau. Em R$ 79 o frete
     já é da loja, então é esse o menor preço que se sustenta. */
  return { preco: CORTE_FRETE, ramo: "no degrau dos R$ 79" };
}

/* ── 1. Ler a planilha ── */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);
const ws = wb.getWorksheet(ABA);
if (!ws) throw new Error(`A aba "${ABA}" não existe neste arquivo.`);

const linhas = [];
for (let r = 2; r <= ws.rowCount; r++) {
  const cel = (n) => { const c = ws.getRow(r).getCell(n); const v = c.result ?? c.value; return v && typeof v === "object" ? null : v; };
  const cod = String(cel(1) ?? "").trim();
  if (!cod) continue;
  const custo = Number(cel(3)) || 0;
  const linha = {
    cod,
    produto: String(cel(2) ?? "").trim(),
    custo,
    emb: Number(cel(4)) || 0,
    frete: Number(cel(5)) || 0,
    comissao: Number(cel(10)) || 0,
    precoHoje: Number(cel(13)) || 0,
    /* O veredito da planilha sobre o preço que está lá. É com ele que a
       inversão é conferida: se o piso estivesse errado, "Bora Vender" e
       "abaixo do piso" apareceriam na mesma linha. */
    status: String(cel(17) ?? "").trim(),
  };
  if (!custo || !linha.comissao) { linha.pulada = !custo ? "sem custo de produto" : "sem comissão"; }
  else linha.piso = piso(linha);
  linhas.push(linha);
}

/* ── 2. Casar com os anúncios da empresa ── */
const anuncios = await todos(() =>
  sb.from("anuncios").select("codigo_externo,sku_canal,tipo,status,titulo").eq("operacao_id", OPERACAO).order("id")
);
const porSku = new Map();
for (const a of anuncios) {
  if (!a.sku_canal) continue;
  const k = nrm(a.sku_canal);
  if (!porSku.has(k)) porSku.set(k, []);
  porSku.get(k).push(a);
}

console.log(`Planilha: ${linhas.length} códigos · ${linhas.filter((l) => l.piso).length} com piso calculado`);
console.log(`Anúncios da Bom de Compras: ${anuncios.length} (${porSku.size} SKUs distintos)\n`);
console.log("CÓDIGO".padEnd(14) + "CUSTO".padStart(9) + "FRETE".padStart(8) + "HOJE".padStart(10) + "PISO".padStart(10) + "  ANÚNCIOS  RAMO");
for (const l of linhas) {
  const ans = porSku.get(nrm(l.cod)) ?? [];
  const marca = !l.piso ? `— ${l.pulada}` : l.precoHoje && l.precoHoje < l.piso.preco ? "abaixo do piso" : "ok";
  console.log(
    l.cod.padEnd(14) +
      String(l.custo || "—").padStart(9) +
      String(l.frete || "—").padStart(8) +
      String(l.precoHoje || "—").padStart(10) +
      String(l.piso?.preco ?? "—").padStart(10) +
      `  ${String(ans.length).padStart(3)}      ${l.piso?.ramo ?? ""} ${marca}`
  );
}

/* ── Conferência: o piso contra o Status da planilha ──
   A planilha aprova a partir de 7% de lucro. Então, onde ela diz "Bora
   Vender", o preço praticado tem de estar no piso ou acima; onde ela
   reprova, abaixo. Divergir significa que a inversão da fórmula está
   errada — e aí todo preço mínimo gravado estaria errado também. */
const divergentes = [];
let conferidas = 0;
for (const l of linhas) {
  if (!l.piso || !l.status || !l.precoHoje) continue;
  conferidas++;
  const aprovada = /bora vender/i.test(l.status);
  /* Um centavo de folga: 901032 cai a 6,90%, a um décimo do corte, e a
     planilha arredonda na exibição. */
  const passaNoPiso = l.precoHoje >= l.piso.preco - 0.01;
  if (aprovada !== passaNoPiso) {
    divergentes.push(`${l.cod}: planilha diz "${l.status}", piso ${l.piso.preco} contra preço ${l.precoHoje}`);
  }
}
console.log(`\nConferência contra o Status da planilha: ${conferidas - divergentes.length}/${conferidas} de acordo.`);
if (divergentes.length) {
  divergentes.forEach((d) => console.log("   ✗", d));
  throw new Error("A inversão da fórmula não reproduz o veredito da planilha — não gravo nada assim.");
}

const semAnuncio = linhas.filter((l) => l.piso && !porSku.has(nrm(l.cod)));
console.log(`\nSem anúncio casado (${semAnuncio.length}): ${semAnuncio.map((l) => l.cod).join(", ") || "—"}`);
const codsPlan = new Set(linhas.filter((l) => l.piso).map((l) => nrm(l.cod)));
const descobertos = [...porSku.keys()].filter((k) => !codsPlan.has(k));
console.log(`SKUs anunciados SEM linha na planilha: ${descobertos.length} de ${porSku.size}`);

/* ── 3. Montar as linhas da Fórmula base ── */
const itens = [];
const precos = [];
for (const l of linhas) {
  if (!l.piso) continue;
  // A matriz, por SKU: o mesmo piso em toda faixa (ver cabeçalho).
  for (const c of FAIXAS) {
    precos.push({ operacao_id: OPERACAO, vigente_de: VIGENTE_DE, chave_tipo: "sku", chave: l.cod.trim(), comissao: c, preco: l.piso.preco });
  }
  // Um item por anúncio casado: é o que dá tipo e comissão padrão ao motor.
  for (const a of porSku.get(nrm(l.cod)) ?? []) {
    itens.push({
      operacao_id: OPERACAO,
      vigente_de: VIGENTE_DE,
      mlb: a.codigo_externo,
      sku: l.cod.trim(),
      tipo_anuncio: a.tipo === "premium" ? "premium" : "classico",
      comissao_padrao: l.comissao,
    });
  }
}
console.log(`\nA gravar: ${itens.length} itens (anúncios) e ${precos.length} preços (${precos.length / FAIXAS.length} SKUs × ${FAIXAS.length} faixas), vigentes de ${VIGENTE_DE}.`);

if (!gravar) {
  console.log("\nEnsaio. Rode com --gravar para escrever (e --custos para preencher também Financeiro › Custos).");
  process.exit(0);
}

/* ── 4. Gravar ── */
for (const [tabela, dados, conflito] of [
  ["formula_base_itens", itens, "operacao_id,mlb,vigente_de"],
  ["formula_base_precos", precos, "operacao_id,chave_tipo,chave,comissao,vigente_de"],
]) {
  for (let i = 0; i < dados.length; i += 500) {
    const { error } = await sb.from(tabela).upsert(dados.slice(i, i + 500), { onConflict: conflito });
    if (error) throw new Error(`${tabela}: ${error.message}`);
  }
  console.log(`${tabela}: ${dados.length} linhas gravadas.`);
}

/* ── 5. Custos, só onde ainda não há ──
   Nunca sobrescreve: custo já cadastrado é decisão de alguém, e trocá-lo
   por um número de planilha mudaria margem histórica sem aviso. */
if (comCustos) {
  const produtos = await todos(() =>
    sb.from("produtos").select("id,sku,custo_unitario,embalagem,aliquota_impostos").eq("operacao_id", OPERACAO).order("id")
  );
  const porProd = new Map(produtos.map((p) => [nrm(p.sku), p]));
  let tocados = 0, pulados = 0, ausentes = [];
  for (const l of linhas) {
    if (!l.piso) continue;
    const p = porProd.get(nrm(l.cod));
    if (!p) { ausentes.push(l.cod); continue; }
    if (Number(p.custo_unitario) > 0) { pulados++; continue; }
    const { error } = await sb
      .from("produtos")
      .update({
        custo_unitario: l.custo,
        embalagem: l.emb,
        aliquota_impostos: IMPOSTO * 100,
        custo_atualizado_em: new Date().toISOString(),
      })
      .eq("id", p.id);
    if (error) throw new Error(`produtos ${l.cod}: ${error.message}`);
    tocados++;
  }
  console.log(`produtos: ${tocados} com custo preenchido, ${pulados} já tinham, ${ausentes.length} sem cadastro (${ausentes.join(", ") || "—"}).`);
}
