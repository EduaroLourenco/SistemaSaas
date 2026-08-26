"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

/**
 * Escolha de canal, com "todos" como primeira opção.
 *
 * Existe em toda tela de análise pelo mesmo motivo: no consolidado, a alta
 * de um canal cobre a queda de outro e a semana parece estável. Só olhando
 * um por vez dá para responder "quem caiu".
 *
 * Em telas com poucos canais vira uma fileira de botões; com muitos, um
 * menu — quinze canais em fileira quebram o cabeçalho em três linhas.
 */

export type OpcaoCanal = { id: string; nome: string; cor?: string };

export function SeletorCanal({
  canais,
  valor,
  onChange,
  rotuloTodos = "Todos os canais",
  className,
}: {
  canais: OpcaoCanal[];
  /** "" significa todos. */
  valor: string;
  onChange: (v: string) => void;
  rotuloTodos?: string;
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const atual = canais.find((c) => c.id === valor);
  const rotulo = atual?.nome ?? rotuloTodos;

  // Até quatro canais cabem em fileira sem quebrar o cabeçalho.
  if (canais.length <= 4) {
    return (
      <div
        className={cn(
          "flex items-center gap-1 p-0.5 rounded-r1 bg-panel-3 border border-line shrink-0",
          className
        )}
      >
        {[{ id: "", nome: rotuloTodos }, ...canais].map((c) => (
          <button
            key={c.id || "todos"}
            onClick={() => onChange(c.id)}
            className={cn(
              "h-6 px-2.5 rounded-[4px] text-[12px] font-medium transition-colors whitespace-nowrap",
              valor === c.id
                ? "bg-panel text-ink shadow-[var(--sh-1)]"
                : "text-ink-3 hover:text-ink"
            )}
          >
            {c.nome}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("relative shrink-0", className)}>
      <button
        onClick={() => setAberto((a) => !a)}
        className="h-7 pl-2.5 pr-2 flex items-center gap-1.5 rounded-r1 bg-panel
                   border border-line-2 text-[12.5px] text-ink hover:bg-panel-3
                   transition-colors max-w-[240px]"
      >
        {atual?.cor && (
          <span
            className="w-2 h-2 rounded-[2px] shrink-0"
            style={{ background: atual.cor }}
          />
        )}
        <span className="truncate">{rotulo}</span>
        <ChevronDown className="w-3.5 h-3.5 text-ink-3 shrink-0" />
      </button>

      {aberto && (
        <div
          className="absolute z-40 mt-1 min-w-[240px] max-h-[320px] overflow-y-auto
                     panel py-1"
          style={{ boxShadow: "var(--sh-3)" }}
        >
          {[{ id: "", nome: rotuloTodos, cor: undefined }, ...canais].map((c) => (
            <button
              key={c.id || "todos"}
              onClick={() => {
                onChange(c.id);
                setAberto(false);
              }}
              className="w-full px-2.5 py-1.5 flex items-center gap-2 text-left
                         text-[12.5px] text-ink-2 hover:bg-panel-3 hover:text-ink"
            >
              <span className="w-3.5 shrink-0">
                {valor === c.id && <Check className="w-3.5 h-3.5 text-brand" />}
              </span>
              {c.cor && (
                <span
                  className="w-2 h-2 rounded-[2px] shrink-0"
                  style={{ background: c.cor }}
                />
              )}
              <span className="truncate">{c.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
