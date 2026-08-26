"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge, EmptyState } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { Segmented, Checkbox, Input, FilterSheet, SectionTitle } from "@/components/ui/controls";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  CAMPANHAS,
  ITENS,
  TOTAL_ELEGIVEIS,
  type Campanha,
  type Decisao,
  type ItemCampanha,
} from "@/mock/campanhas";
import { money, moneyShort, count, pct } from "@/lib/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Search, SearchX, SlidersHorizontal } from "lucide-react";

/* ══ Filtros ═════════════════════════════════════════════════ */

type Filtro = "todos" | "sem" | "dentro" | "fora";

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "sem", label: "Sem decisão" },
  { value: "dentro", label: "Participando" },
  { value: "fora", label: "Fora" },
];

/* ══ Peças locais ════════════════════════════════════════════ */

function Vazio() {
  return <span className="text-ink-3">—</span>;
}

/** Variação em pontos percentuais — margem não varia em %, varia em pp. */
function Pontos({ valor, className }: { valor: number; className?: string }) {
  const cor =
    valor > 0.05 ? "text-up" : valor < -0.05 ? "text-down" : "text-ink-3";
  const sinal = valor > 0.05 ? "+" : valor < -0.05 ? "−" : "";
  return (
    <span className={`num font-semibold ${cor} ${className ?? ""}`}>
      {sinal}
      {Math.abs(valor).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}{" "}
      pp
    </span>
  );
}

/** Dois botões que registram a decisão do item. */
function Decidir({
  valor,
  onChange,
  alto = false,
}: {
  valor: Decisao | null;
  onChange: (v: Decisao | null) => void;
  /** alvos de toque do mobile */
  alto?: boolean;
}) {
  const base = alto
    ? "h-11 flex-1 text-[13px]"
    : "h-7 px-2.5 text-[12px] whitespace-nowrap";

  function estilo(alvo: Decisao) {
    if (valor === alvo)
      return alvo === "participar"
        ? "border-brand bg-brand-wash text-brand font-semibold"
        : "border-line-2 bg-panel-3 text-ink font-semibold";
    return "border-line text-ink-3 hover:text-ink hover:bg-panel-3";
  }

  return (
    <span className={alto ? "flex items-center gap-2" : "inline-flex items-center gap-1"}>
      <button
        onClick={() => onChange(valor === "participar" ? null : "participar")}
        className={`rounded-r1 border transition-colors ${base} ${estilo("participar")}`}
      >
        Participar
      </button>
      <button
        onClick={() => onChange(valor === "fora" ? null : "fora")}
        className={`rounded-r1 border transition-colors ${base} ${estilo("fora")}`}
      >
        Não participar
      </button>
    </span>
  );
}

/** Cartão de campanha — clicável, seleciona a campanha. */
function CartaoCampanha({
  campanha,
  participando,
  impacto,
  ativo,
  onClick,
}: {
  campanha: Campanha;
  participando: number;
  impacto: number;
  ativo: boolean;
  onClick: () => void;
}) {
  const curto = campanha.diasRestantes <= 5;
  return (
    <button
      onClick={onClick}
      className={
        "panel panel-1 text-left px-4 py-3 flex flex-col gap-3 min-w-0 transition-colors " +
        (ativo
          ? "border-brand bg-brand-wash"
          : "hover:bg-panel-2 active:bg-panel-3")
      }
    >
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <p className="text-[13px] font-semibold text-ink leading-snug flex-1 min-w-0">
            {campanha.nome}
          </p>
          {ativo && <Badge tone="brand">selecionada</Badge>}
        </div>
        <p className="text-[11px] text-ink-3 mt-1 line-clamp-2">{campanha.resumo}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="num text-[12px] text-ink-2">{campanha.vigencia}</span>
        {curto ? (
          <Badge tone="warn">
            faltam {campanha.diasRestantes}{" "}
            {campanha.diasRestantes === 1 ? "dia" : "dias"}
          </Badge>
        ) : (
          <span className="num text-[11px] text-ink-3">
            faltam {campanha.diasRestantes} dias
          </span>
        )}
        {campanha.temReducao ? (
          <Badge tone="info">
            tarifa −{campanha.reducaoMedia.toLocaleString("pt-BR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}{" "}
            pp
          </Badge>
        ) : (
          <Badge tone="neutral">sem redução</Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line">
        <span className="flex flex-col min-w-0">
          <span className="label truncate">Elegíveis</span>
          <span className="num text-[15px] font-semibold text-ink">
            {count(campanha.elegiveis)}
          </span>
        </span>
        <span className="flex flex-col min-w-0">
          <span className="label truncate">Participando</span>
          <span className="num text-[15px] font-semibold text-ink">
            {count(participando)}
          </span>
        </span>
        <span className="flex flex-col min-w-0">
          <span className="label truncate">Margem</span>
          <Pontos valor={impacto} className="text-[15px]" />
        </span>
      </div>
    </button>
  );
}

/* ══ Tela ════════════════════════════════════════════════════ */

export default function PromocoesCampanhas() {
  const [campanhaId, setCampanhaId] = React.useState(CAMPANHAS[0].id);
  const [filtro, setFiltro] = React.useState<Filtro>("todos");
  const [busca, setBusca] = React.useState("");
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);

  const [decisoes, setDecisoes] = React.useState<Record<string, Decisao | null>>(
    () => Object.fromEntries(ITENS.map((it) => [it.id, it.decisaoInicial]))
  );
  const [selecionados, setSelecionados] = React.useState<Set<string>>(
    () => new Set()
  );

  const campanha =
    CAMPANHAS.find((c) => c.id === campanhaId) ?? CAMPANHAS[0];

  /* ── agregados por campanha ────────────────────────────── */

  const porCampanha = React.useMemo(() => {
    return CAMPANHAS.map((c) => {
      const itens = ITENS.filter((it) => it.campanhaId === c.id);
      const comBase = itens.filter((it) => it.precoTabela > 0);
      const participando = itens.filter(
        (it) => decisoes[it.id] === "participar"
      ).length;
      const impacto =
        comBase.length > 0
          ? comBase.reduce((t, it) => t + (it.margem - it.margemAlvo), 0) /
            comBase.length
          : 0;
      return { campanha: c, participando, impacto };
    });
  }, [decisoes]);

  /* ── destaques do topo ─────────────────────────────────── */

  const resumo = React.useMemo(() => {
    const semDecisao = ITENS.filter((it) => decisoes[it.id] == null);
    const dentro = ITENS.filter((it) => decisoes[it.id] === "participar");
    const lucro = dentro.reduce((t, it) => t + it.lucroUnitario * it.giro, 0);
    const prazoCurto = CAMPANHAS.reduce(
      (m, c) => Math.min(m, c.diasRestantes),
      999
    );
    return { semDecisao: semDecisao.length, dentro: dentro.length, lucro, prazoCurto };
  }, [decisoes]);

  /* ── itens da campanha selecionada ─────────────────────── */

  const itensCampanha = React.useMemo(
    () => ITENS.filter((it) => it.campanhaId === campanha.id),
    [campanha]
  );

  const linhas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const peso = (d: Decisao | null) =>
      d == null ? 0 : d === "participar" ? 1 : 2;

    return itensCampanha
      .filter((it) => {
        const d = decisoes[it.id] ?? null;
        if (filtro === "sem" && d != null) return false;
        if (filtro === "dentro" && d !== "participar") return false;
        if (filtro === "fora" && d !== "fora") return false;
        if (!termo) return true;
        return (
          it.mlb.toLowerCase().includes(termo) ||
          it.sku.toLowerCase().includes(termo) ||
          it.titulo.toLowerCase().includes(termo)
        );
      })
      .sort((a, b) => {
        const pa = peso(decisoes[a.id] ?? null);
        const pb = peso(decisoes[b.id] ?? null);
        if (pa !== pb) return pa - pb;
        return b.lucroUnitario * b.giro - a.lucroUnitario * a.giro;
      });
  }, [itensCampanha, decisoes, filtro, busca]);

  /* ── série do gráfico ──────────────────────────────────── */

  const serie = React.useMemo(
    () =>
      itensCampanha
        .filter((it) => it.precoTabela > 0)
        .map((it) => ({
          sku: it.sku,
          tabela: it.precoTabela,
          oferta: it.precoOferta,
        })),
    [itensCampanha]
  );

  /* ── ações ─────────────────────────────────────────────── */

  function decidir(id: string, v: Decisao | null) {
    setDecisoes((d) => ({ ...d, [id]: v }));
  }

  function alternarSelecao(id: string) {
    setSelecionados((s) => {
      const p = new Set(s);
      if (p.has(id)) p.delete(id);
      else p.add(id);
      return p;
    });
  }

  const idsVisiveis = linhas.map((l) => l.id);
  const selecionadosVisiveis = idsVisiveis.filter((id) => selecionados.has(id));
  const todosMarcados =
    idsVisiveis.length > 0 && selecionadosVisiveis.length === idsVisiveis.length;

  function alternarTodos() {
    setSelecionados((s) => {
      const p = new Set(s);
      if (todosMarcados) idsVisiveis.forEach((id) => p.delete(id));
      else idsVisiveis.forEach((id) => p.add(id));
      return p;
    });
  }

  function aplicarEmLote(v: Decisao) {
    setDecisoes((d) => {
      const p = { ...d };
      selecionadosVisiveis.forEach((id) => (p[id] = v));
      return p;
    });
    setSelecionados(new Set());
  }

  /* ── colunas ───────────────────────────────────────────── */

  const colunas: Column<ItemCampanha>[] = [
    {
      key: "sel",
      header: "",
      width: "40px",
      mobile: "hidden",
      cell: (it) => (
        <Checkbox
          checked={selecionados.has(it.id)}
          onChange={() => alternarSelecao(it.id)}
        />
      ),
    },
    {
      key: "titulo",
      header: "Anúncio",
      mobile: "title",
      width: "300px",
      sortValue: (it) => it.titulo,
      cell: (it) => {
        const semDecisao = decisoes[it.id] == null;
        return (
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-[13px] text-ink truncate">{it.titulo}</span>
              {semDecisao && <Badge tone="warn">sem decisão</Badge>}
            </span>
            {it.status === "Reprovado" ? (
              <span className="text-[11px] text-down truncate">
                Reprovado ({it.motivo})
              </span>
            ) : (
              <span className="text-[11px] text-up">Aprovado</span>
            )}
          </span>
        );
      },
    },
    {
      key: "mlb",
      header: "MLB",
      mobile: "subtitle",
      width: "132px",
      sortValue: (it) => it.mlb,
      cell: (it) => <span className="num text-[12px] text-ink-2">{it.mlb}</span>,
    },
    {
      key: "sku",
      header: "SKU",
      width: "116px",
      sortValue: (it) => it.sku,
      cell: (it) => <span className="num text-[12px] text-ink-2">{it.sku}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      width: "96px",
      sortValue: (it) => it.tipo,
      cell: (it) => (
        <Badge tone={it.tipo === "Premium" ? "info" : "neutral"}>{it.tipo}</Badge>
      ),
    },
    {
      key: "tabela",
      header: "Preço de tabela",
      align: "right",
      width: "132px",
      sortValue: (it) => it.precoTabela,
      cell: (it) =>
        it.precoTabela > 0 ? (
          <span className="num text-ink-2">{money(it.precoTabela)}</span>
        ) : (
          <Vazio />
        ),
    },
    {
      key: "oferta",
      header: "Preço da oferta",
      align: "right",
      mobile: "metric",
      width: "132px",
      sortValue: (it) => it.precoOferta,
      cell: (it) => (
        <span className="num font-semibold text-ink">{money(it.precoOferta)}</span>
      ),
    },
    {
      key: "desconto",
      header: "Desconto",
      align: "right",
      mobile: "metric",
      width: "104px",
      sortValue: (it) => it.desconto,
      cell: (it) => (
        <span
          className={
            "num " + (it.desconto >= 30 ? "text-warn font-semibold" : "text-ink-2")
          }
        >
          {pct(it.desconto)}
        </span>
      ),
    },
    {
      key: "comissao",
      header: "Comissão",
      align: "right",
      width: "128px",
      sortValue: (it) => it.comissao,
      cell: (it) => (
        <span className="inline-flex items-baseline gap-1.5 justify-end">
          <span className="num text-ink">{pct(it.comissao)}</span>
          {it.tarifaReduzida !== null && (
            <span className="num text-[11px] text-info">
              de {pct(it.comissaoPadrao)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "margem",
      header: "Margem resultante",
      align: "right",
      mobile: "metric",
      width: "152px",
      sortValue: (it) => it.margem,
      cell: (it) =>
        it.precoTabela > 0 ? (
          <span className="inline-flex items-baseline gap-1.5 justify-end">
            <span
              className={
                "num font-semibold " +
                (it.margem >= it.margemAlvo - 0.5
                  ? "text-up"
                  : it.margem >= it.margemAlvo * 0.6
                    ? "text-warn"
                    : "text-down")
              }
            >
              {pct(it.margem)}
            </span>
            <span className="num text-[11px] text-ink-3">
              alvo {pct(it.margemAlvo, 0)}
            </span>
          </span>
        ) : (
          <Vazio />
        ),
    },
    {
      key: "decisao",
      header: "Decisão",
      width: "216px",
      mobile: "hidden",
      sortValue: (it) => {
        const d = decisoes[it.id] ?? null;
        return d == null ? 0 : d === "participar" ? 1 : 2;
      },
      cell: (it) => (
        <Decidir
          valor={decisoes[it.id] ?? null}
          onChange={(v) => decidir(it.id, v)}
        />
      ),
    },
  ];

  const alvoCampanha = porCampanha.find((p) => p.campanha.id === campanha.id)!;

  const vazio = (
    <EmptyState
      icon={SearchX}
      title="Nenhum item com esse recorte"
      description="Ajuste o filtro de decisão ou limpe a busca para ver os itens elegíveis da campanha."
    />
  );

  return (
    <>
      <PageHeader
        title="Campanhas"
        breadcrumb="Promoções"
        description={`${CAMPANHAS.length} campanhas abertas · ${TOTAL_ELEGIVEIS} itens elegíveis · regra da Central de Promoções`}
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
            <div className="hidden md:block">
              <Segmented<Filtro>
                options={FILTROS}
                value={filtro}
                onChange={setFiltro}
              />
            </div>
            <div className="relative hidden lg:block w-64 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar MLB, SKU ou título"
                className="pl-8"
              />
            </div>
            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {resumo.semDecisao} de {TOTAL_ELEGIVEIS} itens ainda sem decisão
            </span>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Campanhas ativas"
            value={count(CAMPANHAS.length)}
            hint={`a mais curta encerra em ${resumo.prazoCurto} dias`}
          />
          <StatTile
            label="Itens elegíveis"
            value={count(TOTAL_ELEGIVEIS)}
            hint={`${resumo.dentro} participando hoje`}
          />
          <StatTile
            label="Itens sem decisão"
            value={count(resumo.semDecisao)}
            hint="pendem de Participar ou Não participar"
          />
          <StatTile
            label="Lucro projetado"
            value={money(resumo.lucro)}
            hint="contribuição dos itens participando"
          />
        </div>

        <SectionTitle
          title="Campanhas abertas"
          hint="clique no cartão para carregar os itens elegíveis da campanha"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {porCampanha.map(({ campanha: c, participando, impacto }) => (
            <CartaoCampanha
              key={c.id}
              campanha={c}
              participando={participando}
              impacto={impacto}
              ativo={c.id === campanha.id}
              onClick={() => {
                setCampanhaId(c.id);
                setSelecionados(new Set());
              }}
            />
          ))}
        </div>

        {serie.length > 0 && (
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Preço de tabela × preço da oferta"
              hint="tabela é o preço que preserva a margem na comissão considerada"
            />
            <div className="px-2 pt-4 pb-3">
              <div style={{ height: Math.max(200, serie.length * 40 + 48) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={serie}
                    margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                    barGap={2}
                  >
                    <CartesianGrid {...GRID} vertical horizontal={false} />
                    <XAxis
                      type="number"
                      {...AXIS}
                      tickFormatter={(v) => moneyShort(Number(v))}
                    />
                    <YAxis
                      type="category"
                      dataKey="sku"
                      {...AXIS}
                      width={104}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--panel-3)" }}
                      content={<ChartTooltip formatter={(v) => money(v)} />}
                    />
                    <Bar
                      dataKey="tabela"
                      name="Preço de tabela"
                      fill="var(--s9)"
                      radius={[0, 2, 2, 0]}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="oferta"
                      name="Preço da oferta"
                      fill="var(--s1)"
                      radius={[0, 2, 2, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Legend
                className="px-2 pt-3"
                items={[
                  { label: "Preço de tabela", color: "var(--s9)" },
                  { label: "Preço da oferta", color: "var(--s1)" },
                ]}
              />
            </div>
          </Panel>
        )}

        <Panel className="overflow-hidden">
          <PanelHeader
            title={campanha.nome}
            hint={
              campanha.temReducao
                ? "com redução de tarifa — decidir item a item"
                : "sem redução — preço final recalculado para preservar a margem"
            }
            action={
              <span className="num text-[12px] text-ink-3">
                {linhas.length} de {itensCampanha.length}
              </span>
            }
          />

          {/* ── barra de ação em lote ────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-line bg-panel-2">
            <span className="min-h-11 md:min-h-0 flex items-center">
              <Checkbox
                checked={todosMarcados}
                onChange={alternarTodos}
                label={
                  selecionadosVisiveis.length > 0
                    ? `${selecionadosVisiveis.length} selecionados`
                    : "Selecionar todos"
                }
              />
            </span>
            <span className="flex-1 hidden md:block" />
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <Button
                size="sm"
                variant="primary"
                className="h-11 md:h-7"
                disabled={selecionadosVisiveis.length === 0}
                onClick={() => aplicarEmLote("participar")}
              >
                Participar nos {selecionadosVisiveis.length} selecionados
              </Button>
              <Button
                size="sm"
                className="h-11 md:h-7"
                disabled={selecionadosVisiveis.length === 0}
                onClick={() => aplicarEmLote("fora")}
              >
                Não participar
              </Button>
            </div>
          </div>

          {/* ── desktop: tabela densa ────────────────────────── */}
          <div className="hidden md:block">
            <DataTable
              columns={colunas}
              rows={linhas}
              rowKey={(it) => it.id}
              empty={vazio}
            />
          </div>

          {/* ── mobile: cartões com decisão no próprio cartão ── */}
          <div className="md:hidden">
            {linhas.length === 0 ? (
              vazio
            ) : (
              <ul className="divide-y divide-line">
                {linhas.map((it) => {
                  const d = decisoes[it.id] ?? null;
                  return (
                    <li key={it.id} className="px-4 py-3 flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <span className="pt-0.5">
                          <Checkbox
                            checked={selecionados.has(it.id)}
                            onChange={() => alternarSelecao(it.id)}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-[13px] font-medium text-ink truncate">
                              {it.titulo}
                            </span>
                            {d == null && <Badge tone="warn">sem decisão</Badge>}
                          </span>
                          <span className="num block text-[11px] text-ink-3 truncate mt-0.5">
                            {it.mlb} · {it.sku} · {it.tipo}
                          </span>
                          <span
                            className={
                              "block text-[11px] mt-0.5 " +
                              (it.status === "Reprovado" ? "text-down" : "text-up")
                            }
                          >
                            {it.status === "Reprovado"
                              ? `Reprovado (${it.motivo})`
                              : "Aprovado"}
                          </span>
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <span className="flex flex-col min-w-0">
                          <span className="label truncate">Tabela</span>
                          <span className="num text-[13px] text-ink-2">
                            {it.precoTabela > 0 ? money(it.precoTabela) : "—"}
                          </span>
                        </span>
                        <span className="flex flex-col min-w-0">
                          <span className="label truncate">Oferta</span>
                          <span className="num text-[13px] font-semibold text-ink">
                            {money(it.precoOferta)}
                          </span>
                        </span>
                        <span className="flex flex-col min-w-0">
                          <span className="label truncate">Margem</span>
                          <span className="num text-[13px] text-ink-2">
                            {it.precoTabela > 0 ? pct(it.margem) : "—"}
                          </span>
                        </span>
                      </div>

                      <Decidir
                        alto
                        valor={d}
                        onChange={(v) => decidir(it.id, v)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>

        <p className="text-[11px] text-ink-3">
          Campanha com redução de tarifa: a comissão considerada é a padrão menos a
          redução do período, e o item é aprovado quando o preço da oferta fica em
          pelo menos 95% do preço de tabela. Campanha sem redução: o preço final é
          recalculado na comissão padrão ({pct(11.5)} clássico, {pct(16.5)} premium)
          para preservar a margem alvo. Campanha selecionada:{" "}
          {alvoCampanha.campanha.nome} · desconto médio {pct(campanha.descontoMedio)}.
        </p>
      </PageBody>

      {filtrosAbertos && (
        <FilterSheet
          onClose={() => setFiltrosAbertos(false)}
          onClear={() => {
            setFiltro("todos");
            setBusca("");
          }}
          applyLabel={`Ver ${linhas.length} itens`}
        >
          <div>
            <p className="label mb-2">Buscar</p>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="MLB, SKU ou título"
              className="h-11"
            />
          </div>
          <div>
            <p className="label mb-2">Decisão</p>
            <div className="flex flex-col gap-2">
              {FILTROS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setFiltro(o.value)}
                  className={
                    "h-11 px-3 rounded-r1 border text-[13px] font-medium text-left transition-colors " +
                    (filtro === o.value
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </FilterSheet>
      )}
    </>
  );
}
