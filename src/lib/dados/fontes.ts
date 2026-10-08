import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * Até quando cada fonte de dados vai.
 *
 * Responde a pergunta que vem antes de qualquer número: posso confiar no
 * que estou vendo? Um painel que mostra a semana toda quando a planilha
 * só cobre até terça não está errado — está incompleto, e essas duas
 * coisas se parecem demais na tela.
 *
 * ── Duas datas, e a diferença importa ──
 *
 *   cobertura  — até que dia o DADO vai
 *   importado  — quando alguém subiu o arquivo
 *
 * Elas divergem sempre. Subir hoje uma planilha que termina na semana
 * passada deixa "importado" recente e "cobertura" velha — e é a cobertura
 * que decide se o gráfico está completo. Mostrar só a data de importação
 * daria uma sensação de atualidade que o dado não tem.
 */

export type Fonte = {
  id: string;
  nome: string;
  /** O que esta fonte alimenta, em português. */
  alimenta: string;
  /** Até que data o dado vai. Null quando a fonte nunca foi carregada. */
  cobertura: string | null;
  /** Quando a última importação aconteceu. */
  importadoEm: string | null;
  /** Quantos registros existem. */
  registros: number;
  /**
   * Dias entre a cobertura e hoje. Null quando não há dado.
   *
   * É o número que decide a cor. Não vale para o catálogo, que é retrato
   * do momento e não série temporal — lá o atraso se mede pela
   * importação.
   */
  atrasoDias: number | null;
  /** Como esta fonte entra no sistema. */
  origem: "api" | "planilha" | "manual";
};

export type DadosFontes = {
  fontes: Fonte[];
  /** O maior atraso entre as fontes que alimentam o painel. */
  piorAtraso: number | null;
  hoje: string;
};

/** Dias entre uma data e hoje, sem fuso — são dias civis, não instantes. */
function atrasoDe(iso: string | null): number | null {
  if (!iso) return null;
  const dia = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
  const hoje = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((hoje - dia) / 86_400_000));
}

export async function carregarFontes(): Promise<DadosFontes> {
  const sb = await clienteServidor();

  const [
    pedidosApi,
    pedidosPlanilha,
    semanal,
    diario,
    anuncios,
    catalogo,
    manual,
    formula,
    importacoes,
  ] = await Promise.all([
    /*
     * Pedido por API e pedido por planilha são fontes diferentes, e desde
     * que a VTEX e o Mercado Livre entraram por API precisam ser medidos
     * separado. Uma consulta só, sem filtro de origem, pegava o dia mais
     * recente de QUALQUER pedido: a linha "Planilha de pedidos" aparecia
     * em dia porque a API tinha rodado, enquanto o Magalu e a Casas Bahia
     * — que só entram por planilha — estavam três e seis dias atrás.
     */
    sb.from("pedidos").select("data").eq("origem", "api")
      .order("data", { ascending: false }).limit(1),
    sb.from("pedidos").select("data").eq("origem", "planilha")
      .order("data", { ascending: false }).limit(1),
    sb
      .from("anuncio_desempenho_semanal")
      .select("fim")
      .order("fim", { ascending: false })
      .limit(1),
    sb
      .from("anuncio_desempenho_diario")
      .select("data")
      .order("data", { ascending: false })
      .limit(1),
    sb.from("anuncios").select("id", { count: "exact", head: true }),
    /* O catálogo deixou de vir por planilha: a sincronização do canal
       reescreve preço, tipo e estoque a cada passagem. */
    sb.from("anuncios").select("sincronizado_em").not("sincronizado_em", "is", null)
      .order("sincronizado_em", { ascending: false }).limit(1),
    sb
      .from("vendas_diarias")
      .select("data")
      .eq("origem", "manual")
      .order("data", { ascending: false })
      .limit(1),
    sb.from("formula_base_itens").select("id", { count: "exact", head: true }),
    sb
      .from("importacoes")
      .select("tipo, criado_em")
      .order("criado_em", { ascending: false })
      .limit(200),
  ]);

  const contagem = async (tabela: string, origem?: string) => {
    let q = sb.from(tabela).select("id", { count: "exact", head: true });
    if (origem) q = q.eq("origem", origem);
    const { count } = await q;
    return count ?? 0;
  };

  // Pedido por API e por planilha contados à parte: com uma contagem só, as
  // duas linhas mostravam o mesmo total, e nenhuma dizia de onde vinha o dado.
  const [qtdPedidosApi, qtdPedidosPlanilha, qtdSemanal, qtdDiario] = await Promise.all([
    contagem("pedidos", "api"),
    contagem("pedidos", "planilha"),
    contagem("anuncio_desempenho_semanal"),
    contagem("anuncio_desempenho_diario"),
  ]);

  /** Última importação de um tipo. */
  const ultima = (tipo: string): string | null =>
    (importacoes.data ?? []).find((i) => i.tipo === tipo)?.criado_em ?? null;

  // O desempenho chega em dois grãos: semanal quando o relatório cobre um
  // intervalo, diário quando cobre um dia. A cobertura é a mais recente
  // das duas, senão importar um diário depois de um semanal pareceria
  // retrocesso.
  // O semanal grava o domingo da semana, mesmo com ela em andamento: limita a
  // hoje, senão a fonte aparecia "atualizada até" um dia que não chegou.
  const hojeIso = new Date().toISOString().slice(0, 10);
  const fimSemanal = (semanal.data?.[0]?.fim as string) ?? null;
  const coberturaSemanal = fimSemanal && fimSemanal > hojeIso ? hojeIso : fimSemanal;
  const coberturaDiario = (diario.data?.[0]?.data as string) ?? null;
  const coberturaApi = (pedidosApi.data?.[0]?.data as string) ?? null;
  const coberturaPlanilha = (pedidosPlanilha.data?.[0]?.data as string) ?? null;
  const coberturaManual = (manual.data?.[0]?.data as string) ?? null;
  const sincronizado = (catalogo.data?.[0]?.sincronizado_em as string) ?? null;
  /* Enquanto a sincronização não tiver passado, vale a última importação —
     é o que valia antes de o canal ter API. */
  const coberturaCatalogo = sincronizado?.slice(0, 10) ?? ultima("catalogo")?.slice(0, 10) ?? null;

  const fontes: Fonte[] = [
    {
      id: "pedidos-api",
      nome: "Pedidos por API",
      alimenta: "Canais conectados (Mercado Livre, VTEX, Bling) — receita, comissão e frete",
      cobertura: coberturaApi,
      importadoEm: null,
      registros: qtdPedidosApi,
      atrasoDias: atrasoDe(coberturaApi),
      origem: "api",
    },
    {
      id: "pedidos",
      nome: "Planilha de pedidos",
      alimenta: "Magalu, Casas Bahia, Madeira e os demais canais",
      cobertura: coberturaPlanilha,
      importadoEm: ultima("pedidos") ?? ultima("consolidado"),
      registros: qtdPedidosPlanilha,
      atrasoDias: atrasoDe(coberturaPlanilha),
      origem: "planilha",
    },
    {
      id: "desempenho-api",
      nome: "Visitas por anúncio",
      alimenta: "Visitas diárias do Mercado Livre, por anúncio",
      cobertura: coberturaDiario,
      importadoEm: null,
      registros: qtdDiario,
      atrasoDias: atrasoDe(coberturaDiario),
      origem: "api",
    },
    {
      id: "desempenho",
      nome: "Desempenho por planilha",
      alimenta: "A série semanal, anterior à API",
      cobertura: coberturaSemanal,
      importadoEm: ultima("desempenho_anuncios"),
      registros: qtdSemanal,
      atrasoDias: atrasoDe(coberturaSemanal),
      origem: "planilha",
    },
    {
      id: "catalogo",
      nome: "Catálogo de anúncios",
      alimenta: "Preço de vitrine, tarifa, tipo e estoque",
      // Retrato do momento, não série: a cobertura é quando foi lido.
      cobertura: coberturaCatalogo,
      importadoEm: sincronizado ?? ultima("catalogo"),
      registros: anuncios.count ?? 0,
      atrasoDias: atrasoDe(coberturaCatalogo),
      origem: sincronizado ? "api" : "planilha",
    },
    {
      id: "lancamentos",
      nome: "Lançamentos manuais",
      alimenta: "Visitas e investimento em ADS — o que a planilha não traz",
      cobertura: coberturaManual,
      importadoEm: null,
      registros: 0,
      atrasoDias: atrasoDe(coberturaManual),
      origem: "manual",
    },
    {
      id: "formula",
      nome: "Fórmula base",
      alimenta: "Preço ideal e piso, usados nas promoções",
      cobertura: ultima("preco_ideal")?.slice(0, 10) ?? null,
      importadoEm: ultima("preco_ideal"),
      registros: formula.count ?? 0,
      atrasoDias: atrasoDe(ultima("preco_ideal")?.slice(0, 10) ?? null),
      origem: "planilha",
    },
  ];

  // O pior atraso considera só o que alimenta o painel: a Fórmula base é
  // regra de preço, não série temporal, e envelhece em outro ritmo.
  const doPainel = fontes.filter((f) => f.id !== "formula" && f.atrasoDias !== null);

  return {
    fontes,
    piorAtraso: doPainel.length
      ? Math.max(...doPainel.map((f) => f.atrasoDias!))
      : null,
    hoje: new Date().toISOString().slice(0, 10),
  };
}
