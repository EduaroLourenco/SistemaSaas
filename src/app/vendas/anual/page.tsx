"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge, Delta } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { Segmented, Progress, Sheet, FilterSheet, KeyValue } from "@/components/ui/controls";
import { AXIS, GRID, ChartTooltip, Legend } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { money, moneyShort, count, pct } from "@/lib/format";
import {
  ANO,
  ANO_ANTERIOR,
  ANUAL_POR_CANAL,
  ANUAL_SERIES,
  CANAIS_ANUAL,
  derivar,
  somar,
  type EscopoAnual,
  type MesAnual,
} from "@/mock/anual";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight, SlidersHorizontal } from "lucide-react";

/* ══ apoio local ═════════════════════════════════════════════ */

const ESCOPOS: { value: EscopoAnual; label: string }[] = [
  { value: "todos", label: "Todos os canais" },
  ...CANAIS_ANUAL.map((c) => ({ value: c.id as EscopoAnual, label: c.nome })),
];

function nomeEscopo(e: EscopoAnual) {
  return ESCOPOS.find((o) => o.value === e)?.label ?? "Todos os canais";
}

/** Faixa de atingimento — a mesma regra em toda a tela. */
function faixaMeta(v: number): "up" | "warn" | "down" {
  if (v >= 100) return "up";
  if (v >= 92) return "warn";
  return "down";
}

const TEXTO_META: Record<"up" | "warn" | "down", string> = {
  up: "text-up",
  warn: "text-warn",
  down: "text-down",
};

/** Variação percentual de um mês para o anterior. */
function variacao(atual: number, anterior: number | undefined) {
  if (anterior === undefined || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

function useEstreito() {
  const [estreito, setEstreito] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const aplicar = () => setEstreito(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);
  return estreito;
}

/* ── coluna da tabela densa (local — precisa de rodapé de total) ── */

type ColunaAnual = {
  key: string;
  header: string;
  width: number;
  cell: (m: MesAnual, i: number) => React.ReactNode;
  total: (t: MesAnual) => React.ReactNode;
};

/* ══ Tela ════════════════════════════════════════════════════ */

export default function VendasAnual() {
  const [escopo, setEscopo] = React.useState<EscopoAnual>("todos");
  const [detalhe, setDetalhe] = React.useState<MesAnual | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  const estreito = useEstreito();

  const serie = ANUAL_SERIES[escopo];
  const total = React.useMemo(() => somar(serie), [serie]);
  const totalD = derivar(total);

  const resumo = React.useMemo(() => {
    const ant = ANO_ANTERIOR[escopo];
    const ticketAnt = ant.pedidos ? ant.receita / ant.pedidos : 0;
    return {
      receita: total.receita,
      pedidos: total.pedidos,
      ticket: totalD.ticket,
      pctMeta: totalD.pctMeta,
      deltaReceita: variacao(total.receita, ant.receita) ?? 0,
      deltaPedidos: variacao(total.pedidos, ant.pedidos) ?? 0,
      deltaTicket: variacao(totalD.ticket, ticketAnt) ?? 0,
    };
  }, [escopo, total, totalD]);

  const dadosGrafico = React.useMemo(() => {
    let accR = 0;
    let accM = 0;
    return serie.map((m) => {
      accR += m.receita;
      accM += m.meta;
      return {
        mes: m.rotulo,
        receita: m.receita,
        meta: m.meta,
        acumulado: accR,
        metaAcumulada: accM,
      };
    });
  }, [serie]);

  const colunas: ColunaAnual[] = [
    {
      key: "receita",
      header: "Receita",
      width: 132,
      cell: (m) => (
        <span className="num font-semibold text-ink">{money(m.receita)}</span>
      ),
      total: (t) => <span className="num">{money(t.receita)}</span>,
    },
    {
      key: "pedidos",
      header: "Pedidos",
      width: 92,
      cell: (m) => <span className="num">{count(m.pedidos)}</span>,
      total: (t) => <span className="num">{count(t.pedidos)}</span>,
    },
    {
      key: "ticket",
      header: "Ticket médio",
      width: 108,
      cell: (m) => <span className="num">{money(derivar(m).ticket)}</span>,
      total: (t) => <span className="num">{money(derivar(t).ticket)}</span>,
    },
    {
      key: "visitas",
      header: "Visitas",
      width: 104,
      cell: (m) => <span className="num">{count(m.visitas)}</span>,
      total: (t) => <span className="num">{count(t.visitas)}</span>,
    },
    {
      key: "conversao",
      header: "Conversão",
      width: 100,
      cell: (m) => <span className="num">{pct(derivar(m).conversao, 2)}</span>,
      total: (t) => <span className="num">{pct(derivar(t).conversao, 2)}</span>,
    },
    {
      key: "ads",
      header: "ADS",
      width: 116,
      cell: (m) => <span className="num">{money(m.ads)}</span>,
      total: (t) => <span className="num">{money(t.ads)}</span>,
    },
    {
      key: "tacos",
      header: "TACOS",
      width: 88,
      cell: (m) => {
        const v = derivar(m).tacos;
        return (
          <span className={cn("num", v > 7 ? "text-warn font-semibold" : "text-ink-2")}>
            {pct(v, 2)}
          </span>
        );
      },
      total: (t) => <span className="num">{pct(derivar(t).tacos, 2)}</span>,
    },
    {
      key: "cancelado",
      header: "Cancelado",
      width: 120,
      cell: (m) => <span className="num">{money(m.valorCancelado)}</span>,
      total: (t) => <span className="num">{money(t.valorCancelado)}</span>,
    },
    {
      key: "pctCancelado",
      header: "Cancel. %",
      width: 96,
      cell: (m) => {
        const v = derivar(m).pctCancelado;
        return (
          <span className={cn("num", v > 6 ? "text-down font-semibold" : "text-ink-2")}>
            {pct(v)}
          </span>
        );
      },
      total: (t) => <span className="num">{pct(derivar(t).pctCancelado)}</span>,
    },
    {
      key: "liquida",
      header: "Receita líquida",
      width: 132,
      cell: (m) => (
        <span className="num text-ink">{money(derivar(m).receitaLiquida)}</span>
      ),
      total: (t) => <span className="num">{money(derivar(t).receitaLiquida)}</span>,
    },
    {
      key: "meta",
      header: "Meta",
      width: 128,
      cell: (m) => <span className="num text-ink-3">{money(m.meta)}</span>,
      total: (t) => <span className="num">{money(t.meta)}</span>,
    },
    {
      key: "pctMeta",
      header: "% da meta",
      width: 128,
      cell: (m) => {
        const v = derivar(m).pctMeta;
        const f = faixaMeta(v);
        return (
          <span className="inline-flex items-center gap-2 justify-end w-full">
            <Progress value={v} tone={f} className="w-12 shrink-0 hidden xl:block" />
            <span className={cn("num font-semibold", TEXTO_META[f])}>{pct(v)}</span>
          </span>
        );
      },
      total: (t) => {
        const v = derivar(t).pctMeta;
        return (
          <span className={cn("num", TEXTO_META[faixaMeta(v)])}>{pct(v)}</span>
        );
      },
    },
    {
      key: "mom",
      header: "Var. mês a mês",
      width: 116,
      cell: (m, i) => {
        const v = variacao(m.receita, serie[i - 1]?.receita);
        return v === null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <Delta value={v} />
        );
      },
      total: () => <span className="text-ink-3">—</span>,
    },
  ];

  const larguraMinima =
    112 + colunas.reduce((s, c) => s + c.width, 0);

  return (
    <>
      <PageHeader
        title="Acompanhamento anual"
        breadcrumb="Vendas"
        description={`${ANO} · ${nomeEscopo(escopo)} · valores em R$ salvo indicação`}
        actions={
          <Button
            size="sm"
            className="md:hidden h-10"
            onClick={() => setFiltrosAbertos(true)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Canal
          </Button>
        }
        filters={
          <>
            <div className="hidden md:block">
              <Segmented<EscopoAnual>
                options={ESCOPOS}
                value={escopo}
                onChange={setEscopo}
              />
            </div>
            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {pct(totalD.pctMeta)} da meta do ano
            </span>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Receita do ano"
            value={moneyShort(resumo.receita)}
            delta={resumo.deltaReceita}
            hint="vs. ano anterior"
            spark={serie.map((m) => m.receita)}
          />
          <StatTile
            label="Pedidos"
            value={count(resumo.pedidos)}
            delta={resumo.deltaPedidos}
            hint="vs. ano anterior"
            spark={serie.map((m) => m.pedidos)}
          />
          <StatTile
            label="Ticket médio"
            value={money(resumo.ticket)}
            delta={resumo.deltaTicket}
            hint="vs. ano anterior"
            spark={serie.map((m) => derivar(m).ticket)}
          />
          <StatTile
            label="Atingimento da meta"
            value={pct(resumo.pctMeta)}
            hint={`${moneyShort(resumo.receita)} de ${moneyShort(total.meta)}`}
          />
        </div>

        {/* ── Realizado vs. meta ─────────────────────────────── */}
        <Panel>
          <PanelHeader
            title="Receita realizada vs. meta"
            hint="barras por mês · linha de acumulado no eixo da direita"
            action={
              <Badge tone={faixaMeta(totalD.pctMeta)}>
                <span className="num">{pct(totalD.pctMeta)}</span>
                <span className="ml-1 font-medium hidden sm:inline">do ano</span>
              </Badge>
            }
          />
          <div className="px-2 pt-3 pb-2">
            <div className="h-[240px] md:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={dadosGrafico}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis
                    dataKey="mes"
                    {...AXIS}
                    interval={0}
                    tickFormatter={(v: string) => (estreito ? v.slice(0, 1) : v)}
                  />
                  <YAxis
                    yAxisId="l"
                    {...AXIS}
                    width={estreito ? 48 : 62}
                    tickFormatter={(v: number) => moneyShort(v)}
                  />
                  <YAxis
                    yAxisId="r"
                    orientation="right"
                    {...AXIS}
                    width={62}
                    hide={estreito}
                    tickFormatter={(v: number) => moneyShort(v)}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--panel-3)" }}
                    content={<ChartTooltip formatter={(v) => money(v)} />}
                  />
                  <Bar
                    yAxisId="l"
                    dataKey="receita"
                    name="Receita realizada"
                    fill="var(--s1)"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                  {!estreito && (
                    <Bar
                      yAxisId="l"
                      dataKey="meta"
                      name="Meta"
                      fill="var(--s9)"
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />
                  )}
                  {estreito && (
                    <Line
                      yAxisId="l"
                      type="monotone"
                      dataKey="meta"
                      name="Meta"
                      stroke="var(--s9)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                  {!estreito && (
                    <Line
                      yAxisId="r"
                      type="monotone"
                      dataKey="acumulado"
                      name="Receita acumulada"
                      stroke="var(--s3)"
                      strokeWidth={1.75}
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                  {!estreito && (
                    <Line
                      yAxisId="r"
                      type="monotone"
                      dataKey="metaAcumulada"
                      name="Meta acumulada"
                      stroke="var(--s5)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <Legend
              className="px-2 pt-3"
              items={
                estreito
                  ? [
                      { label: "Receita realizada", color: "var(--s1)" },
                      { label: "Meta", color: "var(--s9)" },
                    ]
                  : [
                      { label: "Receita realizada", color: "var(--s1)" },
                      { label: "Meta", color: "var(--s9)" },
                      { label: "Receita acumulada", color: "var(--s3)" },
                      { label: "Meta acumulada", color: "var(--s5)" },
                    ]
              }
            />
          </div>
        </Panel>

        {/* ── Tabela densa ───────────────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Mês a mês"
            hint="clique num mês para abrir o detalhe"
            action={
              <span className="num text-[12px] text-ink-3">
                12 meses
              </span>
            }
          />

          {/* desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table
              className="w-full border-collapse text-[13px]"
              style={{ minWidth: `${larguraMinima}px` }}
            >
              <thead>
                <tr className="bg-panel-2">
                  <th className="sticky left-0 z-20 bg-panel-2 h-9 px-3 border-b border-r border-line text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap">
                    Mês
                  </th>
                  {colunas.map((c) => (
                    <th
                      key={c.key}
                      style={{ width: `${c.width}px` }}
                      className="h-9 px-3 border-b border-line text-right font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap"
                    >
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {serie.map((m, i) => (
                  <tr
                    key={m.mes}
                    onClick={() => setDetalhe(m)}
                    className={cn(
                      "border-b border-line cursor-pointer transition-colors hover:bg-brand-wash",
                      i % 2 === 1 && "bg-panel-2/55"
                    )}
                  >
                    <td
                      className="sticky left-0 z-10 bg-panel border-r border-line px-3 whitespace-nowrap"
                      style={{ height: "var(--row)", width: "112px" }}
                    >
                      <span className="font-medium text-ink">{m.rotulo}</span>
                      <span className="num text-[11px] text-ink-3 ml-1.5">
                        {ANO}
                      </span>
                    </td>
                    {colunas.map((c) => (
                      <td
                        key={c.key}
                        className="px-3 text-right text-ink-2 whitespace-nowrap"
                        style={{ height: "var(--row)" }}
                      >
                        {c.cell(m, i)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="font-semibold">
                  <td
                    className="sticky left-0 bottom-0 z-30 bg-panel-2 border-t border-r border-line px-3 text-ink whitespace-nowrap"
                    style={{ height: "var(--row)" }}
                  >
                    Total do ano
                  </td>
                  {colunas.map((c) => (
                    <td
                      key={c.key}
                      className="sticky bottom-0 z-20 bg-panel-2 border-t border-line px-3 text-right text-ink whitespace-nowrap"
                      style={{ height: "var(--row)" }}
                    >
                      {c.total(total)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* mobile — cartões, sem scroll lateral */}
          <ul className="md:hidden divide-y divide-line">
            {serie.map((m, i) => {
              const d = derivar(m);
              const mom = variacao(m.receita, serie[i - 1]?.receita);
              const f = faixaMeta(d.pctMeta);
              return (
                <li key={m.mes}>
                  <button
                    onClick={() => setDetalhe(m)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 min-h-11 active:bg-panel-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink truncate">
                          {m.rotuloLongo}
                        </span>
                        <span className="num text-[13px] font-semibold text-ink shrink-0">
                          {money(m.receita)}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
                        {[
                          { l: "Pedidos", v: count(m.pedidos) },
                          { l: "Ticket", v: money(d.ticket) },
                          { l: "Conversão", v: pct(d.conversao, 2) },
                          { l: "TACOS", v: pct(d.tacos, 2) },
                          { l: "Cancel.", v: pct(d.pctCancelado) },
                          { l: "Líquida", v: moneyShort(d.receitaLiquida) },
                        ].map((k) => (
                          <span key={k.l} className="flex flex-col min-w-0">
                            <span className="text-[10px] uppercase tracking-[0.04em] text-ink-3 font-semibold truncate">
                              {k.l}
                            </span>
                            <span className="num text-[12px] text-ink truncate">
                              {k.v}
                            </span>
                          </span>
                        ))}
                      </div>

                      <div className="mt-2.5 flex items-center gap-2">
                        <Progress value={d.pctMeta} tone={f} className="flex-1" />
                        <span className={cn("num text-[12px] font-semibold shrink-0", TEXTO_META[f])}>
                          {pct(d.pctMeta)}
                        </span>
                        {mom !== null && <Delta value={mom} />}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-3 shrink-0" />
                  </button>
                </li>
              );
            })}

            <li className="bg-panel-2 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink">
                  Total do ano
                </span>
                <span className="num text-[13px] font-semibold text-ink shrink-0">
                  {money(total.receita)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
                {[
                  { l: "Pedidos", v: count(total.pedidos) },
                  { l: "Ticket", v: money(totalD.ticket) },
                  { l: "Conversão", v: pct(totalD.conversao, 2) },
                  { l: "TACOS", v: pct(totalD.tacos, 2) },
                  { l: "Líquida", v: moneyShort(totalD.receitaLiquida) },
                  { l: "% da meta", v: pct(totalD.pctMeta) },
                ].map((k) => (
                  <span key={k.l} className="flex flex-col min-w-0">
                    <span className="text-[10px] uppercase tracking-[0.04em] text-ink-3 font-semibold truncate">
                      {k.l}
                    </span>
                    <span className="num text-[12px] font-semibold text-ink truncate">
                      {k.v}
                    </span>
                  </span>
                ))}
              </div>
            </li>
          </ul>
        </Panel>
      </PageBody>

      {/* detalhe do mês */}
      {detalhe && (
        <DetalheMes
          m={detalhe}
          escopo={escopo}
          anterior={serie[detalhe.mes - 1]}
          onClose={() => setDetalhe(null)}
        />
      )}

      {/* filtro de canal — mobile */}
      {filtrosAbertos && (
        <FilterSheet
          title="Canal"
          onClose={() => setFiltrosAbertos(false)}
          onClear={() => setEscopo("todos")}
          applyLabel="Aplicar"
        >
          <div className="flex flex-col gap-2">
            {ESCOPOS.map((o) => (
              <button
                key={o.value}
                onClick={() => setEscopo(o.value)}
                className={cn(
                  "h-11 px-3 rounded-r1 border text-[13px] font-medium text-left transition-colors",
                  escopo === o.value
                    ? "border-brand bg-brand-wash text-brand"
                    : "border-line text-ink-2"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </FilterSheet>
      )}
    </>
  );
}

/* ══ Detalhe do mês ══════════════════════════════════════════ */

function DetalheMes({
  m,
  escopo,
  anterior,
  onClose,
}: {
  m: MesAnual;
  escopo: EscopoAnual;
  anterior?: MesAnual;
  onClose: () => void;
}) {
  const d = derivar(m);
  const f = faixaMeta(d.pctMeta);
  const mom = variacao(m.receita, anterior?.receita);

  return (
    <Sheet
      title={`${m.rotuloLongo} de ${ANO}`}
      subtitle={nomeEscopo(escopo)}
      onClose={onClose}
      footer={
        <Button className="flex-1 max-sm:h-10" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line">
        {[
          { l: "Receita", v: money(m.receita) },
          { l: "Receita líquida", v: money(d.receitaLiquida) },
          { l: "Pedidos", v: count(m.pedidos) },
          { l: "Ticket médio", v: money(d.ticket) },
        ].map((k) => (
          <div key={k.l} className="px-4 py-3">
            <p className="label">{k.l}</p>
            <p className="num text-[17px] font-semibold text-ink mt-1 leading-none">
              {k.v}
            </p>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-b border-line">
        <p className="label mb-2.5">Meta do mês</p>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] text-ink-3">Realizado</p>
            <p className="num text-[19px] font-semibold text-ink leading-none mt-1">
              {money(m.receita)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-ink-3">Meta</p>
            <p className="num text-[19px] font-semibold text-ink-2 leading-none mt-1">
              {money(m.meta)}
            </p>
          </div>
        </div>
        <Progress value={d.pctMeta} tone={f} className="mt-3" />
        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          <Badge tone={f}>
            <span className="num">{pct(d.pctMeta)}</span>
            <span className="ml-1 font-medium">da meta</span>
          </Badge>
          <span className="text-[12px] text-ink-3">
            {d.gapMeta >= 0 ? "sobra de " : "faltam "}
            <span className="num">{money(Math.abs(d.gapMeta))}</span>
          </span>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-line">
        <p className="label mb-1">Indicadores</p>
        <KeyValue label="Visitas" value={count(m.visitas)} />
        <KeyValue label="Taxa de conversão" value={pct(d.conversao, 2)} />
        <KeyValue label="Investimento em ADS" value={money(m.ads)} />
        <KeyValue
          label="TACOS"
          value={pct(d.tacos, 2)}
          tone={d.tacos > 7 ? "warn" : undefined}
        />
        <KeyValue label="Pedidos cancelados" value={count(m.pedidosCancelados)} />
        <KeyValue label="Valor cancelado" value={money(m.valorCancelado)} />
        <KeyValue
          label="Cancelamento sobre a receita"
          value={pct(d.pctCancelado)}
          tone={d.pctCancelado > 6 ? "down" : undefined}
        />
      </div>

      <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-3">
          Variação de receita vs. {anterior ? anterior.rotuloLongo : "mês anterior"}
        </span>
        {mom === null ? (
          <span className="text-[12px] text-ink-3">sem base</span>
        ) : (
          <Delta value={mom} />
        )}
      </div>

      {escopo === "todos" && (
        <div className="px-4 py-3">
          <p className="label mb-2.5">Receita por canal</p>
          <div className="flex flex-col gap-2.5">
            {CANAIS_ANUAL.map((c) => {
              const mc = ANUAL_POR_CANAL[c.id][m.mes];
              const share = m.receita ? (mc.receita / m.receita) * 100 : 0;
              return (
                <div key={c.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-ink-2 truncate">
                      {c.nome}
                    </span>
                    <span className="shrink-0">
                      <span className="num text-[12px] text-ink">
                        {money(mc.receita)}
                      </span>
                      <span className="num text-[11px] text-ink-3 ml-1.5">
                        {pct(share)}
                      </span>
                    </span>
                  </div>
                  <span className="mt-1 block h-1.5 rounded-full bg-panel-3 overflow-hidden">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(0, Math.min(100, share))}%`,
                        background: c.cor,
                      }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Sheet>
  );
}
