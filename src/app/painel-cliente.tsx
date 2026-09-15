"use client";

import Link from "next/link";
import * as React from "react";
import {
  PageHeader,
  PageBody,
} from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Delta } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SeletorCanal } from "@/components/ui/seletor-canal";
import { type Anuncio } from "@/mock";
import type { DadosPainel } from "@/lib/dados/painel";
import { recortar } from "@/lib/periodo";
import { FilaRecomendacoes } from "@/components/painel/fila-recomendacoes";
import { PainelExclusoes } from "@/components/ui/exclusoes";
import { FontesDados } from "@/components/painel/fontes-dados";
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
  /** "" = consolidado. Aceita item de canal (`grupo:…`) ou de conta. */
  const [canalSel, setCanalSel] = React.useState("");

  const {
    canaisSemanas: CANAIS_12_SEMANAS,
    canalCores: CANAL_CORES,
    canalNomes: CANAL_NOMES,
    anuncios: ANUNCIOS,
  } = dados;

  const canalAtual = dados.canaisInfo.find((c) => c.id === canalSel);

  /*
   * Quais slugs de linha o recorte cobre.
   *
   * Um item de CANAL soma as contas que ele agrupa; um item de CONTA é ele
   * mesmo. Nulo quer dizer consolidado, e aí nada é filtrado — que é o
   * comportamento que a tela sempre teve.
   */
  const idsDoRecorte = React.useMemo(() => {
    if (!canalSel) return null;
    const c = dados.canaisInfo.find((x) => x.id === canalSel);
    return new Set(c?.agrupa?.length ? c.agrupa : [canalSel]);
  }, [canalSel, dados.canaisInfo]);

  const linhasDoRecorte = React.useMemo(
    () =>
      idsDoRecorte ? dados.linhas.filter((l) => idsDoRecorte.has(l.canalId)) : dados.linhas,
    [dados.linhas, idsDoRecorte]
  );

  /*
   * KPIs, canais e a curva de faturamento saem do período escolhido. Antes
   * vinham prontos numa janela fixa de 30 dias, e o seletor só pintava o
   * botão — clicar em "Ano" mudava a cor e não o número.
   */
  const recorte = React.useMemo(
    () => recortar(linhasDoRecorte, dados.canaisInfo, periodo),
    [linhasDoRecorte, dados.canaisInfo, periodo]
  );

  /*
   * Houve visita registrada no recorte?
   *
   * Sem isso, "conversão 0,00%" é lido como "ninguém comprou", quando o
   * que aconteceu foi "não sei quantos entraram". As duas leituras pedem
   * ações opostas — uma manda mexer no anúncio, a outra manda arrumar a
   * importação de visitas.
   */
  const temVisitas = React.useMemo(
    () => linhasDoRecorte.some((l) => l.visitas > 0),
    [linhasDoRecorte]
  );
  const KPIS = recorte.kpis;
  /*
   * Os painéis de canal ficam SEMPRE no consolidado.
   *
   * Eles existem para comparar um canal com os outros; recortados num
   * canal só, viram uma barra de 100% e uma linha na tabela, o que não
   * responde nada. Então os KPIs e a curva acompanham o seletor, e a
   * comparação entre canais continua inteira embaixo.
   */
  const recorteTodos = React.useMemo(
    () =>
      idsDoRecorte ? recortar(dados.linhas, dados.canaisInfo, periodo) : recorte,
    [idsDoRecorte, dados.linhas, dados.canaisInfo, periodo, recorte]
  );
  const CANAIS = recorteTodos.canais;
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

  const topSkus = React.useMemo(() => {
    const doRecorte = idsDoRecorte
      ? ANUNCIOS.filter((a) => a.canalId && idsDoRecorte.has(a.canalId))
      : ANUNCIOS;
    return [...doRecorte].sort((a, b) => b.receita - a.receita).slice(0, 8);
  }, [ANUNCIOS, idsDoRecorte]);

  /**
   * O "Ver todos" leva o recorte junto.
   *
   * A Análise de SKU fala em uuid (`conta:<uuid>` ou o uuid do canal); o
   * painel fala em slug. A tradução acontece aqui, e não no servidor,
   * porque é só para montar um link.
   */
  const linkVerTodos = React.useMemo(() => {
    if (!canalAtual) return "/vendas/skus";
    if (canalAtual.contaCanalId) return `/vendas/skus?canal=conta:${canalAtual.contaCanalId}`;
    const canal = dados.canaisDisponiveis.find((c) => c.nome === canalAtual.nome);
    return canal ? `/vendas/skus?canal=${canal.id}` : "/vendas/skus";
  }, [canalAtual, dados.canaisDisponiveis]);

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
      // Mesma regra do KPI: sem visita a conversão é desconhecida, não zero.
      cell: (r) =>
        r.visitas > 0 ? (
          <span className="num">{pct(r.conversao, 2)}</span>
        ) : (
          <span className="text-ink-3" title="sem visita registrada para este anúncio">
            —
          </span>
        ),
      sortValue: (r) => (r.visitas > 0 ? r.conversao : -1),
      width: "110px",
    },
  ];

  return (
    <>
      <PageHeader
        title="Visão geral"
        description={
          canalAtual ? canalAtual.nome : "Consolidado de todos os canais"
        }
        actions={
          <>
            <span className="num hidden sm:inline-flex items-center gap-1.5 text-[12px] text-ink-3">
              <CalendarDays className="w-3.5 h-3.5" />
              {recorte.intervalo}
            </span>
          </>
        }
        filters={
          <>
            {/*
              * Seletor de canal E de conta: `canaisInfo` já traz o item do
              * canal inteiro e, abaixo, cada conta. No consolidado a alta
              * de um canal cobre a queda de outro e a semana parece
              * estável — só olhando um por vez dá para responder "quem
              * caiu".
              */}
            <SeletorCanal
              canais={dados.canaisInfo.map((c) => ({
                id: c.id,
                nome: c.nome,
                cor: c.cor,
              }))}
              valor={canalSel}
              onChange={setCanalSel}
              rotuloTodos="Todos os canais"
            />
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
          </>
        }
      />

      <PageBody>
        {/* O que mudou e merece decisão — antes dos totais */}
        {/* Antes dos números: até onde o dado vai decide se dá para
            confiar no que vem abaixo. */}
        <FontesDados dados={dados.fontes} />

        <FilaRecomendacoes itens={dados.recomendacoes} />

        <PainelExclusoes
          exclusoes={dados.exclusoes}
          canais={dados.canaisDisponiveis}
          removidas={dados.removidas}
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {KPIS.map((k) => {
            /*
             * Conversão sem visita não é zero, é desconhecido. Mostrar
             * "0,00%" aqui faz o número ser lido como "ninguém comprou" —
             * e alguém mexe no anúncio quando o problema é a importação
             * de visitas não ter chegado.
             */
            const semBase = k.id === "conversao" && !temVisitas;
            return (
              <StatTile
                key={k.id}
                label={k.label}
                value={semBase ? "—" : formatKpi(k.value, k.format)}
                delta={semBase ? undefined : k.delta}
                inverse={k.inverse}
                hint={semBase ? "sem visita registrada no recorte" : k.hint}
                spark={semBase ? undefined : k.spark}
              />
            );
          })}
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
            <PanelHeader
              title="Participação por canal"
              hint={
                canalAtual ? "12 semanas · todos os canais" : "12 semanas"
              }
            />
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
              hint={canalAtual ? `no período · ${canalAtual.nome}` : "no período"}
              action={
                <Link
                  href={linkVerTodos}
                  className="h-7 px-2 inline-flex items-center rounded-r1 text-[12.5px] text-ink-2 hover:bg-panel-3 hover:text-ink transition-colors"
                >
                  Ver todos
                </Link>
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
          <PanelHeader
            title="Canais"
            hint={
              canalAtual
                ? "faturamento e variação no período · todos os canais, para comparar"
                : "faturamento e variação no período"
            }
          />
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
