"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Delta, Badge } from "@/components/ui/primitives";
import { Sparkline } from "@/components/ui/stat-tile";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import { type Canal } from "@/mock";
import type { DadosCanais } from "@/lib/dados/vendas";
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

/** Quantos dias com movimento cada opção do seletor cobre. */
const DIAS_DO_PERIODO: Record<string, number> = {
  "7 dias": 7,
  "30 dias": 30,
  "90 dias": 90,
  Ano: 366,
};

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default function VendasPorCanal({ dados }: { dados: DadosCanais }) {
  const [periodo, setPeriodo] = React.useState("30 dias");

  const CANAL_CORES = React.useMemo(
    () => Object.fromEntries(dados.canais.map((c) => [c.id, c.cor])),
    [dados.canais]
  );
  const CANAL_NOMES = React.useMemo(
    () => Object.fromEntries(dados.canais.map((c) => [c.id, c.nome])),
    [dados.canais]
  );

  /*
   * O recorte é por DIAS COM MOVIMENTO, não por data de calendário. A
   * planilha tem lacunas; contar o calendário faria "7 dias" cair numa
   * faixa com três dias preenchidos e ler queda onde só falta dado.
   */
  const { CANAIS, intervalo } = React.useMemo(() => {
    const datas = [...new Set(dados.linhas.map((l) => l.data))].sort();
    const janela = new Set(datas.slice(-(DIAS_DO_PERIODO[periodo] ?? 30)));
    const anteriores = DIAS_DO_PERIODO[periodo] ?? 30;
    const base = new Set(datas.slice(-anteriores * 2, -anteriores));

    const agr = new Map<
      string,
      { rec: number; ped: number; vis: number; ant: number; pedComVis: number }
    >();
    for (const l of dados.linhas) {
      const g = agr.get(l.canalId) ?? { rec: 0, ped: 0, vis: 0, ant: 0, pedComVis: 0 };
      if (janela.has(l.data)) {
        g.rec += l.receita;
        g.ped += l.pedidos;
        g.vis += l.visitas;
        // Só pedido com visita registrada entra na conversão: sem isso, dia
        // vindo da listagem de pedidos (que não tem visitas) infla a conta.
        if (l.visitas > 0) g.pedComVis += l.pedidos;
      } else if (base.has(l.data)) {
        g.ant += l.receita;
      }
      agr.set(l.canalId, g);
    }

    const totalRec = [...agr.values()].reduce((s, g) => s + g.rec, 0);
    const ordenadas = [...janela].sort();

    const lista: Canal[] = dados.canais
      .map((c) => {
        const g = agr.get(c.id) ?? { rec: 0, ped: 0, vis: 0, ant: 0, pedComVis: 0 };
        return {
          id: c.id,
          nome: c.nome,
          faturamento: g.rec,
          pedidos: g.ped,
          ticket: g.ped ? g.rec / g.ped : 0,
          conversao: g.vis ? (g.pedComVis * 100) / g.vis : 0,
          // A planilha não traz custo por canal, então margem não existe.
          margem: 0,
          delta: g.ant ? ((g.rec - g.ant) / g.ant) * 100 : 0,
          participacao: totalRec ? (g.rec * 100) / totalRec : 0,
          spark: ordenadas.slice(-12).map((d) =>
            Math.round(
              dados.linhas
                .filter((l) => l.data === d && l.canalId === c.id)
                .reduce((s, l) => s + l.receita, 0) / 1000
            )
          ),
        };
      })
      .filter((c) => c.faturamento > 0 || c.pedidos > 0)
      .sort((a, b) => b.faturamento - a.faturamento);

    return {
      CANAIS: lista,
      intervalo: ordenadas.length
        ? `${dm(ordenadas[0])} – ${dm(ordenadas[ordenadas.length - 1])}`
        : "sem dados",
    };
  }, [dados, periodo]);

  const CANAIS_12_SEMANAS = React.useMemo(() => {
    const porSemana = new Map<string, Record<string, number>>();
    for (const l of dados.linhas) {
      const d = new Date(`${l.data}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
      const ano = d.getUTCFullYear();
      const q = new Date(Date.UTC(ano, 0, 4));
      q.setUTCDate(q.getUTCDate() - ((q.getUTCDay() + 6) % 7) + 3);
      const s = `S${1 + Math.round((d.getTime() - q.getTime()) / (7 * 86400000))}`;
      const linha = porSemana.get(s) ?? {};
      linha[l.canalId] = (linha[l.canalId] ?? 0) + l.receita / 1000;
      porSemana.set(s, linha);
    }
    return [...porSemana.entries()]
      .sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)))
      .slice(-12)
      .map(([semana, v]) => {
        const o: Record<string, string | number> = { semana };
        for (const [k, val] of Object.entries(v)) o[k] = Math.round(val);
        return o;
      });
  }, [dados.linhas]);

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
              {intervalo}
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
