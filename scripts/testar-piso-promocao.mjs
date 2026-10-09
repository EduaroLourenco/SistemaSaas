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
vale("como PISO aceita a proposta do canal", piso.action === "Participar", piso);
vale("como PISO não escreve preço", piso.newPrice === null, piso);

/* 2. Proposta que fura o piso: recusa, e diz em reais o quanto. */
const fura = rodar("piso", 250);
vale("proposta abaixo do piso é recusada", fura.action === "Não participar", fura);
vale("a pendência diz os dois valores", /250,00/.test(fura.pendencia) && /251,13/.test(fura.pendencia), fura);
vale("recusar não mexe no preço", fura.newPrice === null, fura);

/* 3. Exatamente no piso entra — e um centavo de folga, porque o canal
      arredonda o preço final que calcula. */
vale("no piso, participa", rodar("piso", PISO).action === "Participar", rodar("piso", PISO));
vale("um centavo abaixo ainda participa", rodar("piso", PISO - 0.01).action === "Participar", rodar("piso", PISO - 0.01));
vale("dois centavos abaixo já recusa", rodar("piso", PISO - 0.02).action === "Não participar", rodar("piso", PISO - 0.02));

/* 4. SKU sem piso: pendência que diz o que falta, não "sem preço de tabela". */
const semPiso = processItem("MLB1", "OUTRO", null, 300, 399, base("piso"));
vale("SKU sem piso tem pendência própria", /sem piso cadastrado/.test(semPiso.pendencia), semPiso);

/* 5. Canal que não propôs preço: não há o que comparar. */
const semProposta = rodar("piso", null);
vale("sem preço final, recusa dizendo isso", /não propôs preço final/.test(semProposta.pendencia), semProposta);

/* 6. Com redução de tarifa (Caso A) o motor já validava a proposta e nunca
      mexeu no preço — a regra nova não pode ter mudado isso. */
const comReducao = rodar("piso", 300, 399, 10);
vale("Caso A segue sem escrever preço", comReducao.newPrice === null, comReducao);

console.log(`${n} verificações, todas certas.`);
