import { NextResponse } from "next/server";
import { clienteServidor, COOKIE_OPERACAO } from "@/lib/supabase/servidor";

export const runtime = "nodejs";

/**
 * Sair da conta — POST /api/sair
 *
 * No servidor, e não no navegador: o cookie de sessão é escrito pelo
 * servidor, e é o servidor que garante apagá-lo. Leva junto o cookie da
 * empresa escolhida — quem entrar depois neste navegador não deve abrir na
 * empresa de quem saiu.
 */
export async function POST() {
  const sb = await clienteServidor();
  await sb.auth.signOut();
  const r = NextResponse.json({ ok: true });
  r.cookies.delete(COOKIE_OPERACAO);
  return r;
}
