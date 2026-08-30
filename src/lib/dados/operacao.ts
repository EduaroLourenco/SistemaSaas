import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * Qual operação usar quando ninguém escolheu.
 *
 * A versão anterior pegava a primeira em ordem alfabética. Parecia
 * inofensivo e não era: "Loja própria" vem antes de "Operação principal"
 * e não tem canal nenhum cadastrado, então toda importação era recusada
 * por "canal desconhecido" — mesmo com os apelidos certos no banco.
 *
 * O sintoma apontava para o lugar errado. A mensagem falava de apelido
 * faltando, e o que faltava era a operação certa; quem lesse a tela iria
 * cadastrar apelidos que já existiam.
 *
 * Agora a escolha é a operação com mais canais cadastrados. Não é
 * elegante, mas é honesta: a operação que alguém configurou é quase
 * sempre a que se quer usar. Empate desempata por nome, para a resposta
 * ser estável entre chamadas.
 */

export type Operacao = { id: string; nome: string; canais: number };

export async function listarOperacoes(): Promise<Operacao[]> {
  const sb = await clienteServidor();

  const { data: ops, error } = await sb
    .from("operacoes")
    .select("id, nome")
    .order("nome");

  if (error) throw new Error(`Não consegui ler as operações: ${error.message}`);

  const { data: contas } = await sb
    .from("contas_canal")
    .select("operacao_id");

  const porOperacao = new Map<string, number>();
  for (const c of contas ?? []) {
    const k = c.operacao_id as string;
    porOperacao.set(k, (porOperacao.get(k) ?? 0) + 1);
  }

  return (ops ?? []).map((o) => ({
    id: o.id as string,
    nome: o.nome as string,
    canais: porOperacao.get(o.id as string) ?? 0,
  }));
}

/** A operação com mais canais. `null` quando o usuário não vê nenhuma. */
export async function operacaoPadrao(): Promise<Operacao | null> {
  const todas = await listarOperacoes();
  if (!todas.length) return null;

  return [...todas].sort(
    (a, b) => b.canais - a.canais || a.nome.localeCompare(b.nome, "pt-BR")
  )[0];
}
