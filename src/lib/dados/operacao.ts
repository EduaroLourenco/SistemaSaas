import "server-only";
import { cookies } from "next/headers";
import { clienteServidor, COOKIE_OPERACAO } from "@/lib/supabase/servidor";

/**
 * Qual operação a requisição está usando.
 *
 * ── Por que existe uma escolha automática ──
 *
 * A primeira versão pegava a primeira operação em ordem alfabética.
 * Parecia inofensivo e não era: "Loja própria" vem antes de "Operação
 * principal" e não tem canal nenhum cadastrado, então toda importação era
 * recusada por "canal desconhecido" — mesmo com os apelidos certos no
 * banco. O sintoma apontava para o lugar errado: a mensagem falava de
 * apelido faltando, e o que faltava era a operação.
 *
 * O desempate passou a ser a operação com mais contas de canal. Honesto
 * enquanto havia uma empresa só: a operação que alguém configurou é quase
 * sempre a que se quer usar.
 *
 * ── Por que isso não basta com mais de uma empresa ──
 *
 * Com duas empresas, "a que tem mais canais" é sempre a mesma — e quinze
 * rotas de API resolvem a operação por aqui, inclusive a de importar. Sem
 * uma escolha explícita, subir a planilha do lojista novo gravaria os
 * pedidos dele dentro da operação da outra empresa, sem erro nenhum.
 *
 * Então a escolha agora vem de um cookie, e a automática fica só como
 * ponto de partida de quem nunca escolheu.
 *
 * O cookie não é autoridade: o id que vem nele só vale se aparecer em
 * `listarOperacoes()`, que lê pelo cliente de sessão e portanto já passa
 * pelo RLS. Cookie forjado com a operação de outra empresa não casa com
 * nada e cai no padrão.
 */

/* O nome do cookie vive junto do cliente que manda o cabeçalho. */
export { COOKIE_OPERACAO };

export type Operacao = {
  id: string;
  nome: string;
  canais: number;
  organizacaoId: string;
  empresa: string;
};

export async function listarOperacoes(): Promise<Operacao[]> {
  /*
   * Sem o estreitamento. É a lista do seletor: com ele ligado, só a
   * operação já escolhida apareceria, e não haveria como trocar.
   *
   * A contagem de canais vem pelo mesmo cliente, por isso conta as contas
   * de todas as operações — é justamente o que o menu mostra em cada item.
   */
  const sb = await clienteServidor({ todasOperacoes: true });

  const { data: ops, error } = await sb
    .from("operacoes")
    .select("id, nome, organizacao_id, organizacoes(nome)")
    .order("nome");

  if (error) throw new Error(`Não consegui ler as operações: ${error.message}`);

  const { data: contas } = await sb.from("contas_canal").select("operacao_id");

  const porOperacao = new Map<string, number>();
  for (const c of contas ?? []) {
    const k = c.operacao_id as string;
    porOperacao.set(k, (porOperacao.get(k) ?? 0) + 1);
  }

  return (ops ?? []).map((o) => {
    const org = o.organizacoes as unknown as { nome?: string } | null;
    return {
      id: o.id as string,
      nome: o.nome as string,
      canais: porOperacao.get(o.id as string) ?? 0,
      organizacaoId: o.organizacao_id as string,
      empresa: org?.nome ?? "",
    };
  });
}

/** A escolhida no cookie; sem escolha válida, a de mais canais. */
export async function operacaoPadrao(): Promise<Operacao | null> {
  const todas = await listarOperacoes();
  if (!todas.length) return null;

  const escolhida = (await cookies()).get(COOKIE_OPERACAO)?.value;
  if (escolhida) {
    const achada = todas.find((o) => o.id === escolhida);
    if (achada) return achada;
  }

  return [...todas].sort(
    (a, b) => b.canais - a.canais || a.nome.localeCompare(b.nome, "pt-BR")
  )[0];
}
