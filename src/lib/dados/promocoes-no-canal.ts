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

export async function carregarPromocoesNoCanal(
  sb: SupabaseClient,
  contas: string[],
  skuPorMlb: Map<string, string>,
): Promise<PromoCanal[]> {
  if (!contas.length) return [];
  const agora = Date.now();
  const desde = new Date(agora - DIAS_DE_HISTORICO * 86_400_000).toISOString();
  try {
    const promos = (await paginar(() =>
      sb
        .from("promocoes_canal")
        .select("id,conta_canal_id,codigo,tipo,nome,inicio,fim,lido_em")
        .in("conta_canal_id", contas)
        .or(`fim.is.null,fim.gte.${desde}`)
        .order("id"),
    )) as unknown as LinhaPromo[];
    if (!promos.length) return [];
    const itens = (await paginar(() =>
      sb
        .from("promocao_canal_itens")
        .select("promocao_id,codigo_externo,status,inicio,fim")
        .in("promocao_id", promos.map((p) => p.id))
        .in("status", ["started", "pending"])
        .order("id"),
    )) as unknown as LinhaItem[];
    return montarPromocoesNoCanal(promos, itens, skuPorMlb, agora);
  } catch (e) {
    /* Promoção é contexto: sem ela, a tela segue com o plano. */
    console.error("[promocoes-no-canal]", e);
    return [];
  }
}
