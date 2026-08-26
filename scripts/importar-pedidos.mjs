/**
 * Importa a listagem de pedidos do hub.
 *
 *   node scripts/importar-pedidos.mjs "<arquivo.xlsx>"
 *
 * Só entram colunas analíticas. O leitor recusa dado pessoal por
 * construção — ver src/lib/planilhas/pedidos.ts.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { lerPedidos } from "./lib/pedidos.mjs";

const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_KEY;
const OPERACAO = "00000000-0000-0000-0000-000000000101";
if (!URL_BASE || !CHAVE) { console.error("faltam SUPABASE_URL/SUPABASE_KEY"); process.exit(1); }

const cab = { apikey: CHAVE, authorization: `Bearer ${CHAVE}`, "content-type": "application/json" };

async function api(caminho, opc = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1${caminho}`, { ...opc, headers: { ...cab, ...(opc.headers ?? {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} em ${caminho}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

async function enviar(tabela, linhas, conflito, tamanho = 300) {
  let n = 0;
  for (let i = 0; i < linhas.length; i += tamanho) {
    const lote = linhas.slice(i, i + tamanho);
    await api(`/${tabela}${conflito ? `?on_conflict=${conflito}` : ""}`, {
      method: "POST",
      headers: { Prefer: `${conflito ? "resolution=merge-duplicates," : ""}return=minimal` },
      body: JSON.stringify(lote),
    });
    n += lote.length;
    process.stdout.write(`\r  ${tabela}: ${n}/${linhas.length}`);
  }
  process.stdout.write("\n");
}

/** Nome do canal no hub → canal cadastrado. */
const CANAL = {
  "vtex": "Loja própria (VTEX)",
  "mercado livre": "Mercado Livre",
  "madeira madeira": "Madeira Madeira",
  "zema": "Zema",
  "magazine luiza": "Magalu",
  "magalu": "Magalu",
  "amazon": "Amazon",
  "casas bahia": "Casas Bahia",
};

const caminho = process.argv[2];
const bytes = readFileSync(caminho);
const r = await lerPedidos(bytes);
console.log(`\n=== Pedidos: ${basename(caminho)} ===`);
console.log(`  ${r.pedidos.length} pedidos (${r.inicio} a ${r.fim})`);
console.log(`  ${r.colunasDescartadas} colunas descartadas por não serem analíticas`);
console.log(`  canais: ${Object.entries(r.marketplaces).map(([k, v]) => `${k}=${v}`).join(", ")}`);

const contas = await api("/contas_canal?select=id,nome,canal_id,canais(nome)");
const padrao = (nomeCanal) =>
  contas.find((c) => c.canais.nome === nomeCanal && c.padrao !== false) ??
  contas.find((c) => c.canais.nome === nomeCanal);

// Descobre se a migração 06 já rodou; sem ela, o líquido não tem onde ficar.
let temLiquido = true;
try { await api("/pedidos?select=liquido_recebido&limit=1"); }
catch { temLiquido = false; }
if (!temLiquido) console.log("  aviso: rode db/06_pedidos_liquido.sql para guardar frete e líquido");

const semCanal = new Set();
const linhas = [];
for (const p of r.pedidos) {
  const nome = CANAL[p.marketplace.toLowerCase()] ?? "Outros";
  const c = padrao(nome);
  if (!c) { semCanal.add(p.marketplace); continue; }
  const linha = {
    operacao_id: OPERACAO,
    canal_id: c.canal_id,
    conta_canal_id: c.id,
    codigo_externo: p.codigoExterno,
    data: p.data,
    fechado_em: p.fechadoEm ? `${p.fechadoEm}T12:00:00Z` : null,
    status: p.status || "desconhecido",
    cancelado: p.cancelado,
    total: p.total,
    frete: p.frete,
    comissao: p.comissao,
    origem: "planilha",
  };
  if (temLiquido) {
    linha.frete_vendedor = p.freteVendedor;
    linha.liquido_recebido = p.liquidoRecebido;
  }
  linhas.push(linha);
}
if (semCanal.size) console.log(`  sem canal: ${[...semCanal].join(", ")}`);

const [reg] = await api("/importacoes", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    operacao_id: OPERACAO, tipo: "consolidado", nome_arquivo: basename(caminho),
    hash_arquivo: createHash("sha256").update(bytes).digest("hex"),
    periodo_inicio: r.inicio, periodo_fim: r.fim,
    linhas_lidas: r.linhasLidas, linhas_validas: linhas.length, status: "concluida",
  }),
});
void reg;

await enviar("pedidos", linhas, "canal_id,codigo_externo");

// Itens: precisam do id do pedido, que só existe depois da gravação.
const gravados = await api("/pedidos?select=id,codigo_externo,canal_id&limit=20000");
const porCodigo = new Map(gravados.map((p) => [`${p.canal_id}|${p.codigo_externo.toUpperCase()}`, p.id]));
const anuncios = await api("/anuncios?select=id,sku_canal&limit=5000");
const porSku = new Map(anuncios.filter((a) => a.sku_canal).map((a) => [a.sku_canal.toUpperCase(), a.id]));

const itens = [];
let semPedido = 0;
for (const p of r.pedidos) {
  const nome = CANAL[p.marketplace.toLowerCase()] ?? "Outros";
  const c = padrao(nome);
  if (!c) continue;
  const pedidoId = porCodigo.get(`${c.canal_id}|${p.codigoExterno.toUpperCase()}`);
  if (!pedidoId) { semPedido += 1; continue; }
  for (const i of p.itens) {
    itens.push({
      operacao_id: OPERACAO,
      pedido_id: pedidoId,
      anuncio_id: porSku.get(i.sku.toUpperCase()) ?? null,
      codigo_externo: i.codigoExterno || i.sku,
      sku: i.sku || null,
      titulo: i.titulo || null,
      quantidade: i.quantidade,
      preco_unitario: i.precoUnitario,
    });
  }
}
if (semPedido) console.log(`  ${semPedido} pedidos sem correspondência após gravar`);

// pedido_itens não tem chave natural: limpa os do período antes de reinserir,
// senão reimportar o mesmo arquivo duplicaria cada item.
const codigos = [...new Set(linhas.map((l) => porCodigo.get(`${l.canal_id}|${l.codigo_externo.toUpperCase()}`)).filter(Boolean))];
for (let i = 0; i < codigos.length; i += 100) {
  const lote = codigos.slice(i, i + 100);
  await api(`/pedido_itens?pedido_id=in.(${lote.join(",")})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}
await enviar("pedido_itens", itens, null);

const comAnuncio = itens.filter((i) => i.anuncio_id).length;
console.log(`\n=== resumo ===`);
console.log(`  pedidos     : ${linhas.length}`);
console.log(`  itens       : ${itens.length}  (${comAnuncio} ligados a anúncio pelo SKU)`);
