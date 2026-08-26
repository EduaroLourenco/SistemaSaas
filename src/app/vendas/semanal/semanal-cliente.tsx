"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge, Delta } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { Segmented, FilterSheet } from "@/components/ui/controls";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Matriz, type IndicadorMatriz, type ColunaMatriz } from "@/components/ui/matriz";
import { SeletorCanal } from "@/components/ui/seletor-canal";
import { agruparSemanas } from "@/lib/periodo";
import { type SemanaVendas } from "@/mock/semanal";
import type { DadosSemanal } from "@/lib/dados/vendas";
import { money, moneyShort, count, pct } from "@/lib/format";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SlidersHorizontal } from "lucide-react";

/* ══ Métricas do painel ══════════════════════════════════════ */

type MetricaId = "receita" | "pedidos" | "ticket" | "visitas" | "conversao";

/** Inteiro compacto para o eixo Y — "48 mil" em vez de "48.312". */
const contagemCurta = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type Metrica = {
  id: MetricaId;
  label: string;
  titulo: string;
  /** valor cheio, para tabela e tooltip */
  fmt: (v: number) => string;
  /** valor curto, para o eixo Y */
  eixo: (v: number) => string;
  larguraEixo: number;
};

const METRICAS: Metrica[] = [
  {
    id: "receita",
    label: "Receita",
    titulo: "Receita por semana",
    fmt: money,
    eixo: moneyShort,
    larguraEixo: 74,
  },
  {
    id: "pedidos",
    label: "Pedidos",
    titulo: "Pedidos por semana",
    fmt: count,
    eixo: count,
    larguraEixo: 44,
  },
  {
    id: "ticket",
    label: "Ticket",
    titulo: "Ticket médio por semana",
    fmt: money,
    eixo: moneyShort,
    larguraEixo: 62,
  },
  {
    id: "visitas",
    label: "Visitas",
    titulo: "Visitas por semana",
    fmt: count,
    eixo: (v) => contagemCurta.format(v),
    larguraEixo: 52,
  },
  {
    id: "conversao",
    label: "Conversão",
    titulo: "Conversão por semana",
    fmt: (v) => pct(v, 2),
    eixo: (v) => pct(v, 1),
    larguraEixo: 46,
  },
];

const OPCOES_METRICA: { value: MetricaId; label: string }[] = METRICAS.map((m) => ({
  value: m.id,
  label: m.label,
}));

type Escopo = "todas" | "dados";

const OPCOES_ESCOPO: { value: Escopo; label: string }[] = [
  { value: "todas", label: "As 53 semanas" },
  { value: "dados", label: "Só com dados" },
];

/* ══ Peças locais ════════════════════════════════════════════ */

function Vazio() {
  return <span className="text-ink-3">—</span>;
}

function BarraParticipacao({
  valor,
  maximo,
}: {
  /** participação da semana no ano, em % */
  valor: number;
  /** maior participação do ano, em % — dá a escala da barra */
  maximo: number;
}) {
  if (valor <= 0) return <Vazio />;
  const largura = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden lg:block w-16 h-1.5 rounded-full bg-panel-3 overflow-hidden shrink-0">
        <span
          className="block h-full rounded-full"
          style={{ width: `${largura}%`, background: "var(--brand)" }}
        />
      </span>
      <span className="num text-[12px] text-ink-2">{pct(valor, 2)}</span>
    </span>
  );
}

/* ══ Linha da tabela ═════════════════════════════════════════ */

type Linha = SemanaVendas & {
  /** variação da receita sobre a semana anterior, em % */
  wow: number | null;
  /** participação da receita no total do ano, em % */
  participacao: number;
};

/* ══ Tela ════════════════════════════════════════════════════ */

export default function VendasSemanal({ dados }: { dados: DadosSemanal }) {
  const [canal, setCanal] = React.useState("");

  const {
    semanaAtual: SEMANA_ATUAL,
    totalSemanas: TOTAL_SEMANAS,
    ano: ANO,
  } = dados;

  /*
   * As semanas são reagrupadas conforme o canal escolhido. No consolidado,
   * a alta de um canal cobre a queda de outro e a semana parece estável —
   * só olhando um por vez dá para responder quem caiu.
   */
  const SEMANAS = React.useMemo(
    () =>
      dados.linhas.length
        ? agruparSemanas(dados.linhas, dados.ano, dados.ultimaData, canal || undefined)
        : dados.semanas,
    [dados, canal]
  );
  const SEMANAS_FECHADAS = React.useMemo(
    () => SEMANAS.filter((s) => s.comDados && !s.parcial),
    [SEMANAS]
  );

  const [metricaId, setMetricaId] = React.useState<MetricaId>("receita");
  const [escopo, setEscopo] = React.useState<Escopo>("todas");
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);

  const metrica = METRICAS.find((m) => m.id === metricaId) ?? METRICAS[0];

  /* ── linhas: WoW e participação ────────────────────────── */

  const linhas = React.useMemo<Linha[]>(() => {
    const totalAno = SEMANAS.reduce((t, s) => t + s.receita, 0);
    return SEMANAS.map((s, i) => {
      const anterior = i > 0 ? SEMANAS[i - 1] : null;
      const wow =
        s.receita > 0 && anterior && anterior.receita > 0
          ? ((s.receita - anterior.receita) / anterior.receita) * 100
          : null;
      return {
        ...s,
        wow,
        participacao: totalAno > 0 ? (s.receita / totalAno) * 100 : 0,
      };
    });
    // Dependia de nada: ao trocar de canal, a tabela não recalculava.
  }, [SEMANAS]);

  const participacaoMaxima = React.useMemo(
    () => linhas.reduce((m, l) => Math.max(m, l.participacao), 0),
    [linhas]
  );

  const exibidas = React.useMemo(
    () => (escopo === "dados" ? linhas.filter((l) => l.comDados) : linhas),
    [linhas, escopo]
  );

  /* ── tabela cruzada: semanas nas colunas ────────────────── */

  const colunasMatriz: ColunaMatriz[] = React.useMemo(
    () =>
      exibidas.map((s) => ({
        chave: s.rotulo,
        rotulo: s.rotulo,
        sub: s.intervalo,
        parcial: s.parcial,
      })),
    [exibidas]
  );

  /*
   * Semana sem dado devolve null, não zero. Zero é uma afirmação — "não
   * vendeu" — e aqui o que houve foi ausência de importação. A diferença
   * decide se alguém vai investigar a operação ou o arquivo.
   */
  const nulo = (s: SemanaVendas, v: number) => (s.comDados ? v : null);

  const INDICADORES: IndicadorMatriz<SemanaVendas>[] = React.useMemo(
    () => [
      {
        chave: "receita",
        rotulo: "Receita",
        destaque: true,
        valor: (s) => nulo(s, s.receita),
        formato: (v) => money(v),
      },
      {
        chave: "liquida",
        rotulo: "Receita líquida",
        dica: "descontando cancelamentos",
        valor: (s) => nulo(s, s.receitaLiquida),
        formato: (v) => money(v),
      },
      {
        chave: "pedidos",
        rotulo: "Pedidos",
        destaque: true,
        valor: (s) => nulo(s, s.pedidos),
        formato: (v) => count(v),
      },
      {
        chave: "ticket",
        rotulo: "Ticket médio",
        valor: (s) => (s.comDados && s.pedidos ? s.ticket : null),
        formato: (v) => money(v),
      },
      {
        chave: "visitas",
        rotulo: "Visitas",
        valor: (s) => (s.comDados && s.visitas ? s.visitas : null),
        formato: (v) => count(v),
      },
      {
        chave: "conversao",
        rotulo: "Conversão",
        dica: "pedidos por visita",
        valor: (s) => (s.comDados && s.visitas ? s.conversao : null),
        formato: (v) => pct(v, 2),
      },
      {
        chave: "ads",
        rotulo: "Investimento em ADS",
        menorMelhor: true,
        valor: (s) => (s.comDados && s.ads ? s.ads : null),
        formato: (v) => money(v),
      },
      {
        chave: "tacos",
        rotulo: "TACOS",
        dica: "mídia sobre receita total",
        menorMelhor: true,
        valor: (s) => (s.comDados && s.ads ? s.tacos : null),
        formato: (v) => pct(v, 2),
      },
      {
        chave: "cancelado",
        rotulo: "Valor cancelado",
        menorMelhor: true,
        valor: (s) => nulo(s, s.cancelado),
        formato: (v) => money(v),
      },
      {
        chave: "pedCanc",
        rotulo: "Pedidos cancelados",
        menorMelhor: true,
        valor: (s) => nulo(s, s.pedidosCancelados),
        formato: (v) => count(v),
      },
    ],
    []
  );

  /* ── série do gráfico + média móvel de 4 semanas ───────── */

  const serie = React.useMemo(() => {
    return exibidas.map((s, i) => {
      const janela = exibidas
        .slice(Math.max(0, i - 3), i + 1)
        .filter((x) => x.comDados);
      return {
        titulo: s.titulo,
        parcial: s.parcial,
        valor: s.comDados ? s[metrica.id] : 0,
        media:
          s.comDados && janela.length > 0
            ? janela.reduce((t, x) => t + x[metrica.id], 0) / janela.length
            : null,
      };
    });
  }, [exibidas, metrica]);

  /* ── destaques do topo ─────────────────────────────────── */

  const resumo = React.useMemo(() => {
    const valor = (s: SemanaVendas) => s[metrica.id];
    const fechadas = SEMANAS_FECHADAS;

    const melhor = fechadas.reduce((a, b) => (valor(b) > valor(a) ? b : a));
    const pior = fechadas.reduce((a, b) => (valor(b) < valor(a) ? b : a));

    const somaReceita = fechadas.reduce((t, s) => t + s.receita, 0);
    const somaPedidos = fechadas.reduce((t, s) => t + s.pedidos, 0);
    const somaVisitas = fechadas.reduce((t, s) => t + s.visitas, 0);

    let media: number;
    if (metrica.id === "ticket") media = somaPedidos ? somaReceita / somaPedidos : 0;
    else if (metrica.id === "conversao")
      media = somaVisitas ? (somaPedidos / somaVisitas) * 100 : 0;
    else
      media =
        fechadas.reduce((t, s) => t + valor(s), 0) / Math.max(1, fechadas.length);

    const atual = linhas.find((l) => l.n === SEMANA_ATUAL)!;
    const spark = fechadas.slice(-12).map(valor);

    return { melhor, pior, media, atual, spark, fechadas };
  }, [metrica, linhas]);

  /* ── colunas ───────────────────────────────────────────── */

  const colunas: Column<Linha>[] = [
    {
      key: "semana",
      header: "Semana",
      mobile: "title",
      sticky: true,
      width: "128px",
      sortValue: (l) => l.n,
      cell: (l) => (
        <span className="flex items-center gap-2 min-w-0">
          <span
            className={
              "num " +
              (l.parcial
                ? "text-brand font-semibold"
                : l.comDados
                  ? "text-ink font-medium"
                  : "text-ink-3")
            }
          >
            {l.rotulo}
          </span>
          {l.parcial && <Badge tone="brand">atual</Badge>}
        </span>
      ),
    },
    {
      key: "periodo",
      header: "Período",
      mobile: "subtitle",
      width: "150px",
      sortValue: (l) => l.n,
      cell: (l) => (
        <span className="num text-[12px] text-ink-3 whitespace-nowrap">
          {l.intervalo}
        </span>
      ),
    },
    {
      key: "receita",
      header: "Receita",
      align: "right",
      mobile: "metric",
      width: "132px",
      sortValue: (l) => l.receita,
      cell: (l) =>
        l.receita > 0 ? (
          <span className="num font-semibold text-ink">{money(l.receita)}</span>
        ) : (
          <Vazio />
        ),
    },
    {
      key: "pedidos",
      header: "Pedidos",
      align: "right",
      mobile: "metric",
      width: "96px",
      sortValue: (l) => l.pedidos,
      cell: (l) =>
        l.pedidos > 0 ? <span className="num">{count(l.pedidos)}</span> : <Vazio />,
    },
    {
      key: "ticket",
      header: "Ticket",
      align: "right",
      width: "112px",
      sortValue: (l) => l.ticket,
      cell: (l) =>
        l.ticket > 0 ? <span className="num">{money(l.ticket)}</span> : <Vazio />,
    },
    {
      key: "visitas",
      header: "Visitas",
      align: "right",
      width: "110px",
      sortValue: (l) => l.visitas,
      cell: (l) =>
        l.visitas > 0 ? <span className="num">{count(l.visitas)}</span> : <Vazio />,
    },
    {
      key: "conversao",
      header: "Conversão",
      align: "right",
      width: "108px",
      sortValue: (l) => l.conversao,
      cell: (l) =>
        l.conversao > 0 ? (
          <span
            className={
              "num " + (l.conversao >= 1.9 ? "text-up font-semibold" : "text-ink-2")
            }
          >
            {pct(l.conversao, 2)}
          </span>
        ) : (
          <Vazio />
        ),
    },
    {
      key: "wow",
      header: "WoW",
      align: "right",
      mobile: "metric",
      width: "104px",
      sortValue: (l) => l.wow ?? -9999,
      cell: (l) => (l.wow === null ? <Vazio /> : <Delta value={l.wow} />),
    },
    {
      key: "participacao",
      header: "Part. no ano",
      align: "right",
      width: "150px",
      sortValue: (l) => l.participacao,
      cell: (l) => (
        <BarraParticipacao valor={l.participacao} maximo={participacaoMaxima} />
      ),
    },
  ];

  const comDados = linhas.filter((l) => l.comDados).length;

  return (
    <>
      <PageHeader
        title="Semanal"
        breadcrumb="Vendas"
        description={`${TOTAL_SEMANAS} semanas de ${ANO} · segunda a domingo · dados até S${SEMANA_ATUAL}`}
        actions={
          <Button
            size="sm"
            className="md:hidden"
            onClick={() => setFiltrosAbertos(true)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filtros
          </Button>
        }
        filters={
          <>
            <SeletorCanal
              canais={dados.canais}
              valor={canal}
              onChange={setCanal}
            />
            <Segmented<MetricaId>
              options={OPCOES_METRICA}
              value={metricaId}
              onChange={setMetricaId}
            />
            <div className="hidden md:block">
              <Segmented<Escopo>
                options={OPCOES_ESCOPO}
                value={escopo}
                onChange={setEscopo}
              />
            </div>
            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {comDados} de {TOTAL_SEMANAS} semanas com movimento
            </span>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label={`Melhor semana · ${metrica.label}`}
            value={metrica.fmt(resumo.melhor[metrica.id])}
            hint={`${resumo.melhor.rotulo} · ${resumo.melhor.intervalo}`}
          />
          <StatTile
            label={`Pior semana · ${metrica.label}`}
            value={metrica.fmt(resumo.pior[metrica.id])}
            hint={`${resumo.pior.rotulo} · ${resumo.pior.intervalo}`}
          />
          <StatTile
            label="Média semanal"
            value={metrica.fmt(resumo.media)}
            hint={`${resumo.fechadas.length} semanas fechadas`}
            spark={resumo.spark}
          />
          <StatTile
            label="Semana atual"
            value={metrica.fmt(resumo.atual[metrica.id])}
            delta={resumo.atual.wow ?? undefined}
            hint={`${resumo.atual.rotulo} · em curso`}
          />
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader
            title={metrica.titulo}
            hint="barras da semana · linha da média móvel de 4 semanas"
          />
          <div className="px-2 pt-4 pb-3">
            <div className="h-[240px] md:h-[288px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={serie}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis
                    dataKey="titulo"
                    {...AXIS}
                    interval="preserveStartEnd"
                    tickFormatter={(v) => String(v).split(" ·")[0]}
                  />
                  <YAxis
                    {...AXIS}
                    width={metrica.larguraEixo}
                    tickFormatter={(v) => metrica.eixo(Number(v))}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--panel-3)" }}
                    content={<ChartTooltip formatter={(v) => metrica.fmt(v)} />}
                  />
                  <Bar
                    dataKey="valor"
                    name={metrica.label}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  >
                    {serie.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.parcial ? "var(--s5)" : "var(--s1)"}
                      />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="media"
                    name="Média 4 semanas"
                    stroke="var(--s3)"
                    strokeWidth={1.75}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <Legend
              className="px-2 pt-3"
              items={[
                { label: metrica.label, color: "var(--s1)" },
                { label: "Média móvel de 4 semanas", color: "var(--s3)" },
                { label: "Semana em curso", color: "var(--s5)" },
              ]}
            />
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Semana a semana"
            hint="Semanas nas colunas · indicadores nas linhas · a seta compara com a semana à esquerda"
            action={
              <span className="num text-[12px] text-ink-3">
                {exibidas.length} semanas
              </span>
            }
          />
          <Matriz
            colunas={colunasMatriz}
            periodos={exibidas}
            indicadores={INDICADORES}
          />
        </Panel>

        {/* a lista continua disponível para quem quiser ordenar por métrica */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Lista ordenável"
            hint="Mesmo dado, uma linha por semana — para ordenar por qualquer indicador"
          />
          <DataTable
            columns={colunas}
            rows={exibidas}
            rowKey={(l) => l.rotulo}
            defaultSort={{ key: "semana", dir: "asc" }}
          />
        </Panel>
      </PageBody>

      {filtrosAbertos && (
        <FilterSheet
          onClose={() => setFiltrosAbertos(false)}
          onClear={() => setEscopo("todas")}
          applyLabel={`Ver ${exibidas.length} semanas`}
        >
          <div>
            <p className="label mb-2">Semanas exibidas</p>
            <div className="flex flex-col gap-2">
              {OPCOES_ESCOPO.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setEscopo(o.value)}
                  className={
                    "h-11 px-3 rounded-r1 border text-[13px] font-medium text-left transition-colors " +
                    (escopo === o.value
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label mb-2">Métrica do gráfico</p>
            <div className="grid grid-cols-2 gap-2">
              {METRICAS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMetricaId(m.id)}
                  className={
                    "h-11 px-3 rounded-r1 border text-[13px] font-medium transition-colors " +
                    (metricaId === m.id
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </FilterSheet>
      )}
    </>
  );
}
