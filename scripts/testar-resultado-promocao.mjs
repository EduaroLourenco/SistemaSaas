/**
 * Resultado estimado de um anúncio em promoção.
 *
 * Roda: node scripts/testar-resultado-promocao.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src") } });
const { resultadoEstimado } = await jiti.import(path.join(raiz, "src/lib/planilhas/piso-promocao.ts"));

const garrafa = { comissaoCheia: 0.165, meliPct: 0.1, custos: { custo: 123.66, embalagem: 0.1, impostoPct: 16, frete: 27.05 } };
const caneca = { comissaoCheia: 0.115, meliPct: 0.4, custos: { custo: 120.96, embalagem: 0.1, impostoPct: 16, frete: 65.85 } };

assert.equal(resultadoEstimado(garrafa, 233.4), 6.97);
assert.equal(resultadoEstimado(caneca, 224.48), -23.26);
assert.equal(resultadoEstimado({ ...garrafa, custos: null }, 233.4), null);
assert.equal(resultadoEstimado(garrafa, null), null);
console.log("ok");
