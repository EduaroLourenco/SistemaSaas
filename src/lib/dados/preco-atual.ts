import "server-only";
import { paginar } from "./paginar";
import type { clienteServidor } from "@/lib/supabase/servidor";

/**
 * O último preço que o comprador pagaria, por anúncio, dos últimos 7 dias.
 *
 * `anuncios.preco_atual` é o preço CHEIO (`/items` do Meli): no
 * MLB5397764684 dizia R$ 4.212 enquanto a campanha vendia a R$ 2.140,49.
 * O preço real vem de dois retratos diários: a rotina de preços
 * (`anuncio_estoque_diario.preco`, de `sale_price`) e o do catálogo
 * (`anuncio_catalogo_diario.preco_atual`). No mesmo dia, a rotina vence.
 *
 * Quem lê usa isto e cai no `preco_atual` só para anúncio sem retrato —
 * e deve dizer que aquele é o cheio.
 */
export async function ultimosPrecosDeVenda(
  sb: Awaited<ReturnType<typeof clienteServidor>>,
  operacaoId?: string
): Promise<Map<string, { preco: number; data: string }>> {
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const ultimo = new Map<string, { preco: number; data: string }>();
  const guardar = (id: string, data: string, preco: unknown) => {
    const v = Number(preco);
    const u = ultimo.get(id);
    if (v > 0 && (!u || data >= u.data)) ultimo.set(id, { data, preco: v });
  };
  const cat = () => {
    let q = sb.from("anuncio_catalogo_diario").select("anuncio_id,data,preco_atual").gte("data", desde).not("preco_atual", "is", null);
    if (operacaoId) q = q.eq("operacao_id", operacaoId);
    return q.order("id");
  };
  const ret = () => {
    let q = sb.from("anuncio_estoque_diario").select("anuncio_id,data,preco").gte("data", desde).not("preco", "is", null);
    if (operacaoId) q = q.eq("operacao_id", operacaoId);
    return q.order("id");
  };
  try {
    const [c, r] = await Promise.all([paginar(cat), paginar(ret)]);
    for (const x of c as { anuncio_id: string; data: string; preco_atual: unknown }[]) guardar(x.anuncio_id, x.data, x.preco_atual);
    // Depois do catálogo: no mesmo dia, o retrato da rotina de preços vence.
    for (const x of r as { anuncio_id: string; data: string; preco: unknown }[]) guardar(x.anuncio_id, x.data, x.preco);
  } catch (e) {
    console.error("[preco-atual]", e);
  }
  return ultimo;
}
