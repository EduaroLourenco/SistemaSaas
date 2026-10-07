"use client";

import * as React from "react";
import { Pagination, usePagination } from "./pagination";
import { cn } from "@/lib/utils";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";

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

  const { visible, pagination } = usePagination(sorted);

  function toggleSort(key: string) {
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }

  if (rows.length === 0 && empty) return <>{empty}</>;


  return (
    <>
      {/* ── Desktop: tabela densa ─────────────────────────────── */}
      <div className={cn("gerizo-table-scroll", className)} tabIndex={0} role="region" aria-label="Tabela de resultados. Role para ver todas as colunas.">
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: columns.length > 6 ? 920 : columns.length > 3 ? 620 : undefined }}>
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
                    scope="col"
                    aria-sort={active ? sort!.dir === "asc" ? "ascending" : "descending" : undefined}
                    style={{ width: c.width }}
                    className={cn(
                      "h-11 px-4 border-b border-line font-medium text-[12px] text-ink-2 whitespace-nowrap",
                      c.align === "right" ? "text-right" : "text-left",
                      c.sticky &&
                        "sticky left-0 z-10 bg-panel-2 border-r border-line"
                    )}
                  >
                    {sortable ? (
                      <button
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "inline-flex min-h-10 items-center gap-1.5 hover:text-ink transition-colors",
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
            {visible.map((row, i) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? (event) => {
                  if ((event.target as HTMLElement).closest("a,button,input,select,textarea")) return;
                  onRowClick(row);
                } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRowClick(row); }
                } : undefined}
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
                      "px-4 py-2.5 text-ink-2",
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

      <Pagination {...pagination} />
    </>
  );
}
