/** Formatação — toda saída numérica passa por aqui. */

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export const money = (v: number) => brl.format(v);
export const moneyShort = (v: number) => brlCompact.format(v);
export const count = (v: number) => int.format(v);

export const pct = (v: number, digits = 1) =>
  `${v.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;

export const delta = (v: number, digits = 1) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;

export const shortDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

/** Direção semântica de uma variação. `inverse` para métricas onde cair é bom. */
export function tone(v: number, inverse = false): "up" | "down" | "flat" {
  if (Math.abs(v) < 0.05) return "flat";
  const positive = v > 0;
  return (inverse ? !positive : positive) ? "up" : "down";
}
