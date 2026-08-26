"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge, Delta } from "@/components/ui/primitives";
import {
  Segmented,
  Select,
  Progress,
  FilterSheet,
  SectionTitle,
  HeatCell,
} from "@/components/ui/controls";
import { AXIS, GRID, ChartTooltip, Legend, SERIES } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { money, moneyShort, count, pct } from "@/lib/format";
import {
  agregar,
  derivar,
  ANO,
  CALENDARIO,
  DIAS_SEMANA,
  DIAS_SEMANA_CURTOS,
  ESCOPOS_COMP,
  INDICES_ANO,
  INDICES_DOW,
  INDICES_DOW_MES,
  INDICES_DOW_PRIMEIRA,
  INDICES_DOW_ULTIMA,
  INDICES_MES,
  MESES,
  MESES_LONGOS,
  TRIMESTRES,
  nomeEscopo,
  type Agregado,
  type EscopoComp,
} from "@/mock/comparativos";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SlidersHorizontal } from "lucide-react";

/* ══════════════════════════════════════════════════════════════
   Métricas — cada uma sabe comparar grupos de tamanhos diferentes
   ══════════════════════════════════════════════════════════════ */

type MetricaId = "receita" | "pedidos" | "ticket" | "visitas" | "conversao";

type Metrica = {
  id: MetricaId;
  label: string;
  /**
   * Valor COMPARÁVEL entre recortes: média por dia nas métricas de soma,
   * razão consolidada nas métricas de razão. Um mês com 5 segundas não pode
   * parecer melhor que outro com 4 só por causa disso.
   */
  media: (a: Agregado) => number;
  /** Volume acumulado no recorte — é a base da participação. */
  total: (a: Agregado) => number;
  fmt: (v: number) => string;
  fmtCurto: (v: number) => string;
  fmtTotal: (v: number) => string;
  fmtEixo: (v: number) => string;
  rotuloMedia: string;
  rotuloTotal: string;
  larguraEixo: number;
};

const porDia = (v: number, dias: number) => (dias ? v / dias : 0);

const METRICAS: Metrica[] = [
  {
    id: "receita",
    label: "Receita",
    media: (a) => porDia(a.receita, a.dias),
    total: (a) => a.receita,
    fmt: money,
    fmtCurto: moneyShort,
    fmtTotal: moneyShort,
    fmtEixo: moneyShort,
    rotuloMedia: "Média por dia",
    rotuloTotal: "Receita no ano",
    larguraEixo: 62,
  },
  {
    id: "pedidos",
    label: "Pedidos",
    media: (a) => porDia(a.pedidos, a.dias),
    total: (a) => a.pedidos,
    fmt: count,
    fmtCurto: count,
    fmtTotal: count,
    fmtEixo: count,
    rotuloMedia: "Média por dia",
    rotuloTotal: "Pedidos no ano",
    larguraEixo: 46,
  },
  {
    id: "ticket",
    label: "Ticket médio",
    media: (a) => derivar(a).ticket,
    total: (a) => a.receita,
    fmt: money,
    fmtCurto: money,
    fmtTotal: moneyShort,
    fmtEixo: moneyShort,
    rotuloMedia: "Ticket médio",
    rotuloTotal: "Receita no ano",
    larguraEixo: 62,
  },
  {
    id: "visitas",
    label: "Visitas",
    media: (a) => porDia(a.visitas, a.dias),
    total: (a) => a.visitas,
    fmt: count,
    fmtCurto: count,
    fmtTotal: count,
    fmtEixo: count,
    rotuloMedia: "Média por dia",
    rotuloTotal: "Visitas no ano",
    larguraEixo: 54,
  },
  {
    id: "conversao",
    label: "Taxa de conversão",
    media: (a) => derivar(a).conversao,
    total: (a) => a.pedidos,
    fmt: (v) => pct(v, 2),
    fmtCurto: (v) => pct(v, 2),
    fmtTotal: count,
    fmtEixo: (v) => pct(v, 1),
    rotuloMedia: "Conversão média",
    rotuloTotal: "Pedidos no ano",
    larguraEixo: 52,
  },
];

/* ── apoio local ────────────────────────────────────────────── */

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

/** Ordinal de ranking — 1º a 7º. */
const ordinal = (n: number) => `${n}º`;

/** Intensidade do mapa de calor: piso visível para o pior mês da linha. */
function intensidade(v: number, min: number, max: number) {
  if (!v) return 0;
  if (max === min) return 0.5;
  return 0.12 + ((v - min) / (max - min)) * 0.88;
}

/* ══════════════════════════════════════════════════════════════
   Tela
   ══════════════════════════════════════════════════════════════ */

export default function VendasComparativos() {
  const [metricaId, setMetricaId] = React.useState<MetricaId>("receita");
  const [escopo, setEscopo] = React.useState<EscopoComp>("todos");
  const [modo, setModo] = React.useState<"mes" | "dia">("mes");
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  const estreito = useEstreito();

  const M = METRICAS.find((m) => m.id === metricaId) ?? METRICAS[0];
  /** No mobile só cabe o agrupamento por dia — 12 grupos × 7 barras não lê. */
  const modoEfetivo: "mes" | "dia" = estreito ? "dia" : modo;

  /* ── cartões por dia da semana ────────────────────────────── */

  const cartoes = React.useMemo(() => {
    const ano = agregar(INDICES_ANO, escopo);
    const base = M.total(ano);

    const linhas = DIAS_SEMANA.map((nome, dw) => {
      const a = agregar(INDICES_DOW[dw], escopo);
      const total = M.total(a);
      return {
        dw,
        nome,
        dias: a.dias,
        media: M.media(a),
        total,
        participacao: base ? (total / base) * 100 : 0,
      };
    });

    const ordenado = [...linhas].sort((x, y) => y.media - x.media);
    const posicao = new Map(ordenado.map((l, i) => [l.dw, i + 1]));
    const maior = ordenado[0]?.media ?? 0;

    return linhas.map((l) => ({
      ...l,
      rank: posicao.get(l.dw) ?? 0,
      escala: maior ? (l.media / maior) * 100 : 0,
    }));
  }, [escopo, M]);

  const melhor = cartoes.find((c) => c.rank === 1);

  /* ── barras agrupadas ─────────────────────────────────────── */

  const series = React.useMemo(() => {
    if (modoEfetivo === "mes") {
      return DIAS_SEMANA.map((nome, dw) => ({
        key: `s${dw}`,
        nome,
        cor: SERIES[dw],
      }));
    }
    return TRIMESTRES.map((t, i) => ({
      key: `s${i}`,
      nome: t.rotulo,
      cor: SERIES[i * 2],
    }));
  }, [modoEfetivo]);

  const dadosGrafico = React.useMemo(() => {
    if (modoEfetivo === "mes") {
      return MESES.map((rotulo, m) => {
        const linha: Record<string, string | number> = { rotulo };
        DIAS_SEMANA.forEach((_, dw) => {
          linha[`s${dw}`] = M.media(agregar(INDICES_DOW_MES[dw][m], escopo));
        });
        return linha;
      });
    }
    return DIAS_SEMANA.map((rotulo, dw) => {
      const linha: Record<string, string | number> = { rotulo };
      TRIMESTRES.forEach((t, i) => {
        const indices = t.meses.flatMap((m) => INDICES_DOW_MES[dw][m]);
        linha[`s${i}`] = M.media(agregar(indices, escopo));
      });
      return linha;
    });
  }, [escopo, M, modoEfetivo]);

  /* ── mapa de calor dia × mês ──────────────────────────────── */

  const calor = React.useMemo(() => {
    const linhas = DIAS_SEMANA.map((nome, dw) => {
      const celulas = MESES.map((_, m) =>
        M.media(agregar(INDICES_DOW_MES[dw][m], escopo))
      );
      const validos = celulas.filter((v) => v > 0);
      const min = validos.length ? Math.min(...validos) : 0;
      const max = validos.length ? Math.max(...validos) : 0;
      const ordem = celulas
        .map((v, m) => ({ v, m }))
        .sort((a, b) => b.v - a.v)
        .map((o) => o.m);
      return {
        dw,
        nome,
        celulas,
        min,
        max,
        rank: celulas.map((_, m) => ordem.indexOf(m) + 1),
        ano: M.media(agregar(INDICES_DOW[dw], escopo)),
      };
    });

    return {
      linhas,
      rodape: MESES.map((_, m) => M.media(agregar(INDICES_MES[m], escopo))),
      rodapeAno: M.media(agregar(INDICES_ANO, escopo)),
    };
  }, [escopo, M]);

  /* ── início vs. fim do mês ────────────────────────────────── */

  const ocorrencias = React.useMemo(() => {
    const linhas = DIAS_SEMANA.map((nome, dw) => {
      const primeira = M.media(agregar(INDICES_DOW_PRIMEIRA[dw], escopo));
      const ultima = M.media(agregar(INDICES_DOW_ULTIMA[dw], escopo));
      return {
        dw,
        nome,
        primeira,
        ultima,
        variacao: primeira ? ((ultima - primeira) / primeira) * 100 : 0,
      };
    });
    const mediaPrimeira =
      linhas.reduce((s, l) => s + l.primeira, 0) / linhas.length;
    const mediaUltima = linhas.reduce((s, l) => s + l.ultima, 0) / linhas.length;
    return {
      linhas,
      mediaPrimeira,
      mediaUltima,
      variacao: mediaPrimeira
        ? ((mediaUltima - mediaPrimeira) / mediaPrimeira) * 100
        : 0,
    };
  }, [escopo, M]);

  return (
    <>
      <PageHeader
        title="Padrões por dia da semana"
        breadcrumb="Vendas"
        description={`${ANO} · ${nomeEscopo(escopo)} · ${M.label} · ${count(
          CALENDARIO.length
        )} dias analisados`}
        actions={
          <Button
            size="sm"
            className="md:hidden h-11"
            onClick={() => setFiltrosAbertos(true)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Canal
          </Button>
        }
        filters={
          <>
            <div className="w-[190px] max-md:flex-1 shrink-0">
              <Select
                aria-label="Métrica"
                value={metricaId}
                onChange={(e) => setMetricaId(e.target.value as MetricaId)}
                className="max-md:h-11"
              >
                {METRICAS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="hidden md:block">
              <Segmented<EscopoComp>
                options={ESCOPOS_COMP}
                value={escopo}
                onChange={setEscopo}
              />
            </div>

            {melhor && (
              <span className="hidden lg:block text-[12px] text-ink-3 shrink-0 ml-auto whitespace-nowrap">
                melhor dia: <span className="text-ink-2">{melhor.nome}</span>{" "}
                <span className="num">{M.fmtCurto(melhor.media)}</span>
              </span>
            )}
          </>
        }
      />

      <PageBody>
        {/* ── Sete cartões, um por dia da semana ─────────────── */}
        <SectionTitle
          title="Desempenho por dia da semana"
          hint={`${M.rotuloMedia.toLowerCase()} no ano · ranking de 1º a 7º`}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {cartoes.map((c) => (
            <div
              key={c.dw}
              className="panel panel-1 px-3 py-3 flex flex-col min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink truncate">
                  <span className="md:hidden xl:inline">{c.nome}</span>
                  <span className="hidden md:inline xl:hidden">
                    {DIAS_SEMANA_CURTOS[c.dw]}
                  </span>
                </span>
                <Badge
                  tone={c.rank === 1 ? "up" : c.rank === 7 ? "down" : "neutral"}
                >
                  <span className="num">{ordinal(c.rank)}</span>
                </Badge>
              </div>

              <p
                className="num text-[18px] font-semibold text-ink leading-none mt-2 truncate"
                title={M.fmt(c.media)}
              >
                {M.fmtCurto(c.media)}
              </p>
              <p className="text-[11px] text-ink-3 mt-1 truncate">
                {M.rotuloMedia} · <span className="num">{count(c.dias)}</span>{" "}
                dias
              </p>

              <Progress
                value={c.escala}
                tone={c.rank === 1 ? "up" : "brand"}
                className="mt-2.5"
              />

              <div className="mt-2.5 pt-2 border-t border-line flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-ink-3 truncate">
                    {M.rotuloTotal}
                  </span>
                  <span className="num text-[12px] text-ink shrink-0">
                    {M.fmtTotal(c.total)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-ink-3 truncate">
                    Participação
                  </span>
                  <span className="num text-[12px] text-ink shrink-0">
                    {pct(c.participacao)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Barras agrupadas dia × mês ─────────────────────── */}
        <Panel>
          <PanelHeader
            title="Desempenho por dia × mês"
            hint={
              modoEfetivo === "mes"
                ? "um grupo por mês · uma barra por dia da semana"
                : "um grupo por dia da semana · uma barra por trimestre"
            }
            action={
              <div className="hidden md:block">
                <Segmented<"mes" | "dia">
                  options={[
                    { value: "mes", label: "Por mês" },
                    { value: "dia", label: "Por dia" },
                  ]}
                  value={modo}
                  onChange={setModo}
                />
              </div>
            }
          />
          <div className="px-2 pt-3 pb-2">
            <div className="h-[260px] md:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dadosGrafico}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  barCategoryGap={modoEfetivo === "mes" ? "16%" : "22%"}
                  barGap={1}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis
                    dataKey="rotulo"
                    {...AXIS}
                    interval={0}
                    tickFormatter={(v: string) => (estreito ? v.slice(0, 3) : v)}
                  />
                  <YAxis
                    {...AXIS}
                    width={M.larguraEixo}
                    tickFormatter={(v: number) => M.fmtEixo(v)}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--panel-3)" }}
                    content={<ChartTooltip formatter={(v) => M.fmt(v)} />}
                  />
                  {series.map((s) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.nome}
                      fill={s.cor}
                      radius={[2, 2, 0, 0]}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Legend
              className="px-2 pt-3"
              items={series.map((s) => ({ label: s.nome, color: s.cor }))}
            />
          </div>
        </Panel>

        {/* ── Mapa de calor dia × mês ────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Mapa de calor — dia × mês"
            hint="cor mais forte = melhor mês daquele dia"
            action={
              <span className="text-[11px] text-ink-3 hidden sm:block">
                {M.rotuloMedia}
              </span>
            }
          />

          <p className="md:hidden px-4 pt-2.5 text-[11px] text-ink-3">
            Arraste para o lado para ver todos os meses.
          </p>

          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse text-[12px]"
              style={{ minWidth: "760px" }}
            >
              <thead>
                <tr className="bg-panel-2">
                  <th className="sticky left-0 z-20 bg-panel-2 h-9 px-3 border-b border-r border-line text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap">
                    Dia
                  </th>
                  {MESES.map((m) => (
                    <th
                      key={m}
                      className="h-9 px-2 border-b border-line text-right font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap"
                    >
                      {m}
                    </th>
                  ))}
                  <th className="h-9 px-3 border-b border-l border-line text-right font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap">
                    Ano
                  </th>
                </tr>
              </thead>

              <tbody>
                {calor.linhas.map((l) => (
                  <tr key={l.dw}>
                    <td className="sticky left-0 z-10 bg-panel border-b border-r border-line px-3 whitespace-nowrap">
                      <span className="text-[13px] font-medium text-ink hidden sm:inline">
                        {l.nome}
                      </span>
                      <span className="text-[13px] font-medium text-ink sm:hidden">
                        {DIAS_SEMANA_CURTOS[l.dw]}
                      </span>
                    </td>

                    {l.celulas.map((v, m) => (
                      <td
                        key={m}
                        className="p-0 border-b border-line whitespace-nowrap"
                      >
                        <div style={{ height: "34px" }}>
                          <HeatCell
                            intensity={intensidade(v, l.min, l.max)}
                            title={`${l.nome} · ${MESES_LONGOS[m]} — ${M.fmt(
                              v
                            )} · ${ordinal(l.rank[m])} de ${MESES.length} meses`}
                          >
                            {M.fmtCurto(v)}
                          </HeatCell>
                        </div>
                      </td>
                    ))}

                    <td className="border-b border-l border-line px-3 text-right whitespace-nowrap">
                      <span className="num text-[12px] font-semibold text-ink">
                        {M.fmtCurto(l.ano)}
                      </span>
                    </td>
                  </tr>
                ))}

                <tr className="bg-panel-2">
                  <td className="sticky left-0 z-10 bg-panel-2 border-r border-line px-3 whitespace-nowrap h-9">
                    <span className="text-[13px] font-semibold text-ink">
                      Todos os dias
                    </span>
                  </td>
                  {calor.rodape.map((v, m) => (
                    <td
                      key={m}
                      className="px-2 text-right whitespace-nowrap h-9"
                    >
                      <span className="num text-[12px] text-ink">
                        {M.fmtCurto(v)}
                      </span>
                    </td>
                  ))}
                  <td className="border-l border-line px-3 text-right whitespace-nowrap h-9">
                    <span className="num text-[12px] font-semibold text-ink">
                      {M.fmtCurto(calor.rodapeAno)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        {/* ── Início vs. fim do mês ──────────────────────────── */}
        <Panel>
          <PanelHeader
            title="Padrão início vs. fim do mês"
            hint="1ª ocorrência de cada dia da semana contra a última"
            action={
              <Badge
                tone={
                  Math.abs(ocorrencias.variacao) < 0.5
                    ? "neutral"
                    : ocorrencias.variacao > 0
                      ? "up"
                      : "down"
                }
              >
                <span className="num">{pct(ocorrencias.variacao)}</span>
                <span className="ml-1 font-medium hidden sm:inline">
                  no fim do mês
                </span>
              </Badge>
            }
          />

          <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
            <div className="px-4 py-3">
              <p className="label truncate">1ª ocorrência</p>
              <p className="num text-[19px] font-semibold text-ink leading-none mt-1.5">
                {M.fmtCurto(ocorrencias.mediaPrimeira)}
              </p>
              <p className="text-[11px] text-ink-3 mt-1.5">
                média dos 7 dias na 1ª semana cheia
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="label truncate">Última ocorrência</p>
              <p className="num text-[19px] font-semibold text-ink leading-none mt-1.5">
                {M.fmtCurto(ocorrencias.mediaUltima)}
              </p>
              <div className="mt-1.5">
                <Delta value={ocorrencias.variacao} />
              </div>
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 sm:gap-x-6">
              <span className="label pb-1.5">Dia</span>
              <span className="label pb-1.5 text-right">1ª</span>
              <span className="label pb-1.5 text-right">Última</span>
              <span className="label pb-1.5 text-right">Var.</span>

              {ocorrencias.linhas.map((l) => {
                const forte = Math.abs(l.variacao) >= 4;
                return (
                  <React.Fragment key={l.dw}>
                    <span className="flex items-center h-11 md:h-8 border-t border-line text-[13px] text-ink truncate">
                      <span className="sm:hidden">
                        {DIAS_SEMANA_CURTOS[l.dw]}
                      </span>
                      <span className="hidden sm:inline">{l.nome}</span>
                    </span>
                    <span className="flex items-center justify-end h-11 md:h-8 border-t border-line num text-[12px] text-ink-2 whitespace-nowrap">
                      {M.fmtCurto(l.primeira)}
                    </span>
                    <span
                      className={cn(
                        "flex items-center justify-end h-11 md:h-8 border-t border-line num text-[12px] whitespace-nowrap",
                        forte ? "text-ink font-semibold" : "text-ink"
                      )}
                    >
                      {M.fmtCurto(l.ultima)}
                    </span>
                    <span className="flex items-center justify-end h-11 md:h-8 border-t border-line">
                      <Delta value={l.variacao} />
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </Panel>
      </PageBody>

      {/* filtro de canal — mobile */}
      {filtrosAbertos && (
        <FilterSheet
          title="Canal"
          onClose={() => setFiltrosAbertos(false)}
          onClear={() => setEscopo("todos")}
        >
          <div className="flex flex-col gap-2">
            {ESCOPOS_COMP.map((o) => (
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
