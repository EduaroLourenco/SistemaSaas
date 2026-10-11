/**
 * "Tabela como piso": a decisão é sobre a proposta do canal.
 *
 *   node --experimental-strip-types scripts/testar-piso-promocao.mjs
 *
 * O que este arquivo protege é a diferença entre as duas leituras do mesmo
 * número. Com `comoUsar: "alvo"` (o padrão, a Fórmula base do Mercado
 * Livre) o motor PROPÕE o preço da tabela. Com `comoUsar: "piso"` ele não
 * mexe no preço: compara o que o canal propôs com o mínimo.
 *
 * Trocar um pelo outro sem perceber foi o que fez o motor devolver
 * "participar em R$ 251,13" num skate publicado a R$ 399 com o canal
 * propondo R$ 379,05. É um caso real da Bom de Compras, e é o caso 1.
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

/* 1. O prejuízo que a regra nova evita, com os números reais do skate. */
const alvo = rodar("alvo", 379.05);
vale("como ALVO o motor propõe o piso", alvo.action === "Participar" && alvo.newPrice === PISO, alvo);
const piso = rodar("piso", 379.05);
vale("como PISO participa", piso.action === "Participar", piso);
/* Onde o preço é editável, a régua "preço mínimo" escreve o mínimo: é a
   maior exposição possível sem vender no prejuízo. */
vale("como PISO escreve o mínimo", piso.newPrice === PISO, piso);

/* 2. A proposta do canal não decide nada quando o preço é editável: o
      mínimo é escrito por cima, mais alto ou mais baixo que ela. */
const abaixo = rodar("piso", 250);
vale("proposta abaixo do piso vira o piso", abaixo.newPrice === PISO, abaixo);
vale("e participa", abaixo.action === "Participar", abaixo);

/* 3. Piso ACIMA do preço publicado: participar exigiria aumentar o preço,
      e promoção é desconto. Recusa, e não toca no preço. */
const caro = rodar("piso", 379.05, 200);
vale("piso acima do publicado recusa", caro.action === "Não participar", caro);
vale("e não escreve preço", caro.newPrice === null, caro);
vale("dizendo o porquê", /acima do preço publicado/.test(caro.pendencia), caro);

/* 4. SKU sem piso: pendência que diz o que falta, não "sem preço de tabela". */
const semPiso = processItem("MLB1", "OUTRO", null, 300, 399, base("piso"));
vale("SKU sem piso tem pendência própria", /sem piso cadastrado/.test(semPiso.pendencia), semPiso);

/* 5. Sem proposta do canal, o mínimo vale do mesmo jeito: a régua é
      nossa, não dele. */
const semProposta = rodar("piso", null);
vale("sem proposta, escreve o mínimo", semProposta.newPrice === PISO, semProposta);

/* 6. Com redução de tarifa (Caso A) o motor já validava a proposta e nunca
      mexeu no preço — a regra nova não pode ter mudado isso. */
const comReducao = rodar("piso", 300, 399, 10);
vale("Caso A segue sem escrever preço", comReducao.newPrice === null, comReducao);

console.log(`${n} verificações, todas certas.`);

/* ── 7. A tolerância é cadastro da empresa, e move o mínimo escrito ──
   db/36: com o preço editável, a folga não decide entrar ou não — ela
   decide QUAL número vai para a planilha. */
const comFolga = (pct) =>
  processItem("MLB1", "SK1", null, 379.05, 399, {
    ...base("piso"),
    regra: { modo: "tabela", margemMinima: 0, comoUsar: "piso", toleranciaPct: pct },
  });
let m = 0;
const diz = (nome, cond, r) => {
  m++;
  assert.ok(cond, `${nome} — veio ${JSON.stringify(r)}`);
};
diz("sem folga, escreve o piso cheio", comFolga(0).newPrice === PISO, comFolga(0));
// 251,13 × 0,95 = 238,57
diz("com 5% de folga, escreve 5% abaixo", comFolga(5).newPrice === 238.57, comFolga(5));
diz("e o campo do piso acompanha o escrito", comFolga(5).tabelaCalculada === comFolga(5).newPrice, comFolga(5));
console.log(`${m} verificações da tolerância, todas certas.`);
