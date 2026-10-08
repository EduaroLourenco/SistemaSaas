import "server-only";

/**
 * Lê uma consulta inteira, em páginas paralelas.
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
 * As páginas vão EM PARALELO depois da primeira. A aplicação roda nos
 * Estados Unidos e o banco em São Paulo: cada ida e volta custa mais de
 * cem milissegundos, e 25 páginas em série viravam sete segundos só de
 * espera. Em paralelo, um.
 *
 * Toda consulta que possa passar de 1000 linhas tem que vir por aqui —
 * inclusive as que hoje têm 900, porque a próxima importação as passa.
 */

const PAGINA = 1000;

/**
 * Converte o erro do Supabase em Error de verdade.
 *
 * O supabase-js devolve `{ message, code, details, hint }` — um objeto
 * simples, não uma instância de Error. Lançar isso direto faz qualquer
 * `e instanceof Error` falhar lá em cima, e a mensagem vira "erro
 * desconhecido" no meio do caminho. Foi exatamente o que escondeu a causa
 * de uma falha no processamento de promoções.
 */
function erroDeVerdade(bruto: unknown, onde: string): Error {
  const e = bruto as { message?: string; code?: string; details?: string; hint?: string };
  const partes = [e?.message ?? "falha no banco"];
  if (e?.code) partes.push(`(código ${e.code})`);
  if (e?.details) partes.push(e.details);
  if (e?.hint) partes.push(e.hint);
  return new Error(`${onde}: ${partes.join(" ")}`);
}

/** Teto de requisições simultâneas, para não estrangular o banco. */
const SIMULTANEAS = 8;

type Consulta<T> = {
  range: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};
type ComOrdem<T> = Consulta<T> & { order?: (coluna: string, o?: { ascending?: boolean }) => Consulta<T> };

export async function paginar<T>(
  montarOriginal: () => Consulta<T>,
  limite = 200_000
): Promise<T[]> {
  /*
   * Desempate pelo `id`, sempre.
   *
   * As páginas são pedidas em paralelo, e cada uma é uma consulta separada.
   * Ordenadas só por uma coluna com empate (`data`, `sku`, `semana_iso`),
   * o banco pode devolver as linhas empatadas em ordem diferente em cada
   * pedido: uma linha aparece em duas páginas e outra em nenhuma — sem erro,
   * só um total levemente errado. Dezenas de leituras ordenavam assim.
   * O `id` entra DEPOIS da ordem pedida, então não muda a ordem de quem lê.
   * Tabela sem `id` cai na consulta original.
   */
  let semId = false;
  const montar = (): Consulta<T> => {
    const q = montarOriginal() as ComOrdem<T>;
    return semId || typeof q.order !== "function" ? q : q.order("id", { ascending: true });
  };

  // A consulta é remontada a cada página: um construtor do supabase-js já
  // usado não aceita `range` de novo.
  let primeira = await montar().range(0, PAGINA - 1);
  const codigo = (primeira.error as { code?: string } | null)?.code;
  if (codigo === "42703" || codigo === "PGRST100" || codigo === "PGRST204") {
    semId = true;
    primeira = await montar().range(0, PAGINA - 1);
  }
  if (primeira.error) throw erroDeVerdade(primeira.error, "ao ler a primeira página");

  const inicio = primeira.data ?? [];
  if (inicio.length < PAGINA) return inicio;

  /*
   * Busca adiante em blocos, parando no primeiro bloco que vier curto.
   *
   * Sem saber o total, a alternativa seria pedir `count=exact` — que
   * obriga o banco a contar a tabela inteira antes de devolver a primeira
   * linha. Em tabela grande isso custa mais que as páginas extras.
   */
  const todos = [...inicio];
  let offset = PAGINA;

  while (offset < limite) {
    const lote = await Promise.all(
      Array.from({ length: SIMULTANEAS }, (_, i) => {
        const de = offset + i * PAGINA;
        if (de >= limite) return Promise.resolve({ data: [] as T[], error: null });
        return montar().range(de, de + PAGINA - 1);
      })
    );

    let acabou = false;
    for (const p of lote) {
      if (p.error) throw erroDeVerdade(p.error, `ao ler a partir da linha ${offset}`);
      const pagina = p.data ?? [];
      todos.push(...pagina);
      if (pagina.length < PAGINA) acabou = true;
    }

    if (acabou) return todos;
    offset += SIMULTANEAS * PAGINA;
  }

  return todos;
}
