"use client";

import Link from "next/link";
import * as React from "react";
import {
  PageHeader,
  PageBody,
} from "@/components/layout/app-shell";
import { Panel, PanelHeader, Delta } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SeletorCanal } from "@/components/ui/seletor-canal";
import { BarraFiltros, Filtro } from "@/components/layout/barra-filtros";
import { type Anuncio } from "@/mock";
import type { DadosPainel } from "@/lib/dados/painel";
import { recortar } from "@/lib/periodo";
import { FilaRecomendacoes } from "@/components/painel/fila-recomendacoes";
import { PainelExclusoes } from "@/components/ui/exclusoes";
import { SkusEmQueda } from "@/components/painel/skus-em-queda";
import { PulsoOperacao } from "@/components/painel/pulso-operacao";
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
import { CalendarDays, ArrowUpRight, ChevronDown } from "lucide-react";

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
        <span className="block min-w-[220px] max-w-[340px] font-medium text-ink [overflow-wrap:anywhere]">
          {r.titulo}
        </span>
      ),
      sortValue: (r) => r.titulo,
      sticky: true,
    },
    {
      key: "sku",
      header: "SKU",
      mobile: "subtitle",
      cell: (r) => <span className="num text-[12px] text-ink-3">{r.sku}</span>,
      sortValue: (r) => r.sku,
      width: "92px",
    },
    {
      key: "vendas",
      header: "Vendas",
      align: "right",
      mobile: "metric",
      cell: (r) => <span className="num">{count(r.vendas)}</span>,
      sortValue: (r) => r.vendas,
      width: "72px",
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
      width: "120px",
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
      width: "96px",
    },
  ];

  return (
    <>
      <PageHeader
        title="Visão geral"
        inlineFilters
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 tabular-nums">
              <CalendarDays className="w-3.5 h-3.5" />
              {recorte.intervalo}
            </span>
          </>
        }
        filters={
          <BarraFiltros>
            {/*
              Seletor de canal E de conta: `canaisInfo` já traz o item do
              canal inteiro e, abaixo, cada conta. No consolidado a alta de
              um canal cobre a queda de outro e a semana parece estável —
              só olhando um por vez dá para responder "quem caiu".
            */}
            <Filtro rotulo="Canal" composto>
              <SeletorCanal
                compact
                canais={dados.canaisInfo.map((c) => ({
                  id: c.id,
                  nome: c.nome,
                  cor: c.cor,
                }))}
                valor={canalSel}
                onChange={setCanalSel}
                rotuloTodos="Todos os canais"
              />
            </Filtro>
            <Filtro rotulo="Período" composto>
              <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-r1 bg-panel-3 p-1" role="group" aria-label="Período de análise">
                {PERIODOS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={periodo === p}
                    onClick={() => setPeriodo(p)}
                    className={
                      "min-h-9 px-3 rounded-[6px] text-[14px] font-medium transition-colors whitespace-nowrap " +
                      (periodo === p
                        ? "bg-panel text-brand"
                        : "text-ink-3 hover:text-ink")
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Filtro>
          </BarraFiltros>
        }
      />

      <PageBody className="home-overview">
        {/* Fontes ficam em Integrações por decisão do usuário. Aqui, só o aviso de atraso. */}
        {dados.fontes.piorAtraso !== null && dados.fontes.piorAtraso >= 2 && (
          <Link
            href="/integracoes"
            className="flex items-center justify-between gap-3 rounded-r2 border border-warn/40 bg-[var(--warn-wash)] px-4 py-2.5 text-[13px] text-ink hover:border-warn"
          >
            <span>
              Algum dado do painel está {dados.fontes.piorAtraso} dias atrasado. Os números abaixo podem estar incompletos.
            </span>
            <span className="shrink-0 font-medium text-brand">Ver fontes</span>
          </Link>
        )}

        <PainelExclusoes
          exclusoes={dados.exclusoes}
          canais={dados.canaisDisponiveis}
          removidas={dados.removidas}
        />

        <PulsoOperacao recorte={recorte} />
        <FilaRecomendacoes itens={dados.recomendacoes} semDados={dados.vazio} />
        <section aria-label="Indicadores do período" className="home-metric-strip grid min-w-0 grid-cols-1 gap-px overflow-hidden rounded-r2 border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          {KPIS.filter((k) => k.id !== "faturamento" && k.id !== "pedidos").map((k) => {
            /*
             * Conversão sem visita não é zero, é desconhecido. Mostrar
             * "0,00%" aqui faz o número ser lido como "ninguém comprou" —
             * e alguém mexe no anúncio quando o problema é a importação
             * de visitas não ter chegado.
             */
            const semBase = recorte.dias === 0 || (k.id === "conversao" && !temVisitas);
            return (
              <StatTile
                key={k.id}
                label={k.label}
                value={semBase ? "—" : formatKpi(k.value, k.format)}
                delta={semBase ? undefined : k.delta}
                inverse={k.inverse}
                hint={semBase ? recorte.dias === 0 ? "Sem dados neste recorte" : "sem visita registrada no recorte" : k.hint}
                spark={semBase ? undefined : k.spark}
                ajuda={k.ajuda}
                className="!rounded-none !border-0 !bg-panel !px-4 !py-5 !shadow-none"
              />
            );
          })}
        </section>

        <details className="home-history group min-w-0 border-y border-line py-1"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-medium text-ink-2">Histórico de vendas <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
        <div className="gerizo-overview-charts grid grid-cols-1 xl:grid-cols-3 gap-3">
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
            <div className="h-[220px] xl:h-[180px] px-2 pt-3 pb-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={FATURAMENTO_30D}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis
                    dataKey="data"
                    {...AXIS}
                    tickFormatter={shortDate}
                    minTickGap={24}
                  />
                  <YAxis
                    {...AXIS}
                    width="auto"
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
                    type="linear"
                    dataKey="faturamento"
                    name="Faturamento"
                    stroke="var(--brand)"
                    strokeWidth={2.5}
                    fill="var(--brand-wash)"
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
            <div className="h-[190px] xl:h-[140px] px-2 pt-3">
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
            <details className="border-t border-line text-[12px] text-ink-2">
              <summary className="flex min-h-11 cursor-pointer items-center px-4">Ver dados por canal e semana</summary>
              <div className="max-h-80 overflow-auto border-t border-line" tabIndex={0} role="region" aria-label="Participação por canal nas últimas 12 semanas">
                <table className="w-full border-collapse text-[12px] tabular-nums">
                  <caption className="sr-only">Faturamento semanal por canal em milhares de reais</caption>
                  <thead className="sticky top-0 bg-panel-2"><tr><th scope="col" className="px-3 py-2 text-left font-medium">Semana</th>{canaisNaSerie.map((canal) => <th key={canal} scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">{CANAL_NOMES[canal]} · R$ mil</th>)}</tr></thead>
                  <tbody>{CANAIS_12_SEMANAS.map((semana) => <tr key={semana.semana} className="border-t border-line"><th scope="row" className="px-3 py-2 text-left font-normal">{semana.semana}</th>{canaisNaSerie.map((canal) => <td key={canal} className="px-3 py-2 text-right">{semana[canal] == null ? "—" : Number(semana[canal]).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </details>
          </Panel>
        </div>

        </details>


        {/* Top SKUs e canais lado a lado, como na referência aprovada. */}
        <div className="home-insights grid grid-cols-1 gap-5 items-start xl:grid-cols-5">
          <Panel className="overflow-hidden xl:col-span-3 min-w-0">
            <PanelHeader
              title="Produtos com maior receita"
              hint={canalAtual ? `no período · ${canalAtual.nome}` : "no período"}
              action={
                <div className="flex flex-wrap items-center gap-3">
                <Link href="/produtos" className="inline-flex min-h-11 items-center gap-1 text-[14px] text-ink-2 hover:text-brand">Comparar <ArrowUpRight size={14} aria-hidden="true" /></Link>
                <Link
                  href={linkVerTodos}
                  className="inline-flex min-h-11 items-center gap-1 text-[14px] font-medium text-brand hover:underline"
                >
                  Ver todos <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
                </div>
              }
            />
            <DataTable
              columns={colunas}
              rows={topSkus}
              rowKey={(r) => r.mlb}
              defaultSort={{ key: "receita", dir: "desc" }}
            />
          </Panel>

        {/* Resumo dos canais — lista, um por linha: cabe na coluna estreita e
            o olho desce comparando receita e variação na mesma vertical. */}
        <Panel className="order-first min-w-0 overflow-hidden xl:order-none xl:col-span-2">
          <PanelHeader
            title="Canais"
            hint={
              canalAtual
                ? "no período · todos os canais"
                : "faturamento no período"
            }
          />
          <ul className="divide-y divide-line">
            {CANAIS.map((c) => (
              <li key={c.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-4">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-[2px]" style={{ background: CANAL_CORES[c.id] }} aria-hidden="true" />
                  <span className="text-[14px] font-medium text-ink [overflow-wrap:anywhere]">{c.nome}</span>
                </div>
                <span className="text-right text-[14px] font-semibold text-ink tabular-nums [overflow-wrap:anywhere]">{money(c.faturamento)}</span>
                <span className="pl-4 text-[12px] text-ink-3 tabular-nums">{pct(c.participacao)} do total</span>
                <span className="text-right">
                  <Delta value={c.delta} />
                </span>
                <span className="col-span-2 ml-4 h-1 overflow-hidden rounded-full bg-panel-3" aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${c.participacao}%`, background: CANAL_CORES[c.id] }} /></span>
              </li>
            ))}
          </ul>
        </Panel>
        </div>
        {/*
          Quedas por SKU no fim: os totais dizem QUANTO, esta seção diz
          ONDE. Vem depois porque só faz sentido depois de saber que caiu.
        */}
        <SkusEmQueda itens={dados.quedas} semDados={dados.vazio} />
      </PageBody>
    </>
  );
}
