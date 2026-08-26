/**
 * Carrega as planilhas no Supabase.
 *
 * Roda pelo terminal enquanto a tela de importação não existe. A lógica
 * de gravação fica aqui de propósito: é a mesma que a rota de API vai
 * usar, e testá-la por script é mais rápido que por formulário.
 *
 *   node scripts/importar.mjs "<pasta desempenho>" "<arquivo kpis>"
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";

const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_KEY;
const OPERACAO = "00000000-0000-0000-0000-000000000101";
if (!URL_BASE || !CHAVE) { console.error("faltam SUPABASE_URL/SUPABASE_KEY"); process.exit(1); }

const cab = {
  apikey: CHAVE,
  authorization: `Bearer ${CHAVE}`,
  "content-type": "application/json",
};

async function api(caminho, opc = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1${caminho}`, {
    ...opc,
    headers: { ...cab, ...(opc.headers ?? {}) },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} em ${caminho}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

/** Envia em lotes: uma requisição com 800 linhas estoura o limite. */
async function enviar(tabela, linhas, conflito, tamanho = 400) {
  let gravadas = 0;
  for (let i = 0; i < linhas.length; i += tamanho) {
    const lote = linhas.slice(i, i + tamanho);
    await api(`/${tabela}?on_conflict=${conflito}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(lote),
    });
    gravadas += lote.length;
    process.stdout.write(`\r  ${tabela}: ${gravadas}/${linhas.length}`);
  }
  process.stdout.write("\n");
  return gravadas;
}

async function registrar(tipo, arquivo, bytes, inicio, fim, lidas, validas) {
  const [reg] = await api("/importacoes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      operacao_id: OPERACAO,
      tipo,
      nome_arquivo: basename(arquivo),
      hash_arquivo: createHash("sha256").update(bytes).digest("hex"),
      periodo_inicio: inicio,
      periodo_fim: fim,
      linhas_lidas: lidas,
      linhas_validas: validas,
      status: "concluida",
    }),
  });
  return reg.id;
}

/* ── KPIs diários ─────────────────────────────────────────── */

async function importarKpis(caminho, { lerKpisDiarios }) {
  console.log(`\n=== KPIs: ${basename(caminho)} ===`);
  const bytes = readFileSync(caminho);
  const r = await lerKpisDiarios(bytes);
  console.log(`  ${r.diasLidos} dias, ${r.linhas.length} linhas canal-dia`);
  if (r.ignorados.length) console.log(`  ignorado: ${r.ignorados.join(", ")}`);

  const contas = await api(
    "/contas_canal?select=id,nome,canal_id,canais(nome)"
  );
  const achar = (canal, conta) =>
    contas.find((c) => c.canais.nome === canal && c.nome === conta);

  const semDestino = new Set();
  const linhas = [];
  for (const l of r.linhas) {
    const c = achar(l.canal, l.conta);
    if (!c) { semDestino.add(`${l.canal} · ${l.conta}`); continue; }
    linhas.push({
      operacao_id: OPERACAO,
      canal_id: c.canal_id,
      conta_canal_id: c.id,
      data: l.data,
      visitas: Math.round(l.visitas ?? 0),
      pedidos: Math.round(l.pedidos),
      receita: +l.receita.toFixed(2),
      investimento_ads: +(l.investimentoAds ?? 0).toFixed(2),
      pedidos_cancelados: Math.round(l.pedidosCancelados),
      valor_cancelado: +l.valorCancelado.toFixed(2),
      origem: "planilha",
    });
  }
  if (semDestino.size) console.log(`  SEM CANAL NO BANCO: ${[...semDestino].join(", ")}`);

  await registrar("consolidado", caminho, bytes, r.inicio, r.fim, r.linhas.length, linhas.length);
  await enviar("vendas_diarias", linhas, "conta_canal_id,data");
  return linhas.length;
}

/* ── Desempenho de anúncios ───────────────────────────────── */

async function importarDesempenho(pasta, { parsePerformanceReport }) {
  const arquivos = readdirSync(pasta)
    .filter((f) => /^Relatorio_desempenho.*\.xlsx$/i.test(f))
    .sort();
  console.log(`\n=== Desempenho: ${arquivos.length} arquivos ===`);

  const contas = await api("/contas_canal?select=id,nome,canal_id,canais(nome)");
  const ml = contas.find(
    (c) => c.canais.nome === "Mercado Livre" && c.nome.startsWith("São Paulo")
  );
  if (!ml) throw new Error("conta do Mercado Livre não encontrada");

  let totalSemanas = 0;
  for (const nome of arquivos) {
    const caminho = `${pasta}/${nome}`;
    const bytes = readFileSync(caminho);
    const r = await parsePerformanceReport(bytes, nome);
    if (!r.inicio || !r.fim) { console.log(`  ${nome}: sem período — pulado`); continue; }
    console.log(`  ${nome.slice(35, 55)} → ${r.anoIso}-S${r.semanaIso} (${r.data.length} anúncios)`);

    // Anúncios primeiro: o desempenho referencia anuncios.id.
    const anuncios = r.data.map((a) => ({
      operacao_id: OPERACAO,
      canal_id: ml.canal_id,
      conta_canal_id: ml.id,
      codigo_externo: a.mlb,
      titulo: a.titulo || a.mlb,
      sku_canal: a.sku || null,
      status: /pausad/i.test(a.status) ? "pausado"
            : /finaliz/i.test(a.status) ? "finalizado"
            : "ativo",
    }));
    await enviar("anuncios", anuncios, "canal_id,codigo_externo");

    const mapa = await api(
      `/anuncios?select=id,codigo_externo&canal_id=eq.${ml.canal_id}`
    );
    const porCodigo = new Map(mapa.map((a) => [a.codigo_externo.toUpperCase(), a.id]));

    const importacaoId = await registrar(
      "desempenho_anuncios", caminho, bytes, r.inicio, r.fim, r.data.length, r.data.length
    );

    const semanas = [];
    for (const a of r.data) {
      const id = porCodigo.get(a.mlb.toUpperCase());
      if (!id) continue;
      semanas.push({
        operacao_id: OPERACAO,
        anuncio_id: id,
        ano_iso: r.anoIso,
        semana_iso: r.semanaIso,
        inicio: r.inicio,
        fim: r.fim,
        visitas: Math.round(a.visitas),
        vendas: Math.round(a.vendas),
        receita: +a.receita.toFixed(2),
        // Preço pago da semana: receita dividida pelas unidades. É o que a
        // planilha permite; o preço da vitrine só vem da API.
        preco_praticado: a.vendas > 0 ? +(a.receita / a.vendas).toFixed(2) : null,
        importacao_id: importacaoId,
      });
    }
    await enviar("anuncio_desempenho_semanal", semanas, "anuncio_id,ano_iso,semana_iso");
    totalSemanas += semanas.length;
  }
  return totalSemanas;
}

/* ── Execução ─────────────────────────────────────────────── */

const [pastaDesempenho, arquivoKpis] = process.argv.slice(2);
const desempenho = await import(new URL("lib/desempenho.mjs", import.meta.url).href);
const kpis = await import(new URL("lib/kpis.mjs", import.meta.url).href);

const linhasKpi = arquivoKpis ? await importarKpis(arquivoKpis, kpis) : 0;
const linhasDes = pastaDesempenho ? await importarDesempenho(pastaDesempenho, desempenho) : 0;

console.log(`\n=== resumo ===`);
console.log(`  vendas_diarias            : ${linhasKpi}`);
console.log(`  anuncio_desempenho_semanal: ${linhasDes}`);
