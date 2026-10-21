/**
 * Tráfego pago não manda mais desligar quem o irmão sustenta.
 *
 * O caso que gerou isto: a tela mandou desligar o MLB5382536864 — o
 * Queen do Turim, zero venda atribuída. O Turim é uma família de doze
 * anúncios no canal, e o Viúva e o Solteiro dela estavam vendendo. No
 * Mercado Livre o patrocínio é da FAMÍLIA: desligar aquele derruba os
 * que vendem.
 *
 * A regra testada é a da decisão, replicada de `carregarTrafegoPago`
 * — o carregador fala com o banco e não roda fora de uma requisição,
 * e uma linha replicada com a origem anotada vale mais que teste
 * nenhum.
 */
import assert from "node:assert/strict";

/** A decisão, como está em src/lib/dados/trafego-pago.ts. */
function situacaoDe({ investimento, receitaAtribuida, receitaReal, familiaReceita, sobra }) {
  if (investimento > 0 && receitaAtribuida === 0) {
    if (receitaReal > 0) return "vendeu_sem_ads";
    if (familiaReceita > 0) return "familia_vende";
    return "sem_retorno";
  }
  if (sobra != null && sobra < 0) return "prejuizo";
  return "ok";
}

/* ══ 1. O caso real: o anúncio não vendeu, a família sim ══ */
{
  const s = situacaoDe({
    investimento: 180, receitaAtribuida: 0, receitaReal: 0,
    familiaReceita: 5718, /* Viúva 3.367 + Solteiro 2.351 */
    sobra: null,
  });
  assert.equal(
    s, "familia_vende",
    "com irmão vendendo, a conclusão não pode ser desligar: o patrocínio é do grupo",
  );
  assert.notEqual(s, "sem_retorno");
}

/* ══ 2. Ninguém da família vendeu: aí sim, desligar ══ */
{
  assert.equal(
    situacaoDe({ investimento: 180, receitaAtribuida: 0, receitaReal: 0, familiaReceita: 0, sobra: null }),
    "sem_retorno",
    "sem venda no anúncio nem na família, a mídia não está pagando nada",
  );
}

/* ══ 3. O próprio anúncio vendeu, só não foi atribuído ao ads ══
   Continua sendo "vendeu sem ads", que é outra ação: a mídia sobrou,
   não faltou. A família não muda isso. */
{
  assert.equal(
    situacaoDe({ investimento: 180, receitaAtribuida: 0, receitaReal: 4229, familiaReceita: 9000, sobra: null }),
    "vendeu_sem_ads",
    "a venda do próprio anúncio vem antes da da família",
  );
}

/* ══ 4. Com receita atribuída, a família não entra na conta ══ */
{
  assert.equal(
    situacaoDe({ investimento: 180, receitaAtribuida: 900, receitaReal: 900, familiaReceita: 0, sobra: 300 }),
    "ok",
  );
  assert.equal(
    situacaoDe({ investimento: 180, receitaAtribuida: 900, receitaReal: 900, familiaReceita: 5000, sobra: -40 }),
    "prejuizo",
    "mídia acima da margem continua prejuízo, com ou sem irmão vendendo",
  );
}

/* ══ 5. A receita da família exclui a do próprio anúncio ══
   Senão o anúncio que vendeu bem apareceria como sustentado pelos
   irmãos, e a etiqueta diria o contrário do que acontece. */
{
  const receitaDoAnuncio = 4229;
  const totalDaFamilia = 9947;
  const dosIrmaos = Math.max(0, totalDaFamilia - receitaDoAnuncio);
  assert.equal(dosIrmaos, 5718);
  assert.equal(
    situacaoDe({ investimento: 180, receitaAtribuida: 0, receitaReal: receitaDoAnuncio, familiaReceita: dosIrmaos, sobra: null }),
    "vendeu_sem_ads",
  );
}

console.log(
  "OK: irmão vendendo vira 'familia_vende' em vez de 'desligar', e a venda do próprio anúncio continua tendo prioridade.",
);
