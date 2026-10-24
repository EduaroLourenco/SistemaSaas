/**
 * O que o Mercado Livre está oferecendo AGORA, em cada conta conectada.
 *
 * É a leitura que precede o desenho da tela de Automações: em vez de
 * imaginar quantas promoções cabem num carrossel, ver quantas existem,
 * de que tipos, com que janela e com quantos itens candidatos.
 *
 * Só lê. Usa a aplicação de LEITURA, pelo token guardado no cofre.
 *
 * Uso: node scripts/local/ver-promocoes-meli.mjs [--itens]
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
const COM_ITENS = process.argv.includes("--itens");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const API = "https://api.mercadolibre.com";

/** Access token válido da conta, renovando pelo refresh se preciso. */
async function token(integ) {
  const { data: bruto } = await sb.rpc("integracao_segredo_ler", { p_ref: integ.credencial_ref });
  const s = bruto ? JSON.parse(bruto) : null;
  if (!s?.refresh_token) return null;
  if (s.access_token && s.expira_em && new Date(s.expira_em).getTime() > Date.now() + 60_000) return s.access_token;

  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.MELI_APP_ID,
      client_secret: process.env.MELI_CLIENT_SECRET,
      refresh_token: s.refresh_token,
    }),
  });
  if (!r.ok) { console.log(`  !! refresh falhou: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`); return null; }
  const j = await r.json();
  /* O refresh do Meli é de uso único: grava antes de seguir, senão a
     próxima execução — ou o app — fica sem nada. */
  await sb.rpc("integracao_segredo_gravar", {
    p_ref: integ.credencial_ref,
    p_nome: `integracao_${integ.id}`,
    p_segredo: JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, expira_em: new Date(Date.now() + j.expires_in * 1000).toISOString() }),
  });
  return j.access_token;
}

const get = async (caminho, tk) => {
  const r = await fetch(API + caminho, { headers: { authorization: `Bearer ${tk}`, accept: "application/json" } });
  if (!r.ok) return { erro: `HTTP ${r.status}`, corpo: (await r.text()).slice(0, 200) };
  return r.json();
};

const { data: integs } = await sb.from("integracoes").select("id,operacao_id,conta_canal_id,credencial_ref").eq("provedor", "mercado_livre").not("conta_canal_id", "is", null);
const { data: contas } = await sb.from("contas_canal").select("id,nome,identificador,operacao_id");
const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
const idVendedor = new Map(contas.map((c) => [c.id, c.identificador]));

const saida = [];
for (const integ of integs) {
  const nome = nomeConta.get(integ.conta_canal_id) ?? integ.conta_canal_id;
  console.log(`\n══ ${nome} (${integ.operacao_id.slice(0, 8)}) ══`);
  const tk = await token(integ);
  if (!tk) { console.log("  sem token"); continue; }

  let vendedor = idVendedor.get(integ.conta_canal_id);
  if (!vendedor) {
    const me = await get("/users/me", tk);
    vendedor = me?.id;
  }
  if (!vendedor) { console.log("  não descobri o id do vendedor"); continue; }

  const r = await get(`/seller-promotions/users/${vendedor}?app_version=v2`, tk);
  if (r.erro) { console.log(`  ${r.erro} ${r.corpo}`); continue; }
  const promos = r.results ?? [];
  console.log(`  ${promos.length} promoções`);
  for (const p of promos) {
    const b = p.benefits ?? {};
    console.log(
      `  ${String(p.id).padEnd(16)} ${String(p.type).padEnd(24)} ${String(p.status).padEnd(10)} ` +
      `${String(p.start_date ?? "").slice(0, 10)} → ${String(p.finish_date ?? "").slice(0, 10)}  prazo ${String(p.deadline_date ?? "—").slice(0, 10)}  ` +
      `${b.meli_percent != null ? `meli ${b.meli_percent}% / seller ${b.seller_percent}%  ` : ""}${p.name ?? ""}`
    );
    const linha = { conta: nome, operacao: integ.operacao_id, ...p };
    if (COM_ITENS) {
      const it = await get(`/seller-promotions/promotions/${p.id}/items?promotion_type=${p.type}&app_version=v2&limit=50`, tk);
      linha.itens = it.results ?? [];
      linha.totalItens = it.paging?.total ?? null;
      const porStatus = {};
      for (const x of linha.itens) porStatus[x.status] = (porStatus[x.status] ?? 0) + 1;
      console.log(`      itens: ${linha.totalItens ?? "?"} no total · nesta página ${JSON.stringify(porStatus)}`);
      if (linha.itens[0]) console.log(`      exemplo: ${JSON.stringify(linha.itens[0])}`);
    }
    saida.push(linha);
  }
}

writeFileSync("scratchpad/promocoes-ao-vivo.json", JSON.stringify(saida, null, 2));
console.log(`\n${saida.length} promoções gravadas em scratchpad/promocoes-ao-vivo.json`);
