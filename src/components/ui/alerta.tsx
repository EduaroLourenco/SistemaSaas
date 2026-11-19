"use client";

import * as React from "react";
import { DemoLink as Link } from "@/lib/demo/runtime";
import { cn } from "@/lib/utils";
import { Badge } from "./primitives";
import { AXIS } from "./chart";
import { money, count, pct } from "@/lib/format";
import type { Alerta } from "@/lib/dados/alertas";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, AlertCircle, Info, ArrowRight, ChevronDown } from "lucide-react";

/**
 * Alerta com a prova ao lado da afirmação.
 *
 * O gráfico não é enfeite: ele responde a pergunta que todo alerta provoca
 * — "isso é novo ou sempre foi assim?". Sem a série, quem lê precisa abrir
 * outra tela para descobrir, e depois de algumas vezes para de abrir.
 *
 * O texto vem antes do número de propósito. Número sozinho ainda exige
 * interpretação, e interpretar é o trabalho que o sistema deveria estar
 * fazendo.
 */

const TOM = {
  critico: { icone: AlertCircle, cor: "text-down", fundo: "bg-down-wash", badge: "down" as const },
  atencao: { icone: AlertTriangle, cor: "text-warn", fundo: "bg-warn-wash", badge: "warn" as const },
  info: { icone: Info, cor: "text-info", fundo: "bg-info-wash", badge: "info" as const },
};

const ROTULO = { critico: "Crítico", atencao: "Atenção", info: "Informativo" };

/*
 * Linha compacta, como na referência aprovada de Alertas: ícone, selo,
 * título, resumo em números e "Investigar" — escaneável numa lista. A
 * leitura e o gráfico (a prova) continuam ali, na segunda camada: um clique
 * abre. Antes cada alerta ocupava ~300px e cinco deles enchiam a tela.
 */
export function CartaoAlerta({ alerta, emLista = false }: { alerta: Alerta; emLista?: boolean }) {
  const t = TOM[alerta.severidade];
  const Icone = t.icone;
  const [aberto, setAberto] = React.useState(false);
  const detalheId = React.useId();

  const formatar = React.useCallback(
    (v: number) =>
      alerta.formato === "moeda"
        ? money(v)
        : alerta.formato === "percentual"
        ? pct(v, 2)
        : count(v),
    [alerta.formato]
  );

  const cor =
    alerta.severidade === "critico"
      ? "var(--down)"
      : alerta.severidade === "atencao"
      ? "var(--warn)"
      : "var(--info)";

  return (
    <article className={emLista ? "min-w-0" : "panel"}>
      <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-3 p-4 md:items-center md:p-5">
        {!emLista && <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", t.fundo)}>
          <Icone aria-hidden="true" className={cn("h-[18px] w-[18px]", t.cor)} strokeWidth={2.25} />
        </span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <Badge tone={t.badge}>{ROTULO[alerta.severidade]}</Badge>
            <h3 className="min-w-0 text-[16px] font-semibold leading-6 text-ink [overflow-wrap:anywhere]">{alerta.titulo}</h3>
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {alerta.numeros.map((n, i) => (
              <div key={i} className="min-w-0">
                <dt className="text-[12px] leading-[18px] text-ink-3">{n.rotulo}</dt>
                <dd className="num text-[16px] font-medium leading-6 text-ink [overflow-wrap:anywhere]">{n.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-2 md:w-auto">
        {alerta.destino && (
          <Link
            href={alerta.destino.href}
            aria-label={`Investigar: ${alerta.titulo}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-r1 border border-line-2 bg-panel px-3 text-[14px] font-medium text-ink hover:bg-panel-3"
          >
            Investigar
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={detalheId}
          aria-label={aberto ? "Esconder detalhes" : "Ver detalhes e evolução"}
          className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-r1 px-3 text-[14px] font-medium text-ink-2 hover:bg-panel-3 hover:text-ink"
        >
          Evidência
          <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
        </button>
        </div>
      </div>

      {aberto && (
        <div id={detalheId} className="border-t border-line bg-panel-2 p-4 md:p-5">
          <p className="text-[14px] leading-6 text-ink-2">{alerta.leitura}</p>

          {alerta.evidencia.length > 1 && (
            <div className="mt-4 h-[180px] min-w-0" role="img" aria-label={`Evolução de ${alerta.titulo}. Valores disponíveis em Ver dados da evolução.`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={alerta.evidencia} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="rotulo" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} width={38} tickFormatter={(v) => formatar(Number(v))} hide />
                  <Tooltip
                    cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="panel px-2.5 py-1.5" style={{ boxShadow: "var(--sh-3)" }}>
                          <p className="num text-[12px] text-ink-3">{String(label)}</p>
                          <p className="num text-[12px] font-semibold text-ink">{formatar(Number(payload[0].value))}</p>
                        </div>
                      );
                    }}
                  />
                  <Area type="linear" dataKey="valor" stroke={cor} strokeWidth={2} fill={cor} fillOpacity={0.08} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {alerta.evidencia.length > 0 && (
            <details className="mt-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-medium text-brand">Ver dados da evolução</summary>
              <div className="overflow-x-auto" role="region" aria-label="Dados da evolução" tabIndex={0}>
                <table className="w-full text-[14px]">
                  <caption className="sr-only">Valores que sustentam o alerta</caption>
                  <thead><tr className="border-b border-line text-ink-2"><th scope="col" className="py-3 text-left font-medium">Período</th><th scope="col" className="py-3 text-right font-medium">Valor</th></tr></thead>
                  <tbody>{alerta.evidencia.map((p, i) => <tr key={i} className="border-b border-line last:border-0"><th scope="row" className="py-3 text-left font-normal text-ink-2">{p.rotulo}</th><td className="num py-3 text-right font-medium text-ink">{formatar(p.valor)}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          )}

          {alerta.destino && (
            <Link
              href={alerta.destino.href}
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-[14px] font-medium text-brand underline-offset-2 hover:underline"
            >
              {alerta.destino.texto}
              <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
