/**
 * Confere o raio-x de um SKU contra o banco de verdade.
 *
 * O carregador fala com a sessão do usuário (cookies) e não roda fora de
 * uma requisição, então aqui trocamos as duas portas — o cliente e a
 * operação — por versões de serviço. O resto é o código da rota.
 *
 * Não é teste de unidade: é a conferência que diz se as cinco consultas
 * casam com o que está na base. O que dá errado aqui normalmente é join
 * ou filtro, não aritmética.
 *
 * Uso: node scripts/conferir-raio-x-sku.mjs [SKU]
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";
import { createClient } from "@supabase/supabase-js";

const raiz = fileURLToPath(new URL("../", import.meta.url));
for (const l of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) {
    process.env[l.slice(0, i)] = l.slice(i + 1).trim();
  }
}

const OPERACAO = process.env.OPERACAO_CONFERENCIA ?? "00000000-0000-0000-0000-000000000101";
const SKU = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "PA85352";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const pasta = mkdtempSync(path.join(tmpdir(), "gerizo-raiox-"));
const vazio = path.join(pasta, "vazio.cjs");
writeFileSync(vazio, "module.exports={}");

/*
 * A chave de serviço passa por fora do RLS, então a operação tem de ser
 * dita na mão — é o mesmo cuidado que o carregador tem com o cookie.
 */
const pacote = path.join(raiz, "node_modules/@supabase/supabase-js").replaceAll(String.fromCharCode(92), "/");
const stubServidor = path.join(pasta, "servidor.cjs");
writeFileSync(
  stubServidor,
  [
    `const { createClient } = require(${JSON.stringify(pacote)});`,
    `const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });`,
    `module.exports = { clienteServidor: async () => sb, usuarioAtual: async () => null, COOKIE_OPERACAO: "operacao", HEADER_OPERACAO: "x-operacao" };`,
  ].join("\n")
);
const stubOperacao = path.join(pasta, "operacao.cjs");
writeFileSync(
  stubOperacao,
  `module.exports = { operacaoPadrao: async () => ({ id: ${JSON.stringify(OPERACAO)}, nome: "conferência" }), listarOperacoes: async () => [] };`
);

const jiti = createJiti(import.meta.url, {
  alias: {
    "@/lib/supabase/servidor": stubServidor,
    "@/lib/dados/operacao": stubOperacao,
    "./operacao": stubOperacao,
    "@": path.join(raiz, "src"),
    "server-only": vazio,
  },
  interopDefault: true,
});

const { carregarRaioXSku } = await jiti.import(path.join(raiz, "src/lib/dados/raio-x-sku.ts"));

const r = await carregarRaioXSku(SKU);
if (!r) {
  console.error(`SKU ${SKU} não tem anúncio na operação ${OPERACAO}.`);
  process.exit(1);
}

const brl = (v) => (v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

console.log(`\n${r.sku} · ${r.titulo}`);
console.log(`${r.anuncios.length} anúncio(s):`);
for (const a of r.anuncios) {
  console.log(
    `  ${a.mlb}  ${a.tipo.padEnd(8)} ${a.status.padEnd(8)} ${(a.conta ?? "").padEnd(28)}` +
      ` estoque=${a.estoque ?? "—"} cheio=${brl(a.precoCheio)} venda=${a.precoDeVenda ? `${brl(a.precoDeVenda.preco)} (${a.precoDeVenda.data})` : "sem leitura"}` +
      ` catálogo=${a.catalogo ?? "—"} log=${a.logistica ?? "—"}`
  );
}

console.log("\nrecorde:");
const rec = r.recorde;
console.log(`  histórico desde ${rec.desde ?? "—"}, ${rec.semanasComVenda} semanas com venda`);
console.log(`  melhor: ${rec.recorde ? `${rec.recorde.rotulo} · ${rec.recorde.unidades} un · ${brl(rec.recorde.receita)} · preço médio ${brl(rec.recorde.precoMedio)}` : "—"}`);
console.log(`  última: ${rec.ultima ? `${rec.ultima.rotulo} · ${rec.ultima.unidades} un · preço médio ${brl(rec.ultima.precoMedio)}` : "—"}`);

console.log("\nestoque:");
const e = r.estoque;
console.log(
  `  saldo=${e.saldo ?? "—"} sobEncomenda=${e.sobEncomenda} zerados=${e.zerados}` +
    ` giro=${e.giroDiario ?? "—"}/dia cobertura=${e.diasDeCobertura ?? "—"} dias`
);

/* ── As conferências ── */
import { strict as assert } from "node:assert";

assert.ok(r.anuncios.length > 0, "o SKU tem de ter anúncio");
assert.ok(
  rec.recorde == null || rec.recorde.unidades >= (rec.ultima?.unidades ?? 0),
  "o recorde não pode ser menor que a última semana",
);
assert.ok(
  rec.recorde == null || rec.recorde.precoMedio > 0,
  "preço no pico zerado significa receita perdida no caminho",
);
assert.ok(
  e.diasDeCobertura == null || (e.saldo != null && e.giroDiario),
  "cobertura só existe com saldo E giro",
);

/* O saldo tem de bater com a soma dos anúncios controlados. */
const soma = r.anuncios
  .filter((a) => a.estoque != null && a.estoque < 40000)
  .reduce((s, a) => s + a.estoque, 0);
assert.equal(e.saldo ?? 0, soma, "saldo divergente da soma dos anúncios controlados");

/* E o giro tem de bater com uma contagem independente, feita aqui. */
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const d = new Date(`${hoje}T00:00:00Z`);
d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
const fim = new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
const inicio = new Date(d.getTime() - 28 * 86400000).toISOString().slice(0, 10);
let unidades = 0;
for (let de = 0; ; de += 1000) {
  const { data, error } = await sb
    .from("pedido_itens")
    .select("quantidade,pedidos!inner(data,cancelado)")
    .eq("operacao_id", OPERACAO)
    .eq("sku", SKU)
    .gte("pedidos.data", inicio)
    .lte("pedidos.data", fim)
    .order("id")
    .range(de, de + 999);
  if (error) throw new Error(error.message);
  for (const l of data) if (l.pedidos && !l.pedidos.cancelado) unidades += Number(l.quantidade) || 0;
  if (data.length < 1000) break;
}
const esperado = unidades ? Number((unidades / 28).toFixed(2)) : null;
assert.equal(e.giroDiario, esperado, `giro divergente: ${e.giroDiario} contra ${esperado}`);
console.log(`\n  (conferido: ${unidades} unidades de ${inicio} a ${fim})`);

/* Com --gravar, deixa a resposta em disco para desenhar a tela fora do app. */
if (process.argv.includes("--gravar")) {
  const destino = path.join(raiz, "scratchpad/bi/sku.json");
  writeFileSync(destino, JSON.stringify(r, null, 1));
  console.log("gravado: " + destino);
}

console.log("\nOK: o raio-x bate com o banco.");
