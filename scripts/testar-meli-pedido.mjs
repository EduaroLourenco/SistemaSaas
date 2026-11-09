/** sale_fee do Meli é por unidade: o pedido tem que somar fee x quantidade. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
fs.writeFileSync("vazio.cjs", "");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(process.cwd(), "src"), "server-only": path.join(process.cwd(), "vazio.cjs") },
});
const { normalizarPedido } = await jiti.import(path.join(process.cwd(), "src/lib/meli/cliente.ts"));

const item = (q, fee) => ({ quantity: q, unit_price: 53.99, sale_fee: fee, item: { id: "MLB1" } });
const um = normalizarPedido({ id: 1, total_amount: 53.99, order_items: [item(1, 6.21)] });
const dois = normalizarPedido({ id: 2, total_amount: 107.98, order_items: [item(2, 6.21)] });
const misto = normalizarPedido({ id: 3, total_amount: 161.97, order_items: [item(1, 6.21), item(2, 6.21)] });
assert.equal(um.comissao, 6.21);
assert.equal(dois.comissao, 12.42);
assert.equal(misto.comissao, 18.63);
console.log("OK: comissão = sale_fee x quantidade");

const { liquidoDoPedido } = await jiti.import(path.join(process.cwd(), "src/lib/meli/cliente.ts"));
assert.equal(liquidoDoPedido({ total: 111.96, comissao: 12.88, fretePago: 6.85 }), 92.23);
assert.equal(liquidoDoPedido({ total: 50, comissao: null, fretePago: 6.85 }), null);
assert.equal(liquidoDoPedido({ total: 50, comissao: 5.75, fretePago: null }), null);
console.log("OK: recebido = total − tarifa − frete do vendedor, nulo se faltar parte");
