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
  Input,
  KeyValue,
  Segmented,
  Select,
  Sheet,
} from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import { AXIS, GRID, ChartTooltip } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import { CATEGORIAS_CATALOGO } from "@/mock/catalogo";
import {
  RELATORIOS_PRECO_IDEAL,
  cruzar,
  type LinhaCruzada,
  type RelatorioPrecoIdeal,
} from "@/mock/preco-ideal";
import { count, delta as fmtDelta, money, pct } from "@/lib/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Download,
  FileSpreadsheet,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════
   Utilidades locais
   ══════════════════════════════════════════════════════════════ */

/** yyyy-mm-dd → dd/mm/aaaa, sem passar por fuso. */
function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Corte semântico do desvio: no alvo, atenção, fora. */
function tomDesvio(d: number) {
  const a = Math.abs(d);
  return a < 2 ? "up" : a < 6 ? "warn" : "down";
}

type Faixa = "Todas" | "alvo" | "acima" | "abaixo";
const FAIXAS = ["Todas", "alvo", "acima", "abaixo"] as const;
const ROTULO_FAIXA: Record<Faixa, string> = {
  Todas: "Todas",
  alvo: "No alvo",
  acima: "Acima",
  abaixo: "Abaixo",
};

function naFaixa(desvio: number, f: Faixa) {
  if (f === "Todas") return true;
  if (f === "alvo") return Math.abs(desvio) < 2;
  if (f === "acima") return desvio >= 2;
  return desvio <= -2;
}

const TIPOS = ["Todos", "Clássico", "Premium"] as const;

/** Distribuição por faixa de desvio — a leitura rápida do relatório. */
const BALDES = [
  { rotulo: "≤ −6%", teste: (d: number) => d <= -6, cor: "var(--down)" },
  { rotulo: "−6 a −2%", teste: (d: number) => d > -6 && d <= -2, cor: "var(--warn)" },
  { rotulo: "−2 a 2%", teste: (d: number) => d > -2 && d < 2, cor: "var(--up)" },
  { rotulo: "2 a 6%", teste: (d: number) => d >= 2 && d < 6, cor: "var(--warn)" },
  { rotulo: "≥ 6%", teste: (d: number) => d >= 6, cor: "var(--down)" },
];

/* ══════════════════════════════════════════════════════════════
   Cartão de relatório
   ══════════════════════════════════════════════════════════════ */

function CartaoRelatorio({
  rel,
  ativo,
  onSelect,
}: {
  rel: RelatorioPrecoIdeal;
  ativo: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={
        "text-left rounded-r2 border p-3 transition-colors min-w-0 " +
        (ativo
          ? "border-brand bg-brand-wash"
          : "border-line bg-panel hover:bg-panel-3")
      }
    >
      <span className="flex items-start gap-2 min-w-0">
        <span
          className={
            "w-7 h-7 rounded-r1 border flex items-center justify-center shrink-0 " +
            (ativo ? "border-brand-edge bg-panel" : "border-line bg-panel-3")
          }
        >
          <FileSpreadsheet
            className={"w-3.5 h-3.5 " + (ativo ? "text-brand" : "text-ink-3")}
            strokeWidth={1.75}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={
              "block text-[12px] font-semibold truncate " +
              (ativo ? "text-brand" : "text-ink")
            }
          >
            {rel.fileName}
          </span>
          <span className="num block text-[11px] text-ink-3 mt-0.5">
            base {dataBR(rel.dataBase)} · {rel.linhas.length} itens
          </span>
          <span className="num block text-[11px] text-ink-3">
            enviado {rel.uploadedAt}
          </span>
        </span>
      </span>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════
   Página
   ══════════════════════════════════════════════════════════════ */

export default function PrecoIdeal() {
  const ordenados = React.useMemo(
    () => [...RELATORIOS_PRECO_IDEAL].sort((a, b) => b.dataBase.localeCompare(a.dataBase)),
    []
  );

  const [relId, setRelId] = React.useState(ordenados[0].id);
  const [busca, setBusca] = React.useState("");
  const [faixa, setFaixa] = React.useState<Faixa>("Todas");
  const [tipo, setTipo] = React.useState<(typeof TIPOS)[number]>("Todos");
  const [categoria, setCategoria] = React.useState("Todas");
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  const [selecionado, setSelecionado] = React.useState<LinhaCruzada | null>(null);
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [dataBase, setDataBase] = React.useState("");

  const relatorio = ordenados.find((r) => r.id === relId) ?? ordenados[0];

  const linhas = React.useMemo(() => cruzar(relatorio), [relatorio]);

  const resumo = React.useMemo(() => {
    const alvo = linhas.filter((l) => Math.abs(l.desvio) < 2).length;
    const acima = linhas.filter((l) => l.desvio >= 2).length;
    const abaixo = linhas.filter((l) => l.desvio <= -2).length;
    const medio =
      linhas.reduce((s, l) => s + Math.abs(l.desvio), 0) / (linhas.length || 1);
    const economia = linhas
      .filter((l) => l.desvio < 0)
      .reduce((s, l) => s + (l.precoIdeal - l.precoPraticado), 0);
    const comissao =
      linhas.reduce((s, l) => s + l.comissaoNegociada, 0) / (linhas.length || 1);
    return { alvo, acima, abaixo, medio, economia, comissao, total: linhas.length };
  }, [linhas]);

  const distribuicao = React.useMemo(
    () =>
      BALDES.map((b) => ({
        faixa: b.rotulo,
        cor: b.cor,
        itens: linhas.filter((l) => b.teste(l.desvio)).length,
      })),
    [linhas]
  );

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (!naFaixa(l.desvio, faixa)) return false;
      if (tipo !== "Todos" && l.tipo !== tipo) return false;
      if (categoria !== "Todas" && l.categoria !== categoria) return false;
      if (!q) return true;
      return (
        l.mlb.toLowerCase().includes(q) ||
        l.sku.toLowerCase().includes(q) ||
        l.titulo.toLowerCase().includes(q)
      );
    });
  }, [linhas, busca, faixa, tipo, categoria]);

  const filtrosAtivos =
    (faixa !== "Todas" ? 1 : 0) +
    (tipo !== "Todos" ? 1 : 0) +
    (categoria !== "Todas" ? 1 : 0);

  function limparFiltros() {
    setBusca("");
    setFaixa("Todas");
    setTipo("Todos");
    setCategoria("Todas");
  }

  const colunas: Column<LinhaCruzada>[] = [
    {
      key: "titulo",
      header: "Título",
      mobile: "title",
      sticky: true,
      width: "290px",
      sortValue: (l) => l.titulo,
      cell: (l) => (
        <span className="min-w-0 block">
          <span className="block font-medium text-ink truncate max-w-[260px]">
            {l.titulo}
          </span>
          <span className="block text-[11px] text-ink-3 truncate">
            {l.categoria} · {l.tipo}
          </span>
        </span>
      ),
    },
    {
      key: "mlb",
      header: "MLB",
      mobile: "subtitle",
      width: "140px",
      sortValue: (l) => l.mlb,
      cell: (l) => <span className="num text-ink-2">{l.mlb}</span>,
    },
    {
      key: "sku",
      header: "SKU",
      width: "118px",
      sortValue: (l) => l.sku,
      cell: (l) => <span className="num text-ink-2">{l.sku}</span>,
    },
    {
      key: "praticado",
      header: "Preço praticado",
      align: "right",
      mobile: "metric",
      width: "150px",
      sortValue: (l) => l.precoPraticado,
      cell: (l) => (
        <span className="num font-semibold text-ink">
          {money(l.precoPraticado)}
        </span>
      ),
    },
    {
      key: "ideal",
      header: "Preço ideal",
      align: "right",
      mobile: "metric",
      width: "140px",
      sortValue: (l) => l.precoIdeal,
      cell: (l) => <span className="num text-ink-2">{money(l.precoIdeal)}</span>,
    },
    {
      key: "desvio",
      header: "Desvio",
      align: "right",
      mobile: "metric",
      width: "110px",
      sortValue: (l) => l.desvio,
      cell: (l) => (
        <Badge tone={tomDesvio(l.desvio)}>
          <span className="num">{fmtDelta(l.desvio)}</span>
        </Badge>
      ),
    },
    {
      key: "comissao",
      header: "Comissão negociada",
      align: "right",
      width: "170px",
      sortValue: (l) => l.comissaoNegociada,
      cell: (l) => (
        <span className="flex items-center justify-end gap-1.5">
          {l.comissaoNegociada < l.comissaoAtual && (
            <span className="num text-[11px] text-ink-3 line-through hidden lg:inline">
              {pct(l.comissaoAtual)}
            </span>
          )}
          <span
            className={
              "num " +
              (l.comissaoNegociada < l.comissaoAtual
                ? "text-up font-semibold"
                : "text-ink-2")
            }
          >
            {pct(l.comissaoNegociada)}
          </span>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Preço ideal"
        breadcrumb="Anúncios"
        description="Relatórios importados, preço alvo por MLB e o desvio do que está no ar"
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
              <Segmented<Faixa>
                options={FAIXAS.map((f) => ({ value: f, label: ROTULO_FAIXA[f] }))}
                value={faixa}
                onChange={setFaixa}
              />
              <Segmented<(typeof TIPOS)[number]>
                options={TIPOS}
                value={tipo}
                onChange={setTipo}
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
              {filtrados.length} de {linhas.length}
            </span>
          </>
        }
      />

      <PageBody>
        {/* ── Importar relatório ─────────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Importar relatório de preço ideal"
            hint="a data-base define a qual recorte o preço alvo pertence"
          />
          <div className="p-4 grid lg:grid-cols-[1fr_280px] gap-4">
            <FileDrop
              hint="Arraste a planilha de preço ideal ou clique para escolher"
              files={arquivos}
              onFiles={(f) => setArquivos((prev) => [...prev, ...f])}
              onRemove={(i) => setArquivos((prev) => prev.filter((_, x) => x !== i))}
            />
            <div className="flex flex-col gap-3">
              <Field
                label="Data-base"
                hint="Referência do cálculo dentro da planilha."
              >
                <Input
                  type="date"
                  value={dataBase}
                  onChange={(e) => setDataBase(e.target.value)}
                  className="max-sm:h-11"
                />
              </Field>
              <Button
                variant="primary"
                className="max-sm:h-11"
                disabled={arquivos.length === 0 || !dataBase}
              >
                Processar relatório
              </Button>
              <p className="text-[11px] text-ink-3">
                As linhas são casadas por MLB com o catálogo. O preço praticado
                sai do catálogo; o alvo e a comissão saem daqui.
              </p>
            </div>
          </div>
        </Panel>

        {/* ── Relatórios importados ──────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Relatórios importados"
            hint="selecione um recorte para ver a tabela abaixo"
            action={
              <span className="num text-[12px] text-ink-3">
                {ordenados.length}
              </span>
            }
          />
          <div className="p-3 grid sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {ordenados.map((r) => (
              <CartaoRelatorio
                key={r.id}
                rel={r}
                ativo={r.id === relatorio.id}
                onSelect={() => setRelId(r.id)}
              />
            ))}
          </div>
        </Panel>

        {/* ── Indicadores do relatório ───────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="No alvo"
            value={count(resumo.alvo)}
            hint={`${pct((resumo.alvo / (resumo.total || 1)) * 100, 0)} do relatório`}
          />
          <StatTile
            label="Acima do ideal"
            value={count(resumo.acima)}
            hint="preço praticado maior que o alvo"
          />
          <StatTile
            label="Abaixo do ideal"
            value={count(resumo.abaixo)}
            hint={`${money(Math.abs(resumo.economia))} deixados na mesa`}
          />
          <StatTile
            label="Desvio médio"
            value={pct(resumo.medio)}
            hint={`comissão negociada ${pct(resumo.comissao)}`}
          />
        </div>

        {/* ── Distribuição do desvio ─────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Distribuição do desvio"
            hint={`base ${dataBR(relatorio.dataBase)} · ${relatorio.linhas.length} itens`}
          />
          <div className="h-[210px] px-2 pt-4 pb-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={distribuicao}
                margin={{ top: 6, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid {...GRID} />
                <XAxis dataKey="faixa" {...AXIS} />
                <YAxis {...AXIS} width={30} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "var(--panel-3)" }}
                  content={<ChartTooltip formatter={(v) => count(v)} />}
                />
                <Bar
                  dataKey="itens"
                  name="Anúncios"
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                >
                  {distribuicao.map((d) => (
                    <Cell key={d.faixa} fill={d.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="px-4 py-3 border-t border-line">
            <p className="text-[12px] text-ink-2">
              <span className="font-semibold text-ink">Leitura: </span>
              até 2% de distância o preço está no alvo; entre 2% e 6% vale revisar
              na próxima rodada; acima de 6% o anúncio está fora da tabela e pede
              correção imediata.
            </p>
          </div>
        </Panel>

        {/* ── Tabela do relatório ────────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title={`Itens do relatório · ${dataBR(relatorio.dataBase)}`}
            hint="clique numa linha para comparar praticado e ideal"
            action={
              <span className="num text-[12px] text-ink-3">
                {filtrados.length}
              </span>
            }
          />
          <DataTable
            columns={colunas}
            rows={filtrados}
            rowKey={(l) => l.mlb}
            defaultSort={{ key: "desvio", dir: "desc" }}
            onRowClick={setSelecionado}
            empty={
              <EmptyState
                icon={SearchX}
                title="Nenhum item nesta faixa"
                description="Ajuste a busca ou volte para todas as faixas de desvio."
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
        <ComparativoLinha
          linha={selecionado}
          relatorio={relatorio}
          onClose={() => setSelecionado(null)}
        />
      )}

      {filtrosAbertos && (
        <FilterSheet
          onClose={() => setFiltrosAbertos(false)}
          onClear={limparFiltros}
          applyLabel={`Ver ${filtrados.length} itens`}
        >
          <div>
            <p className="label mb-2">Faixa de desvio</p>
            <div className="grid grid-cols-2 gap-2">
              {FAIXAS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFaixa(f)}
                  className={
                    "h-11 rounded-r1 border text-[13px] font-medium transition-colors " +
                    (faixa === f
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {ROTULO_FAIXA[f]}
                </button>
              ))}
            </div>
          </div>

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

          <div>
            <p className="label mb-2">Relatório</p>
            <div className="flex flex-col gap-1.5">
              {ordenados.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRelId(r.id)}
                  className={
                    "flex items-center justify-between gap-2 h-11 px-3 rounded-r1 border text-[13px] font-medium transition-colors " +
                    (r.id === relatorio.id
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  <span className="num truncate">{dataBR(r.dataBase)}</span>
                  <span className="num text-[12px]">{r.linhas.length}</span>
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
   Comparativo de uma linha
   ══════════════════════════════════════════════════════════════ */

function ComparativoLinha({
  linha,
  relatorio,
  onClose,
}: {
  linha: LinhaCruzada;
  relatorio: RelatorioPrecoIdeal;
  onClose: () => void;
}) {
  const tom = tomDesvio(linha.desvio);
  const diferenca = linha.precoPraticado - linha.precoIdeal;
  // A régua: o ideal fica no centro e o praticado desloca para os lados.
  const posicao = Math.max(-1, Math.min(1, linha.desvio / 15));

  // Como este MLB se comportou nos demais relatórios importados.
  const historico = RELATORIOS_PRECO_IDEAL.map((r) => {
    const l = r.linhas.find((x) => x.mlb === linha.mlb);
    if (!l) return null;
    return {
      dataBase: r.dataBase,
      precoIdeal: l.precoIdeal,
      comissao: l.comissaoNegociada,
      desvio: +(
        ((linha.precoPraticado - l.precoIdeal) / l.precoIdeal) *
        100
      ).toFixed(2),
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <Sheet
      title={linha.titulo}
      subtitle={`${linha.mlb} · ${linha.sku} · base ${dataBR(relatorio.dataBase)}`}
      onClose={onClose}
      width="560px"
      footer={
        <>
          <Button className="flex-1 max-sm:h-11" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="primary" className="flex-1 max-sm:h-11">
            Aplicar preço ideal
          </Button>
        </>
      }
    >
      <div className="px-4 py-3 flex flex-wrap gap-1.5 border-b border-line">
        <Badge tone={linha.tipo === "Premium" ? "brand" : "neutral"}>
          {linha.tipo}
        </Badge>
        <Badge tone={linha.status === "ativo" ? "up" : "neutral"}>
          <span className="capitalize">{linha.status}</span>
        </Badge>
        <Badge tone="neutral">{linha.categoria}</Badge>
        <Badge tone={tom}>
          <span className="num">{fmtDelta(linha.desvio)}</span>
        </Badge>
      </div>

      {/* régua praticado × ideal */}
      <div className="px-4 py-4 border-b border-line">
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-[19px] font-semibold text-ink leading-none">
            {money(linha.precoPraticado)}
          </span>
          <span className="num text-[13px] text-ink-3">
            ideal {money(linha.precoIdeal)}
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
          <span className="num text-[11px] text-ink-2">
            {diferenca >= 0 ? "+" : "−"}
            {money(Math.abs(diferenca))}
          </span>
          <span className="text-[11px] text-ink-3">acima do ideal</span>
        </div>
      </div>

      <div className="px-4 py-3.5 border-b border-line">
        <p className="label mb-1">Linha do relatório</p>
        <KeyValue label="MLB" value={linha.mlb} />
        <KeyValue label="SKU" value={linha.sku} />
        <KeyValue label="Preço praticado" value={money(linha.precoPraticado)} />
        <KeyValue label="Preço ideal" value={money(linha.precoIdeal)} />
        <KeyValue
          label="Desvio"
          value={fmtDelta(linha.desvio)}
          tone={tom}
        />
        <KeyValue label="Comissão do tipo" value={pct(linha.comissaoAtual)} />
        <KeyValue
          label="Comissão negociada"
          value={pct(linha.comissaoNegociada)}
          tone={linha.comissaoNegociada < linha.comissaoAtual ? "up" : undefined}
        />
      </div>

      <div className="px-4 py-3.5">
        <p className="label mb-2">Preço ideal por data-base</p>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full border-collapse text-[12px] min-w-[380px]">
            <thead>
              <tr className="bg-panel-2">
                {["Data-base", "Ideal", "Desvio", "Comissão"].map((h, i) => (
                  <th
                    key={h}
                    className={
                      "h-8 px-2 border-b border-line font-semibold text-[10px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap " +
                      (i === 0 ? "text-left" : "text-right")
                    }
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historico.map((h, i) => (
                <tr
                  key={h.dataBase}
                  className={
                    "border-b border-line last:border-0 " +
                    (i % 2 === 1 ? "bg-panel-2/55" : "")
                  }
                >
                  <td className="num h-8 px-2 text-ink font-medium whitespace-nowrap">
                    {dataBR(h.dataBase)}
                  </td>
                  <td className="num h-8 px-2 text-right text-ink-2">
                    {money(h.precoIdeal)}
                  </td>
                  <td className="h-8 px-2 text-right">
                    <Badge tone={tomDesvio(h.desvio)}>
                      <span className="num">{fmtDelta(h.desvio)}</span>
                    </Badge>
                  </td>
                  <td className="num h-8 px-2 text-right text-ink-2">
                    {pct(h.comissao)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-ink-3 mt-2">
          O desvio de cada linha usa o preço praticado de hoje contra o alvo
          daquele recorte.
        </p>
      </div>
    </Sheet>
  );
}
