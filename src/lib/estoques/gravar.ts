import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { emLotes } from "@/lib/sync/diarias";
import type { Integracao } from "@/lib/integracoes/cofre";
import type { LocalEstoque, SaldoEstoque } from "./tipos";

function falha(e: { code?: string; message: string }) {
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(e.code ?? "")) {
    throw new Error("A estrutura de estoques ainda não está instalada. Execute db/37_estoques_e_origem_dados.sql no Supabase.");
  }
  throw new Error(`Não foi possível salvar os estoques: ${e.message}`);
}

export async function gravarEstoques(
  integ: Integracao,
  provedor: string,
  origem: "canal" | "erp",
  saldos: SaldoEstoque[],
  locais: LocalEstoque[],
  pagina: number,
  proximaPagina?: number,
  avisos: string[] = []
) {
  const sb = clientePrivilegiado();
  const agora = new Date().toISOString();
  const { data: fonte, error: erroFonte } = await sb.from("estoque_fontes")
    .select("locais,erro,produtos_lidos").eq("integracao_id", integ.id).maybeSingle();
  if (erroFonte) falha(erroFonte);
  const locaisDoCiclo = new Map<string, LocalEstoque>(
    (pagina > 0 ? (fonte?.locais ?? []) as LocalEstoque[] : []).map((l) => [l.id, l])
  );
  locais.forEach((l) => locaisDoCiclo.set(l.id, l));
  const avisosDoCiclo = [...new Set([...(pagina > 0 && fonte?.erro ? [String(fonte.erro)] : []), ...avisos])];
  // Um User Product pode aparecer em mais de uma página de anúncios.
  // Mantém os vínculos conhecidos ao atualizar o mesmo saldo.
  const produtos = [...new Set(saldos.map((s) => s.produto_externo))];
  const anteriores = new Map<string, string[]>();
  if (origem === "canal" && produtos.length) {
    const { data, error } = await sb.from("estoque_saldos").select("produto_externo,local_id,anuncios")
      .eq("integracao_id", integ.id).in("produto_externo", produtos);
    if (error) falha(error);
    for (const s of data ?? []) anteriores.set(`${s.produto_externo}|${s.local_id}`, s.anuncios ?? []);
  }
  await emLotes(saldos, 300, async (lote) => {
    const { error } = await sb.from("estoque_saldos").upsert(lote.map((s) => ({
      ...s, operacao_id: integ.operacaoId, integracao_id: integ.id,
      conta_canal_id: integ.contaCanalId || null, canal_id: integ.canalId,
      origem, provedor, consultado_em: agora,
      anuncios: [...new Set([...(anteriores.get(`${s.produto_externo}|${s.local_id}`) ?? []), ...s.anuncios])],
    })), { onConflict: "integracao_id,produto_externo,local_id" });
    if (error) falha(error);
  });
  const { error } = await sb.from("estoque_fontes").upsert({
    integracao_id: integ.id, operacao_id: integ.operacaoId, provedor, locais: [...locaisDoCiclo.values()],
    estado: proximaPagina == null ? (avisosDoCiclo.length ? "parcial" : "atualizado") : "parcial",
    produtos_lidos: (pagina > 0 ? Number(fonte?.produtos_lidos ?? 0) : 0) + produtos.length,
    proxima_pagina: proximaPagina ?? null, atualizada_em: agora,
    ...(pagina === 0 ? { iniciada_em: agora } : {}),
    erro: avisosDoCiclo.length ? avisosDoCiclo.join(" ").slice(0, 1500) : null,
  }, { onConflict: "integracao_id" });
  if (error) falha(error);
}

export async function registrarFalhaEstoque(integ: Integracao, provedor: string, erro: string) {
  await clientePrivilegiado().from("estoque_fontes").upsert({
    integracao_id: integ.id, operacao_id: integ.operacaoId, provedor, estado: "erro", erro: erro.slice(0, 1500), atualizada_em: new Date().toISOString(),
  }, { onConflict: "integracao_id" });
}
