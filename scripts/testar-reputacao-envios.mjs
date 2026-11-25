/** Termômetro do Meli: cor pela tabela oficial, base recuperada, folga e previsão. */
import assert from "node:assert/strict";
import path from "node:path";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const jiti = createJiti(import.meta.url, { alias: { "@": path.join(process.cwd(), "src") } });
const R = await jiti.import(path.join(process.cwd(), "src/lib/envios/reputacao.ts"));

// Leitura real da conta SP em 25/11/2026: 8 atrasos a 2,2% → base 364.
const sp = R.lerReputacao({ level_id: "5_green", metrics: { sales: { period: "60 days", completed: 530 }, claims: { rate: 0.0051, value: 3 }, delayed_handling_time: { rate: 0.022, value: 8 }, cancellations: { rate: 0, value: 0 } } });
assert.equal(sp.periodo, 60);
assert.equal(sp.atrasos.base, 364);
assert.equal(sp.cancelamentos.base, 530);
assert.equal(R.corAtual(sp), "verde");
// Até 10% é verde: (8+k)/(364+k) ≤ 0,10 → k ≤ 31.
assert.equal(R.folga("atrasos", sp.atrasos, 60), 31);
assert.equal(R.cor("atrasos", 10, 60), "verde");
assert.equal(R.cor("atrasos", 10.01, 60), "amarelo");
assert.equal(R.cor("atrasos", 13, 365), "verde");

const p = R.prever(sp, { abertosME: 40, atrasadosME: 40, abertosProprio: 0, atrasadosProprio: 0 });
assert.equal(p.atrasos.valor, 48);
assert.equal(p.corEnvios, "amarelo"); // 48/404 = 11,9%

// Protegida: a API zera a taxa e guarda a real em excluded.
const pz = R.lerReputacao({ level_id: "4_light_green", real_level: "orange", metrics: { sales: { period: "365 days", completed: 751 }, claims: { rate: 0, value: 0, excluded: { real_value: 47, real_rate: 0.0543 } } } });
assert.equal(pz.periodo, 365);
assert.equal(pz.reclamacoes.valor, 47);
assert.equal(R.corAtual(pz), "laranja");
const pp = R.prever(pz, { abertosME: 0, atrasadosME: 0, abertosProprio: 20, atrasadosProprio: 5 });
assert.equal(pp.reclamacoes.valor, 52);

assert.equal(R.atrasado({ dias: -1 }, undefined), true);
assert.equal(R.atrasado({ dias: -1 }, "despachado"), false);
assert.equal(R.atrasado({ dias: 3 }, "producao_atrasada"), true);
console.log("OK: termômetro e previsão");
