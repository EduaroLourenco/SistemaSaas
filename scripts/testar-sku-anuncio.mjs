/**
 * De onde sai o SKU de um anúncio do Mercado Livre.
 *
 * O canal guarda o código do vendedor em dois lugares e nem sempre nos
 * dois: `seller_custom_field` é o campo antigo, e anúncio criado pelas
 * telas novas grava só no atributo `SELLER_SKU`. Ler só o antigo deixou
 * 16 dos 59 anúncios da Imprimil sem SKU no sistema — e sem SKU o anúncio
 * não casa com a tabela de preço mínimo nem com o custo.
 *
 * Este teste trava a regra: o campo antigo manda quando existe, o atributo
 * cobre quando não existe, e espaço em branco não vira SKU.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const vazio = path.join(mkdtempSync(path.join(tmpdir(), "gerizo-")), "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { skuDoItem } = await jiti.import(path.join(raiz, "src/lib/meli/cliente.ts"));

const atributo = (valor) => [{ id: "BRAND", value_name: "Imprimil" }, { id: "SELLER_SKU", value_name: valor }];

/* O campo antigo, quando existe, continua mandando. */
assert.equal(skuDoItem({ seller_custom_field: "TPIMCPCAOPOA501" }), "TPIMCPCAOPOA501");
assert.equal(
  skuDoItem({ seller_custom_field: "TPIMCPCAOPOA501", attributes: atributo("OUTRO") }),
  "TPIMCPCAOPOA501",
  "Com os dois preenchidos vale o campo antigo, que é o que o canal usa no pedido"
);

/* O caso que estava quebrado: só o atributo. */
assert.equal(skuDoItem({ seller_custom_field: null, attributes: atributo("MOLCOPA04") }), "MOLCOPA04");
assert.equal(skuDoItem({ attributes: atributo("MOL-FLORAL-04") }), "MOL-FLORAL-04");

/* Espaço em branco não é SKU, nos dois lugares. */
assert.equal(skuDoItem({ seller_custom_field: "   ", attributes: atributo("MOLCOPA01") }), "MOLCOPA01",
  "Campo antigo em branco cede a vez ao atributo");
assert.equal(skuDoItem({ seller_custom_field: "  ", attributes: atributo("  ") }), null);
assert.equal(skuDoItem({ seller_custom_field: " TPIM ", attributes: [] }), "TPIM", "Apara espaço nas pontas");

/* Sem nada, é null — nunca string vazia, que viraria um SKU fantasma. */
assert.equal(skuDoItem({}), null);
assert.equal(skuDoItem({ seller_custom_field: null, attributes: [] }), null);
assert.equal(skuDoItem({ attributes: [{ id: "BRAND", value_name: "Imprimil" }] }), null,
  "Outro atributo não vira SKU");

console.log("OK: campo antigo tem precedência, atributo SELLER_SKU cobre a falta, branco vira null.");
