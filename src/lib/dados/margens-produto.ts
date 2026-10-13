import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";

/** Compatível com empresas antes da migração 38, sem ocultar outros erros. */
export async function carregarMargensProduto() {
  const sb = await clienteServidor();
  const porProduto = new Map<string, number | null>();
  const { error } = await sb.from("produtos").select("id,margem_minima_pct").limit(1);
  if (error) {
    if (["42703", "PGRST204"].includes(error.code)) return { disponivel: false, porProduto };
    throw new Error("Não foi possível consultar as margens dos produtos.");
  }
  const linhas = await paginar(() => sb.from("produtos").select("id,margem_minima_pct").order("id"));
  for (const p of linhas) porProduto.set(String(p.id), p.margem_minima_pct == null ? null : Number(p.margem_minima_pct));
  return { disponivel: true, porProduto };
}
