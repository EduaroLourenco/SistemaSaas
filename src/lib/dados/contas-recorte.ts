import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { ContaDoRecorte } from "@/lib/recorte";

/**
 * Contas de canal que o seletor oferece.
 *
 * Só de canal ativo: canal desligado não recebe venda nova, e listá-lo
 * enche o seletor de opção que só devolve tela vazia. O RLS já limita às
 * operações do usuário.
 */
export async function carregarContasRecorte(): Promise<ContaDoRecorte[]> {
  const sb = await clienteServidor();
  const { data, error } = await sb
    .from("contas_canal")
    .select("id,nome,canal_id,canais!inner(nome,ativo)")
    .eq("canais.ativo", true)
    .limit(500);
  if (error) throw new Error(`Não consegui ler as contas de canal: ${error.message}`);

  type Linha = { id: string; nome: string; canal_id: string; canais: { nome: string } | null };
  return ((data ?? []) as unknown as Linha[]).map((c) => ({
    contaId: c.id,
    contaNome: c.nome,
    canalId: c.canal_id,
    canalNome: c.canais?.nome ?? "Outros",
  }));
}
