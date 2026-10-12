export type LocalEstoque = { id: string; nome: string; tipo: string; ativo?: boolean };
export type SaldoEstoque = {
  produto_externo: string;
  sku: string | null;
  titulo: string;
  local_id: string;
  local_nome: string;
  local_tipo: string;
  disponivel: number | null;
  fisico: number | null;
  reservado: number | null;
  anuncios: string[];
  atualizado_origem_em?: string | null;
  observacao?: string | null;
};
export function quantidade(valor: unknown): number | null {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** SKU vazio permanece sem vínculo; saldo ausente permanece desconhecido. */
export function saldoBling(
  produto: { id: number; codigo?: string; nome: string },
  local: LocalEstoque,
  saldo?: { saldoFisicoTotal?: number; saldoVirtualTotal?: number }
): SaldoEstoque {
  const fisico = quantidade(saldo?.saldoFisicoTotal);
  const disponivel = quantidade(saldo?.saldoVirtualTotal);
  return {
    produto_externo: String(produto.id), sku: produto.codigo?.trim() || null, titulo: produto.nome,
    local_id: local.id, local_nome: local.nome, local_tipo: local.tipo,
    disponivel, fisico, reservado: fisico != null && disponivel != null && fisico >= disponivel ? fisico - disponivel : null,
    anuncios: [], observacao: !saldo ? "O Bling não retornou saldo para este produto neste depósito." : local.ativo === false ? "Depósito inativo no Bling." : null,
  };
}
