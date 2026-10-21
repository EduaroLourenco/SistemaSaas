/**
 * Na régua de margem, a tolerância não fura a margem pedida.
 *
 *   node --experimental-strip-types scripts/testar-tolerancia-margem.mjs
 *
 * As duas réguas usam o MESMO campo de tolerância, e o número de cada uma
 * significa coisas diferentes: a tabela é o preço pretendido, e a margem
 * calcula o FUNDO — o preço que deixa exatamente a margem mínima. Para a
 * tolerância querer dizer o mesmo nas duas, a referência da margem é o
 * preço que, abrindo a tolerância inteira, para em cima do fundo.
 *
 * A divisão que faz isso era por 5% fixo, e por isso só acertava quando a
 * tolerância era exatamente 5%. Com 10% cadastrados a referência subia 5 e
 * a oferta descia 10: entrava a 4,1% de margem numa régua de 8%. Foi o
 * Eduardo que achou, perguntando por que o sistema sobe 5 para dar 5 —
 * a resposta é que não era para ser 5, era para ser a tolerância.
 *
 * O que este teste prende: com o interruptor DESLIGADO a margem que sobra
 * é a pedida, em qualquer tolerância. LIGADO ela é furada de propósito, e
 * o teste mede o quanto, para que isso continue sendo uma escolha visível.
 */
import assert from "node:assert/strict";
import { precoDaMargem } from "../src/lib/planilhas/motor-promocoes.ts";

const CUSTO = { mercadoria: 6, embalagem: 0.5, frete: 2, impostoPct: 10, margemMinimaPct: 8 };
const CUSTO_TOTAL = CUSTO.mercadoria + CUSTO.embalagem + CUSTO.frete;
const COMISSAO = 0.115;
const MARGEM_PEDIDA = 8;

const base = (comoUsar, toleranciaPct) => ({
  baseMlb: new Map(),
  precosSKU: new Map(),
  precosMLB: new Map(),
  custos: new Map([["SK1", CUSTO]]),
  regra: { modo: "margem", margemMinima: MARGEM_PEDIDA, comoUsar, toleranciaPct },
});

/** A margem que de fato sobra num preço — a conta que o dinheiro faz. */
const margemReal = (preco) =>
  100 - COMISSAO * 100 - CUSTO.impostoPct - (CUSTO_TOTAL * 100) / preco;

/** O menor preço que o motor aceita, dada a referência e a tolerância. */
const minimoAceito = (comoUsar, tol) => {
  const ref = precoDaMargem(base(comoUsar, tol), "SK1", COMISSAO);
  assert.ok(ref && ref > 0, `sem referência para ${comoUsar} com ${tol}%`);
  return Math.round(ref * (1 - tol / 100) * 100) / 100;
};

const TOLERANCIAS = [0, 2, 5, 7, 10, 20];

/* ── DESLIGADO: a tolerância encosta na margem, nunca fura ── */
for (const tol of TOLERANCIAS) {
  const m = margemReal(minimoAceito("alvo", tol));
  /* Um centavo de arredondamento mexe na terceira casa da margem; a folga
     de 0,1 ponto cobre isso sem deixar passar erro de régua. */
  assert.ok(
    Math.abs(m - MARGEM_PEDIDA) < 0.1,
    `desligado com ${tol}%: deveria parar em ${MARGEM_PEDIDA}% e parou em ${m.toFixed(2)}%`,
  );
}

/* ── LIGADO: a tolerância fura, e quanto mais tolerância mais fura ── */
let anterior = Infinity;
for (const tol of TOLERANCIAS) {
  const m = margemReal(minimoAceito("piso", tol));
  if (tol === 0) {
    assert.ok(
      Math.abs(m - MARGEM_PEDIDA) < 0.1,
      `ligado com 0%: sem tolerância o fundo é a margem — deu ${m.toFixed(2)}%`,
    );
  } else {
    assert.ok(m < MARGEM_PEDIDA, `ligado com ${tol}%: deveria furar a margem — deu ${m.toFixed(2)}%`);
  }
  assert.ok(m <= anterior + 1e-9, `ligado: ${tol}% não pode sobrar mais margem que a tolerância anterior`);
  anterior = m;
}

/* O caso que estava errado, com os números medidos: 10% de tolerância numa
   régua de 8% entrava a 4,1%. Agora para em 8%. */
assert.ok(
  Math.abs(margemReal(minimoAceito("alvo", 10)) - 8) < 0.1,
  "o caso de 10% é o que motivou este arquivo",
);

/* E o equivalente que o usuário pode conferir de cabeça:
   desligado com 5% dá o mesmo que ligado com 0%. */
assert.equal(minimoAceito("alvo", 5), minimoAceito("piso", 0));

console.log(
  `${TOLERANCIAS.length * 2} verificações: desligado mantém os ${MARGEM_PEDIDA}% em qualquer tolerância; ligado fura.`,
);
