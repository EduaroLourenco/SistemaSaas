/**
 * Carrega o pré-acordo da Probel no módulo de Planejamento, com as datas
 * de quando as coisas aconteceram.
 *
 * ── Por que existe ──
 *
 * O Planejamento nasceu completo — campanha com ações, estratégia com
 * hipótese e indicador, execução por destino, medição e fechamento — e
 * nunca foi usado com dado de verdade. Uma tela vazia não mostra o que ela
 * faz. Esta carga põe dentro dela o que já foi negociado e executado em
 * setembro e outubro, pelas datas reais, para a tela abrir contando a
 * história em vez de pedindo cadastro.
 *
 * ── Fonte ──
 *
 * `Controle_Probel_2026_4.xlsx`, as abas de pré-acordo de setembro e
 * outubro: por MLB, o rebate pedido, o preço mínimo, o retorno do canal e
 * as datas das campanhas relâmpago.
 *
 * ── O que NÃO toca ──
 *
 * Metas (já cadastradas, 18 linhas com peso por canal), vendas, anúncios e
 * promoções. Só escreve em `planejamento_itens` e `planejamento_grupos`, e
 * só nas linhas que esta carga mesma criou — identificadas por
 * `detalhes.origem`, para rodar de novo não duplicar nem apagar o que o
 * Eduardo cadastrou à mão.
 *
 * Uso: node scripts/carregar-preacordo-probel.mjs <planilha.xlsx> [--aplicar]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const OPERACAO = "00000000-0000-0000-0000-000000000101"; // Probel
const ORIGEM = "controle-probel-2026";

const raiz = fileURLToPath(new URL("../", import.meta.url));
for (const linha of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.startsWith("#") && !process.env[linha.slice(0, i)]) {
    process.env[linha.slice(0, i)] = linha.slice(i + 1).trim();
  }
}
const ARQUIVO = process.argv[2];
const APLICAR = process.argv.includes("--aplicar");
if (!ARQUIVO) throw new Error("Informe o caminho da planilha de controle.");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const txt = (v) => {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text) return v.text;
    if (v.result != null) return String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return "";
  }
  return String(v);
};
const num = (v) => {
  const t = txt(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && t !== "" ? n : null;
};
const reais = (v) => (v == null ? "—" : "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);

/* ── Setembro: SKU, MLB, tipo, estoque, rebate, comissão, preço mínimo, status ── */
function lerSetembro() {
  const ws = wb.getWorksheet("09-PRÉ-ACORDO SETEMBRO");
  const linhas = [];
  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const mlb = txt(row.getCell(2).value).trim();
    if (!mlb) continue;
    linhas.push({
      sku: txt(row.getCell(1).value).trim().toUpperCase(),
      mlb,
      nome: txt(row.getCell(3).value).trim(),
      tipo: txt(row.getCell(4).value).trim(),
      estoque: num(row.getCell(5).value),
      rebate: num(row.getCell(6).value),
      comissaoComRebate: num(row.getCell(7).value),
      precoMinimo: num(row.getCell(8).value),
      status: txt(row.getCell(9).value).trim(),
      retorno: txt(row.getCell(11).value).trim(),
    });
  }
  return linhas;
}

/* ── Outubro: rebate, preço mínimo, relâmpago, oferta do dia e as 5 datas ── */
function lerOutubro() {
  const ws = wb.getWorksheet("08-PRÉ-ACORDO OUTUBRO");
  const linhas = [];
  const datas = new Set();
  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const mlb = txt(row.getCell(2).value).trim();
    if (!mlb) continue;
    for (let c = 18; c <= 22; c++) {
      const d = txt(row.getCell(c).value).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) datas.add(d);
    }
    linhas.push({
      sku: txt(row.getCell(1).value).trim().toUpperCase(),
      mlb,
      nome: txt(row.getCell(3).value).trim(),
      tipo: txt(row.getCell(4).value).trim(),
      rebateValor: num(row.getCell(5).value),
      rebatePct: num(row.getCell(6).value),
      precoMinimo: num(row.getCell(7).value),
      retornoProbel: txt(row.getCell(9).value).trim(),
      relampagoPreco: num(row.getCell(10).value),
      relampagoPct: num(row.getCell(11).value),
      relampagoValor: num(row.getCell(12).value),
      relampagoRetorno: txt(row.getCell(13).value).trim(),
      ofertaPreco: num(row.getCell(14).value),
      ofertaRetorno: txt(row.getCell(17).value).trim(),
    });
  }
  return { linhas, datas: [...datas].sort() };
}

const setembro = lerSetembro();
const outubro = lerOutubro();

/* O SKU de outubro vem como número do MLB em parte das linhas; o SKU real
   sai do cadastro de anúncios pelo MLB, que é a chave que o canal usa. */
const mlbs = [...new Set([...setembro, ...outubro.linhas].map((l) => l.mlb.toUpperCase()))];
const { data: anuncios } = await sb
  .from("anuncios")
  .select("codigo_externo,sku_canal,titulo")
  .eq("operacao_id", OPERACAO)
  .in("codigo_externo", mlbs);
const skuPorMlb = new Map((anuncios ?? []).map((a) => [a.codigo_externo.toUpperCase(), (a.sku_canal || "").toUpperCase()]));
const skuDe = (l) => skuPorMlb.get(l.mlb.toUpperCase()) || (/^PA/i.test(l.sku) ? l.sku : "");

/* Receita real de cada mês, para a MEDIÇÃO da campanha fechada não ser um
   número digitado: ela sai dos pedidos. */
const { data: canaisTodos } = await sb.from("canais").select("id,codigo").eq("operacao_id", OPERACAO);
const CANAL_ML = canaisTodos.find((c) => c.codigo === "mercado_livre")?.id;
if (!CANAL_ML) throw new Error("Canal Mercado Livre não encontrado nesta operação.");

async function receitaML(de, ate) {
  const ml = CANAL_ML;
  let total = 0;
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb
      .from("pedidos")
      .select("total")
      .eq("operacao_id", OPERACAO)
      .eq("canal_id", ml)
      .eq("cancelado", false)
      .gte("data", de)
      .lte("data", ate)
      .range(i, i + 999);
    if (error) throw new Error(error.message);
    total += data.reduce((s, p) => s + (Number(p.total) || 0), 0);
    if (data.length < 1000) break;
  }
  return Math.round(total * 100) / 100;
}
const receitaSet = await receitaML("2026-09-01", "2026-09-30");
const receitaOut = await receitaML("2026-10-01", "2026-10-16");

const estrategia = (e) => ({
  foco: "", hipotese: "", indicador: "", indicadorPersonalizado: "", alvo: null,
  anuncios: [], execucoes: [], medicao: { valor: null, fonte: "", data: "" },
  fechamento: { funcionou: "", problemas: "", proximoPasso: "", decisao: "" },
  ...e,
});
const detalhes = (d) => ({
  objetivo: "", responsavel: "", divulgacao: "", publico: "", briefing: "", link: "",
  orcamento: null, meta: "", checklist: [], porProduto: {}, grupos: [],
  origem: ORIGEM,
  ...d,
});

/** Linhas cujo retorno do canal diz que a campanha já está no ar. */
const cadastrada = (s) => /campanha cadastrada/i.test(s);
const comMinimo = (s) => /m[ií]nimo/i.test(s);

const itens = [];
const idCampanha = { set: crypto.randomUUID(), out: crypto.randomUUID(), bf: crypto.randomUUID() };

/* ══ Setembro — campanha fechada, com medição ══ */
itens.push({
  id: idCampanha.set,
  natureza: "campanha",
  titulo: "Pré-acordo Mercado Livre · Setembro",
  inicio: "2026-09-01",
  fim: "2026-09-30",
  status: "Concluída",
  tipo: "Preço",
  etapa: "Pós-campanha",
  cor: "#475569",
  skus: [...new Set(setembro.map(skuDe).filter(Boolean))],
  detalhes: detalhes({
    objetivo: "Rebate de 7 pontos na curva A para sustentar preço competitivo sem furar a margem.",
    responsavel: "Eduardo",
    meta: "Manter a curva A vendendo com a tarifa reduzida para 4,5%.",
    estrategia: estrategia({
      foco: "Melhorar rentabilidade",
      hipotese: "Com a tarifa em 4,5% o preço mínimo cai e os anúncios da curva A voltam a competir sem perder margem.",
      indicador: "receita",
      anuncios: setembro.map((l) => l.mlb),
      execucoes: [
        {
          destino: "Mercado Livre — curva A",
          situacao: "Executada",
          inicio: "2026-09-01",
          fim: "2026-09-30",
          mudancas: `${setembro.filter((l) => cadastrada(l.status)).length} de ${setembro.length} linhas voltaram como campanha cadastrada.`,
          evidencia: "Aba 09-PRÉ-ACORDO SETEMBRO do Controle Probel 2026",
        },
      ],
      medicao: { valor: receitaSet, fonte: "Pedidos do Mercado Livre no sistema", data: "2026-09-30" },
      fechamento: {
        funcionou: "O rebate saiu e a maior parte das linhas entrou em campanha.",
        problemas: "Parte das linhas voltou com preço mínimo diferente do pedido, e precisou de conferência manual.",
        proximoPasso: "Repetir em outubro com rebate de 5 pontos e acrescentar relâmpago semanal.",
        decisao: "Ajustar",
      },
    }),
    porProduto: Object.fromEntries(
      setembro
        .map((l) => [skuDe(l) || l.mlb, `rebate ${l.rebate ?? "—"} pt · mínimo ${reais(l.precoMinimo)} · ${l.status || "sem retorno"}`])
        .filter(([k]) => k)
    ),
  }),
});

itens.push({
  natureza: "acao",
  campanha_id: idCampanha.set,
  titulo: "Rebate de 7 pontos — curva A",
  inicio: "2026-09-01",
  fim: "2026-09-30",
  status: "Concluída",
  tipo: "Preço",
  etapa: "Preparação",
  cor: "#0f766e",
  skus: [...new Set(setembro.map(skuDe).filter(Boolean))],
  detalhes: detalhes({
    objetivo: "Pedir 7 pontos de rebate, levando a comissão de 11,5% para 4,5%.",
    checklist: setembro.map((l) => ({
      texto: `${skuDe(l) || l.mlb} — mínimo ${reais(l.precoMinimo)}${l.retorno ? ` (retorno: ${l.retorno})` : ""}`,
      feito: cadastrada(l.status),
    })),
  }),
});

/* ══ Outubro — campanha em andamento ══ */
const comRelampago = outubro.linhas.filter((l) => l.relampagoPreco);
const comOferta = outubro.linhas.filter((l) => l.ofertaPreco);

itens.push({
  id: idCampanha.out,
  natureza: "campanha",
  titulo: "Pré-acordo Mercado Livre · Outubro",
  inicio: "2026-10-01",
  fim: "2026-10-31",
  status: "Em andamento",
  tipo: "Preço",
  etapa: "Sustentação",
  cor: "#2563eb",
  skus: [...new Set(outubro.linhas.map(skuDe).filter(Boolean))],
  detalhes: detalhes({
    objetivo: "Rebate de 5 pontos na curva A, com relâmpago semanal e oferta do dia sobre o preço com rebate.",
    responsavel: "Eduardo",
    meta: "Meta do mês: R$ 1.244.059 (PLANO 2026).",
    estrategia: estrategia({
      foco: "Vender mais",
      hipotese: "O rebate abre espaço de preço, e o relâmpago semanal converte esse espaço em volume nas datas de maior tráfego.",
      indicador: "receita",
      alvo: 1244059.46,
      anuncios: outubro.linhas.map((l) => l.mlb),
      execucoes: [
        {
          destino: "Rebate de 5 pontos",
          situacao: "Executada",
          inicio: "2026-10-01",
          fim: "2026-10-31",
          mudancas: `${outubro.linhas.length} linhas pedidas; ${outubro.linhas.filter((l) => cadastrada(l.retornoProbel)).length} com retorno de campanha cadastrada.`,
          evidencia: "Aba 08-PRÉ-ACORDO OUTUBRO",
        },
        {
          destino: "Relâmpago semanal",
          situacao: "Em execução",
          inicio: outubro.datas[0] ?? "2026-10-03",
          fim: outubro.datas.at(-1) ?? "2026-10-31",
          mudancas: `${comRelampago.length} linhas com preço de relâmpago definido; ${outubro.linhas.filter((l) => cadastrada(l.relampagoRetorno)).length} já cadastradas pelo canal.`,
          evidencia: "Colunas RELÂMPAGO e DATA 1 a DATA 5",
        },
        {
          destino: "Oferta do dia",
          situacao: "Em execução",
          inicio: "2026-10-01",
          fim: "2026-10-31",
          mudancas: `${comOferta.length} linhas com preço de oferta do dia.`,
          evidencia: "Colunas OFERTA DO DIA",
        },
      ],
      medicao: { valor: receitaOut, fonte: "Pedidos do Mercado Livre no sistema (parcial, até 16/10)", data: "2026-10-16" },
    }),
    porProduto: Object.fromEntries(
      outubro.linhas
        .map((l) => [
          skuDe(l) || l.mlb,
          [
            `rebate ${l.rebatePct != null ? Math.round(l.rebatePct * 100) + "%" : "—"} (${reais(l.rebateValor)})`,
            `mínimo ${reais(l.precoMinimo)}`,
            l.relampagoPreco ? `relâmpago ${reais(l.relampagoPreco)}` : null,
            l.ofertaPreco ? `oferta do dia ${reais(l.ofertaPreco)}` : null,
            l.retornoProbel || l.relampagoRetorno || null,
          ]
            .filter(Boolean)
            .join(" · "),
        ])
        .filter(([k]) => k)
    ),
  }),
});

itens.push({
  natureza: "acao",
  campanha_id: idCampanha.out,
  titulo: "Rebate de 5 pontos — curva A",
  inicio: "2026-10-01",
  fim: "2026-10-31",
  status: "Em andamento",
  tipo: "Preço",
  etapa: "Preparação",
  cor: "#0f766e",
  skus: [...new Set(outubro.linhas.map(skuDe).filter(Boolean))],
  detalhes: detalhes({
    objetivo: "Levar a comissão de 11,5% para 6,5% no clássico e de 16,5% para 11,5% no premium.",
    checklist: outubro.linhas.map((l) => ({
      texto: `${skuDe(l) || l.mlb} — mínimo ${reais(l.precoMinimo)}${l.retornoProbel ? ` (${l.retornoProbel})` : ""}`,
      feito: cadastrada(l.retornoProbel),
    })),
  }),
});

/*
 * Uma ação por data de relâmpago, cobrindo a JANELA DE COMPRA.
 *
 * Colchão não se compra no impulso do dia. Medir o relâmpago só na sexta
 * em que ele rodou deu −100% na primeira leitura; a MESMA ação, medida em
 * 7 dias contra a semana limpa anterior, deu +175% — R$ 30.268 contra
 * R$ 11.026, 24 unidades contra 10. O dia é quando a oferta aparece; a
 * venda chega depois.
 *
 * Sete dias e não três: em 3 dias o mesmo relâmpago deu +66%, e a série
 * diária põe o pico entre o terceiro e o sexto dia.
 */
const JANELA_COMPRA = 6; // dias somados ao dia da oferta
for (const [i, data] of outubro.datas.entries()) {
  const fimJanela = new Date(Date.parse(data + "T12:00:00Z") + JANELA_COMPRA * 86400000).toISOString().slice(0, 10);
  itens.push({
    natureza: "acao",
    campanha_id: idCampanha.out,
    titulo: `Relâmpago ${data.slice(8, 10)}/${data.slice(5, 7)}`,
    inicio: data,
    fim: fimJanela,
    status: fimJanela <= "2026-10-16" ? "Concluída" : data <= "2026-10-16" ? "Em andamento" : "Planejada",
    tipo: "Promoção",
    etapa: "Lançamento",
    cor: "#e11d48",
    skus: [...new Set(comRelampago.map(skuDe).filter(Boolean))],
    detalhes: detalhes({
      objetivo: `Oferta em ${data.slice(8, 10)}/${data.slice(5, 7)}, medida até ${fimJanela.slice(8, 10)}/${fimJanela.slice(5, 7)} — a janela em que a venda de colchão cai.`,
      briefing:
        i === 0
          ? "Comparação limpa: a semana anterior (26/09 a 02/10) não teve relâmpago. Medido: +175% em receita, 24 unidades contra 10."
          : "CUIDADO na leitura: a semana anterior a esta também teve relâmpago, então o comparativo automático mede uma ação contra a outra, e não contra uma semana normal. Para avaliar esta data, use uma semana sem relâmpago como base.",
      porProduto: Object.fromEntries(
        comRelampago
          .map((l) => [skuDe(l) || l.mlb, `${reais(l.relampagoPreco)} · desconto ${l.relampagoPct != null ? Math.round(l.relampagoPct * 100) + "%" : "—"}`])
          .filter(([k]) => k)
      ),
    }),
  });
}

itens.push({
  natureza: "acao",
  campanha_id: idCampanha.out,
  titulo: "Oferta do dia",
  inicio: "2026-10-01",
  fim: "2026-10-31",
  status: "Em andamento",
  tipo: "Promoção",
  etapa: "Sustentação",
  cor: "#d97706",
  skus: [...new Set(comOferta.map(skuDe).filter(Boolean))],
  detalhes: detalhes({
    objetivo: "Oferta do dia sobre o preço com rebate, para os itens que o canal aceitou.",
    porProduto: Object.fromEntries(
      comOferta.map((l) => [skuDe(l) || l.mlb, `${reais(l.ofertaPreco)}${l.ofertaRetorno ? ` · ${l.ofertaRetorno}` : ""}`]).filter(([k]) => k)
    ),
  }),
});

/* ══ Black Friday — planejada, duas janelas ══ */
itens.push({
  id: idCampanha.bf,
  natureza: "campanha",
  titulo: "Black Friday 2026",
  inicio: "2026-11-01",
  fim: "2026-11-30",
  status: "Planejada",
  tipo: "Promoção",
  etapa: "Preparação",
  cor: "#9333ea",
  skus: [],
  detalhes: detalhes({
    objetivo: "Negociação em duas janelas: 01 a 15 e 16 a 30 de novembro.",
    responsavel: "Eduardo",
    meta: "Meta de novembro: R$ 1.269.034 (PLANO 2026).",
    estrategia: estrategia({
      foco: "Vender mais",
      hipotese: "Duas janelas de preço permitem testar profundidade de desconto na primeira quinzena e sustentar na segunda.",
      indicador: "receita",
      alvo: 1269033.75,
    }),
  }),
});
for (const [titulo, inicio, fim] of [
  ["Black 1 — 01 a 15/11", "2026-11-01", "2026-11-15"],
  ["Black 2 — 16 a 30/11", "2026-11-16", "2026-11-30"],
]) {
  itens.push({
    natureza: "acao",
    campanha_id: idCampanha.bf,
    titulo,
    inicio,
    fim,
    status: "Planejada",
    tipo: "Preço",
    etapa: "Preparação",
    cor: "#9333ea",
    skus: [],
    detalhes: detalhes({ objetivo: "Definir preço DE, preço POR e rebate do canal por MLB.", briefing: "A aba BLACK FRIDAY 2026 do controle está com os títulos prontos e sem linhas: os preços ainda serão negociados." }),
  });
}

const grupos = [
  { nome: "Curva A · pré-acordo outubro", skus: [...new Set(outubro.linhas.map(skuDe).filter(Boolean))] },
  { nome: "Curva A · pré-acordo setembro", skus: [...new Set(setembro.map(skuDe).filter(Boolean))] },
];

console.log("setembro:", setembro.length, "linhas |", grupos[1].skus.length, "SKUs reconhecidos");
console.log("outubro: ", outubro.linhas.length, "linhas |", grupos[0].skus.length, "SKUs reconhecidos |", outubro.datas.length, "datas de relâmpago:", outubro.datas.join(", "));
console.log("receita real — setembro:", reais(receitaSet), "| outubro até 16:", reais(receitaOut));
console.log("itens a criar:", itens.length, `(${itens.filter((i) => i.natureza === "campanha").length} campanhas, ${itens.filter((i) => i.natureza === "acao").length} ações)`);
for (const i of itens) console.log(`  ${i.natureza === "campanha" ? "▸" : "  ·"} ${i.titulo.padEnd(38)} ${i.inicio} a ${i.fim}  ${i.status.padEnd(13)} ${i.skus.length} SKUs`);

if (!APLICAR) {
  console.log("\nensaio. rode com --aplicar para gravar.");
  process.exit(0);
}

/* Apaga só o que esta carga criou antes: campanha apagada leva as ações
   junto pelo on delete cascade. */
const { data: antigos } = await sb
  .from("planejamento_itens")
  .select("id,titulo,detalhes,natureza")
  .eq("operacao_id", OPERACAO);
const meus = (antigos ?? []).filter((i) => i.detalhes?.origem === ORIGEM);
if (meus.length) {
  const { error } = await sb.from("planejamento_itens").delete().in("id", meus.map((i) => i.id));
  if (error) throw new Error(`Falha ao limpar a carga anterior: ${error.message}`);
  console.log(`\nremovidos ${meus.length} itens da carga anterior`);
}

/* Campanhas primeiro: a ação referencia a campanha por chave estrangeira. */
/* Todo item sai amarrado ao canal: sem isso a medição somaria a venda dos
   mesmos SKUs no site próprio, e a campanha do Mercado Livre levaria
   crédito por venda que não foi dela. */
for (const grupo of [itens.filter((i) => i.natureza === "campanha"), itens.filter((i) => i.natureza === "acao")]) {
  const { error } = await sb.from("planejamento_itens").insert(grupo.map((i) => ({ ...i, operacao_id: OPERACAO, canais: [CANAL_ML] })));
  if (error) throw new Error(`Falha ao gravar: ${error.message}`);
}
console.log(`gravados ${itens.length} itens`);

for (const g of grupos) {
  const { error } = await sb
    .from("planejamento_grupos")
    .upsert({ operacao_id: OPERACAO, nome: g.nome, skus: g.skus }, { onConflict: "operacao_id,nome" });
  if (error) throw new Error(`Falha ao gravar o grupo ${g.nome}: ${error.message}`);
}
console.log(`grupos: ${grupos.map((g) => `${g.nome} (${g.skus.length})`).join(" · ")}`);
