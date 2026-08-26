/**
 * Zera os números dos dados de exemplo que ainda não têm fonte real.
 *
 * As telas que faltam migrar continuavam mostrando valores inventados —
 * gráficos cheios, tabelas povoadas, tudo com cara de verdade. Numa
 * plataforma onde metade das telas já lê o banco, isso é pior que tela
 * vazia: não há como saber, olhando, se o número é seu ou é enfeite.
 *
 * Zerar preserva a estrutura (a tela continua desenhando) e remove a
 * afirmação. O texto — nome de canal, rótulo, categoria — fica, porque é
 * ele que mostra o que a tela vai exibir quando o dado chegar.
 */

/** Campos que descrevem tempo ou posição, e não medida. */
const ESTRUTURAIS = new Set([
  "dia",
  "mes",
  "ano",
  "semana",
  "n",
  "i",
  "indice",
  "ordem",
  "dow",
  "occ",
  "ranking",
  "posicao",
]);

export function zerar<T>(valor: T): T {
  if (typeof valor === "number") return 0 as unknown as T;
  if (Array.isArray(valor)) return valor.map((v) => zerar(v)) as unknown as T;

  if (valor && typeof valor === "object") {
    if (valor instanceof Date) return valor;
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      // Índice de dia/semana/mês precisa sobreviver: é o eixo do gráfico,
      // não uma medida. Zerar isso empilharia tudo no mesmo ponto.
      saida[k] = ESTRUTURAIS.has(k) && typeof v === "number" ? v : zerar(v);
    }
    return saida as T;
  }

  return valor;
}
