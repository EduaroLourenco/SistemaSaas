import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A coluna `anuncios.foto` já existe neste banco?
 *
 * ── Por que a pergunta existe ──
 *
 * As migrações daqui são coladas à mão no editor SQL do Supabase (veja
 * `db/GUIA-SUPABASE.md`), então o código chega em produção antes do
 * banco. E o PostgREST não ignora coluna desconhecida: ele recusa a
 * consulta inteira com 400. Pedir `foto` antes do `alter table` não
 * deixaria a lista sem foto — deixaria a tela sem lista.
 *
 * ── O custo ──
 *
 * Uma consulta de zero linha por processo, na primeira vez que alguém
 * abre uma tela de anúncio. O resultado fica em memória do servidor.
 * Quando a coluna aparece, a próxima partida do processo já a usa.
 *
 * ponytail: sonda temporária. Quando o `db/41_foto_do_anuncio.sql`
 * estiver aplicado nos bancos em uso, apague este arquivo e peça `foto`
 * direto na lista de colunas.
 */
let existe: boolean | null = null;

export async function temColunaFoto(sb: SupabaseClient): Promise<boolean> {
  if (existe !== null) return existe;
  const { error } = await sb.from("anuncios").select("foto").limit(0);
  existe = !error;
  return existe;
}

/** `"...,foto"` quando a coluna existe, `""` quando ainda não. */
export async function campoFoto(sb: SupabaseClient, prefixo = ","): Promise<string> {
  return (await temColunaFoto(sb)) ? `${prefixo}foto` : "";
}
