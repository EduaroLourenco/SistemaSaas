import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * As colunas de família já existem neste banco?
 *
 * Mesma razão de `coluna-foto.ts`: as migrações daqui são coladas à
 * mão no editor SQL do Supabase, então o código chega em produção
 * antes do banco. O PostgREST não ignora coluna desconhecida — ele
 * recusa a consulta inteira com 400. Pedir `familia_id` antes do
 * `alter table` não deixaria a tela sem o agrupamento: deixaria a
 * tela sem lista.
 *
 * Uma consulta de zero linha por processo, guardada em memória.
 *
 * ponytail: sonda temporária. Quando db/43_familia_do_anuncio.sql
 * estiver aplicado em todos os bancos em uso, apague este arquivo e
 * peça as colunas direto.
 */
let existe: boolean | null = null;

export async function temColunaFamilia(sb: SupabaseClient): Promise<boolean> {
  if (existe !== null) return existe;
  const { error } = await sb.from("anuncios").select("familia_id").limit(0);
  existe = !error;
  return existe;
}
