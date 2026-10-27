import "server-only";
import { meliEscrever, type Conta } from "./cliente";
import { corpoDoAceite, familiaDe, type PedidoDeAceite } from "@/lib/planilhas/corpo-promocao";

export { corpoDoAceite, familiaDe };
export type { PedidoDeAceite };

export type ResultadoAceite = {
  mlb: string;
  ok: boolean;
  /** O preço que ficou valendo, como o canal devolveu. */
  preco?: number | null;
  ofertaCriada?: string | null;
  erro?: string;
};

type RespostaAceite = { price?: number; deal_price?: number; offer_id?: string; original_price?: number };

/**
 * Entrar e sair de promoção pela API.
 *
 * Único lugar do sistema que monta o corpo do aceite. O corpo muda
 * conforme QUEM define o preço, e errar isso é a linha voltar recusada:
 *
 *   a) NÓS definimos ....... DEAL, SELLER_CAMPAIGN, PRICE_DISCOUNT
 *      manda `deal_price`, e `top_deal_price` quando houver preço
 *      separado para comprador Mercado Puntos nível 3 a 6.
 *
 *   b) O CANAL define ...... SMART, MARKETPLACE_CAMPAIGN, PRE_NEGOTIATED,
 *      PRICE_MATCHING, UNHEALTHY_STOCK
 *      não manda preço nenhum: manda o `offer_id` do candidato. Em
 *      MARKETPLACE_CAMPAIGN nem isso — só a promoção.
 *
 *   c) ACEITA COM QUANTIDADE ... SMART_LIGHTNING
 *      manda o `offer_id` mais `stock`, dentro da faixa que ele deu.
 *
 * ── A trava do teto ──
 *
 * Nunca escrevemos preço ACIMA do que o canal propôs. Subir é
 * contrapropor desconto menor, e ele devolve a linha recusada — foi o
 * que derrubou a planilha inteira da Imprimil. A conferência é aqui, não
 * na tela: tela se esquece, função não.
 *
 * ── O resultado volta item a item ──
 *
 * O canal recusa linha por linha, com motivo próprio
 * (`ERROR_CREDIBILITY_DISCOUNTED_PRICE`, `item_not_eligible`). Devolver
 * "deu certo" agregado esconderia qual produto ficou de fora, que é
 * justamente o que a pessoa precisa ver depois de apertar o botão.
 */

/** Põe UM item na promoção. */
export async function aceitarItem(conta: Conta, p: PedidoDeAceite): Promise<ResultadoAceite> {
  const montado = corpoDoAceite(p);
  if ("erro" in montado) return { mlb: p.mlb, ok: false, erro: montado.erro };
  try {
    const r = await meliEscrever<RespostaAceite>(
      "POST",
      `/seller-promotions/items/${p.mlb}?app_version=v2`,
      conta,
      montado.corpo
    );
    return { mlb: p.mlb, ok: true, preco: r.price ?? r.deal_price ?? null, ofertaCriada: r.offer_id ?? null };
  } catch (e) {
    return { mlb: p.mlb, ok: false, erro: e instanceof Error ? e.message : "o canal recusou" };
  }
}

/** Tira UM item de UMA promoção. */
export async function sairDaPromocao(
  conta: Conta,
  p: { mlb: string; promocao: string; tipo: string; oferta?: string | null }
): Promise<ResultadoAceite> {
  const q = new URLSearchParams({ promotion_type: p.tipo.toUpperCase(), app_version: "v2" });
  if (p.tipo.toUpperCase() !== "PRICE_DISCOUNT") q.set("promotion_id", p.promocao);
  if (p.oferta) q.set("offer_id", p.oferta);
  try {
    await meliEscrever("DELETE", `/seller-promotions/items/${p.mlb}?${q}`, conta);
    return { mlb: p.mlb, ok: true };
  } catch (e) {
    return { mlb: p.mlb, ok: false, erro: e instanceof Error ? e.message : "o canal recusou" };
  }
}

/**
 * Vários de uma vez, em fila curta.
 *
 * Quatro por vez, não vinte: a cota do canal é por aplicação e dividida
 * com os agentes dele, e um lote grande leva todo mundo ao 429. Em
 * troca, um item que falha não derruba o resto — cada um volta com o seu
 * resultado.
 */
export async function aceitarEmLote(
  conta: Conta,
  pedidos: PedidoDeAceite[],
  aoAndar?: (feitos: number, total: number) => void
): Promise<ResultadoAceite[]> {
  const fila = [...pedidos];
  const saida: ResultadoAceite[] = [];
  const trabalhar = async (): Promise<void> => {
    const p = fila.shift();
    if (!p) return;
    saida.push(await aceitarItem(conta, p));
    aoAndar?.(saida.length, pedidos.length);
    return trabalhar();
  };
  await Promise.all(Array.from({ length: Math.min(4, pedidos.length) }, trabalhar));
  return saida;
}
