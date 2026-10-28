/**
 * O que o mercado está vendendo, direto do Mercado Livre.
 *
 * Pesquisa de produto feita com dado, não com palpite: a busca do canal
 * devolve preço, quantidade vendida e o link de cada anúncio. É a
 * diferença entre "giz de cera parece uma boa" e "o mais vendido tem
 * 5 mil unidades a R$ 12,90, e este é o link".
 *
 * Usa a aplicação de LEITURA, pelo token do cofre.
 *
 * Uso: node scripts/local/pesquisar-mercado.mjs
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

/* Os termos. Divididos pelas três frentes que ele pediu, para o
   resultado já sair separado. */
const TERMOS = {
  "livrinho de colorir": ["livrinho de colorir lembrancinha", "mini livro colorir festa", "revistinha de colorir infantil atacado"],
  "bíblico / igreja": ["livrinho biblico colorir", "lembrancinha ebd infantil", "revistinha biblica colorir atacado", "lembrancinha catequese"],
  "natal": ["lembrancinha natal infantil colorir", "livrinho natal colorir", "atividade natalina criança"],
  "volta às aulas": ["kit volta as aulas lembrancinha", "material escolar personalizado atacado"],
  "páscoa": ["lembrancinha pascoa infantil", "livrinho pascoa colorir"],
  "giz e lápis": ["giz de cera atacado lembrancinha", "mini lapis de cor lembrancinha", "kit lapis de cor 12 cores atacado", "canetinha hidrografica atacado"],
  "kit colorir pronto": ["kit colorir lembrancinha com giz", "sacolinha colorir festa infantil", "kit atividades lembrancinha aniversario"],
  "impressos afins": ["caderno personalizado atacado", "bloco de notas personalizado atacado", "adesivo personalizado atacado", "marcador de pagina personalizado"],
  "papelaria tendência": ["caderneta moleskine atacado", "planner 2027", "caderno inteligente atacado"],
};

async function token() {
  const { data: integs } = await sb
    .from("integracoes").select("id,credencial_ref,conta_canal_id")
    .eq("provedor", "mercado_livre").not("conta_canal_id", "is", null).limit(5);
  for (const integ of integs ?? []) {
    const { data: bruto } = await sb.rpc("integracao_segredo_ler", { p_ref: integ.credencial_ref });
    const s = bruto ? JSON.parse(bruto) : null;
    if (!s?.refresh_token) continue;
    if (s.access_token && s.expira_em && new Date(s.expira_em).getTime() > Date.now() + 60_000) return s.access_token;
    const r = await fetch(`${API}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token", client_id: process.env.MELI_APP_ID,
        client_secret: process.env.MELI_CLIENT_SECRET, refresh_token: s.refresh_token,
      }),
    });
    if (!r.ok) continue;
    const j = await r.json();
    await sb.rpc("integracao_segredo_gravar", {
      p_ref: integ.credencial_ref, p_nome: `integracao_${integ.id}`,
      p_segredo: JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, expira_em: new Date(Date.now() + j.expires_in * 1000).toISOString() }),
    });
    return j.access_token;
  }
  return null;
}

const tk = await token();
if (!tk) throw new Error("não consegui token de leitura");

const saida = {};
for (const [frente, termos] of Object.entries(TERMOS)) {
  saida[frente] = [];
  for (const termo of termos) {
    const q = new URLSearchParams({ q: termo, limit: "30", sort: "relevance" });
    const r = await fetch(`${API}/sites/MLB/search?${q}`, { headers: { authorization: `Bearer ${tk}` } });
    if (!r.ok) { console.log(`  ! ${termo}: HTTP ${r.status}`); continue; }
    const j = await r.json();
    const itens = (j.results ?? []).map((x) => ({
      termo,
      mlb: x.id,
      titulo: x.title,
      preco: x.price,
      vendidos: x.sold_quantity ?? null,
      link: x.permalink,
      vendedor: x.seller?.nickname ?? x.seller_id ?? null,
      catalogo: x.catalog_product_id ?? null,
      frete: x.shipping?.free_shipping ?? null,
    }));
    saida[frente].push({ termo, total: j.paging?.total ?? null, itens });
    console.log(`${frente.padEnd(22)} ${termo.padEnd(44)} ${String(j.paging?.total ?? "?").padStart(7)} anúncios`);
  }
}

writeFileSync("scratchpad/imprimil/mercado.json", JSON.stringify(saida, null, 1));
console.log("\nescrito: scratchpad/imprimil/mercado.json");
