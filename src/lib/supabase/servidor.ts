/**
 * Cliente do Supabase para Server Components e rotas de API.
 *
 * Continua usando a chave publicável e o RLS: a sessão vem do cookie, e a
 * consulta roda como o usuário. É o cliente padrão do servidor — o de
 * privilégio é o outro arquivo, e é exceção.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function clienteServidor() {
  const jar = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
