/**
 * Preenche a capa dos anúncios que já estão no banco.
 *
 * ── Por que não esperar a sincronização ──
 *
 * A sincronização de catálogo passa a gravar a foto, mas ela roda uma vez
 * por dia e relê o acervo inteiro de cada conta. Para as telas mostrarem
 * capa hoje, este script pede só a miniatura dos anúncios que já existem:
 * 20 por chamada, nada além do /items que a sincronização já usa.
 *
 * ── O token ──
 *
 * Igual ao `sincronizar-meli.mjs`: usa os access tokens que os CLIs do
 * Eduardo (Meli+ e apis/Mercado Livre Principal) mantêm renovados em
 * disco. Renovar daqui rotacionaria o refresh token e quebraria as
 * automações dele.
 *
 * ── Ordem estável na paginação ──
 *
 * O PostgREST sem ORDER BY devolve as páginas em ordem indefinida: a
 * mesma linha aparece duas vezes e outra não aparece nenhuma. Toda
 * consulta paginada aqui ordena por id.
 *
 * Uso:
 *   node scripts/local/preencher-fotos.mjs            # todos
 *   node scripts/local/preencher-fotos.mjs --faltando # só quem está sem
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
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/";

const ARQUIVOS = [
  "C:/Users/dudu4/OneDrive/Desktop/Meli+/.meli/token.json",
  "C:/Users/dudu4/OneDrive/Desktop/apis/Mercado Livre Principal/.meli/token.json",
];

const tokens = [];
for (const p of ARQUIVOS) {
  try {
    const t = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
    const criado = Date.parse(t.createdAt ?? t.created_at ?? 0);
    const vence = criado + (t.expires_in ?? 21600) * 1000;
    if (t.access_token && vence > Date.now()) tokens.push(t.access_token);
    else console.warn(`  token vencido ou vazio: ${p}`);
  } catch {
    console.warn(`  sem token em ${p}`);
  }
}
if (!tokens.length) {
  console.error("Nenhum access token válido. Rode o CLI que renova antes.");
  process.exit(1);
}

const soFaltando = process.argv.includes("--faltando");

/* ── Os anúncios ── */
const anuncios = [];
for (let de = 0; ; de += 1000) {
  const filtro = soFaltando ? "&foto=is.null" : "";
  const r = await fetch(
    `${URL_SB}anuncios?select=id,codigo_externo,foto&order=id.asc${filtro}`,
    { headers: { ...SB, Range: `${de}-${de + 999}` } }
  );
  if (!r.ok) {
    const txt = await r.text();
    if (txt.includes("foto")) {
      console.error("A coluna `foto` ainda não existe. Rode db/41_foto_do_anuncio.sql.");
      process.exit(1);
    }
    throw new Error(txt);
  }
  const lote = await r.json();
  anuncios.push(...lote);
  if (lote.length < 1000) break;
}

const mlbs = anuncios.filter((a) => /^MLB\d+$/i.test(a.codigo_externo ?? ""));
console.log(`${mlbs.length} anúncios MLB${soFaltando ? " sem foto" : ""} · ${tokens.length} contas`);

/* A capa sempre em https: miniatura http é bloqueada dentro de página https. */
const https = (u) => (u?.startsWith("http://") ? "https://" + u.slice(7) : u || null);

const achadas = new Map();
for (let i = 0; i < mlbs.length; i += 20) {
  const lote = mlbs.slice(i, i + 20).map((a) => a.codigo_externo.toUpperCase());
  for (const token of tokens) {
    const r = await fetch(
      `https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=id,secure_thumbnail,thumbnail`,
      { headers: { Authorization: "Bearer " + token } }
    );
    if (!r.ok) continue;
    const corpo = await r.json();
    for (const item of Array.isArray(corpo) ? corpo : []) {
      if (item.code !== 200 || !item.body?.id) continue;
      const foto = https(item.body.secure_thumbnail || item.body.thumbnail);
      if (foto) achadas.set(String(item.body.id).toUpperCase(), foto);
    }
    /* Uma conta que respondeu já trouxe o lote: /items é público, não
       exige ser dono do anúncio. */
    break;
  }
  if (i % 400 === 0) process.stdout.write(`\r  lendo ${i}/${mlbs.length}`);
}
console.log(`\r  lidos ${mlbs.length}/${mlbs.length} · ${achadas.size} com capa      `);

/* ── Grava o que mudou ── */
const mudaram = mlbs
  .map((a) => ({ id: a.id, foto: achadas.get(a.codigo_externo.toUpperCase()) ?? null }))
  .filter((x) => x.foto && x.foto !== mlbs.find((m) => m.id === x.id).foto);

let n = 0;
for (const x of mudaram) {
  /* PATCH por linha e não upsert: o upsert manda INSERT com ON CONFLICT,
     e as colunas NOT NULL fora do payload derrubam a gravação inteira. */
  const r = await fetch(`${URL_SB}anuncios?id=eq.${x.id}`, {
    method: "PATCH",
    headers: { ...SB, Prefer: "return=minimal" },
    body: JSON.stringify({ foto: x.foto }),
  });
  if (r.ok) n++;
  if (n % 100 === 0) process.stdout.write(`\r  gravando ${n}/${mudaram.length}`);
}
console.log(`\r${n} capas gravadas de ${mudaram.length} mudanças      `);
