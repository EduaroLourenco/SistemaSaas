import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import type { Regra, Condicao, Acao } from "@/lib/planilhas/avaliar-regras";

/**
 * As regras de promoção guardadas, por operação.
 *
 * A migração 44 pode não ter rodado ainda — e uma tela que explode por
 * isso faz parecer defeito do código. Enquanto a tabela não existir,
 * tudo aqui devolve vazio com um aviso que a tela sabe mostrar.
 */

const SEM_TABELA = new Set(["42P01", "PGRST205"]);

export type RegrasCarregadas = {
  regras: Regra[];
  /** Null quando está tudo certo; o texto é o que a tela mostra. */
  faltaMigracao: string | null;
};

type Linha = {
  id: string;
  nome: string;
  ativa: boolean;
  ordem: number;
  conta_canal_id: string | null;
  condicoes: Condicao[] | null;
  acao: Acao;
  quando_nao_sei: Regra["quandoNaoSei"];
};

const montar = (l: Linha): Regra => ({
  id: l.id,
  nome: l.nome,
  ativa: l.ativa,
  ordem: l.ordem,
  contaCanalId: l.conta_canal_id,
  condicoes: l.condicoes ?? [],
  acao: l.acao,
  quandoNaoSei: l.quando_nao_sei,
});

export async function carregarRegras(): Promise<RegrasCarregadas> {
  const op = await operacaoPadrao();
  if (!op) return { regras: [], faltaMigracao: null };
  const sb = await clienteServidor();
  const { data, error } = await sb
    .from("regras_promocao")
    .select("id,nome,ativa,ordem,conta_canal_id,condicoes,acao,quando_nao_sei")
    .eq("operacao_id", op.id)
    .order("ordem", { ascending: true });

  if (error) {
    if (SEM_TABELA.has(error.code)) {
      return { regras: [], faltaMigracao: "Rode db/44_regras_de_promocao.sql para guardar regras." };
    }
    throw new Error(`Não consegui ler as regras: ${error.message}`);
  }
  return { regras: ((data ?? []) as Linha[]).map(montar), faltaMigracao: null };
}

export type RegraParaGravar = Omit<Regra, "id"> & { id?: string };

export async function gravarRegra(r: RegraParaGravar): Promise<{ id: string } | { erro: string }> {
  const op = await operacaoPadrao();
  if (!op) return { erro: "sem operação" };
  const sb = await clienteServidor();

  const linha = {
    operacao_id: op.id,
    conta_canal_id: r.contaCanalId,
    nome: r.nome.trim() || "Sem nome",
    ativa: r.ativa,
    ordem: r.ordem,
    condicoes: r.condicoes,
    acao: r.acao,
    quando_nao_sei: r.quandoNaoSei,
    atualizada_em: new Date().toISOString(),
  };

  const q = r.id
    ? sb.from("regras_promocao").update(linha).eq("id", r.id).eq("operacao_id", op.id).select("id").single()
    : sb.from("regras_promocao").insert(linha).select("id").single();

  const { data, error } = await q;
  if (error) {
    if (SEM_TABELA.has(error.code)) return { erro: "Rode db/44_regras_de_promocao.sql antes de salvar regras." };
    return { erro: error.message };
  }
  return { id: (data as { id: string }).id };
}

export async function apagarRegra(id: string): Promise<{ erro?: string }> {
  const op = await operacaoPadrao();
  if (!op) return { erro: "sem operação" };
  const sb = await clienteServidor();
  const { error } = await sb.from("regras_promocao").delete().eq("id", id).eq("operacao_id", op.id);
  return error ? { erro: error.message } : {};
}

/** Reordenar é o que decide quem ganha: a primeira que bate decide. */
export async function reordenar(ids: string[]): Promise<{ erro?: string }> {
  const op = await operacaoPadrao();
  if (!op) return { erro: "sem operação" };
  const sb = await clienteServidor();
  for (const [i, id] of ids.entries()) {
    const { error } = await sb
      .from("regras_promocao")
      .update({ ordem: i, atualizada_em: new Date().toISOString() })
      .eq("id", id)
      .eq("operacao_id", op.id);
    if (error) return { erro: error.message };
  }
  return {};
}
