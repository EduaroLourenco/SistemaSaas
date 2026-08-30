/**
 * Exporta para CSV exatamente o que está na tela.
 *
 * "Exatamente" é o ponto: com os mesmos filtros, a mesma ordenação e as
 * mesmas colunas visíveis. Exportação que devolve a tabela inteira obriga
 * a refazer o recorte no Excel, e aí o número do relatório não bate com o
 * da tela — que é como a confiança no sistema morre.
 */

export type Coluna<T> = {
  cabecalho: string;
  /** Valor bruto. Números saem como número, não como texto formatado. */
  valor: (linha: T) => string | number | null | undefined;
};

/**
 * Ponto-e-vírgula, não vírgula.
 *
 * O Excel em português usa vírgula como separador decimal. Com CSV
 * separado por vírgula ele joga tudo numa coluna só, e a pessoa conclui
 * que a exportação está quebrada — quando é só a convenção errada.
 */
const SEP = ";";

function celula(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";

  if (typeof v === "number") {
    // Decimal com vírgula, sem separador de milhar: é o que o Excel
    // pt-BR lê como número. Com ponto, ele lê como texto.
    return Number.isInteger(v) ? String(v) : v.toString().replace(".", ",");
  }

  const texto = String(v);
  // Aspas duplicadas dentro do campo é o escape do formato.
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function paraCsv<T>(linhas: T[], colunas: Coluna<T>[]): string {
  const cabecalho = colunas.map((c) => celula(c.cabecalho)).join(SEP);
  const corpo = linhas.map((l) =>
    colunas.map((c) => celula(c.valor(l))).join(SEP)
  );
  return [cabecalho, ...corpo].join("\r\n");
}

/**
 * Dispara o download.
 *
 * O BOM no começo não é enfeite: sem ele o Excel abre o arquivo em
 * ANSI e todo acento vira símbolo. "Operação" fica "OperaÃ§Ã£o", e a
 * planilha parece corrompida.
 */
export function baixarCsv<T>(
  nomeBase: string,
  linhas: T[],
  colunas: Coluna<T>[]
) {
  const csv = "﻿" + paraCsv(linhas, colunas);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeBase}-${carimbo()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** aaaa-mm-dd-hhmm — ordena sozinho na pasta de downloads. */
function carimbo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(
    d.getHours()
  )}${p(d.getMinutes())}`;
}
