"use client";

import { linkDoAnuncio } from "@/lib/links";
import * as React from "react";
import { useRouter } from "next/navigation";
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
import { type ItemCatalogo, type StatusAnuncio } from "@/mock/catalogo";
import type { DadosCatalogo } from "@/lib/dados/catalogo";
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
  Info,
  Loader2,
  Package,
  RefreshCw,
  Search,
  SearchX,
  SlidersHorizontal,
  TriangleAlert,
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

export default function CatalogoAnuncios({ dados }: { dados: DadosCatalogo }) {
  const {
    itens: CATALOGO,
    categorias: CATEGORIAS_CATALOGO,
    contas: CONTAS_CATALOGO,
    importacoes: IMPORTACOES_CATALOGO,
  } = dados;

  const router = useRouter();
  const [sincronizando, setSincronizando] = React.useState(false);
  const [erroSync, setErroSync] = React.useState<string | null>(null);
  const [origemAberta, setOrigemAberta] = React.useState(false);

  /**
   * Força uma releitura do catálogo no canal.
   *
   * Só a etapa de catálogo: pedidos e visitas são varreduras longas, e
   * quem aperta este botão quer ver preço e situação atualizados agora,
   * não esperar cinco minutos por dado de outra tela.
   */
  async function sincronizar() {
    setSincronizando(true);
    setErroSync(null);
    try {
      const r = await fetch("/api/meli/sincronizar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          etapas: { catalogo: true, pedidos: false, visitas: false, diarias: false },
        }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErroSync(corpo.erro ?? `Não deu para sincronizar (HTTP ${r.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setErroSync("Não consegui falar com o servidor.");
    } finally {
      setSincronizando(false);
    }
  }

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
    /*
     * A média da praticada é ponderada pela RECEITA, não pelo número de
     * anúncios: um MLB que vendeu R$ 40 mil a 7% e outro que vendeu R$ 200
     * a 16% não têm o mesmo peso no caixa, e a média simples diria que
     * têm.
     */
    const comPraticada = publicados.filter((i) => i.comissaoPraticada != null);
    const receitaPraticada = comPraticada.reduce((s, i) => s + (i.receitaComissao ?? 0), 0);
    const comissaoPraticada = receitaPraticada
      ? comPraticada.reduce(
          (s, i) => s + i.comissaoPraticada! * (i.receitaComissao ?? 0),
          0
        ) / receitaPraticada
      : null;
    return {
      comissaoPraticada,
      anunciosComPraticada: comPraticada.length,
      total: CATALOGO.length,
      publicados: publicados.length,
      ativos: ativos.length,
      pausados: pausados.length,
      finalizados: finalizados.length,
      classicos: CATALOGO.filter((i) => i.tipo === "Clássico").length,
      premium: CATALOGO.filter((i) => i.tipo === "Premium").length,
      comissao,
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
      header: "Comissão padrão",
      align: "right",
      mobile: "metric",
      width: "120px",
      sortValue: (i) => i.comissaoAtual,
      cell: (i) => <span className="num text-ink-2">{pct(i.comissaoAtual)}</span>,
    },
    /*
     * A padrão é a alíquota de tabela do tipo de anúncio; a praticada sai
     * dos pedidos deste MLB. Como quase todo anúncio daqui tem redução
     * negociada, a padrão sozinha superestima o custo — e era só ela que
     * a tela mostrava.
     */
    {
      key: "comissaoPraticada",
      header: "Comissão praticada",
      align: "right",
      mobile: "metric",
      width: "140px",
      sortValue: (i) => i.comissaoPraticada ?? -1,
      cell: (i) =>
        i.comissaoPraticada == null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className="num">
            <span
              className={
                i.comissaoPraticada < i.comissaoAtual - 0.5
                  ? "text-up font-medium"
                  : "text-ink-2"
              }
            >
              {pct(i.comissaoPraticada)}
            </span>
            <span className="block text-[10.5px] text-ink-3">
              sobre {money(i.receitaComissao ?? 0)}
            </span>
          </span>
        ),
    },
    /*
     * Estoque saiu da tela a pedido: a operação não usa o número hoje, e o
     * que vem do export do canal é o saldo do depósito no dia da
     * exportação — envelhece rápido e induz decisão errada.
     *
     * O dado continua sendo importado e guardado; é só a exibição que sai.
     */
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
            <Button size="sm" variant="primary" disabled={sincronizando} onClick={sincronizar}>
              {sincronizando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Consultando o canal
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" strokeWidth={2.25} />
                  Atualizar
                </>
              )}
            </Button>
            <Button size="sm" onClick={() => setOrigemAberta(true)}>
              <Info className="w-3.5 h-3.5" />
              De onde vem
            </Button>
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
              {/*
               * O seletor de conta só existia no painel de filtros do
               * celular. No desktop a tela somava as duas contas do
               * Mercado Livre sem dizer, que é exatamente o que o Eduardo
               * apontou na revisão.
               */}
              {CONTAS_CATALOGO.length > 1 && (
                <Select
                  value={conta}
                  onChange={(e) => setConta(e.target.value)}
                  className="w-44"
                  aria-label="Conta do canal"
                >
                  <option value="Todas">Todas as contas</option>
                  {CONTAS_CATALOGO.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {filtrados.length} de {CATALOGO.length}
            </span>
          </>
        }
      />

      <PageBody>
        {erroSync && (
          <Panel className="px-4 py-3 flex items-start gap-2.5 border-down/30">
            <TriangleAlert className="w-4 h-4 text-down shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-[12.5px] text-ink-2">
              <span className="font-semibold text-ink">Não deu para atualizar. </span>
              {erroSync} O que está na tela é a última leitura guardada.
            </p>
          </Panel>
        )}

        {/* ── Idade do dado ──────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap text-[11.5px] text-ink-3">
          <span>
            Tudo nesta tela vem da API do Mercado Livre.{" "}
            {dados.sincronizadoEm ? (
              <>
                Última leitura em{" "}
                <span className="num text-ink-2">
                  {new Date(dados.sincronizadoEm).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                .
              </>
            ) : (
              <span className="text-warn">Nunca sincronizado.</span>
            )}
          </span>
          <button
            onClick={() => setOrigemAberta(true)}
            className="text-brand hover:underline"
          >
            Ver a origem de cada coluna
          </button>
        </div>

        {/* ── Cargas do catálogo ─────────────────────────────── */}
        {IMPORTACOES_CATALOGO.length > 0 && (
          <Panel className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <p className="label">Cargas recentes do catálogo</p>
              <a href="/importar" className="text-[12px] text-brand hover:underline shrink-0">
                Importar nova carga
              </a>
            </div>
            <ul className="flex flex-col divide-y divide-line border border-line rounded-r2 overflow-hidden">
              {IMPORTACOES_CATALOGO.slice(0, 5).map((imp) => (
                <li key={imp.id} className="px-3 py-2 bg-panel">
                  <p className="num text-[12px] font-medium text-ink truncate">{imp.arquivo}</p>
                  <p className="num text-[11px] text-ink-3 mt-0.5">
                    {imp.enviadoEm} · {imp.linhas} linhas
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        )}

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
            label="Comissão praticada"
            value={
              resumo.comissaoPraticada == null ? "—" : pct(resumo.comissaoPraticada)
            }
            hint={
              resumo.comissaoPraticada == null
                ? "nenhum pedido com comissão informada"
                : `padrão é ${pct(resumo.comissao)} · ${count(resumo.anunciosComPraticada)} anúncios com apuração`
            }
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
              hint={`${count(resumo.publicados)} anúncios publicados`}
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

      {origemAberta && (
        <OrigemDosDados
          sincronizadoEm={dados.sincronizadoEm}
          comComissaoPraticada={dados.comComissaoPraticada}
          total={CATALOGO.length}
          onClose={() => setOrigemAberta(false)}
        />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   De onde vem cada coluna
   ══════════════════════════════════════════════════════════════ */

/**
 * O Eduardo pediu isto explicitamente na revisão: "documentar todo dado
 * mostrado e sua origem, já que tudo vem por API".
 *
 * Só que não é bem tudo. Três colunas desta tela NÃO vêm da API, e
 * confundir as duas coisas é o que faz alguém decidir preço com um número
 * que não é o que parece. Então a lista separa por FONTE, não por coluna,
 * e diz na cara quando o dado é derivado.
 */
const ORIGENS: {
  fonte: string;
  tom: "api" | "pedidos" | "derivado";
  colunas: { nome: string; detalhe: string }[];
}[] = [
  {
    fonte: "API do Mercado Livre",
    tom: "api",
    colunas: [
      { nome: "MLB", detalhe: "o identificador do anúncio no canal." },
      { nome: "Título", detalhe: "o título publicado, exatamente como está no ar." },
      { nome: "SKU", detalhe: "o `seller_custom_field` do anúncio — o SKU que VOCÊ cadastrou lá, não o do ERP." },
      { nome: "Tipo", detalhe: "`listing_type_id`: gold_pro vira Premium, gold_special vira Clássico." },
      { nome: "Status", detalhe: "ativo, pausado ou finalizado, como o canal reporta." },
      { nome: "Preço atual", detalhe: "o preço de VITRINE agora — não o que foi vendido." },
      { nome: "Comissão padrão", detalhe: "a alíquota de tabela do tipo de anúncio: 11,5% no Clássico, 16,5% no Premium." },
    ],
  },
  {
    fonte: "Seus pedidos, no banco",
    tom: "pedidos",
    colunas: [
      {
        nome: "Comissão praticada",
        detalhe:
          "o que o canal REALMENTE cobrou, apurado pedido a pedido e rateado entre os itens. Só entra pedido em que o canal informou a comissão — onde não informou, a coluna fica em traço em vez de chutar.",
      },
    ],
  },
  {
    fonte: "Derivado aqui dentro",
    tom: "derivado",
    colunas: [
      {
        nome: "Categoria",
        detalhe:
          "a primeira palavra do título. O canal não exporta categoria e os produtos ainda não estão cadastrados — é um agrupamento grosseiro, mas que erra de forma visível.",
      },
      {
        nome: "Histórico de preço",
        detalhe:
          "o retrato semanal do preço de vitrine, guardado toda vez que o catálogo sincroniza. A API só devolve o preço de agora; o histórico existe porque a plataforma o acumula.",
      },
    ],
  },
];

const TOM_ORIGEM: Record<string, "brand" | "up" | "warn"> = {
  api: "brand",
  pedidos: "up",
  derivado: "warn",
};

function OrigemDosDados({
  sincronizadoEm,
  comComissaoPraticada,
  total,
  onClose,
}: {
  sincronizadoEm: string | null;
  comComissaoPraticada: number;
  total: number;
  onClose: () => void;
}) {
  return (
    <Sheet
      title="De onde vem cada dado"
      subtitle="Catálogo · o que é lido do canal, o que é seu e o que é calculado"
      onClose={onClose}
      width="560px"
    >
      <div className="px-4 py-3.5 border-b border-line">
        <p className="text-[12.5px] text-ink-2 leading-relaxed">
          {sincronizadoEm ? (
            <>
              A última leitura do canal foi em{" "}
              <span className="num text-ink font-medium">
                {new Date(sincronizadoEm).toLocaleString("pt-BR")}
              </span>
              . O botão <span className="font-medium text-ink">Atualizar</span>, no topo,
              força uma nova agora — ele consulta só o catálogo, então leva segundos e não
              a sincronização inteira.
            </>
          ) : (
            <>
              Este catálogo nunca foi sincronizado com o canal. O que está na tela veio de
              importação de planilha.
            </>
          )}
        </p>
      </div>

      {ORIGENS.map((o) => (
        <div key={o.fonte} className="px-4 py-3.5 border-b border-line">
          <div className="flex items-center gap-2 mb-2">
            <Badge tone={TOM_ORIGEM[o.tom]}>{o.fonte}</Badge>
            {o.tom === "pedidos" && (
              <span className="num text-[11px] text-ink-3">
                {count(comComissaoPraticada)} de {count(total)} anúncios
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {o.colunas.map((c) => (
              <li key={c.nome} className="text-[12px] leading-relaxed">
                <span className="font-semibold text-ink">{c.nome}</span>
                <span className="text-ink-2"> — {c.detalhe}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="px-4 py-3.5">
        <p className="text-[11.5px] text-ink-3 leading-relaxed">
          O que esta tela <span className="text-ink-2 font-medium">não</span> mostra: preço
          vendido, unidades e receita. Nada disso é catálogo — é pedido, e fica em Vendas e
          em Performance de preço. Misturar os dois aqui daria a impressão de que o preço
          de vitrine é o preço que entrou.
        </p>
      </div>
    </Sheet>
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
  const serie = item.historicoPreco;
  // Anúncio sem retrato semanal de preço não tem série — a maioria. Ler
  // `serie[0]` direto derrubava a ficha inteira ao clicar num deles.
  const primeiro = serie[0]?.preco ?? item.precoAtual;
  const variacao = primeiro ? ((item.precoAtual - primeiro) / primeiro) * 100 : 0;

  return (
    <Sheet
      title={item.titulo}
      subtitle={`${item.mlb} · ${item.sku} · ${item.conta}`}
      onClose={onClose}
      width="620px"
      footer={
        <>
          {linkDoAnuncio(item.mlb) ? (
            <a
              href={linkDoAnuncio(item.mlb)!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-8 max-sm:h-11 inline-flex items-center justify-center gap-1.5 rounded-r1 border border-line-2 bg-panel text-[13px] text-ink hover:bg-panel-3 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir no Mercado Livre
            </a>
          ) : (
            <Button className="flex-1 max-sm:h-11" onClick={onClose}>
              Fechar
            </Button>
          )}
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
      </div>

      {/* números */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-line border-b border-line">
        {[
          { l: "Preço atual", v: money(item.precoAtual) },
          { l: "Comissão padrão", v: pct(item.comissaoAtual) },
          {
            l: "Comissão praticada",
            v: item.comissaoPraticada == null ? "—" : pct(item.comissaoPraticada),
          },
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
