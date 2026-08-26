"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Delta, Badge } from "@/components/ui/primitives";
import { Select, Segmented } from "@/components/ui/controls";
import { SERIES, AXIS, GRID, ChartTooltip, Legend } from "@/components/ui/chart";
import {
  PERIODOS,
  PERIODO_POR_ID,
  COLUNAS_INICIAIS,
  type Periodo,
  type PeriodoId,
} from "@/mock/diario";
import { money, moneyShort, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Check, RotateCcw } from "lucide-react";

/* ══ Agregação ═══════════════════════════════════════════════ */

type Resumo = {
  dias: number;
  receita: number;
  receitaLiquida: number;
  pedidos: number;
  ticket: number;
  visitas: number;
  conversao: number;
  ads: number;
  tacos: number;
  cancelado: number;
  pctCancel: number;
};

function resumir(p: Periodo): Resumo {
  const s = p.dias.reduce(
    (a, d) => ({
      receita: a.receita + d.receita,
      pedidos: a.pedidos + d.pedidos,
      visitas: a.visitas + d.visitas,
      ads: a.ads + d.ads,
      cancelado: a.cancelado + d.cancelado,
    }),
    { receita: 0, pedidos: 0, visitas: 0, ads: 0, cancelado: 0 }
  );

  return {
    dias: p.dias.length,
    receita: s.receita,
    receitaLiquida: s.receita - s.cancelado,
    pedidos: s.pedidos,
    ticket: s.pedidos ? s.receita / s.pedidos : 0,
    visitas: s.visitas,
    conversao: s.visitas ? (s.pedidos / s.visitas) * 100 : 0,
    ads: s.ads,
    tacos: s.receita ? (s.ads / s.receita) * 100 : 0,
    cancelado: s.cancelado,
    pctCancel: s.receita ? (s.cancelado / s.receita) * 100 : 0,
  };
}

/* ══ Definição das linhas ════════════════════════════════════ */

type Metrica = {
  tipo: "metrica";
  id: string;
  nome: string;
  valor: (r: Resumo) => number;
  fmt: (v: number) => string;
  /** "soma" muda com a base por dia; "razao" é sempre a média ponderada. */
  escala: "soma" | "razao";
  melhor: "maior" | "menor" | "nenhum";
  /** true quando cair é bom. */
  inverso?: boolean;
};

type Linha = Metrica | { tipo: "grupo"; id: string; nome: string };

const LINHAS: Linha[] = [
  { tipo: "grupo", id: "g1", nome: "Resultado" },
  {
    tipo: "metrica",
    id: "receita",
    nome: "Receita bruta",
    valor: (r) => r.receita,
    fmt: money,
    escala: "soma",
    melhor: "maior",
  },
  {
    tipo: "metrica",
    id: "receitaLiquida",
    nome: "Receita líquida",
    valor: (r) => r.receitaLiquida,
    fmt: money,
    escala: "soma",
    melhor: "maior",
  },
  {
    tipo: "metrica",
    id: "pedidos",
    nome: "Pedidos",
    valor: (r) => r.pedidos,
    fmt: count,
    escala: "soma",
    melhor: "maior",
  },
  {
    tipo: "metrica",
    id: "ticket",
    nome: "Ticket médio",
    valor: (r) => r.ticket,
    fmt: money,
    escala: "razao",
    melhor: "maior",
  },
  { tipo: "grupo", id: "g2", nome: "Tráfego e eficiência" },
  {
    tipo: "metrica",
    id: "visitas",
    nome: "Visitas",
    valor: (r) => r.visitas,
    fmt: count,
    escala: "soma",
    melhor: "maior",
  },
  {
    tipo: "metrica",
    id: "conversao",
    nome: "Conversão",
    valor: (r) => r.conversao,
    fmt: (v) => pct(v, 2),
    escala: "razao",
    melhor: "maior",
  },
  {
    tipo: "metrica",
    id: "ads",
    nome: "Investimento em ADS",
    valor: (r) => r.ads,
    fmt: money,
    escala: "soma",
    melhor: "nenhum",
    inverso: true,
  },
  {
    tipo: "metrica",
    id: "tacos",
    nome: "TACOS",
    valor: (r) => r.tacos,
    fmt: (v) => pct(v, 1),
    escala: "razao",
    melhor: "menor",
    inverso: true,
  },
  { tipo: "grupo", id: "g3", nome: "Cancelamento" },
  {
    tipo: "metrica",
    id: "cancelado",
    nome: "Cancelamento (R$)",
    valor: (r) => r.cancelado,
    fmt: money,
    escala: "soma",
    melhor: "menor",
    inverso: true,
  },
  {
    tipo: "metrica",
    id: "pctCancel",
    nome: "Cancelamento (%)",
    valor: (r) => r.pctCancel,
    fmt: (v) => pct(v, 1),
    escala: "razao",
    melhor: "menor",
    inverso: true,
  },
];

/* ══ Opções de tela ══════════════════════════════════════════ */

const BASES = [
  { value: "total", label: "Total do período" },
  { value: "dia", label: "Média por dia" },
] as const;
type Base = (typeof BASES)[number]["value"];

const METRICAS_GRAFICO = [
  { value: "receita", label: "Receita" },
  { value: "pedidos", label: "Pedidos" },
  { value: "visitas", label: "Visitas" },
] as const;
type MetricaGrafico = (typeof METRICAS_GRAFICO)[number]["value"];

const ROTULOS_COLUNA = ["Coluna 1", "Coluna 2", "Coluna 3", "Coluna 4"];

/* ══ Tela ════════════════════════════════════════════════════ */

export default function ComparativoDiario() {
  const [rascunho, setRascunho] =
    React.useState<(PeriodoId | "")[]>(COLUNAS_INICIAIS);
  const [aplicado, setAplicado] =
    React.useState<(PeriodoId | "")[]>(COLUNAS_INICIAIS);
  const [base, setBase] = React.useState<Base>("total");
  const [metricaGrafico, setMetricaGrafico] =
    React.useState<MetricaGrafico>("receita");

  const pendente = rascunho.some((v, i) => v !== aplicado[i]);

  /* colunas ativas — a cor acompanha a posição, não o período */
  const colunas = React.useMemo(
    () =>
      aplicado
        .map((id, i) => ({ id, slot: i }))
        .filter((c): c is { id: PeriodoId; slot: number } => c.id !== "")
        .map((c) => {
          const periodo = PERIODO_POR_ID[c.id];
          return {
            slot: c.slot,
            periodo,
            resumo: resumir(periodo),
            cor: SERIES[c.slot],
          };
        }),
    [aplicado]
  );

  /** Valor exibido, já ajustado pela base escolhida. */
  const exibido = React.useCallback(
    (m: Metrica, r: Resumo) => {
      const v = m.valor(r);
      return m.escala === "soma" && base === "dia" ? v / r.dias : v;
    },
    [base]
  );

  /** Índice da coluna vencedora de cada métrica. */
  const vencedor = React.useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const l of LINHAS) {
      if (l.tipo !== "metrica" || l.melhor === "nenhum" || colunas.length < 2)
        continue;
      let melhorIdx = 0;
      for (let i = 1; i < colunas.length; i++) {
        const atual = exibido(l, colunas[i].resumo);
        const ref = exibido(l, colunas[melhorIdx].resumo);
        if (l.melhor === "maior" ? atual > ref : atual < ref) melhorIdx = i;
      }
      mapa[l.id] = melhorIdx;
    }
    return mapa;
  }, [colunas, exibido]);

  /* série dia a dia sobreposta */
  const maxDias = colunas.reduce(
    (m, c) => Math.max(m, c.periodo.dias.length),
    0
  );

  const serie = React.useMemo(
    () =>
      Array.from({ length: maxDias }, (_, i) => {
        const linha: Record<string, number | null> = { dia: i + 1 };
        colunas.forEach((c, idx) => {
          const d = c.periodo.dias[i];
          linha[`c${idx}`] = d ? d[metricaGrafico] : null;
        });
        return linha;
      }),
    [colunas, maxDias, metricaGrafico]
  );

  const fmtGrafico =
    metricaGrafico === "receita" ? (v: number) => money(v) : (v: number) => count(v);
  const fmtEixo =
    metricaGrafico === "receita"
      ? (v: number) => moneyShort(v)
      : (v: number) => count(v);

  const metricas = LINHAS.filter((l): l is Metrica => l.tipo === "metrica");

  return (
    <>
      <PageHeader
        title="Comparativo diário e de períodos"
        breadcrumb="Vendas"
        description="Até 4 períodos lado a lado, métrica por métrica"
        actions={
          <Segmented
            options={BASES}
            value={base}
            onChange={setBase}
            className="max-md:hidden"
          />
        }
      />

      <PageBody>
        {/* ── seleção de períodos ───────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ROTULOS_COLUNA.map((rotulo, i) => {
            const valor = rascunho[i];
            const periodo = valor ? PERIODO_POR_ID[valor] : null;
            return (
              <Panel key={rotulo} className="px-3 py-2.5 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                    style={{ background: SERIES[i] }}
                  />
                  <span className="label truncate">{rotulo}</span>
                  {i === 0 && (
                    <span className="text-[10px] text-ink-3 ml-auto shrink-0">
                      base
                    </span>
                  )}
                </div>
                <Select
                  aria-label={rotulo}
                  className="h-11 md:h-8"
                  value={valor}
                  onChange={(e) =>
                    setRascunho((r) =>
                      r.map((v, j) =>
                        j === i ? (e.target.value as PeriodoId | "") : v
                      )
                    )
                  }
                >
                  {i > 0 && <option value="">Nenhum</option>}
                  {PERIODOS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.rotulo}
                    </option>
                  ))}
                </Select>
                <p className="num text-[11px] text-ink-3 mt-1.5 truncate">
                  {periodo ? periodo.intervalo : "—"}
                </p>
              </Panel>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Segmented
            options={BASES}
            value={base}
            onChange={setBase}
            className="md:hidden"
          />
          <div className="flex-1" />
          {pendente && (
            <Button
              className="max-md:h-11"
              onClick={() => setRascunho(aplicado)}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Desfazer
            </Button>
          )}
          <Button
            variant="primary"
            className="max-md:h-11 max-md:flex-1"
            disabled={!pendente}
            onClick={() => setAplicado(rascunho)}
          >
            <Check className="w-3.5 h-3.5" />
            Aplicar
          </Button>
        </div>

        {/* ── tabela comparativa ────────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Comparativo de métricas"
            hint={
              base === "dia"
                ? "média por dia · variação contra a coluna 1"
                : "total do período · variação contra a coluna 1"
            }
            action={
              colunas.length > 1 ? (
                <Badge tone="brand">
                  <span className="hidden sm:inline">melhor da linha</span>
                  <span className="sm:hidden">melhor</span>
                </Badge>
              ) : undefined
            }
          />

          {/* desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-panel-2">
                  <th className="sticky left-0 z-10 bg-panel-2 border-b border-r border-line h-12 px-3 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap">
                    Métrica
                  </th>
                  {colunas.map((c, i) => (
                    <th
                      key={c.slot}
                      className="border-b border-line h-12 px-3 text-right align-middle whitespace-nowrap"
                      style={{ width: `${72 / colunas.length}%` }}
                    >
                      <span className="flex items-center justify-end gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                          style={{ background: c.cor }}
                        />
                        <span className="flex flex-col items-end min-w-0">
                          <span className="text-[12px] font-semibold text-ink truncate">
                            {c.periodo.rotulo}
                          </span>
                          <span className="num text-[11px] font-normal text-ink-3 truncate">
                            {c.periodo.intervalo}
                            {i === 0 ? " · base" : ""}
                          </span>
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LINHAS.map((l) => {
                  if (l.tipo === "grupo") {
                    return (
                      <tr key={l.id} className="bg-panel-3">
                        <td
                          colSpan={colunas.length + 1}
                          className="h-7 px-3 label border-b border-line"
                        >
                          {l.nome}
                        </td>
                      </tr>
                    );
                  }
                  const venc = vencedor[l.id];
                  const referencia = colunas.length
                    ? exibido(l, colunas[0].resumo)
                    : 0;
                  return (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td
                        className="sticky left-0 z-10 bg-panel border-r border-line px-3 text-ink whitespace-nowrap"
                        style={{ height: "var(--row)" }}
                      >
                        {l.nome}
                      </td>
                      {colunas.map((c, i) => {
                        const v = exibido(l, c.resumo);
                        const variacao =
                          i > 0 && referencia !== 0
                            ? ((v - referencia) / Math.abs(referencia)) * 100
                            : null;
                        const destaque = venc === i;
                        return (
                          <td
                            key={c.slot}
                            className={cn(
                              "px-3 text-right",
                              destaque && "bg-brand-wash"
                            )}
                            style={{ height: "var(--row)" }}
                          >
                            <span className="flex items-baseline justify-end gap-2">
                              <span
                                className={cn(
                                  "num whitespace-nowrap",
                                  destaque
                                    ? "text-brand font-semibold"
                                    : "text-ink"
                                )}
                              >
                                {l.fmt(v)}
                              </span>
                              {variacao !== null && (
                                <Delta value={variacao} inverse={l.inverso} />
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* mobile — um cartão por métrica */}
          <div className="md:hidden divide-y divide-line">
            {LINHAS.map((l) => {
              if (l.tipo === "grupo") {
                return (
                  <div key={l.id} className="bg-panel-3 px-4 h-7 flex items-center">
                    <span className="label">{l.nome}</span>
                  </div>
                );
              }
              const venc = vencedor[l.id];
              const referencia = colunas.length ? exibido(l, colunas[0].resumo) : 0;
              return (
                <div key={l.id} className="px-4 py-3">
                  <p className="text-[13px] font-semibold text-ink">{l.nome}</p>
                  <div className="mt-2 flex flex-col gap-0.5">
                    {colunas.map((c, i) => {
                      const v = exibido(l, c.resumo);
                      const variacao =
                        i > 0 && referencia !== 0
                          ? ((v - referencia) / Math.abs(referencia)) * 100
                          : null;
                      const destaque = venc === i;
                      return (
                        <div
                          key={c.slot}
                          className={cn(
                            "flex items-center justify-between gap-3 min-h-8 px-1.5 -mx-1.5 rounded-r1",
                            destaque && "bg-brand-wash"
                          )}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-[2px] shrink-0"
                              style={{ background: c.cor }}
                            />
                            <span className="text-[12px] text-ink-2 truncate">
                              {c.periodo.rotulo}
                            </span>
                          </span>
                          <span className="flex items-baseline gap-2 shrink-0">
                            <span
                              className={cn(
                                "num text-[13px]",
                                destaque ? "text-brand font-semibold" : "text-ink"
                              )}
                            >
                              {l.fmt(v)}
                            </span>
                            {variacao !== null && (
                              <Delta value={variacao} inverse={l.inverso} />
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* ── sobreposição dia a dia ────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Evolução dia a dia"
            hint="dia 1 = primeiro dia de cada período"
            action={
              <Segmented
                options={METRICAS_GRAFICO}
                value={metricaGrafico}
                onChange={setMetricaGrafico}
              />
            }
          />
          <div className="px-2 pt-4 pb-3">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={serie}
                  margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis
                    dataKey="dia"
                    {...AXIS}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis
                    {...AXIS}
                    width={metricaGrafico === "receita" ? 56 : 46}
                    tickFormatter={fmtEixo}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }}
                    labelFormatter={(l) =>
                      typeof l === "number" ? `Dia ${l}` : l
                    }
                    content={<ChartTooltip formatter={fmtGrafico} />}
                  />
                  {colunas.map((c, idx) => (
                    <Line
                      key={c.slot}
                      type="monotone"
                      dataKey={`c${idx}`}
                      name={c.periodo.rotulo}
                      stroke={c.cor}
                      strokeWidth={1.75}
                      dot={
                        c.periodo.dias.length === 1
                          ? { r: 3, fill: c.cor, stroke: c.cor }
                          : false
                      }
                      activeDot={{ r: 3 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <Legend
              className="px-2 pt-3"
              items={colunas.map((c) => ({
                label: `${c.periodo.rotulo} · ${c.periodo.intervalo}`,
                color: c.cor,
              }))}
            />
          </div>
        </Panel>

        {/* ── leitura rápida ───────────────────────────────── */}
        {colunas.length > 1 && (
          <Panel className="overflow-hidden">
            <PanelHeader title="Leitura rápida" hint="contra a coluna 1" />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-line">
              {metricas.slice(0, 6).map((m) => {
                const ref = exibido(m, colunas[0].resumo);
                const alvo = exibido(m, colunas[1].resumo);
                const variacao = ref !== 0 ? ((alvo - ref) / Math.abs(ref)) * 100 : 0;
                return (
                  <div key={m.id} className="bg-panel px-4 py-3">
                    <p className="label truncate">{m.nome}</p>
                    <div className="mt-1.5 flex items-end justify-between gap-3">
                      <span className="num text-[17px] font-semibold text-ink leading-none truncate">
                        {m.fmt(alvo)}
                      </span>
                      <Delta value={variacao} inverse={m.inverso} />
                    </div>
                    <p className="text-[11px] text-ink-3 mt-1.5 truncate">
                      {colunas[1].periodo.rotulo} vs. {colunas[0].periodo.rotulo}
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </PageBody>
    </>
  );
}
