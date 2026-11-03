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

function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const mobileSnapshot = () => window.matchMedia("(max-width: 767px)").matches;
const serverSnapshot = () => false;

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
  const [hidden, setHidden] = React.useState<string[]>([]);
  const mobile = React.useSyncExternalStore(subscribeMobile, mobileSnapshot, serverSnapshot);
  const [view, setView] = React.useState<"list" | "table">("list");
  const shown = columns.filter((c, index) => index === 0 || !hidden.includes(c.key));
  const title = shown.find((c) => c.mobile === "title") ?? shown[0];
  const primary = shown.filter((c) => c !== title && (c.mobile === "metric" || c.mobile === "subtitle")).slice(0, 3);
  const summary = primary.length ? primary : shown.filter((c) => c !== title && c.mobile !== "hidden").slice(0, 2);
  const secondary = shown.filter((c) => c !== title && !summary.includes(c));
  const cards = mobile && view === "list";

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
      {mobile && <div className="gerizo-mobile-table-tools">
        <div role="group" aria-label="Visualização dos resultados">
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>Resumo</button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Tabela</button>
        </div>
        {columns.some((c) => c.sortValue) && <label>Ordenar por
          <select aria-label="Ordenar resultados por" value={sort?.key ?? ""} onChange={(event) => setSort(event.target.value ? { key: event.target.value, dir: "desc" } : null)}>
            <option value="">Ordem original</option>
            {columns.filter((c) => c.sortValue).map((c) => <option key={c.key} value={c.key}>{c.header}</option>)}
          </select>
        </label>}
        {sort && <button type="button" onClick={() => toggleSort(sort.key)} aria-label="Inverter ordenação">{sort.dir === "desc" ? "Decrescente ↓" : "Crescente ↑"}</button>}
      </div>}
      {columns.length > 4 && <details className="gerizo-table-options">
        <summary>Personalizar leitura <span>{shown.length} de {columns.length} colunas</span></summary>
        <div>{columns.map((c, index) => <label key={c.key}><input type="checkbox" checked={!hidden.includes(c.key) || index === 0} disabled={index === 0} onChange={(event) => setHidden((old) => event.target.checked ? old.filter((key) => key !== c.key) : [...old, c.key])} />{c.header}</label>)}</div>
      </details>}
      {/* ── Desktop: tabela densa ─────────────────────────────── */}
      {cards ? <div className="gerizo-mobile-records">
        {visible.map((row) => <article key={rowKey(row)} className="gerizo-mobile-record">
          <div className="gerizo-record-title">{title?.cell(row)}</div>
          <dl>{summary.map((c) => <div key={c.key}><dt>{c.header}</dt><dd>{c.cell(row)}</dd></div>)}</dl>
          {secondary.length > 0 && <details><summary>Mais dados <span>{secondary.length}</span></summary><dl>{secondary.map((c) => <div key={c.key}><dt>{c.header}</dt><dd>{c.cell(row)}</dd></div>)}</dl></details>}
          {onRowClick && <button className="gerizo-record-open" type="button" onClick={() => onRowClick(row)}>Abrir detalhes →</button>}
        </article>)}
      </div> : <div className={cn("gerizo-table-scroll gerizo-data-table", className)} tabIndex={0} role="region" aria-label="Tabela de resultados. Deslize para ver todas as colunas.">
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: shown.length > 6 ? 920 : shown.length > 3 ? 620 : undefined }}>
          <thead>
            <tr className="bg-panel-2">
              {shown.map((c) => {
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
                    style={{ width: c.width, "--mobile-column-width": c.mobile === "title" ? "164px" : c.width } as React.CSSProperties}
                    className={cn(
                      "h-11 px-4 border-b border-line font-medium text-[12px] text-ink-2 whitespace-nowrap",
                      c.align === "right" ? "text-right" : "text-left",
                      c.sticky &&
                        "md:sticky md:left-0 z-10 bg-panel-2 border-r border-line"
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
                {shown.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 md:px-4 py-2.5 text-ink-2",
                      c.align === "right" && "text-right whitespace-nowrap",
                      c.sticky &&
                        "md:sticky md:left-0 z-10 bg-panel border-r border-line"
                    )}
                    style={{ height: "var(--row)" }}
                  >
                    <div className={cn(c.mobile === "title" && "gerizo-table-title")}>{c.cell(row)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {!cards && columns.length > 3 && <p className="px-4 py-2 text-[12px] text-ink-3 md:hidden">Deslize a tabela para comparar mais colunas.</p>}

      <Pagination {...pagination} />
    </>
  );
}
