/**
 * Confere a regra de margem do motor de promoções.
 *   node scripts/conferir-regra-margem.mjs
 */
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": new URL("../src", import.meta.url).pathname.replace(/^\/(\w:)/, "$1") } });
const m = await jiti.import("../src/lib/planilhas/motor-promocoes.ts");
const assert = (c, msg) => { if (!c) { console.error("FALHOU:", msg); process.exit(1); } };

const custos = new Map([["SKU1", { mercadoria: 500, embalagem: 20, frete: 80, impostoPct: 10 }]]);
const base = { baseMlb: new Map(), precosSKU: new Map([["SKU1", { 0.115: 900 }]]), precosMLB: new Map(), custos };

// 600 de custo, comissão 11,5% + imposto 10% + margem 8% → 600/0,705 = 851,06; ÷ 0,95 = 895,85
const margem = m.precoDaMargem({ ...base, regra: { modo: "margem", margemMinima: 8 } }, "sku1", 0.115);
assert(Math.abs(margem - 895.85) < 0.01, `preço da margem ${margem}`);
// Aceitar no piso (tabela × 0,95) devolve exatamente a margem pedida.
const piso = margem * 0.95, liquido = piso * (1 - 0.115 - 0.10) - 600;
assert(Math.abs(liquido / piso - 0.08) < 0.001, `margem no piso ${liquido / piso}`);

assert(m.getPrecoTabela({ ...base, regra: { modo: "tabela", margemMinima: 8 } }, "SKU1", "", 0.115) === 900, "tabela");
assert(m.getPrecoTabela({ ...base, regra: { modo: "maior", margemMinima: 8 } }, "SKU1", "", 0.115) === 900, "maior = tabela");
assert(m.getPrecoTabela({ ...base, regra: { modo: "maior", margemMinima: 15 } }, "SKU1", "", 0.115) > 900, "maior = margem");
assert(m.getPrecoTabela({ ...base, regra: { modo: "margem", margemMinima: 8 } }, "OUTRO", "", 0.115) === null, "sem custo");
assert(m.getPrecoTabela({ ...base, regra: { modo: "maior", margemMinima: 8 } }, "OUTRO", "", 0.115) === null, "sem custo e sem tabela");
console.log("ok: regra de margem confere");
