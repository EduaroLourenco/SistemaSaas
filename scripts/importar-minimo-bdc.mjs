/**
 * A aba "Preço Mínimo" da Bom de Compras vira piso em toda faixa de comissão.
 *
 *   node scripts/importar-minimo-bdc.mjs [--gravar]
 *
 * Sem `--gravar` só mostra o que faria.
 *
 * ── A conta ──
 *
 * A planilha dá o preço mínimo em DUAS comissões: 11,5% (Meli Clássico) e
 * 16,5% (Premium). O piso de qualquer comissão sai desses dois pontos,
 * porque os dois obedecem à mesma forma:
 *
 *   piso(c) = F / (1 − c − k)
 *
 * onde F é a parte fixa (mercadoria, frete, embalagem) e k a parte que
 * acompanha o preço (imposto + margem). Duas equações, duas incógnitas:
 *
 *   k = ((1−c₁)·p₁ − (1−c₂)·p₂) / (p₁ − p₂)
 *   F = p₁ · (1 − c₁ − k)
 *
 * A curva passa EXATA pelos dois preços da planilha — eles não são
 * recalculados, são o que ancora tudo — e entrega o piso nas outras
 * faixas, que é o que a campanha com redução de tarifa precisa.
 *
 * ── Quando só há um preço ──
 *
 * 16 linhas têm preço só no clássico. Um ponto não resolve duas
 * incógnitas, então entra a coluna de custo da própria planilha como F, e
 * k sai do único preço. Sem custo informado (a planilha traz R$ 0,00 em
 * alguns), usa-se o k típico das linhas que têm os dois preços — e a linha
 * sai marcada no relatório, porque aí é estimativa, não leitura.
 *
 * ── O que NÃO é verificado aqui ──
 *
 * Se o preço da planilha "faz sentido" para o custo dela. Em vários SKUs
 * não faz: o skate tem R$ 144,80 de custo e preço mínimo de R$ 189, o que
 * daria 60% de margem; o GP243 tem custo R$ 0,00 e preço R$ 19,90. São
 * preços comerciais, decididos fora da fórmula. Não cabe a este script
 * discutir: o preço nas duas comissões é o dado de entrada, dito correto
 * por quem mantém a planilha.
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const req = createRequire("C:/Users/dudu4/OneDrive/Desktop/plataforma/");
const { createClient } = req("@supabase/supabase-js");

const CSV = "C:/Users/dudu4/Downloads/Tabela de Preços e Produtos Bom de Compras(Preço Mínimo).csv";
const OPERACAO = "01b057f3-4541-4423-ada4-288cfbbc6dd7"; // Bom de Compras
const VIGENTE_DE = new Date().toISOString().slice(0, 10);
const C_CLASSICO = 0.115;
const C_PREMIUM = 0.165;
/** A escada do Meli, a mesma da base da Probel. */
const FAIXAS = Array.from({ length: 33 }, (_, i) => Math.round((0.045 + i * 0.005) * 1000) / 1000);

const gravar = process.argv.includes("--gravar");

for (const l of fs.readFileSync("C:/Users/dudu4/OneDrive/Desktop/plataforma/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
async function todos(q) {
  let o = [], i = 0;
  for (;;) { const { data, error } = await q().range(i, i + 999); if (error) throw error; o.push(...data); if (data.length < 1000) break; i += 1000; }
  return o;
}
const r2 = (v) => Math.round(v * 100) / 100;
const nrm = (s) => String(s ?? "").replace(/^"|"$/g, "").replace(/\s+/g, "").toUpperCase();

/** "R$ 1.234,56" → 1234.56 · "R$ -", vazio → null · tolera "993,,60". */
function dinheiro(s) {
  const t = String(s ?? "").replace(/^"|"$/g, "").replace(/R\$/g, "").trim();
  if (!t || /^-\s*$/.test(t)) return null;
  const n = Number(t.replace(/\./g, "").replace(/,+/g, "."));
  return Number.isFinite(n) ? n : null;
}

/* ── 1. Ler o CSV ──
   Sai do Excel em Windows-1252; lido como UTF-8 vira "Ca�arola". */
const texto = new TextDecoder("windows-1252").decode(fs.readFileSync(CSV));
const linhas = [];
for (const linha of texto.split(/\r?\n/).slice(1)) {
  const c = linha.split(";");
  const cod = nrm(c[0]);
  // O rodapé da planilha tem recados ("Eduardo", "Lucas - Colocar estoque").
  if (!cod || /^(EDUARDO|LUCAS|A..ES)/i.test(cod)) continue;
  const classico = dinheiro(c[4]);
  const premium = dinheiro(c[5]);
  if (classico == null && premium == null) continue;
  linhas.push({
    cod,
    produto: String(c[1] ?? "").replace(/^"|"$/g, "").slice(0, 38),
    custo: dinheiro(c[2]) ?? 0,
    frete: dinheiro(c[3]) ?? 0,
    classico,
    premium,
  });
}

/* ── 2. Resolver F e k de cada linha ── */
function doisPontos(p1, p2) {
  const k = ((1 - C_CLASSICO) * p1 - (1 - C_PREMIUM) * p2) / (p1 - p2);
  return { k, F: p1 * (1 - C_CLASSICO - k), origem: "dois preços" };
}
function umPonto(preco, comissao, F) {
  // F conhecido (custo + frete): k é o que sobra do único preço.
  return { k: 1 - comissao - F / preco, F, origem: "um preço + custo" };
}

// O k típico, para a linha que tem um preço só e custo não informado.
const ksBons = [];
for (const l of linhas) {
  if (l.classico == null || l.premium == null || l.classico === l.premium) continue;
  const { k } = doisPontos(l.classico, l.premium);
  if (k > 0 && k < 0.6) ksBons.push(k);
}
ksBons.sort((a, b) => a - b);
const K_TIPICO = ksBons.length ? ksBons[Math.floor(ksBons.length / 2)] : 0.265;

for (const l of linhas) {
  const F0 = l.custo + l.frete;
  if (l.classico != null && l.premium != null && l.classico !== l.premium) {
    Object.assign(l, doisPontos(l.classico, l.premium));
  } else {
    const preco = l.classico ?? l.premium;
    const comissao = l.classico != null ? C_CLASSICO : C_PREMIUM;
    if (F0 > 0 && F0 < preco * (1 - comissao)) {
      Object.assign(l, umPonto(preco, comissao, F0));
    } else {
      // Sem custo utilizável: assume o k típico e deriva F do preço dado.
      Object.assign(l, { k: K_TIPICO, F: preco * (1 - comissao - K_TIPICO), origem: "k típico" });
    }
  }
  l.piso = (c) => { const d = 1 - c - l.k; return d > 0 ? r2(l.F / d) : null; };
  l.ok = l.F > 0 && l.k > 0 && l.k < 0.9 && l.piso(C_PREMIUM) != null;
}

/* ── 3. Casar com os anúncios ── */
const anuncios = await todos(() =>
  sb.from("anuncios").select("codigo_externo,sku_canal,tipo,status").eq("operacao_id", OPERACAO).order("id")
);
const porSku = new Map();
for (const a of anuncios) {
  if (!a.sku_canal) continue;
  const k = nrm(a.sku_canal);
  if (!porSku.has(k)) porSku.set(k, []);
  porSku.get(k).push(a);
}

console.log(`Planilha: ${linhas.length} SKUs com preço de Meli · ${linhas.filter((l) => l.ok).length} com piso calculável`);
console.log(`k mediano das linhas com os dois preços: ${(K_TIPICO * 100).toFixed(1)}%\n`);
console.log(
  "CÓDIGO".padEnd(15) + "PLAN 11,5%".padStart(11) + "PLAN 16,5%".padStart(11) +
  " | " + "4,5%".padStart(9) + "9,5%".padStart(9) + "11,5%".padStart(9) + "16,5%".padStart(9) + "20,5%".padStart(9) + "  AN  ORIGEM"
);
for (const l of linhas) {
  const ans = porSku.get(l.cod) ?? [];
  const col = (c) => String(l.ok ? (l.piso(c) ?? "—") : "—").padStart(9);
  console.log(
    l.cod.padEnd(15) +
      String(l.classico ?? "—").padStart(11) + String(l.premium ?? "—").padStart(11) + " | " +
      col(0.045) + col(0.095) + col(C_CLASSICO) + col(C_PREMIUM) + col(0.205) +
      `  ${String(ans.length).padStart(2)}  ${l.origem}${l.ok ? "" : "  ← SEM PISO"}`
  );
}

/* ── 4. Conferência: a curva reproduz a planilha? ──
   É o único teste que importa. Se o piso em 11,5% não bater com a coluna
   do clássico, a álgebra está errada e todo o resto sai torto. */
const fora = [];
for (const l of linhas) {
  if (!l.ok) continue;
  if (l.classico != null && Math.abs(l.piso(C_CLASSICO) - l.classico) > 0.02) {
    fora.push(`${l.cod}: 11,5% deu ${l.piso(C_CLASSICO)}, planilha diz ${l.classico}`);
  }
  if (l.premium != null && l.premium !== l.classico && Math.abs(l.piso(C_PREMIUM) - l.premium) > 0.02) {
    fora.push(`${l.cod}: 16,5% deu ${l.piso(C_PREMIUM)}, planilha diz ${l.premium}`);
  }
}
console.log(`\nConferência — a curva passa pelos preços da planilha: ${fora.length === 0 ? "sim, em todos" : `${fora.length} divergência(s)`}`);
fora.slice(0, 8).forEach((f) => console.log("   ✗", f));
if (fora.length) throw new Error("A curva não reproduz a planilha — não gravo nada assim.");

/* Monotonia: comissão maior nunca pode dar piso menor. */
const naoMonotonas = linhas.filter((l) => l.ok && FAIXAS.some((c, i) => i > 0 && l.piso(c) < l.piso(FAIXAS[i - 1])));
console.log(`Monotonia (comissão maior → piso maior): ${naoMonotonas.length === 0 ? "ok em todos" : `quebra em ${naoMonotonas.map((l) => l.cod).join(", ")}`}`);
if (naoMonotonas.length) throw new Error("Piso caindo com comissão subindo — conta errada.");

/* ── 5. Montar e gravar ── */
const precos = [];
const itens = [];
for (const l of linhas) {
  if (!l.ok) continue;
  for (const c of FAIXAS) {
    precos.push({ operacao_id: OPERACAO, vigente_de: VIGENTE_DE, chave_tipo: "sku", chave: l.cod, comissao: c, preco: l.piso(c) });
  }
  for (const a of porSku.get(l.cod) ?? []) {
    itens.push({
      operacao_id: OPERACAO,
      vigente_de: VIGENTE_DE,
      mlb: a.codigo_externo,
      sku: l.cod,
      tipo_anuncio: a.tipo === "premium" ? "premium" : "classico",
      comissao_padrao: a.tipo === "premium" ? C_PREMIUM : C_CLASSICO,
    });
  }
}
const casados = linhas.filter((l) => l.ok && porSku.has(l.cod)).length;
console.log(`\nA gravar: ${itens.length} itens (anúncios) e ${precos.length} preços (${precos.length / FAIXAS.length} SKUs × ${FAIXAS.length} faixas), vigentes de ${VIGENTE_DE}.`);
console.log(`SKUs da planilha com anúncio casado: ${casados} de ${linhas.filter((l) => l.ok).length}`);
console.log(`SKUs anunciados sem linha na planilha: ${[...porSku.keys()].filter((k) => !linhas.some((l) => l.ok && l.cod === k)).length} de ${porSku.size}`);

if (!gravar) {
  console.log("\nEnsaio. Rode com --gravar para escrever.");
} else {
  /*
   * Apaga a versão do dia antes de inserir, em vez de `upsert`.
   *
   * O upsert com `onConflict` duplicou linha numa execução repetida — 24
   * itens viraram 48 — porque o alvo informado não casou com o índice
   * único da tabela. Apagar e inserir não depende de acertar o nome do
   * índice, e o recorte (operação + data de vigência) é exatamente o que
   * esta execução produz.
   */
  for (const t of ["formula_base_precos", "formula_base_itens"]) {
    const { error } = await sb.from(t).delete().eq("operacao_id", OPERACAO).eq("vigente_de", VIGENTE_DE);
    if (error) throw new Error(`${t} (limpeza): ${error.message}`);
  }
  for (const [t, dados] of [["formula_base_itens", itens], ["formula_base_precos", precos]]) {
    for (let i = 0; i < dados.length; i += 500) {
      const { error } = await sb.from(t).insert(dados.slice(i, i + 500));
      if (error) throw new Error(`${t}: ${error.message}`);
    }
    const { count } = await sb.from(t).select("id", { count: "exact", head: true }).eq("operacao_id", OPERACAO);
    console.log(`${t}: ${dados.length} inseridas, ${count} no total da empresa.`);
  }
}
