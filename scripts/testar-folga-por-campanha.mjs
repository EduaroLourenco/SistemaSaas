/**
 * A folga lembrada por tipo de campanha — e o zero que não é ausência.
 *
 * A Probel trabalha com 5% nas campanhas automáticas e **0% no
 * pré-acordo**, onde o preço foi negociado a dedo. Esse zero é o caso que
 * quebra: com `||` no lugar de `??`, folga 0 cai no padrão de 5% e o
 * sistema passa a ofertar 5% ABAIXO de um preço que ninguém autorizou
 * baixar. É o defeito que já quebrou a planilha da Imprimil uma vez.
 *
 * `.scratch/PENDENTES.md`: "O preço proposto pelo canal é teto. Nunca
 * escrever acima dele" — e o piso negociado é chão pela mesma razão.
 *
 * Uso: node scripts/testar-folga-por-campanha.mjs
 */
import { strict as assert } from "node:assert";

/*
 * As duas regras testadas, copiadas da origem:
 *   - `folgaDe`     de `Automacoes`, em src/app/automacoes/automacoes-cliente.tsx
 *   - `valida`      de `gravarFolga`, em src/lib/dados/folga-campanha.ts
 *
 * A primeira vive dentro de um componente e a segunda fala com o banco;
 * nenhuma das duas roda aqui. São duas linhas, e uma linha replicada com
 * a origem anotada vale mais do que um teste que não existe.
 */
const FOLGA_PADRAO = 5;
const TIPO_PADRAO = "*";

const folgaDe = (porTipo, t) => porTipo[t] ?? porTipo[TIPO_PADRAO] ?? FOLGA_PADRAO;

const valida = (v) => Number.isFinite(v) && v >= 0 && v <= 30;

/* ══ 1. Zero é uma régua, não a falta de uma ══ */
{
  const guardado = { SMART: 5, PRE_NEGOTIATED: 0 };
  assert.equal(folgaDe(guardado, "PRE_NEGOTIATED"), 0,
    "0% no pré-acordo tem de valer 0% — cair no padrão ofertaria 5% abaixo do preço negociado");
  assert.equal(folgaDe(guardado, "SMART"), 5);
}

/* ══ 2. Tipo sem régua própria usa o padrão guardado, não o de fábrica ══ */
{
  const guardado = { [TIPO_PADRAO]: 3, PRE_NEGOTIATED: 0 };
  assert.equal(folgaDe(guardado, "DEAL"), 3, "o padrão da casa manda no tipo sem régua");
  assert.equal(folgaDe(guardado, "PRE_NEGOTIATED"), 0, "a régua do tipo ganha do padrão");
}

/* ══ 3. Sem nada guardado, o comportamento é o de antes: 5% ══
   É o que faz a tela continuar funcionando antes de a migração 45 rodar. */
{
  assert.equal(folgaDe({}, "DEAL"), FOLGA_PADRAO);
  assert.equal(folgaDe({}, TIPO_PADRAO), FOLGA_PADRAO);
}

/* ══ 4. Um padrão de zero também vale ══ */
{
  assert.equal(folgaDe({ [TIPO_PADRAO]: 0 }, "DEAL"), 0,
    "quem zera o padrão quer zero em tudo, não cinco");
}

/* ══ 5. A faixa aceita 0 e recusa o que não é número ══ */
{
  assert.equal(valida(0), true, "0% é válido");
  assert.equal(valida(30), true);
  assert.equal(valida(5.5), true);
  assert.equal(valida(-1), false);
  assert.equal(valida(30.1), false);
  assert.equal(valida(NaN), false, "campo vazio chega como NaN e não pode virar 0 calado");
}

console.log("OK: 0% é régua e não ausência, o padrão guardado manda no resto, e a faixa recusa o inválido.");
