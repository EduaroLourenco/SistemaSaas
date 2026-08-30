"use client";

import * as React from "react";
import {
  PageHeader,
  PageBody,
} from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Delta } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import { type Anuncio } from "@/mock";
import type { DadosPainel } from "@/lib/dados/painel";
import { recortar } from "@/lib/periodo";
import { FilaRecomendacoes } from "@/components/painel/fila-recomendacoes";
import { PainelExclusoes } from "@/components/ui/exclusoes";
import { SkusEmQueda } from "@/components/painel/skus-em-queda";
import { money, moneyShort, count, pct, shortDate } from "@/lib/format";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, CalendarDays } from "lucide-react";

const PERIODOS = ["7 dias", "30 dias", "90 dias", "Ano"];

function formatKpi(v: number, f: "money" | "count" | "pct") {
  if (f === "money") return money(v);
  if (f === "pct") return pct(v);
  return count(v);
}

export default function VisaoGeral({ dados }: { dados: DadosPainel }) {
  const [periodo, setPeriodo] = React.useState("30 dias");

  const {
    canaisSemanas: CANAIS_12_SEMANAS,
    canalCores: CANAL_CORES,
    canalNomes: CANAL_NOMES,
    anuncios: ANUNCIOS,
  } = dados;

  /*
   * KPIs, canais e a curva de faturamento saem do período escolhido. Antes
   * vinham prontos numa janela fixa de 30 dias, e o seletor só pintava o
   * botão — clicar em "Ano" mudava a cor e não o número.
   */
  const recorte = React.useMemo(
    () => recortar(dados.linhas, dados.canaisInfo, periodo),
    [dados.linhas, dados.canaisInfo, periodo]
  );
  const KPIS = recorte.kpis;
  const CANAIS = recorte.canais;
  const FATURAMENTO_30D = recorte.faturamento;

  /*
   * Quais canais empilhar no gráfico: sai do próprio dado, e não de uma
   * lista fixa. Com lista fixa, um canal novo entraria no banco e sumiria
   * do gráfico sem ninguém perceber — e o total do gráfico deixaria de
   * bater com o total da tabela ao lado.
   */
  const canaisNaSerie = React.useMemo(() => {
    const vistos = new Set<string>();
    for (const semana of CANAIS_12_SEMANAS) {
      for (const k of Object.keys(semana)) if (k !== "semana") vistos.add(k);
    }
    // Menor primeiro: o canal dominante fecha a pilha por cima.
    const soma = (k: string) =>
      CANAIS_12_SEMANAS.reduce((s, w) => s + (Number(w[k]) || 0), 0);
    return [...vistos].sort((a, b) => soma(a) - soma(b));
  }, [CANAIS_12_SEMANAS]);

  const topSkus = React.useMemo(
    () => [...ANUNCIOS].sort((a, b) => b.receita - a.receita).slice(0, 8),
    [ANUNCIOS]
  );

  const colunas: Column<Anuncio>[] = [
    {
      key: "titulo",
      header: "Produto",
      mobile: "title",
      cell: (r) => (
        <span className="font-medium text-ink block truncate max-w-[320px]">
          {r.titulo}
        </span>
      ),
      sortValue: (r) => r.titulo,
    },
    {
      key: "sku",
      header: "SKU",
      mobile: "subtitle",
      cell: (r) => <span className="num text-[12px] text-ink-3">{r.sku}</span>,
      sortValue: (r) => r.sku,
      width: "120px",
    },
    {
      key: "vendas",
      header: "Vendas",
      align: "right",
      mobile: "metric",
      cell: (r) => <span className="num">{count(r.vendas)}</span>,
      sortValue: (r) => r.vendas,
      width: "90px",
    },
    {
      key: "receita",
      header: "Receita",
      align: "right",
      mobile: "metric",
      cell: (r) => (
        <span className="num font-semibold text-ink">{money(r.receita)}</span>
      ),
      sortValue: (r) => r.receita,
      width: "130px",
    },
    {
      key: "conversao",
      header: "Conversão",
      align: "right",
      mobile: "metric",
      cell: (r) => <span className="num">{pct(r.conversao, 2)}</span>,
      sortValue: (r) => r.conversao,
      width: "110px",
    },
  ];

  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Consolidado de todos os canais"
        actions={
          <>
            <Button size="sm">
              <CalendarDays className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{recorte.intervalo}</span>
              <span className="sm:hidden">Período</span>
            </Button>
            <Button size="sm" variant="primary">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </>
        }
        filters={
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
        }
      />

      <PageBody>
        {/* O que mudou e merece decisão — antes dos totais */}
        <FilaRecomendacoes itens={dados.recomendacoes} />

        <PainelExclusoes
          exclusoes={dados.exclusoes}
          canais={dados.canaisDisponiveis}
          removidas={dados.removidas}
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {KPIS.map((k) => (
            <StatTile
              key={k.id}
              label={k.label}
              value={formatKpi(k.value, k.format)}
              delta={k.delta}
              inverse={k.inverse}
              hint={k.hint}
              spark={k.spark}
            />
          ))}
        </div>

        {/* Faturamento diário + participação */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <Panel className="xl:col-span-2 overflow-hidden">
            <PanelHeader
              title="Faturamento por dia"
              hint={`${recorte.dias} dias com movimento`}
              action={
                <span className="num text-[12px] text-ink-2">
                  {money(FATURAMENTO_30D.reduce((s, d) => s + d.faturamento, 0))}
                </span>
              }
            />
            <div className="h-[240px] px-2 pt-3 pb-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={FATURAMENTO_30D}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--s1)" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="var(--s1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis
                    dataKey="data"
                    {...AXIS}
                    tickFormatter={shortDate}
                    minTickGap={24}
                  />
                  <YAxis
                    {...AXIS}
                    width={52}
                    tickFormatter={(v: number) => moneyShort(v)}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }}
                    content={
                      <ChartTooltip formatter={(v) => money(v)} />
                    }
                    labelFormatter={(l) => (typeof l === "string" ? shortDate(l) : l)}
                  />
                  <Area
                    type="monotone"
                    dataKey="faturamento"
                    name="Faturamento"
                    stroke="var(--s1)"
                    strokeWidth={1.75}
                    fill="url(#gFat)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader title="Participação por canal" hint="12 semanas" />
            <div className="h-[196px] px-2 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={CANAIS_12_SEMANAS}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="semana" {...AXIS} minTickGap={12} />
                  <YAxis {...AXIS} width={36} />
                  <Tooltip
                    cursor={{ fill: "var(--panel-3)" }}
                    content={<ChartTooltip formatter={(v) => `${v} mil`} />}
                  />
                  {canaisNaSerie.map((k) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      name={CANAL_NOMES[k]}
                      stackId="c"
                      fill={CANAL_CORES[k]}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="px-4 py-3 border-t border-line">
              <Legend
                items={CANAIS.map((c) => ({
                  label: c.nome,
                  color: CANAL_CORES[c.id],
                }))}
              />
            </div>
          </Panel>
        </div>

        {/* Top SKUs — os alertas migraram para o painel "Desde ontem" */}
        <div className="grid grid-cols-1 gap-3">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Produtos com maior receita"
              hint="no período"
              action={
                <Button size="sm" variant="ghost">
                  Ver todos
                </Button>
              }
            />
            <DataTable
              columns={colunas}
              rows={topSkus}
              rowKey={(r) => r.mlb}
              defaultSort={{ key: "receita", dir: "desc" }}
            />
          </Panel>
        </div>

        {/* Resumo dos canais */}
        <Panel className="overflow-hidden">
          <PanelHeader title="Canais" hint="faturamento e variação no período" />
          <div className="grid grid-cols-2 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-line">
            {CANAIS.map((c) => (
              <div key={c.id} className="px-4 py-3.5">
                <span className="flex items-center gap-1.5 mb-2">
                  <span
                    className="w-2 h-2 rounded-[2px] shrink-0"
                    style={{ background: CANAL_CORES[c.id] }}
                  />
                  <span className="text-[12px] font-medium text-ink-2 truncate">
                    {c.nome}
                  </span>
                </span>
                <p className="num text-[17px] font-semibold text-ink leading-none">
                  {money(c.faturamento)}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Delta value={c.delta} />
                  <span className="num text-[11px] text-ink-3">
                    {pct(c.participacao)} do total
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        {/*
          Quedas por SKU no fim: os totais dizem QUANTO, esta seção diz
          ONDE. Vem depois porque só faz sentido depois de saber que caiu.
        */}
        <SkusEmQueda itens={dados.quedas} />
      </PageBody>
    </>
  );
}
