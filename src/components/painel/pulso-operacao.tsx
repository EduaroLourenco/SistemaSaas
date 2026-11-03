"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChartNoAxesCombined, ShoppingBag, Wallet } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { Recorte } from "@/lib/periodo";
import { money, count, shortDate } from "@/lib/format";
import { Delta } from "@/components/ui/primitives";

const MODOS = [
  { id: "faturamento", label: "Faturamento", icon: Wallet },
  { id: "pedidos", label: "Pedidos", icon: ShoppingBag },
] as const;

/** Uma pergunta por vez. A série e o destaque usam o mesmo recorte. */
export function PulsoOperacao({ recorte }: { recorte: Recorte }) {
  const [modo, setModo] = useState<"faturamento" | "pedidos">("faturamento");
  const indicador = recorte.kpis.find((k) => k.id === modo);
  const formatar = (v: number) => modo === "faturamento" ? money(v) : count(v);
  if (!indicador) return null;
  return <section className="gerizo-pulse" aria-label="Pulso da operação">
    <div className="gerizo-pulse-reading">
      <span className="gerizo-section-index"><ChartNoAxesCombined size={16} /> 01 / O resultado</span>
      <h2>Como foi o período?</h2>
      <div className="gerizo-pulse-tabs" role="group" aria-label="Indicador em destaque">
        {MODOS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={modo === id} onClick={() => setModo(id)}><Icon size={15} />{label}</button>)}
      </div>
      <strong className="gerizo-pulse-number" key={`${modo}-${indicador.value}`}>{formatar(indicador.value)}</strong>
      <div className="gerizo-pulse-comparison"><Delta value={indicador.delta} /><span>{indicador.hint}</span></div>
      <p>{recorte.dias ? `${recorte.dias} dias com movimento · ${recorte.intervalo}` : "Ainda não há movimento neste recorte."}</p>
      <details className="gerizo-pulse-definition"><summary>O que entra neste número?</summary><p>{indicador.ajuda}</p></details>
    </div>
    <div className="gerizo-pulse-chart">
      <span className="gerizo-section-index">Ritmo diário</span>
      <div className="gerizo-pulse-chart-canvas">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={recorte.faturamento} margin={{ top: 20, right: 12, bottom: 0, left: 12 }}>
            <XAxis dataKey="data" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={36} tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
            <Tooltip formatter={(value) => [formatar(Number(value)), indicador.label]} labelFormatter={(label) => shortDate(String(label))} contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} />
            <Area type="monotone" dataKey={modo} stroke="var(--up)" strokeWidth={3} fill="var(--up-wash)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <Link href="/vendas/diario">Explorar dia a dia <ArrowUpRight size={16} /></Link>
    </div>
  </section>;
}
