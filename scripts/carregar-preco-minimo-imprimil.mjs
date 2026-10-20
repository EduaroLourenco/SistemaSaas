/**
 * A tabela de preço mínimo da Imprimil vira a base de preço do sistema.
 *
 * ── A régua é PISO, não tabela ──
 *
 * A convenção do motor de promoções é que a "tabela" é o preço cheio e o
 * menor ofertável é tabela × 0,95. A planilha da Imprimil não dá a tabela:
 * dá direto o MÍNIMO. Gravar esse número como tabela e deixar a leitura em
 * "alvo" abriria mais 5% abaixo do que a operação decidiu aguentar.
 *
 * Por isso a carga grava o número como está e deixa a operação em
 * `promo_usar_como_piso = true` com tolerância ZERO: aí a tela já abre na
 * régua certa e o motor compara a oferta contra o mínimo, sem folga.
 *
 * ── Por que a comissão é 11,5% e 16,5% ──
 *
 * Sem redução de tarifa (que é o caso da Imprimil hoje), o motor escolhe a
 * alíquota pelo TIPO do anúncio: clássico 11,5%, premium 16,5%. É nessas
 * duas chaves que o preço precisa estar para ser encontrado. A planilha tem
 * exatamente essas duas colunas.
 *
 * ── Os dois produtos sem código ──
 *
 * "Moleskine Copa" e "Moleskine full" vieram sem código na planilha. O
 * catálogo do canal resolve: Copa são os quatro MOLCOPA01..04, e a linha
 * floral são os MOL-FLORAL-01..05.
 *
 * O floral tem uma armadilha: o mesmo SKU cobre a UNIDADE a R$ 49,90 e o
 * KIT DE 10 a R$ 299,35. Um mínimo de R$ 29,90 gravado no SKU valeria
 * também para o kit — dez vezes abaixo do que ele custa. Então a linha
 * floral entra por MLB, só nos cinco anúncios de unidade. Os cinco kits
 * ficam de fora de propósito: voltam com "sem piso cadastrado", que é
 * visível, em vez de um piso errado, que não é.
 *
 * Uso: node scripts/carregar-preco-minimo-imprimil.mjs [--aplicar]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const OPERACAO = "123c2f3c-c4ed-48ba-b4c4-753d78265946"; // Imprimil
const VIGENTE_DE = "2026-10-19";
const APLICAR = process.argv.includes("--aplicar");
const CLASSICO = 0.115;
const PREMIUM = 0.165;

const raiz = fileURLToPath(new URL("../", import.meta.url));
for (const linha of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.startsWith("#") && !process.env[linha.slice(0, i)]) {
    process.env[linha.slice(0, i)] = linha.slice(i + 1).trim();
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ══ A aba "Preço Mínimo", como ela está ══ */
const TABELA = [
  { codigo: "LIV_PACK10", nome: "Kit com 10 Livrinhos para Colorir", classico: 16.03, premium: 17.88 },
  { codigo: "LIV_PACK15", nome: "Kit com 15 Livrinhos para Colorir", classico: 17.59, premium: 19.62 },
  { codigo: "LIV_PACK30", nome: "Kit com 30 Livrinhos para Colorir", classico: 25.69, premium: 28.65 },
  { codigo: "LIV_PACK50", nome: "Kit com 50 Livrinhos para Colorir", classico: 34.48, premium: 38.46 },
  { codigo: "LIV_PACK100", nome: "Kit com 100 Livrinhos para Colorir", classico: 50, premium: 55.77 },
  { codigo: "REV_PACK10_RELI", nome: "10 Livrinhos De Colorir Historias Biblicas", classico: 16.03, premium: 17.88 },
  { codigo: "REV_PACK15_RELI", nome: "15 Livrinhos De Colorir Historias Biblicas", classico: 17.59, premium: 19.62 },
  { codigo: "REV_PACK30_RELI", nome: "30 Livrinhos De Colorir Historias Biblicas", classico: 25.69, premium: 28.65 },
  { codigo: "REV_PACK50_RELI", nome: "50 Livrinhos De Colorir Historias Biblicas", classico: 34.48, premium: 38.46 },
  { codigo: "REV_PACK100_RELI", nome: "100 Livrinhos De Colorir Historias Biblicas", classico: 50, premium: 55.77 },
  { codigo: "IMP_06101", nome: "Caderneta com Suporte de Celular", classico: 31.84, premium: 34.75 },
  /* Sem código na planilha; o vínculo sai do catálogo do canal. */
  { nome: "Moleskine Copa", classico: 25, premium: 27, familia: /^MOLCOPA\d+$/ },
  { nome: "Moleskine full", classico: 29, premium: 29.9, familia: /^MOL-FLORAL-\d+$/, porAnuncio: /^Caderno /i },
];

const { data: anuncios, error: ea } = await sb
  .from("anuncios")
  .select("codigo_externo,sku_canal,titulo,tipo,status")
  .eq("operacao_id", OPERACAO);
if (ea) throw new Error(ea.message);
const comSku = (anuncios ?? []).filter((a) => a.sku_canal);

const reais = (v) => (v == null ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
const precos = [];
const relatorio = [];
const semAnuncio = [];

for (const linha of TABELA) {
  /* Por código direto, ou pela família quando a planilha veio sem ele. */
  const casam = linha.codigo
    ? comSku.filter((a) => a.sku_canal === linha.codigo)
    : comSku.filter((a) => linha.familia.test(a.sku_canal));
  if (!casam.length) {
    semAnuncio.push(linha);
    continue;
  }

  if (linha.porAnuncio) {
    /* Grava por MLB: o SKU cobre produtos de preço muito diferente. */
    const escolhidos = casam.filter((a) => linha.porAnuncio.test(a.titulo));
    const fora = casam.filter((a) => !linha.porAnuncio.test(a.titulo));
    for (const a of escolhidos) {
      precos.push({ chave_tipo: "mlb", chave: a.codigo_externo, comissao: CLASSICO, preco: linha.classico });
      precos.push({ chave_tipo: "mlb", chave: a.codigo_externo, comissao: PREMIUM, preco: linha.premium });
    }
    relatorio.push({ linha, chaves: escolhidos.map((a) => a.codigo_externo), tipo: "por anúncio", fora });
    continue;
  }

  const skus = [...new Set(casam.map((a) => a.sku_canal))];
  for (const sku of skus) {
    precos.push({ chave_tipo: "sku", chave: sku, comissao: CLASSICO, preco: linha.classico });
    precos.push({ chave_tipo: "sku", chave: sku, comissao: PREMIUM, preco: linha.premium });
  }
  relatorio.push({ linha, chaves: skus, tipo: "por SKU", fora: [] });
}

/* ══ Relatório ══ */
console.log(`Preço mínimo da Imprimil → base de preço · vigência ${VIGENTE_DE.split("-").reverse().join("/")}\n`);
for (const r of relatorio) {
  console.log(
    `  ${(r.linha.codigo ?? "(sem código)").padEnd(18)} ${r.linha.nome.padEnd(44)} ` +
      `${reais(r.linha.classico).padStart(11)} / ${reais(r.linha.premium).padStart(11)}  →  ${r.tipo}: ${r.chaves.join(", ")}`
  );
  for (const a of r.fora) console.log(`       FORA: ${a.codigo_externo} ${a.sku_canal} — ${a.titulo}`);
}
if (semAnuncio.length) {
  console.log("\nsem anúncio no canal (não entram na base):");
  for (const l of semAnuncio) console.log("  ", l.codigo ?? l.nome);
}

/* Anúncio ativo que ficou sem piso: é o que vai voltar recusado. */
const chavesSku = new Set(precos.filter((p) => p.chave_tipo === "sku").map((p) => p.chave));
const chavesMlb = new Set(precos.filter((p) => p.chave_tipo === "mlb").map((p) => p.chave));
const descobertos = (anuncios ?? []).filter(
  (a) => a.status === "ativo" && !chavesSku.has(a.sku_canal) && !chavesMlb.has(a.codigo_externo)
);
console.log(`\nanúncios ATIVOS sem piso nesta base: ${descobertos.length}`);
for (const a of descobertos) console.log(`   ${a.codigo_externo} ${String(a.sku_canal ?? "—").padEnd(18)} ${a.titulo}`);
const pausadosSemPiso = (anuncios ?? []).filter(
  (a) => a.status !== "ativo" && !chavesSku.has(a.sku_canal) && !chavesMlb.has(a.codigo_externo)
).length;
console.log(`anúncios pausados sem piso: ${pausadosSemPiso} (não atrapalham enquanto estiverem fora do ar)`);
console.log(`\nlinhas de preço a gravar: ${precos.length}`);

if (!APLICAR) {
  console.log("\nENSAIO — nada foi gravado. Rode com --aplicar.");
  process.exit(0);
}

/* ══ Gravação ══ */
const { error: eApaga } = await sb
  .from("formula_base_precos")
  .delete()
  .eq("operacao_id", OPERACAO)
  .eq("vigente_de", VIGENTE_DE);
if (eApaga) throw new Error(`Falha ao limpar a vigência: ${eApaga.message}`);

const { error: eGrava } = await sb
  .from("formula_base_precos")
  .insert(precos.map((p) => ({ ...p, operacao_id: OPERACAO, vigente_de: VIGENTE_DE })));
if (eGrava) throw new Error(`Falha ao gravar preços: ${eGrava.message}`);

/*
 * `formula_base_itens` guarda o tipo de cada anúncio. O motor completa o
 * que falta com o catálogo, mas gravar aqui deixa a base auto-suficiente —
 * e é o que faz a tela dizer "base vigente desde ..." em vez de nada.
 */
const itens = (anuncios ?? [])
  .filter((a) => a.tipo)
  .map((a) => ({
    operacao_id: OPERACAO,
    vigente_de: VIGENTE_DE,
    mlb: a.codigo_externo,
    sku: a.sku_canal,
    tipo_anuncio: a.tipo === "premium" ? "premium" : "classico",
    comissao_padrao: a.tipo === "premium" ? PREMIUM : CLASSICO,
  }));
const { error: eItensApaga } = await sb
  .from("formula_base_itens")
  .delete()
  .eq("operacao_id", OPERACAO)
  .eq("vigente_de", VIGENTE_DE);
if (eItensApaga) throw new Error(`Falha ao limpar itens: ${eItensApaga.message}`);
const { error: eItens } = await sb.from("formula_base_itens").insert(itens);
if (eItens) throw new Error(`Falha ao gravar itens: ${eItens.message}`);

/* A régua: piso, sem folga. Sem isto a tela abriria em "alvo" com 5%. */
const { error: eOp } = await sb
  .from("operacoes")
  .update({ promo_usar_como_piso: true, promo_tolerancia_pct: 0 })
  .eq("id", OPERACAO);
if (eOp) throw new Error(`Falha ao ajustar a régua da operação: ${eOp.message}`);

console.log(`\ngravado: ${precos.length} preços e ${itens.length} itens · operação em PISO com tolerância 0`);
