/**
 * Importa a listagem de pedidos da Vtrina para os canais SEM API.
 *
 * Mercado Livre e Loja própria ficam de fora de propósito: os dois já
 * entram por API, com mais campo e mais fresco. Importar por cima
 * duplicaria pedido com código diferente — a Vtrina usa o id dela, a API
 * usa o id do canal — e a receita dobraria sem ninguém ver.
 */
import fs from "node:fs";
import ExcelJS from "file:///C:/Users/dudu4/OneDrive/Desktop/plataforma/node_modules/exceljs/excel.js";

/* O arquivo vem por argumento; o caminho fixo era de uma rodada só. */
const ARQ = process.argv[2];
if (!ARQ) {
  console.error("uso: node scripts/local/importar-pedidos-vtrina.mjs <listagem_pedidos.xlsx>");
  process.exit(1);
}
const env = {};
for (const l of fs.readFileSync("C:/Users/dudu4/OneDrive/Desktop/plataforma/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const SB = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" };
const url = (p) => env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/" + p;
const get = async (p) => {
  const j = await (await fetch(url(p), { headers: SB })).json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j));
  return j;
};

/* ── De que canal da Vtrina para qual canal nosso ── */
const PARA_CANAL = {
  "casas bahia marketplace": "Casas Bahia",
  "magazine luiza": "Magalu",
  "madeira madeira": "Madeira Madeira",
  webcontinental: "WebContinental",
  "casa & video": "Casa & Video",
  lebiscuit: "Lebiscuit",
  "mateus mais": "Mateus Mais",
  amazon: "Amazon",
  shopee: "Shopee",
  zema: "Zema",
};
const IGNORAR = ["mercado livre", "vtex"];

const contas = await get("contas_canal?select=id,operacao_id,canal_id,nome,canais(nome)");
const porNomeCanal = new Map(
  contas.map((c) => [String((Array.isArray(c.canais) ? c.canais[0] : c.canais)?.nome ?? "").trim().toLowerCase(), c])
);

/* O ExcelJS devolve data como objeto Date, e Date não tem .result nem
   .text — sem tratar, toda data virava string vazia e a linha era
   descartada em silêncio. Foi o que aconteceu na primeira execução. */
const t = (v) => {
  if (v instanceof Date) return v.toISOString();
  const bruto = v && typeof v === "object" ? (v.result ?? v.text ?? "") : (v ?? "");
  return String(bruto).replace(/^"|"$/g, "").trim();
};
const num = (v) => {
  const s = t(v).replace(/[R$\s]/g, "");
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQ);
const s = wb.getWorksheet("Pedidos");
const cab = s.getRow(1).values.slice(1).map(t);
const col = {};
cab.forEach((c, i) => (col[c] = i + 1));

const porCanal = new Map();
let ignorados = 0, semCanal = new Set();
for (let i = 2; i <= s.rowCount; i++) {
  const r = s.getRow(i);
  const mk = t(r.getCell(col.marketplace).value).toLowerCase();
  if (!mk) continue;
  if (IGNORAR.includes(mk)) { ignorados++; continue; }

  const nomeNosso = PARA_CANAL[mk];
  const conta = nomeNosso ? porNomeCanal.get(nomeNosso.toLowerCase()) : null;
  if (!conta) { semCanal.add(mk); continue; }

  const status = t(r.getCell(col.status).value);
  const data = t(r.getCell(col.data_criacao).value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;

  /*
   * Quantos grupos de item o arquivo traz VARIA.
   *
   * A Vtrina exporta um bloco `item_pedido_N_*` por item do pedido mais
   * cheio da janela: a exportação de 30/09 tinha cinco, a de 05/10 tem
   * quatro. O laço fixo em cinco pedia uma coluna inexistente, e
   * `getCell(undefined)` derruba o importador inteiro — a carga não entrava
   * e o canal ficava com dado velho sem ninguém notar.
   */
  const itens = [];
  for (let k = 1; col[`item_pedido_${k}_sku`] != null; k++) {
    const sku = t(r.getCell(col[`item_pedido_${k}_sku`]).value);
    if (!sku) continue;
    const celula = (campo) => {
      const c = col[`item_pedido_${k}_${campo}`];
      return c != null ? r.getCell(c).value : null;
    };
    itens.push({
      sku,
      titulo: t(celula("nome")),
      quantidade: Math.max(1, Math.round(num(celula("quantidade")))),
      preco: num(celula("preco")),
    });
  }

  const lista = porCanal.get(conta.id) ?? { conta, pedidos: [] };
  lista.pedidos.push({
    codigo: t(r.getCell(col.id_pedido_marketplace).value) || t(r.getCell(col.id).value),
    data,
    status,
    cancelado: /cancel/i.test(status),
    total: num(r.getCell(col.total).value),
    frete: num(r.getCell(col.total_frete).value),
    freteVendedor: (() => {
      const c = col["dados_financeiros_Custo de Frete (Vendedor)"];
      return c != null ? num(r.getCell(c).value) || null : null;
    })(),
    itens,
  });
  porCanal.set(conta.id, lista);
}

console.log("linhas de Mercado Livre e Vtex ignoradas (já vêm por API):", ignorados);
if (semCanal.size) console.log("canais da planilha sem cadastro no sistema:", [...semCanal].join(", "));

for (const [, { conta, pedidos }] of porCanal) {
  const nome = (Array.isArray(conta.canais) ? conta.canais[0] : conta.canais)?.nome;
  const cabecalhos = pedidos.map((p) => ({
    operacao_id: conta.operacao_id,
    canal_id: conta.canal_id,
    conta_canal_id: conta.id,
    codigo_externo: p.codigo,
    data: p.data,
    status: p.status,
    cancelado: p.cancelado,
    total: p.total,
    frete: p.frete,
    frete_vendedor: p.freteVendedor,
    origem: "planilha",
  }));

  const r = await fetch(url("pedidos?on_conflict=canal_id,codigo_externo"), {
    method: "POST",
    headers: { ...SB, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(cabecalhos),
  });
  const gravados = await r.json();
  if (!Array.isArray(gravados)) { console.log(`✗ ${nome}:`, JSON.stringify(gravados).slice(0, 200)); continue; }

  const idPorCodigo = new Map(gravados.map((g) => [String(g.codigo_externo), g.id]));
  const itens = [];
  for (const p of pedidos) {
    const pid = idPorCodigo.get(p.codigo);
    if (!pid) continue;
    for (const it of p.itens) {
      itens.push({
        operacao_id: conta.operacao_id,
        pedido_id: pid,
        codigo_externo: it.sku,
        sku: it.sku,
        titulo: it.titulo,
        quantidade: it.quantidade,
        preco_unitario: it.preco,
      });
    }
  }
  // Reescreve os itens: sem apagar antes, reimportar duplicaria quantidade.
  if (idPorCodigo.size) {
    await fetch(url(`pedido_itens?pedido_id=in.(${[...idPorCodigo.values()].join(",")})`), { method: "DELETE", headers: SB });
  }
  if (itens.length) {
    const ri = await fetch(url("pedido_itens"), { method: "POST", headers: SB, body: JSON.stringify(itens) });
    if (!ri.ok) console.log("  itens:", (await ri.text()).slice(0, 200));
  }
  console.log(`✓ ${nome}: ${cabecalhos.length} pedidos, ${itens.length} itens, ${pedidos.filter((p) => p.cancelado).length} cancelados`);
}
