// Testa a regra de participação e medição de promoções (src/lib/promocoes/participacao.ts).
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";
const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const m = await jiti.import(path.join(raiz, "src/lib/promocoes/participacao.ts"));

// Fuso: 23h UTC de 31/10 ainda é 31/10 em São Paulo; 03h UTC de 01/11 é 01/11.
assert.equal(m.diaSP("2026-10-31T23:00:00+00:00"), "2026-10-31");
assert.equal(m.diaSP("2026-11-01T03:00:00+00:00"), "2026-11-01");
assert.equal(m.diaSP(null), null);

// No ar pelas datas, não pelo status.
assert.equal(m.noAr({ inicio: "2026-11-01", fim: "2026-11-10" }, "2026-11-10"), true);
assert.equal(m.noAr({ inicio: "2026-11-01", fim: "2026-11-10" }, "2026-11-11"), false);
assert.equal(m.noAr({ inicio: "2026-11-01", fim: null }, "2027-01-01"), true);

// Venda diária fictícia: A dobra depois de entrar em 01/11; B entra em 05/11 e fica igual; C (controle) é estável.
const venda = (id, dia) => {
  if (id === "C") return 10;
  if (id === "A") return dia >= "2026-11-01" ? 20 : 10;
  if (id === "B") return 10;
  return 0;
};
const somar = (ids, de, ate) => { let t = 0; for (let d = de; d <= ate; d = m.somarDias(d, 1)) for (const id of ids) t += venda(id, d); return t; };
const r = m.medirEntradas({
  entradas: [{ anuncioId: "A", inicio: "2026-11-01", fim: null }, { anuncioId: "B", inicio: "2026-11-05", fim: null }, { anuncioId: "D", inicio: "2026-11-20", fim: null }],
  controle: ["C"], somar, hoje: "2026-11-22",
});
assert.equal(r.medidas, 2);
assert.equal(r.cedo, 1, "entrada de 20/11 tem só 2 dias completos");
assert.equal(r.dias, 14);
assert.equal(r.desde, "2026-11-01");
// Cada um com sua janela: A 140→280, B 140→140 → 280→420 = +50%; controle estável → efeito +50 p.p.
assert.equal(r.crescimento, 50);
assert.equal(r.crescimentoControle, 0);
assert.equal(r.efeito, 50);
assert.deepEqual(r.controle, { antes: 140, agora: 140 }, "controle de uma janela típica");

// A janela termina no fim da promoção.
const curta = m.medirEntradas({ entradas: [{ anuncioId: "A", inicio: "2026-11-01", fim: "2026-11-08" }], controle: [], somar, hoje: "2026-11-22" });
assert.equal(curta.dias, 8);
assert.equal(curta.efeito, null, "sem controle não há efeito");

console.log("participação de promoção: ok");
