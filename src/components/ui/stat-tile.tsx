"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Delta } from "./primitives";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

export function Sparkline({
  data,
  tone = "brand",
}: {
  data: number[];
  tone?: "brand" | "up" | "down";
}) {
  const color = `var(--${tone})`;
  const points = data.map((v, i) => ({ i, v }));
  const id = React.useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${id})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatTile({
  label,
  value,
  delta,
  inverse,
  hint,
  spark,
  className,
}: {
  label: string;
  value: string;
  delta?: number;
  inverse?: boolean;
  hint?: string;
  spark?: number[];
  className?: string;
}) {
  /*
   * O valor é o motivo do cartão e NUNCA corta. Antes era 26px fixo com
   * `truncate`: em 4 colunas a 1440px, "R$ 1.715.722,79" virava
   * "R$ 1.715.7…" — o número principal da tela inicial sem caber na caixa
   * feita para ele. Agora o tamanho acompanha a largura do próprio cartão
   * (container query, `cqw`), e o minigráfico só aparece quando sobra
   * espaço ao lado.
   */
  return (
    <div
      className={cn(
        "gerizo-stat-tile @container panel panel-1 px-3 md:px-4 py-3.5 flex flex-col justify-between min-w-0",
        className
      )}
    >
      <p className="label leading-snug">{label}</p>

      <div className="mt-1.5 flex items-center justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <p className="gerizo-metric-value num leading-tight font-bold text-ink [font-size:clamp(16px,8.5cqw,26px)]">
            {value}
          </p>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1.5 min-w-0">
            {delta !== undefined && <Delta value={delta} inverse={inverse} />}
            {hint && (
              <span className="text-[12px] text-ink-3">{hint}</span>
            )}
          </div>
        </div>

        {spark && spark.length > 1 && (
          <div className="w-16 h-9 shrink-0 hidden @[21rem]:block">
            <Sparkline
              data={spark}
              tone={
                delta === undefined || Math.abs(delta) < 0.05
                  ? "brand"
                  : (delta > 0) !== !!inverse
                    ? "up"
                    : "down"
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
