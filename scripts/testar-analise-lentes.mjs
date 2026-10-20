/**
 * As lentes da tela de Anúncios param de acusar o que não mediram.
 *
 * Três defeitos que o dado real da Probel expôs, e que este teste trava:
 *
 *   · 825 dos 1.004 anúncios apareciam "100% abaixo do preço ideal".
 *     Não estavam: o preço da vitrine nunca era lido, caía para zero, e
 *     zero contra a tabela dá −100%. Semana sem leitura é nula, e nula
 *     não acende lente nenhuma.
 *
 *   · A "joia escondida" exigia tráfego ABAIXO da média da carteira e,
 *     por um piso que eu mesmo coloquei, pelo menos 60 visitas — com a
 *     média em 49, as duas condições nunca eram verdadeiras juntas e a
 *     lente zerou. O corte certo é por venda.
 *
 *   · "Desperdício de tráfego" mandava revisar título e foto de anúncio
 *     pausado, que não recebe visita nenhuma desde que parou.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const vazio = path.join(mkdtempSync(path.join(tmpdir(), "gerizo-")), "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { analisar } = await jiti.import(path.join(raiz, "src/lib/analise.ts"));

const SEMANAS = ["S36", "S37", "S38", "S39", "S40", "S41", "S42", "S43"];

/** Um anúncio, com as semanas que o teste quiser. */
function anuncio(mlb, { status = "ativo", semanas = [] } = {}) {
  return {
    mlb,
    sku: mlb,
    titulo: "Colchão " + mlb,
    tipo: "Clássico",
    status,
    conta: "Conta",
    categoria: "Colchão",
    estoque: 10,
    precoAtual: 1000,
    semanas: SEMANAS.map((s, i) => ({
      semana: s,
      intervalo: s,
      visitas: 0,
      vendas: 0,
      receita: 0,
      precoAnunciado: null,
      precoRealizado: null,
      precoIdeal: 0,
      comissao: 11.5,
      dias: [],
      campanhas: [],
      ...(semanas[i] ?? {}),
    })),
  };
}

/* ══ 1. Sem preço medido, nenhuma lente de preço acende ══
   O anúncio tem tabela (precoIdeal) e nunca vendeu nem teve leitura de
   vitrine. Antes isso virava "100% abaixo do ideal". */
{
  const mudo = anuncio("MLB_SEM_PRECO", {
    semanas: SEMANAS.map(() => ({ precoIdeal: 1000, visitas: 3 })),
  });
  const { itens } = analisar([mudo], SEMANAS);
  const a = itens[0];
  assert.equal(a.metricas.preco, 0, "sem venda e sem vitrine, não há preço medido");
  assert.equal(a.metricas.desvio, 0, "desvio sem preço medido é zero, não -100%");
  assert.ok(
    !a.lentes.includes("fora_do_preco"),
    "não pode acusar fora do preço um anúncio cujo preço ninguém leu",
  );
  assert.ok(!a.lentes.includes("sangrando"), "nem sangrando");
}

/* ══ 2. Com leitura de vitrine, o desvio existe ══ */
{
  const comVitrine = anuncio("MLB_VITRINE", {
    semanas: SEMANAS.map((_, i) => ({
      precoIdeal: 1000,
      visitas: 10,
      /* Só as três últimas semanas têm leitura — é o caso real: o
         retrato diário de preço começou em outubro. */
      precoAnunciado: i >= 5 ? 850 : null,
    })),
  });
  const { itens } = analisar([comVitrine], SEMANAS);
  const a = itens[0];
  assert.equal(a.metricas.preco, 850, "vale a última semana COM leitura");
  assert.ok(a.metricas.desvio < -14, `esperava ~-15%, veio ${a.metricas.desvio}`);
  assert.ok(a.lentes.includes("fora_do_preco"), "15% abaixo da tabela é fora do preço");
}

/* ══ 3. A joia precisa de duas vendas ══
   Carteira: um gigante que puxa a média de visitas para cima, e dois
   pequenos de tráfego baixo — um com uma venda, outro com três. */
{
  const gigante = anuncio("MLB_GIGANTE", {
    semanas: SEMANAS.map(() => ({ visitas: 500, vendas: 1, receita: 1000 })),
  });
  const sorte = anuncio("MLB_SORTE", {
    semanas: [{ visitas: 3, vendas: 1, receita: 1000 }],
  });
  const joia = anuncio("MLB_JOIA", {
    semanas: [{ visitas: 9, vendas: 3, receita: 3000 }],
  });

  const { itens } = analisar([gigante, sorte, joia], SEMANAS);
  const por = new Map(itens.map((i) => [i.mlb, i]));

  assert.ok(
    por.get("MLB_JOIA").lentes.includes("joias"),
    "três vendas em nove visitas, com tráfego abaixo da média, é joia",
  );
  assert.ok(
    !por.get("MLB_SORTE").lentes.includes("joias"),
    "uma venda em três visitas é sorte, não diagnóstico",
  );
}

/* ══ 4. Anúncio fora do ar não entra em desperdício de tráfego ══
   Ele tem visitas acima da média e conversão abaixo — acenderia a
   lente —, mas está pausado: a ação sugerida não cabe. */
{
  const parado = anuncio("MLB_PARADO", {
    status: "pausado",
    semanas: SEMANAS.map(() => ({ visitas: 400, vendas: 0, receita: 0 })),
  });
  const vivo = anuncio("MLB_VIVO", {
    semanas: SEMANAS.map(() => ({ visitas: 400, vendas: 0, receita: 0 })),
  });
  const pequeno = anuncio("MLB_PEQUENO", {
    semanas: [{ visitas: 1, vendas: 1, receita: 100 }],
  });

  const { itens } = analisar([parado, vivo, pequeno], SEMANAS);
  const por = new Map(itens.map((i) => [i.mlb, i]));
  assert.ok(
    por.get("MLB_VIVO").lentes.includes("desperdicio"),
    "o anúncio no ar com tráfego alto e conversão baixa é desperdício",
  );
  assert.ok(
    !por.get("MLB_PARADO").lentes.includes("desperdicio"),
    "anúncio pausado não recebe visita: mandar revisar a foto é trabalho à toa",
  );
}

/* ══ 5. O subsídio soma o que foi vendido abaixo da tabela ══ */
{
  const abaixo = anuncio("MLB_ABAIXO", {
    semanas: [
      { visitas: 100, vendas: 2, receita: 1600, precoIdeal: 1000 },
      { visitas: 100, vendas: 1, receita: 1000, precoIdeal: 1000 },
    ],
  });
  const { itens } = analisar([abaixo], SEMANAS);
  /* Semana 1: pagou 800, tabela 1000, 2 unidades → 400.
     Semana 2: pagou 1000, na tabela → nada. */
  assert.equal(itens[0].metricas.subsidio, 400, "só a semana abaixo da tabela conta");
}

console.log(
  "OK: sem preço medido não acende lente de preço, a joia pede duas vendas, e anúncio parado fica fora do desperdício.",
);
