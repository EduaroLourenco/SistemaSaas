"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const SERIES = [
  "var(--s1)",
  "var(--s2)",
  "var(--s3)",
  "var(--s4)",
  "var(--s5)",
  "var(--s6)",
  "var(--s7)",
  "var(--s8)",
  "var(--s9)",
  "var(--s10)",
] as const;

/** Eixos e grade do sistema — passar em cada gráfico para manter coerência. */
export const AXIS = {
  stroke: "var(--line)",
  tick: {
    fill: "var(--ink-3)",
    fontSize: 11,
    fontFamily: "var(--f-num)",
  },
  tickLine: false,
  axisLine: false,
} as const;

export const GRID = {
  stroke: "var(--grid)",
  strokeDasharray: "0",
  vertical: false,
} as const;

/** Tooltip do sistema. Sem blur, sem sombra colorida. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string | number;
  formatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="panel panel-2 px-2.5 py-2 min-w-[130px]"
      style={{ boxShadow: "var(--sh-3)" }}
    >
      {label !== undefined && (
        <p className="text-[11px] font-semibold text-ink-2 mb-1.5">{label}</p>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-2 h-2 rounded-[2px] shrink-0"
                style={{ background: p.color }}
              />
              <span className="text-[11px] text-ink-2 truncate">
                {p.name ?? p.dataKey}
              </span>
            </span>
            <span className="num text-[12px] font-semibold text-ink">
              {formatter && typeof p.value === "number"
                ? formatter(p.value)
                : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string }[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-[3px] shrink-0"
            style={{ background: it.color }}
          />
          <span className="text-[11px] text-ink-2">{it.label}</span>
        </span>
      ))}
    </div>
  );
}
