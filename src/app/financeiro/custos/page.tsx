"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Delta } from "@/components/ui/primitives";
import { Segmented, Progress } from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CUSTOS as __CUSTOS,
  CUSTO_TOTAL as __CUSTO_TOTAL,
  CUSTOS_12_MESES as __CUSTOS_12_MESES,
  FLUXO_12_MESES as __FLUXO_12_MESES,
  type Custo,
} from "@/mock/financeiro";
import { money, moneyShort, pct } from "@/lib/format";
import { Download } from "lucide-react";

import { zerar } from "@/mock/zerar";

/*
 * Esta tela ainda não tem fonte de dados. Os números vêm zerados de
 * propósito: com a maior parte da plataforma já lendo o banco, número
 * de exemplo com cara de real é pior que campo vazio — não há como
 * saber, olhando, se aquilo é a operação ou é enfeite.
 *
 * A estrutura fica — rótulos, canais, colunas — para mostrar o que a
 * tela vai exibir quando o dado chegar.
 */
const CUSTOS = zerar(__CUSTOS);
const CUSTO_TOTAL = zerar(__CUSTO_TOTAL);
const CUSTOS_12_MESES = zerar(__CUSTOS_12_MESES);
const FLUXO_12_MESES = zerar(__FLUXO_12_MESES);


const UNIDADES = [
  { value: "reais", label: "R$" },
  { value: "percentual", label: "% da receita" },
] as const;

type Unidade = (typeof UNIDADES)[number]["value"];

export default function Custos() {
  const [unidade, setUnidade] = React.useState<Unidade>("reais");

  const receitaMes = FLUXO_12_MESES[FLUXO_12_MESES.length - 1].entradas;
  const maiorCusto = Math.max(...CUSTOS.map((c) => c.valor));

  const formatar = (v: number) =>
    unidade === "reais" ? money(v) : pct((v / receitaMes) * 100);

  const colunas: Column<Custo>[] = [
    {
      key: "categoria",
      header: "Categoria",
      mobile: "title",
      sticky: true,
      width: "230px",
      sortValue: (c) => c.categoria,
      cell: (c) => (
        <span className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-[2px] shrink-0"
            style={{ background: c.cor }}
          />
          <span className="font-medium text-ink truncate">{c.categoria}</span>
        </span>
      ),
    },
    {
      key: "grupo",
      header: "Grupo",
      mobile: "subtitle",
      width: "130px",
      sortValue: (c) => c.grupo,
      cell: (c) => <span className="text-ink-2">{c.grupo}</span>,
    },
    {
      key: "valor",
      header: unidade === "reais" ? "Valor no mês" : "% da receita",
      align: "right",
      mobile: "metric",
      width: "150px",
      sortValue: (c) => c.valor,
      cell: (c) => (
        <span className="num font-semibold text-ink">{formatar(c.valor)}</span>
      ),
    },
    {
      key: "anterior",
      header: "Mês anterior",
      align: "right",
      width: "140px",
      sortValue: (c) => c.anterior,
      cell: (c) => <span className="num text-ink-3">{formatar(c.anterior)}</span>,
    },
    {
      key: "variacao",
      header: "Variação",
      align: "right",
      mobile: "metric",
      width: "110px",
      sortValue: (c) => c.variacao,
      // inverse: custo caindo é bom
      cell: (c) => <Delta value={c.variacao} inverse />,
    },
    {
      key: "pctReceita",
      header: "% da receita",
      align: "right",
      mobile: "metric",
      width: "120px",
      sortValue: (c) => c.pctReceita,
      cell: (c) => <span className="num text-ink-2">{pct(c.pctReceita)}</span>,
    },
    {
      key: "participacao",
      header: "Participação nos custos",
      align: "right",
      width: "200px",
      sortValue: (c) => c.valor,
      cell: (c) => (
        <span className="flex items-center justify-end gap-2">
          <Progress
            className="hidden lg:block w-24"
            value={(c.valor / maiorCusto) * 100}
            tone="brand"
          />
          <span className="num text-ink-2">
            {pct((c.valor / CUSTO_TOTAL) * 100)}
          </span>
        </span>
      ),
    },
  ];

  const custoSobreReceita = (CUSTO_TOTAL / receitaMes) * 100;
  const maiorAlta = [...CUSTOS].sort((a, b) => b.variacao - a.variacao)[0];

  return (
    <>
      <PageHeader
        title="Custos"
        breadcrumb="Financeiro"
        description="Agosto de 2026 · o que consome a receita"
        actions={
          <Button size="sm" variant="primary">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
        }
        filters={
          <Segmented<Unidade>
            options={UNIDADES}
            value={unidade}
            onChange={setUnidade}
          />
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Custo total"
            value={money(CUSTO_TOTAL)}
            delta={4.2}
            inverse
            hint="vs. mês anterior"
          />
          <StatTile
            label="Custo sobre receita"
            value={pct(custoSobreReceita)}
            delta={1.1}
            inverse
          />
          <StatTile
            label="Maior categoria"
            value={money(CUSTOS[0].valor)}
            hint={CUSTOS[0].categoria}
          />
          <StatTile
            label="Maior alta"
            value={pct(maiorAlta.variacao)}
            delta={maiorAlta.variacao}
            inverse
            hint={maiorAlta.categoria}
          />
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Evolução dos custos"
            hint="12 meses, empilhado por categoria"
          />
          <div className="h-[300px] px-2 pt-3 pb-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={CUSTOS_12_MESES}
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
                  cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }}
                  content={<ChartTooltip formatter={(v) => money(v)} />}
                />
                {[...CUSTOS].reverse().map((c) => (
                  <Area
                    key={c.id}
                    type="monotone"
                    dataKey={c.id}
                    name={c.categoria}
                    stackId="c"
                    stroke={c.cor}
                    fill={c.cor}
                    fillOpacity={0.85}
                    strokeWidth={0}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="px-4 py-3 border-t border-line">
            <Legend
              items={CUSTOS.map((c) => ({ label: c.categoria, color: c.cor }))}
            />
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Categorias"
            hint="clique no cabeçalho para ordenar"
            action={
              <span className="num text-[12px] text-ink-2 hidden sm:block">
                {money(CUSTO_TOTAL)}
              </span>
            }
          />
          <DataTable
            columns={colunas}
            rows={CUSTOS}
            rowKey={(c) => c.id}
            defaultSort={{ key: "valor", dir: "desc" }}
          />
          <div className="hidden md:flex items-center justify-between gap-3 px-3 h-10 border-t border-line bg-panel-2">
            <span className="text-[12px] font-semibold text-ink">Total</span>
            <span className="num text-[13px] font-semibold text-ink">
              {unidade === "reais" ? money(CUSTO_TOTAL) : pct(custoSobreReceita)}
            </span>
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
