import "server-only";

/**
 * Lê uma consulta inteira, em páginas.
 *
 * O PostgREST — que é o que serve a API do Supabase — corta o resultado em
 * 1000 linhas, e `.limit(20000)` NÃO levanta esse teto: ele só pede menos,
 * nunca mais. O excedente é descartado sem erro, sem aviso, sem nada na
 * resposta que diga que faltou.
 *
 * O sintoma é traiçoeiro porque não parece falta de dado: a consulta
 * ordenada por semana trouxe as três primeiras semanas inteiras e a quarta
 * pela metade, e a tela mostrou uma queda de 90% que não existia. Ninguém
 * suspeita de paginação olhando um gráfico.
 *
 * Toda consulta que possa passar de 1000 linhas tem que vir por aqui —
 * inclusive as que hoje têm 900, porque a próxima importação as passa.
 */

const PAGINA = 1000;

type Consulta<T> = {
  range: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

export async function paginar<T>(
  montar: () => Consulta<T>,
  limite = 200_000
): Promise<T[]> {
  const todos: T[] = [];

  for (let inicio = 0; inicio < limite; inicio += PAGINA) {
    // A consulta é remontada a cada página: um construtor do supabase-js já
    // usado não aceita `range` de novo.
    const { data, error } = await montar().range(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    const pagina = data ?? [];
    todos.push(...pagina);
    if (pagina.length < PAGINA) break;
  }

  return todos;
}
