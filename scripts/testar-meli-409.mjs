/**
 * Falta de capacidade do Meli (409) repete a leitura; outro 409 não.
 *
 * Roda: node scripts/testar-meli-409.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": path.join(raiz, "node_modules/server-only/empty.js") },
  interopDefault: true,
});
const { meliGet } = await jiti.import(path.join(raiz, "src/lib/meli/cliente.ts"));

const conta = "00000000-0000-4000-8000-000000000000";
globalThis.__meliToken = { [conta]: { valor: "teste", expiraEm: Date.now() + 3_600_000 } };
const caminho = "/questions/search";
const cheio = () => new Response('{"error":"internal_capacity_conflict"}', { status: 409 });

let chamadas = 0;
globalThis.fetch = async () => (++chamadas === 1 ? cheio() : Response.json({ ok: true }));
assert.deepEqual(await meliGet(caminho, conta), { ok: true });
assert.equal(chamadas, 2, "repete depois do 409 de capacidade");

chamadas = 0;
globalThis.fetch = async () => (chamadas++, new Response('{"error":"conflict"}', { status: 409 }));
await assert.rejects(meliGet(caminho, conta), /HTTP 409/);
assert.equal(chamadas, 1, "outro 409 não repete");
console.log("ok");
process.exit(0);
