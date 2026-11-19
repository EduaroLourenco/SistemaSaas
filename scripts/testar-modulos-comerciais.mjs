/**
 * Regras do montador de módulos do site comercial.
 *
 * Roda: node scripts/testar-modulos-comerciais.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src") } });
const m = await jiti.import(path.join(raiz, "src/lib/comercial/modulos.ts"));

let r = m.adicionar(["vendas"], "queda");
assert.deepEqual(r.modulos, ["vendas", "anuncios", "queda"], "Por que caiu traz Anúncios");
assert.deepEqual(r.junto, ["anuncios"]);
r = m.adicionar(["vendas"], "promocoes");
assert.ok(r.modulos.includes("precos"), "Promoções traz um módulo de preço");
r = m.adicionar(["vendas", "custos"], "promocoes");
assert.deepEqual(r.junto, [], "Custos já atende Promoções");
assert.match(m.bloqueioParaRemover(["vendas", "promocoes", "precos"], "precos"), /Promoções/);
assert.equal(m.bloqueioParaRemover(["vendas", "promocoes", "precos", "custos"], "precos"), null);
assert.match(m.bloqueioParaRemover(["vendas"], "vendas"), /base/);
assert.match(m.bloqueioParaRemover(["vendas", "anuncios", "queda"], "anuncios"), /Por que caiu/);
assert.deepEqual(m.idsValidos(["custos", "x", "vendas"]), ["vendas", "custos"]);
assert.ok(m.sugestoes(["vendas", "custos"]).some((s) => s.para.id === "trafego"));
for (const p of m.PACOTES) assert.equal(p.modulos.filter((id) => m.moduloPorId(id).requer?.modulos.some((x) => !p.modulos.includes(x))).length, 0, `${p.nome} completo`);
console.log("ok");
