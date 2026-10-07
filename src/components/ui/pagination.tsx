"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./primitives";

/** A paginação afeta só a apresentação; exportações continuam recebendo todas as linhas. */
export function usePagination<T>(rows: T[], initialSize = 25) {
  const [size, setSize] = useState(initialSize);
  const [requestedPage, setPage] = useState(1);
  const [previousRows, setPreviousRows] = useState(rows);
  // Novos filtros/ordenação voltam à primeira página antes da pintura.
  if (rows !== previousRows) {
    setPreviousRows(rows);
    setPage(1);
  }
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(requestedPage, pages);
  return {
    visible: rows.slice((page - 1) * size, page * size),
    pagination: { total: rows.length, page, pages, size, onPage: setPage, onSize: (value: number) => { setSize(value); setPage(1); } },
  };
}

export function Pagination({ total, page, pages, size, onPage, onSize }: {
  total: number; page: number; pages: number; size: number;
  onPage: (page: number) => void; onSize: (size: number) => void;
}) {
  // Some só quando nem a menor página disponível teria o que paginar. Antes
  // era `total <= 25` fixo: com página de 8, uma lista de 20 ficava presa
  // nas 8 primeiras, sem botão para seguir.
  if (total <= Math.min(size, 25)) return null;
  const opcoes = [...new Set([size, 25, 50, 100])].sort((a, b) => a - b);
  const number = (value: number) => value.toLocaleString("pt-BR");
  return (
    <nav aria-label="Paginação da tabela" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[12px] text-ink-2">
      <span aria-live="polite">{number((page - 1) * size + 1)}–{number(Math.min(page * size, total))} de {number(total)}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="hidden sm:inline">Por página</span>
          <select aria-label="Linhas por página" value={size} onChange={(e) => onSize(Number(e.target.value))} className="h-9 rounded-r1 border border-line bg-panel px-2 text-ink">
            {opcoes.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <Button size="sm" aria-label="Página anterior" disabled={page === 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /></Button>
        <span className="min-w-14 text-center num">{page} / {pages}</span>
        <Button size="sm" aria-label="Próxima página" disabled={page === pages} onClick={() => onPage(page + 1)}><ChevronRight size={16} /></Button>
      </div>
    </nav>
  );
}
