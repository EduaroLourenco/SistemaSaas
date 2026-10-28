/**
 * O mercado da Imprimil, pela API do Mercado Livre.
 *
 * A busca de anúncio (`/sites/MLB/search`) foi fechada: devolve 403 com
 * e sem token. Mas três portas continuam abertas, e juntas respondem o
 * que interessa:
 *
 *   /trends/MLB/{categoria} ....... o que as pessoas DIGITAM na busca,
 *                                   por categoria. É a palavra-chave
 *                                   real, não o palpite.
 *   /products/search .............. os produtos de catálogo, com nome e
 *                                   id — dá para ver o que existe.
 *   /products/{id} ................ o produto, com preço do vencedor e
 *                                   quantos vendedores disputam.
 *
 * Uso: node scripts/local/imprimil-mercado-api.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const raiz = fileURLToPath(new URL("../../", import.meta.url));
for (const l of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const API = "https://api.mercadolibre.com";

const { data: ints } = await sb.from("integracoes").select("credencial_ref").eq("provedor", "mercado_livre").limit(1);
const { data: bruto } = await sb.rpc("integracao_segredo_ler", { p_ref: ints[0].credencial_ref });
const tk = JSON.parse(bruto).access_token;
const h = { authorization: `Bearer ${tk}` };
const get = async (c) => {
  const r = await fetch(API + c, { headers: h });
  return r.ok ? r.json() : { erro: r.status };
};

/* As categorias onde a Imprimil joga ou poderia jogar. */
const CATEGORIAS = {
  "Gizes de cera": "MLB270875",
  "Lembrancinhas": "MLB1168",
  "Livros infantis": "MLB1196",
  "Materiais escolares": "MLB264586",
  "Festas": "MLB1313",
  "Arte e trabalhos manuais": "MLB1182",
};

const saida = { tendencias: {}, produtos: {} };

/* ── O que as pessoas digitam ── */
for (const [nome, id] of Object.entries(CATEGORIAS)) {
  const r = await get(`/trends/MLB/${id}`);
  if (r.erro) { console.log(`${nome}: HTTP ${r.erro}`); continue; }
  saida.tendencias[nome] = r.slice(0, 25).map((x, i) => ({ posicao: i + 1, termo: x.keyword, link: x.url }));
  console.log(`\n══ ${nome} (${id}) · top 12 do que buscam ══`);
  saida.tendencias[nome].slice(0, 12).forEach((x) => console.log(`  ${String(x.posicao).padStart(2)}. ${x.termo}`));
}

/* ── O que existe de produto, e a que preço ── */
const BUSCAS = [
  "giz de cera", "mini lapis de cor", "livro de colorir infantil",
  "caderno de caligrafia", "planner 2027", "adesivo infantil",
];
for (const q of BUSCAS) {
  const r = await get(`/products/search?site_id=MLB&status=active&q=${encodeURIComponent(q)}&limit=8`);
  if (r.erro) { console.log(`\n${q}: HTTP ${r.erro}`); continue; }
  const itens = [];
  for (const p of (r.results ?? []).slice(0, 6)) {
    const d = await get(`/products/${p.id}`);
    itens.push({
      id: p.id,
      nome: p.name ?? d.name ?? "",
      dominio: p.domain_id ?? null,
      precoVencedor: d?.buy_box_winner?.price ?? null,
      vendedores: d?.buy_box_winner ? (d.pickers?.length ?? null) : null,
      link: `https://www.mercadolivre.com.br/p/${p.id}`,
    });
  }
  saida.produtos[q] = itens;
  console.log(`\n══ catálogo: "${q}" · ${r.paging?.total ?? "?"} produtos ══`);
  for (const i of itens) console.log(`  ${i.precoVencedor != null ? ("R$ " + i.precoVencedor).padStart(11) : "sem preço".padStart(11)}  ${i.nome.slice(0, 66)}`);
}

writeFileSync("scratchpad/imprimil/mercado-api.json", JSON.stringify(saida, null, 1));
console.log("\nescrito: scratchpad/imprimil/mercado-api.json");
