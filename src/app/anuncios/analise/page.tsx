"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import {
  Button,
  Panel,
  PanelHeader,
  Badge,
  Delta,
  EmptyState,
} from "@/components/ui/primitives";
import {
  Segmented,
  Select,
  Field,
  Input,
  FileDrop,
  Sheet,
  FilterSheet,
  Checkbox,
  Progress,
  SectionTitle,
} from "@/components/ui/controls";
import { StatTile, Sparkline } from "@/components/ui/stat-tile";
import { AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import { TabelaSemanal } from "@/components/analise/tabela-semanal";
import { LinhaDoTempo } from "@/components/analise/linha-do-tempo";
import { Elasticidade } from "@/components/analise/elasticidade";
import { CompararAnuncios } from "@/components/analise/comparar";
import { ANUNCIOS_ANALISE, SEMANAS, CATEGORIAS, IMPORTACOES } from "@/mock/analise";
import {
  analisar,
  LENTES,
  type AnuncioAnalisado,
  type Lente,
} from "@/lib/analise";
import { money, count, pct, delta as fmtDelta } from "@/lib/format";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  Search,
  Upload,
  Download,
  X,
  SearchX,
  ExternalLink,
  SlidersHorizontal,
  RefreshCw,
  TriangleAlert,
  Package,
  ChevronDown,
  Columns2,
} from "lucide-react";

const RECORTES = [
  { value: "4", label: "4 semanas" },
  { value: "8", label: "8 semanas" },
] as const;

const TIPOS = ["Todos", "Clássico", "Premium"] as const;
const STATUS = ["Todos", "ativo", "pausado"] as const;

/** Cor semântica do desvio de preço. */
function tomDesvio(d: number) {
  const a = Math.abs(d);
  return a < 2 ? "up" : a < 6 ? "warn" : "down";
}

/* ══════════════════════════════════════════════════════════════
   Indicador de preço — praticado contra ideal, numa barra só
   ══════════════════════════════════════════════════════════════ */

function IndicadorPreco({
  praticado,
  ideal,
  compacto = false,
}: {
  praticado: number;
  ideal: number;
  compacto?: boolean;
}) {
  if (!ideal) return <span className="text-ink-3">—</span>;
  const desvio = ((praticado - ideal) / ideal) * 100;
  const tom = tomDesvio(desvio);

  if (compacto) {
    return (
      <span className="inline-flex items-center gap-1.5 justify-end">
        <span className="num text-ink">{money(praticado)}</span>
        <Badge tone={tom}>
          <span className="num">{fmtDelta(desvio)}</span>
        </Badge>
      </span>
    );
  }

  // A régua: o ideal fica no centro, o praticado desloca para os lados.
  const posicao = Math.max(-1, Math.min(1, desvio / 15)); // ±15% satura
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="num text-[19px] font-semibold text-ink leading-none">
          {money(praticado)}
        </span>
        <span className="num text-[13px] text-ink-3">
          ideal {money(ideal)}
        </span>
      </div>
      <div className="relative h-1.5 mt-3 rounded-full bg-panel-3">
        <span className="absolute left-1/2 -top-1 bottom-[-4px] w-px bg-line-2" />
        <span
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-panel"
          style={{
            left: `calc(50% + ${posicao * 46}% - 5px)`,
            background: `var(--${tom})`,
          }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-ink-3">abaixo do ideal</span>
        <Badge tone={tom}>
          <span className="num">{fmtDelta(desvio)}</span>
        </Badge>
        <span className="text-[11px] text-ink-3">acima do ideal</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Página
   ══════════════════════════════════════════════════════════════ */

/** Estado do retrato de preço disparado pelo botão. */
type EstadoPrecos =
  | { fase: "ocioso" }
  | { fase: "buscando" }
  | { fase: "ok"; quando: Date; atualizados: number; comErro: number }
  | { fase: "erro"; mensagem: string; configurado: boolean };

export default function AnaliseAnuncios() {
  const [recorte, setRecorte] = React.useState<"4" | "8">("8");
  const [precos, setPrecos] = React.useState<EstadoPrecos>({ fase: "ocioso" });
  const [lente, setLente] = React.useState<Lente>("todos");
  const [busca, setBusca] = React.useState("");
  const [categoria, setCategoria] = React.useState("Todas");
  const [tipo, setTipo] = React.useState<(typeof TIPOS)[number]>("Todos");
  const [status, setStatus] = React.useState<(typeof STATUS)[number]>("Todos");
  const [selecionado, setSelecionado] = React.useState<AnuncioAnalisado | null>(null);
  const [marcados, setMarcados] = React.useState<string[]>([]);
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  const [importAberto, setImportAberto] = React.useState(false);
  const [mapaAberto, setMapaAberto] = React.useState(false);
  const [comparando, setComparando] = React.useState(false);

  const semanasSelecionadas = React.useMemo(
    () => SEMANAS.slice(-Number(recorte)).map((s) => s.semana),
    [recorte]
  );

  // O join dos relatórios + as métricas derivadas. Recalcula quando o
  // recorte de semanas muda, porque as curvas A são relativas ao recorte.
  const { itens, resumo } = React.useMemo(
    () => analisar(ANUNCIOS_ANALISE, semanasSelecionadas),
    [semanasSelecionadas]
  );

  // Filtros de atributo (não afetam as médias da carteira, de propósito:
  // "acima da média" tem de significar a média de tudo, não a do filtro).
  const porAtributo = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (categoria !== "Todas" && i.categoria !== categoria) return false;
      if (tipo !== "Todos" && i.tipo !== tipo) return false;
      if (status !== "Todos" && i.status !== status) return false;
      if (!q) return true;
      return (
        i.titulo.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.mlb.toLowerCase().includes(q)
      );
    });
  }, [itens, busca, categoria, tipo, status]);

  const contagemLentes = React.useMemo(() => {
    const m = {} as Record<Lente, number>;
    for (const l of LENTES) m[l.id] = 0;
    for (const i of porAtributo) for (const l of i.lentes) m[l] += 1;
    return m;
  }, [porAtributo]);

  const filtrados = React.useMemo(
    () => porAtributo.filter((i) => i.lentes.includes(lente)),
    [porAtributo, lente]
  );

  /**
   * Link direto para um anúncio: `?anuncio=MLB123`.
   *
   * É o que faz a busca global valer a pena — digitar o MLB de qualquer
   * tela e cair com o raio-X já aberto. Lê da URL em vez de
   * `useSearchParams` para não exigir uma fronteira de Suspense só por isso.
   */
  React.useEffect(() => {
    const alvo = new URLSearchParams(window.location.search).get("anuncio");
    if (!alvo) return;
    const achado = itens.find((i) => i.mlb === alvo.toUpperCase());
    if (achado) setSelecionado(achado);
  }, [itens]);

  const lenteAtual = LENTES.find((l) => l.id === lente)!;
  const filtrosAtivos =
    (categoria !== "Todas" ? 1 : 0) +
    (tipo !== "Todos" ? 1 : 0) +
    (status !== "Todos" ? 1 : 0);

  /**
   * Puxa o preço da vitrine agora, sob demanda.
   * É manual porque o preço anunciado muda pouco dentro da semana — varrer
   * todo dia gastaria chamada sem mudar a leitura.
   */
  async function atualizarPrecos() {
    setPrecos({ fase: "buscando" });
    try {
      const r = await fetch("/api/anuncios/precos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mlbs: itens.map((i) => i.mlb) }),
      });
      const json = await r.json();

      if (!r.ok) {
        setPrecos({
          fase: "erro",
          mensagem: json.erro ?? "Falha ao consultar o canal.",
          configurado: json.configurado !== false,
        });
        return;
      }

      setPrecos({
        fase: "ok",
        quando: new Date(),
        atualizados: json.recebidos - json.comErro,
        comErro: json.comErro,
      });
    } catch {
      setPrecos({
        fase: "erro",
        mensagem: "Não consegui falar com o servidor.",
        configurado: true,
      });
    }
  }

  function limparFiltros() {
    setBusca("");
    setCategoria("Todas");
    setTipo("Todos");
    setStatus("Todos");
    setLente("todos");
  }

  function alternarMarca(mlb: string) {
    setMarcados((m) => (m.includes(mlb) ? m.filter((x) => x !== mlb) : [...m, mlb]));
  }

  const colunas: Column<AnuncioAnalisado>[] = [
    {
      key: "marcar",
      header: "",
      width: "36px",
      cell: (a) => (
        <span onClick={(e) => e.stopPropagation()} className="flex">
          <Checkbox
            checked={marcados.includes(a.mlb)}
            onChange={() => alternarMarca(a.mlb)}
          />
        </span>
      ),
    },
    {
      key: "titulo",
      header: "Anúncio",
      mobile: "title",
      sticky: true,
      width: "320px",
      sortValue: (a) => a.titulo,
      cell: (a) => (
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-r1 bg-panel-3 border border-line flex items-center justify-center shrink-0">
            <Package className="w-3.5 h-3.5 text-ink-3" strokeWidth={1.75} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-ink truncate max-w-[220px]">
                {a.titulo}
              </span>
              {a.metricas.curvaAReceita && <Badge tone="brand">A</Badge>}
              {a.status === "pausado" && <Badge tone="neutral">pausado</Badge>}
            </span>
            <span className="num block text-[11px] text-ink-3 mt-0.5">
              {a.mlb} · {a.sku}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "conta",
      header: "Conta",
      mobile: "subtitle",
      width: "130px",
      sortValue: (a) => a.conta,
      cell: (a) => <span className="text-ink-2 truncate">{a.conta}</span>,
    },
    {
      key: "visitas",
      header: "Visitas",
      align: "right",
      width: "100px",
      sortValue: (a) => a.metricas.visitas,
      cell: (a) => <span className="num">{count(a.metricas.visitas)}</span>,
    },
    {
      key: "vendas",
      header: "Vendas",
      align: "right",
      mobile: "metric",
      width: "90px",
      sortValue: (a) => a.metricas.vendas,
      cell: (a) => <span className="num">{count(a.metricas.vendas)}</span>,
    },
    {
      key: "conversao",
      header: "Conversão",
      align: "right",
      mobile: "metric",
      width: "140px",
      sortValue: (a) => a.metricas.conversao,
      cell: (a) => (
        <span className="flex items-center justify-end gap-2">
          <Progress
            className="hidden lg:block w-12"
            value={(a.metricas.conversao / 4) * 100}
            tone={a.metricas.conversao >= resumo.mediaConversao ? "up" : "warn"}
          />
          <span
            className={
              "num " +
              (a.metricas.conversao >= resumo.mediaConversao
                ? "text-up font-semibold"
                : "text-ink-2")
            }
          >
            {pct(a.metricas.conversao, 2)}
          </span>
        </span>
      ),
    },
    {
      key: "receita",
      header: "Receita",
      align: "right",
      mobile: "metric",
      width: "130px",
      sortValue: (a) => a.metricas.receita,
      cell: (a) => (
        <span className="num font-semibold text-ink">{money(a.metricas.receita)}</span>
      ),
    },
    {
      key: "evolucao",
      header: "Evolução",
      align: "right",
      width: "110px",
      sortValue: (a) => a.metricas.tendencia,
      cell: (a) => (
        <span className="flex items-center justify-end gap-2">
          <span className="inline-block w-14 h-6">
            <Sparkline
              data={a.metricas.serieVendas}
              tone={a.metricas.tendencia >= 0 ? "up" : "down"}
            />
          </span>
        </span>
      ),
    },
    {
      key: "preco",
      header: "Preço vs. ideal",
      align: "right",
      width: "180px",
      sortValue: (a) => a.metricas.desvio,
      cell: (a) => (
        <IndicadorPreco
          praticado={a.metricas.preco}
          ideal={a.metricas.precoIdeal}
          compacto
        />
      ),
    },
    {
      key: "subsidio",
      header: "Subsídio",
      align: "right",
      width: "120px",
      sortValue: (a) => a.metricas.subsidio,
      cell: (a) =>
        a.metricas.subsidio > 0 ? (
          <span className="num text-down font-semibold">
            {money(a.metricas.subsidio)}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "campanhas",
      header: "Campanhas",
      align: "right",
      width: "110px",
      sortValue: (a) => a.metricas.campanhasAtivas,
      cell: (a) =>
        a.metricas.campanhasAtivas === 0 ? (
          <span className="text-ink-3">—</span>
        ) : (
          <Badge tone="info">
            <span className="num">{a.metricas.campanhasAtivas}</span>
          </Badge>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Análise de anúncios"
        breadcrumb="Anúncios"
        description="Desempenho semanal, aderência de preço e diagnóstico por anúncio"
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
            <Button
              size="sm"
              onClick={atualizarPrecos}
              disabled={precos.fase === "buscando"}
              title="Consulta no canal o preço que está na vitrine agora"
            >
              <RefreshCw
                className={
                  "w-3.5 h-3.5 " + (precos.fase === "buscando" ? "animate-spin" : "")
                }
              />
              <span className="hidden sm:inline">
                {precos.fase === "buscando" ? "Consultando…" : "Atualizar preços"}
              </span>
            </Button>
            <Button size="sm" className="hidden lg:inline-flex">
              <Download className="w-3.5 h-3.5" />
              Exportar
            </Button>
            <Button size="sm" variant="primary" onClick={() => setImportAberto(true)}>
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Importar relatório</span>
              <span className="sm:hidden">Importar</span>
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

            <Segmented<"4" | "8">
              options={RECORTES}
              value={recorte}
              onChange={setRecorte}
            />

            <div className="hidden md:flex items-center gap-2">
              <Select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-40"
              >
                <option value="Todas">Todas as categorias</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Segmented<(typeof TIPOS)[number]>
                options={TIPOS}
                value={tipo}
                onChange={setTipo}
              />
              <Segmented<(typeof STATUS)[number]>
                options={STATUS.map((s) => ({
                  value: s,
                  label: s === "Todos" ? "Todos" : s === "ativo" ? "Ativos" : "Pausados",
                }))}
                value={status}
                onChange={setStatus}
              />
            </div>

            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {filtrados.length} de {itens.length}
            </span>
          </>
        }
      />

      <PageBody>
        {/* ── Retrato de preço ───────────────────────────────── */}
        {precos.fase === "erro" && (
          <Panel
            className={
              "px-4 py-3 flex gap-2.5 border-transparent " +
              (precos.configurado ? "bg-down-wash" : "bg-warn-wash")
            }
          >
            <TriangleAlert
              className={
                "w-4 h-4 shrink-0 mt-px " +
                (precos.configurado ? "text-down" : "text-warn")
              }
              strokeWidth={2}
            />
            <p className="text-[12px] text-ink-2">
              <span className="font-semibold text-ink">
                {precos.configurado
                  ? "Não deu para atualizar. "
                  : "Canal ainda não conectado. "}
              </span>
              {precos.mensagem}
              {!precos.configurado && (
                <>
                  {" "}
                  Enquanto isso a tela usa o preço da última importação de
                  planilha.
                </>
              )}
            </p>
          </Panel>
        )}

        {precos.fase === "ok" && (
          <Panel className="px-4 py-3 flex gap-2.5">
            <RefreshCw
              className="w-4 h-4 text-ink-3 shrink-0 mt-px"
              strokeWidth={1.75}
            />
            <p className="text-[12px] text-ink-2">
              <span className="font-semibold text-ink">
                {count(precos.atualizados)} preços atualizados
              </span>{" "}
              às{" "}
              <span className="num">
                {precos.quando.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              .{" "}
              {precos.comErro > 0 && (
                <>
                  <span className="num">{precos.comErro}</span> anúncios não
                  responderam.{" "}
                </>
              )}
              O preço pago continua vindo dos pedidos, com o histórico completo.
            </p>
          </Panel>
        )}

        {/* ── Indicadores do recorte ─────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatTile
            label="Receita acumulada"
            value={money(resumo.receita)}
            delta={11.8}
            hint={`${recorte} semanas`}
          />
          <StatTile label="Unidades vendidas" value={count(resumo.vendas)} delta={6.4} />
          <StatTile
            label="Conversão média"
            value={pct(resumo.conversao, 2)}
            delta={-2.1}
          />
          <StatTile label="Visitas acumuladas" value={count(resumo.visitas)} delta={9.2} />
          <StatTile
            label="Margem subsidiada"
            value={money(resumo.subsidio)}
            delta={-15}
            inverse
            hint="deixada na mesa"
          />
        </div>

        {/* ── Lentes estratégicas ────────────────────────────── */}
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 overflow-x-auto border-b border-line">
            {LENTES.map((l) => {
              const n = contagemLentes[l.id] ?? 0;
              const ativa = lente === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => setLente(l.id)}
                  className={
                    "flex items-center gap-2 h-8 px-3 rounded-r1 border text-[12px] font-medium whitespace-nowrap transition-colors " +
                    (ativa
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2 hover:bg-panel-3 hover:text-ink")
                  }
                >
                  {l.rotulo}
                  <span
                    className={
                      "num text-[11px] px-1.5 h-4 flex items-center rounded-[4px] " +
                      (ativa ? "bg-brand text-brand-ink" : "bg-panel-3 text-ink-3")
                    }
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-1.5">
            <p className="text-[12px] text-ink-2 flex-1 min-w-0">
              <span className="font-semibold text-ink">Critério: </span>
              {lenteAtual.regra}
            </p>
            {lente !== "todos" && (
              <p className="text-[12px] text-ink-2 flex-1 min-w-0">
                <span className="font-semibold text-ink">O que fazer: </span>
                {lenteAtual.acao}
              </p>
            )}
          </div>
        </Panel>

        {/* ── Mapa da carteira (recolhível) ──────────────────── */}
        <Panel className="overflow-hidden">
          <button
            onClick={() => setMapaAberto((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 h-11 hover:bg-panel-2 transition-colors"
          >
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="text-[13px] font-semibold text-ink">
                Mapa da carteira
              </span>
              <span className="text-[11px] text-ink-3 truncate hidden sm:inline">
                tráfego × conversão — os quadrantes explicam as lentes
              </span>
            </span>
            <ChevronDown
              className={
                "w-4 h-4 text-ink-3 shrink-0 transition-transform " +
                (mapaAberto ? "rotate-180" : "")
              }
            />
          </button>

          {mapaAberto && (
            <div className="border-t border-line">
              <div className="h-[300px] px-2 pt-4 pb-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid {...GRID} vertical />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Visitas"
                      {...AXIS}
                      tickFormatter={(v: number) => count(v)}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Conversão"
                      {...AXIS}
                      width={48}
                      tickFormatter={(v: number) => pct(v, 1)}
                    />
                    <ZAxis type="number" dataKey="z" range={[30, 400]} />
                    <ReferenceLine
                      x={resumo.mediaVisitas}
                      stroke="var(--line-2)"
                      strokeDasharray="4 4"
                    />
                    <ReferenceLine
                      y={resumo.mediaConversao}
                      stroke="var(--line-2)"
                      strokeDasharray="4 4"
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3", stroke: "var(--line-2)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload as {
                          nome: string;
                          x: number;
                          y: number;
                          z: number;
                        };
                        return (
                          <div
                            className="panel px-2.5 py-2 max-w-[240px]"
                            style={{ boxShadow: "var(--sh-3)" }}
                          >
                            <p className="text-[12px] font-semibold text-ink leading-snug">
                              {d.nome}
                            </p>
                            <p className="num text-[11px] text-ink-2 mt-1">
                              {count(d.x)} visitas · {pct(d.y, 2)} de conversão
                            </p>
                            <p className="num text-[11px] text-ink-2">
                              {money(d.z)} de receita
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Scatter
                      name="Joias escondidas"
                      isAnimationActive={false}
                      fill="var(--up)"
                      data={porAtributo
                        .filter((i) => i.lentes.includes("joias"))
                        .map((i) => ({
                          nome: i.titulo,
                          x: i.metricas.visitas,
                          y: i.metricas.conversao,
                          z: i.metricas.receita,
                        }))}
                    />
                    <Scatter
                      name="Desperdício de tráfego"
                      isAnimationActive={false}
                      fill="var(--down)"
                      data={porAtributo
                        .filter((i) => i.lentes.includes("desperdicio"))
                        .map((i) => ({
                          nome: i.titulo,
                          x: i.metricas.visitas,
                          y: i.metricas.conversao,
                          z: i.metricas.receita,
                        }))}
                    />
                    <Scatter
                      name="Demais anúncios"
                      isAnimationActive={false}
                      fill="var(--s9)"
                      data={porAtributo
                        .filter(
                          (i) =>
                            !i.lentes.includes("joias") &&
                            !i.lentes.includes("desperdicio")
                        )
                        .map((i) => ({
                          nome: i.titulo,
                          x: i.metricas.visitas,
                          y: i.metricas.conversao,
                          z: i.metricas.receita,
                        }))}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="px-4 py-3 border-t border-line flex flex-wrap items-center justify-between gap-3">
                <Legend
                  items={[
                    { label: "Joias escondidas", color: "var(--up)" },
                    { label: "Desperdício de tráfego", color: "var(--down)" },
                    { label: "Demais anúncios", color: "var(--s9)" },
                  ]}
                />
                <span className="text-[11px] text-ink-3">
                  As linhas tracejadas são as médias da carteira. O tamanho do ponto
                  é a receita.
                </span>
              </div>
            </div>
          )}
        </Panel>

        {/* ── Matriz evolutiva ───────────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Matriz evolutiva"
            hint="clique numa linha para abrir o raio-X do anúncio"
            action={
              marcados.length > 0 ? (
                <span className="flex items-center gap-2">
                  <span className="num text-[12px] text-ink-2">
                    {marcados.length} selecionados
                  </span>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setComparando(true)}
                    disabled={marcados.length < 2 || marcados.length > 3}
                    title={
                      marcados.length < 2
                        ? "Selecione ao menos dois anúncios"
                        : marcados.length > 3
                          ? "Compare no máximo três de cada vez"
                          : "Ver lado a lado"
                    }
                  >
                    <Columns2 className="w-3.5 h-3.5" />
                    Comparar
                  </Button>
                  <Button size="sm">Exportar seleção</Button>
                  <Button size="sm" variant="ghost" onClick={() => setMarcados([])}>
                    Limpar
                  </Button>
                </span>
              ) : (
                <span className="num text-[12px] text-ink-3 md:hidden">
                  {filtrados.length}
                </span>
              )
            }
          />
          <DataTable
            columns={colunas}
            rows={filtrados}
            rowKey={(a) => a.mlb}
            defaultSort={{ key: "receita", dir: "desc" }}
            onRowClick={setSelecionado}
            empty={
              <EmptyState
                icon={SearchX}
                title="Nenhum anúncio neste recorte"
                description={
                  lente === "todos"
                    ? "Ajuste a busca ou limpe os filtros de categoria e tipo."
                    : "Nenhum anúncio se enquadra nesta lente com os filtros atuais."
                }
                action={
                  <Button size="sm" onClick={limparFiltros}>
                    Limpar filtros
                  </Button>
                }
              />
            }
          />
        </Panel>
      </PageBody>

      {selecionado && (
        <RaioX item={selecionado} onClose={() => setSelecionado(null)} />
      )}

      {comparando && (
        <CompararAnuncios
          itens={itens.filter((i) => marcados.includes(i.mlb))}
          onClose={() => setComparando(false)}
        />
      )}

      {importAberto && <ImportarRelatorio onClose={() => setImportAberto(false)} />}

      {filtrosAbertos && (
        <FilterSheet
          onClose={() => setFiltrosAbertos(false)}
          onClear={limparFiltros}
          applyLabel={`Ver ${filtrados.length} anúncios`}
        >
          <Field label="Categoria">
            <Select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="h-11"
            >
              <option value="Todas">Todas as categorias</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <p className="label mb-2">Tipo de anúncio</p>
            <div className="flex gap-2">
              {TIPOS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className={
                    "flex-1 h-11 rounded-r1 border text-[13px] font-medium transition-colors " +
                    (tipo === t
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label mb-2">Situação</p>
            <div className="flex gap-2">
              {STATUS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={
                    "flex-1 h-11 rounded-r1 border text-[13px] font-medium transition-colors capitalize " +
                    (status === s
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {s === "Todos" ? "Todos" : s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label mb-2">Lente</p>
            <div className="flex flex-col gap-1.5">
              {LENTES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLente(l.id)}
                  className={
                    "flex items-center justify-between gap-2 h-11 px-3 rounded-r1 border text-[13px] font-medium transition-colors " +
                    (lente === l.id
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {l.rotulo}
                  <span className="num text-[12px]">
                    {contagemLentes[l.id] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </FilterSheet>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Raio-X do anúncio
   ══════════════════════════════════════════════════════════════ */

function RaioX({
  item,
  onClose,
}: {
  item: AnuncioAnalisado;
  onClose: () => void;
}) {
  const m = item.metricas;

  const serie = item.semanas.map((w) => ({
    semana: w.semana,
    intervalo: w.intervalo,
    vendas: w.vendas,
    visitas: w.visitas,
    // No gráfico vale o preço pago; sem venda, cai para o da vitrine.
    preco: w.precoRealizado ?? w.precoAnunciado,
    anunciado: w.precoAnunciado,
    ideal: w.precoIdeal,
  }));

  const diagnosticos = LENTES.filter(
    (l) => l.id !== "todos" && item.lentes.includes(l.id)
  );

  return (
    <Sheet
      title={item.titulo}
      subtitle={`${item.mlb} · ${item.sku} · ${item.conta}`}
      onClose={onClose}
      width="640px"
      footer={
        <>
          <Button className="flex-1 max-sm:h-11">
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir no canal
          </Button>
          <Button variant="primary" className="flex-1 max-sm:h-11">
            Ajustar preço
          </Button>
        </>
      }
    >
      {/* selos */}
      <div className="px-4 py-3 flex flex-wrap gap-1.5 border-b border-line">
        {m.curvaAReceita && <Badge tone="brand">Curva A · receita</Badge>}
        {m.curvaATrafego && <Badge tone="brand">Curva A · tráfego</Badge>}
        <Badge tone="neutral">{item.tipo}</Badge>
        <Badge tone="neutral">{item.categoria}</Badge>
        <Badge tone={item.status === "ativo" ? "up" : "neutral"}>{item.status}</Badge>
        {m.campanhasAtivas > 0 && (
          <Badge tone="info">
            <span className="num">{m.campanhasAtivas}</span>
            <span className="ml-1">em campanha</span>
          </Badge>
        )}
      </div>

      {/* diagnóstico — o que o sistema achou e o que fazer */}
      {diagnosticos.length > 0 && (
        <div className="px-4 py-3 border-b border-line">
          <p className="label mb-2.5">Diagnóstico</p>
          <ul className="flex flex-col gap-2.5">
            {diagnosticos.map((l) => (
              <li key={l.id} className="flex gap-2.5">
                <span
                  className="w-1 rounded-full shrink-0"
                  style={{
                    background:
                      l.id === "joias" ? "var(--up)" : l.id === "fora_do_preco" ? "var(--warn)" : "var(--down)",
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-ink">
                    {l.rotulo}
                  </span>
                  <span className="block text-[12px] text-ink-2 mt-0.5">
                    {item.motivos[l.id]}
                  </span>
                  <span className="block text-[11px] text-ink-3 mt-1">
                    Sugestão: {l.acao}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* números do período */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-line border-b border-line">
        {[
          { l: "Visitas", v: count(m.visitas) },
          { l: "Vendas", v: count(m.vendas) },
          { l: "Conversão", v: pct(m.conversao, 2) },
          { l: "Receita", v: money(m.receita) },
        ].map((x) => (
          <div key={x.l} className="px-4 py-3">
            <p className="label">{x.l}</p>
            <p className="num text-[16px] font-semibold text-ink mt-1 leading-none">
              {x.v}
            </p>
          </div>
        ))}
      </div>

      {/* preço */}
      <div className="px-4 py-3.5 border-b border-line">
        <p className="label mb-3">Aderência de preço</p>
        <IndicadorPreco praticado={m.preco} ideal={m.precoIdeal} />
        <div className="mt-4 pt-3 border-t border-line grid grid-cols-2 gap-y-2">
          <span className="text-[12px] text-ink-3">Comissão do canal</span>
          <span className="num text-[13px] text-ink text-right">
            {pct(m.comissao)}
          </span>
          <span className="text-[12px] text-ink-3">Subsídio acumulado</span>
          <span
            className={
              "num text-[13px] text-right " +
              (m.subsidio > 0 ? "text-down font-semibold" : "text-ink")
            }
          >
            {m.subsidio > 0 ? money(m.subsidio) : "—"}
          </span>
          <span className="text-[12px] text-ink-3">Peso na receita do item</span>
          <span className="num text-[13px] text-ink text-right">
            {m.subsidio > 0 ? pct(m.subsidioPct) : "—"}
          </span>
          <span className="text-[12px] text-ink-3">Elasticidade ao desconto</span>
          <span className="text-[13px] text-right">
            {m.elasticidadePositiva ? (
              <Badge tone="up">positiva</Badge>
            ) : (
              <Badge tone="neutral">não observada</Badge>
            )}
          </span>
        </div>
      </div>

      {/* vendas × preço */}
      <div className="px-4 py-3.5 border-b border-line">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="label">Vendas e preço por semana</p>
          <Delta value={m.tendencia} />
        </div>
        <div className="h-[210px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="semana" {...AXIS} />
              <YAxis yAxisId="v" {...AXIS} width={34} />
              <YAxis
                yAxisId="p"
                orientation="right"
                {...AXIS}
                width={56}
                tickFormatter={(v: number) => money(v)}
              />
              <Tooltip
                cursor={{ fill: "var(--panel-3)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const s = serie.find((x) => x.semana === label);
                  return (
                    <div
                      className="panel px-2.5 py-2 min-w-[170px]"
                      style={{ boxShadow: "var(--sh-3)" }}
                    >
                      <p className="text-[11px] font-semibold text-ink-2 mb-1.5">
                        {s ? `${s.semana} · ${s.intervalo}` : String(label ?? "")}
                      </p>
                      <div className="flex flex-col gap-1">
                        {payload.map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3"
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-2 h-2 rounded-[2px] shrink-0"
                                style={{ background: p.color }}
                              />
                              <span className="text-[11px] text-ink-2 truncate">
                                {p.name}
                              </span>
                            </span>
                            <span className="num text-[12px] font-semibold text-ink">
                              {p.name === "Vendas"
                                ? count(Number(p.value))
                                : money(Number(p.value))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                yAxisId="v"
                dataKey="vendas"
                name="Vendas"
                fill="var(--s1)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Line
                yAxisId="p"
                type="monotone"
                dataKey="preco"
                name="Preço praticado"
                stroke="var(--s3)"
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="p"
                type="monotone"
                dataKey="ideal"
                name="Preço ideal"
                stroke="var(--ink-3)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend
          className="mt-2"
          items={[
            { label: "Vendas", color: "var(--s1)" },
            { label: "Preço praticado", color: "var(--s3)" },
            { label: "Preço ideal", color: "var(--ink-3)" },
          ]}
        />
      </div>

      <Elasticidade item={item} />

      {/* o que aconteceu — antes dos números, porque é o que explica */}
      <LinhaDoTempo item={item} />

      {/* histórico semana a semana */}
      <TabelaSemanal item={item} />

      <div className="px-4 pb-4">
        {item.semanas.some((w) => w.campanhas.length > 0) && (
          <div>
            <p className="label mb-2">Campanhas no período</p>
            <ul className="flex flex-col gap-1">
              {item.semanas
                .filter((w) => w.campanhas.length > 0)
                .map((w) => (
                  <li
                    key={w.semana}
                    className="flex items-center justify-between gap-3 h-8 px-2.5 rounded-r1 border border-line bg-panel-2"
                  >
                    <span className="num text-[11px] text-ink-3 shrink-0">
                      {w.semana}
                    </span>
                    <span className="text-[12px] text-ink truncate flex-1">
                      {w.campanhas[0].nome}
                    </span>
                    <span className="num text-[12px] text-ink-2 shrink-0">
                      {money(w.campanhas[0].preco)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ══════════════════════════════════════════════════════════════
   Importação de relatórios
   ══════════════════════════════════════════════════════════════ */

function ImportarRelatorio({ onClose }: { onClose: () => void }) {
  const [desempenho, setDesempenho] = React.useState<File[]>([]);
  const [precoIdeal, setPrecoIdeal] = React.useState<File[]>([]);
  const [dataBase, setDataBase] = React.useState("");

  const pronto = desempenho.length > 0 || precoIdeal.length > 0;

  return (
    <Sheet
      title="Importar relatório"
      subtitle="Os arquivos são cruzados por MLB e agrupados por semana"
      onClose={onClose}
      footer={
        <>
          <Button className="flex-1 max-sm:h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1 max-sm:h-11" disabled={!pronto}>
            Processar
          </Button>
        </>
      }
    >
      <div className="px-4 py-4 space-y-5">
        <div>
          <SectionTitle
            title="Desempenho de publicações"
            hint="Exportação do canal com visitas, vendas e conversão por anúncio."
          />
          <div className="mt-3">
            <FileDrop
              files={desempenho}
              onFiles={(f) => setDesempenho((prev) => [...prev, ...f])}
              onRemove={(i) =>
                setDesempenho((prev) => prev.filter((_, x) => x !== i))
              }
            />
          </div>
        </div>

        <div>
          <SectionTitle
            title="Preço ideal"
            hint="Planilha interna com o preço alvo e a comissão negociada."
          />
          <div className="mt-3 space-y-3">
            <FileDrop
              files={precoIdeal}
              onFiles={(f) => setPrecoIdeal((prev) => [...prev, ...f])}
              onRemove={(i) =>
                setPrecoIdeal((prev) => prev.filter((_, x) => x !== i))
              }
            />
            <Field
              label="Data-base do cálculo"
              hint="Define a qual semana este preço ideal será associado."
            >
              <Input
                type="date"
                value={dataBase}
                onChange={(e) => setDataBase(e.target.value)}
                className="max-sm:h-11"
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <p className="label mb-2">Importações recentes</p>
        <ul className="flex flex-col divide-y divide-line border border-line rounded-r2 overflow-hidden">
          {IMPORTACOES.map((imp) => (
            <li key={imp.id} className="px-3 py-2.5 bg-panel">
              <p className="text-[12px] font-medium text-ink truncate">
                {imp.arquivo}
              </p>
              <p className="text-[11px] text-ink-3 mt-0.5">
                {imp.tipo} · {imp.periodo}
              </p>
              <p className="num text-[11px] text-ink-3 mt-0.5">
                {imp.linhas} linhas · {imp.enviadoEm}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
