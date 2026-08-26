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
    await api(`/${tabela}${conflito ? `?on_conflict=${conflito}` : ""}`, {
      method: "POST",
      headers: {
        Prefer: `${conflito ? "resolution=merge-duplicates," : ""}return=minimal`,
      },
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

  const qtdMetas = await importarMetas(r.linhas, contas);
  console.log(`  metas mensais: ${qtdMetas}`);
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



/**
 * Metas mensais por canal.
 *
 * A planilha traz a meta repetida em cada DIA do mês; a tabela guarda por
 * MÊS. Somar os dias daria doze vezes a meta, então o valor de um dia
 * qualquer do mês é o que vale — todos são iguais por construção.
 */
async function importarMetas(linhas, contas) {
  const porMes = new Map();
  for (const l of linhas) {
    if (l.meta == null || l.meta <= 0) continue;
    const c = contas.find(
      (x) => x.canais.nome === l.canal && x.nome === l.conta
    );
    if (!c) continue;
    const [ano, mes] = l.data.split("-").map(Number);
    porMes.set(`${c.canal_id}|${ano}|${mes}`, {
      operacao_id: OPERACAO,
      canal_id: c.canal_id,
      ano,
      mes,
      receita_meta: +l.meta.toFixed(2),
    });
  }
  const metas = [...porMes.values()];
  if (!metas.length) { console.log("  nenhuma meta na planilha"); return 0; }

  // Sem chave natural na tabela: limpa o que existe do período e regrava.
  const anos = [...new Set(metas.map((m) => m.ano))];
  for (const ano of anos) {
    await api(`/metas?ano=eq.${ano}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }
  await enviar("metas", metas, null);
  return metas.length;
}

/* ── Catálogo de anúncios ─────────────────────────────────── */

/** Semana ISO de uma data, para carimbar o retrato da vitrine. */
function semanaIso(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const ano = d.getUTCFullYear();
  const q = new Date(Date.UTC(ano, 0, 4));
  q.setUTCDate(q.getUTCDate() - ((q.getUTCDay() + 6) % 7) + 3);
  return { ano, semana: 1 + Math.round((d.getTime() - q.getTime()) / (7 * 86400000)) };
}

async function importarCatalogo(caminho, { lerCatalogo }, dataBase) {
  console.log(`
=== Catálogo: ${basename(caminho)} ===`);
  const bytes = readFileSync(caminho);
  const r = await lerCatalogo(bytes);
  console.log(`  ${r.itens.length} anúncios`);

  const contas = await api("/contas_canal?select=id,nome,canal_id,canais(nome)");
  const ml = contas.find(
    (c) => c.canais.nome === "Mercado Livre" && c.nome.startsWith("São Paulo")
  );
  if (!ml) throw new Error("conta do Mercado Livre não encontrada");

  // O export traz uma linha por VARIAÇÃO; o anúncio é o mesmo. Consolida
  // ficando com o menor preço e somando o estoque das variações.
  const porMlb = new Map();
  for (const i of r.itens) {
    const at = porMlb.get(i.mlb);
    if (!at) { porMlb.set(i.mlb, { ...i }); continue; }
    if (i.preco != null && (at.preco == null || i.preco < at.preco)) at.preco = i.preco;
    at.estoque = (at.estoque ?? 0) + (i.estoque ?? 0);
  }
  const itens = [...porMlb.values()];
  console.log(`  ${itens.length} anúncios distintos (variações consolidadas)`);

  await enviar("anuncios", itens.map((i) => ({
    operacao_id: OPERACAO,
    canal_id: ml.canal_id,
    conta_canal_id: ml.id,
    codigo_externo: i.mlb,
    titulo: i.titulo || i.mlb,
    sku_canal: i.sku || null,
    tipo: i.tipo,
    status: i.status,
    preco_atual: i.preco,
    comissao_atual: i.tarifa,
  })), "canal_id,codigo_externo");

  const mapa = await api(`/anuncios?select=id,codigo_externo&canal_id=eq.${ml.canal_id}&limit=5000`);
  const porCodigo = new Map(mapa.map((a) => [a.codigo_externo.toUpperCase(), a.id]));
  const { ano, semana } = semanaIso(dataBase);

  const retratos = [];
  for (const i of itens) {
    const id = porCodigo.get(i.mlb.toUpperCase());
    if (!id || i.preco == null) continue;
    retratos.push({
      operacao_id: OPERACAO,
      anuncio_id: id,
      ano_iso: ano,
      semana_iso: semana,
      preco: i.preco,
      status: i.status,
      disponivel: i.estoque,
    });
  }
  await registrar("catalogo", caminho, bytes, dataBase, dataBase, r.itens.length, itens.length);
  await enviar("anuncio_precos_vitrine", retratos, "anuncio_id,ano_iso,semana_iso");
  console.log(`  retrato da vitrine gravado em ${ano}-S${semana}`);
  return itens.length;
}

/* ── Execução ─────────────────────────────────────────────── */

const [pastaDesempenho, arquivoKpis, arquivoCatalogo, dataBase] = process.argv.slice(2);
const desempenho = await import(new URL("lib/desempenho.mjs", import.meta.url).href);
const kpis = await import(new URL("lib/kpis.mjs", import.meta.url).href);
const catalogo = await import(new URL("lib/catalogo.mjs", import.meta.url).href);

const linhasKpi = arquivoKpis ? await importarKpis(arquivoKpis, kpis) : 0;
const linhasDes = pastaDesempenho ? await importarDesempenho(pastaDesempenho, desempenho) : 0;
const linhasCat = arquivoCatalogo
  ? await importarCatalogo(
      arquivoCatalogo,
      catalogo,
      dataBase ?? new Date().toISOString().slice(0, 10)
    )
  : 0;

console.log(`\n=== resumo ===`);
console.log(`  vendas_diarias            : ${linhasKpi}`);
console.log(`  anuncio_desempenho_semanal: ${linhasDes}`);
console.log(`  catálogo / vitrine        : ${linhasCat}`);
