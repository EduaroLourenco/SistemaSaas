"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  PanelHeader,
} from "@/components/ui/primitives";
import {
  Field,
  FileDrop,
  FilterSheet,
  KeyValue,
  Segmented,
  Select,
  Sheet,
} from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import { AXIS, GRID, ChartTooltip, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  CATALOGO,
  CATEGORIAS_CATALOGO,
  CONTAS_CATALOGO,
  IMPORTACOES_CATALOGO,
  type ItemCatalogo,
  type StatusAnuncio,
} from "@/mock/catalogo";
import {
  RELATORIO_ATUAL,
  comissaoNegociadaVigente,
  precoIdealVigente,
} from "@/mock/preco-ideal";
import { count, delta as fmtDelta, money, pct } from "@/lib/format";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  Download,
  ExternalLink,
  Package,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════
   Utilidades locais
   ══════════════════════════════════════════════════════════════ */

/** Data de referência da carteira estática. Fixa, para não variar no build. */
const HOJE = "2026-08-25";

/** yyyy-mm-dd → dd/mm/aaaa, sem passar por fuso. */
function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function dias(iso: string, ate = HOJE) {
  const p = (s: string) => {
    const [a, m, d] = s.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((p(ate) - p(iso)) / 86400000);
}

function desdeQuando(iso: string) {
  const n = dias(iso);
  if (n <= 0) return "hoje";
  if (n === 1) return "ontem";
  if (n < 30) return `há ${n} dias`;
  const meses = Math.round(n / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}

const TOM_STATUS: Record<StatusAnuncio, "up" | "warn" | "neutral"> = {
  ativo: "up",
  pausado: "warn",
  finalizado: "neutral",
};

const TIPOS = ["Todos", "Clássico", "Premium"] as const;
const STATUS = ["Todos", "ativo", "pausado", "finalizado"] as const;
const ROTULO_STATUS: Record<(typeof STATUS)[number], string> = {
  Todos: "Todos",
  ativo: "Ativos",
  pausado: "Pausados",
  finalizado: "Finalizados",
};

/** Cor semântica do desvio de preço — o mesmo corte da análise de anúncios. */
function tomDesvio(d: number) {
  const a = Math.abs(d);
  return a < 2 ? "up" : a < 6 ? "warn" : "down";
}

/* ══════════════════════════════════════════════════════════════
   Barra de composição — participação de cada tipo, sem gráfico
   ══════════════════════════════════════════════════════════════ */

function BarraComposicao({
  partes,
}: {
  partes: { rotulo: string; valor: number; cor: string }[];
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1;
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-panel-3">
        {partes.map((p) => (
          <span
            key={p.rotulo}
            style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5">
        {partes.map((p) => (
          <span key={p.rotulo} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-[3px] shrink-0"
              style={{ background: p.cor }}
            />
            <span className="text-[11px] text-ink-2">{p.rotulo}</span>
            <span className="num text-[11px] text-ink font-semibold">
              {count(p.valor)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Página
   ══════════════════════════════════════════════════════════════ */

export default function CatalogoAnuncios() {
  const [busca, setBusca] = React.useState("");
  const [tipo, setTipo] = React.useState<(typeof TIPOS)[number]>("Todos");
  const [status, setStatus] = React.useState<(typeof STATUS)[number]>("Todos");
  const [categoria, setCategoria] = React.useState("Todas");
  const [conta, setConta] = React.useState("Todas");
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  const [selecionado, setSelecionado] = React.useState<ItemCatalogo | null>(null);
  const [importAberto, setImportAberto] = React.useState(true);
  const [arquivos, setArquivos] = React.useState<File[]>([]);

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return CATALOGO.filter((i) => {
      if (tipo !== "Todos" && i.tipo !== tipo) return false;
      if (status !== "Todos" && i.status !== status) return false;
      if (categoria !== "Todas" && i.categoria !== categoria) return false;
      if (conta !== "Todas" && i.conta !== conta) return false;
      if (!q) return true;
      return (
        i.mlb.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.titulo.toLowerCase().includes(q)
      );
    });
  }, [busca, tipo, status, categoria, conta]);

  const resumo = React.useMemo(() => {
    const ativos = CATALOGO.filter((i) => i.status === "ativo");
    const pausados = CATALOGO.filter((i) => i.status === "pausado");
    const finalizados = CATALOGO.filter((i) => i.status === "finalizado");
    const publicados = CATALOGO.filter((i) => i.status !== "finalizado");
    const comissao =
      publicados.reduce((s, i) => s + i.comissaoAtual, 0) /
      (publicados.length || 1);
    const negociada =
      publicados.reduce(
        (s, i) => s + (comissaoNegociadaVigente(i.mlb) || i.comissaoAtual),
        0
      ) / (publicados.length || 1);
    return {
      total: CATALOGO.length,
      ativos: ativos.length,
      pausados: pausados.length,
      finalizados: finalizados.length,
      classicos: CATALOGO.filter((i) => i.tipo === "Clássico").length,
      premium: CATALOGO.filter((i) => i.tipo === "Premium").length,
      comissao,
      negociada,
      estoque: CATALOGO.reduce((s, i) => s + i.estoque, 0),
      semPrecoIdeal: publicados.filter((i) => !precoIdealVigente(i.mlb)).length,
    };
  }, []);

  const filtrosAtivos =
    (tipo !== "Todos" ? 1 : 0) +
    (status !== "Todos" ? 1 : 0) +
    (categoria !== "Todas" ? 1 : 0) +
    (conta !== "Todas" ? 1 : 0);

  function limparFiltros() {
    setBusca("");
    setTipo("Todos");
    setStatus("Todos");
    setCategoria("Todas");
    setConta("Todas");
  }

  const colunas: Column<ItemCatalogo>[] = [
    {
      key: "titulo",
      header: "Título",
      mobile: "title",
      sticky: true,
      width: "300px",
      sortValue: (i) => i.titulo,
      cell: (i) => (
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-r1 bg-panel-3 border border-line flex items-center justify-center shrink-0">
            <Package className="w-3.5 h-3.5 text-ink-3" strokeWidth={1.75} />
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-ink truncate max-w-[230px]">
              {i.titulo}
            </span>
            <span className="block text-[11px] text-ink-3 truncate">
              {i.categoria} · {i.conta}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "mlb",
      header: "MLB",
      mobile: "subtitle",
      width: "140px",
      sortValue: (i) => i.mlb,
      cell: (i) => <span className="num text-ink-2">{i.mlb}</span>,
    },
    {
      key: "sku",
      header: "SKU",
      width: "120px",
      sortValue: (i) => i.sku,
      cell: (i) => <span className="num text-ink-2">{i.sku}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      width: "104px",
      sortValue: (i) => i.tipo,
      cell: (i) => (
        <Badge tone={i.tipo === "Premium" ? "brand" : "neutral"}>{i.tipo}</Badge>
      ),
    },
    {
      key: "preco",
      header: "Preço atual",
      align: "right",
      mobile: "metric",
      width: "130px",
      sortValue: (i) => i.precoAtual,
      cell: (i) => (
        <span className="num font-semibold text-ink">{money(i.precoAtual)}</span>
      ),
    },
    {
      key: "comissao",
      header: "Comissão",
      align: "right",
      mobile: "metric",
      width: "110px",
      sortValue: (i) => i.comissaoAtual,
      cell: (i) => <span className="num text-ink-2">{pct(i.comissaoAtual)}</span>,
    },
    {
      key: "estoque",
      header: "Estoque",
      align: "right",
      width: "100px",
      sortValue: (i) => i.estoque,
      cell: (i) =>
        i.estoque === 0 ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className="num text-ink-2">{count(i.estoque)}</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "110px",
      sortValue: (i) => i.status,
      cell: (i) => (
        <Badge tone={TOM_STATUS[i.status]}>
          <span className="capitalize">{i.status}</span>
        </Badge>
      ),
    },
    {
      key: "atualizado",
      header: "Atualizado",
      align: "right",
      mobile: "metric",
      width: "130px",
      sortValue: (i) => i.atualizadoEm,
      cell: (i) => (
        <span className="flex flex-col items-end leading-tight">
          <span className="num text-ink-2">{dataBR(i.atualizadoEm)}</span>
          <span className="text-[11px] text-ink-3">
            {desdeQuando(i.atualizadoEm)}
          </span>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Catálogo"
        breadcrumb="Anúncios"
        description="Espelho das publicações do canal — preço praticado, comissão e situação por MLB"
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
            <Button size="sm" className="hidden sm:inline-flex">
              <Download className="w-3.5 h-3.5" />
              Exportar
            </Button>
          </>
        }
        filters={
          <>
            <div className="relative shrink-0 w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="MLB, SKU ou título"
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

            <div className="hidden md:flex items-center gap-2">
              <Segmented<(typeof TIPOS)[number]>
                options={TIPOS}
                value={tipo}
                onChange={setTipo}
              />
              <Segmented<(typeof STATUS)[number]>
                options={STATUS.map((s) => ({ value: s, label: ROTULO_STATUS[s] }))}
                value={status}
                onChange={setStatus}
              />
              <Select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-40"
              >
                <option value="Todas">Todas as categorias</option>
                {CATEGORIAS_CATALOGO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>

            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {filtrados.length} de {CATALOGO.length}
            </span>
          </>
        }
      />

      <PageBody>
        {/* ── Importação do catálogo ─────────────────────────── */}
        <Panel className="overflow-hidden">
          <button
            onClick={() => setImportAberto((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 h-11 hover:bg-panel-2 transition-colors"
          >
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="text-[13px] font-semibold text-ink">
                Importar catálogo
              </span>
              <span className="text-[11px] text-ink-3 truncate hidden sm:inline">
                última carga: {IMPORTACOES_CATALOGO[0].arquivo} ·{" "}
                {IMPORTACOES_CATALOGO[0].linhas} linhas
              </span>
            </span>
            <ChevronDown
              className={
                "w-4 h-4 text-ink-3 shrink-0 transition-transform " +
                (importAberto ? "rotate-180" : "")
              }
            />
          </button>

          {importAberto && (
            <div className="border-t border-line grid lg:grid-cols-[1fr_320px]">
              <div className="p-4">
                <FileDrop
                  hint="Arraste a exportação de anúncios ou clique para escolher"
                  files={arquivos}
                  onFiles={(f) => setArquivos((prev) => [...prev, ...f])}
                  onRemove={(i) =>
                    setArquivos((prev) => prev.filter((_, x) => x !== i))
                  }
                />
                <div className="flex flex-col sm:flex-row sm:items-end gap-3 mt-3">
                  <p className="text-[12px] text-ink-3 flex-1 min-w-0">
                    O arquivo é casado por MLB: linhas conhecidas atualizam preço,
                    comissão e situação; linhas novas entram como anúncio inédito.
                  </p>
                  <Button
                    variant="primary"
                    className="max-sm:h-11 shrink-0"
                    disabled={arquivos.length === 0}
                  >
                    Processar {arquivos.length > 0 && `(${arquivos.length})`}
                  </Button>
                </div>
              </div>

              <div className="p-4 border-t lg:border-t-0 lg:border-l border-line">
                <p className="label mb-2">Cargas recentes</p>
                <ul className="flex flex-col divide-y divide-line border border-line rounded-r2 overflow-hidden">
                  {IMPORTACOES_CATALOGO.map((imp) => (
                    <li key={imp.id} className="px-3 py-2 bg-panel">
                      <p className="num text-[12px] font-medium text-ink truncate">
                        {imp.arquivo}
                      </p>
                      <p className="num text-[11px] text-ink-3 mt-0.5">
                        {imp.enviadoEm} · {imp.linhas} linhas · {imp.novos} novos ·{" "}
                        {imp.atualizados} atualizados
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Panel>

        {/* ── Indicadores da carteira ────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Anúncios no catálogo"
            value={count(resumo.total)}
            hint={`${resumo.finalizados} finalizados`}
          />
          <StatTile
            label="Ativos"
            value={count(resumo.ativos)}
            hint={`${pct((resumo.ativos / resumo.total) * 100, 0)} da carteira`}
          />
          <StatTile
            label="Pausados"
            value={count(resumo.pausados)}
            hint="fora da vitrine agora"
          />
          <StatTile
            label="Comissão média"
            value={pct(resumo.comissao)}
            hint={`negociada ${pct(resumo.negociada)}`}
          />
        </div>

        {/* ── Composição da carteira ─────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel>
            <PanelHeader
              title="Composição por tipo"
              hint="Premium paga comissão maior e entrega mais exposição"
            />
            <div className="px-4 py-4">
              <BarraComposicao
                partes={[
                  { rotulo: "Clássico", valor: resumo.classicos, cor: "var(--s1)" },
                  { rotulo: "Premium", valor: resumo.premium, cor: "var(--s3)" },
                ]}
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Situação das publicações"
              hint={`base de ${count(resumo.estoque)} unidades em estoque`}
            />
            <div className="px-4 py-4">
              <BarraComposicao
                partes={[
                  { rotulo: "Ativos", valor: resumo.ativos, cor: "var(--up)" },
                  { rotulo: "Pausados", valor: resumo.pausados, cor: "var(--warn)" },
                  {
                    rotulo: "Finalizados",
                    valor: resumo.finalizados,
                    cor: "var(--ink-3)",
                  },
                ]}
              />
              {resumo.semPrecoIdeal > 0 && (
                <p className="text-[12px] text-ink-2 mt-3 pt-3 border-t border-line">
                  <span className="font-semibold text-ink">
                    {resumo.semPrecoIdeal}
                  </span>{" "}
                  anúncios publicados ainda não aparecem no relatório de preço
                  ideal de {dataBR(RELATORIO_ATUAL.dataBase)}.
                </p>
              )}
            </div>
          </Panel>
        </div>

        {/* ── Tabela ─────────────────────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Anúncios"
            hint="clique numa linha para abrir a ficha do anúncio"
            action={
              <span className="num text-[12px] text-ink-3">
                {filtrados.length}
              </span>
            }
          />
          <DataTable
            columns={colunas}
            rows={filtrados}
            rowKey={(i) => i.mlb}
            defaultSort={{ key: "preco", dir: "desc" }}
            onRowClick={setSelecionado}
            empty={
              <EmptyState
                icon={SearchX}
                title="Nenhum anúncio encontrado"
                description="Ajuste a busca ou limpe os filtros de tipo, situação e categoria."
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
        <FichaAnuncio item={selecionado} onClose={() => setSelecionado(null)} />
      )}

      {filtrosAbertos && (
        <FilterSheet
          onClose={() => setFiltrosAbertos(false)}
          onClear={limparFiltros}
          applyLabel={`Ver ${filtrados.length} anúncios`}
        >
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
            <div className="grid grid-cols-2 gap-2">
              {STATUS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={
                    "h-11 rounded-r1 border text-[13px] font-medium transition-colors " +
                    (status === s
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {ROTULO_STATUS[s]}
                </button>
              ))}
            </div>
          </div>

          <Field label="Categoria">
            <Select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="h-11"
            >
              <option value="Todas">Todas as categorias</option>
              {CATEGORIAS_CATALOGO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Conta">
            <Select
              value={conta}
              onChange={(e) => setConta(e.target.value)}
              className="h-11"
            >
              <option value="Todas">Todas as contas</option>
              {CONTAS_CATALOGO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </FilterSheet>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Ficha do anúncio
   ══════════════════════════════════════════════════════════════ */

function FichaAnuncio({
  item,
  onClose,
}: {
  item: ItemCatalogo;
  onClose: () => void;
}) {
  const ideal = precoIdealVigente(item.mlb);
  const negociada = comissaoNegociadaVigente(item.mlb);
  const desvio = ideal ? ((item.precoAtual - ideal) / ideal) * 100 : 0;
  const serie = item.historicoPreco;
  const primeiro = serie[0].preco;
  const variacao = ((item.precoAtual - primeiro) / primeiro) * 100;

  return (
    <Sheet
      title={item.titulo}
      subtitle={`${item.mlb} · ${item.sku} · ${item.conta}`}
      onClose={onClose}
      width="620px"
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
        <Badge tone={item.tipo === "Premium" ? "brand" : "neutral"}>
          {item.tipo}
        </Badge>
        <Badge tone={TOM_STATUS[item.status]}>
          <span className="capitalize">{item.status}</span>
        </Badge>
        <Badge tone="neutral">{item.categoria}</Badge>
        {item.freteGratis && <Badge tone="info">frete grátis</Badge>}
        {item.estoque === 0 && <Badge tone="down">sem estoque</Badge>}
      </div>

      {/* números */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-line border-b border-line">
        {[
          { l: "Preço atual", v: money(item.precoAtual) },
          { l: "Comissão", v: pct(item.comissaoAtual) },
          { l: "Estoque", v: count(item.estoque) },
          { l: "No ar há", v: `${count(Math.round(dias(item.criadoEm) / 30))} m` },
        ].map((x) => (
          <div key={x.l} className="px-4 py-3">
            <p className="label">{x.l}</p>
            <p className="num text-[16px] font-semibold text-ink mt-1 leading-none">
              {x.v}
            </p>
          </div>
        ))}
      </div>

      {/* aderência ao preço ideal */}
      <div className="px-4 py-3.5 border-b border-line">
        <p className="label mb-2.5">Aderência ao preço ideal</p>
        {ideal ? (
          <div className="grid grid-cols-2 gap-y-2">
            <span className="text-[12px] text-ink-3">Praticado</span>
            <span className="num text-[13px] text-ink text-right">
              {money(item.precoAtual)}
            </span>
            <span className="text-[12px] text-ink-3">
              Ideal · {dataBR(RELATORIO_ATUAL.dataBase)}
            </span>
            <span className="num text-[13px] text-ink text-right">
              {money(ideal)}
            </span>
            <span className="text-[12px] text-ink-3">Desvio</span>
            <span className="text-right">
              <Badge tone={tomDesvio(desvio)}>
                <span className="num">{fmtDelta(desvio)}</span>
              </Badge>
            </span>
            <span className="text-[12px] text-ink-3">Comissão negociada</span>
            <span className="num text-[13px] text-ink text-right">
              {pct(negociada)}
            </span>
          </div>
        ) : (
          <p className="text-[12px] text-ink-2">
            Este MLB não consta no relatório de preço ideal vigente. Importe um
            relatório mais recente para calcular o desvio.
          </p>
        )}
      </div>

      {/* histórico de preço */}
      <div className="px-4 py-3.5 border-b border-line">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="label">Preço nas últimas 12 semanas</p>
          <span
            className={
              "num text-[12px] font-semibold " +
              (Math.abs(variacao) < 0.05
                ? "text-ink-3"
                : variacao > 0
                  ? "text-up"
                  : "text-down")
            }
          >
            {fmtDelta(variacao)}
          </span>
        </div>
        <div className="h-[190px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="semana" {...AXIS} />
              <YAxis
                {...AXIS}
                width={62}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => money(v)}
              />
              <Tooltip
                cursor={{ stroke: "var(--line-2)", strokeDasharray: "3 3" }}
                content={<ChartTooltip formatter={(v) => money(v)} />}
              />
              {ideal > 0 && (
                <ReferenceLine
                  y={ideal}
                  stroke="var(--ink-3)"
                  strokeDasharray="4 3"
                />
              )}
              <Line
                type="monotone"
                dataKey="preco"
                name="Preço praticado"
                stroke="var(--s1)"
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Legend
          className="mt-2"
          items={[
            { label: "Preço praticado", color: "var(--s1)" },
            ...(ideal > 0
              ? [{ label: "Preço ideal vigente", color: "var(--ink-3)" }]
              : []),
          ]}
        />
      </div>

      {/* ficha cadastral */}
      <div className="px-4 py-3.5">
        <p className="label mb-1">Cadastro</p>
        <KeyValue label="MLB" value={item.mlb} />
        <KeyValue label="SKU" value={item.sku} />
        <KeyValue label="Conta" value={item.conta} />
        <KeyValue label="Categoria" value={item.categoria} />
        <KeyValue label="Criado em" value={dataBR(item.criadoEm)} />
        <KeyValue
          label="Última atualização"
          value={`${dataBR(item.atualizadoEm)} · ${desdeQuando(item.atualizadoEm)}`}
        />
      </div>
    </Sheet>
  );
}
