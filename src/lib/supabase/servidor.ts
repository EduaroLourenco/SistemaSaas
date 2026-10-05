/**
 * Cliente do Supabase para Server Components e rotas de API.
 *
 * Continua usando a chave publicável e o RLS: a sessão vem do cookie, e a
 * consulta roda como o usuário. É o cliente padrão do servidor — o de
 * privilégio é o outro arquivo, e é exceção.
 *
 * ── O cabeçalho da operação ──
 *
 * Toda consulta sai daqui com `x-operacao`, lido do cookie que o seletor
 * de empresa grava. O RLS usa esse cabeçalho para estreitar o conjunto de
 * operações visíveis (ver `db/23_operacao_ativa.sql`), e é isso que
 * impede duas empresas de aparecerem somadas na mesma tela.
 *
 * Fazer isso aqui, e não nas consultas, é deliberado: trinta módulos fazem
 * cento e vinte e três leituras sem filtrar por operação, e qualquer
 * módulo novo faria a mesma coisa. Um lugar só não dá para esquecer.
 *
 * O cabeçalho não carrega autoridade. O RLS mantém a checagem de membro
 * inteira e apenas intersecta com o que o cabeçalho diz, então um valor
 * forjado restringe o resultado e nunca o amplia.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** O cookie que o seletor de empresa grava. */
export const COOKIE_OPERACAO = "operacao";
/** O cabeçalho que o RLS lê. */
export const HEADER_OPERACAO = "x-operacao";

export type OpcoesCliente = {
  /**
   * Não manda o cabeçalho, devolvendo o que o usuário vê em TODAS as
   * operações. É o que o seletor de empresa precisa: com o estreitamento
   * ligado, a lista teria um item só — a que já está escolhida — e não
   * haveria como trocar.
   */
  todasOperacoes?: boolean;
};

export async function clienteServidor(opcoes: OpcoesCliente = {}) {
  const jar = await cookies();
  const escolhida = opcoes.todasOperacoes ? null : jar.get(COOKIE_OPERACAO)?.value?.trim();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: escolhida ? { headers: { [HEADER_OPERACAO]: escolhida } } : undefined,
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (novos) => {
          try {
            for (const { name, value, options } of novos) {
              jar.set(name, value, options);
            }
          } catch {
            // Server Component não pode escrever cookie. O middleware já
            // renova a sessão antes de chegar aqui, então engolir é seguro.
          }
        },
      },
    }
  );
}

/** Usuário da sessão, ou null. */
export async function usuarioAtual() {
  const sb = await clienteServidor();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}
