/**
 * Quais migrações já foram aplicadas no banco?
 *
 * ── Por que isto existe ──
 *
 * `db/10_espelho_de_usuarios.sql` nunca foi rodado, e ninguém soube por
 * cinco semanas. O sintoma não apontava para lá: quem se cadastrava
 * confirmava o e-mail, entrava, e encontrava o sistema inteiro em branco —
 * sem erro, porque faltava a linha em `usuarios` e o RLS estava fazendo o
 * trabalho dele.
 *
 * O guia só lista os cinco primeiros scripts; do sexto em diante a ordem
 * vive na cabeça de quem rodou. E há dois arquivos com cada número de 06 a
 * 11, o que torna "pular um" fácil demais.
 *
 * ── Como ele descobre ──
 *
 * Sem tabela de controle de migração: ela também precisaria ter sido
 * criada, e o problema é justamente não saber o que foi criado. Em vez
 * disso ele lê cada arquivo, extrai o que aquele arquivo CRIA — tabelas e
 * funções —, e pergunta ao banco se existe.
 *
 * Tabela ausente responde 42P01 ou PGRST205; função ausente responde
 * PGRST202. Qualquer outra resposta quer dizer que o objeto está lá.
 *
 * ── O que ele não garante ──
 *
 * Que a migração rodou INTEIRA. Um script que parou no meio deixa os
 * primeiros objetos criados, e aqui isso conta como aplicado. Ele responde
 * "foi rodado?", não "terminou?".
 *
 * Uso:
 *   node scripts/conferir-migracoes.mjs
 */
import fs from "node:fs";
import path from "node:path";
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

const DB = path.join(RAIZ, "db");
const arquivos = fs
  .readdirSync(DB)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/**
 * O que cada arquivo cria, para servir de sonda.
 *
 * Nem toda função serve. Chamada por RPC sem argumento, o PostgREST
 * responde PGRST202 com a MESMA mensagem para "não existe" e para "existe,
 * mas pede parâmetro" — então função com parâmetro daria falso negativo.
 * Função de gatilho (`returns trigger`) nem é exposta por RPC, e daria o
 * mesmo. Só função sem argumento e que não seja de gatilho é sonda
 * confiável; o resto é contado como não-sondável, e isso é dito na saída
 * em vez de virar um "não aplicada" inventado.
 */
function sondas(sql) {
  const tabelas = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)]
    .map((m) => m[1].toLowerCase());

  const funcoes = [];
  const naoSondaveis = [];
  const re = /create\s+or\s+replace\s+function\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s*returns\s+([a-z ]+)/gi;
  for (const m of sql.matchAll(re)) {
    const nome = m[1].toLowerCase();
    const comParametro = m[2].trim().length > 0;
    const deGatilho = /\btrigger\b/i.test(m[3]);
    (comParametro || deGatilho ? naoSondaveis : funcoes).push(nome);
  }

  return {
    tabelas: [...new Set(tabelas)],
    funcoes: [...new Set(funcoes)],
    naoSondaveis: [...new Set(naoSondaveis)],
  };
}

const existeTabela = async (t) => {
  const { error } = await sb.from(t).select("*", { count: "exact", head: true });
  /* 42P01 = relação inexistente; PGRST205 = fora do cache de schema. */
  return !(error?.code === "42P01" || error?.code === "PGRST205");
};
const existeFuncao = async (f) => {
  const { error } = await sb.rpc(f);
  return error?.code !== "PGRST202";
};

console.log(`CONFERINDO ${arquivos.length} MIGRAÇÕES\n`);

const faltando = [];
const semSonda = [];

for (const arq of arquivos) {
  const sql = fs.readFileSync(path.join(DB, arq), "utf8");
  const { tabelas, funcoes, naoSondaveis } = sondas(sql);

  if (!tabelas.length && !funcoes.length) {
    semSonda.push(arq);
    const porque = naoSondaveis.length
      ? `só função com parâmetro ou de gatilho (${naoSondaveis.slice(0, 3).join(", ")})`
      : "só insert/alter/policy";
    console.log(`  ?  ${arq.padEnd(38)} não dá para sondar — ${porque}`);
    continue;
  }

  const ausentes = [];
  for (const t of tabelas) if (!(await existeTabela(t))) ausentes.push("tabela " + t);
  for (const f of funcoes) if (!(await existeFuncao(f))) ausentes.push("função " + f);

  const total = tabelas.length + funcoes.length;
  const ressalva = naoSondaveis.length ? `  (+${naoSondaveis.length} n\u00e3o sond\u00e1vel)` : "";
  if (ausentes.length === 0) {
    console.log(`  \u2713  ${arq.padEnd(38)} ${total} objeto(s) no lugar${ressalva}`);
  } else if (ausentes.length === total) {
    faltando.push(arq);
    console.log(`  \u2717  ${arq.padEnd(38)} NÃO APLICADA — falta tudo (${ausentes.slice(0, 3).join(", ")}${total > 3 ? "…" : ""})`);
  } else {
    faltando.push(arq);
    console.log(`  !  ${arq.padEnd(38)} PELA METADE — falta ${ausentes.length} de ${total}: ${ausentes.slice(0, 4).join(", ")}`);
  }
}

console.log("");
if (faltando.length) {
  console.log(`\u2717 ${faltando.length} migração(ões) para rodar, nesta ordem:\n`);
  for (const f of faltando) console.log(`     db/${f}`);
  console.log("\n  Cole o conteúdo de cada uma no SQL Editor do Supabase e rode.");
} else {
  console.log("\u2713 todas as migrações com objeto para sondar estão aplicadas");
}
if (semSonda.length) {
  console.log(`\n  (${semSonda.length} arquivo(s) sem objeto para sondar — confira à mão se há dúvida: ${semSonda.join(", ")})`);
}

process.exit(faltando.length ? 1 : 0);
