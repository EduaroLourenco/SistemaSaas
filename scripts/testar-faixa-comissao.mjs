/** node scripts/testar-faixa-comissao.mjs — números do print da Central, PA51667, 23/11. */
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const f = await jiti.import("../src/lib/planilhas/faixa-comissao.ts");
const assert = (c, m) => { if (!c) { console.error("FALHOU:", m); process.exit(1); } };
// Fórmula base da Probel, vigência 30/09
const linha = { 0.045: 476.73, 0.055: 482.72, 0.065: 488.72, 0.075: 494.72, 0.085: 500.71, 0.095: 506.71, 0.105: 512.71, 0.115: 518.7 };
const rel = f.lerOferta(linha, 458.58, 442.54, 0.115);
assert(Math.abs(rel.efetiva - 0.035) < 0.0005 && rel.faixa === 0.045 && rel.tabela === 476.73 && rel.dentro, "relâmpago " + JSON.stringify(rel));
const r1 = f.lerOferta(linha, 481.06, 435.75, 0.115);
assert(r1.faixa === 0.105 && r1.minimo === 487.07 && r1.dentro === false, "redução 481,06 " + JSON.stringify(r1));
const r2 = f.lerOferta(linha, 465, 425.08, 0.115);
assert(r2.faixa === 0.095 && r2.minimo === 481.37 && r2.dentro === false, "redução 465 " + JSON.stringify(r2));
const so = f.lerOferta(linha, 500, null, 0.115);
assert(so.faixa === 0.115 && so.efetiva === null && so.recebe === 442.5 && so.dentro, "só preço " + JSON.stringify(so));
assert(f.faixaDaComissao(0.01) === 0.045 && f.faixaDaComissao(0.115) === 0.125 && f.faixaDaComissao(0.0942) === 0.105, "arredondamento");
console.log("ok: faixa de comissão confere com a Central");
