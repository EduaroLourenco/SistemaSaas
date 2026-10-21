import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const c = l.trim(), i = c.indexOf("=");
  if (i > 0 && !c.startsWith("#") && !process.env[c.slice(0, i)]) process.env[c.slice(0, i)] = c.slice(i + 1).trim();
}
const U = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: K, authorization: `Bearer ${K}` };
const IMP = "123c2f3c-c4ed-48ba-b4c4-753d78265946";
const get = async (p) => (await fetch(`${U}/rest/v1/${p}`, { headers: h })).json();
const procs = await get(`processamentos_promocao?operacao_id=eq.${IMP}&select=id,executado_em,itens_lidos,itens_aprovados,arquivos&order=executado_em.desc&limit=3`);
for (const p of procs) {
  console.log(`\n=== ${p.executado_em}  ${p.itens_lidos} lidos / ${p.itens_aprovados} aprovados  ${p.arquivos?.[0] ?? ""}`);
  const itens = await get(`historico_promocoes?operacao_id=eq.${IMP}&processamento_id=eq.${p.id}&select=*&limit=20`);
  if (!Array.isArray(itens) || !itens.length) { console.log("  (sem historico)"); continue; }
  console.log("  colunas: " + Object.keys(itens[0]).join(", "));
  for (const i of itens.slice(0, 16)) console.log(`  ${i.mlb ?? i.anuncio_id} cheio=${i.preco_original} canal=${i.preco_proposto_ml ?? i.proposta_ml} escrito=${i.preco_oferta ?? i.preco_aplicado} tabela=${i.preco_tabela} ${i.decisao ?? i.status}`);
}
