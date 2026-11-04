import "server-only";
import { carregarCanais } from "./canais";
import { carregarFormulaBase } from "./formula-base";
import { lerPromocoesDoCanal, lerItensDaPromocao } from "@/lib/meli/promocoes-canal";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";

/**
 * O que o Mercado Livre está oferecendo agora, por conta.
 *
 * ── Por que lê ao vivo e não do banco ──
 *
 * A pergunta desta tela é "o que está aberto HOJE, e até quando posso
 * aceitar". Prazo de aceite é o campo que mais envelhece: uma campanha
 * que fechou ontem continuaria no banco até a próxima sincronização, e a
 * pessoa gastaria a manhã montando uma oferta que não entra mais.
 *
 * ── O que carrega quando ──
 *
 * A lista de cartões é UMA chamada por conta — barata, e é o que a página
 * precisa para pintar. Os itens de cada promoção só saem quando o cartão
 * abre, pela rota `/api/automacoes/itens`: a maior promoção tem 748
 * linhas e o canal pagina de 50 em 50, então carregar as 36 de uma vez
 * seria meio minuto de espera e cota gasta em promoção que ninguém abriu.
 *
 * O cartão mostra o TOTAL de itens, que vem no `paging` da primeira
 * página — exato, e por uma chamada só. A divisão entre aceito, candidato
 * e agendado aparece ao abrir, quando há o dado inteiro para contá-la.
 */

export type PromocaoAberta = {
  codigo: string;
  tipo: string;
  subTipo: string | null;
  nome: string | null;
  status: string | null;
  inicio: string | null;
  fim: string | null;
  /** Até quando dá para aceitar. É o que decide a ordem da tela. */
  prazo: string | null;
  meliPct: number | null;
  sellerPct: number | null;
  contaId: string;
  contaNome: string;
};

export type DadosAutomacoes = {
  promocoes: PromocaoAberta[];
  contas: { id: string; nome: string; escrita: boolean }[];
  /** Conta que respondeu com erro — a tela diz qual, não some com ela. */
  falhas: { conta: string; erro: string }[];
  semConexao: boolean;
};

type PromoBrutaExtra = { deadline_date?: string; benefits?: { meli_percent?: number; seller_percent?: number } };

export async function carregarAutomacoes(): Promise<DadosAutomacoes> {
  const { contas } = await carregarCanais();
  const doMeli = contas.filter((c) => c.canalCodigo === "mercado_livre" && c.conectada && c.ativa);

  if (!doMeli.length) {
    return { promocoes: [], contas: [], falhas: [], semConexao: true };
  }

  const falhas: { conta: string; erro: string }[] = [];
  const porConta = await Promise.all(
    doMeli.map(async (c) => {
      try {
        const lista = await lerPromocoesDoCanal(c.id);
        return { conta: c, lista };
      } catch (e) {
        falhas.push({ conta: c.nome, erro: e instanceof Error ? e.message : "falhou" });
        return { conta: c, lista: [] };
      }
    })
  );

  /*
   * Uma chamada por conta, e acabou. A contagem por status fica para o
   * cliente, em `/api/automacoes/contagem`.
   *
   * Contar aqui custava três chamadas por promoção — 108 ao todo, numa
   * fila de cota — e a página levava 75 segundos para pintar, 56 deles
   * só esperando o canal. O cartão agora aparece na hora e os números
   * entram quando chegam.
   */
  const promocoes: PromocaoAberta[] = porConta.flatMap(({ conta, lista }) =>
    lista.map((p) => {
      const extra = p.bruto as PromoBrutaExtra;
      return {
        codigo: p.codigo,
        tipo: p.tipo,
        subTipo: p.subTipo,
        nome: p.nome,
        status: p.status,
        inicio: p.inicio,
        fim: p.fim,
        prazo: extra?.deadline_date ?? null,
        meliPct: extra?.benefits?.meli_percent ?? null,
        sellerPct: extra?.benefits?.seller_percent ?? null,
        contaId: conta.id,
        contaNome: conta.nome,
      };
    })
  );

  /* Quem vence antes vem primeiro: é a promoção que não dá para deixar
     para amanhã. Sem prazo vai para o fim. */
  promocoes.sort((a, b) => {
    const pa = a.prazo ?? a.fim ?? "9999";
    const pb = b.prazo ?? b.fim ?? "9999";
    return pa.localeCompare(pb) || a.contaNome.localeCompare(b.contaNome);
  });

  return {
    promocoes,
    contas: doMeli.map((c) => ({ id: c.id, nome: c.nome, escrita: Boolean(c.escrita?.conectada) })),
    falhas,
    semConexao: false,
  };
}

export type ContagemPromocao = {
  participando: number | null;
  agendados: number | null;
  pendentes: number | null;
  /**
   * Quanto o canal põe do próprio bolso, em pontos de comissão.
   *
   * Null é "esta campanha não tem rebate" — o caso normal em DEAL e em
   * cupom. Também cai aqui a leitura que falhou: o rebate não decide
   * nada nesta tela (quem decide é o prazo e o que espera resposta), e
   * um "não li o rebate" por linha seria barulho onde cabia silêncio.
   */
  rebate: { de: number; ate: number } | null;
};

/**
 * Quantos itens em cada status, sem varrer a promoção — e o rebate.
 *
 * `limit=1` basta para contar: o número vem no `paging.total`, e o item
 * que volta é descartado. Três chamadas de uma linha custam menos que
 * uma varredura de 748 — e o `meliGet` já passa pela fila de cota.
 *
 * Os três não somam o total: item `finished` fica fora de propósito, que
 * é o que saiu da campanha e não é decisão de ninguém.
 *
 * ── Por que o rebate vem daqui, e não da lista ──
 *
 * `benefits` NÃO existe no endpoint de lista de promoções. Conferido no
 * JSON cru das duas contas: as únicas chaves são deadline_date,
 * finish_date, fixed_percentage, id, max/min_purchase_amount, name,
 * start_date, status, sub_type e type. Por isso `meliPct` em
 * `PromocaoAberta` é sempre nulo.
 *
 * O rebate real é POR ITEM, em `meli_percentage`, e varia dentro da
 * mesma campanha — 2,2% num anúncio e 4,4% em outro. Uma página de 50
 * itens dá a faixa sem varrer as 748: é uma chamada a mais, e é o número
 * que o Eduardo pediu para enxergar sem abrir a campanha.
 */
export async function contarPorStatus(
  conta: string,
  codigo: string,
  tipo: string
): Promise<ContagemPromocao> {
  const { meliGet } = await import("@/lib/meli/cliente");
  const um = async (status: string) => {
    const q = new URLSearchParams({ promotion_type: tipo, app_version: "v2", limit: "1", status });
    const r = await meliGet<{ paging?: { total?: number } }>(
      `/seller-promotions/promotions/${codigo}/items?${q}`,
      conta
    );
    return r.paging?.total ?? null;
  };
  const faixaDeRebate = async () => {
    try {
      const amostra = await lerItensDaPromocao(conta, { codigo, tipo }, 50);
      const pontos = amostra.map((i) => i.meliPct).filter((v): v is number => v != null && v > 0);
      if (!pontos.length) return null;
      return { de: Math.min(...pontos), ate: Math.max(...pontos) };
    } catch {
      return null;
    }
  };
  const [participando, agendados, pendentes, rebate] = await Promise.all([
    um("started"), um("pending"), um("candidate"), faixaDeRebate(),
  ]);
  return { participando, agendados, pendentes, rebate };
}

/* ══════════════════════════════════════════════════════════════
   Os itens de uma promoção, com o nosso lado junto
   ══════════════════════════════════════════════════════════════ */

export type ItemAutomacao = {
  mlb: string;
  sku: string | null;
  titulo: string | null;
  foto: string | null;
  statusAnuncio: string | null;
  estoque: number | null;
  tipoAnuncio: string | null;
  /** Como o canal vê o item: candidate, pending, started, finished. */
  status: string | null;
  precoCanal: number | null;
  precoCheio: number | null;
  minimoCanal: number | null;
  maximoCanal: number | null;
  sugerido: number | null;
  meliPct: number | null;
  sellerPct: number | null;
  oferta: string | null;
  /**
   * A JANELA desta linha, que é o que distingue duas linhas do mesmo
   * anúncio.
   *
   * O pré-acordo não é um preço, é uma agenda: o mesmo MLB vem com o
   * preço do mês numa janela de 30 dias e o do relâmpago em janelas de 12
   * horas, nas datas combinadas. Sem estas duas datas a tela mostrava
   * onze linhas iguais e a pessoa não tinha como saber qual era qual.
   *
   * Null nas campanhas de data fixa, onde a janela é a da campanha e já
   * está no cabeçalho.
   */
  inicio: string | null;
  fim: string | null;
  estoqueMin: number | null;
  estoqueMax: number | null;
  /** O nosso piso na comissão cheia do tipo do anúncio. */
  piso: number | null;
  /**
   * A linha inteira da Fórmula base, alinhada com `bandas`.
   *
   * Vai junto porque a tela recalcula a faixa a cada mexida na folga: sem
   * ela, a coluna que decide ficaria presa ao preço que o canal propôs.
   */
  precos: (number | null)[];
  comissaoCheia: number | null;
};

export type ItensDaPromocao = {
  bandas: number[];
  itens: ItemAutomacao[];
  /** O canal cortou a varredura no teto de segurança. */
  truncado: boolean;
};

export async function carregarItensDaPromocao(
  contaId: string,
  codigo: string,
  tipo: string
): Promise<ItensDaPromocao> {
  const [doCanal, base, anuncios] = await Promise.all([
    lerItensDaPromocao(contaId, { codigo, tipo }, 2000),
    carregarFormulaBase(),
    lerAnunciosDaConta(contaId),
  ]);

  /* As faixas de comissão que a base tem, uma vez só — a tela precisa
     delas para recalcular a faixa quando a folga muda. */
  const bandas = [
    ...new Set(
      [...(base?.dados.precosSKU.values() ?? []), ...(base?.dados.precosMLB.values() ?? [])]
        .flatMap((linha) => Object.keys(linha).map(Number))
    ),
  ].sort((a, b) => a - b);

  /* O MLB tem precedência sobre o SKU: é o caso do mesmo SKU em kit e
     unidade, em que só a linha do anúncio sabe o preço certo. */
  const linhaDe = (mlb: string, sku: string | null) => {
    const r = base?.dados.precosMLB.get(mlb) ?? (sku ? base?.dados.precosSKU.get(sku) : undefined);
    return r ? bandas.map((b) => r[b] ?? null) : null;
  };

  const porMlb = new Map(anuncios.map((a) => [a.mlb.toUpperCase(), a]));

  const itens = doCanal.map((i): ItemAutomacao => {
    const a = porMlb.get(i.codigoExterno.toUpperCase()) ?? null;
    const linha = a ? linhaDe(a.mlb, a.sku) : null;
    const cheia = a ? (a.tipo?.toLowerCase().startsWith("prem") ? 0.165 : 0.115) : null;
    return {
      mlb: i.codigoExterno,
      sku: a?.sku ?? null,
      titulo: a?.titulo ?? null,
      foto: a?.foto ?? null,
      statusAnuncio: a?.status ?? null,
      estoque: a?.estoque ?? null,
      tipoAnuncio: a?.tipo ?? null,
      status: i.status,
      precoCanal: i.precoPromocional,
      precoCheio: i.precoOriginal,
      minimoCanal: i.precoMinimo,
      maximoCanal: i.precoMaximo,
      sugerido: i.sugerido,
      meliPct: i.meliPct,
      sellerPct: i.sellerPct,
      oferta: i.oferta,
      inicio: i.inicio,
      fim: i.fim,
      estoqueMin: i.estoqueMin,
      estoqueMax: i.estoqueMax,
      piso: linha && cheia != null ? linha[bandas.indexOf(cheia)] ?? null : null,
      precos: linha ?? [],
      comissaoCheia: cheia,
    };
  });

  return { bandas, itens, truncado: doCanal.length >= 2000 };
}

type AnuncioLeve = {
  mlb: string;
  sku: string | null;
  titulo: string;
  foto: string | null;
  status: string;
  estoque: number | null;
  tipo: string | null;
};

async function lerAnunciosDaConta(contaId: string): Promise<AnuncioLeve[]> {
  const sb = await clienteServidor();
  const linhas = await paginar<{
    codigo_externo: string;
    sku_canal: string | null;
    titulo: string;
    foto: string | null;
    status: string;
    estoque: number | null;
    tipo: string | null;
  }>(() =>
    sb
      .from("anuncios")
      .select("codigo_externo,sku_canal,titulo,foto,status,estoque,tipo")
      .eq("conta_canal_id", contaId)
  );
  return linhas.map((l) => ({
    mlb: l.codigo_externo,
    sku: l.sku_canal,
    titulo: l.titulo,
    foto: l.foto,
    status: l.status,
    estoque: l.estoque,
    tipo: l.tipo,
  }));
}
