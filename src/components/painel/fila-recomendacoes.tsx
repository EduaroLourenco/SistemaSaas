"use client";

import * as React from "react";
import Link from "next/link";
import { Panel, PanelHeader, Badge, Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { Recomendacao } from "@/lib/dados/recomendacoes";
import { Check, ChevronLeft, ChevronRight, ArrowRight, RotateCcw } from "lucide-react";

/**
 * Fila de recomendações do dia, em carrossel.
 *
 * O que é resolvido some da fila e não volta no mesmo dia. A marca fica no
 * navegador, por dia: amanhã a fila é recalculada e o mesmo problema, se
 * persistir, volta a aparecer — resolver não é silenciar para sempre.
 *
 * Guardar por dia e não para sempre é deliberado: um card marcado como
 * resolvido em julho não deve esconder o mesmo problema acontecendo em
 * outubro.
 */

const CHAVE = "recomendacoes-resolvidas";

const TOM: Record<Recomendacao["severidade"], "down" | "warn" | "info"> = {
  critico: "down",
  atencao: "warn",
  info: "info",
};

const ROTULO: Record<Recomendacao["severidade"], string> = {
  critico: "crítico",
  atencao: "atenção",
  info: "informação",
};

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function lerResolvidas(): Set<string> {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return new Set();
    const { dia, ids } = JSON.parse(bruto) as { dia: string; ids: string[] };
    // Marca de outro dia não vale: a fila do dia é nova.
    return dia === hoje() ? new Set(ids) : new Set();
  } catch {
    return new Set();
  }
}

export function FilaRecomendacoes({ itens }: { itens: Recomendacao[] }) {
  const [resolvidas, setResolvidas] = React.useState<Set<string>>(new Set());
  const [pronto, setPronto] = React.useState(false);
  const trilho = React.useRef<HTMLDivElement>(null);

  // Só lê o armazenamento depois de montar: no servidor ele não existe, e
  // ler durante a renderização faria o HTML divergir do que o navegador
  // desenha.
  React.useEffect(() => {
    setResolvidas(lerResolvidas());
    setPronto(true);
  }, []);

  function guardar(ids: Set<string>) {
    try {
      localStorage.setItem(
        CHAVE,
        JSON.stringify({ dia: hoje(), ids: [...ids] })
      );
    } catch {
      // Navegador com armazenamento bloqueado: a fila continua funcionando,
      // só não lembra entre recarregamentos.
    }
  }

  function resolver(id: string) {
    setResolvidas((s) => {
      const p = new Set(s);
      p.add(id);
      guardar(p);
      return p;
    });
  }

  function desfazer() {
    setResolvidas(() => {
      guardar(new Set());
      return new Set();
    });
  }

  function rolar(direcao: 1 | -1) {
    trilho.current?.scrollBy({ left: direcao * 340, behavior: "smooth" });
  }

  const visiveis = pronto ? itens.filter((i) => !resolvidas.has(i.id)) : itens;
  const resolvidasHoje = itens.length - visiveis.length;

  if (!itens.length) {
    return (
      <Panel className="px-4 py-5 flex items-center gap-3">
        <span className="w-8 h-8 rounded-r1 bg-up-wash flex items-center justify-center shrink-0">
          <Check className="w-4 h-4 text-up" strokeWidth={2.5} />
        </span>
        <span>
          <p className="text-[13px] font-semibold text-ink">Nada mudou o bastante</p>
          <p className="text-[12.5px] text-ink-2">
            Nenhum movimento relevante nos últimos 7 dias contra os 7 anteriores.
          </p>
        </span>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Recomendações do dia"
        hint="o que mudou e merece decisão · resolver esconde até amanhã"
        action={
          <span className="flex items-center gap-1">
            {resolvidasHoje > 0 && (
              <Button size="sm" variant="ghost" onClick={desfazer}>
                <RotateCcw className="w-3.5 h-3.5" />
                {resolvidasHoje} resolvida{resolvidasHoje > 1 ? "s" : ""}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => rolar(-1)} aria-label="Anterior">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => rolar(1)} aria-label="Próxima">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </span>
        }
      />

      {visiveis.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[13px] text-ink-2">
            Tudo resolvido por hoje. A fila volta amanhã com o que mudar.
          </p>
        </div>
      ) : (
        <div
          ref={trilho}
          className="flex gap-3 overflow-x-auto px-4 py-4 snap-x snap-mandatory"
        >
          {visiveis.map((r) => (
            <article
              key={r.id}
              className={cn(
                "snap-start shrink-0 w-[300px] rounded-r2 border p-3.5",
                "flex flex-col gap-2.5 bg-panel",
                r.severidade === "critico" ? "border-down/35" : "border-line"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <Badge tone={TOM[r.severidade]}>{ROTULO[r.severidade]}</Badge>
                <button
                  onClick={() => resolver(r.id)}
                  className="text-[11.5px] text-ink-3 hover:text-ink flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  resolver
                </button>
              </span>

              <span>
                <p className="text-[13.5px] font-semibold text-ink leading-snug">
                  {r.titulo}
                </p>
                <p className="text-[12.5px] text-ink-2 leading-relaxed mt-1">
                  {r.leitura}
                </p>
              </span>

              <span className="flex items-baseline gap-4 mt-auto pt-1">
                {r.metricas.map((m) => (
                  <span key={m.rotulo}>
                    <span className="label block">{m.rotulo}</span>
                    <span className="num text-[13px] font-semibold text-ink">
                      {m.valor}
                    </span>
                  </span>
                ))}
              </span>

              <Link
                href={r.destino}
                className="text-[12.5px] text-brand hover:underline flex items-center gap-1"
              >
                Investigar
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
