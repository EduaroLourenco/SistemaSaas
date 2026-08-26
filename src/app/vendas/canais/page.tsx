"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Delta, Badge } from "@/components/ui/primitives";
import { Sparkline } from "@/components/ui/stat-tile";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  CANAIS,
  CANAIS_12_SEMANAS,
  CANAL_CORES,
  CANAL_NOMES,
  type Canal,
} from "@/mock";
import { money, count, pct } from "@/lib/format";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, Download, SlidersHorizontal, X } from "lucide-react";

const PERIODOS = ["7 dias", "30 dias", "90 dias", "Ano"];

export default function VendasPorCanal() {
  const [periodo, setPeriodo] = React.useState("30 dias");
  const [ocultos, setOcultos] = React.useState<string[]>([]);
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);

  const visiveis = CANAIS.filter((c) => !ocultos.includes(c.id));
  const total = visiveis.reduce((s, c) => s + c.faturamento, 0);

  function alternar(id: string) {
    setOcultos((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  }

  const colunas: Column<Canal>[] = [
    {
      key: "nome",
      header: "Canal",
      mobile: "title",
      sticky: true,
      width: "200px",
      cell: (r) => (
        <span className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-[2px] shrink-0"
            style={{ background: CANAL_CORES[r.id] }}
          />
          <span className="font-medium text-ink truncate">{r.nome}</span>
        </span>
      ),
      sortValue: (r) => r.nome,
    },
    {
      key: "faturamento",
      header: "Faturamento",
      align: "right",
      mobile: "metric",
      width: "140px",
      cell: (r) => (
        <span className="num font-semibold text-ink">{money(r.faturamento)}</span>
      ),
      sortValue: (r) => r.faturamento,
    },
    {
      key: "delta",
      header: "Variação",
      align: "right",
      mobile: "metric",
      width: "110px",
      cell: (r) => <Delta value={r.delta} />,
      sortValue: (r) => r.delta,
    },
    {
      key: "participacao",
      header: "Participação",
      align: "right",
      width: "130px",
      cell: (r) => (
        <span className="flex items-center justify-end gap-2">
          <span className="hidden lg:block w-14 h-1 rounded-full bg-panel-3 overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${r.participacao}%`,
                background: CANAL_CORES[r.id],
              }}
            />
          </span>
          <span className="num">{pct(r.participacao)}</span>
        </span>
      ),
      sortValue: (r) => r.participacao,
    },
    {
      key: "pedidos",
      header: "Pedidos",
      align: "right",
      mobile: "metric",
      width: "100px",
      cell: (r) => <span className="num">{count(r.pedidos)}</span>,
      sortValue: (r) => r.pedidos,
    },
    {
      key: "ticket",
      header: "Ticket médio",
      align: "right",
      width: "120px",
      cell: (r) => <span className="num">{money(r.ticket)}</span>,
      sortValue: (r) => r.ticket,
    },
    {
      key: "conversao",
      header: "Conversão",
      align: "right",
      width: "110px",
      cell: (r) =>
        r.conversao === 0 ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className="num">{pct(r.conversao, 2)}</span>
        ),
      sortValue: (r) => r.conversao,
    },
    {
      key: "margem",
      header: "Margem",
      align: "right",
      width: "100px",
      cell: (r) => (
        <Badge tone={r.margem >= 30 ? "up" : r.margem >= 22 ? "neutral" : "warn"}>
          <span className="num">{pct(r.margem)}</span>
        </Badge>
      ),
      sortValue: (r) => r.margem,
    },
    {
      key: "tendencia",
      header: "Tendência",
      align: "right",
      width: "90px",
      cell: (r) => (
        <span className="inline-block w-16 h-6 align-middle">
          <Sparkline data={r.spark} tone={r.delta >= 0 ? "up" : "down"} />
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Vendas por canal"
        breadcrumb="Vendas"
        description="Comparativo de desempenho entre canais"
        actions={
          <>
            <Button size="sm" className="hidden sm:inline-flex">
              <CalendarDays className="w-3.5 h-3.5" />
              1 – 24 ago 2026
            </Button>
            <Button
              size="sm"
              className="sm:hidden"
              onClick={() => setFiltrosAbertos(true)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filtros
              {ocultos.length > 0 && (
                <span className="num text-[11px]">({ocultos.length})</span>
              )}
            </Button>
            <Button size="sm" variant="primary">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </>
        }
        filters={
          <>
            <div className="flex items-center gap-1 p-0.5 rounded-r1 bg-panel-3 border border-line shrink-0">
              {PERIODOS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={
                    "h-6 px-2.5 rounded-[4px] text-[12px] font-medium transition-colors whitespace-nowrap " +
                    (periodo === p
                      ? "bg-panel text-ink shadow-[var(--sh-1)]"
                      : "text-ink-3 hover:text-ink")
                  }
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="hidden sm:flex items-center gap-1.5">
              {CANAIS.map((c) => {
                const off = ocultos.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => alternar(c.id)}
                    className={
                      "flex items-center gap-1.5 h-6 px-2 rounded-r1 border text-[12px] font-medium transition-colors whitespace-nowrap " +
                      (off
                        ? "border-line text-ink-3 hover:text-ink-2"
                        : "border-line-2 text-ink bg-panel")
                    }
                  >
                    <span
                      className="w-2 h-2 rounded-[2px] shrink-0"
                      style={{
                        background: off ? "var(--line-2)" : CANAL_CORES[c.id],
                      }}
                    />
                    {c.nome}
                  </button>
                );
              })}
            </div>
          </>
        }
      />

      <PageBody>
        {/* cartão por canal */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {visiveis.map((c) => (
            <div key={c.id} className="panel panel-1 px-4 py-3">
              <span className="flex items-center gap-1.5 mb-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-[2px] shrink-0"
                  style={{ background: CANAL_CORES[c.id] }}
                />
                <span className="text-[12px] font-medium text-ink-2 truncate">
                  {c.nome}
                </span>
              </span>
              <p className="num text-[18px] font-semibold text-ink leading-none">
                {money(c.faturamento)}
              </p>
              <div className="mt-2">
                <Delta value={c.delta} />
              </div>
              <div className="mt-3 pt-2.5 border-t border-line grid grid-cols-2 gap-y-1.5">
                <span className="text-[10px] uppercase tracking-[0.04em] font-semibold text-ink-3">
                  Pedidos
                </span>
                <span className="num text-[12px] text-ink text-right">
                  {count(c.pedidos)}
                </span>
                <span className="text-[10px] uppercase tracking-[0.04em] font-semibold text-ink-3">
                  Ticket
                </span>
                <span className="num text-[12px] text-ink text-right">
                  {money(c.ticket)}
                </span>
                <span className="text-[10px] uppercase tracking-[0.04em] font-semibold text-ink-3">
                  Margem
                </span>
                <span className="num text-[12px] text-ink text-right">
                  {pct(c.margem)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* evolução */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Evolução por canal"
            hint="12 semanas · milhares de reais"
            action={
              <span className="num text-[12px] text-ink-2 hidden sm:block">
                {money(total)}
              </span>
            }
          />
          <div className="h-[280px] px-2 pt-3 pb-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={CANAIS_12_SEMANAS}
                margin={{ top: 4, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid {...GRID} />
                <XAxis dataKey="semana" {...AXIS} minTickGap={8} />
                <YAxis {...AXIS} width={40} />
                <Tooltip
                  cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }}
                  content={<ChartTooltip formatter={(v) => `${v} mil`} />}
                />
                {visiveis.map((c) => (
                  <Line
                    key={c.id}
                    type="monotone"
                    dataKey={c.id}
                    name={CANAL_NOMES[c.id]}
                    stroke={CANAL_CORES[c.id]}
                    strokeWidth={1.75}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="px-4 py-3 border-t border-line">
            <Legend
              items={visiveis.map((c) => ({
                label: c.nome,
                color: CANAL_CORES[c.id],
              }))}
            />
          </div>
        </Panel>

        {/* tabela comparativa */}
        <Panel className="overflow-hidden">
          <PanelHeader title="Comparativo" hint="clique no cabeçalho para ordenar" />
          <DataTable
            columns={colunas}
            rows={visiveis}
            rowKey={(r) => r.id}
            defaultSort={{ key: "faturamento", dir: "desc" }}
          />
        </Panel>
      </PageBody>

      {/* folha de filtros — mobile */}
      {filtrosAbertos && (
        <div className="sm:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0"
            style={{ background: "var(--veil)" }}
            onClick={() => setFiltrosAbertos(false)}
          />
          <div className="absolute inset-x-0 bottom-0 bg-panel rounded-t-r3 border-t border-line">
            <div className="flex items-center justify-between px-4 h-12 border-b border-line">
              <span className="text-[13px] font-semibold text-ink">Canais</span>
              <button
                onClick={() => setFiltrosAbertos(false)}
                className="w-8 h-8 -mr-2 flex items-center justify-center text-ink-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="divide-y divide-line">
              {CANAIS.map((c) => {
                const on = !ocultos.includes(c.id);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => alternar(c.id)}
                      className="w-full h-12 px-4 flex items-center gap-3 active:bg-panel-3"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                        style={{ background: CANAL_CORES[c.id] }}
                      />
                      <span className="flex-1 text-left text-[13px] text-ink">
                        {c.nome}
                      </span>
                      <span
                        className={
                          "w-9 h-5 rounded-full transition-colors relative shrink-0 " +
                          (on ? "bg-brand" : "bg-line-2")
                        }
                      >
                        <span
                          className={
                            "absolute top-0.5 w-4 h-4 rounded-full bg-panel transition-all " +
                            (on ? "left-[18px]" : "left-0.5")
                          }
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div
              className="p-4"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              <Button
                variant="primary"
                className="w-full h-10"
                onClick={() => setFiltrosAbertos(false)}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
