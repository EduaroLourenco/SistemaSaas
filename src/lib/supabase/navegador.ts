/**
 * Cliente do Supabase para o navegador.
 *
 * Usa a chave publicável, que é feita para aparecer no HTML. Quem protege
 * o dado é o RLS, não o sigilo dela — cada consulta daqui roda como o
 * usuário logado e só enxerga a organização dele.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function clienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
