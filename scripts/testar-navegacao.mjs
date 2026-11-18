/**
 * O menu não pode apontar para tela inexistente nem acender dois itens.
 *
 * Roda: node scripts/testar-navegacao.mjs
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { NAV, NAV_FOOTER, AREAS, MOBILE_TABS } = await jiti.import(path.join(raiz, "src/lib/nav.ts"));

const itens = NAV.flatMap((g) => (g.href ? [g] : g.items));
const rotasDe = (i) => i.rotas ?? [i.href];
const noMenu = [...itens.flatMap(rotasDe), ...NAV_FOOTER.map((g) => g.href), ...MOBILE_TABS.map((t) => t.href), ...AREAS.flatMap((a) => a.items.map((i) => i.href))];

for (const href of new Set(noMenu)) {
  assert.ok(existsSync(path.join(raiz, "src/app", href, "page.tsx")), `sem tela: ${href}`);
}
const principais = itens.flatMap(rotasDe);
assert.equal(new Set(principais).size, principais.length, "rota em dois itens do menu");
for (const a of AREAS) for (const i of a.items) assert.ok(principais.includes(i.href) || a.label === "Lógica e histórico", `fora do menu: ${i.href}`);
assert.deepEqual(NAV.slice(0, 3).map((g) => g.label), ["Hoje", "Envios", "Tráfego pago"]);
assert.equal(MOBILE_TABS.length, 4, "a quinta posição é Mais");
console.log("ok");
