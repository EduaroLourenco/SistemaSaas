/**
 * A tradução do item para o que a regra enxerga.
 *
 * O que se testa aqui é o que vira null. Campo nulo não é zero: é "não
 * deu para saber", e a regra o trata diferente. Trocar os dois faz
 * "vendas < 10" aceitar o catálogo inteiro de quem não tem relatório.
 *
 * Uso: node scripts/testar-item-para-regra.mjs
 */
import { strict as assert } from "node:assert";
import { paraRegra, SEM_CONTROLE } from "./lib/item-para-regra.mjs";

const base = {
  mlb: "MLB1", contaCanalId: "conta-a", tipoCampanha: "DEAL", nomeCampanha: "11.11",
  tipoAnuncio: "classico", statusAnuncio: "ativo", estoque: 12, sku: "PA1", familia: "Turim",
  catalogo: "winning", unidades30: 5, unidades90: 20, visitas30: 500,
  precoCanal: 80, precoCheio: 100, faixaQueSobra: 6.5, meliPct: 2, acos: 14, investimento30: 300,
  margemPct: null,
};

/* ── O 40.000 do canal não é estoque ── */
{
  const r = paraRegra({ ...base, estoque: SEM_CONTROLE });
  assert.equal(r["anuncio.estoque"], null, "sem controle não vira número");
  assert.equal(r["anuncio.temControleEstoque"], "nao");
}
{
  const r = paraRegra({ ...base, estoque: 12 });
  assert.equal(r["anuncio.estoque"], 12);
  assert.equal(r["anuncio.temControleEstoque"], "sim");
}
/* Estoque zero é um valor: o anúncio acabou, e a regra precisa ver isso. */
{
  const r = paraRegra({ ...base, estoque: 0 });
  assert.equal(r["anuncio.estoque"], 0);
  assert.equal(r["anuncio.temControleEstoque"], "sim");
}
/* Sem leitura nenhuma, as duas ficam desconhecidas. */
{
  const r = paraRegra({ ...base, estoque: null });
  assert.equal(r["anuncio.estoque"], null);
  assert.equal(r["anuncio.temControleEstoque"], null);
}

/* ── Conversão só existe com visita ── */
assert.equal(paraRegra({ ...base, unidades30: 5, visitas30: 500 })["venda.conversao30"], 1);
assert.equal(
  paraRegra({ ...base, unidades30: 0, visitas30: 0 })["venda.conversao30"],
  null,
  "0 em 0 é desconhecida, não zero"
);
assert.equal(paraRegra({ ...base, visitas30: null })["venda.conversao30"], null);
/* Com visita e nenhuma venda, aí sim é zero. */
assert.equal(paraRegra({ ...base, unidades30: 0, visitas30: 300 })["venda.conversao30"], 0);

/* ── Desconto proposto ── */
assert.equal(paraRegra({ ...base, precoCanal: 80, precoCheio: 100 })["preco.descontoProposto"], 20);
assert.equal(paraRegra({ ...base, precoCheio: null })["preco.descontoProposto"], null);
assert.equal(paraRegra({ ...base, precoCanal: null })["preco.descontoProposto"], null);

/* ── O que falta continua faltando ── */
assert.equal(paraRegra(base)["margem.pct"], null, "sem custo, margem é desconhecida");

console.log("item para regra: ok");
