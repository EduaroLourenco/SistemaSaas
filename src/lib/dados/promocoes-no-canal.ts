import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paginar } from "./paginar";
import {
  montarPromocoesNoCanal,
  type LinhaItem,
  type LinhaPromo,
  type PromoCanal,
} from "@/lib/planejamento/canal";

/* Encerrada há mais que isto não muda decisão e só pesa na carga. */
const DIAS_DE_HISTORICO = 15;
const PROMOCOES_POR_VEZ = 6;

/**
 * Lê promoção a promoção. Numa consulta só, a Probel somava milhares de itens
 * filtrados pela permissão do usuário, e a tela ficava sem nenhuma promoção.
 * Lança em caso de falha: quem mostra número precisa distinguir erro de zero.
 */
export async function lerPromocoesNoCanal(
  sb: SupabaseClient,
  contas: string[],
  skuPorMlb: Map<string, string>,
): Promise<PromoCanal[]> {
  if (!contas.length) return [];
  const agora = Date.now();
  const desde = new Date(agora - DIAS_DE_HISTORICO * 86_400_000).toISOString();
  const vigente = `fim.is.null,fim.gte.${desde}`;
  const promos = (await paginar(() =>
    sb
      .from("promocoes_canal")
      .select("id,conta_canal_id,codigo,tipo,nome,inicio,fim,lido_em")
      .in("conta_canal_id", contas)
      .or(vigente)
      .order("id"),
  )) as unknown as LinhaPromo[];
  const itens: LinhaItem[] = [];
  for (let i = 0; i < promos.length; i += PROMOCOES_POR_VEZ) {
    const lote = await Promise.all(
      promos.slice(i, i + PROMOCOES_POR_VEZ).map((p) =>
        paginar(() =>
          sb
            .from("promocao_canal_itens")
            .select("promocao_id,codigo_externo,status,inicio,fim")
            .eq("promocao_id", p.id)
            .in("status", ["started", "pending"])
            .or(vigente)
            .order("id"),
        ),
      ),
    );
    itens.push(...(lote.flat() as unknown as LinhaItem[]));
  }
  return montarPromocoesNoCanal(promos, itens, skuPorMlb, agora);
}

/** Para quem usa promoção só como contexto: sem ela, a tela segue. */
export async function carregarPromocoesNoCanal(
  sb: SupabaseClient,
  contas: string[],
  skuPorMlb: Map<string, string>,
): Promise<PromoCanal[]> {
  try {
    return await lerPromocoesNoCanal(sb, contas, skuPorMlb);
  } catch (e) {
    console.error("[promocoes-no-canal]", e);
    return [];
  }
}
