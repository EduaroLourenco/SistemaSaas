import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarTarifasCobradas, chaveSemana } from "./tarifa-cobrada";
import { carregarFormulaBase } from "./formula-base";
import { carregarVitrineSemanal } from "./vitrine-semanal";
import type { Anuncio, SemanaDesempenho, DiaVenda } from "@/lib/analise";

/**
 * Análise de anúncios, lida do banco.
 *
 * Monta a mesma estrutura que `analisar()` já consome — um anúncio com a
 * lista das suas semanas — para que a lógica de lentes, elasticidade e
 * subsídio continue exatamente a mesma. A troca é de fonte, não de regra.
 */

export type DadosAnalise = {
  anuncios: Anuncio[];
  semanas: { semana: string; intervalo: string; inicio: string }[];
  categorias: string[];
  importacoes: {
    id: string;
    arquivo: string;
    periodo: string;
    linhas: number;
    quando: string;
  }[];
  vazio: boolean;
};

type LinhaSemana = {
  ano_iso: number;
  semana_iso: number;
  inicio: string;
  fim: string;
  visitas: number;
  vendas: number;
  receita: string;
  preco_praticado: string | null;
  preco_anunciado: string | null;
  preco_ideal: string | null;
  comissao_negociada: string | null;
  anuncios: {
    codigo_externo: string;
    titulo: string;
    sku_canal: string | null;
    tipo: string;
    status: string;
    estoque: number | null;
    preco_atual: string | number | null;
    contas_canal: { nome: string } | null;
  } | null;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const br = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/**
 * Categoria a partir do título.
 *
 * A planilha do canal não traz categoria, e o banco só a terá quando os
 * produtos forem cadastrados. Derivar da primeira palavra do título é
 * aproximação honesta: agrupa colchão com colchão, travesseiro com
 * travesseiro, e erra de forma visível em vez de silenciosa.
 */
function categoriaDe(titulo: string): string {
  const limpo = titulo.trim();
  if (!limpo) return "Sem categoria";
  const primeira = limpo.split(/\s+/)[0];
  return primeira.charAt(0).toUpperCase() + primeira.slice(1).toLowerCase();
}

/**
 * O preço de tabela de um anúncio, na comissão padrão dele.
 *
 * Procura por SKU e cai para MLB — a Fórmula base tem as duas chaves, o
 * SKU cobre quase tudo, e o MLB existe para o caso de o mesmo SKU ter
 * preço diferente por anúncio. Devolve 0 quando o anúncio não está na
 * tabela, que é o que a tela já trata como "sem tabela": são 135 dos
 * 1.004 anúncios da Probel, e inventar um preço para eles faria a tela
 * acusar desvio de um número que ninguém definiu.
 */
function precoDeTabela(
  base: Awaited<ReturnType<typeof carregarFormulaBase>>,
  mlb: string,
  sku: string | null,
): number {
  if (!base) return 0;
  const item = base.dados.baseMlb.get(mlb);
  if (!item) return 0;
  const comissao = Math.round(item.padrao * 1000) / 1000;
  const porMlb = base.dados.precosMLB.get(mlb);
  const porSku = sku ? base.dados.precosSKU.get(sku) : undefined;
  /* O MLB ganha do SKU: ele só existe quando alguém quis um preço
     diferente para aquele anúncio. */
  const achado = porMlb?.[comissao] ?? porSku?.[comissao];
  return achado ?? 0;
}

export async function carregarAnalise(): Promise<DadosAnalise> {
  const sb = await clienteServidor();

  const [linhas, { data: imports }, tarifas, base, vitrine] = await Promise.all([
    paginar(() =>
      sb
        .from("anuncio_desempenho_semanal")
        .select(
          "ano_iso,semana_iso,inicio,fim,visitas,vendas,receita,preco_praticado,preco_anunciado,preco_ideal,comissao_negociada," +
            "anuncios(codigo_externo,titulo,sku_canal,tipo,status,estoque,preco_atual,contas_canal(nome))"
        )
        .order("semana_iso", { ascending: true })
    ),
    sb
      .from("importacoes")
      .select("id,nome_arquivo,periodo_inicio,periodo_fim,linhas_validas,criado_em")
      .eq("tipo", "desempenho_anuncios")
      .order("criado_em", { ascending: false })
      .limit(20),
    carregarTarifasCobradas(sb),
    carregarFormulaBase(),
    carregarVitrineSemanal(sb),
  ]);

  const dados = linhas as unknown as LinhaSemana[];

  if (!dados.length) {
    return { anuncios: [], semanas: [], categorias: [], importacoes: [], vazio: true };
  }

  const semanasVistas = new Map<string, { intervalo: string; inicio: string }>();
  const porAnuncio = new Map<string, Anuncio>();

  for (const l of dados) {
    const a = l.anuncios;
    if (!a) continue;

    const rotulo = `S${l.semana_iso}`;
    if (!semanasVistas.has(rotulo)) {
      semanasVistas.set(rotulo, {
        intervalo: `${br(l.inicio)} – ${br(l.fim)}`,
        inicio: l.inicio,
      });
    }

    let anuncio = porAnuncio.get(a.codigo_externo);
    if (!anuncio) {
      anuncio = {
        mlb: a.codigo_externo,
        sku: a.sku_canal ?? "",
        titulo: a.titulo,
        tipo: a.tipo === "premium" ? "Premium" : "Clássico",
        status: a.status === "pausado" ? "pausado" : "ativo",
        conta: a.contas_canal?.nome ?? "Conta principal",
        categoria: categoriaDe(a.titulo),
        estoque: a.estoque,
        precoAtual: a.preco_atual == null ? null : n(a.preco_atual),
        semanas: [],
      };
      porAnuncio.set(a.codigo_externo, anuncio);
    }

    const receita = n(l.receita);
    const vendas = l.vendas;

    /*
     * O detalhe por dia só existe quando vem da API de pedidos. A planilha
     * fecha a semana, então `dias` fica vazio e a tela mostra a semana sem
     * abrir. Melhor que espalhar a venda pelos sete dias: isso inventaria
     * um dia de pico que nunca houve.
     */
    const dias: DiaVenda[] = [];

    const semana: SemanaDesempenho = {
      semana: rotulo,
      intervalo: `${br(l.inicio)} – ${br(l.fim)}`,
      visitas: l.visitas,
      vendas,
      receita,
      /*
       * Da leitura diária de vitrine, no último dia medido da semana.
       * Null quando não houve leitura — cair para o preço pago, como
       * antes, misturava dois preços diferentes e zerava a semana sem
       * venda.
       */
      precoAnunciado:
        n(l.preco_anunciado) ||
        vitrine.get(chaveSemana(a.codigo_externo, l.inicio)) ||
        null,
      precoRealizado:
        l.preco_praticado != null
          ? n(l.preco_praticado)
          : vendas
            ? receita / vendas
            : null,
      /*
       * Da Fórmula base, ao vivo. A coluna `preco_ideal` desta tabela
       * está nula nas 10.452 linhas do banco — nunca foi gravada — e era
       * ela que deixava três lentes apagadas e a margem subsidiada em
       * zero. Fica o `??` porque, no dia em que alguém gravar a coluna,
       * o valor gravado para aquela semana é mais preciso que a tabela
       * de hoje.
       */
      precoIdeal: n(l.preco_ideal) || precoDeTabela(base, a.codigo_externo, a.sku_canal),
      comissao: n(l.comissao_negociada),
      // A de tabela vem do catálogo; esta vem do que foi cobrado de fato.
      // Null quando não houve venda com comissão conhecida na semana.
      tarifaCobrada: tarifas.get(chaveSemana(a.codigo_externo, l.inicio)) ?? null,
      dias,
      campanhas: [],
    };

    anuncio.semanas.push(semana);
  }

  for (const a of porAnuncio.values()) {
    a.semanas.sort((x, y) => Number(x.semana.slice(1)) - Number(y.semana.slice(1)));
  }

  const semanas = [...semanasVistas.entries()]
    .map(([semana, v]) => ({ semana, ...v }))
    .sort((x, y) => x.inicio.localeCompare(y.inicio));

  const categorias = [...new Set([...porAnuncio.values()].map((a) => a.categoria))].sort();

  const importacoes = (imports ?? []).map((i) => ({
    id: i.id as string,
    arquivo: i.nome_arquivo as string,
    periodo:
      i.periodo_inicio && i.periodo_fim
        ? `${br(i.periodo_inicio as string)} – ${br(i.periodo_fim as string)}`
        : "—",
    linhas: (i.linhas_validas as number) ?? 0,
    quando: (i.criado_em as string).slice(0, 10),
  }));

  return {
    anuncios: [...porAnuncio.values()],
    semanas,
    categorias,
    importacoes,
    vazio: false,
  };
}
