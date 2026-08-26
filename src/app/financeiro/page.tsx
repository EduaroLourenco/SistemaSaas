"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge, Delta } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FLUXO_12_MESES,
  RESUMO_PAINEL,
  CUSTOS,
  CUSTO_TOTAL,
  PROXIMOS_VENCIMENTOS,
  MOVIMENTACOES,
  RESUMO_CONTAS,
} from "@/mock/financeiro";
import { money, moneyShort, pct } from "@/lib/format";
import { CalendarDays, Download, ArrowDownRight, ArrowUpRight } from "lucide-react";

/** dd/mm a partir do ISO. */
function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const FAIXA_TOM: Record<string, "down" | "warn" | "neutral"> = {
  vencida: "down",
  hoje: "warn",
  sete_dias: "neutral",
};

const FAIXA_ROTULO: Record<string, string> = {
  vencida: "vencida",
  hoje: "vence hoje",
  sete_dias: "a vencer",
};

export default function PainelFinanceiro() {
  const despesas = React.useMemo(
    () =>
      [...CUSTOS]
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 6)
        .concat([
          {
            ...CUSTOS[0],
            id: "outros",
            categoria: "Demais categorias",
            cor: "var(--ink-3)",
            valor:
              CUSTO_TOTAL -
              [...CUSTOS].sort((a, b) => b.valor - a.valor).slice(0, 6).reduce((s, c) => s + c.valor, 0),
          },
        ]),
    []
  );

  return (
    <>
      <PageHeader
        title="Painel financeiro"
        breadcrumb="Financeiro"
        description="Agosto de 2026 · entradas, saídas e compromissos"
        actions={
          <>
            <Button size="sm" className="hidden sm:inline-flex">
              <CalendarDays className="w-3.5 h-3.5" />
              Ago 2026
            </Button>
            <Button size="sm" variant="primary">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatTile
            label="Entradas do mês"
            value={money(RESUMO_PAINEL.entradas)}
            delta={RESUMO_PAINEL.entradasDelta}
            spark={RESUMO_PAINEL.serieEntradas}
          />
          <StatTile
            label="Saídas do mês"
            value={money(RESUMO_PAINEL.saidas)}
            delta={RESUMO_PAINEL.saidasDelta}
            inverse
          />
          <StatTile
            label="Resultado"
            value={money(RESUMO_PAINEL.resultado)}
            delta={RESUMO_PAINEL.resultadoDelta}
            spark={RESUMO_PAINEL.serieResultado}
          />
          <StatTile
            label="A receber"
            value={money(RESUMO_PAINEL.aReceber)}
            hint="repasses em trânsito"
          />
          <StatTile
            label="A pagar"
            value={money(RESUMO_PAINEL.aPagar)}
            hint={`${money(RESUMO_CONTAS.vencido)} vencido`}
          />
          <StatTile
            label="Saldo em caixa"
            value={money(RESUMO_PAINEL.saldoCaixa)}
            hint="somando todas as contas"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <Panel className="xl:col-span-2 overflow-hidden">
            <PanelHeader
              title="Entradas e saídas"
              hint="12 meses"
              action={
                <span className="num text-[12px] text-ink-2 hidden sm:block">
                  resultado {money(RESUMO_PAINEL.resultado)}
                </span>
              }
            />
            <div className="h-[280px] px-2 pt-3 pb-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={FLUXO_12_MESES}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="mes" {...AXIS} minTickGap={8} />
                  <YAxis
                    {...AXIS}
                    width={54}
                    tickFormatter={(v: number) => moneyShort(v)}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--panel-3)" }}
                    content={<ChartTooltip formatter={(v) => money(v)} />}
                  />
                  <Bar
                    dataKey="entradas"
                    name="Entradas"
                    fill="var(--s1)"
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="saidas"
                    name="Saídas"
                    fill="var(--s3)"
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="resultado"
                    name="Resultado"
                    stroke="var(--s2)"
                    strokeWidth={1.75}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="px-4 py-3 border-t border-line">
              <Legend
                items={[
                  { label: "Entradas", color: "var(--s1)" },
                  { label: "Saídas", color: "var(--s3)" },
                  { label: "Resultado", color: "var(--s2)" },
                ]}
              />
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader title="Composição das despesas" hint="no mês" />
            <div className="h-[220px] pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={despesas}
                    dataKey="valor"
                    nameKey="categoria"
                    innerRadius={54}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="var(--panel)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {despesas.map((d) => (
                      <Cell key={d.id} fill={d.cor} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip formatter={(v) => money(v)} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="px-4 py-3 border-t border-line">
              <Legend
                items={despesas.map((d) => ({ label: d.categoria, color: d.cor }))}
              />
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Próximos vencimentos"
              hint="vencidos e próximos 7 dias"
              action={<Badge tone="warn">{PROXIMOS_VENCIMENTOS.length}</Badge>}
            />
            <ul className="divide-y divide-line">
              {PROXIMOS_VENCIMENTOS.map((c) => (
                <li
                  key={c.id}
                  className="px-4 py-2.5 flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-ink truncate">
                      {c.descricao}
                    </span>
                    <span className="block text-[11px] text-ink-3 truncate">
                      {c.fornecedor} · {c.documento}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge tone={FAIXA_TOM[c.faixa] ?? "neutral"}>
                      <span className="num">{dataCurta(c.vencimento)}</span>
                      <span className="ml-1 hidden sm:inline">
                        {FAIXA_ROTULO[c.faixa]}
                      </span>
                    </Badge>
                    <span className="num text-[13px] font-semibold text-ink">
                      {money(c.valor)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader title="Últimas movimentações" hint="entradas e saídas" />
            <ul className="divide-y divide-line">
              {MOVIMENTACOES.map((m) => (
                <li
                  key={m.id}
                  className="px-4 py-2.5 flex items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={
                        "w-6 h-6 rounded-r1 flex items-center justify-center shrink-0 " +
                        (m.tipo === "entrada"
                          ? "bg-up-wash text-up"
                          : "bg-down-wash text-down")
                      }
                    >
                      {m.tipo === "entrada" ? (
                        <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2.2} />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" strokeWidth={2.2} />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-ink truncate">
                        {m.descricao}
                      </span>
                      <span className="block text-[11px] text-ink-3 truncate">
                        <span className="num">{dataCurta(m.data)}</span> · {m.categoria}
                      </span>
                    </span>
                  </span>
                  <span
                    className={
                      "num text-[13px] font-semibold shrink-0 " +
                      (m.tipo === "entrada" ? "text-up" : "text-ink")
                    }
                  >
                    {m.tipo === "entrada" ? "+" : "−"}
                    {money(m.valor)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Custos por categoria"
            hint={`${money(CUSTO_TOTAL)} no mês`}
          />
          <div className="h-[240px] px-2 pt-3 pb-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...CUSTOS].sort((a, b) => b.valor - a.valor)}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid {...GRID} vertical horizontal={false} />
                <XAxis
                  type="number"
                  {...AXIS}
                  tickFormatter={(v: number) => moneyShort(v)}
                />
                <YAxis
                  type="category"
                  dataKey="categoria"
                  {...AXIS}
                  width={150}
                  tick={{ ...AXIS.tick, fontFamily: "var(--f-ui)" }}
                />
                <Tooltip
                  cursor={{ fill: "var(--panel-3)" }}
                  content={<ChartTooltip formatter={(v) => money(v)} />}
                />
                <Bar dataKey="valor" name="Custo" radius={[0, 2, 2, 0]} isAnimationActive={false}>
                  {CUSTOS.map((c) => (
                    <Cell key={c.id} fill={c.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
