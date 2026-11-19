/**
 * Agrupamento do Separador de Envios.
 *
 * Roda: node scripts/testar-separador.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src") } });
const { entraNaSeparacao, montarSeparacao } = await jiti.import(path.join(raiz, "src/lib/envios/separacao.ts"));

const envio = (pedido, venda, sku, quantidade, dias, extra = {}) => ({
  conta: "SP", contaId: "c1", pedido, venda, dias, situacao: "Pronto", substatus: "ready_to_print", compra: "", limite: null,
  origem: "canal", comprador: null, total: 0, itens: [{ titulo: `Produto ${sku}`, sku, quantidade }], ...extra,
});

const s = montarSeparacao([
  envio(1, 1, "A", 1, 0),
  envio(2, 2, "A", 1, -1),
  envio(3, 3, "a ", 2, 0),
  envio(4, 9, "A", 1, 1, { envio: 40 }),
  envio(5, 9, "B", 1, 0, { envio: 41 }),
]);

assert.equal(s.unidades, 6);
assert.equal(s.pedidos, 4, "pedidos do mesmo pacote viram uma montagem");
assert.deepEqual(s.produtos.map((p) => [p.sku, p.unidades]), [["A", 5], ["B", 1]]);
assert.equal(s.grupos[0].pedidos.length, 2, "pedidos iguais ficam juntos");
assert.equal(s.grupos[0].pedidos[0].venda, 2, "o atrasado vem primeiro");
assert.equal(s.grupos.find((g) => g.itens.length === 2).pedidos[0].dias, 0, "o pacote assume o prazo mais curto");
assert.deepEqual(s.grupos.find((g) => g.itens.length === 2).pedidos[0].envios, [40, 41], "o pacote leva os envios para a etiqueta");

assert.equal(entraNaSeparacao(envio(6, 6, "A", 1, 0), "hoje"), true);
assert.equal(entraNaSeparacao(envio(7, 7, "A", 1, 1), "hoje"), false);
assert.equal(entraNaSeparacao(envio(8, 8, "A", 1, 1), "amanha"), true);
assert.equal(entraNaSeparacao(envio(9, 9, "A", 1, null), "amanha"), false);
assert.equal(entraNaSeparacao(envio(10, 10, "A", 1, null), "todos"), true);
assert.equal(entraNaSeparacao(envio(11, 11, "A", 1, 0, { substatus: "in_warehouse" }), "todos"), false);
assert.equal(entraNaSeparacao(envio(12, 12, "A", 1, 0, { saiu: true }), "todos"), false);
console.log("ok");
