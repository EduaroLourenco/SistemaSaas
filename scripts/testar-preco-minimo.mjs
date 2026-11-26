/**
 * Leitura da tabela de preço mínimo (formato da Bom de Compras, nov/26).
 *
 * Uso: node scripts/gerar-lib.mjs && node scripts/testar-preco-minimo.mjs
 */
import { strict as assert } from "node:assert";
import { lerPrecoMinimo, numeroDaCelula } from "./lib/preco-minimo.mjs";

assert.equal(numeroDaCelula(59.9), 59.9);
assert.equal(numeroDaCelula("R$ 1.080,75"), 1080.75);
assert.equal(numeroDaCelula(" R$ - "), null);
assert.equal(numeroDaCelula(0), null);
assert.equal(numeroDaCelula({ result: 14.9 }), 14.9, "célula de fórmula do ExcelJS");

const abas = [
  { nome: "Promoção Black 26", linhas: [["Código", "Produto", "Custo", "Frete", "Meli - Classico", "Meli - Premium"], ["X", "", 1, 0, 999, 999]] },
  {
    nome: "Preço Mínimo",
    linhas: [
      ["Código", "Produto", "Custo", "Frete", "Meli - Classico", "Meli - Premium", "Shopee"],
      ["GP384", "Campainha", 9.009, 0, 18.9, 25.44],
      ["GP502\t", "Caneca 300ml", 5.04, 0, null, null],
      ["901045", "Caçarola N45", 135.009, null, null, null],
      ["901036", "Caçarola N36", 83.29, 40.85, 149, null],
      ["GP384", "repetido", 1, 1, 1, 1],
      [null, "Eduardo"],
      [null, "Ações: melhorar o anúncio"],
    ],
  },
];
const r = lerPrecoMinimo(abas);
assert.equal(r.aba, "Preço Mínimo", "a aba com o nome certo ganha da primeira");
assert.deepEqual(r.linhas, [
  { sku: "GP384", tipo: "classico", preco: 18.9 },
  { sku: "GP384", tipo: "premium", preco: 25.44 },
  { sku: "901036", tipo: "classico", preco: 149 },
]);
assert.equal(r.semPreco, 2);

assert.equal(r.destaques, null, "sem célula amarela, nada por cima");

/* O amarelo da aba Black vale por cima do mínimo — só a célula pintada. */
{
  const comBlack = [
    { ...abas[0], linhas: [abas[0].linhas[0], ["GP384", "Campainha", 9, 0, 14.9, 21]], amarelas: new Set(["1:4"]) },
    abas[1],
  ];
  const b = lerPrecoMinimo(comBlack);
  assert.deepEqual(b.destaques, { aba: "Promoção Black 26", precos: 1 });
  assert.deepEqual(b.linhas.filter((l) => l.sku === "GP384"), [
    { sku: "GP384", tipo: "classico", preco: 14.9 },
    { sku: "GP384", tipo: "premium", preco: 25.44 },
  ]);
}

/* Sem aba de nome conhecido, vale a primeira que tem o cabeçalho. */
assert.equal(lerPrecoMinimo([abas[0]]).aba, "Promoção Black 26");
assert.throws(() => lerPrecoMinimo([{ nome: "x", linhas: [["a", "b"]] }]), /Não achei a tabela/);

console.log("preço mínimo: ok");
