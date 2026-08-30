/**
 * Comparação entre períodos.
 *
 * Existe porque número sozinho não decide nada. "R$ 340 mil" não diz se o
 * mês foi bom; "R$ 340 mil, +12% que o mês passado, −8% que o ano
 * passado" diz. A comparação é o que transforma medida em informação.
 *
 * Duas bases de propósito: a anterior pega tendência recente, a do ano
 * passado pega sazonalidade. Olhar só a primeira faz dezembro parecer
 * milagre todo ano.
 */

export type Base = {
  /** Rótulo curto, aparece ao lado do delta. */
  rotulo: string;
  valor: number;
};

export type Comparacao = {
  valor: number;
  bases: { rotulo: string; valor: number; variacao: number | null }[];
};

/**
 * Variação percentual entre dois números.
 *
 * Devolve `null` quando a base é zero. Poderia devolver 100% ou Infinity,
 * mas as duas mentem: sair de 0 para 10 não é "crescimento de 100%", é
 * estreia. Quem consome decide como mostrar o caso.
 */
export function variacao(atual: number, base: number): number | null {
  if (!base) return null;
  return ((atual - base) / Math.abs(base)) * 100;
}

export function comparar(valor: number, bases: Base[]): Comparacao {
  return {
    valor,
    bases: bases.map((b) => ({
      rotulo: b.rotulo,
      valor: b.valor,
      variacao: variacao(valor, b.valor),
    })),
  };
}

/**
 * Soma uma janela de dias que termina em `fim` (exclusivo, medido do fim
 * do array). Serve para montar "últimos 30 dias" e "os 30 anteriores"
 * sem repetir aritmética de índice em cada tela.
 */
export function janela<T>(
  serie: T[],
  tamanho: number,
  deslocamento = 0
): T[] {
  const fim = serie.length - deslocamento;
  return serie.slice(Math.max(0, fim - tamanho), Math.max(0, fim));
}

export function somar<T>(itens: T[], campo: (t: T) => number): number {
  return itens.reduce((s, i) => s + campo(i), 0);
}

/* ── Leitura em português ────────────────────────────────────── */

/** "subiu 12%" / "caiu 8%" / "ficou estável" */
export function frase(v: number | null, digitos = 0): string {
  if (v === null) return "não há base para comparar";
  if (Math.abs(v) < 0.5) return "ficou estável";
  const n = Math.abs(v).toLocaleString("pt-BR", {
    minimumFractionDigits: digitos,
    maximumFractionDigits: digitos,
  });
  return `${v > 0 ? "subiu" : "caiu"} ${n}%`;
}

/**
 * Classifica o tamanho de uma variação.
 *
 * Os cortes são arbitrários, e assumidamente: qualquer limiar é. O que
 * importa é serem os MESMOS em todo o sistema — um 6% que é "relevante"
 * numa tela e "ruído" na outra destrói a confiança mais rápido que um
 * corte mal escolhido.
 */
export function magnitude(v: number | null): "ruido" | "relevante" | "forte" {
  if (v === null) return "ruido";
  const a = Math.abs(v);
  if (a < 5) return "ruido";
  if (a < 20) return "relevante";
  return "forte";
}
