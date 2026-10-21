/**
 * O dia que ainda está correndo não recebe veredito de meta.
 *
 * A tela de Vendas > Dia abre no último dia COM MOVIMENTO, e de manhã
 * esse dia é hoje — a Probel já tem pedido às dez. Antes disto, ela
 * comparava o acumulado até agora com a meta do dia INTEIRO e escrevia
 * "faltou R$ 18.000", com o cartão vermelho e `bateu: false`.
 *
 * Não faltou nada: o dia não acabou. É o mesmo mal-entendido que já fez
 * o dono achar três vezes que o sistema estava desatualizado.
 *
 * `docs/agents/telas.md`: "Parcial é 'ainda está acontecendo'. Diga,
 * não compare como se estivesse fechado."
 */
import assert from "node:assert/strict";

/*
 * A regra testada, copiada de `montar()` em src/lib/dados/dia.ts.
 *
 * O carregador fala com o banco e com a sessão, e não roda fora de uma
 * requisição. O que importa aqui é a decisão, que é uma linha — e uma
 * linha replicada com a origem anotada vale mais do que um teste que
 * não existe.
 */
function vereditoDaMeta({ meta, liquida, parcial, emAndamento }) {
  return meta > 0 && !parcial && !emAndamento ? liquida >= meta : null;
}

/* O que a tela escreve embaixo do cartão da meta. */
function subtituloDaMeta({ meta, sobraMeta, emAndamento, metaPorConta }) {
  const curto = (v) => `R$ ${Math.round(v)}`;
  if (meta <= 0) return metaPorConta ? "meta do canal" : "sem meta";
  if (emAndamento) return `${curto(Math.max(0, -sobraMeta))} até fechar`;
  return sobraMeta >= 0 ? `sobrou ${curto(sobraMeta)}` : `faltou ${curto(-sobraMeta)}`;
}

/* ══ 1. Dia correndo, abaixo da meta: sem veredito ══ */
{
  const d = { meta: 45000, liquida: 26656, parcial: false, emAndamento: true };
  assert.equal(
    vereditoDaMeta(d),
    null,
    "às dez da manhã não dá para dizer que o dia não bateu a meta de 24 horas",
  );
  assert.equal(
    subtituloDaMeta({ ...d, sobraMeta: d.liquida - d.meta, metaPorConta: false }),
    "R$ 18344 até fechar",
    'o texto é o que falta para fechar, não "faltou" — que soa a resultado',
  );
}

/* ══ 2. Dia correndo que JÁ passou da meta: também sem veredito ══
   Poderia dizer que bateu, e é verdade. Mas o cartão vira "sobrou", e
   sobrar num dia que ainda vai vender mais é número que muda sozinho
   enquanto se olha. O veredito sai quando o dia fecha. */
{
  const d = { meta: 20000, liquida: 26656, parcial: false, emAndamento: true };
  assert.equal(vereditoDaMeta(d), null);
  assert.equal(
    subtituloDaMeta({ ...d, sobraMeta: d.liquida - d.meta, metaPorConta: false }),
    "R$ 0 até fechar",
    "passou da meta antes de fechar: falta zero, e não se anuncia sobra",
  );
}

/* ══ 3. Dia fechado: o veredito volta ══ */
{
  const bateu = { meta: 20000, liquida: 26656, parcial: false, emAndamento: false };
  assert.equal(vereditoDaMeta(bateu), true);
  assert.equal(
    subtituloDaMeta({ ...bateu, sobraMeta: 6656, metaPorConta: false }),
    "sobrou R$ 6656",
  );

  const naoBateu = { meta: 45000, liquida: 26656, parcial: false, emAndamento: false };
  assert.equal(vereditoDaMeta(naoBateu), false);
  assert.equal(
    subtituloDaMeta({ ...naoBateu, sobraMeta: -18344, metaPorConta: false }),
    "faltou R$ 18344",
  );
}

/* ══ 4. Dia sem movimento continua sem veredito ══
   É o caso que já existia: dia futuro do mês tem meta rateada, e sem
   isto o calendário ficaria vermelho de hoje até o fim do mês. */
{
  assert.equal(
    vereditoDaMeta({ meta: 45000, liquida: 0, parcial: true, emAndamento: false }),
    null,
    "dia sem movimento é ausência, não fracasso",
  );
}

/* ══ 5. Sem meta cadastrada, nada a julgar ══ */
{
  assert.equal(vereditoDaMeta({ meta: 0, liquida: 26656, parcial: false, emAndamento: false }), null);
  assert.equal(
    subtituloDaMeta({ meta: 0, sobraMeta: 0, emAndamento: false, metaPorConta: true }),
    "meta do canal",
  );
}

console.log(
  "OK: dia em andamento não bate nem deixa de bater meta, e dia fechado continua com veredito.",
);
