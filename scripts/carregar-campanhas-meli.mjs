/**
 * Põe no Planejamento as campanhas do PRÓPRIO Mercado Livre — as que não
 * têm rebate negociado.
 *
 * ── Por que separado do pré-acordo ──
 *
 * O pré-acordo é o que a Probel pede: rebate por produto, preço mínimo,
 * relâmpago. Estas são as que o canal abre para todo mundo — 10/10, "O
 * melhor de todos os dias", seller campaigns — e entram sem redução de
 * tarifa nenhuma. São programas diferentes, com economia diferente, e
 * misturar os dois na mesma campanha esconderia justamente a pergunta:
 * qual dos dois está trazendo venda.
 *
 * `campanhas.tem_reducao_tarifa` é o que separa um do outro, e vem do
 * processamento da planilha do canal.
 *
 * ── Uma linha por programa, não por processamento ──
 *
 * A mesma campanha aparece várias vezes em `campanhas`: cada vez que a
 * planilha é reprocessada nasce um registro. O que interessa é o programa
 * e sua janela, então agrupo por (nome do programa, janela) e fico com o
 * processamento mais recente — que é o que tem a decisão valendo.
 *
 * Uso: node scripts/carregar-campanhas-meli.mjs [--aplicar]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const OPERACAO = "00000000-0000-0000-0000-000000000101";
const ORIGEM = "campanhas-meli-sem-rebate";

const raiz = fileURLToPath(new URL("../", import.meta.url));
for (const linha of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.startsWith("#") && !process.env[linha.slice(0, i)]) {
    process.env[linha.slice(0, i)] = linha.slice(i + 1).trim();
  }
}
const APLICAR = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const pag = async (montar) => {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await montar().range(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};

const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const MESES = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
/**
 * A janela sai do nome: "De 28 de Setembro a 13 de Outubro".
 *
 * O canal não preenche `inicio`/`fim` na tabela — só o nome traz a data, e
 * sem ela a ação não teria período para medir. Quando o nome não traz
 * (seller campaigns), devolve null e quem chama usa a data da decisão.
 */
function janelaDoNome(nome, ano = 2026) {
  const m = /De\s+(\d{1,2})(?:\s+de\s+(\p{L}+))?\s+a\s+(\d{1,2})\s+de\s+(\p{L}+)/iu.exec(nome ?? "");
  if (!m) return null;
  const mesFim = MESES[m[4].toLowerCase()];
  const mesInicio = m[2] ? MESES[m[2].toLowerCase()] : mesFim;
  if (!mesInicio || !mesFim) return null;
  const d = (mes, dia) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  /* Janela que vira o ano: "De 20 de Dezembro a 5 de Janeiro". */
  const anoFim = mesFim < mesInicio ? ano + 1 : ano;
  return { inicio: d(mesInicio, Number(m[1])), fim: `${anoFim}-${String(mesFim).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}` };
}

/** O nome do programa, sem o carimbo de processamento. */
const programa = (nome) =>
  String(nome ?? "")
    .split("|")[0]
    .replace(/^1_/, "")
    .replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}.*$/i, "")
    .replace(/[-_]\d{4}_\d{2}_\d{2}.*$/, "")
    .replace(/_/g, " ")
    .trim();

const [{ data: campanhas }, itens, anuncios, { data: planejado }, { data: canais }] = await Promise.all([
  sb.from("campanhas").select("id,nome,tem_reducao_tarifa").eq("operacao_id", OPERACAO).eq("tem_reducao_tarifa", false),
  pag(() =>
    sb
      .from("campanha_itens")
      .select("campanha_id,anuncio_id,decisao,preco_oferta,preco_tabela,desconto_percentual,decidido_em")
      .eq("operacao_id", OPERACAO)
  ),
  pag(() => sb.from("anuncios").select("id,codigo_externo,sku_canal,tipo").eq("operacao_id", OPERACAO)),
  sb.from("planejamento_itens").select("titulo,skus,detalhes").eq("operacao_id", OPERACAO),
  sb.from("canais").select("id,codigo").eq("operacao_id", OPERACAO),
]);

const CANAL_ML = canais.find((c) => c.codigo === "mercado_livre")?.id;
if (!CANAL_ML) throw new Error("Canal Mercado Livre não encontrado.");
const anunPorId = new Map(anuncios.map((a) => [a.id, a]));
const noAcordo = new Set(planejado.find((i) => i.titulo === "Rebate de 5 pontos — curva A")?.skus ?? []);

/* Agrupa por programa + janela, ficando com o processamento mais recente. */
const grupos = new Map();
for (const c of campanhas) {
  const meus = itens.filter((i) => i.campanha_id === c.id);
  if (!meus.length) continue;
  const decididoEm = meus.map((i) => String(i.decidido_em ?? "").slice(0, 10)).filter(Boolean).sort();
  /* Sem data no nome, a janela vai da decisão até hoje: o canal não
     declara o fim, e uma ação de um dia só não tem período para medir. */
  const janela = janelaDoNome(c.nome) ?? { inicio: decididoEm[0], fim: hojeSP, semData: true };
  const chave = `${programa(c.nome)}|${janela.inicio}|${janela.fim}`;
  const atual = grupos.get(chave);
  if (!atual || (decididoEm.at(-1) ?? "") > atual.processadoEm) {
    grupos.set(chave, {
      programa: programa(c.nome),
      janela,
      processadoEm: decididoEm.at(-1) ?? "",
      itens: meus,
      nomeCompleto: c.nome,
    });
  }
}

const hoje = hojeSP;
const reais = (v) => (v == null ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const detalhes = (d) => ({
  objetivo: "", responsavel: "", divulgacao: "", publico: "", briefing: "", link: "",
  orcamento: null, meta: "", checklist: [], porProduto: {}, grupos: [], origem: ORIGEM, ...d,
});
const estrategia = (e) => ({
  foco: "", hipotese: "", indicador: "", indicadorPersonalizado: "", alvo: null,
  anuncios: [], execucoes: [], medicao: { valor: null, fonte: "", data: "" },
  fechamento: { funcionou: "", problemas: "", proximoPasso: "", decisao: "" }, ...e,
});

const idCampanha = crypto.randomUUID();
const acoes = [...grupos.values()]
  .sort((a, b) => a.janela.inicio.localeCompare(b.janela.inicio))
  .map((g) => {
    const participando = g.itens.filter((i) => i.decisao === "participar");
    const skus = [...new Set(participando.map((i) => String(anunPorId.get(i.anuncio_id)?.sku_canal ?? "").toUpperCase()).filter(Boolean))];
    const foraDoAcordo = skus.filter((s) => !noAcordo.has(s));
    const descontos = participando.map((i) => Number(i.desconto_percentual)).filter((v) => Number.isFinite(v) && v > 0);
    const descontoMedio = descontos.length ? descontos.reduce((s, v) => s + v, 0) / descontos.length : null;
    return {
      natureza: "acao",
      campanha_id: idCampanha,
      titulo: `${g.programa}${g.janela.semData ? "" : ` · ${g.janela.inicio.slice(8)}/${g.janela.inicio.slice(5, 7)} a ${g.janela.fim.slice(8)}/${g.janela.fim.slice(5, 7)}`}`,
      inicio: g.janela.inicio,
      fim: g.janela.fim,
      status: g.janela.fim < hoje ? "Concluída" : g.janela.inicio > hoje ? "Planejada" : "Em andamento",
      tipo: "Promoção",
      etapa: "Lançamento",
      cor: "#9333ea",
      skus,
      detalhes: detalhes({
        objetivo: `Campanha aberta pelo canal, SEM redução de tarifa: o desconto sai inteiro da margem. ${participando.length} anúncios participando de ${g.itens.length} ofertados.`,
        briefing: g.janela.semData
          ? "O nome da campanha não traz a janela, então o período é o da decisão. Confira a data real no painel do canal."
          : "",
        meta: descontoMedio != null ? `Desconto médio aceito: ${descontoMedio.toFixed(1)}%` : "",
        porProduto: Object.fromEntries(
          participando
            .map((i) => {
              const a = anunPorId.get(i.anuncio_id);
              const sku = String(a?.sku_canal ?? "").toUpperCase();
              if (!sku) return null;
              return [
                sku,
                [
                  `oferta ${reais(i.preco_oferta)}`,
                  i.desconto_percentual ? `−${Number(i.desconto_percentual).toFixed(1)}%` : null,
                  noAcordo.has(sku) ? "também no pré-acordo" : "só campanha do canal",
                ]
                  .filter(Boolean)
                  .join(" · "),
              ];
            })
            .filter(Boolean)
        ),
      }),
      _resumo: { participando: participando.length, ofertados: g.itens.length, skus: skus.length, fora: foraDoAcordo.length, descontoMedio },
    };
  });

const campanha = {
  id: idCampanha,
  natureza: "campanha",
  titulo: "Campanhas do Mercado Livre · sem rebate",
  inicio: acoes.reduce((m, a) => (a.inicio < m ? a.inicio : m), acoes[0]?.inicio ?? hoje),
  fim: acoes.reduce((m, a) => (a.fim > m ? a.fim : m), acoes[0]?.fim ?? hoje),
  status: "Em andamento",
  tipo: "Promoção",
  etapa: "Sustentação",
  cor: "#9333ea",
  skus: [...new Set(acoes.flatMap((a) => a.skus))],
  detalhes: detalhes({
    objetivo: "As campanhas que o canal abre para todos, sem rebate negociado. O desconto sai inteiro da margem — a pergunta é se elas trazem venda que o pré-acordo não traz.",
    responsavel: "Eduardo",
    estrategia: estrategia({
      foco: "Vender mais",
      hipotese: "Campanha do canal sem rebate pode estar sustentando volume em produtos fora do pré-acordo — se estiver, vale ampliar; se não, vale sair e preservar margem.",
      indicador: "receita",
      execucoes: acoes.map((a) => ({
        destino: a.titulo,
        situacao: a.status === "Concluída" ? "Executada" : a.status === "Em andamento" ? "Em execução" : "Não iniciada",
        inicio: a.inicio,
        fim: a.fim,
        mudancas: `${a._resumo.participando} de ${a._resumo.ofertados} anúncios participando · ${a._resumo.skus} SKUs, ${a._resumo.fora} fora do pré-acordo`,
        evidencia: "campanha_itens, decisão gravada no processamento da planilha do canal",
      })),
    }),
  }),
};

console.log("programas sem rebate:", acoes.length);
for (const a of acoes)
  console.log(
    `  ${a.inicio} a ${a.fim}  ${a.status.padEnd(13)} ${String(a._resumo.participando).padStart(4)}/${String(a._resumo.ofertados).padEnd(5)} anúncios · ${String(a._resumo.skus).padStart(3)} SKUs (${a._resumo.fora} fora do pré-acordo) · desconto médio ${a._resumo.descontoMedio?.toFixed(1) ?? "—"}%  ${a.titulo}`
  );
console.log("SKUs distintos na campanha:", campanha.skus.length);

if (!APLICAR) {
  console.log("\nensaio. rode com --aplicar para gravar.");
  process.exit(0);
}

const { data: antigos } = await sb.from("planejamento_itens").select("id,detalhes").eq("operacao_id", OPERACAO);
const meus = (antigos ?? []).filter((i) => i.detalhes?.origem === ORIGEM);
if (meus.length) {
  const { error } = await sb.from("planejamento_itens").delete().in("id", meus.map((i) => i.id));
  if (error) throw new Error(`Falha ao limpar: ${error.message}`);
  console.log(`removidos ${meus.length} itens da carga anterior`);
}
for (const grupo of [[campanha], acoes]) {
  const { error } = await sb
    .from("planejamento_itens")
    .insert(grupo.map(({ _resumo, ...i }) => ({ ...i, operacao_id: OPERACAO, canais: [CANAL_ML] })));
  if (error) throw new Error(`Falha ao gravar: ${error.message}`);
}
console.log(`gravados ${1 + acoes.length} itens`);
