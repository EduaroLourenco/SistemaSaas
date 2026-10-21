/**
 * Preenche a família de catálogo dos anúncios que já estão no banco.
 *
 * ── O caminho ──
 *
 *   anúncio (MLB) ─/items─→ catalog_product_id ─/products─→ parent_id
 *
 * O `catalog_product_id` une os anúncios do MESMO produto (clássico e
 * premium da mesma medida). O `parent_id` une os TAMANHOS do mesmo
 * colchão — é ele que a tela de publicidade do canal mostra como
 * "Colchão Probel Guarda Costas Turim Springs", e é por ele que o
 * patrocínio funciona.
 *
 * ── Por que preencher agora ──
 *
 * A sincronização passa a gravar sozinha, mas roda uma vez por dia. Em
 * 21/10/2026 o tráfego pago estava mandando desligar o MLB5382536864
 * sem saber que os irmãos dele vendem.
 *
 * ── Custo ──
 *
 * /items em lotes de 20, e um /products por produto DISTINTO. Na
 * Probel: 52 chamadas de item e 70 de produto para 1.036 anúncios.
 *
 * Uso:
 *   node scripts/local/preencher-familias.mjs
 */
import fs from "node:fs";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)])
    process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}

const SB = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
  "content-type": "application/json",
};
const U = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/";

/* Os access tokens que os CLIs do Eduardo mantêm renovados em disco.
   Renovar daqui rotacionaria o refresh e quebraria as automações. */
const tokens = [];
for (const p of [
  "C:/Users/dudu4/OneDrive/Desktop/Meli+/.meli/token.json",
  "C:/Users/dudu4/OneDrive/Desktop/apis/Mercado Livre Principal/.meli/token.json",
]) {
  try {
    const t = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
    const criado = Date.parse(t.createdAt ?? t.created_at ?? 0);
    if (t.access_token && criado + (t.expires_in ?? 21600) * 1000 > Date.now()) tokens.push(t.access_token);
  } catch {}
}
if (!tokens.length) {
  console.error("Nenhum access token válido. Rode o CLI que renova antes.");
  process.exit(1);
}
console.log(`${tokens.length} token(s) válido(s)`);

const pedir = async (url) => {
  for (const t of tokens) {
    const r = await fetch(url, { headers: { Authorization: "Bearer " + t } });
    if (r.ok) return r.json();
  }
  return null;
};

/* ── Os anúncios ── */
const anuncios = [];
for (let de = 0; ; de += 1000) {
  const r = await fetch(`${U}anuncios?select=id,codigo_externo,status&order=id.asc`, {
    headers: { ...SB, Range: `${de}-${de + 999}` },
  });
  if (!r.ok) {
    const txt = await r.text();
    if (/familia_id|catalogo_produto_id/.test(txt)) {
      console.error("Faltam colunas. Rode db/43_familia_do_anuncio.sql.");
      process.exit(1);
    }
    throw new Error(txt);
  }
  const lote = await r.json();
  anuncios.push(...lote);
  if (lote.length < 1000) break;
}
const mlbs = anuncios.filter((a) => a.status === "ativo" && /^MLB\d+$/i.test(a.codigo_externo));
console.log(`${mlbs.length} anúncios ativos`);

/* ── 1. catalog_product_id ── */
const catDoMlb = new Map();
for (let i = 0; i < mlbs.length; i += 20) {
  const lote = mlbs.slice(i, i + 20).map((a) => a.codigo_externo.toUpperCase());
  const j = await pedir(
    `https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=id,catalog_product_id`
  );
  for (const x of Array.isArray(j) ? j : []) {
    if (x.code !== 200 || !x.body?.id) continue;
    if (x.body.catalog_product_id)
      catDoMlb.set(String(x.body.id).toUpperCase(), x.body.catalog_product_id);
  }
  if (i % 200 === 0) process.stdout.write(`\r  itens ${i}/${mlbs.length}`);
}
console.log(`\r  itens ${mlbs.length}/${mlbs.length} · ${catDoMlb.size} em catálogo      `);

/* ── 2. parent_id por produto distinto ── */
const produtos = [...new Set(catDoMlb.values())];
const familia = new Map();
let n = 0;
for (const p of produtos) {
  const b = await pedir(`https://api.mercadolibre.com/products/${p}`);
  if (b) familia.set(p, { id: b.parent_id ?? p, nome: b.family_name ?? b.name ?? p });
  if (++n % 25 === 0) process.stdout.write(`\r  produtos ${n}/${produtos.length}`);
}
console.log(`\r  produtos ${produtos.length}/${produtos.length} · ${familia.size} resolvidos      `);

/* ── 3. Grava ── */
let gravados = 0;
for (const a of mlbs) {
  const cat = catDoMlb.get(a.codigo_externo.toUpperCase());
  if (!cat) continue;
  const f = familia.get(cat);
  const r = await fetch(`${U}anuncios?id=eq.${a.id}`, {
    method: "PATCH",
    headers: { ...SB, Prefer: "return=minimal" },
    body: JSON.stringify({
      catalogo_produto_id: cat,
      familia_id: f?.id ?? null,
      familia_nome: f?.nome ?? null,
    }),
  });
  if (r.ok) gravados++;
  if (gravados % 50 === 0) process.stdout.write(`\r  gravando ${gravados}`);
}

const porFamilia = new Map();
for (const [mlb, cat] of catDoMlb) {
  const f = familia.get(cat);
  if (!f) continue;
  porFamilia.set(f.id, (porFamilia.get(f.id) ?? 0) + 1);
}
console.log(`\r${gravados} anúncios com família · ${porFamilia.size} famílias distintas      `);
console.log(`${mlbs.length - catDoMlb.size} anúncios ativos estão FORA do catálogo — esses não têm família.`);
