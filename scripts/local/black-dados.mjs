/**
 * O que a Probel vendeu nos últimos oito meses, por anúncio.
 *
 * Alimenta duas entregas: a planilha da Black Friday e a do Pix. As duas
 * precisam da mesma pergunta respondida — qual é o melhor anúncio de cada
 * produto em cada conta, e a que preço ele vendeu melhor.
 *
 * Uso: node scripts/local/black-dados.mjs
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
const PROBEL = "00000000-0000-0000-0000-000000000101";
const DESDE = "2026-02-27"; // oito meses

const pag = async (montar) => {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await montar().range(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};

const anuncios = await pag(() => sb.from("anuncios")
  .select("id,codigo_externo,sku_canal,titulo,status,estoque,preco_atual,tipo,conta_canal_id,foto,catalogo_produto_id")
  .eq("operacao_id", PROBEL));
const contas = await pag(() => sb.from("contas_canal").select("id,nome").eq("operacao_id", PROBEL));
const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));

const pedidos = await pag(() => sb.from("pedidos")
  .select("id,data,cancelado,conta_canal_id").eq("operacao_id", PROBEL).gte("data", DESDE));
const idsPedido = new Set(pedidos.filter((p) => !p.cancelado).map((p) => p.id));
const porPedido = new Map(pedidos.map((p) => [p.id, p]));

const itens = [];
const todos = [...idsPedido];
for (let i = 0; i < todos.length; i += 300) {
  itens.push(...(await pag(() => sb.from("pedido_itens")
    .select("pedido_id,anuncio_id,sku,quantidade,total,preco_unitario")
    .in("pedido_id", todos.slice(i, i + 300)))));
}

const semanal = await pag(() => sb.from("anuncio_desempenho_semanal")
  .select("anuncio_id,ano_iso,semana_iso,inicio,fim,visitas,vendas,receita").eq("operacao_id", PROBEL));
const diario = await pag(() => sb.from("anuncio_estoque_diario")
  .select("anuncio_id,data,preco,estoque").eq("operacao_id", PROBEL).gte("data", "2026-09-15"));
const catalogo = await pag(() => sb.from("anuncio_catalogo_diario")
  .select("anuncio_id,data,situacao,preco_para_ganhar,preco_atual").eq("operacao_id", PROBEL).gte("data", "2026-10-01"));

writeFileSync("scratchpad/bf/probel.json", JSON.stringify({
  geradoEm: new Date().toISOString(), desde: DESDE,
  anuncios: anuncios.map((a) => ({ ...a, conta: nomeConta.get(a.conta_canal_id) ?? null })),
  itens: itens.map((i) => ({ ...i, data: porPedido.get(i.pedido_id)?.data ?? null })),
  semanal, diario, catalogo,
}));

console.log(`anúncios ${anuncios.length} (${anuncios.filter((a) => a.status === "ativo").length} ativos)`);
console.log(`pedidos desde ${DESDE}: ${idsPedido.size} não cancelados · ${itens.length} itens`);
console.log(`semanal ${semanal.length} · diário ${diario.length} · catálogo ${catalogo.length}`);
const porConta = {};
for (const a of anuncios) porConta[nomeConta.get(a.conta_canal_id) ?? "?"] = (porConta[nomeConta.get(a.conta_canal_id) ?? "?"] ?? 0) + 1;
console.log("anúncios por conta:", JSON.stringify(porConta));
