"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";

export type Column<T> = {
  key: string;
  header: string;
  /** Alinhamento. Números sempre à direita. */
  align?: "left" | "right";
  /** Célula do desktop. */
  cell: (row: T) => React.ReactNode;
  /** Valor para ordenação. Omitir torna a coluna não-ordenável. */
  sortValue?: (row: T) => number | string;
  /** Papel no cartão do mobile: título, métrica em destaque, ou oculto. */
  mobile?: "title" | "subtitle" | "metric" | "hidden";
  width?: string;
  /** Fixa a coluna à esquerda no scroll horizontal. */
  sticky?: boolean;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Ordenação inicial: chave da coluna. */
  defaultSort?: { key: string; dir: "asc" | "desc" };
  empty?: React.ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  defaultSort,
  empty,
  className,
}: Props<T>) {
  const [sort, setSort] = React.useState(defaultSort ?? null);

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    });
  }, [rows, sort, columns]);

  function toggleSort(key: string) {
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }

  if (rows.length === 0 && empty) return <>{empty}</>;

  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0];
  const subtitleCol = columns.find((c) => c.mobile === "subtitle");
  const metricCols = columns.filter((c) => c.mobile === "metric").slice(0, 3);

  return (
    <>
      {/* ── Desktop: tabela densa ─────────────────────────────── */}
      <div className={cn("hidden md:block overflow-x-auto", className)}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-panel-2">
              {columns.map((c) => {
                const sortable = !!c.sortValue;
                const active = sort?.key === c.key;
                const Icon = !active
                  ? ChevronsUpDown
                  : sort!.dir === "asc"
                    ? ChevronUp
                    : ChevronDown;
                return (
                  <th
                    key={c.key}
                    style={{ width: c.width }}
                    className={cn(
                      "h-9 px-3 border-b border-line font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap",
                      c.align === "right" ? "text-right" : "text-left",
                      c.sticky &&
                        "sticky left-0 z-10 bg-panel-2 border-r border-line"
                    )}
                  >
                    {sortable ? (
                      <button
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-ink transition-colors",
                          active && "text-ink",
                          c.align === "right" && "flex-row-reverse"
                        )}
                      >
                        {c.header}
                        <Icon className="w-3 h-3 shrink-0" strokeWidth={2.5} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-line last:border-0 transition-colors",
                  i % 2 === 1 && "bg-panel-2/55",
                  onRowClick && "cursor-pointer hover:bg-brand-wash"
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 text-ink-2",
                      c.align === "right" && "text-right",
                      c.sticky &&
                        "sticky left-0 z-10 bg-panel border-r border-line"
                    )}
                    style={{ height: "var(--row)" }}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: cartões empilhados, nunca scroll lateral ──── */}
      <ul className="md:hidden divide-y divide-line">
        {sorted.map((row) => (
          <li key={rowKey(row)}>
            <button
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              disabled={!onRowClick}
              className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-panel-3 transition-colors disabled:active:bg-transparent"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink truncate">
                  {titleCol.cell(row)}
                </div>
                {subtitleCol && (
                  <div className="text-[11px] text-ink-3 truncate mt-0.5">
                    {subtitleCol.cell(row)}
                  </div>
                )}
                {metricCols.length > 0 && (
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-2">
                    {metricCols.map((c) => (
                      <span key={c.key} className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-[0.04em] text-ink-3 font-semibold">
                          {c.header}
                        </span>
                        <span className="text-[13px] text-ink">{c.cell(row)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {onRowClick && (
                <ChevronRight className="w-4 h-4 text-ink-3 shrink-0" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
