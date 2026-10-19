/**
 * As ofertas relâmpago de outubro no Planejamento, um item por dia.
 *
 * ── Por que um item por dia, e não um por produto ──
 *
 * A relâmpago não é uma campanha de duas semanas: são doze janelas curtas,
 * em dias alternados, com elencos diferentes. O que o Eduardo precisa
 * acompanhar é o DIA — quanto vendeu no dia da oferta e no seguinte. Um
 * item por produto responderia "como foi o PA85351 em outubro", que não é
 * a pergunta.
 *
 * ── Por que o item abraça o dia seguinte ──
 *
 * Colchão não se compra por impulso: a visita do dia da oferta vira pedido
 * horas depois, às vezes no dia seguinte. Medir só o dia da relâmpago
 * jogaria essa venda para fora da campanha — foi exatamente o que fez a
 * relâmpago de 03/10 parecer −100% quando, com a janela de compra aberta,
 * ela é +175%.
 *
 * ── O que NÃO toca ──
 *
 * Só escreve em `planejamento_itens`, e só nas linhas que esta carga mesma
 * criou, marcadas por `detalhes.origem`. Rodar de novo substitui a carga
 * anterior e não encosta no que foi cadastrado à mão.
 *
 * Uso: node scripts/carregar-relampago-outubro.mjs [--aplicar]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const OPERACAO = "00000000-0000-0000-0000-000000000101"; // Probel
const ORIGEM = "relampago-outubro-2026";
const APLICAR = process.argv.includes("--aplicar");

const raiz = fileURLToPath(new URL("../", import.meta.url));
for (const linha of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.startsWith("#") && !process.env[linha.slice(0, i)]) {
    process.env[linha.slice(0, i)] = linha.slice(i + 1).trim();
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ══ O acordo, como veio da planilha do canal ══
   `preco` é o preço com 7 pontos de rebate que a Probel respondeu.
   `dias` são as datas em que a oferta roda. */
const IMPAR = ["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-25", "2026-10-27", "2026-10-29"];
const PAR = ["2026-10-20", "2026-10-22", "2026-10-24", "2026-10-26", "2026-10-28", "2026-10-30"];

const OFERTAS = [
  // ── Conta a prazo ──
  { mlb: "MLB3671737447", conta: "A prazo", relampago: 1817, preco: 1753.67, dias: IMPAR },
  { mlb: "MLB4530736830", conta: "A prazo", relampago: 2057, preco: 1983.57, dias: IMPAR },
  { mlb: "MLB3922936661", conta: "A prazo", relampago: 4355.19, preco: 4065.57, dias: IMPAR },
  { mlb: "MLB4979612208", conta: "A prazo", relampago: 3998.19, preco: 3825.99, dias: IMPAR },
  { mlb: "MLB4145029024", conta: "A prazo", relampago: 1357, preco: 1310.7, dias: IMPAR },
  { mlb: "MLB4263985355", conta: "A prazo", relampago: 2476.17, preco: 2370.39, dias: IMPAR },
  // ── São Paulo (Cotia) ──
  { mlb: "MLB5299288202", conta: "São Paulo", relampago: 2323.48, preco: 2323.48, afiliados: 15, dias: IMPAR },
  { mlb: "MLB5411376206", conta: "São Paulo", relampago: 1357, preco: 1310.7, dias: IMPAR },
  { mlb: "MLB4039549407", conta: "São Paulo", relampago: 1817, preco: 1753.67, dias: IMPAR },
  { mlb: "MLB5336288806", conta: "São Paulo", relampago: 1937, preco: 1868.8, afiliados: 10, dias: IMPAR },
  { mlb: "MLB4695851191", conta: "São Paulo", relampago: 860, preco: 809.6, afiliados: 20, dias: IMPAR },
  { mlb: "MLB5397764684", conta: "São Paulo", relampago: 2057, preco: 1983.57, afiliados: 15, dias: PAR },
  { mlb: "MLB5406476930", conta: "São Paulo", relampago: 1265.17, preco: 1188.95, afiliados: 10, dias: PAR },
  { mlb: "MLB5878585020", conta: "São Paulo", relampago: 2081, preco: 2007.26, afiliados: 15, dias: PAR },
  { mlb: "MLB4465780494", conta: "São Paulo", relampago: 890, preco: 832.33, afiliados: 15, dias: PAR },
  { mlb: "MLB4039601405", conta: "São Paulo", relampago: 1886.75, preco: 1863.97, dias: PAR },
];

const reais = (v) => (v == null ? "—" : "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const br = (iso) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
const diaSeguinte = (iso) => new Date(Date.parse(iso + "T12:00:00Z") + 86_400_000).toISOString().slice(0, 10);

/* ══ SKU e título vêm do catálogo, não da planilha ══ */
const { data: anuncios, error: ea } = await sb
  .from("anuncios")
  .select("codigo_externo,sku_canal,titulo,tipo,conta_canal_id")
  .eq("operacao_id", OPERACAO)
  .in("codigo_externo", OFERTAS.map((o) => o.mlb));
if (ea) throw new Error(ea.message);
const porMlb = new Map((anuncios ?? []).map((a) => [a.codigo_externo.toUpperCase(), a]));

const faltando = OFERTAS.filter((o) => !porMlb.has(o.mlb));
if (faltando.length) console.log("AVISO — sem anúncio no sistema:", faltando.map((o) => o.mlb).join(", "));

for (const o of OFERTAS) {
  const a = porMlb.get(o.mlb);
  o.sku = (a?.sku_canal ?? "").toUpperCase();
  o.titulo = a?.titulo ?? o.mlb;
  o.tipoAnuncio = a ? (String(a.tipo).startsWith("prem") ? "Premium" : "Clássico") : "—";
}

const { data: canais } = await sb.from("canais").select("id,codigo").eq("operacao_id", OPERACAO);
const CANAL_ML = canais?.find((c) => c.codigo === "mercado_livre")?.id;
if (!CANAL_ML) throw new Error("Canal Mercado Livre não encontrado nesta operação.");

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

const DIAS = [...new Set(OFERTAS.flatMap((o) => o.dias))].sort();
const idCampanha = crypto.randomUUID();
const itens = [];

/* ══ A campanha que abriga as doze janelas ══ */
itens.push({
  id: idCampanha,
  natureza: "campanha",
  titulo: "Oferta Relâmpago · Outubro 2026",
  inicio: DIAS[0],
  fim: diaSeguinte(DIAS.at(-1)),
  status: "Em andamento",
  tipo: "Promoção",
  etapa: "Lançamento",
  cor: "#e11d48",
  skus: [...new Set(OFERTAS.map((o) => o.sku).filter(Boolean))],
  detalhes: detalhes({
    objetivo: "Relâmpago do canal em dias alternados, com o preço de 7 pontos de rebate.",
    responsavel: "Eduardo",
    meta: "Medir cada dia de oferta contra o dia seguinte, que é quando o pedido fecha.",
    estrategia: estrategia({
      foco: "Vender mais",
      hipotese: "Com a tarifa em 4,5% (clássico) e 9,5% (premium), o preço da relâmpago cabe sem furar a margem, e a exposição da campanha traz a visita que o preço sozinho não traz.",
      indicador: "receita",
      anuncios: OFERTAS.map((o) => o.mlb),
    }),
    porProduto: Object.fromEntries(
      OFERTAS.map((o) => [
        o.sku || o.mlb,
        `${o.conta} · ${o.tipoAnuncio} · ${o.mlb} · relâmpago ${reais(o.relampago)} · nosso ${reais(o.preco)}` +
          (o.afiliados ? ` · afiliados ${o.afiliados}%` : "") +
          ` · dias ${o.dias.map(br).join(", ")}`,
      ])
    ),
  }),
});

/* ══ Um item por dia, abraçando o dia seguinte ══ */
for (const dia of DIAS) {
  const noDia = OFERTAS.filter((o) => o.dias.includes(dia));
  itens.push({
    natureza: "acao",
    campanha_id: idCampanha,
    titulo: `Oferta Relâmpago ${br(dia)}`,
    inicio: dia,
    fim: diaSeguinte(dia),
    status: dia <= new Date().toISOString().slice(0, 10) ? "Em andamento" : "Planejada",
    tipo: "Promoção",
    etapa: "Lançamento",
    cor: "#e11d48",
    skus: [...new Set(noDia.map((o) => o.sku).filter(Boolean))],
    detalhes: detalhes({
      objetivo: `${noDia.length} anúncio(s) em relâmpago no dia ${br(dia)}. A medição vai até ${br(diaSeguinte(dia))} porque o pedido fecha depois da visita.`,
      responsavel: "Eduardo",
      checklist: noDia.map((o) => ({
        texto: `${o.sku || o.mlb} · ${o.conta} · ${o.tipoAnuncio} · ${reais(o.preco)}${o.afiliados ? ` · afiliados ${o.afiliados}%` : ""} — ${o.titulo}`,
        feito: false,
      })),
      porProduto: Object.fromEntries(
        noDia.map((o) => [o.sku || o.mlb, `${reais(o.preco)} · ${o.conta} · ${o.mlb}${o.afiliados ? ` · afiliados ${o.afiliados}%` : ""}`])
      ),
      estrategia: estrategia({
        foco: "Vender mais",
        indicador: "receita",
        anuncios: noDia.map((o) => o.mlb),
      }),
    }),
  });
}

/* ══ Relatório ══ */
console.log(`Oferta Relâmpago · Outubro 2026 — ${DIAS.length} dias, ${OFERTAS.length} anúncios\n`);
for (const dia of DIAS) {
  const noDia = OFERTAS.filter((o) => o.dias.includes(dia));
  console.log(
    `  ${br(dia)} a ${br(diaSeguinte(dia))} · ${noDia.length} anúncios · ` +
      `${noDia.filter((o) => o.conta === "São Paulo").length} SP e ${noDia.filter((o) => o.conta === "A prazo").length} a prazo · ` +
      noDia.map((o) => o.sku || o.mlb).join(" ")
  );
}

if (!APLICAR) {
  console.log("\nENSAIO — nada foi gravado. Rode com --aplicar para gravar.");
  process.exit(0);
}

const { data: antigos } = await sb
  .from("planejamento_itens")
  .select("id,detalhes")
  .eq("operacao_id", OPERACAO);
const meus = (antigos ?? []).filter((i) => i.detalhes?.origem === ORIGEM);
if (meus.length) {
  const { error } = await sb.from("planejamento_itens").delete().in("id", meus.map((i) => i.id));
  if (error) throw new Error(`Falha ao limpar a carga anterior: ${error.message}`);
  console.log(`\nremovidos ${meus.length} itens da carga anterior`);
}

/* Campanha primeiro: a ação referencia a campanha por chave estrangeira.
   O canal vai amarrado em todo item — sem isso a medição somaria a venda
   dos mesmos SKUs no site próprio. */
for (const grupo of [itens.filter((i) => i.natureza === "campanha"), itens.filter((i) => i.natureza === "acao")]) {
  const { error } = await sb
    .from("planejamento_itens")
    .insert(grupo.map((i) => ({ ...i, operacao_id: OPERACAO, canais: [CANAL_ML] })));
  if (error) throw new Error(`Falha ao gravar: ${error.message}`);
}
console.log(`\ngravados ${itens.length} itens (1 campanha + ${itens.length - 1} dias)`);
