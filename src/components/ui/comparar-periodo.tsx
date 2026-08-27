"use client";

import * as React from "react";
import { Sheet } from "@/components/ui/controls";
import { Button, Delta } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

/**
 * Comparação entre um período e o anterior.
 *
 * Abre ao clicar em qualquer ponto das análises — uma semana, um mês, um
 * canal. A tabela responde "o que mudou daqui para lá" sem obrigar a
 * anotar números de duas telas e subtrair de cabeça.
 *
 * Cada linha traz os dois valores E a diferença ABSOLUTA, não só o
 * percentual. Um "+300%" pode ser R$ 30 numa base de R$ 10, e percentual
 * sozinho engana justamente onde a base é pequena.
 */

export type LinhaComparacao = {
  chave: string;
  rotulo: string;
  atual: number | null;
  anterior: number | null;
  formato: (v: number) => string;
  /** true quando cair é bom — custo, cancelamento. */
  menorMelhor?: boolean;
  destaque?: boolean;
  dica?: string;
};

export function CompararPeriodo({
  titulo,
  rotuloAtual,
  rotuloAnterior,
  linhas,
  onClose,
  rodape,
}: {
  titulo: string;
  rotuloAtual: string;
  rotuloAnterior: string;
  linhas: LinhaComparacao[];
  onClose: () => void;
  /** Texto opcional abaixo da tabela — a leitura em uma frase. */
  rodape?: React.ReactNode;
}) {
  /*
   * A leitura automática pega o maior movimento em MÓDULO, e só fala se
   * ele for relevante. Frase gerada para variação de 0,3% é ruído com cara
   * de análise.
   */
  const leitura = React.useMemo(() => {
    const comBase = linhas.filter(
      (l) => l.atual != null && l.anterior != null && l.anterior !== 0
    );
    if (!comBase.length) return null;

    const variacoes = comBase.map((l) => ({
      rotulo: l.rotulo.toLowerCase(),
      pct: ((l.atual! - l.anterior!) / Math.abs(l.anterior!)) * 100,
      menorMelhor: l.menorMelhor,
    }));

    const maior = variacoes.reduce((a, b) =>
      Math.abs(b.pct) > Math.abs(a.pct) ? b : a
    );
    if (Math.abs(maior.pct) < 3) return "Nada se moveu de forma relevante.";

    const bom = maior.menorMelhor ? maior.pct < 0 : maior.pct > 0;
    const verbo = maior.pct > 0 ? "subiu" : "caiu";
    const nota = bom ? "a favor" : "contra";
    return `O maior movimento foi ${maior.rotulo}: ${verbo} ${Math.abs(
      maior.pct
    ).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% — ${nota}.`;
  }, [linhas]);

  return (
    <Sheet
      title={titulo}
      subtitle={`${rotuloAnterior} → ${rotuloAtual}`}
      onClose={onClose}
      width="620px"
      footer={
        <Button variant="primary" className="flex-1 max-sm:h-11" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 px-4 py-2 border-b border-line">
        <span className="label">Indicador</span>
        <span className="label text-right min-w-[92px]">{rotuloAnterior}</span>
        <span className="label text-right min-w-[92px]">{rotuloAtual}</span>
        <span className="label text-right min-w-[86px]">Diferença</span>
      </div>

      <div className="border-b border-line">
        {linhas.map((l) => {
          const temOs2 = l.atual != null && l.anterior != null;
          const dif = temOs2 ? l.atual! - l.anterior! : null;
          const pct =
            temOs2 && l.anterior !== 0
              ? ((l.atual! - l.anterior!) / Math.abs(l.anterior!)) * 100
              : null;

          return (
            <div
              key={l.chave}
              className={cn(
                "grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3",
                "px-4 py-2.5 border-b border-line last:border-0",
                l.destaque && "bg-panel-2"
              )}
            >
              <span className="min-w-0">
                <span
                  className={cn(
                    "text-[12.5px] block",
                    l.destaque ? "text-ink font-semibold" : "text-ink-2"
                  )}
                >
                  {l.rotulo}
                </span>
                {l.dica && (
                  <span className="text-[10.5px] text-ink-3 block leading-tight">
                    {l.dica}
                  </span>
                )}
              </span>

              <span className="num text-[13px] text-ink-3 text-right min-w-[92px]">
                {l.anterior != null ? l.formato(l.anterior) : "—"}
              </span>

              <span
                className={cn(
                  "num text-right min-w-[92px]",
                  l.destaque ? "text-[14px] font-semibold text-ink" : "text-[13px] text-ink-2"
                )}
              >
                {l.atual != null ? l.formato(l.atual) : "—"}
              </span>

              <span className="text-right min-w-[86px]">
                {dif == null ? (
                  <span className="text-ink-3 text-[12px]">—</span>
                ) : (
                  <span className="flex flex-col items-end leading-tight">
                    {/*
                      Diferença absoluta primeiro, percentual embaixo: um
                      "+300%" pode ser R$ 30 numa base de R$ 10, e o
                      percentual sozinho engana onde a base é pequena.
                    */}
                    <span
                      className={cn(
                        "num text-[12.5px]",
                        dif === 0
                          ? "text-ink-3"
                          : (l.menorMelhor ? dif < 0 : dif > 0)
                            ? "text-up"
                            : "text-down"
                      )}
                    >
                      {dif > 0 ? "+" : dif < 0 ? "−" : ""}
                      {l.formato(Math.abs(dif))}
                    </span>
                    {pct != null && Math.abs(pct) >= 0.05 && (
                      <Delta value={pct} inverse={l.menorMelhor} />
                    )}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {(leitura || rodape) && (
        <div className="px-4 py-3.5">
          {leitura && (
            <p className="text-[12.5px] text-ink-2 leading-relaxed flex items-start gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-ink-3 shrink-0 mt-0.5" />
              {leitura}
            </p>
          )}
          {rodape && <div className="mt-2">{rodape}</div>}
        </div>
      )}
    </Sheet>
  );
}
