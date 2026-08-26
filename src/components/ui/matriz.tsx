"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, ArrowUp, ArrowDown } from "lucide-react";

/**
 * Tabela cruzada: períodos nas COLUNAS, indicadores nas LINHAS.
 *
 * A tabela comum — uma linha por semana — obriga a ler na vertical para
 * comparar o mesmo indicador ao longo do tempo, e o olho tem que pular
 * entre colunas diferentes para cada métrica. Invertendo, cada indicador
 * vira uma faixa horizontal contínua: a evolução aparece sozinha, e
 * comparar duas métricas é olhar duas linhas vizinhas.
 *
 * A primeira coluna é fixa (`sticky`) porque em oito semanas a tabela
 * rola, e um número sem o nome do indicador ao lado não significa nada.
 */

export type IndicadorMatriz<T> = {
  chave: string;
  rotulo: string;
  /** Valor bruto do indicador naquele período. */
  valor: (p: T) => number | null;
  formato: (v: number) => string;
  /** true quando cair é bom (custo, cancelamento). */
  menorMelhor?: boolean;
  /** Destaca a linha — usada nos indicadores de topo. */
  destaque?: boolean;
  dica?: string;
};

export type ColunaMatriz = {
  chave: string;
  rotulo: string;
  /** Segunda linha do cabeçalho: intervalo, mês, o que for. */
  sub?: string;
  /** Período incompleto — o número existe mas não é comparável. */
  parcial?: boolean;
};

function Variacao({
  atual,
  anterior,
  menorMelhor,
}: {
  atual: number | null;
  anterior: number | null;
  menorMelhor?: boolean;
}) {
  if (atual == null || anterior == null || anterior === 0) return null;
  const d = ((atual - anterior) / Math.abs(anterior)) * 100;
  if (!Number.isFinite(d) || Math.abs(d) < 0.05) return null;

  const bom = menorMelhor ? d < 0 : d > 0;
  const Icone = d > 0 ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "num text-[10px] flex items-center justify-end gap-px leading-none",
        bom ? "text-up" : "text-down"
      )}
    >
      <Icone className="w-2.5 h-2.5" strokeWidth={2.5} />
      {Math.abs(d).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
    </span>
  );
}

export function Matriz<T>({
  colunas,
  periodos,
  indicadores,
  onAbrirColuna,
  mostrarVariacao = true,
  className,
}: {
  colunas: ColunaMatriz[];
  /** Mesma ordem de `colunas`. */
  periodos: T[];
  indicadores: IndicadorMatriz<T>[];
  onAbrirColuna?: (indice: number) => void;
  mostrarVariacao?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            <th
              className="sticky left-0 z-20 bg-panel text-left align-bottom px-3 py-2
                         border-r border-line min-w-[168px]"
            >
              <span className="label">Indicador</span>
            </th>
            {colunas.map((c, i) => (
              <th
                key={c.chave}
                className={cn(
                  "px-3 py-2 text-right align-bottom min-w-[104px] bg-panel",
                  onAbrirColuna && "cursor-pointer hover:bg-panel-3"
                )}
                onClick={onAbrirColuna ? () => onAbrirColuna(i) : undefined}
              >
                <span className="flex items-center justify-end gap-1">
                  <span className="num text-[12px] font-semibold text-ink">
                    {c.rotulo}
                  </span>
                  {c.parcial && (
                    <span
                      className="text-[9px] px-1 rounded-[3px] bg-warn-wash text-warn font-medium"
                      title="Período incompleto — não comparável"
                    >
                      parcial
                    </span>
                  )}
                  {onAbrirColuna && (
                    <ChevronRight className="w-3 h-3 text-ink-3" />
                  )}
                </span>
                {c.sub && (
                  <span className="num block text-[10px] text-ink-3 mt-0.5">
                    {c.sub}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {indicadores.map((ind) => (
            <tr
              key={ind.chave}
              className={cn(
                "border-b border-line last:border-0 hover:bg-panel-2",
                ind.destaque && "bg-panel-2"
              )}
            >
              <th
                scope="row"
                className={cn(
                  "sticky left-0 z-10 text-left px-3 py-2 border-r border-line",
                  "font-normal whitespace-nowrap",
                  ind.destaque ? "bg-panel-2" : "bg-panel"
                )}
              >
                <span
                  className={cn(
                    "text-[12.5px]",
                    ind.destaque ? "text-ink font-semibold" : "text-ink-2"
                  )}
                >
                  {ind.rotulo}
                </span>
                {ind.dica && (
                  <span className="block text-[10.5px] text-ink-3 leading-tight">
                    {ind.dica}
                  </span>
                )}
              </th>

              {periodos.map((p, i) => {
                const v = ind.valor(p);
                const ant = i > 0 ? ind.valor(periodos[i - 1]) : null;
                return (
                  <td key={i} className="px-3 py-2 text-right align-middle">
                    <span
                      className={cn(
                        "num block leading-tight",
                        v == null
                          ? "text-ink-3"
                          : ind.destaque
                            ? "text-ink font-semibold text-[13.5px]"
                            : "text-ink-2"
                      )}
                    >
                      {v == null ? "—" : ind.formato(v)}
                    </span>
                    {mostrarVariacao && (
                      <Variacao
                        atual={v}
                        anterior={ant}
                        menorMelhor={ind.menorMelhor}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
