/**
 * Completa as visitas que faltam em vendas_diarias, a partir do relatório
 * de desempenho de anúncios.
 *
 *   node scripts/completar-visitas.mjs
 *
 * POR QUÊ
 *
 * A planilha de KPIs veio sem agosto para o Mercado Livre São Paulo. Os
 * pedidos e a receita desses dias entraram pela listagem de pedidos, que
 * não traz visitas — e conversão com numerador cheio e denominador vazio
 * dá 1,7% onde o real é 0,7%.
 *
 * O relatório de desempenho tem as visitas, mas por SEMANA. Este script
 * usa o total da semana e o reparte entre os dias que já têm movimento.
 *
 * O QUE ISSO SIGNIFICA
 *
 * O total da SEMANA fica exato — e é ele que as análises usam. O número
 * de um DIA isolado passa a ser uma média, não uma medição. Por isso cada
 * linha tocada recebe uma observação dizendo de onde veio: quem abrir o
 * dia precisa saber que aquele número não foi medido naquele dia.
 *
 * Só toca dia SEM visita. Dia medido não é sobrescrito por média.
 */
import { createHash } from "node:crypto";

const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_KEY;
const OPERACAO = "00000000-0000-0000-0000-000000000101";
if (!URL_BASE || !CHAVE) {
  console.error("faltam SUPABASE_URL/SUPABASE_KEY");
  process.exit(1);
}
void createHash;

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
  if (!r.ok) throw new Error(`${r.status} em ${caminho}: ${txt.slice(0, 250)}`);
  return txt ? JSON.parse(txt) : null;
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
  }
}

function semanaIso(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const ano = d.getUTCFullYear();
  const q = new Date(Date.UTC(ano, 0, 4));
  q.setUTCDate(q.getUTCDate() - ((q.getUTCDay() + 6) % 7) + 3);
  return { ano, semana: 1 + Math.round((d - q) / (7 * 86400000)) };
}

/* ── Visitas por semana, do relatório de desempenho ─────────── */

const desempenho = await lerTudo(
  "/anuncio_desempenho_semanal?select=ano_iso,semana_iso,visitas,anuncios(conta_canal_id)"
);

const porSemanaConta = new Map();
for (const d of desempenho) {
  const conta = d.anuncios?.conta_canal_id;
  if (!conta) continue;
  const k = `${conta}|${d.ano_iso}|${d.semana_iso}`;
  porSemanaConta.set(k, (porSemanaConta.get(k) ?? 0) + (d.visitas ?? 0));
}
console.log(`semanas com visitas no desempenho: ${porSemanaConta.size}`);

/* ── Dias sem visita em vendas_diarias ──────────────────────── */

const dias = await lerTudo(
  "/vendas_diarias?select=id,conta_canal_id,canal_id,data,visitas,pedidos,receita"
);

const porSemana = new Map();
for (const l of dias) {
  const { ano, semana } = semanaIso(l.data);
  const k = `${l.conta_canal_id}|${ano}|${semana}`;
  const g = porSemana.get(k) ?? { linhas: [], visitasJa: 0 };
  g.linhas.push(l);
  g.visitasJa += l.visitas ?? 0;
  porSemana.set(k, g);
}

const atualizacoes = [];
let semFonte = 0;

for (const [k, g] of porSemana) {
  const totalSemana = porSemanaConta.get(k);
  if (totalSemana == null) continue;

  const furados = g.linhas.filter((l) => (l.visitas ?? 0) === 0);
  if (!furados.length) continue;

  // O que sobra depois do que já foi medido nos outros dias.
  const aRepartir = totalSemana - g.visitasJa;
  if (aRepartir <= 0) {
    semFonte++;
    continue;
  }

  const porDia = Math.round(aRepartir / furados.length);
  const [, ano, semana] = k.split("|");

  for (const l of furados) {
    atualizacoes.push({
      operacao_id: OPERACAO,
      canal_id: l.canal_id,
      conta_canal_id: l.conta_canal_id,
      data: l.data,
      visitas: porDia,
      observacao:
        `visitas repartidas do total da semana ${ano}-S${semana} ` +
        `(${totalSemana}) — relatório de desempenho, não medição do dia`,
    });
  }
}

console.log(`dias a completar: ${atualizacoes.length}`);
if (semFonte) {
  console.log(`  ${semFonte} semanas já tinham visitas acima do total — não tocadas`);
}

if (atualizacoes.length) {
  await enviar("vendas_diarias", atualizacoes, "conta_canal_id,data");
  const semanas = new Set(atualizacoes.map((a) => semanaIso(a.data).semana));
  console.log(`gravado. semanas afetadas: ${[...semanas].sort((x, y) => x - y).join(", ")}`);
} else {
  console.log("nada a completar");
}
