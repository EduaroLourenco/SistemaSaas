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
      });
    }
    const proximo = r.paging?.searchAfter ?? r.paging?.search_after;
    if (!lote.length || !proximo || proximo === cursor || itens.length >= limite) break;
    cursor = proximo;
  }
  return itens;
}
