/** Preço por canal: faixa de tarifa, taxa fixa e marketing entram no preço. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

fs.writeFileSync("vazio.cjs", "");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(process.cwd(), "src"), "server-only": path.join(process.cwd(), "vazio.cjs") },
});
const { regraDoCanal, precoNoCanal, contaNoCanal, regraEfetiva, custoMeliEstimado } = await jiti.import(
  path.join(process.cwd(), "src/lib/precificacao/regras-canal.ts")
);

const custo = { mercadoria: 21, embalagem: 0.2, frete: 0, impostoPct: 0, marketingPct: 0 };

// Shopee, Kit 100: na faixa de até R$ 79,99 → (21,20 + 4,50) / (1 − 0,20 − 0,20) = 42,83
const shopee = regraDoCanal("shopee");
const p = precoNoCanal(shopee, custo, 20);
assert.deepEqual(p, { ok: true, preco: 42.83 });
const c = contaNoCanal(shopee, custo, 42.83);
assert.ok(Math.abs(c.margemPct - 20) < 0.02);
assert.equal(c.recebe, +(42.83 - 8.57 - 4.5).toFixed(2));

// Acima de R$ 79,99 troca de faixa: 14% + R$ 16
const caro = { ...custo, mercadoria: 60 };
const p2 = precoNoCanal(shopee, caro, 20);
assert.ok(p2.ok && p2.preco > 79.99);
assert.ok(Math.abs(contaNoCanal(shopee, caro, p2.preco).margemPct - 20) < 0.02);

// Marketing entra no preço como percentual
const meli = regraDoCanal("mercado_livre");
const comMk = precoNoCanal(meli, { ...custo, frete: 6.85, marketingPct: 14.5 }, 20);
assert.ok(Math.abs(contaNoCanal(meli, { ...custo, frete: 6.85, marketingPct: 14.5 }, comMk.preco).margemPct - 20) < 0.02);

// Margem impossível devolve motivo, não número
assert.equal(precoNoCanal(meli, custo, 95).ok, false);
// Tipo e comissão da categoria
const premium = regraEfetiva(meli, "premium");
assert.equal(premium.faixas[0].comissaoPct, 16.5);
assert.equal(regraEfetiva(meli, "classico", 13).faixas[0].comissaoPct, 13);

// Custo do Meli abaixo de R$ 79: os valores medidos nos pedidos da Imprimil
assert.deepEqual(custoMeliEstimado(27.99, 0.1, "coleta"), { frete: 6.85, taxaFixa: 0 });
assert.deepEqual(custoMeliEstimado(53.99, 0.1, "coleta"), { frete: 8.15, taxaFixa: 0 });
assert.deepEqual(custoMeliEstimado(27.99, 0.1, "flex"), { frete: 0, taxaFixa: 6.65 });
assert.equal(custoMeliEstimado(27.99, 1.2, "coleta"), null); // mais pesado: só a API sabe
assert.equal(custoMeliEstimado(89.9, 0.1, "coleta"), null); // acima de R$ 79: frete grátis do vendedor
console.log("OK: preço por canal fecha a margem em cada faixa de tarifa");
