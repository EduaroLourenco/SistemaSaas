"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge, EmptyState } from "@/components/ui/primitives";
import { FileDrop, SectionTitle, Segmented, Field, Input } from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type Column } from "@/components/ui/data-table";
import { money, count, pct } from "@/lib/format";
import {
  Check,
  Download,
  FileSpreadsheet,
  History,
  Info,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CircleAlert,
} from "lucide-react";

/* ══ Tipos que a rota devolve ══════════════════════════════════ */

type Tag = "tabela_acima_ml" | "tabela_acima_original" | "quase" | "folga";

type Linha = {
  id: string;
  linha: number;
  arquivo: string;
  mlb: string;
  sku: string;
  titulo: string;
  campanha: string;
  tipoAnuncio: string;
  tipoCampanha: "Com Redução" | "Sem Redução";
  precoOriginal: number | null;
  precoPropostoML: number | null;
  precoOferta: number | null;
  precoTabela: number;
  /** Tabela menos 5% — o menor preço que ainda preserva a margem. */
  precoPiso: number;
  /** Piso com o desconto extra. Nulo em campanha com redução de tarifa. */
  precoComExtra: number | null;
  reducaoTarifa: string;
  desconto: number | null;
  folga: number | null;
  decisao: string;
  aprovado: boolean;
  recalculado: boolean;
  motivo: string;
  tags: Tag[];
};

type Resultado = {
  id: string;
  resumoBase: { itens: number; precosPorSku: number; precosPorMlb: number };
  arquivos: { nome: string; campanha: string; linhas: number }[];
  resumo: {
    lidos: number;
    participam: number;
    fora: number;
    pendencias: number;
    recalculados: number;
    revisar: number;
  };
  revisao: Record<Tag, Linha[]>;
  linhas: Linha[];
  /** O que ficou guardado. Nulo quando a gravação falhou. */
  gravacao: {
    processamentoId: string;
    campanhas: number;
    itens: number;
    ofertas: number;
    semAnuncio: number;
  } | null;
  /** Por que não gravou. O arquivo sai mesmo assim. */
  erroGravacao?: string | null;
};

/** Cada cenário de revisão, com o que ele significa e o que fazer. */
const CENARIOS: {
  tag: Tag;
  rotulo: string;
  tom: "down" | "warn" | "info" | "up";
  regra: string;
  acao: string;
}[] = [
  {
    tag: "tabela_acima_original",
    rotulo: "Sem espaço para desconto",
    tom: "down",
    regra:
      "O preço de tabela está acima do preço já publicado no anúncio. Entrar na campanha exigiria aumentar o preço.",
    acao:
      "Revisar o preço do anúncio fora de promoção, ou conferir se o custo na Fórmula base está atualizado.",
  },
  {
    tag: "tabela_acima_ml",
    rotulo: "Proposta abaixo da tabela",
    tom: "warn",
    regra:
      "O preço que o canal propôs está abaixo do que a sua tabela aguenta para aquela comissão.",
    acao:
      "Participar assim corrói margem. Vale só se o volume compensar — compare com o histórico do anúncio.",
  },
  {
    tag: "quase",
    rotulo: "Recusado por pouco",
    tom: "info",
    regra:
      "Faltou até R$ 100 para o preço proposto alcançar o preço de tabela. Os que faltaram menos vêm primeiro.",
    acao:
      "Em item de giro alto, abrir mão de poucos reais pode valer a exposição da campanha.",
  },
  {
    tag: "folga",
    rotulo: "Dava para descontar mais",
    tom: "up",
    regra:
      "Aprovado com o preço acima do de tabela — ainda sobra margem para um desconto maior.",
    acao:
      "Nos itens com redução de tarifa a sobra é maior, porque o canal cobra menos comissão. Bom lugar para ganhar posição.",
  },
];

const ETAPAS = [
  { n: 1, titulo: "Enviar planilhas", hint: "Central de Promoções — a Fórmula base é opcional" },
  { n: 2, titulo: "Conferir", hint: "decisão item a item" },
  { n: 3, titulo: "Exportar", hint: "planilha pronta para subir" },
] as const;

const VISOES = [
  { value: "todos", label: "Todos" },
  { value: "participam", label: "Participam" },
  { value: "fora", label: "Não participam" },
  { value: "pendencias", label: "Pendências" },
] as const;

type Visao = (typeof VISOES)[number]["value"];

export default function ProcessarPromocoes() {
  const [etapa, setEtapa] = React.useState<1 | 2 | 3>(1);
  const [visao, setVisao] = React.useState<Visao>("todos");
  const [planilhas, setPlanilhas] = React.useState<File[]>([]);
  const [base, setBase] = React.useState<File[]>([]);
  const [descontoExtra, setDescontoExtra] = React.useState("0");
  const [processando, setProcessando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [resultado, setResultado] = React.useState<Resultado | null>(null);
  const [baixando, setBaixando] = React.useState(false);

  /**
   * Baixa o pacote conferindo a resposta antes de salvar.
   *
   * Era um `<a download>` apontando direto para a rota. Um link não
   * distingue sucesso de erro: quando o pacote não era encontrado, o
   * navegador salvava a resposta 404 — um JSON — como arquivo chamado
   * "pac_xxx.json", e o usuário via um download quebrado sem explicação.
   *
   * Agora o erro vira mensagem na tela, com o texto que o servidor mandou.
   */
  async function baixarPacote(id: string) {
    setBaixando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/promocoes/baixar/${id}`);
      if (!r.ok) {
        const corpo = await r.json().catch(() => ({}));
        setErro(
          corpo.erro ??
            `Não consegui baixar o pacote (HTTP ${r.status}). Processe de novo.`
        );
        return;
      }

      const blob = await r.blob();
      if (blob.size === 0) {
        setErro("O pacote veio vazio. Processe as planilhas de novo.");
        return;
      }

      const cd = r.headers.get("content-disposition") ?? "";
      const nome =
        cd.match(/filename="([^"]+)"/)?.[1] ?? "promocoes-processadas.zip";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Sem conexão — o pacote não foi baixado.");
    } finally {
      setBaixando(false);
    }
  }

  async function processar() {
    setProcessando(true);
    setErro(null);

    const fd = new FormData();
    planilhas.forEach((f) => fd.append("planilha", f));
    if (base[0]) fd.append("formulaBase", base[0]);
    // O campo aceita 5 ou 0,05 — o motor espera fração.
    const d = parseFloat(descontoExtra.replace(",", ".")) || 0;
    fd.append("descontoExtra", String(d > 1 ? d / 100 : d));

    try {
      const r = await fetch("/api/promocoes/processar", { method: "POST", body: fd });

      /*
       * Lê como TEXTO antes de tentar JSON.
       *
       * Quando a função estoura tempo ou memória, a Vercel devolve uma
       * página de erro em HTML. `r.json()` estourava ali e caía no catch
       * genérico — a tela dizia "não consegui falar com o servidor" e o
       * motivo real ficava invisível. Agora o status e o começo da
       * resposta aparecem, que é o que permite consertar.
       */
      const bruto = await r.text();
      let json: { erro?: string } & Record<string, unknown>;
      try {
        json = JSON.parse(bruto);
      } catch {
        setErro(
          `O servidor respondeu ${r.status} sem JSON. ` +
            (r.status === 504
              ? "Estourou o tempo limite — tente com menos planilhas de uma vez."
              : bruto.slice(0, 160).replace(/<[^>]+>/g, " ").trim())
        );
        return;
      }

      if (!r.ok) {
        setErro(json.erro ?? `Falha ao processar (HTTP ${r.status}).`);
        return;
      }

      setResultado(json as unknown as Resultado);
      setEtapa(2);
    } catch (e) {
      const detalhe = e instanceof Error ? ` (${e.message})` : "";
      setErro(`Não consegui falar com o servidor${detalhe}. Tente de novo.`);
    } finally {
      setProcessando(false);
    }
  }

  const linhas = React.useMemo(() => {
    if (!resultado) return [];
    if (visao === "participam") return resultado.linhas.filter((l) => l.aprovado);
    if (visao === "fora") return resultado.linhas.filter((l) => !l.aprovado);
    if (visao === "pendencias") return resultado.linhas.filter((l) => l.motivo);
    return resultado.linhas;
  }, [resultado, visao]);

  const colunas: Column<Linha>[] = [
    {
      key: "mlb",
      header: "Anúncio",
      mobile: "title",
      sticky: true,
      width: "200px",
      sortValue: (l) => l.mlb,
      cell: (l) => (
        <span className="min-w-0 block">
          <span className="num font-medium text-ink block">{l.mlb}</span>
          <span className="num block text-[11px] text-ink-3 mt-0.5 truncate">
            {l.sku || "sem SKU"}
          </span>
        </span>
      ),
    },
    {
      key: "campanha",
      header: "Campanha",
      mobile: "subtitle",
      width: "230px",
      sortValue: (l) => l.campanha,
      cell: (l) => (
        <span className="min-w-0 block">
          <span className="text-ink-2 truncate block max-w-[200px]">{l.campanha}</span>
          <Badge tone={l.tipoCampanha === "Com Redução" ? "info" : "neutral"}>
            {l.tipoCampanha}
          </Badge>
        </span>
      ),
    },
    {
      key: "precoOriginal",
      header: "Preço original",
      align: "right",
      width: "130px",
      sortValue: (l) => l.precoOriginal ?? 0,
      cell: (l) =>
        l.precoOriginal ? (
          <span className="num text-ink-3">{money(l.precoOriginal)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "precoTabela",
      header: "Preço de tabela",
      align: "right",
      width: "140px",
      sortValue: (l) => l.precoTabela,
      cell: (l) =>
        l.precoTabela > 0 ? (
          <span className="num">{money(l.precoTabela)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "precoPiso",
      header: "Piso (−5%)",
      align: "right",
      width: "130px",
      sortValue: (l) => l.precoPiso,
      cell: (l) =>
        l.precoPiso > 0 ? (
          <span className="num text-ink-2">{money(l.precoPiso)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "precoComExtra",
      header: "Com desconto extra",
      align: "right",
      width: "150px",
      sortValue: (l) => l.precoComExtra ?? 0,
      /*
       * Vazio em campanha COM redução de tarifa, e isso é intencional: ali
       * o preço é do canal, não nosso. Mostrar um número sugeriria uma
       * alavanca que não existe naquele caso.
       */
      cell: (l) =>
        l.precoComExtra != null ? (
          <span className="num text-brand font-medium">{money(l.precoComExtra)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "precoOferta",
      header: "Preço da oferta",
      align: "right",
      mobile: "metric",
      width: "150px",
      sortValue: (l) => l.precoOferta ?? 0,
      cell: (l) => (
        <span className="flex items-center justify-end gap-1.5">
          <span className="num font-semibold text-ink">
            {l.precoOferta ? money(l.precoOferta) : "—"}
          </span>
          {l.recalculado && <Badge tone="info">recalc.</Badge>}
        </span>
      ),
    },
    {
      key: "desconto",
      header: "Desconto",
      align: "right",
      mobile: "metric",
      width: "100px",
      sortValue: (l) => l.desconto ?? 0,
      cell: (l) =>
        l.desconto !== null ? (
          <span className="num text-ink-2">{pct(l.desconto)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "reducaoTarifa",
      header: "Redução de tarifa",
      align: "right",
      width: "140px",
      sortValue: (l) => l.reducaoTarifa,
      cell: (l) =>
        l.reducaoTarifa && l.reducaoTarifa !== "Não" ? (
          <span className="num text-info">{l.reducaoTarifa}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "decisao",
      header: "Decisão",
      mobile: "metric",
      width: "160px",
      sortValue: (l) => l.decisao,
      cell: (l) => (
        <Badge tone={l.aprovado ? "up" : "neutral"}>{l.decisao}</Badge>
      ),
    },
    {
      key: "motivo",
      header: "Motivo",
      width: "260px",
      cell: (l) =>
        l.motivo ? (
          <span className="text-[12px] text-down truncate block max-w-[240px]">
            {l.motivo}
          </span>
        ) : (
          <span className="text-up text-[12px]">OK</span>
        ),
    },
  ];

  /*
   * A Fórmula base deixou de ser obrigatória: quando não vem arquivo, a
   * rota usa a versão guardada no banco. Enviar continua valendo e tem
   * precedência — é assim que a base é atualizada.
   */
  const podeProcessar = planilhas.length > 0 && !processando;

  return (
    <>
      <PageHeader
        title="Processar planilha"
        breadcrumb="Promoções"
        description="Decide participação e recalcula o preço final preservando a margem"
        actions={
          etapa > 1 ? (
            <Button size="sm" onClick={() => setEtapa((e) => (e === 3 ? 2 : 1))}>
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar
            </Button>
          ) : undefined
        }
      />

      <PageBody>
        <Panel className="overflow-hidden">
          <ol className="flex items-stretch divide-x divide-line">
            {ETAPAS.map((e) => {
              const feita = etapa > e.n;
              const atual = etapa === e.n;
              const bloqueada = e.n > 1 && !resultado;
              return (
                <li key={e.n} className="flex-1 min-w-0">
                  <button
                    onClick={() => !bloqueada && setEtapa(e.n as 1 | 2 | 3)}
                    disabled={bloqueada}
                    className={
                      "w-full h-full text-left px-4 py-3 flex items-center gap-3 transition-colors disabled:opacity-45 " +
                      (atual ? "bg-brand-wash" : "hover:bg-panel-2")
                    }
                  >
                    <span
                      className={
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[12px] font-semibold num " +
                        (feita
                          ? "bg-up text-panel"
                          : atual
                            ? "bg-brand text-brand-ink"
                            : "bg-panel-3 text-ink-3")
                      }
                    >
                      {feita ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : e.n}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={
                          "block text-[13px] font-semibold truncate " +
                          (atual ? "text-brand" : "text-ink")
                        }
                      >
                        {e.titulo}
                      </span>
                      <span className="text-[11px] text-ink-3 truncate hidden sm:block">
                        {e.hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Panel>

        {erro && (
          <Panel className="bg-down-wash border-transparent px-4 py-3 flex gap-2.5">
            <CircleAlert className="w-4 h-4 text-down shrink-0 mt-px" strokeWidth={2} />
            <p className="text-[12px] text-ink-2">
              <span className="font-semibold text-ink">Não deu para processar. </span>
              {erro}
            </p>
          </Panel>
        )}

        {/* ── Etapa 1 ─────────────────────────────────────────── */}
        {etapa === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Panel className="overflow-hidden">
              <PanelHeader
                title="Planilhas da Central de Promoções"
                hint="uma por campanha"
              />
              <div className="p-4">
                <SectionTitle
                  title="Exportação do canal"
                  hint="Pode enviar várias de uma vez. Cada arquivo sai processado separadamente."
                />
                <div className="mt-3">
                  <FileDrop
                    accept=".xlsx"
                    files={planilhas}
                    onFiles={(f) => setPlanilhas((p) => [...p, ...f])}
                    onRemove={(i) => setPlanilhas((p) => p.filter((_, x) => x !== i))}
                  />
                </div>
              </div>
            </Panel>

            <Panel className="overflow-hidden">
              <PanelHeader title="Fórmula base" hint="referência de preço de tabela" />
              <div className="p-4">
                <SectionTitle
                  title="Planilha interna"
                  hint="Opcional — sem arquivo, usa a base guardada no banco. Envie só para atualizá-la."
                />
                <div className="mt-3 space-y-3">
                  <FileDrop
                    accept=".xlsx"
                    files={base}
                    onFiles={(f) => setBase(f.slice(0, 1))}
                    onRemove={() => setBase([])}
                  />
                  <Field
                    label="Desconto extra"
                    hint="Aplicado sobre o preço de tabela nas campanhas sem redução de tarifa. Aceita 5 ou 0,05."
                  >
                    <Input
                      inputMode="decimal"
                      value={descontoExtra}
                      onChange={(e) => setDescontoExtra(e.target.value)}
                      className="max-sm:h-11"
                    />
                  </Field>
                </div>
              </div>
            </Panel>

            <div className="lg:col-span-2 flex justify-end">
              <Button
                variant="primary"
                onClick={processar}
                disabled={!podeProcessar}
                className="max-sm:h-11"
              >
                {processando ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Processando…
                  </>
                ) : (
                  <>
                    Processar {planilhas.length || ""} planilha
                    {planilhas.length === 1 ? "" : "s"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Etapa 2 ─────────────────────────────────────────── */}
        {etapa === 2 && resultado && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Itens lidos" value={count(resultado.resumo.lidos)} />
              <StatTile
                label="Participam"
                value={count(resultado.resumo.participam)}
                hint={
                  resultado.resumo.lidos
                    ? pct((resultado.resumo.participam / resultado.resumo.lidos) * 100)
                    : "—"
                }
              />
              <StatTile label="Não participam" value={count(resultado.resumo.fora)} />
              <StatTile
                label="Pendências"
                value={count(resultado.resumo.pendencias)}
                hint="sem base para calcular"
              />
            </div>

            {resultado.gravacao && (
              <Panel className="px-4 py-3 flex gap-2.5">
                <Info className="w-4 h-4 text-ink-3 shrink-0 mt-px" strokeWidth={1.75} />
                <p className="text-[12px] text-ink-2">
                  Guardado:{" "}
                  <span className="num">{count(resultado.gravacao.ofertas)}</span>{" "}
                  propostas do canal em{" "}
                  <span className="num">{count(resultado.gravacao.campanhas)}</span>{" "}
                  campanha{resultado.gravacao.campanhas === 1 ? "" : "s"}.{" "}
                  {/*
                    As propostas ficam TODAS: o canal oferece várias faixas de
                    desconto para o mesmo anúncio, e escolher uma aqui seria
                    decidir qual importa antes de você poder comparar.
                  */}
                  <a
                    href="/promocoes/comparar"
                    className="text-brand underline underline-offset-2"
                  >
                    Comparar as ofertas
                  </a>
                  {resultado.gravacao.semAnuncio > 0 && (
                    <>
                      {" · "}
                      <span className="num">
                        {count(resultado.gravacao.semAnuncio)}
                      </span>{" "}
                      linhas de anúncios fora do catálogo ficaram só no histórico
                    </>
                  )}
                </p>
              </Panel>
            )}

            {resultado.erroGravacao && (
              <Panel className="px-4 py-3 flex gap-2.5">
                <Info className="w-4 h-4 text-down shrink-0 mt-px" strokeWidth={1.75} />
                <p className="text-[12px] text-ink-2">
                  O arquivo saiu, mas nada foi guardado: {resultado.erroGravacao}.
                  Campanhas, Histórico e Comparar ofertas não vão mostrar esta
                  rodada.
                </p>
              </Panel>
            )}

            <Panel className="px-4 py-3 flex gap-2.5">
              <Info className="w-4 h-4 text-ink-3 shrink-0 mt-px" strokeWidth={1.75} />
              <p className="text-[12px] text-ink-2">
                Fórmula base lida com{" "}
                <span className="num">{count(resultado.resumoBase.itens)}</span> anúncios,{" "}
                <span className="num">{count(resultado.resumoBase.precosPorSku)}</span>{" "}
                preços por SKU e{" "}
                <span className="num">{count(resultado.resumoBase.precosPorMlb)}</span>{" "}
                por código de anúncio.{" "}
                <span className="num">{count(resultado.resumo.recalculados)}</span> itens
                tiveram o preço recalculado.
              </p>
            </Panel>

            <Panel className="overflow-hidden">
              <PanelHeader
                title="Conferência do lote"
                hint={resultado.arquivos.map((a) => a.nome).join(" · ")}
                action={
                  <Segmented<Visao>
                    options={VISOES}
                    value={visao}
                    onChange={setVisao}
                    className="hidden sm:flex"
                  />
                }
              />
              <div className="sm:hidden px-3 py-2.5 border-b border-line overflow-x-auto">
                <Segmented<Visao> options={VISOES} value={visao} onChange={setVisao} />
              </div>
              <DataTable
                columns={colunas}
                rows={linhas}
                rowKey={(l) => l.id}
                defaultSort={{ key: "campanha", dir: "asc" }}
                empty={<EmptyState title="Nenhum item nesta visão" />}
              />
            </Panel>

            <PainelRevisao revisao={resultado.revisao} />

            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setEtapa(3)} className="max-sm:h-11">
                Ir para exportação
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </>
        )}

        {/* ── Etapa 3 ─────────────────────────────────────────── */}
        {etapa === 3 && resultado && (
          <Panel className="overflow-hidden">
            <PanelHeader title="Planilha pronta" hint="edição cirúrgica preservada" />
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-r2 bg-up-wash text-up flex items-center justify-center shrink-0">
                  <Check className="w-4.5 h-4.5" strokeWidth={2.5} />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink">
                    {resultado.resumo.lidos} itens processados em{" "}
                    {resultado.arquivos.length}{" "}
                    {resultado.arquivos.length === 1 ? "planilha" : "planilhas"}
                  </p>
                  <p className="text-[12px] text-ink-2 mt-0.5">
                    Só as células de decisão e de preço foram alteradas. Fórmulas,
                    formatação e as demais abas do arquivo do canal ficaram intactas.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border border-line rounded-r2 overflow-hidden mt-5">
                {[
                  { l: "Participam", v: count(resultado.resumo.participam) },
                  { l: "Não participam", v: count(resultado.resumo.fora) },
                  { l: "Recalculados", v: count(resultado.resumo.recalculados) },
                  { l: "Pendências", v: count(resultado.resumo.pendencias) },
                ].map((x) => (
                  <div key={x.l} className="bg-panel px-4 py-3">
                    <p className="label">{x.l}</p>
                    <p className="num text-[17px] font-semibold text-ink mt-1 leading-none">
                      {x.v}
                    </p>
                  </div>
                ))}
              </div>

              <ul className="mt-4 border border-line rounded-r2 divide-y divide-line overflow-hidden">
                {resultado.arquivos.map((a) => (
                  <li
                    key={a.nome}
                    className="px-3 py-2.5 bg-panel-2 flex items-center gap-3"
                  >
                    <FileSpreadsheet
                      className="w-4 h-4 text-ink-3 shrink-0"
                      strokeWidth={1.75}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="num text-[13px] text-ink truncate block">
                        processado_{a.nome}
                      </span>
                      <span className="text-[11px] text-ink-3 truncate block">
                        {a.campanha}
                      </span>
                    </span>
                    <span className="num text-[12px] text-ink-2 shrink-0">
                      {a.linhas} itens
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button
                  variant="primary"
                  className="max-sm:h-11 max-sm:w-full"
                  disabled={baixando}
                  onClick={() => baixarPacote(resultado.id)}
                >
                  {baixando ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Baixando
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Baixar planilhas processadas
                    </>
                  )}
                </Button>
                <Button className="max-sm:h-11">
                  <History className="w-3.5 h-3.5" />
                  Ver no histórico
                </Button>
              </div>

              <p className="text-[11px] text-ink-3 mt-3">
                O pacote inclui uma planilha processada por campanha mais o relatório
                gerencial. Fica disponível por 15 minutos e sai depois de baixado — se precisar de novo, é só processar outra vez.
              </p>

              {resultado.resumo.pendencias > 0 && (
                <div className="panel bg-warn-wash border-transparent px-3 py-2.5 mt-4 flex gap-2.5">
                  <Info className="w-4 h-4 text-warn shrink-0 mt-px" strokeWidth={2} />
                  <p className="text-[12px] text-ink-2">
                    <span className="font-semibold text-ink">
                      {resultado.resumo.pendencias} itens ficaram com pendência.
                    </span>{" "}
                    O motor não chuta preço quando falta base — complete a Fórmula base
                    e processe de novo só esses itens.
                  </p>
                </div>
              )}
            </div>
          </Panel>
        )}
      </PageBody>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Itens para revisar — a leitura por trás das decisões
   ══════════════════════════════════════════════════════════════ */

function PainelRevisao({ revisao }: { revisao: Record<Tag, Linha[]> }) {
  const comItens = CENARIOS.filter((c) => (revisao[c.tag] ?? []).length > 0);
  const [tag, setTag] = React.useState<Tag>(comItens[0]?.tag ?? "quase");

  React.useEffect(() => {
    if (comItens.length && !comItens.some((c) => c.tag === tag)) {
      setTag(comItens[0].tag);
    }
  }, [comItens, tag]);

  if (!comItens.length) return null;

  const cenario = CENARIOS.find((c) => c.tag === tag)!;
  const linhas = revisao[tag] ?? [];

  const colunaAnuncio: Column<Linha> = {
    key: "anuncio",
    header: "Anúncio",
    mobile: "title",
    sticky: true,
    width: "300px",
    sortValue: (l) => l.titulo || l.mlb,
    cell: (l) => (
      <span className="min-w-0 block">
        <span className="font-medium text-ink truncate block max-w-[270px]">
          {l.titulo || l.mlb}
        </span>
        <span className="num block text-[11px] text-ink-3 mt-0.5">
          {l.mlb} · {l.sku || "sem SKU"}
        </span>
      </span>
    ),
  };

  const colunaCampanha: Column<Linha> = {
    key: "campanha",
    header: "Campanha",
    mobile: "subtitle",
    width: "200px",
    sortValue: (l) => l.campanha,
    cell: (l) => (
      <span className="min-w-0 block">
        <span className="text-ink-2 truncate block max-w-[180px]">{l.campanha}</span>
        {l.tipoCampanha === "Com Redução" && (
          <Badge tone="info">tarifa reduzida</Badge>
        )}
      </span>
    ),
  };

  const preco = (
    key: string,
    header: string,
    get: (l: Linha) => number | null,
    destaque = false
  ): Column<Linha> => ({
    key,
    header,
    align: "right",
    mobile: "metric",
    width: "150px",
    sortValue: (l) => get(l) ?? 0,
    cell: (l) => {
      const v = get(l);
      return v ? (
        <span className={"num " + (destaque ? "font-semibold text-ink" : "text-ink-2")}>
          {money(v)}
        </span>
      ) : (
        <span className="text-ink-3">—</span>
      );
    },
  });

  /** Coluna de distância: sobra em verde, falta em vermelho. */
  const colunaFolga = (header: string): Column<Linha> => ({
    key: "folga",
    header,
    align: "right",
    mobile: "metric",
    width: "150px",
    sortValue: (l) => l.folga ?? 0,
    cell: (l) => {
      if (l.folga === null) return <span className="text-ink-3">—</span>;
      const sobra = l.folga > 0;
      const base = l.precoTabela || 1;
      return (
        <span className="flex items-center justify-end gap-1.5">
          <span className={"num font-semibold " + (sobra ? "text-up" : "text-down")}>
            {sobra ? "+" : "−"}
            {money(Math.abs(l.folga))}
          </span>
          <span className="num text-[11px] text-ink-3 hidden lg:inline">
            {pct((Math.abs(l.folga) / base) * 100)}
          </span>
        </span>
      );
    },
  });

  const colunas: Column<Linha>[] =
    tag === "tabela_acima_original"
      ? [
          colunaAnuncio,
          colunaCampanha,
          preco("publicado", "Publicado hoje", (l) => l.precoOriginal),
          preco("tabela", "Preço de tabela", (l) => l.precoTabela, true),
          {
            key: "gap",
            header: "Quanto falta subir",
            align: "right",
            mobile: "metric",
            width: "170px",
            sortValue: (l) => l.precoTabela - (l.precoOriginal ?? 0),
            cell: (l) => {
              const d = l.precoTabela - (l.precoOriginal ?? 0);
              const p = l.precoOriginal ? (d / l.precoOriginal) * 100 : 0;
              return (
                <span className="flex items-center justify-end gap-1.5">
                  <span className="num font-semibold text-down">{money(d)}</span>
                  <Badge tone="down">
                    <span className="num">+{pct(p)}</span>
                  </Badge>
                </span>
              );
            },
          },
        ]
      : tag === "folga"
        ? [
            colunaAnuncio,
            colunaCampanha,
            preco("proposto", "Preço aplicado", (l) => l.precoOferta, true),
            preco("tabela", "Piso da tabela", (l) => l.precoTabela),
            colunaFolga("Sobra até o piso"),
          ]
        : [
            colunaAnuncio,
            colunaCampanha,
            preco("proposto", "Proposto pelo canal", (l) => l.precoPropostoML),
            preco("tabela", "Preço de tabela", (l) => l.precoTabela, true),
            colunaFolga(tag === "quase" ? "Quanto faltou" : "Diferença"),
          ];

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Itens para revisar"
        hint="o que as decisões estão dizendo sobre os seus preços"
      />

      <div className="flex items-center gap-2 px-3 py-2.5 overflow-x-auto border-b border-line">
        {comItens.map((c) => {
          const n = (revisao[c.tag] ?? []).length;
          const ativa = tag === c.tag;
          return (
            <button
              key={c.tag}
              onClick={() => setTag(c.tag)}
              className={
                "flex items-center gap-2 h-8 px-3 rounded-r1 border text-[12px] font-medium whitespace-nowrap transition-colors " +
                (ativa
                  ? "border-brand bg-brand-wash text-brand"
                  : "border-line text-ink-2 hover:bg-panel-3 hover:text-ink")
              }
            >
              {c.rotulo}
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

      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-x-6 gap-y-1.5 border-b border-line">
        <p className="text-[12px] text-ink-2 flex-1 min-w-0">
          <span className="font-semibold text-ink">O que é: </span>
          {cenario.regra}
        </p>
        <p className="text-[12px] text-ink-2 flex-1 min-w-0">
          <span className="font-semibold text-ink">O que fazer: </span>
          {cenario.acao}
        </p>
      </div>

      <DataTable
        columns={colunas}
        rows={linhas}
        rowKey={(l) => l.id}
        empty={<EmptyState title="Nenhum item neste cenário" />}
      />
    </Panel>
  );
}
