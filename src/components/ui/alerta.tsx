"use client";

import * as React from "react";
import Link from "next/link";
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
import { AlertTriangle, AlertCircle, Info, ArrowRight } from "lucide-react";

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
  critico: { icone: AlertCircle, cor: "text-down", borda: "border-down/30", badge: "down" as const },
  atencao: { icone: AlertTriangle, cor: "text-warn", borda: "border-warn/30", badge: "warn" as const },
  info: { icone: Info, cor: "text-info", borda: "border-line", badge: "neutral" as const },
};

const ROTULO = { critico: "Crítico", atencao: "Atenção", info: "Informativo" };

export function CartaoAlerta({ alerta }: { alerta: Alerta }) {
  const t = TOM[alerta.severidade];
  const Icone = t.icone;

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
    <div className={cn("panel p-4", t.borda)}>
      <div className="flex items-start gap-2.5 mb-2.5">
        <Icone className={cn("w-4 h-4 mt-[2px] shrink-0", t.cor)} strokeWidth={2.25} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-ink leading-snug min-w-0">
              {alerta.titulo}
            </p>
            <Badge tone={t.badge}>{ROTULO[alerta.severidade]}</Badge>
          </div>
          <p className="text-[12.5px] text-ink-2 leading-relaxed mt-1">
            {alerta.leitura}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 pl-[26px] mb-3">
        {alerta.numeros.map((n) => (
          <span key={n.rotulo} className="min-w-0">
            <span className="label block">{n.rotulo}</span>
            <span className="num text-[13px] font-semibold text-ink">
              {n.valor}
            </span>
          </span>
        ))}
      </div>

      {alerta.evidencia.length > 1 && (
        <div className="h-[92px] pl-[14px] -mr-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={alerta.evidencia}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={`g-${alerta.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cor} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={cor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="rotulo" {...AXIS} interval="preserveStartEnd" />
              <YAxis {...AXIS} width={38} tickFormatter={(v) => formatar(Number(v))} hide />
              <Tooltip
                cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div
                      className="panel px-2.5 py-1.5"
                      style={{ boxShadow: "var(--sh-3)" }}
                    >
                      <p className="num text-[11px] text-ink-3">{String(label)}</p>
                      <p className="num text-[12px] font-semibold text-ink">
                        {formatar(Number(payload[0].value))}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="valor"
                stroke={cor}
                strokeWidth={1.75}
                fill={`url(#g-${alerta.id})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {alerta.destino && (
        <div className="pl-[26px] mt-2.5">
          <Link
            href={alerta.destino.href}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline underline-offset-2"
          >
            {alerta.destino.texto}
            <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
          </Link>
        </div>
      )}
    </div>
  );
}
