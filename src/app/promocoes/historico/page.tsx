"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import {
  Button,
  Panel,
  PanelHeader,
  Badge,
  EmptyState,
} from "@/components/ui/primitives";
import { Segmented, Select, Field, FilterSheet } from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  HISTORICO,
  CAMPANHAS_PROMO,
  type RegistroPromocao,
} from "@/mock/promocoes";
import { money, count, pct } from "@/lib/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Search, Download, X, SearchX, SlidersHorizontal } from "lucide-react";

const STATUS = [
  { value: "Todos", label: "Todos" },
  { value: "Aprovado", label: "Aprovados" },
  { value: "Reprovado", label: "Reprovados" },
] as const;

type StatusFiltro = (typeof STATUS)[number]["value"];

/** dd/mm a partir do ISO, sem depender de fuso. */
function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default function HistoricoPromocoes() {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<StatusFiltro>("Todos");
  const [campanha, setCampanha] = React.useState("Todas");
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return HISTORICO.filter((r) => {
      if (status !== "Todos" && r.statusAprovacao !== status) return false;
      if (campanha !== "Todas" && r.campanhaId !== campanha) return false;
      if (!q) return true;
      return (
        r.mlb.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.titulo.toLowerCase().includes(q)
      );
    });
  }, [busca, status, campanha]);

  const resumo = React.useMemo(() => {
    const aprovados = filtrados.filter(
      (r) => r.statusAprovacao === "Aprovado"
    ).length;
    const descontoMedio = filtrados.length
      ? filtrados.reduce((s, r) => s + r.desconto, 0) / filtrados.length
      : 0;
    const comBase = filtrados.filter((r) => r.margem > 0);
    return {
      total: filtrados.length,
      aprovados,
      reprovados: filtrados.length - aprovados,
      descontoMedio,
      margemMedia: comBase.length
        ? comBase.reduce((s, r) => s + r.margem, 0) / comBase.length
        : 0,
    };
  }, [filtrados]);

  const rosca = [
    { nome: "Aprovados", valor: resumo.aprovados, cor: "var(--up)" },
    { nome: "Reprovados", valor: resumo.reprovados, cor: "var(--down)" },
  ].filter((d) => d.valor > 0);

  const porCampanha = React.useMemo(
    () =>
      CAMPANHAS_PROMO.map((c) => {
        const linhas = filtrados.filter((r) => r.campanhaId === c.id);
        return {
          campanha: c.curto,
          aprovados: linhas.filter((r) => r.statusAprovacao === "Aprovado").length,
          reprovados: linhas.filter((r) => r.statusAprovacao === "Reprovado").length,
        };
      }).filter((d) => d.aprovados + d.reprovados > 0),
    [filtrados]
  );

  const filtrosAtivos =
    (status !== "Todos" ? 1 : 0) + (campanha !== "Todas" ? 1 : 0);

  function limpar() {
    setBusca("");
    setStatus("Todos");
    setCampanha("Todas");
  }

  const colunas: Column<RegistroPromocao>[] = [
    {
      key: "data",
      header: "Processado",
      mobile: "subtitle",
      width: "120px",
      sortValue: (r) => `${r.dataProcessamento} ${r.hora}`,
      cell: (r) => (
        <span className="num text-ink-2 whitespace-nowrap">
          {dataCurta(r.dataProcessamento)} {r.hora}
        </span>
      ),
    },
    {
      key: "titulo",
      header: "Anúncio",
      mobile: "title",
      sticky: true,
      width: "280px",
      sortValue: (r) => r.titulo,
      cell: (r) => (
        <span className="min-w-0 block">
          <span className="font-medium text-ink truncate max-w-[240px] block">
            {r.titulo}
          </span>
          <span className="num block text-[11px] text-ink-3 mt-0.5">
            {r.mlb} · {r.sku}
          </span>
        </span>
      ),
    },
    {
      key: "campanha",
      header: "Campanha",
      width: "210px",
      sortValue: (r) => r.campanha,
      cell: (r) => (
        <span className="text-ink-2 truncate block max-w-[190px]">{r.campanha}</span>
      ),
    },
    {
      key: "precoTabela",
      header: "Preço de tabela",
      align: "right",
      width: "140px",
      sortValue: (r) => r.precoTabela,
      cell: (r) =>
        r.precoTabela > 0 ? (
          <span className="num">{money(r.precoTabela)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "precoOferta",
      header: "Preço da oferta",
      align: "right",
      mobile: "metric",
      width: "140px",
      sortValue: (r) => r.precoOferta,
      cell: (r) => (
        <span className="num font-semibold text-ink">{money(r.precoOferta)}</span>
      ),
    },
    {
      key: "desconto",
      header: "Desconto",
      align: "right",
      mobile: "metric",
      width: "100px",
      sortValue: (r) => r.desconto,
      cell: (r) => <span className="num text-ink-2">{pct(r.desconto)}</span>,
    },
    {
      key: "reducaoTarifa",
      header: "Redução de tarifa",
      align: "right",
      width: "150px",
      sortValue: (r) => r.reducaoTarifa ?? -1,
      cell: (r) =>
        r.reducaoTarifa === null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <Badge tone="info">
            <span className="num">−{pct(r.reducaoTarifa)}</span>
          </Badge>
        ),
    },
    {
      key: "status",
      header: "Status",
      mobile: "metric",
      width: "130px",
      sortValue: (r) => r.statusAprovacao,
      cell: (r) => (
        <Badge tone={r.statusAprovacao === "Aprovado" ? "up" : "down"}>
          {r.statusAprovacao}
        </Badge>
      ),
    },
    {
      key: "motivo",
      header: "Motivo",
      width: "220px",
      cell: (r) =>
        r.motivo ? (
          <span className="text-[12px] text-ink-3 truncate block max-w-[200px]">
            {r.motivo}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Histórico de promoções"
        breadcrumb="Promoções"
        description="Toda decisão já processada, com o motivo de cada reprovação"
        actions={
          <>
            <Button
              size="sm"
              className="md:hidden"
              onClick={() => setFiltrosAbertos(true)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filtros
              {filtrosAtivos > 0 && (
                <span className="num text-[11px]">({filtrosAtivos})</span>
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
            <div className="relative shrink-0 w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Título, SKU ou MLB"
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

            <div className="hidden md:flex items-center gap-2">
              <Segmented<StatusFiltro>
                options={STATUS}
                value={status}
                onChange={setStatus}
              />
              <Select
                value={campanha}
                onChange={(e) => setCampanha(e.target.value)}
                className="w-64"
              >
                <option value="Todas">Todas as campanhas</option>
                {CAMPANHAS_PROMO.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </div>

            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {filtrados.length} de {HISTORICO.length}
            </span>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Registros" value={count(resumo.total)} hint="no filtro atual" />
          <StatTile
            label="Aprovados"
            value={count(resumo.aprovados)}
            hint={
              resumo.total
                ? pct((resumo.aprovados / resumo.total) * 100)
                : "—"
            }
          />
          <StatTile label="Desconto médio" value={pct(resumo.descontoMedio)} />
          <StatTile
            label="Margem média"
            value={resumo.margemMedia > 0 ? pct(resumo.margemMedia) : "—"}
            hint="itens com base de custo"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <Panel className="overflow-hidden">
            <PanelHeader title="Aprovação" hint="no filtro atual" />
            {rosca.length > 0 ? (
              <>
                <div className="h-[200px] pt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={rosca}
                        dataKey="valor"
                        nameKey="nome"
                        innerRadius={52}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke="var(--panel)"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {rosca.map((d) => (
                          <Cell key={d.nome} fill={d.cor} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={<ChartTooltip formatter={(v) => count(v)} />}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="px-4 py-3 border-t border-line">
                  <Legend
                    items={rosca.map((d) => ({ label: d.nome, color: d.cor }))}
                  />
                </div>
              </>
            ) : (
              <EmptyState title="Sem registros no filtro" />
            )}
          </Panel>

          <Panel className="xl:col-span-2 overflow-hidden">
            <PanelHeader title="Por campanha" hint="aprovados e reprovados" />
            <div className="h-[236px] px-2 pt-3 pb-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={porCampanha}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="campanha" {...AXIS} interval={0} />
                  <YAxis {...AXIS} width={34} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "var(--panel-3)" }}
                    content={<ChartTooltip formatter={(v) => count(v)} />}
                  />
                  <Bar
                    dataKey="aprovados"
                    name="Aprovados"
                    stackId="s"
                    fill="var(--up)"
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="reprovados"
                    name="Reprovados"
                    stackId="s"
                    fill="var(--down)"
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="px-4 py-3 border-t border-line">
              <Legend
                items={[
                  { label: "Aprovados", color: "var(--up)" },
                  { label: "Reprovados", color: "var(--down)" },
                ]}
              />
            </div>
          </Panel>
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Registros"
            hint="clique no cabeçalho para ordenar"
            action={
              <span className="num text-[12px] text-ink-3 md:hidden">
                {filtrados.length}
              </span>
            }
          />
          <DataTable
            columns={colunas}
            rows={filtrados}
            rowKey={(r) => r.id}
            defaultSort={{ key: "data", dir: "desc" }}
            empty={
              <EmptyState
                icon={SearchX}
                title="Nenhum registro encontrado"
                description="Ajuste a busca ou limpe os filtros de status e campanha."
                action={
                  <Button size="sm" onClick={limpar}>
                    Limpar filtros
                  </Button>
                }
              />
            }
          />
        </Panel>
      </PageBody>

      {filtrosAbertos && (
        <FilterSheet
          onClose={() => setFiltrosAbertos(false)}
          onClear={limpar}
          applyLabel={`Ver ${filtrados.length} registros`}
        >
          <div>
            <p className="label mb-2">Status</p>
            <div className="flex gap-2">
              {STATUS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={
                    "flex-1 h-11 rounded-r1 border text-[13px] font-medium transition-colors " +
                    (status === s.value
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Campanha">
            <Select
              value={campanha}
              onChange={(e) => setCampanha(e.target.value)}
              className="h-11"
            >
              <option value="Todas">Todas as campanhas</option>
              {CAMPANHAS_PROMO.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Field>
        </FilterSheet>
      )}
    </>
  );
}
