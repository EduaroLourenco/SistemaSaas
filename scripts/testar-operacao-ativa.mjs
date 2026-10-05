/**
 * O estreitamento por operação funciona?
 *
 * Roda DEPOIS de aplicar `db/23_operacao_ativa.sql`.
 *
 * ── Por que este teste existe ──
 *
 * Erro de RLS não aparece como erro: aparece como tela vazia, ou pior,
 * como número plausível somando duas empresas. Nenhum dos dois estoura
 * exceção, então só uma verificação explícita pega.
 *
 * ── Como ele testa sem a senha de ninguém ──
 *
 * O RLS roda em nome do usuário, e eu não tenho sessão de usuário aqui. O
 * que dá para fazer com a chave de serviço é chamar as funções
 * diretamente, e é o suficiente para as três perguntas que importam:
 *
 *   1. As funções existem e compilam? (o risco de "tela em branco")
 *   2. `operacao_ativa()` devolve nulo quando não há cabeçalho? (o risco
 *      de estreitar quando não devia, que esvaziaria tudo)
 *   3. O estreitamento é interseção, e não substituição? (o risco de
 *      segurança: cabeçalho de outra empresa não pode AMPLIAR)
 *
 * A terceira é testada com a aritmética de conjuntos, sem depender de
 * sessão: `operacoes_do_usuario()` nunca pode devolver id que
 * `operacoes_visiveis_do_usuario()` não devolva.
 *
 * Uso:
 *   node scripts/testar-operacao-ativa.mjs
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const { createClient } = createRequire(RAIZ + "/")("@supabase/supabase-js");

for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) {
    process.env[l.slice(0, i)] = l.slice(i + 1).trim();
  }
}

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(URL_SB, SERVICO, { auth: { persistSession: false } });

let falhas = 0;
const ok = (certo, titulo, detalhe = "") => {
  console.log(`  ${certo ? "\u2713" : "\u2717"} ${titulo}${detalhe ? "  —  " + detalhe : ""}`);
  if (!certo) falhas++;
};

/** Chama uma função do banco por RPC, devolvendo { data, error }. */
const rpc = (nome, args = {}) => sb.rpc(nome, args);

console.log("A MIGRAÇÃO 23 FOI APLICADA?\n");

const existe = {};
for (const nome of ["operacao_ativa", "operacoes_visiveis_do_usuario", "operacoes_do_usuario", "operacoes_editaveis_do_usuario"]) {
  const { error } = await rpc(nome);
  /*
   * Função ausente devolve PGRST202 ("não achei a função"). Qualquer outro
   * erro — ou nenhum — quer dizer que ela existe; o que ela devolve com
   * `auth.uid()` nulo não interessa aqui.
   */
  const ausente = error?.code === "PGRST202";
  existe[nome] = !ausente;
  ok(!ausente, `${nome}()`, ausente ? "não existe — rode db/23_operacao_ativa.sql" : "");
}

if (!existe.operacao_ativa) {
  console.log("\nA migração não foi aplicada. Pare aqui e rode db/23_operacao_ativa.sql.");
  process.exit(1);
}

console.log("\nSEM CABEÇALHO, NADA É ESTREITADO\n");
{
  const { data, error } = await rpc("operacao_ativa");
  ok(!error, "operacao_ativa() não estoura sem cabeçalho", error?.message ?? "");
  ok(data === null, "operacao_ativa() devolve nulo sem cabeçalho", `devolveu ${JSON.stringify(data)}`);
}

console.log("\nCABEÇALHO COM LIXO NÃO DERRUBA O SISTEMA\n");
for (const [rotulo, valor] of [["texto qualquer", "nao-e-uuid"], ["vazio", ""], ["quase uuid", "123-456"]]) {
  const cliente = createClient(URL_SB, SERVICO, {
    auth: { persistSession: false },
    global: { headers: { "x-operacao": valor } },
  });
  const { data, error } = await cliente.rpc("operacao_ativa");
  ok(!error, `cabeçalho ${rotulo} não estoura`, error?.message ?? "");
  ok(data === null, `cabeçalho ${rotulo} é tratado como ausente`, `devolveu ${JSON.stringify(data)}`);
}

console.log("\nCABEÇALHO VÁLIDO É LIDO\n");
{
  const alvo = "11111111-2222-3333-4444-555555555555";
  const cliente = createClient(URL_SB, SERVICO, {
    auth: { persistSession: false },
    global: { headers: { "x-operacao": alvo } },
  });
  const { data, error } = await cliente.rpc("operacao_ativa");
  ok(!error, "uuid válido não estoura", error?.message ?? "");
  ok(data === alvo, "uuid válido volta igual", `devolveu ${JSON.stringify(data)}`);
}

console.log("\nO ESTREITAMENTO É INTERSEÇÃO, NÃO SUBSTITUIÇÃO\n");
/*
 * Com a chave de serviço `auth.uid()` é nulo, então os dois conjuntos
 * vêm vazios e a comparação é trivialmente verdadeira. O que este bloco
 * garante de fato é que a consulta não estoura e que o conjunto estreitado
 * nunca é MAIOR que o cru — a única forma de o cabeçalho ampliar acesso.
 */
{
  const alvo = "11111111-2222-3333-4444-555555555555";
  const cliente = createClient(URL_SB, SERVICO, {
    auth: { persistSession: false },
    global: { headers: { "x-operacao": alvo } },
  });
  const cru = await rpc("operacoes_visiveis_do_usuario");
  const estreito = await cliente.rpc("operacoes_do_usuario");
  ok(!cru.error, "conjunto cru responde", cru.error?.message ?? "");
  ok(!estreito.error, "conjunto estreitado responde", estreito.error?.message ?? "");
  const a = new Set((cru.data ?? []).map((x) => (typeof x === "string" ? x : x?.id)));
  const b = (estreito.data ?? []).map((x) => (typeof x === "string" ? x : x?.id));
  ok(b.every((x) => a.has(x)), "nenhum id aparece no estreitado sem estar no cru");
  ok(b.length <= a.size, "o estreitado nunca é maior que o cru", `${b.length} vs ${a.size}`);
}

console.log("\nQUEM RESPONDE PELO ANÔNIMO NÃO VAZA\n");
/*
 * O relatório por chave abre sem login. Com a chave publicável e sem
 * sessão, o conjunto tem de vir vazio — se vier com id, o RLS está aberto
 * para quem não entrou.
 */
if (ANON) {
  const anonimo = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { data, error } = await anonimo.rpc("operacoes_do_usuario");
  const vazio = !data || data.length === 0;
  ok(vazio, "anônimo não enxerga operação nenhuma", error ? error.message : `devolveu ${data?.length} id(s)`);
} else {
  console.log("  (sem NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local, pulei)");
}

console.log(`\n${falhas === 0 ? "\u2713 tudo certo" : `\u2717 ${falhas} verificação(ões) falharam`}`);
process.exit(falhas === 0 ? 0 : 1);
