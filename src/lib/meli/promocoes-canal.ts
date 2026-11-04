import "server-only";
import { meliGet, vendedor, type Conta } from "./cliente";

/**
 * As promoções que o canal diz estar NO AR — inclusive cupom.
 *
 * ── Por que ler isto, já havendo `campanhas` ──
 *
 * `campanhas` guarda o que o motor processou de planilha: decisão por
 * item, preço de tabela, margem. Responde "o que decidimos". Não responde
 * "o que está no ar agora", e há tipo que nunca passa por planilha —
 * cupom, relâmpago e o desconto inteligente do canal.
 *
 * ── O que a API devolve ──
 *
 * `GET /seller-promotions/users/{id}?app_version=v2` lista as promoções
 * vivas. Conferido na conta da Probel em 16/10/2026: oito promoções, de
 * seis tipos — LIGHTNING, SMART, PRE_NEGOTIATED, SELLER_CAMPAIGN,
 * SELLER_COUPON_CAMPAIGN e DEAL.
 *
 * Os itens saem de `promotions/{id}/items?promotion_type=...`.
 *
 * ── O que ela NÃO devolve ──
 *
 * USO. A campanha de cupom diz o que foi configurado — percentual, faixa
 * de compra, janela — e nunca quantas vezes foi usada. Quem mede uso é o
 * pedido, em `coupon.amount`, que a sincronização passou a gravar em
 * `pedidos.cupom` (ver db/40).
 */

export type PromocaoCanal = {
  codigo: string;
  tipo: string;
  subTipo: string | null;
  nome: string | null;
  status: string | null;
  inicio: string | null;
  fim: string | null;
  percentual: number | null;
  valorFixo: number | null;
  compraMinima: number | null;
  compraMaxima: number | null;
  bruto: Record<string, unknown>;
};

export type ItemPromocaoCanal = {
  codigoExterno: string;
  status: string | null;
  precoOriginal: number | null;
  precoPromocional: number | null;
  percentual: number | null;
  inicio: string | null;
  fim: string | null;
  /*
   * Daqui para baixo é o que a tela de Automações precisa e a gravação
   * não usa. Vem junto porque é a mesma chamada: pedir de novo só para
   * ter o piso do canal seria gastar cota duas vezes pelo mesmo dado.
   */
  /** O mais barato que o canal aceita — o desconto máximo do item. */
  precoMinimo: number | null;
  /** O mais caro que ele considera crível. Acima disso recusa a linha. */
  precoMaximo: number | null;
  /** A sugestão dele. Nula quando não tem histórico para sugerir. */
  sugerido: number | null;
  /** Quanto o canal põe e quanto nós pomos, em pontos. */
  meliPct: number | null;
  sellerPct: number | null;
  /** `offer_id` ou `ref_id` — é o que identifica o candidato no aceite. */
  oferta: string | null;
  /** Só em relâmpago e oferta do dia: a faixa de unidades. */
  estoqueMin: number | null;
  estoqueMax: number | null;
  subTipo: string | null;
};

type PromoBruta = {
  id?: string;
  type?: string;
  sub_type?: string;
  name?: string;
  status?: string;
  start_date?: string;
  finish_date?: string;
  fixed_percentage?: number;
  percentage?: number;
  fixed_amount?: number;
  min_purchase_amount?: number;
  max_purchase_amount?: number;
};

type ItemBruto = {
  id?: string;
  status?: string;
  original_price?: number;
  price?: number;
  deal_price?: number;
  suggested_discounted_price?: number;
  min_discounted_price?: number;
  max_discounted_price?: number;
  meli_percentage?: number;
  seller_percentage?: number;
  offer_id?: string;
  ref_id?: string;
  sub_type?: string;
  stock?: { min?: number; max?: number };
  fixed_percentage?: number;
  discount_percentage?: number;
  start_date?: string;
  end_date?: string;
};

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/* O canal manda data sem fuso em alguns campos ("2026-10-15T00:00:00") e
   com Z em outros. Sem normalizar, o item cai um dia antes no banco. */
const data = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : s + "Z";
};

/* ══════════════════════════════════════════════════════════════
   As promoções de UM anúncio
   ══════════════════════════════════════════════════════════════ */

/**
 * O que este MLB tem no ar, e para o que o canal o convidou.
 *
 * ── Por que não dá para montar isto do que já temos ──
 *
 * `lerItensDaPromocao` vai da promoção para os itens: para saber as oito
 * promoções de um anúncio, seriam oito chamadas paginadas, uma por
 * campanha viva da conta. Esta é uma chamada só, e devolve inclusive o
 * que não passa por campanha da conta — PRICE_DISCOUNT, LIGHTNING e o
 * desconto no Pix do próprio canal.
 *
 * ── O formato, conferido em 29/10/2026 nas quatro contas ──
 *
 * `GET /seller-promotions/items/{MLB}?app_version=v2` devolve um ARRAY
 * puro, não `{results}` como os outros dois endpoints deste módulo. Dez
 * tipos apareceram: SMART, SMART_LIGHTNING, LIGHTNING, DEAL,
 * SELLER_CAMPAIGN, SELLER_COUPON_CAMPAIGN, PRE_NEGOTIATED, BANK,
 * PRICE_DISCOUNT e UNHEALTHY_STOCK.
 *
 * Aqui `id` é o código da PROMOÇÃO — ao contrário de
 * `promotions/{id}/items`, onde `id` é o do anúncio. PRICE_DISCOUNT vem
 * sem `id` e com `name` vazio: é o desconto solto, que não tem campanha.
 *
 * ── As três armadilhas ──
 *
 * `price: 0` no convite é "ainda não tem preço", não promoção de graça.
 * Vira null, senão a tela mostra R$ 0,00 como oferta.
 *
 * `status` separa o que ESTÁ no ar (`started`) do que é só convite
 * (`candidate`). A tela que juntar os dois mente duas vezes.
 *
 * Anúncio em revisão responde HTTP 400 ("Item status is not allowed").
 * Isso é "não dá para perguntar", e não "nenhuma promoção" — daí o
 * resultado vir com `lido`, e não como lista vazia.
 */
export type PromocaoDoAnuncio = {
  /** Código da promoção. Null em PRICE_DISCOUNT, que não tem campanha. */
  codigo: string | null;
  tipo: string;
  subTipo: string | null;
  nome: string | null;
  /** `started` está no ar agora; `candidate` é convite ainda não aceito. */
  status: string | null;
  precoOriginal: number | null;
  /** O preço da promoção. Null no convite que ainda não tem preço. */
  preco: number | null;
  precoMinimo: number | null;
  precoMaximo: number | null;
  sugerido: number | null;
  percentual: number | null;
  /** Quanto o canal põe e quanto nós pomos, em pontos. */
  meliPct: number | null;
  sellerPct: number | null;
  inicio: string | null;
  fim: string | null;
  /** `offer_id` ou `ref_id` — identifica o candidato no aceite. */
  oferta: string | null;
  /** Só em relâmpago e oferta do dia: a faixa de unidades. */
  estoqueMin: number | null;
  estoqueMax: number | null;
  /** Só em promoção de meio de pagamento (BANK/COFINANCED): "PIX". */
  meioPagamento: string | null;
};

/** Lista, ou o motivo de não ter perguntado. Nunca lista vazia por falha. */
export type PromocoesDoAnuncio =
  | { lido: true; promocoes: PromocaoDoAnuncio[] }
  | { lido: false; motivo: string };

type PromoDoItemBruta = {
  id?: string;
  type?: string;
  sub_type?: string;
  name?: string;
  status?: string;
  price?: number;
  original_price?: number;
  min_discounted_price?: number;
  max_discounted_price?: number;
  suggested_discounted_price?: number;
  fixed_percentage?: number;
  meli_percentage?: number;
  seller_percentage?: number;
  start_date?: string;
  finish_date?: string;
  offer_id?: string;
  ref_id?: string;
  stock?: { min?: number; max?: number };
  payment_method?: string;
};

/**
 * O motivo, em poucas palavras, para caber na própria linha da tela.
 *
 * `meliGet` já traduz 429 e conta não conectada; o que chega aqui como
 * HTTP 400 é o anúncio que o canal não aceita avaliar.
 */
function motivoDaRecusa(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/HTTP 400/.test(m)) return "o canal não avalia este anúncio";
  if (/429|limite de chamadas/.test(m)) return "cota do canal estourada";
  if (/não conectada|não configurada/i.test(m)) return "conta não conectada";
  return "o canal não respondeu";
}

export async function promocoesDoAnuncio(
  conta: Conta,
  mlb: string
): Promise<PromocoesDoAnuncio> {
  let bruto: PromoDoItemBruta[];
  try {
    bruto = await meliGet<PromoDoItemBruta[]>(
      `/seller-promotions/items/${mlb}?app_version=v2`,
      conta
    );
  } catch (e) {
    return { lido: false, motivo: motivoDaRecusa(e) };
  }
  if (!Array.isArray(bruto)) return { lido: false, motivo: "o canal não respondeu" };

  return {
    lido: true,
    promocoes: bruto
      .filter((p) => p.type)
      .map((p) => {
        /* Zero é ausência de preço aqui, não preço zero: o convite que
           ainda não tem valor definido vem com `price: 0`. */
        const preco = num(p.price);
        return {
          codigo: p.id ?? null,
          tipo: String(p.type),
          subTipo: p.sub_type ?? null,
          nome: p.name?.trim() ? p.name : null,
          status: p.status ?? null,
          precoOriginal: num(p.original_price),
          preco: preco === 0 ? null : preco,
          precoMinimo: num(p.min_discounted_price),
          precoMaximo: num(p.max_discounted_price),
          sugerido: num(p.suggested_discounted_price),
          percentual: num(p.fixed_percentage),
          meliPct: num(p.meli_percentage),
          sellerPct: num(p.seller_percentage),
          inicio: data(p.start_date),
          fim: data(p.finish_date),
          oferta: p.offer_id ?? p.ref_id ?? null,
          estoqueMin: num(p.stock?.min),
          estoqueMax: num(p.stock?.max),
          meioPagamento: p.payment_method ?? null,
        };
      }),
  };
}

export async function lerPromocoesDoCanal(conta: Conta): Promise<PromocaoCanal[]> {
  const v = await vendedor(conta);
  const r = await meliGet<{ results?: PromoBruta[] }>(`/seller-promotions/users/${v.id}?app_version=v2`, conta);
  return (r.results ?? [])
    .filter((p) => p.id && p.type)
    .map((p) => ({
      codigo: String(p.id),
      tipo: String(p.type),
      subTipo: p.sub_type ?? null,
      nome: p.name ?? null,
      status: p.status ?? null,
      inicio: data(p.start_date),
      fim: data(p.finish_date),
      percentual: num(p.fixed_percentage ?? p.percentage),
      valorFixo: num(p.fixed_amount),
      compraMinima: num(p.min_purchase_amount),
      compraMaxima: num(p.max_purchase_amount),
      bruto: p as Record<string, unknown>,
    }));
}

/**
 * Os itens de uma promoção.
 *
 * A paginação é por CURSOR (`search_after`): pedir offset devolve sempre a
 * primeira página. O teto de voltas existe porque cursor que não avança é
 * falha silenciosa do outro lado, e laço infinito num cron é pior que dado
 * incompleto.
 */
/**
 * Uma linha por JANELA, sem repetir a mesma janela.
 *
 * O canal devolve uma linha por OFERTA, não por anúncio, e isso não é
 * sujeira: é a agenda. No pré-acordo da Probel o mesmo anúncio tem o preço
 * do mês numa janela de 30 dias e o preço do relâmpago em janelas de 12
 * horas, nas datas combinadas — onze janelas num anúncio só.
 *
 * Esta função deduplicava por MLB e guardava a última, o que descartava
 * dez das onze. Agora a chave é (anúncio, oferta), igual à do banco depois
 * da migração 47: o que ela ainda tira é a MESMA oferta repetida, que é o
 * que derrubava o lote inteiro com "ON CONFLICT DO UPDATE command cannot
 * affect row a second time".
 *
 * Sem oferta — convite que o canal manda sem id de oferta — cai numa
 * chave só por anúncio, e aí vale a última, como antes.
 */
export function semRepetidos(itens: ItemPromocaoCanal[]): ItemPromocaoCanal[] {
  const porJanela = new Map<string, ItemPromocaoCanal>();
  for (const i of itens) porJanela.set(`${i.codigoExterno.toUpperCase()}|${i.oferta ?? ""}`, i);
  return [...porJanela.values()];
}

export async function lerItensDaPromocao(
  conta: Conta,
  promocao: { codigo: string; tipo: string },
  limite = 1500
): Promise<ItemPromocaoCanal[]> {
  const itens: ItemPromocaoCanal[] = [];
  let cursor: string | undefined;
  for (let volta = 0; volta < 40; volta++) {
    const q = new URLSearchParams({ promotion_type: promocao.tipo, app_version: "v2", limit: "50" });
    if (cursor) q.set("search_after", cursor);
    const r = await meliGet<{
      results?: ItemBruto[];
      paging?: { searchAfter?: string; search_after?: string };
    }>(`/seller-promotions/promotions/${promocao.codigo}/items?${q}`, conta);
    const lote = r.results ?? [];
    for (const i of lote) {
      if (!i.id) continue;
      itens.push({
        codigoExterno: String(i.id),
        status: i.status ?? null,
        precoOriginal: num(i.original_price),
        precoPromocional: num(i.deal_price ?? i.price ?? i.suggested_discounted_price),
        percentual: num(i.fixed_percentage ?? i.discount_percentage),
        inicio: data(i.start_date),
        fim: data(i.end_date),
        precoMinimo: num(i.min_discounted_price),
        precoMaximo: num(i.max_discounted_price),
        sugerido: num(i.suggested_discounted_price),
        meliPct: num(i.meli_percentage),
        sellerPct: num(i.seller_percentage),
        oferta: i.offer_id ?? i.ref_id ?? null,
        estoqueMin: num(i.stock?.min),
        estoqueMax: num(i.stock?.max),
        subTipo: i.sub_type ?? null,
      });
    }
    const proximo = r.paging?.searchAfter ?? r.paging?.search_after;
    if (!lote.length || !proximo || proximo === cursor || itens.length >= limite) break;
    cursor = proximo;
  }
  return itens;
}
