"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, EmptyState } from "@/components/ui/primitives";
import { Select, Field, FilterSheet } from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import { ChartTooltip, AXIS, GRID } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FUNCIONARIOS,
  SETORES,
  FOLHA_POR_SETOR,
  RESUMO_FOLHA,
  type Funcionario,
} from "@/mock/financeiro";
import { money, moneyShort, count, pct } from "@/lib/format";
import { Download, Search, X, SearchX, SlidersHorizontal } from "lucide-react";

/** dd/mm/aaaa a partir do ISO. */
function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function Folha() {
  const [busca, setBusca] = React.useState("");
  const [setor, setSetor] = React.useState("Todos");
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return FUNCIONARIOS.filter((f) => {
      if (setor !== "Todos" && f.setor !== setor) return false;
      if (!q) return true;
      return (
        f.nome.toLowerCase().includes(q) ||
        f.cargo.toLowerCase().includes(q) ||
        f.setor.toLowerCase().includes(q)
      );
    });
  }, [busca, setor]);

  const totalFiltro = React.useMemo(
    () => ({
      salarios: filtrados.reduce((s, f) => s + f.salarioBase, 0),
      beneficios: filtrados.reduce((s, f) => s + f.beneficios, 0),
      encargos: filtrados.reduce((s, f) => s + f.encargos, 0),
      custo: filtrados.reduce((s, f) => s + f.custoTotal, 0),
    }),
    [filtrados]
  );

  const colunas: Column<Funcionario>[] = [
    {
      key: "nome",
      header: "Colaborador",
      mobile: "title",
      sticky: true,
      width: "220px",
      sortValue: (f) => f.nome,
      cell: (f) => <span className="font-medium text-ink truncate">{f.nome}</span>,
    },
    {
      key: "cargo",
      header: "Cargo",
      mobile: "subtitle",
      width: "200px",
      sortValue: (f) => f.cargo,
      cell: (f) => <span className="text-ink-2 truncate">{f.cargo}</span>,
    },
    {
      key: "setor",
      header: "Setor",
      width: "130px",
      sortValue: (f) => f.setor,
      cell: (f) => <span className="text-ink-2">{f.setor}</span>,
    },
    {
      key: "admissao",
      header: "Admissão",
      align: "right",
      width: "120px",
      sortValue: (f) => f.admissao,
      cell: (f) => <span className="num text-ink-3">{dataBr(f.admissao)}</span>,
    },
    {
      key: "salarioBase",
      header: "Salário base",
      align: "right",
      mobile: "metric",
      width: "130px",
      sortValue: (f) => f.salarioBase,
      cell: (f) => <span className="num">{money(f.salarioBase)}</span>,
    },
    {
      key: "beneficios",
      header: "Benefícios",
      align: "right",
      width: "120px",
      sortValue: (f) => f.beneficios,
      cell: (f) => <span className="num text-ink-2">{money(f.beneficios)}</span>,
    },
    {
      key: "encargos",
      header: "Encargos",
      align: "right",
      mobile: "metric",
      width: "120px",
      sortValue: (f) => f.encargos,
      cell: (f) => <span className="num text-ink-2">{money(f.encargos)}</span>,
    },
    {
      key: "custoTotal",
      header: "Custo total",
      align: "right",
      mobile: "metric",
      width: "140px",
      sortValue: (f) => f.custoTotal,
      cell: (f) => (
        <span className="num font-semibold text-ink">{money(f.custoTotal)}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Folha de pagamento"
        breadcrumb="Financeiro"
        description="Competência de agosto de 2026 · custo com encargos e benefícios"
        actions={
          <>
            <Button
              size="sm"
              className="md:hidden"
              onClick={() => setFiltrosAbertos(true)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filtros
              {setor !== "Todos" && <span className="num text-[11px]">(1)</span>}
            </Button>
            <Button size="sm" variant="primary">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </>
        }
        filters={
          <>
            <div className="relative shrink-0 w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome, cargo ou setor"
                className="w-full h-7 pl-8 pr-7 rounded-r1 border border-line bg-panel text-[12px] text-ink placeholder:text-ink-3 focus:border-brand transition-colors"
              />
              {busca && (
                <button
                  onClick={() => setBusca("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-ink-3 hover:text-ink"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <Select
              value={setor}
              onChange={(e) => setSetor(e.target.value)}
              className="w-44 hidden md:block"
            >
              <option value="Todos">Todos os setores</option>
              {SETORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>

            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {filtrados.length} de {FUNCIONARIOS.length}
            </span>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Colaboradores"
            value={count(RESUMO_FOLHA.colaboradores)}
            hint={`${SETORES.length} setores`}
          />
          <StatTile
            label="Custo total da folha"
            value={money(RESUMO_FOLHA.custoTotal)}
            delta={3.4}
            inverse
            hint="vs. mês anterior"
          />
          <StatTile
            label="Custo médio"
            value={money(RESUMO_FOLHA.custoTotal / RESUMO_FOLHA.colaboradores)}
            hint="por colaborador"
          />
          <StatTile
            label="Encargos"
            value={money(RESUMO_FOLHA.encargos)}
            hint={`${pct(
              (RESUMO_FOLHA.encargos / RESUMO_FOLHA.salarios) * 100
            )} sobre os salários`}
          />
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader title="Custo por setor" hint="com encargos e benefícios" />
          <div className="h-[240px] px-2 pt-3 pb-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={FOLHA_POR_SETOR}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid {...GRID} />
                <XAxis
                  dataKey="setor"
                  {...AXIS}
                  interval={0}
                  tick={{ ...AXIS.tick, fontFamily: "var(--f-ui)" }}
                />
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
                  dataKey="custoTotal"
                  name="Custo total"
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                >
                  {FOLHA_POR_SETOR.map((s) => (
                    <Cell key={s.setor} fill={s.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="border-t border-line divide-y divide-line md:grid md:grid-cols-3 md:divide-y-0 md:divide-x">
            {FOLHA_POR_SETOR.map((s) => (
              <li key={s.setor} className="px-4 py-2.5 flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-[2px] shrink-0"
                  style={{ background: s.cor }}
                />
                <span className="text-[12px] text-ink-2 truncate flex-1">
                  {s.setor}
                </span>
                <span className="num text-[11px] text-ink-3">
                  {s.colaboradores}
                </span>
                <span className="num text-[12px] text-ink font-medium">
                  {money(s.custoTotal)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Colaboradores"
            hint="clique no cabeçalho para ordenar"
          />
          <DataTable
            columns={colunas}
            rows={filtrados}
            rowKey={(f) => f.id}
            defaultSort={{ key: "custoTotal", dir: "desc" }}
            empty={
              <EmptyState
                icon={SearchX}
                title="Nenhum colaborador encontrado"
                description="Ajuste a busca ou troque o setor."
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setBusca("");
                      setSetor("Todos");
                    }}
                  >
                    Limpar filtros
                  </Button>
                }
              />
            }
          />
          {filtrados.length > 0 && (
            <div className="hidden md:flex items-center gap-3 px-3 h-10 border-t border-line bg-panel-2">
              <span className="text-[12px] font-semibold text-ink flex-1">
                Total · {filtrados.length} colaboradores
              </span>
              <span className="num text-[12px] text-ink-2 w-[130px] text-right">
                {money(totalFiltro.salarios)}
              </span>
              <span className="num text-[12px] text-ink-2 w-[120px] text-right">
                {money(totalFiltro.beneficios)}
              </span>
              <span className="num text-[12px] text-ink-2 w-[120px] text-right">
                {money(totalFiltro.encargos)}
              </span>
              <span className="num text-[13px] font-semibold text-ink w-[140px] text-right">
                {money(totalFiltro.custo)}
              </span>
            </div>
          )}
        </Panel>
      </PageBody>

      {filtrosAbertos && (
        <FilterSheet
          onClose={() => setFiltrosAbertos(false)}
          onClear={() => {
            setBusca("");
            setSetor("Todos");
          }}
          applyLabel={`Ver ${filtrados.length} colaboradores`}
        >
          <Field label="Setor">
            <Select
              value={setor}
              onChange={(e) => setSetor(e.target.value)}
              className="h-11"
            >
              <option value="Todos">Todos os setores</option>
              {SETORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        </FilterSheet>
      )}
    </>
  );
}
