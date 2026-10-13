import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { operacaoPadrao } from "./operacao";
import type { LocalEstoque, SaldoEstoque } from "@/lib/estoques/tipos";

export type LinhaEstoque = SaldoEstoque & { id: string; integracao_id: string; origem: "canal" | "erp"; provedor: string; conta_canal_id: string | null; consultado_em: string };
export type FonteEstoque = { id: string; nome: string; provedor: string; conectada: boolean; estado: string; locais: LocalEstoque[]; atualizadaEm: string | null; iniciadaEm: string | null; erro: string | null };
export async function carregarEstoques(filtros: { sku?: string; skuExato?: boolean; anuncio?: string; origem?: string; fonte?: string; local?: string; zeros?: boolean; pagina?: number } = {}) {
  const op = await operacaoPadrao();
  const vazio = { fontes: [] as FonteEstoque[], saldos: [] as LinhaEstoque[], total: 0, pagina: 0, instalada: true, erro: null as string | null };
  if (!op) return vazio;
  const sb = await clienteServidor();
  // A operação foi autorizada pela sessão. Só os metadados desta empresa são lidos
  // com privilégio: a RLS do cofre é mais restrita que a do administrador da plataforma.
  const [integs, contas, fontes] = await Promise.all([
    clientePrivilegiado().from("integracoes").select("id,provedor,conta_canal_id,status,credencial_ref").eq("operacao_id", op.id).in("provedor", ["mercado_livre", "bling"]),
    sb.from("contas_canal").select("id,nome").eq("operacao_id", op.id),
    sb.from("estoque_fontes").select("*").eq("operacao_id", op.id),
  ]);
  const instalada = !["42P01", "PGRST205"].includes(fontes.error?.code ?? "");
  const nomes = new Map((contas.data ?? []).map((c) => [c.id, c.nome]));
  const fontesPorId = new Map((fontes.data ?? []).map((f) => [f.integracao_id, f]));
  const lista: FonteEstoque[] = (integs.data ?? []).map((i) => {
    const f = fontesPorId.get(i.id);
    return { id: i.id, nome: i.provedor === "bling" ? "Bling · ERP" : `Mercado Livre · ${nomes.get(i.conta_canal_id) ?? "Conta"}`, provedor: i.provedor, conectada: Boolean(i.credencial_ref), estado: f?.estado ?? "aguardando", locais: (f?.locais ?? []) as LocalEstoque[], atualizadaEm: f?.atualizada_em ?? null, iniciadaEm: f?.iniciada_em ?? null, erro: f?.erro ?? null };
  });
  if (!instalada || fontes.error || integs.error || contas.error) return { ...vazio, fontes: lista, instalada, erro: instalada ? "Não foi possível conferir todas as fontes de estoque." : null };
  const pagina = Math.max(0, Math.min(10000, Math.trunc(filtros.pagina || 0)));
  let q = sb.from("estoque_saldos").select("*", { count: "exact" }).eq("operacao_id", op.id);
  if (filtros.sku) q = q.ilike("sku", filtros.skuExato ? filtros.sku.replace(/[\\%_]/g, "\\$&") : `%${filtros.sku.replace(/[%_]/g, "")}%`);
  if (filtros.anuncio) q = q.contains("anuncios", [filtros.anuncio]);
  if (["canal", "erp"].includes(filtros.origem ?? "")) q = q.eq("origem", filtros.origem!);
  if (filtros.fonte && lista.some((f) => f.id === filtros.fonte)) q = q.eq("integracao_id", filtros.fonte);
  if (filtros.local) q = q.eq("local_id", filtros.local);
  if (filtros.zeros) q = q.eq("disponivel", 0);
  const { data, error, count } = await q.order("sku").order("integracao_id").order("local_nome").order("id").range(pagina * 100, pagina * 100 + 99);
  return { fontes: lista, saldos: (data ?? []) as LinhaEstoque[], total: count ?? 0, pagina, instalada, erro: error ? "Não foi possível consultar os saldos. Tente atualizar a página." : null };
}
