/**
 * Os números da linha Boa Forma, para a apresentação.
 *
 * A apresentação é atualizada direto no PowerPoint, então o que sai daqui
 * é só o dado — nos mesmos recortes dos slides que já existem: portfólio,
 * semana a semana, por modelo, por produto, e agora por CANAL, que é o
 * pedaço novo.
 *
 * Quem é Boa Forma: os 15 SKUs da linha. Vai pelo SKU e não pelo título
 * porque o título muda a cada reescrita de anúncio, e um anúncio novo com
 * o mesmo SKU tem de continuar entrando.
 *
 * Uso: node scripts/local/boa-forma-dados.mjs
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
const nm = (s) => String(s ?? "").trim().toUpperCase();

/* Os 15 SKUs da linha, na ordem em que o slide 13 os lista. */
const SKUS = ["PAA8725","PAA8728","PAA8770","PAA8631","PAA8820","PAB0008","PAA8635","PAA8767","PAA8643","PAA8642","PAB0007","PAA8627","PAA8823","PAA8824","PAA8639"];

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

const anuncios = (await pag(() => sb.from("anuncios")
  .select("id,codigo_externo,sku_canal,titulo,status,estoque,preco_atual,tipo,conta_canal_id,canal_id,operacao_id")
  .eq("operacao_id", PROBEL)))
  .filter((a) => SKUS.includes(nm(a.sku_canal)));
const ids = anuncios.map((a) => a.id);
const porId = new Map(anuncios.map((a) => [a.id, a]));

const contas = await pag(() => sb.from("contas_canal").select("id,nome,canal_id"));
const canais = await pag(() => sb.from("canais").select("id,nome"));
const nomeCanal = new Map(canais.map((c) => [c.id, c.nome]));
const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
const canalDaConta = new Map(contas.map((c) => [c.id, nomeCanal.get(c.canal_id) ?? "?"]));

const emLotes = async (tabela, colunas, coluna, valores, extra = (q) => q) => {
  const out = [];
  for (let i = 0; i < valores.length; i += 100) {
    const fatia = valores.slice(i, i + 100);
    out.push(...(await pag(() => extra(sb.from(tabela).select(colunas).in(coluna, fatia)))));
  }
  return out;
};

const semanal = await emLotes("anuncio_desempenho_semanal", "anuncio_id,ano_iso,semana_iso,inicio,fim,visitas,vendas,receita", "anuncio_id", ids);
const diario = await emLotes("anuncio_estoque_diario", "anuncio_id,data,preco,estoque", "anuncio_id", ids);

/* As vendas por canal saem do pedido, não do relatório semanal: o semanal
   é do Mercado Livre e não enxerga Magalu nem Shopee. */
const itens = await emLotes("pedido_itens", "pedido_id,anuncio_id,sku,quantidade,total,preco_unitario", "sku", SKUS);
const pedidoIds = [...new Set(itens.map((i) => i.pedido_id))];
const pedidos = await emLotes("pedidos", "id,data,total,cancelado,conta_canal_id,canal_id", "id", pedidoIds);
const porPedido = new Map(pedidos.map((p) => [p.id, p]));

const saida = {
  geradoEm: new Date().toISOString(),
  skus: SKUS,
  anuncios: anuncios.map((a) => ({ ...a, conta: nomeConta.get(a.conta_canal_id) ?? null, canal: canalDaConta.get(a.conta_canal_id) ?? nomeCanal.get(a.canal_id) ?? null })),
  semanal, diario,
  vendas: itens.map((i) => {
    const p = porPedido.get(i.pedido_id);
    return {
      sku: nm(i.sku), anuncio_id: i.anuncio_id, quantidade: Number(i.quantidade) || 0,
      total: Number(i.total) || 0, unitario: Number(i.preco_unitario) || 0,
      data: p?.data ?? null, cancelado: p?.cancelado ?? null,
      conta: p ? nomeConta.get(p.conta_canal_id) ?? null : null,
      canal: p ? (canalDaConta.get(p.conta_canal_id) ?? nomeCanal.get(p.canal_id) ?? null) : null,
    };
  }),
};
writeFileSync("scratchpad/bf/dados.json", JSON.stringify(saida));

/* ── O que dá para ver daqui ── */
const vivas = saida.vendas.filter((v) => !v.cancelado);
const sem = [...new Set(semanal.map((s) => `${s.ano_iso}-S${String(s.semana_iso).padStart(2, "0")}`))].sort();
console.log(`anúncios: ${anuncios.length} (${anuncios.filter((a) => a.status === "ativo").length} ativos)`);
console.log(`semanas medidas: ${sem.length} · de ${sem[0]} a ${sem[sem.length - 1]}`);
const jan = semanal.reduce((o, s) => ({ de: !o.de || s.inicio < o.de ? s.inicio : o.de, ate: !o.ate || s.fim > o.ate ? s.fim : o.ate }), {});
console.log(`janela: ${jan.de} → ${jan.ate}`);
console.log(`pedidos com SKU da linha: ${saida.vendas.length} itens, ${vivas.length} não cancelados`);

const porCanal = new Map();
for (const v of vivas) {
  const g = porCanal.get(v.canal ?? "?") ?? { q: 0, r: 0, de: null, ate: null };
  g.q += v.quantidade; g.r += v.total;
  if (!g.de || v.data < g.de) g.de = v.data;
  if (!g.ate || v.data > g.ate) g.ate = v.data;
  porCanal.set(v.canal ?? "?", g);
}
console.log("\nvendas por canal (todo o histórico de pedidos):");
for (const [c, g] of [...porCanal].sort((a, b) => b[1].r - a[1].r)) {
  console.log(`  ${String(c).padEnd(16)} ${String(g.q).padStart(4)} un  R$ ${g.r.toLocaleString("pt-BR", { minimumFractionDigits: 2 }).padStart(12)}  ${g.de} → ${g.ate}`);
}
const porConta = new Map();
for (const v of vivas) {
  const g = porConta.get(v.conta ?? "?") ?? { q: 0, r: 0 };
  g.q += v.quantidade; g.r += v.total; porConta.set(v.conta ?? "?", g);
}
console.log("\nvendas por conta:");
for (const [c, g] of [...porConta].sort((a, b) => b[1].r - a[1].r)) console.log(`  ${String(c).padEnd(30)} ${String(g.q).padStart(4)} un  R$ ${g.r.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
console.log("\nescrito: scratchpad/bf/dados.json");
