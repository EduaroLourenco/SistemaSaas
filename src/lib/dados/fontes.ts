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
  origem: "planilha" | "manual";
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
    pedidos,
    semanal,
    diario,
    anuncios,
    manual,
    formula,
    importacoes,
  ] = await Promise.all([
    sb.from("pedidos").select("data").order("data", { ascending: false }).limit(1),
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

  const contagem = async (tabela: string) => {
    const { count } = await sb
      .from(tabela)
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  };

  const [qtdPedidos, qtdSemanal] = await Promise.all([
    contagem("pedidos"),
    contagem("anuncio_desempenho_semanal"),
  ]);

  /** Última importação de um tipo. */
  const ultima = (tipo: string): string | null =>
    (importacoes.data ?? []).find((i) => i.tipo === tipo)?.criado_em ?? null;

  // O desempenho chega em dois grãos: semanal quando o relatório cobre um
  // intervalo, diário quando cobre um dia. A cobertura é a mais recente
  // das duas, senão importar um diário depois de um semanal pareceria
  // retrocesso.
  const fimSemanal = semanal.data?.[0]?.fim as string | undefined;
  const fimDiario = diario.data?.[0]?.data as string | undefined;
  const coberturaDesempenho =
    [fimSemanal, fimDiario].filter(Boolean).sort().pop() ?? null;

  const coberturaPedidos = (pedidos.data?.[0]?.data as string) ?? null;
  const coberturaManual = (manual.data?.[0]?.data as string) ?? null;
  const importCatalogo = ultima("catalogo");

  const fontes: Fonte[] = [
    {
      id: "pedidos",
      nome: "Planilha de pedidos",
      alimenta: "Receita, pedidos, ticket, comissão, frete e cancelamento",
      cobertura: coberturaPedidos,
      importadoEm: ultima("pedidos") ?? ultima("consolidado"),
      registros: qtdPedidos,
      atrasoDias: atrasoDe(coberturaPedidos),
      origem: "planilha",
    },
    {
      id: "desempenho",
      nome: "Desempenho de anúncios",
      alimenta: "Visitas, vendas e conversão por anúncio do Mercado Livre",
      cobertura: coberturaDesempenho,
      importadoEm: ultima("desempenho_anuncios"),
      registros: qtdSemanal,
      atrasoDias: atrasoDe(coberturaDesempenho),
      origem: "planilha",
    },
    {
      id: "catalogo",
      nome: "Catálogo de anúncios",
      alimenta: "Preço de vitrine, tarifa, tipo e estoque",
      // Retrato do momento, não série: a cobertura É a data da importação.
      cobertura: importCatalogo ? importCatalogo.slice(0, 10) : null,
      importadoEm: importCatalogo,
      registros: anuncios.count ?? 0,
      atrasoDias: atrasoDe(importCatalogo ? importCatalogo.slice(0, 10) : null),
      origem: "planilha",
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
