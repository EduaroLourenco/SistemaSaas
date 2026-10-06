/**
 * Uma empresa criada hoje consegue importar e lançar?
 *
 * Roda DEPOIS de aplicar `db/25_empresa_nova_nasce_usavel.sql`.
 *
 * ── O que ele prova ──
 *
 * Que as funções de partida existem, que enchem canal e categoria, e que
 * rodar de novo não duplica. O teste cria uma operação descartável, semeia,
 * confere, semeia outra vez e confere de novo — e apaga tudo no fim.
 *
 * ── Por que não testa `criar_organizacao()` ──
 *
 * Ela depende de `auth.uid()`, e aqui a conexão é por chave de serviço, sem
 * usuário. O que dá para provar é o miolo: se `semear_canais` e
 * `semear_categorias_financeiras` fazem o que prometem, o que falta é a
 * chamada dentro da função — e essa é uma linha visível no arquivo.
 *
 * O caminho inteiro só é provado criando uma empresa pela tela `/comecar`.
 *
 * Uso:
 *   node scripts/testar-empresa-nova.mjs
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
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

let falhas = 0;
const ok = (certo, titulo, detalhe = "") => {
  console.log(`  ${certo ? "\u2713" : "\u2717"} ${titulo}${detalhe ? "  —  " + detalhe : ""}`);
  if (!certo) falhas++;
};

console.log("AS FUNÇÕES DE PARTIDA EXISTEM?\n");
for (const nome of ["semear_canais", "semear_categorias_financeiras"]) {
  const { error } = await sb.rpc(nome, { p_operacao: "00000000-0000-0000-0000-000000000000" });
  const ausente = error?.code === "PGRST202";
  ok(!ausente, `${nome}()`, ausente ? "rode db/25_empresa_nova_nasce_usavel.sql" : "");
  if (ausente) {
    console.log("\nA migração 25 não foi aplicada. Pare aqui.");
    process.exit(1);
  }
}

/* ── A empresa descartável ── */
const marca = "TESTE semear " + new Date().toISOString();
let orgId = null;
let opId = null;
try {
  const { data: org, error: eo } = await sb
    .from("organizacoes")
    .insert({ nome: marca, slug: "teste-semear-" + Date.now() })
    .select("id")
    .single();
  if (eo) throw new Error("não consegui criar a organização de teste: " + eo.message);
  orgId = org.id;

  const { data: op, error: eop } = await sb
    .from("operacoes")
    .insert({ organizacao_id: orgId, nome: "Operação de teste", slug: "teste" })
    .select("id")
    .single();
  if (eop) throw new Error("não consegui criar a operação de teste: " + eop.message);
  opId = op.id;

  console.log("\nANTES DE SEMEAR, A OPERAÇÃO ESTÁ VAZIA\n");
  const vazio = async (t) => {
    const { count } = await sb.from(t).select("*", { count: "exact", head: true }).eq("operacao_id", opId);
    return count ?? 0;
  };
  ok((await vazio("canais")) === 0, "nenhum canal");
  ok((await vazio("categorias_financeiras")) === 0, "nenhuma categoria");

  console.log("\nDEPOIS DE SEMEAR\n");
  const s1 = await sb.rpc("semear_canais", { p_operacao: opId });
  const s2 = await sb.rpc("semear_categorias_financeiras", { p_operacao: opId });
  ok(!s1.error, "semear_canais rodou", s1.error?.message ?? "");
  ok(!s2.error, "semear_categorias_financeiras rodou", s2.error?.message ?? "");

  const { data: canais } = await sb
    .from("canais")
    .select("codigo,apelidos")
    .eq("operacao_id", opId)
    .order("ordem");
  const { count: nCat } = await sb
    .from("categorias_financeiras")
    .select("*", { count: "exact", head: true })
    .eq("operacao_id", opId);

  ok((canais ?? []).length === 8, "8 canais", `vieram ${(canais ?? []).length}`);
  ok(nCat === 15, "15 categorias", `vieram ${nCat}`);

  const codigos = new Set((canais ?? []).map((c) => c.codigo));
  for (const esperado of ["mercado_livre", "shopee", "vtex"]) {
    ok(codigos.has(esperado), `canal ${esperado} existe`);
  }

  /*
   * O apelido é o que faz a importação casar a planilha com o canal. Canal
   * sem apelido bloqueia o arquivo com uma mensagem que fala de apelido e
   * não de canal — o motivo de semear os dois juntos.
   */
  const ml = (canais ?? []).find((c) => c.codigo === "mercado_livre");
  ok((ml?.apelidos ?? []).includes("mercado livre"), "mercado_livre tem apelido", JSON.stringify(ml?.apelidos ?? []));

  console.log("\nSEMEAR DE NOVO NÃO DUPLICA\n");
  await sb.rpc("semear_canais", { p_operacao: opId });
  await sb.rpc("semear_categorias_financeiras", { p_operacao: opId });
  const { count: n2 } = await sb.from("canais").select("*", { count: "exact", head: true }).eq("operacao_id", opId);
  const { count: n3 } = await sb
    .from("categorias_financeiras")
    .select("*", { count: "exact", head: true })
    .eq("operacao_id", opId);
  ok(n2 === 8, "continua com 8 canais", `ficaram ${n2}`);
  ok(n3 === 15, "continua com 15 categorias", `ficaram ${n3}`);
} catch (e) {
  ok(false, "o teste não chegou ao fim", e instanceof Error ? e.message : String(e));
} finally {
  /* A organização em cascata leva operação, canais e categorias junto. */
  if (orgId) {
    const { error } = await sb.from("organizacoes").delete().eq("id", orgId);
    console.log(
      error
        ? `\n\u2717 NÃO consegui apagar a organização de teste ${orgId} — apague à mão: ${error.message}`
        : "\n(organização de teste apagada)"
    );
  }
}

console.log(`\n${falhas === 0 ? "\u2713 tudo certo" : `\u2717 ${falhas} verificação(ões) falharam`}`);
process.exit(falhas === 0 ? 0 : 1);
