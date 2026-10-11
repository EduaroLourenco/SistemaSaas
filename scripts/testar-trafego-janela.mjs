/**
 * A janela do tráfego pago: escolher uma, e a certa.
 *
 *   node scripts/testar-trafego-janela.mjs
 *
 * Os relatórios de Product Ads que o canal exporta se SOBREPÕEM — o
 * acumulado é reexportado a cada pedido. Nos dados da Probel são 17
 * janelas, 98 pares sobrepostos, e agosto aparece em sete delas. Somar
 * tudo contava o gasto de agosto sete vezes: R$ 242 mil investidos onde o
 * real é uma fração. Não dava erro, só um número inflado.
 *
 * Este arquivo trava as duas decisões que vieram daí: ler uma janela por
 * vez, e qual é "a mais recente".
 */
import assert from "node:assert/strict";

/** A mesma ordenação do carregador: por FIM, depois por início. */
function maisRecente(janelas) {
  return [...janelas].sort((x, y) => {
    const [ix, fx] = x.split("|");
    const [iy, fy] = y.split("|");
    return fx.localeCompare(fy) || ix.localeCompare(iy);
  })[janelas.length - 1];
}

let n = 0;
const vale = (nome, a, b) => { n++; assert.equal(a, b, `${nome}: esperava ${b}, veio ${a}`); };

/* As janelas reais da Probel, em 11/10/2026. */
const REAIS = [
  "2026-06-02|2026-06-30", "2026-07-01|2026-07-31", "2026-07-30|2026-09-28",
  "2026-08-01|2026-08-31", "2026-08-01|2026-09-28", "2026-08-01|2026-09-30",
  "2026-08-01|2026-10-01", "2026-08-01|2026-10-02", "2026-08-01|2026-10-05",
  "2026-09-01|2026-10-05", "2026-09-06|2026-10-06", "2026-09-07|2026-10-07",
  "2026-09-08|2026-10-08", "2026-09-09|2026-10-09", "2026-09-10|2026-10-10",
  "2026-09-11|2026-10-11", "2026-09-22|2026-09-28",
];

/* 1. O caso que motivou o teste: ordenar pela chave crua escolheria
      22/09→28/09, uma semana mais velho, porque "09-22" > "09-11". */
vale("a mais recente é a de fim mais recente", maisRecente(REAIS), "2026-09-11|2026-10-11");
vale("ordenar pela chave crua erraria", [...REAIS].sort()[REAIS.length - 1], "2026-09-22|2026-09-28");

/* 2. Empate no fim: ganha quem começou depois (relatório mais estreito,
      o mais específico daquele fechamento). */
vale(
  "empate no fim vai para o início mais recente",
  maisRecente(["2026-08-01|2026-09-28", "2026-07-30|2026-09-28"]),
  "2026-08-01|2026-09-28"
);

/* 3. Uma janela só: é ela. */
vale("janela única", maisRecente(["2026-06-02|2026-06-30"]), "2026-06-02|2026-06-30");

/* 4. A sobreposição existe de verdade nos dados — se um dia o canal
      passar a exportar janelas limpas, este teste avisa que a trava
      pode ser revista. */
let pares = 0;
for (let a = 0; a < REAIS.length; a++) {
  for (let b = a + 1; b < REAIS.length; b++) {
    const [ia, fa] = REAIS[a].split("|");
    const [ib, fb] = REAIS[b].split("|");
    if (ia <= fb && ib <= fa) pares++;
  }
}
n++;
assert.ok(pares > 0, "sem sobreposição nos dados reais: a leitura por janela pode ser revista");
console.log(`${n} verificações, todas certas. (${pares} pares de janelas se sobrepõem nos dados reais)`);
