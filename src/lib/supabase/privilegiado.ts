/**
 * Cliente privilegiado — IGNORA O RLS.
 *
 * Só existe para o que o usuário não pode fazer sozinho: gravar linha de
 * importação de planilha, registrar lote de promoção, rodar coletor.
 *
 * Nunca importe daqui em componente de cliente. A chave não tem prefixo
 * `NEXT_PUBLIC_` justamente para o build quebrar se alguém tentar — mas o
 * build não é a única defesa, então a regra vale igual: só rota de API,
 * worker ou Server Action.
 *
 * A cada uso, a pergunta certa é: "o RLS impediria isso?" Se a resposta
 * for não, use `clienteServidor()`. Privilégio por conveniência é como
 * vazamento de dado começa.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function clientePrivilegiado() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ausente. Só rotas de API a usam; " +
        "confira o .env.local e reinicie o servidor."
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
