"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { Input, Progress, KeyValue } from "@/components/ui/controls";
import { AXIS, GRID, ChartTooltip, Legend } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { money, moneyShort, pct } from "@/lib/format";
import {
  ANO as __ANO,
  CANAIS_META as __CANAIS_META,
  CANAIS_META_IDS as __CANAIS_META_IDS,
  DATA_CORTE as __DATA_CORTE,
  FRACAO_ANO_DECORRIDA as __FRACAO_ANO_DECORRIDA,
  MESES_CURTOS as __MESES_CURTOS,
  MESES_LONGOS as __MESES_LONGOS,
  MES_ATUAL as __MES_ATUAL,
  META_ANUAL_SUGERIDA as __META_ANUAL_SUGERIDA,
  PARTICIPACAO as __PARTICIPACAO,
  PESOS_NORMALIZADOS as __PESOS_NORMALIZADOS,
  PESOS_SAZONAIS as __PESOS_SAZONAIS,
  REALIZADO as __REALIZADO,
  REALIZADO_ANO as __REALIZADO_ANO,
  REALIZADO_ANTERIOR_TOTAL as __REALIZADO_ANTERIOR_TOTAL,
  REALIZADO_ANO_TOTAL as __REALIZADO_ANO_TOTAL,
  REALIZADO_TOTAL as __REALIZADO_TOTAL,
  type CanalMetaId,
} from "@/mock/metas";
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
import { CalendarRange, Equal, Eraser, Target } from "lucide-react";

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
const ANO = zerar(__ANO);
const CANAIS_META = zerar(__CANAIS_META);
const CANAIS_META_IDS = zerar(__CANAIS_META_IDS);
const DATA_CORTE = zerar(__DATA_CORTE);
const FRACAO_ANO_DECORRIDA = zerar(__FRACAO_ANO_DECORRIDA);
const MESES_CURTOS = zerar(__MESES_CURTOS);
const MESES_LONGOS = zerar(__MESES_LONGOS);
const MES_ATUAL = zerar(__MES_ATUAL);
const META_ANUAL_SUGERIDA = zerar(__META_ANUAL_SUGERIDA);
const PARTICIPACAO = zerar(__PARTICIPACAO);
const PESOS_NORMALIZADOS = zerar(__PESOS_NORMALIZADOS);
const PESOS_SAZONAIS = zerar(__PESOS_SAZONAIS);
const REALIZADO = zerar(__REALIZADO);
const REALIZADO_ANO = zerar(__REALIZADO_ANO);
const REALIZADO_ANTERIOR_TOTAL = zerar(__REALIZADO_ANTERIOR_TOTAL);
const REALIZADO_ANO_TOTAL = zerar(__REALIZADO_ANO_TOTAL);
const REALIZADO_TOTAL = zerar(__REALIZADO_TOTAL);


/* ══ apoio local ═════════════════════════════════════════════ */

type Grade = Record<CanalMetaId, number[]>;

/** Lê um número digitado em pt-BR: "1.284.530,40" → 1284530.4 */
function parseNum(texto: string): number {
  const limpo = texto.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const v = Number.parseFloat(limpo);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Inteiro sem símbolo, do jeito que se digita numa planilha. */
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Faixa de atingimento — a mesma regra em toda a tela. */
function faixaMeta(v: number): "up" | "warn" | "down" {
  if (v >= 100) return "up";
  if (v >= 80) return "warn";
  return "down";
}

const TEXTO_META: Record<"up" | "warn" | "down", string> = {
  up: "text-up",
  warn: "text-warn",
  down: "text-down",
};

const zeros = () => Array.from({ length: 12 }, () => 0);

/** Rateia um total anual pelos canais (participação no realizado) e pelos meses. */
function distribuir(total: number, sazonal: boolean): Grade {
  const g = {} as Grade;
  for (const id of CANAIS_META_IDS) {
    const doCanal = total * PARTICIPACAO[id];
    g[id] = PESOS_NORMALIZADOS.map((peso) =>
      Math.round(sazonal ? doCanal * peso : doCanal / 12)
    );
  }
  return g;
}

function gradeVazia(): Grade {
  const g = {} as Grade;
  for (const id of CANAIS_META_IDS) g[id] = zeros();
  return g;
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

/* ══ célula editável ═════════════════════════════════════════
   Enquanto o campo está em foco mostra o número cru, para digitar sem
   brigar com o separador de milhar; ao sair, volta formatado.
   ══════════════════════════════════════════════════════════════ */

function CelulaMeta({
  valor,
  onChange,
  rotulo,
  className,
}: {
  valor: number;
  onChange: (v: number) => void;
  rotulo: string;
  className?: string;
}) {
  const [rascunho, setRascunho] = React.useState<string | null>(null);

  return (
    <Input
      inputMode="decimal"
      aria-label={rotulo}
      placeholder="0"
      value={rascunho ?? (valor ? inteiro.format(valor) : "")}
      onFocus={(e) => {
        setRascunho(valor ? String(Math.round(valor)) : "");
        e.currentTarget.select();
      }}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={() => {
        onChange(parseNum(rascunho ?? ""));
        setRascunho(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={cn("h-11 md:h-8 text-[13px]", className)}
    />
  );
}

/* ══ Tela ════════════════════════════════════════════════════ */

export default function VendasMetas() {
  const estreito = useEstreito();

  const [alvoTexto, setAlvoTexto] = React.useState(
    inteiro.format(META_ANUAL_SUGERIDA)
  );
  const [grade, setGrade] = React.useState<Grade>(() =>
    distribuir(META_ANUAL_SUGERIDA, true)
  );
  const [ultimoCriterio, setUltimoCriterio] = React.useState<
    "sazonal" | "igual" | "manual" | "zerado"
  >("sazonal");

  const alvo = parseNum(alvoTexto);

  /* ── derivadas da grade ─────────────────────────────────── */

  const totalPorCanal = React.useMemo(() => {
    const t = {} as Record<CanalMetaId, number>;
    for (const id of CANAIS_META_IDS)
      t[id] = grade[id].reduce((a, b) => a + b, 0);
    return t;
  }, [grade]);

  const totalPorMes = React.useMemo(
    () =>
      MESES_CURTOS.map((_, m) =>
        CANAIS_META_IDS.reduce((s, id) => s + grade[id][m], 0)
      ),
    [grade]
  );

  const metaAnual = React.useMemo(
    () => totalPorMes.reduce((a, b) => a + b, 0),
    [totalPorMes]
  );

  const pctAtingido = metaAnual ? (REALIZADO_ANO_TOTAL / metaAnual) * 100 : 0;
  const projecao = FRACAO_ANO_DECORRIDA
    ? REALIZADO_ANO_TOTAL / FRACAO_ANO_DECORRIDA
    : 0;
  const pctProjecao = metaAnual ? (projecao / metaAnual) * 100 : 0;
  const deltaRealizado = REALIZADO_ANTERIOR_TOTAL
    ? ((REALIZADO_ANO_TOTAL - REALIZADO_ANTERIOR_TOTAL) /
        REALIZADO_ANTERIOR_TOTAL) *
      100
    : 0;

  /** A grade pode ter sido editada célula a célula e se afastar do alvo. */
  const desvioDoAlvo = alvo ? ((metaAnual - alvo) / alvo) * 100 : 0;
  const foraDoAlvo = alvo > 0 && Math.abs(desvioDoAlvo) >= 0.5;

  const dadosGrafico = React.useMemo(() => {
    let accMeta = 0;
    let accReal = 0;
    return MESES_CURTOS.map((rotulo, m) => {
      accMeta += totalPorMes[m];
      const temDados = m <= MES_ATUAL;
      if (temDados) accReal += REALIZADO_TOTAL[m];
      return {
        mes: rotulo,
        meta: totalPorMes[m],
        realizado: temDados ? REALIZADO_TOTAL[m] : null,
        metaAcumulada: accMeta,
        realizadoAcumulado: temDados ? accReal : null,
      };
    });
  }, [totalPorMes]);

  /* ── ações ──────────────────────────────────────────────── */

  function aplicar(sazonal: boolean) {
    if (!alvo) return;
    setGrade(distribuir(alvo, sazonal));
    setUltimoCriterio(sazonal ? "sazonal" : "igual");
  }

  function zerar() {
    setGrade(gradeVazia());
    setAlvoTexto("");
    setUltimoCriterio("zerado");
  }

  function editar(id: CanalMetaId, mes: number, valor: number) {
    setGrade((g) => {
      if (g[id][mes] === valor) return g;
      const linha = [...g[id]];
      linha[mes] = valor;
      return { ...g, [id]: linha };
    });
    setUltimoCriterio("manual");
  }

  const NOTA_CRITERIO: Record<typeof ultimoCriterio, string> = {
    sazonal: "distribuída pela sazonalidade do varejo",
    igual: "dividida em doze partes iguais",
    manual: "ajustada célula a célula",
    zerado: "ainda sem valores",
  };

  return (
    <>
      <PageHeader
        title="Metas de receita"
        breadcrumb="Vendas"
        description={`${ANO} · meta ${NOTA_CRITERIO[ultimoCriterio]} · valores em R$`}
        actions={
          <Badge tone={faixaMeta(pctAtingido)}>
            <span className="num">{pct(pctAtingido)}</span>
            <span className="ml-1 font-medium hidden sm:inline">da meta</span>
          </Badge>
        }
      />

      <PageBody>
        {/* ── Indicadores ──────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Meta anual"
            value={moneyShort(metaAnual)}
            hint={`${CANAIS_META.length} canais × 12 meses`}
          />
          <StatTile
            label={`Realizado até ${DATA_CORTE}`}
            value={moneyShort(REALIZADO_ANO_TOTAL)}
            delta={deltaRealizado}
            hint="vs. mesmo período do ano anterior"
            spark={REALIZADO_TOTAL.slice(0, MES_ATUAL + 1)}
          />
          <StatTile
            label="Atingimento"
            value={pct(pctAtingido)}
            hint={`de ${moneyShort(metaAnual)} planejados`}
          />
          <StatTile
            label="Projeção de fechamento"
            value={moneyShort(projecao)}
            delta={metaAnual ? pctProjecao - 100 : undefined}
            hint="no ritmo atual, vs. meta"
          />
        </div>

        {/* ── Definição do alvo ────────────────────────────── */}
        <Panel>
          <PanelHeader
            title="Meta anual de receita"
            hint="o alvo é rateado entre os canais pela participação no realizado"
            action={
              foraDoAlvo ? (
                <Badge tone="warn">
                  <span className="num">
                    {desvioDoAlvo > 0 ? "+" : "−"}
                    {pct(Math.abs(desvioDoAlvo))}
                  </span>
                  <span className="ml-1 font-medium hidden sm:inline">
                    vs. alvo
                  </span>
                </Badge>
              ) : undefined
            }
          />

          <div className="p-4 flex flex-col md:flex-row md:items-end gap-3">
            <div className="md:w-[220px] shrink-0">
              <span className="label block mb-1.5">Alvo do ano</span>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Meta anual de receita"
                value={alvoTexto}
                onChange={(e) => setAlvoTexto(e.target.value)}
                onBlur={() => {
                  const v = parseNum(alvoTexto);
                  setAlvoTexto(v ? inteiro.format(v) : "");
                }}
                className="h-11 md:h-8 text-[14px]"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 md:flex-1">
              <Button
                variant="primary"
                className="max-sm:h-11 sm:flex-1 md:flex-none"
                disabled={!alvo}
                onClick={() => aplicar(true)}
              >
                <CalendarRange className="w-3.5 h-3.5" />
                Distribuir por sazonalidade
              </Button>
              <Button
                className="max-sm:h-11 sm:flex-1 md:flex-none"
                disabled={!alvo}
                onClick={() => aplicar(false)}
              >
                <Equal className="w-3.5 h-3.5" />
                Distribuir igualmente
              </Button>
              <Button
                variant="ghost"
                className="max-sm:h-11 sm:flex-1 md:flex-none"
                onClick={zerar}
              >
                <Eraser className="w-3.5 h-3.5" />
                Zerar
              </Button>
            </div>
          </div>

          {/* pesos da sazonalidade — o que o botão faz, à vista */}
          <div className="px-4 pb-4">
            <p className="label mb-2">Peso de cada mês na sazonalidade</p>
            <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
              {MESES_CURTOS.map((rotulo, m) => {
                const forte = PESOS_SAZONAIS[m] >= 1.1;
                return (
                  <div
                    key={rotulo}
                    className={cn(
                      "rounded-r1 border px-1.5 py-1.5 text-center",
                      forte
                        ? "border-brand-edge bg-brand-wash"
                        : "border-line bg-panel-2"
                    )}
                    title={`${MESES_LONGOS[m]} · ${pct(
                      PESOS_NORMALIZADOS[m] * 100
                    )} do ano`}
                  >
                    <p
                      className={cn(
                        "text-[11px] font-semibold",
                        forte ? "text-brand" : "text-ink-3"
                      )}
                    >
                      {rotulo}
                    </p>
                    <p
                      className={cn(
                        "num text-[12px] mt-0.5",
                        forte ? "text-brand font-semibold" : "text-ink-2"
                      )}
                    >
                      {pct(PESOS_NORMALIZADOS[m] * 100)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* ── Atingimento por canal ────────────────────────── */}
        <Panel>
          <PanelHeader
            title="Atingimento por canal"
            hint={`realizado até ${DATA_CORTE} sobre a meta do ano`}
          />
          <div className="divide-y divide-line">
            {CANAIS_META.map((c) => {
              const meta = totalPorCanal[c.id];
              const real = REALIZADO_ANO[c.id];
              const v = meta ? (real / meta) * 100 : 0;
              const f = faixaMeta(v);
              const gap = meta - real;
              return (
                <div key={c.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                      style={{ background: c.cor }}
                    />
                    <span className="text-[13px] font-medium text-ink truncate flex-1">
                      {c.nome}
                    </span>
                    <span
                      className={cn(
                        "num text-[13px] font-semibold shrink-0",
                        meta ? TEXTO_META[f] : "text-ink-3"
                      )}
                    >
                      {meta ? pct(v) : "—"}
                    </span>
                  </div>

                  <Progress
                    value={meta ? v : 0}
                    tone={meta ? f : "brand"}
                    className="mt-2"
                  />

                  <div className="mt-2 flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="text-[11px] text-ink-3">
                      <span className="num text-ink-2">{money(real)}</span> de{" "}
                      <span className="num text-ink-2">
                        {meta ? money(meta) : "—"}
                      </span>
                    </span>
                    {meta > 0 && (
                      <span className="text-[11px] text-ink-3">
                        {gap > 0 ? "faltam " : "sobra de "}
                        <span className="num">{money(Math.abs(gap))}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="px-4 py-3 bg-panel-2">
              <KeyValue label="Meta somada dos canais" value={money(metaAnual)} />
              <KeyValue
                label="Realizado no ano"
                value={money(REALIZADO_ANO_TOTAL)}
              />
              <KeyValue
                label="Projeção de fechamento"
                value={money(projecao)}
                tone={pctProjecao >= 100 ? "up" : "warn"}
              />
              <KeyValue
                label="Falta para a meta na projeção"
                value={money(Math.max(0, metaAnual - projecao))}
              />
            </div>
          </div>
        </Panel>

        {/* ── Meta vs. realizado, mês a mês ────────────────── */}
        <Panel>
          <PanelHeader
            title="Meta mensal vs. realizado"
            hint="barras por mês · acumulado no eixo da direita"
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
                    dataKey="meta"
                    name="Meta do mês"
                    fill="var(--s9)"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    yAxisId="l"
                    dataKey="realizado"
                    name="Realizado"
                    fill="var(--s1)"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
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
                  {!estreito && (
                    <Line
                      yAxisId="r"
                      type="monotone"
                      dataKey="realizadoAcumulado"
                      name="Realizado acumulado"
                      stroke="var(--s3)"
                      strokeWidth={1.75}
                      dot={false}
                      connectNulls={false}
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
                      { label: "Meta do mês", color: "var(--s9)" },
                      { label: "Realizado", color: "var(--s1)" },
                    ]
                  : [
                      { label: "Meta do mês", color: "var(--s9)" },
                      { label: "Realizado", color: "var(--s1)" },
                      { label: "Meta acumulada", color: "var(--s5)" },
                      { label: "Realizado acumulado", color: "var(--s3)" },
                    ]
              }
            />
          </div>
        </Panel>

        {/* ── Grade editável ───────────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Meta mensal por canal"
            hint="edite qualquer célula · os totais recalculam na hora"
            action={
              <span className="num text-[12px] text-ink-3">
                {money(metaAnual)}
              </span>
            }
          />

          {/* desktop — planilha densa */}
          <div className="hidden md:block overflow-x-auto">
            <table
              className="w-full border-collapse text-[13px]"
              style={{ minWidth: "1420px" }}
            >
              <thead>
                <tr className="bg-panel-2">
                  <th
                    className="sticky left-0 z-20 bg-panel-2 h-9 px-3 border-b border-r border-line text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap"
                    style={{ width: "168px" }}
                  >
                    Canal
                  </th>
                  {MESES_CURTOS.map((rotulo, m) => (
                    <th
                      key={rotulo}
                      style={{ width: "96px" }}
                      className={cn(
                        "h-9 px-2 border-b border-line text-right font-semibold text-[11px] uppercase tracking-[0.04em] whitespace-nowrap",
                        m === MES_ATUAL ? "text-brand" : "text-ink-3"
                      )}
                      title={MESES_LONGOS[m]}
                    >
                      {rotulo}
                    </th>
                  ))}
                  <th
                    style={{ width: "148px" }}
                    className="h-9 px-3 border-b border-l border-line text-right font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap"
                  >
                    Total do canal
                  </th>
                </tr>
              </thead>

              <tbody>
                {CANAIS_META.map((c, i) => (
                  <tr
                    key={c.id}
                    className={cn(
                      "border-b border-line",
                      i % 2 === 1 && "bg-panel-2/55"
                    )}
                  >
                    <td
                      className="sticky left-0 z-10 bg-panel border-r border-line px-3 whitespace-nowrap"
                      style={{ height: "48px" }}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                          style={{ background: c.cor }}
                        />
                        <span className="font-medium text-ink">{c.nome}</span>
                      </span>
                      <span className="num text-[11px] text-ink-3 block pl-[18px]">
                        real. {moneyShort(REALIZADO_ANO[c.id])}
                      </span>
                    </td>

                    {MESES_CURTOS.map((rotulo, m) => (
                      <td key={rotulo} className="px-1 py-1 align-middle">
                        <CelulaMeta
                          valor={grade[c.id][m]}
                          rotulo={`Meta de ${c.nome} em ${MESES_LONGOS[m]}`}
                          onChange={(v) => editar(c.id, m, v)}
                        />
                      </td>
                    ))}

                    <td className="px-3 text-right border-l border-line whitespace-nowrap">
                      <span className="num text-[13px] font-semibold text-ink">
                        {totalPorCanal[c.id]
                          ? money(totalPorCanal[c.id])
                          : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr>
                  <td
                    className="sticky left-0 z-10 bg-panel-2 border-t border-r border-line px-3 text-[13px] font-semibold text-ink whitespace-nowrap"
                    style={{ height: "var(--row)" }}
                  >
                    Total das metas
                  </td>
                  {totalPorMes.map((v, m) => (
                    <td
                      key={m}
                      className="bg-panel-2 border-t border-line px-2 text-right whitespace-nowrap"
                      style={{ height: "var(--row)" }}
                    >
                      <span className="num text-[12px] font-semibold text-ink">
                        {v ? moneyShort(v) : "—"}
                      </span>
                    </td>
                  ))}
                  <td
                    className="bg-panel-2 border-t border-l border-line px-3 text-right whitespace-nowrap"
                    style={{ height: "var(--row)" }}
                  >
                    <span className="num text-[13px] font-semibold text-ink">
                      {money(metaAnual)}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td
                    className="sticky left-0 z-10 bg-panel-2 border-t border-r border-line px-3 text-[13px] text-ink-2 whitespace-nowrap"
                    style={{ height: "var(--row)" }}
                  >
                    Realizado
                  </td>
                  {MESES_CURTOS.map((rotulo, m) => {
                    const real = m <= MES_ATUAL ? REALIZADO_TOTAL[m] : 0;
                    const meta = totalPorMes[m];
                    const f = faixaMeta(meta ? (real / meta) * 100 : 0);
                    return (
                      <td
                        key={rotulo}
                        className="bg-panel-2 border-t border-line px-2 text-right whitespace-nowrap"
                        style={{ height: "var(--row)" }}
                      >
                        <span
                          className={cn(
                            "num text-[12px]",
                            m > MES_ATUAL
                              ? "text-ink-3"
                              : meta
                                ? TEXTO_META[f]
                                : "text-ink-2"
                          )}
                        >
                          {m > MES_ATUAL ? "—" : moneyShort(real)}
                        </span>
                      </td>
                    );
                  })}
                  <td
                    className="bg-panel-2 border-t border-l border-line px-3 text-right whitespace-nowrap"
                    style={{ height: "var(--row)" }}
                  >
                    <span className="num text-[13px] font-semibold text-ink">
                      {money(REALIZADO_ANO_TOTAL)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* mobile — um cartão por canal, doze meses em lista */}
          <div className="md:hidden divide-y divide-line">
            {CANAIS_META.map((c) => {
              const meta = totalPorCanal[c.id];
              const real = REALIZADO_ANO[c.id];
              const v = meta ? (real / meta) * 100 : 0;
              const f = faixaMeta(v);
              return (
                <div key={c.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                      style={{ background: c.cor }}
                    />
                    <span className="text-[13px] font-semibold text-ink truncate flex-1">
                      {c.nome}
                    </span>
                    <span className="num text-[13px] font-semibold text-ink shrink-0">
                      {meta ? money(meta) : "—"}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Progress
                      value={meta ? v : 0}
                      tone={meta ? f : "brand"}
                      className="flex-1"
                    />
                    <span
                      className={cn(
                        "num text-[12px] font-semibold shrink-0",
                        meta ? TEXTO_META[f] : "text-ink-3"
                      )}
                    >
                      {meta ? pct(v) : "—"}
                    </span>
                  </div>

                  <ul className="mt-3 flex flex-col gap-1.5">
                    {MESES_CURTOS.map((rotulo, m) => (
                      <li key={rotulo} className="flex items-center gap-2">
                        <span className="w-16 shrink-0">
                          <span
                            className={cn(
                              "text-[12px] font-medium",
                              m === MES_ATUAL ? "text-brand" : "text-ink-2"
                            )}
                          >
                            {MESES_LONGOS[m].slice(0, 3)}
                          </span>
                          <span className="num block text-[10px] text-ink-3">
                            {m <= MES_ATUAL
                              ? moneyShort(REALIZADO[c.id][m])
                              : "—"}
                          </span>
                        </span>
                        <CelulaMeta
                          valor={grade[c.id][m]}
                          rotulo={`Meta de ${c.nome} em ${MESES_LONGOS[m]}`}
                          onChange={(x) => editar(c.id, m, x)}
                          className="flex-1"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            <div className="px-4 py-3 bg-panel-2">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                <span className="text-[13px] font-semibold text-ink flex-1">
                  Total das metas
                </span>
                <span className="num text-[13px] font-semibold text-ink">
                  {money(metaAnual)}
                </span>
              </div>
              <ul className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
                {MESES_CURTOS.map((rotulo, m) => (
                  <li key={rotulo} className="flex flex-col min-w-0">
                    <span className="text-[10px] uppercase tracking-[0.04em] text-ink-3 font-semibold truncate">
                      {rotulo}
                    </span>
                    <span className="num text-[12px] text-ink truncate">
                      {totalPorMes[m] ? moneyShort(totalPorMes[m]) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
