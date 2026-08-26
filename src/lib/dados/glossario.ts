import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import type { Termo } from "@/mock/sistema";

/**
 * Glossário, lido do banco.
 *
 * A ordem das seções sai da própria tabela, pelo campo `ordem`, e não de
 * uma lista fixa no código: termo novo cadastrado aparece no lugar certo
 * sem precisar de deploy.
 */

export type DadosGlossario = {
  termos: Termo[];
  secoes: string[];
  vazio: boolean;
};

export async function carregarGlossario(): Promise<DadosGlossario> {
  const sb = await clienteServidor();
  // Hoje são 30 termos, mas paginar aqui também: a próxima tabela que passar
  // de mil linhas não deve depender de alguém lembrar deste detalhe.
  const linhas = await paginar(() =>
    sb
      .from("glossario")
      .select("id,secao,termo,sigla,definicao,calculo,onde_encontrar,ordem")
      .order("ordem", { ascending: true })
      .order("termo", { ascending: true })
  );
  if (!linhas.length) return { termos: [], secoes: [], vazio: true };

  const termos: Termo[] = linhas.map((t) => ({
    id: t.id as string,
    secao: t.secao as string,
    termo: t.termo as string,
    sigla: (t.sigla as string) ?? undefined,
    definicao: t.definicao as string,
    calculo: (t.calculo as string) ?? undefined,
    onde: (t.onde_encontrar as string) ?? "",
  }));

  // Set preserva a ordem de inserção, que aqui já vem ordenada pelo banco.
  const secoes = [...new Set(termos.map((t) => t.secao))];

  return { termos, secoes, vazio: false };
}
