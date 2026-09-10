/**
 * Atualiza a Fórmula base com a matriz de preços de UMA LINHA de produto.
 *
 *   node scripts/importar-faixas-linha.mjs "<planilha.xlsx>" "<aba>" [--aplicar]
 *
 * Sem `--aplicar` só mostra o que faria. É proposital: preço errado na
 * base não estoura — vira oferta aceita barato demais, e o prejuízo só
 * aparece no fechamento do mês.
 *
 * ── O formato que ele lê ──
 *
 *   linha 1  → as faixas de comissão, em fração (0,205 … 0,045)
 *   linha 2  → cabeçalhos (id_variante, marca, nome_produto, …)
 *   linha 3+ → um SKU por linha, com o preço de tabela em cada faixa
 *
 * É a mesma forma das abas "Base com preços" e "Boa forma" da Fórmula
 * base, só que as faixas começam noutra coluna. Por isso o script acha a
 * primeira coluna numérica da linha 1 em vez de assumir a terceira.
 *
 * ── Versionamento ──
 *
 * Grava numa `vigente_de` NOVA, copiando a versão anterior inteira antes
 * de sobrepor os SKUs desta planilha. Atualizar no lugar seria mais
 * simples e apagaria a base sobre a qual os relatórios antigos foram
 * feitos.
 *
 * A ordem importa: os PREÇOS entram primeiro e os ITENS por último.
 * `carregarFormulaBase` escolhe a versão pelo último `vigente_de` de
 * `formula_base_itens`, então a versão nova só passa a valer quando a
 * última etapa termina. Se algo falhar no meio, o sistema segue na versão
 * antiga, inteira.
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const [, , arquivo, nomeAba, ...resto] = process.argv;
const APLICAR = resto.includes("--aplicar");

if (!arquivo || !nomeAba) {
  console.error(
    'uso: node scripts/importar-faixas-linha.mjs "<planilha.xlsx>" "<aba>" [--aplicar]'
  );
  process.exit(1);
}

/* ── Credenciais ───────────────────────────────────────────────── */

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const URL_BASE = process.env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CHAVE) {
  console.error("faltam SUPABASE_URL/SUPABASE_KEY (ou as do .env.local)");
  process.exit(1);
}

const cab = { apikey: CHAVE, authorization: `Bearer ${CHAVE}`, "content-type": "application/json" };
async function api(caminho, opc = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1${caminho}`, {
    ...opc,
    headers: { ...cab, ...(opc.headers ?? {}) },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} em ${caminho}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}
/** O PostgREST corta em 1000; lê em páginas. */
async function lerTudo(caminho) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1${caminho}`, {
      headers: { ...cab, Range: `${de}-${de + 999}` },
    });
    if (!r.ok) throw new Error(`${r.status} em ${caminho}`);
    const j = await r.json();
    out.push(...j);
    if (j.length < 1000) return out;
  }
}
async function enviar(tabela, linhas, conflito, tamanho = 500) {
  let n = 0;
  for (let i = 0; i < linhas.length; i += tamanho) {
    const lote = linhas.slice(i, i + tamanho);
    await api(`/${tabela}?on_conflict=${conflito}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(lote),
    });
    n += lote.length;
    process.stdout.write(`\r  ${tabela}: ${n}/${linhas.length}`);
  }
  process.stdout.write("\n");
}

const brl = (v) =>
  Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── Leitura da planilha ───────────────────────────────────────── */

const numero = (cell) => {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === "object" && v.result !== undefined) return Number(v.result);
  if (typeof v === "object") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(arquivo);
const ws = wb.getWorksheet(nomeAba);
if (!ws) {
  console.error(
    `aba "${nomeAba}" não existe. Abas: ${wb.worksheets.map((w) => w.name).join(", ")}`
  );
  process.exit(1);
}

/* As faixas: primeira sequência numérica da linha 1. */
const faixas = [];
for (let c = 1; c <= ws.columnCount; c++) {
  const v = numero(ws.getCell(1, c));
  if (v == null) continue;
  // Aceita 0,155 e 15,5 — a planilha varia conforme quem a formatou.
  const fracao = v > 1 ? v / 100 : v;
  if (fracao > 0 && fracao < 1) faixas.push({ col: c, comissao: Math.round(fracao * 1000) / 1000 });
}
if (!faixas.length) {
  console.error("não achei faixas de comissão na linha 1.");
  process.exit(1);
}

console.log(`aba "${nomeAba}" · ${faixas.length} faixas · colunas ${faixas[0].col} a ${faixas[faixas.length - 1].col}`);
console.log("faixas:", faixas.map((f) => (f.comissao * 100).toFixed(1) + "%").join(" "));

/*
 * A CORREÇÃO da faixa fora de sequência.
 *
 * Os multiplicadores desta planilha caem 0,01 por coluna. Onde um valor
 * rompe a sequência, o preço é recalculado pelo multiplicador que a
 * sequência pedia — a partir da coluna "Tx antecipação", que é a base de
 * todos eles.
 *
 * Isso NÃO é um conserto genérico de planilha: só age quando o desvio é
 * exatamente reconstituível, e cada linha alterada é impressa para
 * conferência. Se a sequência não for detectável, nada é tocado.
 */
const colBase = faixas[0].col - 1; // "Tx antecipação", logo antes das faixas
const multiplicador = (col) => {
  const primeira = numero(ws.getCell(3, faixas[0].col)) / numero(ws.getCell(3, colBase));
  return primeira - (col - faixas[0].col) * 0.01;
};

const linhas = [];
const corrigidas = [];
for (let r = 3; r <= ws.rowCount; r++) {
  const sku = ws.getCell(r, 1).text?.trim();
  if (!sku) continue;
  const base = numero(ws.getCell(r, colBase));

  for (const f of faixas) {
    const bruto = numero(ws.getCell(r, f.col));
    if (bruto == null || bruto <= 0) continue;

    let preco = bruto;
    if (base && base > 0) {
      const esperado = multiplicador(f.col);
      const real = bruto / base;
      // Meio ponto percentual de folga: arredondamento não conta como desvio.
      if (Math.abs(real - esperado) > 0.005) {
        preco = Math.round(base * esperado * 100) / 100;
        corrigidas.push({
          sku,
          comissao: f.comissao,
          de: bruto,
          para: preco,
          multDe: real,
          multPara: esperado,
        });
      }
    }
    linhas.push({ sku, comissao: f.comissao, preco: Math.round(preco * 100) / 100 });
  }
}

const skus = [...new Set(linhas.map((l) => l.sku))];
console.log(`\n${skus.length} SKUs · ${linhas.length} preços`);

if (corrigidas.length) {
  const faixasAfetadas = [...new Set(corrigidas.map((c) => c.comissao))];
  console.log(
    `\n⚠ ${corrigidas.length} valores fora da sequência, nas faixas ` +
      faixasAfetadas.map((f) => (f * 100).toFixed(1) + "%").join(", ")
  );
  console.log("  sku        faixa    planilha        corrigido    multiplicador");
  for (const c of corrigidas) {
    console.log(
      `  ${c.sku.padEnd(10)} ${(c.comissao * 100).toFixed(1).padStart(5)}%  ` +
        `${brl(c.de).padStart(11)}  →  ${brl(c.para).padStart(11)}    ` +
        `${c.multDe.toFixed(4)} → ${c.multPara.toFixed(4)}`
    );
  }
}

/* ── Versão nova ───────────────────────────────────────────────── */

const OPERACAO = env.OPERACAO_ID ?? "00000000-0000-0000-0000-000000000101";
const hoje = new Date().toISOString().slice(0, 10);

const versoes = await lerTudo(
  `/formula_base_itens?select=vigente_de&order=vigente_de.desc&limit=1`
);
const anterior = versoes[0]?.vigente_de;
if (!anterior) {
  console.error("não há Fórmula base para versionar. Importe a base completa primeiro.");
  process.exit(1);
}
if (anterior === hoje) {
  console.log(`\nA versão de hoje (${hoje}) já existe — os SKUs desta planilha serão sobrepostos nela.`);
}

const itensAnt = await lerTudo(
  `/formula_base_itens?vigente_de=eq.${anterior}&select=mlb,sku,tipo_anuncio,comissao_padrao`
);
const precosAnt = await lerTudo(
  `/formula_base_precos?vigente_de=eq.${anterior}&select=chave_tipo,chave,comissao,preco`
);

const novos = new Set(linhas.map((l) => `${l.sku.toUpperCase()}|${l.comissao}`));
const herdados = precosAnt.filter(
  (p) => !(p.chave_tipo === "sku" && novos.has(`${String(p.chave).toUpperCase()}|${Number(p.comissao)}`))
);
const jaExistiam = skus.filter((s) =>
  precosAnt.some((p) => p.chave_tipo === "sku" && String(p.chave).toUpperCase() === s.toUpperCase())
);

console.log(`\nversão anterior: ${anterior} · ${itensAnt.length} itens · ${precosAnt.length} preços`);
console.log(`versão nova    : ${hoje}`);
console.log(`  preços herdados : ${herdados.length}`);
console.log(`  preços novos    : ${linhas.length}  (${skus.length} SKUs, ${jaExistiam.length} já existiam)`);
console.log(`  total resultante: ${herdados.length + linhas.length}`);

if (!APLICAR) {
  console.log("\n(simulação — nada foi gravado. Rode de novo com --aplicar)");
  process.exit(0);
}

const paraGravar = [
  ...herdados.map((p) => ({
    operacao_id: OPERACAO,
    vigente_de: hoje,
    chave_tipo: p.chave_tipo,
    chave: p.chave,
    comissao: Number(p.comissao),
    preco: Number(p.preco),
  })),
  ...linhas.map((l) => ({
    operacao_id: OPERACAO,
    vigente_de: hoje,
    chave_tipo: "sku",
    chave: l.sku,
    comissao: l.comissao,
    preco: l.preco,
  })),
];

console.log("\ngravando…");
await enviar(
  "formula_base_precos",
  paraGravar,
  "operacao_id,chave_tipo,chave,comissao,vigente_de"
);

/*
 * Os itens por último: é o que faz a versão nova passar a valer. Até
 * aqui, o sistema seguia usando a anterior inteira.
 */
await enviar(
  "formula_base_itens",
  itensAnt.map((i) => ({
    operacao_id: OPERACAO,
    vigente_de: hoje,
    mlb: i.mlb,
    sku: i.sku,
    tipo_anuncio: i.tipo_anuncio,
    comissao_padrao: Number(i.comissao_padrao),
  })),
  "operacao_id,mlb,vigente_de"
);

console.log(`\npronto. Fórmula base vigente desde ${hoje}.`);
console.log(`para desfazer: apagar formula_base_itens e _precos com vigente_de = ${hoje}`);
