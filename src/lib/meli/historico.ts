/**
 * Registro de cada sincronização em `sincronizacoes`.
 *
 * É o que permite responder "o sistema atualizou hoje?" sem abrir log de
 * servidor — e é o que a tela usa para dizer de quando é o número que ela
 * mostra. Também mantém `integracoes.ultima_sincronizacao` e
 * `ultimo_erro`, que é onde a situação da conexão fica à vista.
 *
 * Registrar nunca pode derrubar a sincronização: se a migração 19 não
 * rodou ou a gravação falha, avisa no log e segue.
 */
import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import type { Integracao } from "./tokens";

export type Origem = "agendada" | "manual";

export type Registro = { id: string; integracaoId: string } | null;

function avisar(acao: string, msg: string) {
  console.warn(`[meli] Não consegui ${acao} o registro da sincronização: ${msg}`);
}

export async function iniciarRegistro(
  integ: Integracao,
  origem: Origem,
  turno?: string
): Promise<Registro> {
  const { data, error } = await clientePrivilegiado()
    .from("sincronizacoes")
    .insert({
      operacao_id: integ.operacaoId,
      integracao_id: integ.id,
      status: "executando",
      origem,
      turno: turno ?? null,
    })
    .select("id")
    .single();
  if (error) {
    avisar("abrir", error.message);
    return null;
  }
  return { id: data.id as string, integracaoId: integ.id };
}

export async function concluirRegistro(
  reg: Registro,
  fim: { ok: true; registros: number; resumo: unknown } | { ok: false; erro: string }
) {
  if (!reg) return;
  const sb = clientePrivilegiado();
  const agora = new Date().toISOString();

  const { error } = await sb
    .from("sincronizacoes")
    .update({
      terminada_em: agora,
      status: fim.ok ? "concluida" : "falhou",
      registros: fim.ok ? fim.registros : 0,
      resumo: fim.ok ? fim.resumo : null,
      erro: fim.ok ? null : fim.erro.slice(0, 1000),
    })
    .eq("id", reg.id);
  if (error) avisar("fechar", error.message);

  if (fim.ok) {
    const { error: e2 } = await sb
      .from("integracoes")
      .update({ ultima_sincronizacao: agora, ultimo_erro: null, status: "conectada" })
      .eq("id", reg.integracaoId);
    if (e2) avisar("atualizar a integração com", e2.message);
    return;
  }

  const { error: e3 } = await sb
    .from("integracoes")
    .update({ ultimo_erro: fim.erro.slice(0, 500) })
    .eq("id", reg.integracaoId);
  if (e3) avisar("atualizar a integração com", e3.message);
  // 'expirada' (token perdido, gravado pela renovação) é mais específico
  // que 'erro' e diz o que fazer — não pode ser sobrescrito por ele.
  await sb
    .from("integracoes")
    .update({ status: "erro" })
    .eq("id", reg.integracaoId)
    .eq("status", "conectada");
}
