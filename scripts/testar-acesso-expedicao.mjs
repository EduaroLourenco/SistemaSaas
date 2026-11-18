/**
 * O perfil Expedição só alcança Envios; os outros perfis seguem como estão.
 *
 * Roda: node scripts/testar-acesso-expedicao.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src") }, interopDefault: true });
const { NextRequest, NextResponse } = await jiti.import("next/server");
const { barrarForaDaExpedicao: barrar } = await jiti.import(path.join(raiz, "src/lib/acesso-expedicao-proxy.ts"));

const OP = "11111111-1111-4111-8111-111111111111";
let usuario = 0;
async function pedir(caminho, resultado, cookies = `operacao=${OP}`) {
  const req = new NextRequest(`https://app.test${caminho}`, { headers: { cookie: cookies } });
  const resposta = NextResponse.next();
  const b = await barrar(req, { rpc: async () => resultado }, `u${++usuario}`, resposta);
  return { b, resposta };
}
const sim = { data: true, error: null };
const nao = { data: false, error: null };

for (const c of ["/mercado-livre/envios", "/api/envios/etiquetas", "/api/atualizar", "/api/operacao", "/api/sair"]) {
  const { b, resposta } = await pedir(c, sim);
  assert.equal(b, null, c);
  assert.equal(resposta.cookies.get("gerizo_expedicao")?.value, "1", c);
}

const tela = (await pedir("/financeiro", sim)).b;
assert.equal(tela.status, 307);
assert.equal(new URL(tela.headers.get("location")).pathname, "/mercado-livre/envios");
assert.equal((await pedir("/mercado-livre/envios-falso", sim)).b.status, 307, "prefixo parecido não abre");
assert.equal((await pedir("/api/vendas", sim)).b.status, 403);
assert.equal((await pedir("/api/conversa", sim)).b.status, 403);

assert.equal((await pedir("/financeiro", nao)).b, null, "perfil comum continua igual");
assert.match((await pedir("/financeiro", nao, "gerizo_expedicao=1")).resposta.headers.get("set-cookie") ?? "", /gerizo_expedicao=;/);
assert.equal((await pedir("/financeiro", { data: null, error: { code: "PGRST202", message: "sem função" } })).b, null, "antes da migração");
assert.equal((await pedir("/financeiro", { data: null, error: { code: "57014", message: "tempo" } })).b.status, 503, "sem resposta não libera");
console.log("ok");
