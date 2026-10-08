"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import type { GrupoRecorte } from "@/lib/recorte";

/* ══ Seletor de vários canais ══════════════════════════════════
 *
 * Caixas de marcar em vez de um select: a pergunta da visão do dia é
 * "e só estes canais?", que um canal por vez não responde. Aplica ao
 * fechar, numa navegação só — marcar três canais não dispara três cargas.
 */
export function SeletorCanais({
  grupos,
  selecionados,
  aoAplicar,
}: {
  grupos: GrupoRecorte[];
  selecionados: string[];
  aoAplicar: (valores: string[]) => void;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [marcados, setMarcados] = React.useState<string[]>(selecionados);
  const caixa = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => setMarcados(selecionados), [selecionados]);
  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const todas = grupos.flatMap((g) => g.opcoes).filter((o) => o.valor);
  const nome = (v: string) => todas.find((o) => o.valor === v)?.rotulo ?? v;
  const rotulo =
    selecionados.length === 0
      ? "Todos os canais"
      : selecionados.length === 1
        ? nome(selecionados[0])
        : `${selecionados.length} canais`;
  const alternar = (v: string) =>
    setMarcados((m) => (m.includes(v) ? m.filter((x) => x !== v) : [...m, v]));

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        className="flex h-10 w-[260px] max-w-full items-center justify-between gap-2 rounded-r1 border border-line-2 bg-panel px-3 text-[13px] text-ink"
      >
        <span className="truncate">{rotulo}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" />
      </button>
      {aberto && (
        <div className="absolute left-0 top-11 z-50 w-[min(320px,calc(100vw-32px))] rounded-r2 border border-line bg-panel shadow-[var(--sh-3)]">
          <div className="max-h-[50vh] overflow-y-auto p-2">
            {grupos.map((g, gi) => {
              const opcoes = g.opcoes.filter((o) => o.valor);
              if (!opcoes.length) return null;
              return (
                <div key={gi} className="py-1">
                  {g.rotulo && <p className="px-2 pb-1 text-[12px] font-semibold text-ink-3">{g.rotulo}</p>}
                  {opcoes.map((o) => (
                    <label
                      key={o.valor}
                      className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-r1 px-2 text-[13px] text-ink hover:bg-panel-3"
                    >
                      <input
                        type="checkbox"
                        checked={marcados.includes(o.valor)}
                        onChange={() => alternar(o.valor)}
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                      {o.rotulo}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line p-2">
            <button
              type="button"
              onClick={() => setMarcados([])}
              className="h-9 rounded-r1 px-3 text-[13px] text-ink-2 hover:bg-panel-3"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                aoAplicar(marcados);
              }}
              className="h-9 rounded-r1 bg-brand px-4 text-[13px] font-medium text-brand-ink hover:bg-brand-2"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

