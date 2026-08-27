/**
 * Importa o relatório de vendas do Mercado Livre.
 *
 *   node scripts/importar-vendas-meli.mjs "<arquivo.xlsx>"
 *
 * Grava duas coisas que nenhuma outra planilha tem:
 *
 *  1. RECEITA ATRIBUÍDA À MÍDIA, por dia. É o denominador do ACOS. Sem
 *     ela, ACOS e ROAS ficavam nulos e a tela mostrava traço.
 *
 *  2. COMISSÃO EFETIVA, por anúncio e por semana. Sai do que o canal
 *     cobrou de fato, não da faixa da Fórmula base — que é uma tabela de
 *     referência, não o extrato.
 *
 * Só toca esses dois campos. Receita e pedidos continuam vindo de onde
 * vinham: misturar fontes para o mesmo número é como dois totais do mesmo
 * período passam a divergir.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { lerVendasMeli } from "./lib/vendas-meli.mjs";

const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_KEY;
const OPERACAO = "00000000-0000-0000-0000-000000000101";
if (!URL_BASE || !CHAVE) {
  console.error("faltam SUPABASE_URL/SUPABASE_KEY");
  process.exit(1);
}

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
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} em ${caminho}: ${t.slice(0, 250)}`);
  return t ? JSON.parse(t) : null;
}

async function lerTudo(caminho, passo = 1000) {
  const todos = [];
  for (let off = 0; ; off += passo) {
    const j = caminho.includes("?") ? "&" : "?";
    const p = await api(`${caminho}${j}limit=${passo}&offset=${off}`);
    todos.push(...p);
    if (p.length < passo) return todos;
  }
}

async function enviar(tabela, linhas, conflito, tamanho = 300) {
  for (let i = 0; i < linhas.length; i += tamanho) {
    await api(`/${tabela}?on_conflict=${conflito}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(linhas.slice(i, i + tamanho)),
    });
    process.stdout.write(`\r  ${tabela}: ${Math.min(i + tamanho, linhas.length)}/${linhas.length}`);
  }
  process.stdout.write("\n");
}

function semanaIso(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const ano = d.getUTCFullYear();
  const q = new Date(Date.UTC(ano, 0, 4));
  q.setUTCDate(q.getUTCDate() - ((q.getUTCDay() + 6) % 7) + 3);
  return { ano, semana: 1 + Math.round((d - q) / (7 * 86400000)) };
}

const caminho = process.argv[2];
const bytes = readFileSync(caminho);
const r = await lerVendasMeli(bytes);

console.log(`\n=== ${basename(caminho)} ===`);
console.log(`  ${r.vendas.length} vendas (${r.inicio} a ${r.fim})`);
console.log(`  depósitos: ${Object.entries(r.depositos).map(([k, v]) => `${k}=${v}`).join(", ")}`);

const contas = await api("/contas_canal?select=id,nome,canal_id,canais(nome)");
const sp = contas.find(
  (c) => c.canais.nome === "Mercado Livre" && c.nome.startsWith("São Paulo")
);
if (!sp) throw new Error("conta São Paulo não encontrada");

await api("/importacoes", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({
    operacao_id: OPERACAO,
    tipo: "consolidado",
    nome_arquivo: basename(caminho),
    hash_arquivo: createHash("sha256").update(bytes).digest("hex"),
    periodo_inicio: r.inicio,
    periodo_fim: r.fim,
    linhas_lidas: r.linhasLidas,
    linhas_validas: r.vendas.length,
    status: "concluida",
  }),
});

/* ── 1. Receita atribuída à mídia, por dia ─────────────────── */

const adsPorDia = new Map();
for (const v of r.vendas) {
  if (!v.porPublicidade) continue;
  adsPorDia.set(v.data, (adsPorDia.get(v.data) ?? 0) + v.receita);
}

// Só atualiza dia que já existe: criar linha nova aqui inventaria um dia
// de venda a partir de um recorte parcial do canal.
const existentes = new Set(
  (
    await lerTudo(
      `/vendas_diarias?select=data&conta_canal_id=eq.${sp.id}&data=gte.${r.inicio}&data=lte.${r.fim}`
    )
  ).map((x) => x.data)
);

const diasAds = [...adsPorDia.entries()]
  .filter(([data]) => existentes.has(data))
  .map(([data, receita]) => ({
    operacao_id: OPERACAO,
    canal_id: sp.canal_id,
    conta_canal_id: sp.id,
    data,
    receita_ads: Math.round(receita * 100) / 100,
  }));

console.log(`\n  dias com receita de mídia: ${diasAds.length} de ${adsPorDia.size}`);
if (diasAds.length) await enviar("vendas_diarias", diasAds, "conta_canal_id,data");

/* ── 2. Comissão efetiva por anúncio e semana ──────────────── */

const porAnuncioSemana = new Map();
for (const v of r.vendas) {
  if (!v.mlb || v.receita <= 0) continue;
  const { ano, semana } = semanaIso(v.data);
  const k = `${v.mlb}|${ano}|${semana}`;
  const g = porAnuncioSemana.get(k) ?? { receita: 0, tarifa: 0 };
  g.receita += v.receita;
  g.tarifa += v.tarifa;
  porAnuncioSemana.set(k, g);
}

const anuncios = await lerTudo("/anuncios?select=id,codigo_externo");
const porCodigo = new Map(anuncios.map((a) => [a.codigo_externo.toUpperCase(), a.id]));

const semanas = await lerTudo(
  "/anuncio_desempenho_semanal?select=id,anuncio_id,ano_iso,semana_iso"
);
const porChave = new Map(
  semanas.map((s) => [`${s.anuncio_id}|${s.ano_iso}|${s.semana_iso}`, s.id])
);

const comissoes = [];
let semLinha = 0;
for (const [k, g] of porAnuncioSemana) {
  const [mlb, ano, semana] = k.split("|");
  const anuncioId = porCodigo.get(mlb.toUpperCase());
  if (!anuncioId) continue;
  if (!porChave.has(`${anuncioId}|${ano}|${semana}`)) {
    // Semana sem relatório de desempenho importado: não há linha para
    // completar, e criar uma aqui traria comissão sem visitas nem vendas.
    semLinha++;
    continue;
  }
  comissoes.push({
    operacao_id: OPERACAO,
    anuncio_id: anuncioId,
    ano_iso: Number(ano),
    semana_iso: Number(semana),
    inicio: null,
    fim: null,
    comissao_negociada: Math.round((g.tarifa / g.receita) * 10000) / 100,
  });
}

console.log(`  comissões a gravar: ${comissoes.length}`);
if (semLinha) console.log(`  ${semLinha} pares anúncio-semana sem linha de desempenho — ignorados`);

/*
 * `inicio` e `fim` são NOT NULL na tabela, então o upsert precisa deles.
 * Reaproveita os da linha que já existe, em vez de recalcular: recalcular
 * abriria espaço para gravar um intervalo diferente do que a importação
 * original registrou.
 */
const intervalos = new Map(
  (await lerTudo("/anuncio_desempenho_semanal?select=ano_iso,semana_iso,inicio,fim")).map((s) => [
    `${s.ano_iso}|${s.semana_iso}`,
    { inicio: s.inicio, fim: s.fim },
  ])
);
for (const c of comissoes) {
  const iv = intervalos.get(`${c.ano_iso}|${c.semana_iso}`);
  c.inicio = iv?.inicio;
  c.fim = iv?.fim;
}

const validas = comissoes.filter((c) => c.inicio && c.fim);
if (validas.length) {
  await enviar("anuncio_desempenho_semanal", validas, "anuncio_id,ano_iso,semana_iso");
}

const receitaAds = [...adsPorDia.values()].reduce((s, v) => s + v, 0);
const totalRec = r.vendas.reduce((s, v) => s + v.receita, 0);
const totalTar = r.vendas.reduce((s, v) => s + v.tarifa, 0);

console.log(`\n=== resumo ===`);
console.log(`  receita no relatório : R$ ${totalRec.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
console.log(`  tarifa cobrada       : R$ ${totalTar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}  (${((totalTar / totalRec) * 100).toFixed(2)}%)`);
console.log(`  receita de mídia     : R$ ${receitaAds.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}  (${((receitaAds / totalRec) * 100).toFixed(1)}% da receita)`);
console.log(`  comissões gravadas   : ${validas.length}`);
