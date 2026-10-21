/**
 * O mínimo é piso de ACEITAÇÃO, não preço a propor.
 *
 *   node --experimental-strip-types scripts/testar-piso-promocao.mjs
 *
 * O caso real é um skate da Bom de Compras publicado a R$ 399, com o canal
 * propondo R$ 379,05 e mínimo de R$ 251,13. O motor devolvia "participar em
 * R$ 251,13" — R$ 128 de desconto que ninguém pediu, e um preço que o canal
 * recusaria de todo modo se fosse mais alto que o dele.
 *
 * Em 21/10/2026 as duas leituras do número convergiram, porque o canal não
 * aceita contraproposta de preço mais alto: o mínimo decide ENTRAR ou não,
 * e quem entra entra no preço do canal. O que `comoUsar` ainda muda é de
 * onde o mínimo sai e quanta folga ele tem por padrão — "alvo" é a Fórmula
 * base com 5% de tolerância, "piso" é o custo com zero.
 *
 * Sem proposta na planilha não há o que comparar, e aí o mínimo ainda é
 * escrito: é o caso 5.
 */
import assert from "node:assert/strict";
import { processItem } from "../src/lib/planilhas/motor-promocoes.ts";

const PISO = 251.13;
const base = (comoUsar) => ({
  baseMlb: new Map([["MLB1", { tipo: "Clássico", padrao: 0.115 }]]),
  precosSKU: new Map([["SK1", { 0.115: PISO, 0.165: PISO, 0.105: PISO }]]),
  precosMLB: new Map(),
  regra: { modo: "tabela", margemMinima: 0, comoUsar },
});
/** processItem(mlb, sku, saleFee, finalPrice, originalPrice, data) */
const rodar = (comoUsar, propostaDoCanal, publicado = 399, saleFee = null) =>
  processItem("MLB1", "SK1", saleFee, propostaDoCanal, publicado, base(comoUsar));

let n = 0;
const vale = (nome, cond, r) => { n++; assert.ok(cond, `${nome} — veio ${JSON.stringify(r)}`); };

/* 1. O prejuízo que a regra evita, com os números reais do skate: a
      proposta do canal está muito acima do mínimo, nas duas leituras. */
const alvo = rodar("alvo", 379.05);
vale("como ALVO participa", alvo.action === "Participar", alvo);
vale("e NÃO contrapropõe o mínimo", alvo.newPrice === null, alvo);
const piso = rodar("piso", 379.05);
vale("como PISO participa", piso.action === "Participar", piso);
vale("e também não contrapropõe", piso.newPrice === null, piso);

/* 2. Proposta ABAIXO do mínimo: fica de fora. Escrever o mínimo por cima
      seria subir o preço, e nenhuma campanha do canal aceita isso. */
const abaixo = rodar("piso", 250);
vale("proposta abaixo do piso recusa", abaixo.action === "Não participar", abaixo);
vale("e não escreve preço", abaixo.newPrice === null, abaixo);
vale("dizendo de quanto foi", /abaixo do piso/.test(abaixo.pendencia), abaixo);

/* 3. Piso ACIMA do preço publicado: participar exigiria aumentar o preço,
      e promoção é desconto. Recusa, e não toca no preço. */
const caro = rodar("piso", 379.05, 200);
vale("piso acima do publicado recusa", caro.action === "Não participar", caro);
vale("e não escreve preço", caro.newPrice === null, caro);
vale("dizendo o porquê", /acima do preço publicado/.test(caro.pendencia), caro);

/* 4. SKU sem piso: pendência que diz o que falta, não "sem preço de tabela". */
const semPiso = processItem("MLB1", "OUTRO", null, 300, 399, base("piso"));
vale("SKU sem piso tem pendência própria", /sem piso cadastrado/.test(semPiso.pendencia), semPiso);

/* 5. Sem proposta do canal não há comparação a fazer, e o mínimo vale do
      mesmo jeito: a régua é nossa, não dele. */
const semProposta = rodar("piso", null);
vale("sem proposta, escreve o mínimo", semProposta.newPrice === PISO, semProposta);

/* 6. Com redução de tarifa (Caso A) o motor já validava a proposta e nunca
      mexeu no preço — nada disso pode ter mudado isso. */
const comReducao = rodar("piso", 300, 399, 10);
vale("Caso A segue sem escrever preço", comReducao.newPrice === null, comReducao);

console.log(`${n} verificações, todas certas.`);

/* ── 7. A tolerância é cadastro da empresa, e move o PISO DE ACEITAÇÃO ──
   db/36: ela decide até onde a proposta do canal pode furar o mínimo e
   ainda entrar. Antes de 21/10/2026 decidia qual número ia para a
   planilha, o que só fazia sentido enquanto o motor contrapropunha. */
const comFolga = (pct, proposta) =>
  processItem("MLB1", "SK1", null, proposta, 399, {
    ...base("piso"),
    regra: { modo: "tabela", margemMinima: 0, comoUsar: "piso", toleranciaPct: pct },
  });
let m = 0;
const diz = (nome, cond, r) => {
  m++;
  assert.ok(cond, `${nome} — veio ${JSON.stringify(r)}`);
};
/* 251,13 × 0,95 = 238,57 — uma proposta de 240 fura o piso cheio e cabe
   nos 5%, então a folga é a única coisa que decide entre os dois casos. */
diz("sem folga, 240 fica de fora", comFolga(0, 240).action === "Não participar", comFolga(0, 240));
diz("com 5% de folga, 240 entra", comFolga(5, 240).action === "Participar", comFolga(5, 240));
diz("e entra no preço do canal", comFolga(5, 240).newPrice === null, comFolga(5, 240));
/* Abaixo de 238,57 nem a folga salva. */
diz("238,00 fica de fora mesmo com 5%", comFolga(5, 238).action === "Não participar", comFolga(5, 238));
console.log(`${m} verificações da tolerância, todas certas.`);

/* ── 8. O desconto extra vale com o interruptor LIGADO ──
   Era um não-operação silencioso: este ramo devolvia antes de calcular o
   extra, e quem ligava o interruptor e pedia 10% recebia a planilha sem
   desconto nenhum e sem aviso. Achado em 21/10/2026, quando o Eduardo
   perguntou se a tolerância servia para reescrever preço. */
const comExtra = (extra, tol = 0) =>
  processItem("MLB1", "SK1", null, 379.05, 399, {
    ...base("piso"),
    regra: { modo: "tabela", margemMinima: 0, comoUsar: "piso", toleranciaPct: tol },
  }, "Participar", "Não participar", extra);

let k = 0;
const prende = (nome, cond, r) => { k++; assert.ok(cond, `${nome} — veio ${JSON.stringify(r)}`); };
/* Sem extra, nada é escrito: a proposta de 379,05 cobre o piso de 251,13. */
prende("sem extra, não escreve", comExtra(0).newPrice === null, comExtra(0));
/* Com 10% de extra, desce do piso: 251,13 × 0,90 = 226,02. */
prende("com 10% de extra, escreve 226,02", comExtra(0.1).newPrice === 226.02, comExtra(0.1));
/* E o extra parte do piso JÁ com a tolerância: 251,13 × 0,95 = 238,57, e 238,57 × 0,90 = 214,71. */
prende("a tolerância entra antes do extra", comExtra(0.1, 5).newPrice === 214.71, comExtra(0.1, 5));
console.log(`${k} verificações do desconto extra com o interruptor ligado, todas certas.`);
