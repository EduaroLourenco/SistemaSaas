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

/**
 * Os itens de todas as promoções numa leitura só. Promoção a promoção eram
 * 64 consultas em 11 rodadas, e cada uma checava a permissão linha a linha
 * (política da migração 40, fora da forma rápida até a 30 rodar de novo em
 * 24/11) — era o que fazia a leitura única estourar o tempo antes.
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
  if (!promos.length) return montarPromocoesNoCanal(promos, [], skuPorMlb, agora);
  const itens = (await paginar(() =>
    sb
      .from("promocao_canal_itens")
      .select("promocao_id,codigo_externo,status,inicio,fim")
      .in("promocao_id", promos.map((p) => p.id))
      .in("status", ["started", "pending"])
      .or(vigente),
  )) as unknown as LinhaItem[];
  // A montagem guarda a primeira promoção de cada grupo: mesma ordem de antes,
  // por promoção e, dentro dela, por id (a leitura já vem por id; o sort é estável).
  const posicao = new Map(promos.map((p, i) => [p.id, i]));
  itens.sort((a, b) => posicao.get(a.promocao_id)! - posicao.get(b.promocao_id)!);
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
