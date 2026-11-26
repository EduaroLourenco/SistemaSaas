import "server-only";
import { meliEscrever, type Conta } from "./cliente";
import { corpoDoAceite, corpoDaAlteracao, familiaDe, type PedidoDeAceite } from "@/lib/planilhas/corpo-promocao";

export { corpoDoAceite, corpoDaAlteracao, familiaDe };
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

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Só o 429 se repete. A documentação do Meli manda backoff exponencial
 * com jitter quando a cota estoura — e o 429 é recusa ANTES de processar,
 * então repetir não duplica nada. Um 5xx num POST pode ter entrado do
 * lado de lá; repetir arriscaria entrar duas vezes, então não repete.
 */
async function comNovaTentativa<T>(chamar: () => Promise<T>): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await chamar();
    } catch (e) {
      const cota = e instanceof Error && /HTTP 429/.test(e.message);
      if (!cota || tentativa >= 3) throw e;
      await dormir(1000 * 2 ** tentativa + Math.random() * 500);
    }
  }
}

/** Põe UM item na promoção — ou, com `alterar`, baixa o preço de quem já está dentro. */
export async function aceitarItem(conta: Conta, p: PedidoDeAceite): Promise<ResultadoAceite> {
  const montado = p.alterar ? corpoDaAlteracao(p) : corpoDoAceite(p);
  if ("erro" in montado) return { mlb: p.mlb, ok: false, erro: montado.erro };
  try {
    const r = await comNovaTentativa(() =>
      meliEscrever<RespostaAceite>(
        p.alterar ? "PUT" : "POST",
        `/seller-promotions/items/${p.mlb}?app_version=v2`,
        conta,
        montado.corpo
      )
    );
    return { mlb: p.mlb, ok: true, preco: r?.price ?? r?.deal_price ?? null, ofertaCriada: r?.offer_id ?? null };
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
  /* A saída segue a ordem do pedido: o mesmo anúncio pode vir em duas janelas. */
  const saida = new Array<ResultadoAceite>(pedidos.length);
  let proximo = 0;
  let feitos = 0;
  const trabalhar = async (): Promise<void> => {
    const indice = proximo++;
    if (indice >= pedidos.length) return;
    saida[indice] = await aceitarItem(conta, pedidos[indice]);
    aoAndar?.(++feitos, pedidos.length);
    return trabalhar();
  };
  await Promise.all(Array.from({ length: Math.min(4, pedidos.length) }, trabalhar));
  return saida;
}
