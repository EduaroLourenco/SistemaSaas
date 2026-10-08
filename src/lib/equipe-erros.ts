/** Função ausente na API e dependência ausente no PostgreSQL são falhas diferentes. */
export function erroEquipe(e: { message: string; code?: string }) {
  if (e.code === "P0001" || e.code === "42501") return { erro: e.message, status: 403 };
  if (e.code === "PGRST202") {
    return { erro: "A função de equipe não está disponível na API. Confira a migração db/22_equipe.sql no mesmo projeto Supabase e atualize o cache do schema.", status: 400 };
  }
  if (e.code === "42883" && /gen_random_bytes/i.test(e.message)) {
    return { erro: "A geração do link de convite precisa de um ajuste no banco. Rode db/31_convites_pgcrypto.sql no Supabase.", status: 400 };
  }
  if (e.code === "23505") return { erro: "Já existe convite para esse e-mail.", status: 409 };
  return { erro: e.message, status: 400 };
}
