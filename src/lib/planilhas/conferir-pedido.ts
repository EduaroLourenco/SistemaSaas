/**
 * Confere um pedido de aceite contra o que o canal diz AGORA.
 *
 * A sugestão é calculada com a leitura da última atualização, e convite
 * de promoção muda todo dia: some, troca de preço, a campanha acaba.
 * Mandar em cima de leitura velha é pedir recusa — ou, pior, aceitar um
 * preço que já não é o que a pessoa viu. Por isso, antes do envio, cada
 * item selecionado é relido (`GET /seller-promotions/items/{MLB}`) e
 * passa por aqui.
 *
 * Regra pura: recebe o pedido e a resposta do canal, devolve se vai e,
 * quando não vai, o motivo em uma linha.
 */
import { familiaDe, type PedidoDeAceite } from "./corpo-promocao";

/** Uma linha de `/seller-promotions/items/{MLB}`, só o que a conferência usa. */
export type PromoAoVivo = {
  id?: string;
  type?: string;
  status?: string;
  price?: number;
  offer_id?: string;
  ref_id?: string;
  max_discounted_price?: number;
};

export type Conferencia = { vai: true; pedido: PedidoDeAceite } | { vai: false; motivo: string };

const igual = (a: number | null | undefined, b: number | null | undefined) =>
  a != null && b != null && Math.abs(a - b) < 0.011;

export function conferirPedido(p: PedidoDeAceite, aoVivo: PromoAoVivo[]): Conferencia {
  const tipo = p.tipo.toUpperCase();
  const daPromocao = aoVivo.filter((v) => v.id === p.promocao && (v.type ?? "").toUpperCase() === tipo);

  if (p.alterar) {
    const dentro = daPromocao.find((v) => v.status === "started" || v.status === "pending");
    if (!dentro) return { vai: false, motivo: "o item já não está nesta campanha" };
    if (p.precoAtual != null && !igual(dentro.price, p.precoAtual)) {
      return { vai: false, motivo: `o preço na campanha mudou de ${p.precoAtual.toFixed(2)} para ${(dentro.price ?? 0).toFixed(2)}` };
    }
    return { vai: true, pedido: { ...p, precoAtual: dentro.price ?? p.precoAtual } };
  }

  const convite = daPromocao.find(
    (v) => v.status === "candidate" && (!p.oferta || v.offer_id === p.oferta || v.ref_id === p.oferta)
  );
  if (!convite) {
    const jaDentro = daPromocao.some((v) => v.status === "started" || v.status === "pending");
    return { vai: false, motivo: jaDentro ? "o item já entrou nesta campanha" : "o convite não existe mais" };
  }

  const familia = familiaDe(tipo);
  if (familia === "nosso_preco") {
    /* O teto pode ter descido: o preço que ia passa a ser recusa certa. */
    const teto = convite.max_discounted_price ?? p.tetoDoCanal ?? null;
    if (teto != null && p.preco != null && p.preco > teto + 0.01) {
      return { vai: false, motivo: `o canal agora aceita até ${teto.toFixed(2)}` };
    }
    return { vai: true, pedido: { ...p, tetoDoCanal: teto } };
  }

  /* O canal define o preço: se ele mudou desde a leitura, a pessoa
     aprovou outro número — volta para ela decidir de novo. */
  if (p.tetoDoCanal != null && convite.price != null && !igual(convite.price, p.tetoDoCanal)) {
    return { vai: false, motivo: `o canal mudou a oferta de ${p.tetoDoCanal.toFixed(2)} para ${convite.price.toFixed(2)}` };
  }
  return { vai: true, pedido: p };
}

/**
 * O item já está onde o pedido queria? Usado depois de uma trava do canal
 * (anúncio irmão sendo copiado): a cópia muitas vezes já fez o serviço.
 */
export function jaEntrou(p: PedidoDeAceite, aoVivo: PromoAoVivo[]): boolean {
  const tipo = p.tipo.toUpperCase();
  const dentro = aoVivo.find(
    (v) => v.id === p.promocao && (v.type ?? "").toUpperCase() === tipo && (v.status === "started" || v.status === "pending")
  );
  if (!dentro) return false;
  return p.preco == null || (dentro.price != null && dentro.price <= p.preco + 0.01);
}

/** Recusa por trava: o canal está gravando outra oferta no mesmo produto. Nada foi gravado. */
export const travadoNoCanal = (erro: string) => /HTTP 423|OFFER_SIBLING_CREATION_IN_PROCESS|Offer Locked/i.test(erro);
