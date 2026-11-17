"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Recorte } from "@/lib/periodo";
import { money, moneyShort, count, shortDate } from "@/lib/format";
import { Delta } from "@/components/ui/primitives";
import { AXIS, GRID, ChartTooltip } from "@/components/ui/chart";

const MODOS = [
  { id: "faturamento", label: "Faturamento" },
  { id: "pedidos", label: "Pedidos" },
] as const;

/** Uma pergunta por vez. A série e o destaque usam o mesmo recorte. */
export function PulsoOperacao({ recorte }: { recorte: Recorte }) {
  const [modo, setModo] = useState<"faturamento" | "pedidos">("faturamento");
  const indicador = recorte.kpis.find((k) => k.id === modo);
  const apoio = recorte.kpis.find((k) => k.id === (modo === "faturamento" ? "pedidos" : "faturamento"));
  const formatar = (v: number) => modo === "faturamento" ? money(v) : count(v);
  if (!indicador) return null;

  // Separar a unidade permite ler o valor integral no celular, sem compactá-lo.
  const semDados = recorte.dias === 0;
  const valor = semDados ? "—" : formatar(indicador.value);
  const valorSemMoeda = modo === "faturamento" ? valor.replace("R$", "").trim() : valor;
  const compactarMobile = !semDados && modo === "faturamento" && valorSemMoeda.length > 10;

  return (
    <section className="home-pulse min-w-0" aria-label="Pulso da operação">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-ink">Vendas no período</h2>
        <div className="inline-flex gap-1 rounded-r1 bg-panel-3 p-1" role="group" aria-label="Indicador em destaque">
          {MODOS.map(({ id, label }) => (
            <button key={id} type="button" aria-pressed={modo === id} onClick={() => setModo(id)} className={`min-h-9 rounded-[6px] px-3 text-[14px] font-medium transition-colors ${modo === id ? "bg-panel text-brand" : "text-ink-2 hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 overflow-hidden rounded-r3 border border-line bg-panel lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0 p-4 sm:p-6 lg:flex lg:flex-col lg:justify-center">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-2">
            <span>{indicador.label}</span>
            {modo === "faturamento" && <span className="text-ink-3">· R$</span>}
          </div>
          <strong className="home-hero-number block text-[48px] font-semibold leading-[56px] tracking-[-0.045em] text-ink tabular-nums [overflow-wrap:anywhere] xl:text-[56px] xl:leading-[64px]" aria-label={valor}>
            {compactarMobile ? <><span className="sm:hidden">{moneyShort(indicador.value).replace("R$", "").trim()}</span><span className="hidden sm:inline">{valorSemMoeda}</span></> : valorSemMoeda}
          </strong>
          {compactarMobile && <p className="mt-2 text-[14px] leading-5 text-ink-2 sm:hidden">Valor integral: {valor.replace(/\u00a0/g, " ")}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-2">
            {!semDados && <Delta value={indicador.delta} className="text-[14px]" />}
            <span>{semDados ? "Sem dados neste recorte" : indicador.hint}</span>
          </div>
          <p className="mt-2 text-[12px] leading-[18px] text-ink-3">
            {recorte.dias ? `${recorte.dias} dias com movimento · ${recorte.intervalo}` : "Ainda não há movimento neste recorte."}
          </p>
          {apoio && (
            <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-4">
              <span className="text-[14px] text-ink-2">{apoio.label}</span>
              <span className="text-[20px] font-semibold tracking-[-0.025em] text-ink tabular-nums [overflow-wrap:anywhere]">{semDados ? "—" : apoio.format === "money" ? money(apoio.value) : count(apoio.value)}</span>
              {!semDados && <Delta value={apoio.delta} />}
            </div>
          )}
          <details className="group mt-3 text-[14px] text-ink-2">
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-[12px] hover:text-brand">Como é calculado <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
            <p className="max-w-xl pb-2 leading-relaxed">{indicador.ajuda}</p>
          </details>
        </div>

        <div className="min-w-0 border-t border-line p-4 lg:border-t-0 lg:p-6 lg:pl-2">
          <div className="flex items-center justify-between gap-3 text-[12px] text-ink-3"><span>{indicador.label} por dia</span><span className="tabular-nums">{recorte.intervalo}</span></div>
          <div className="mt-3 h-[200px] min-w-0 lg:h-[240px]" aria-label={`Evolução de ${indicador.label.toLowerCase()} no período. Valores disponíveis em Ver dados por dia.`}>
            {semDados ? <div className="flex h-full items-center justify-center text-[14px] text-ink-3">Sem dados para traçar a evolução</div> : <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={recorte.faturamento} margin={{ top: 12, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="data" {...AXIS} tickFormatter={shortDate} minTickGap={36} />
                <YAxis {...AXIS} width={modo === "faturamento" ? 76 : 40} tickFormatter={(v: number) => modo === "faturamento" ? moneyShort(v) : count(v)} tickCount={4} />
                <Tooltip cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }} content={<ChartTooltip formatter={formatar} />} labelFormatter={(label) => shortDate(String(label))} />
                <Area type="linear" dataKey={modo} name={indicador.label} stroke="var(--brand)" strokeWidth={2.5} fill="var(--brand-wash)" connectNulls={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>}
          </div>
          <Link href="/vendas/diario" className="mt-1 inline-flex min-h-10 items-center gap-1 text-[14px] font-medium text-brand hover:underline">Comparar períodos <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>

        <details className="group min-w-0 border-t border-line lg:col-span-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[12px] font-medium text-ink-2 sm:px-6">Ver dados por dia <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
          <div className="max-h-80 overflow-auto border-t border-line" tabIndex={0} role="region" aria-label="Valores diários de faturamento e pedidos">
            <table className="w-full border-collapse text-[14px] tabular-nums">
              <caption className="sr-only">Valores exatos do gráfico no período selecionado</caption>
              <thead className="sticky top-0 bg-panel-2 text-ink-2"><tr><th className="px-4 py-3 text-left font-medium" scope="col">Data</th><th className="px-4 py-3 text-right font-medium" scope="col">Faturamento</th><th className="px-4 py-3 text-right font-medium" scope="col">Pedidos</th></tr></thead>
              <tbody>{recorte.faturamento.map((dia) => <tr key={dia.data} className="border-t border-line"><th scope="row" className="px-4 py-3 text-left font-normal text-ink-2">{shortDate(dia.data)}</th><td className="px-4 py-3 text-right text-ink">{money(dia.faturamento)}</td><td className="px-4 py-3 text-right text-ink">{count(dia.pedidos)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}
