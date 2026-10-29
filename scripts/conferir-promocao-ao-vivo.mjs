/**
 * Confere o bloco de promoção ao vivo contra o Mercado Livre de verdade.
 *
 * ── Por que existe ──
 *
 * `GET /seller-promotions/items/{MLB}` foi escrito depois de ser sondado,
 * não antes: o formato tem três armadilhas que só se vê na resposta real —
 * array puro em vez de `{results}`, `price: 0` no convite que ainda não
 * tem preço, e HTTP 400 no anúncio em revisão, que é "não dá para
 * perguntar" e não "nenhuma promoção".
 *
 * Este script é o que impede essas três de voltarem. Ele gasta cota: uma
 * chamada por MLB pedido.
 *
 * Uso:
 *   node scripts/conferir-promocao-ao-vivo.mjs            (um MLB por conta)
 *   node scripts/conferir-promocao-ao-vivo.mjs MLB4374003842
 *   node scripts/conferir-promocao-ao-vivo.mjs --json=saida.json
 *
 * `--json` grava o que foi lido, para desenhar a tela contra dado real
 * em vez de contra exemplo inventado (ver docs/agents/telas.md).
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";
import { createClient } from "@supabase/supabase-js";

const raiz = fileURLToPath(new URL("../", import.meta.url));
for (const l of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) {
    process.env[l.slice(0, i)] = l.slice(i + 1).trim();
  }
}

const PEDIDOS = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const JSON_EM = process.argv.find((a) => a.startsWith("--json="))?.slice(7) ?? null;
const coletado = [];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* O cliente do canal fala com a sessão do usuário; fora de uma requisição
   a porta do Supabase é trocada pela chave de serviço, como no
   conferir-raio-x-sku. */
const pasta = mkdtempSync(path.join(tmpdir(), "gerizo-promoviva-"));
const vazio = path.join(pasta, "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const pacote = path
  .join(raiz, "node_modules/@supabase/supabase-js")
  .replaceAll(String.fromCharCode(92), "/");
const stubServidor = path.join(pasta, "servidor.cjs");
writeFileSync(
  stubServidor,
  [
    `const { createClient } = require(${JSON.stringify(pacote)});`,
    `const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });`,
    `module.exports = { clienteServidor: async () => sb, servicoServidor: () => sb, usuarioAtual: async () => null, COOKIE_OPERACAO: "operacao", HEADER_OPERACAO: "x-operacao" };`,
  ].join("\n")
);

const jiti = createJiti(import.meta.url, {
  alias: {
    "@/lib/supabase/servidor": stubServidor,
    "@": path.join(raiz, "src"),
    "server-only": vazio,
  },
  interopDefault: true,
});

const { promocoesDoAnuncio } = await jiti.import(
  path.join(raiz, "src/lib/meli/promocoes-canal.ts")
);

/* Um anúncio ativo por conta conectada, quando nenhum MLB foi pedido. */
async function alvos() {
  if (PEDIDOS.length) {
    const { data } = await sb
      .from("anuncios")
      .select("codigo_externo,titulo,conta_canal_id,contas_canal(nome)")
      .in("codigo_externo", PEDIDOS.map((m) => m.toUpperCase()));
    return data ?? [];
  }
  const { data: integs } = await sb
    .from("integracoes")
    .select("conta_canal_id")
    .eq("provedor", "mercado_livre")
    .eq("status", "conectada")
    .not("conta_canal_id", "is", null);
  const lista = [];
  for (const i of integs ?? []) {
    const { data } = await sb
      .from("anuncios")
      .select("codigo_externo,titulo,conta_canal_id,contas_canal(nome)")
      .eq("conta_canal_id", i.conta_canal_id)
      .eq("status", "ativo")
      .limit(1);
    if (data?.[0]) lista.push(data[0]);
  }
  return lista;
}

const brl = (v) => (v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

let lidos = 0;
let recusados = 0;

for (const a of await alvos()) {
  const conta = a.contas_canal?.nome ?? a.conta_canal_id;
  console.log(`\n══ ${a.codigo_externo} · ${conta} ══`);
  console.log(`   ${(a.titulo ?? "").slice(0, 70)}`);

  const r = await promocoesDoAnuncio(a.conta_canal_id, a.codigo_externo);
  coletado.push({ mlb: a.codigo_externo, titulo: a.titulo, conta, ...r });

  if (!r.lido) {
    recusados++;
    console.log(`   não perguntado: ${r.motivo}`);
    assert.ok(r.motivo, "recusa sem motivo não serve para a tela");
    continue;
  }
  lidos++;

  const noAr = r.promocoes.filter((p) => p.status === "started");
  const convites = r.promocoes.filter((p) => p.status !== "started");
  console.log(`   ${noAr.length} no ar · ${convites.length} convite(s)`);

  for (const p of r.promocoes) {
    const faixa =
      p.precoMinimo != null || p.precoMaximo != null
        ? ` piso=${brl(p.precoMinimo)} teto=${brl(p.precoMaximo)}`
        : "";
    const divisao =
      p.meliPct != null || p.sellerPct != null ? ` meli=${p.meliPct ?? "—"}% nosso=${p.sellerPct ?? "—"}%` : "";
    console.log(
      `     ${(p.status ?? "—").padEnd(10)} ${p.tipo.padEnd(22)} ${(p.nome ?? "(sem nome)").slice(0, 28).padEnd(28)}` +
        ` ${brl(p.preco).padStart(14)} de ${brl(p.precoOriginal)}${faixa}${divisao}` +
        `${p.meioPagamento ? ` via ${p.meioPagamento}` : ""}` +
        `${p.estoqueMin != null ? ` estoque ${p.estoqueMin}–${p.estoqueMax}` : ""}`
    );
  }

  /* ── As conferências ── */
  for (const p of r.promocoes) {
    assert.notEqual(p.preco, 0, `${p.tipo}: preço zero tinha de virar nulo, senão a tela oferta de graça`);
    assert.ok(p.tipo, "promoção sem tipo não tem como ser rotulada");
    assert.ok(
      p.preco == null || p.precoOriginal == null || p.preco <= p.precoOriginal,
      `${p.tipo}: preço de promoção acima do cheio — leitura invertida`
    );
    /*
     * Só na promoção JÁ NO AR o `price` é o preço daquela promoção.
     *
     * No convite ele não é proposta: o LIGHTNING do MLB5792078252 veio
     * com price=29,09 e teto=27,00 — acima do próprio teto do canal, e
     * igual ao preço corrente do anúncio. Quem mostrar esse número como
     * oferta de relâmpago mostra um preço que o canal recusaria.
     * A proposta do convite é `sugerido`, dentro de piso e teto.
     */
    if (p.status === "started") {
      assert.ok(
        p.preco == null || p.precoMaximo == null || p.preco <= p.precoMaximo + 0.01,
        `${p.tipo} no ar: preço acima do teto do canal (${p.preco} > ${p.precoMaximo})`
      );
    }
    assert.ok(
      p.sugerido == null || p.precoMaximo == null || p.sugerido <= p.precoMaximo + 0.01,
      `${p.tipo}: sugestão do canal acima do teto dele mesmo`
    );
    assert.ok(
      p.sugerido == null || p.precoMinimo == null || p.sugerido >= p.precoMinimo - 0.01,
      `${p.tipo}: sugestão do canal abaixo do piso dele mesmo`
    );
  }
  assert.ok(
    r.promocoes.every((p) => p.codigo != null || p.tipo === "PRICE_DISCOUNT"),
    "só PRICE_DISCOUNT vem sem código de campanha"
  );
}

if (JSON_EM) {
  writeFileSync(JSON_EM, JSON.stringify(coletado, null, 1));
  console.log(`\njson em ${JSON_EM}`);
}

console.log(`\n${lidos} anúncio(s) lido(s), ${recusados} recusado(s) pelo canal.`);
assert.ok(lidos + recusados > 0, "nenhum anúncio para conferir — alvo errado");
assert.ok(lidos > 0, "nenhuma leitura passou: ou a cota estourou, ou o caminho saiu da lista permitida");
console.log("todas as conferências passaram.");
