"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BarraFiltros, Filtro } from "@/components/layout/barra-filtros";
import { SemFonte } from "@/components/ui/sem-fonte";
import { atualizarFiltrosTrafego, urlTrafego } from "@/lib/trafego-pago-filtros";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID } from "@/components/ui/chart";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge, Button } from "@/components/ui/primitives";
import { Tabs, Input } from "@/components/ui/controls";
import { Disclosure } from "@/components/ui/disclosure";
import { cn } from "@/lib/utils";
import { money, moneyShort, pct, count } from "@/lib/format";
import { AlertCircle, TrendingDown } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { DadosTrafegoPago, LinhaAnuncioAds, LinhaCampanha } from "@/lib/dados/trafego-pago";
import { ROTULO_ACAO, type AcaoAds, type LinhaOportunidade } from "@/lib/dados/trafego-oportunidades";
import type { SituacaoDisputa } from "@/lib/dados/disputa-catalogo";
import { TagAnuncio } from "@/components/ui/tag-anuncio";

/*
 * A etiqueta de catálogo.
 *
 * Um C curto, com a situação por extenso no title: a coluna do anúncio
 * já carrega SKU, código e nome, e escrever "Ganhando catálogo" ali
 * empurraria o nome do produto para fora.
 *
 * Existe porque muda a decisão. "Gastou e não vendeu" num anúncio de
 * catálogo pode ser venda que saiu pelo anúncio vencedor, e desligar a
 * mídia seria desligar a de um anúncio que vende — só não é ele que
 * aparece no pedido.
 */
const TOM_CATALOGO: Record<SituacaoDisputa, "up" | "down" | "warn" | "neutral" | "brand"> = {
  ganhando: "up",
  dividindo: "brand",
  competindo: "down",
  listado: "warn",
  fora: "neutral",
};
const TEXTO_CATALOGO: Record<SituacaoDisputa, string> = {
  ganhando: "catálogo: ganhando",
  dividindo: "catálogo: dividindo o 1º lugar",
  competindo: "catálogo: perdendo — a venda pode sair pelo anúncio vencedor",
  listado: "catálogo: só listado, fora da disputa",
  fora: "catálogo: fora",
};

/* Aceita string porque o motor de oportunidades é puro e não importa o
   tipo daqui — ele guarda a situação como texto. Valor desconhecido não
   vira etiqueta: inventar um tom para ele mentiria sobre a disputa. */
function EtiquetaCatalogo({ situacao }: { situacao: string | null | undefined }) {
  if (!situacao || !(situacao in TOM_CATALOGO)) return null;
  const s = situacao as SituacaoDisputa;
  return (
    <span title={TEXTO_CATALOGO[s]}>
      <Badge tone={TOM_CATALOGO[s]}>C</Badge>
    </span>
  );
}

/**
 * Tráfego pago.
 *
 * ── O que a tela recusa a mostrar sozinho ──
 *
 * ACOS. O canal já publica esse número, e ele engana isolado: 14% parece
 * ótimo até se descobrir que a margem daquele anúncio é 13,8%. Aqui o
 * ACOS sempre aparece ao lado da margem do mesmo anúncio, e a coluna que
 * decide é a última — quanto sobra depois de pagar a mídia.
 *
 * ── Duas receitas, e por que as duas aparecem ──
 *
 * A ATRIBUÍDA é o que o canal credita ao ads. A REAL é o que o anúncio
 * faturou. Nos dados medidos a atribuída é 55,9% da real, e 47,5% dela é
 * indireta — clicou no anúncio e comprou outra coisa.
 *
 * Mostrar só a atribuída faria o ROAS parecer mérito da mídia; mostrar só
 * a real esconderia o número que o canal usa para cobrar. As duas juntas
 * deixam a diferença visível, que é onde mora a dúvida.
 */

type Aba = "anuncios" | "oportunidades" | "campanhas" | "desperdicio";

/*
 * O tom segue o DINHEIRO, não o alarme: vermelho onde está saindo
 * (desligar, mídia acima da margem), verde onde pode entrar (mais verba,
 * entrar no ads), amarelo onde está sobrando sem crédito.
 */
const TOM_ACAO: Record<AcaoAds, "up" | "down" | "warn" | "neutral"> = {
  desligar: "down",
  rever_preco: "down",
  midia_sobrou: "warn",
  escalar: "up",
  entrar: "up",
  manter: "neutral",
};

const SITUACAO: Record<
  LinhaAnuncioAds["situacao"],
  { rotulo: string; tom: "up" | "down" | "warn" | "neutral" } | null
> = {
  ok: null,
  prejuizo: { rotulo: "mídia > margem", tom: "down" },
  sem_retorno: { rotulo: "sem venda nenhuma", tom: "down" },
  vendeu_sem_ads: { rotulo: "venda sem atribuição", tom: "warn" },
};

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default function TrafegoPagoCliente({ dados }: { dados: DadosTrafegoPago }) {
  const [aba, setAba] = React.useState<Aba>("anuncios");
  const [busca, setBusca] = React.useState("");
  const [situacao, setSituacao] = React.useState("");
  const [acao, setAcao] = React.useState<string>("");
  const { totais, periodos, campanhas, linhas, conferencia, oportunidades, referencias } = dados;
  const router = useRouter();

  /* Canal e janela andam juntos na URL: trocar de conta pode mudar quais
     relatórios existem, e perder a janela escolhida é melhor que mostrar
     uma que aquela conta não tem. */
  /* O total da série é da JANELA DO CALENDÁRIO, e não da janela de
     relatório — por isso não sai de `totais`, que é do relatório. */
  const serieTotais = React.useMemo(
    () =>
      dados.serie.reduce(
        (a, d) => ({ investimento: a.investimento + d.investimento, receita: a.receita + d.receita }),
        { investimento: 0, receita: 0 }
      ),
    [dados.serie]
  );

  const [pendente, iniciarNavegacao] = React.useTransition();
  const desejados = React.useRef({ canais: dados.recorte, janela: dados.janela, ...dados.periodo });
  const [filtros, atualizarFiltros] = React.useOptimistic(
    { canais: dados.recorte, janela: dados.janela, ...dados.periodo },
    atualizarFiltrosTrafego
  );
  React.useEffect(() => {
    if (!pendente) desejados.current = { canais: dados.recorte, janela: dados.janela, ...dados.periodo };
  }, [pendente, dados.recorte, dados.janela, dados.periodo]);
  const navegar = (mudar: Parameters<typeof urlTrafego>[1]) => {
    const anterior = desejados.current;
    const proximo = atualizarFiltrosTrafego(anterior, mudar);
    if (urlTrafego(anterior, {}) === urlTrafego(proximo, {})) return;
    desejados.current = proximo;
    iniciarNavegacao(() => {
      atualizarFiltros(mudar);
      router.push(urlTrafego(proximo, {}), { scroll: false });
    });
  };

  const visiveis = React.useMemo(() => {
    const t = busca.trim().toLowerCase();
    return linhas.filter((l) => !situacao || l.situacao === situacao).filter(
      (l) =>
        l.mlb.toLowerCase().includes(t) ||
        l.sku.toLowerCase().includes(t) ||
        l.titulo.toLowerCase().includes(t) ||
        l.campanhas.some((c) => c.toLowerCase().includes(t))
    );
  }, [linhas, busca, situacao]);

  const semRetorno = linhas.filter((l) => l.situacao === "sem_retorno");
  const semAds = linhas.filter((l) => l.situacao === "vendeu_sem_ads");
  const prejuizo = linhas.filter((l) => l.situacao === "prejuizo");

  /*
   * SKU, código e nome, os três.
   *
   * A página de ads do Mercado Livre identifica a linha pelo MLB, e o
   * resto do sistema pelo SKU: sem os dois lado a lado não há como
   * conferir uma tela contra a outra. O nome do produto evita ter de
   * decorar que GP745 é a tigela de inox.
   */
  const celulaAnuncio = (l: {
    sku: string;
    mlb: string;
    titulo: string;
    conta: string;
    tipo: string;
    catalogo?: string | null;
    status?: string | null;
  }) => (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="num text-[12.5px] font-medium text-ink">{l.sku || "sem SKU"}</span>
        <span className="num text-[11.5px] text-ink-3">{l.mlb}</span>
        {l.tipo === "premium" && <Badge tone="neutral">premium</Badge>}
        <EtiquetaCatalogo situacao={l.catalogo ?? null} />
        {/* Pausado no meio de uma lista que manda desligar ou escalar: a
            ação já não cabe, e sem a etiqueta ele parece igual aos outros. */}
        <TagAnuncio status={l.status} />
      </div>
      <p className="text-[12px] text-ink-2 break-words max-w-[280px]">
        {l.titulo || "—"}
      </p>
      <p className="text-[11px] text-ink-3">{l.conta}</p>
    </div>
  );

  const th = "px-2.5 py-2 text-[12px] font-semibold text-ink-3 whitespace-nowrap";
  const td = "px-2.5 py-2 border-b border-line";

  const colunasAnuncio: Column<LinhaAnuncioAds>[] = [
    {
      key: "anuncio",
      header: "Anúncio",
      sticky: true,
      mobile: "title",
      sortValue: (l) => l.sku || l.mlb,
      cell: (l) => {
        const st = SITUACAO[l.situacao];
        return (
          <div className="min-w-0">
            {celulaAnuncio(l)}
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {st && <Badge tone={st.tom}>{st.rotulo}</Badge>}
              <span className="text-[11px] text-ink-3 truncate max-w-[220px]">{l.campanhas.join(" · ")}</span>
            </div>
          </div>
        );
      },
    },
    { key: "investimento", header: "Investido", align: "right", mobile: "metric", sortValue: (l) => l.investimento, cell: (l) => <span className="num text-ink">{money(l.investimento)}</span> },
    { key: "cliques", header: "Cliques", align: "right", sortValue: (l) => l.cliques, cell: (l) => <span className="num">{count(l.cliques)}</span> },
    { key: "impressoes", header: "Impressões", align: "right", sortValue: (l) => l.impressoes, cell: (l) => <span className="num">{count(l.impressoes)}</span> },
    { key: "cpc", header: "CPC", align: "right", sortValue: (l) => l.cpc ?? -1, cell: (l) => <span className="num">{l.cpc != null ? money(l.cpc) : "—"}</span> },
    { key: "receitaAtribuida", header: "Receita ads", align: "right", sortValue: (l) => l.receitaAtribuida, cell: (l) => <span className="num">{l.receitaAtribuida > 0 ? moneyShort(l.receitaAtribuida) : "—"}</span> },
    {
      key: "acos",
      header: "ACOS",
      align: "right",
      sortValue: (l) => l.acos ?? -1,
      cell: (l) =>
        l.acos == null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className={cn("num font-medium", l.margemPct != null && l.acos > l.margemPct ? "text-down" : "text-ink-2")}>
            {pct(l.acos, 1)}
          </span>
        ),
    },
    { key: "roas", header: "ROAS", align: "right", sortValue: (l) => l.roas ?? -1, cell: (l) => <span className="num">{l.roas != null ? l.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</span> },
    { key: "receitaReal", header: "Faturou", align: "right", sortValue: (l) => l.receitaReal, cell: (l) => <span className="num">{l.receitaReal > 0 ? moneyShort(l.receitaReal) : "—"}</span> },
    {
      key: "margem",
      header: "Margem",
      align: "right",
      sortValue: (l) => l.margem ?? -Infinity,
      cell: (l) =>
        l.margem == null ? (
          <span className="text-[12px] text-ink-3">sem custo</span>
        ) : (
          <div className="flex flex-col items-end leading-tight">
            <span className="num text-ink">{moneyShort(l.margem)}</span>
            <span className="num text-[12px] text-ink-3">{pct(l.margemPct ?? 0, 1)}</span>
          </div>
        ),
    },
    {
      key: "sobraAposMidia",
      header: "Sobra",
      align: "right",
      mobile: "metric",
      sortValue: (l) => l.sobraAposMidia ?? -Infinity,
      cell: (l) =>
        l.sobraAposMidia == null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className={cn("num font-semibold", l.sobraAposMidia >= 0 ? "text-up" : "text-down")}>{moneyShort(l.sobraAposMidia)}</span>
        ),
    },
  ];

  const colunasCampanha: Column<LinhaCampanha>[] = [
    { key: "campanha", header: "Campanha", sticky: true, mobile: "title", sortValue: (c) => c.campanha, cell: (c) => (<div className="min-w-0"><p className="text-[12.5px] text-ink truncate max-w-[280px]" title={c.campanha}>{c.campanha}</p><p className="text-[11px] text-ink-3">{c.conta}</p></div>) },
    { key: "anuncios", header: "Anúncios", align: "right", sortValue: (c) => c.anuncios, cell: (c) => <span className="num">{count(c.anuncios)}</span> },
    { key: "investimento", header: "Investido", align: "right", mobile: "metric", sortValue: (c) => c.investimento, cell: (c) => <span className="num text-ink">{money(c.investimento)}</span> },
    { key: "cliques", header: "Cliques", align: "right", sortValue: (c) => c.cliques, cell: (c) => <span className="num">{count(c.cliques)}</span> },
    { key: "receitaAtribuida", header: "Receita ads", align: "right", sortValue: (c) => c.receitaAtribuida, cell: (c) => <span className="num">{c.receitaAtribuida > 0 ? moneyShort(c.receitaAtribuida) : "—"}</span> },
    { key: "acos", header: "ACOS", align: "right", sortValue: (c) => c.acos ?? -1, cell: (c) => <span className="num">{c.acos != null ? pct(c.acos, 1) : "—"}</span> },
    { key: "roas", header: "ROAS", align: "right", sortValue: (c) => c.roas ?? -1, cell: (c) => <span className="num">{c.roas != null ? c.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</span> },
    { key: "margem", header: "Margem", align: "right", sortValue: (c) => c.margem ?? -Infinity, cell: (c) => <span className="num">{c.margem != null ? moneyShort(c.margem) : "parcial"}</span> },
    {
      key: "sobraAposMidia",
      header: "Sobra",
      align: "right",
      mobile: "metric",
      sortValue: (c) => c.sobraAposMidia ?? -Infinity,
      cell: (c) =>
        c.sobraAposMidia == null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className={cn("num font-semibold", c.sobraAposMidia >= 0 ? "text-up" : "text-down")}>{moneyShort(c.sobraAposMidia)}</span>
        ),
    },
  ];

  const colunasOportunidade: Column<LinhaOportunidade>[] = [
    {
      key: "acao",
      header: "O que fazer",
      sticky: true,
      mobile: "title",
      sortValue: (l) => ROTULO_ACAO[l.acao],
      cell: (l) => (
        <div className="min-w-0">
          <Badge tone={TOM_ACAO[l.acao]}>{ROTULO_ACAO[l.acao]}</Badge>
          {l.motivo && <p className="text-[11.5px] text-ink-3 mt-1 max-w-[280px]">{l.motivo}</p>}
        </div>
      ),
    },
    { key: "anuncio", header: "Anúncio", sortValue: (l) => l.sku || l.mlb, cell: (l) => celulaAnuncio(l) },
    {
      key: "catalogo",
      header: "Catálogo",
      width: "110px",
      sortValue: (l) => l.catalogo ?? "",
      cell: (l) =>
        l.catalogo ? (
          <span className="text-[12.5px] text-ink-2">{(TEXTO_CATALOGO[l.catalogo as SituacaoDisputa] ?? l.catalogo).replace("catálogo: ", "").split(" —")[0]}</span>
        ) : (
          <span className="text-[12px] text-ink-3">—</span>
        ),
    },
    { key: "visitas", header: "Visitas", align: "right", sortValue: (l) => l.visitas ?? -1, cell: (l) => <span className="num">{l.visitas != null ? count(l.visitas) : "—"}</span> },
    {
      key: "conversao",
      header: "Conversão",
      align: "right",
      mobile: "metric",
      sortValue: (l) => l.conversao ?? -1,
      cell: (l) =>
        l.conversao == null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className={cn("num", referencias?.conversaoMediana != null && l.conversao >= referencias.conversaoMediana ? "text-up font-medium" : "text-ink-2")}>
            {pct(l.conversao, 1)}
          </span>
        ),
    },
    { key: "unidades", header: "Unidades", align: "right", sortValue: (l) => l.unidades, cell: (l) => <span className="num">{count(l.unidades)}</span> },
    { key: "receitaReal", header: "Faturou", align: "right", mobile: "metric", sortValue: (l) => l.receitaReal, cell: (l) => <span className="num text-ink">{l.receitaReal > 0 ? moneyShort(l.receitaReal) : "—"}</span> },
    { key: "margemPct", header: "Margem", align: "right", sortValue: (l) => l.margemPct ?? -Infinity, cell: (l) => (l.margemPct == null ? <span className="text-[12px] text-ink-3">sem custo</span> : <span className="num">{pct(l.margemPct, 1)}</span>) },
    { key: "investimento", header: "Investido", align: "right", sortValue: (l) => l.investimento, cell: (l) => <span className="num">{l.investimento > 0 ? money(l.investimento) : "—"}</span> },
    { key: "acos", header: "ACOS", align: "right", sortValue: (l) => l.acos ?? -1, cell: (l) => <span className={cn("num", l.acos != null && l.margemPct != null && l.acos > l.margemPct && "text-down")}>{l.acos != null ? pct(l.acos, 1) : "—"}</span> },
    {
      key: "estoque",
      header: "Estoque",
      align: "right",
      sortValue: (l) => l.estoque ?? -1,
      cell: (l) =>
        l.estoque == null ? (
          <span className="text-[12px] text-ink-3">não lido</span>
        ) : (
          <span className={cn("num", l.estoque === 0 && "text-down font-medium")}>{count(l.estoque)}</span>
        ),
    },
  ];

  const oportunidadesVisiveis = React.useMemo(() => {
    const t = busca.trim().toLowerCase();
    return oportunidades
      .filter((l) => !acao || l.acao === acao)
      .filter(
        (l) =>
          !t ||
          l.mlb.toLowerCase().includes(t) ||
          l.sku.toLowerCase().includes(t) ||
          l.titulo.toLowerCase().includes(t)
      );
  }, [oportunidades, acao, busca]);

  const [exportando, setExportando] = React.useState(false);
  const [erroExport, setErroExport] = React.useState<string | null>(null);

  /*
   * Exporta o que está FILTRADO, e nada além.
   *
   * O arquivo tem de bater com a tela: filtrar "entrar no ads" e receber
   * os 700 anúncios de volta desfaz o filtro, e quem confere o total
   * descobre a diferença depois de ter decidido verba em cima dela. O
   * botão diz quantas linhas vão.
   *
   * O gerador entra por import dinâmico: o ExcelJS é grande e só serve no
   * clique, então não pesa no carregamento da tela.
   */
  async function exportar() {
    setExportando(true);
    setErroExport(null);
    try {
      const { planilhaOportunidades } = await import("@/lib/planilhas/trafego-oportunidades");
      const filtro = [acao ? ROTULO_ACAO[acao as AcaoAds] : null, busca.trim() || null]
        .filter(Boolean)
        .join(" · ");
      const wb = planilhaOportunidades(oportunidadesVisiveis, referencias, {
        janela: dados.janela,
        recorte: dados.contasDoRelatorio?.join(" + ") || "todas as contas do relatório",
        filtro,
      });
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([new Uint8Array(buffer)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `o-que-fazer-${dados.janela.replace("|", "-a-")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setErroExport("Não consegui gerar a planilha. Tente de novo.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Tráfego pago"
        breadcrumb="Anúncios"
        description="Investimento, vendas atribuídas e margem por anúncio."
        filters={
          <BarraFiltros>
            <Filtro rotulo="Canais" composto>
              <select aria-label="Canal ou conta" value={filtros.canais} onChange={(e) => navegar({ canais: e.target.value })} className="h-10 w-[260px] max-w-full rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink">
                {dados.opcoes.map((g, i) => g.rotulo
                  ? <optgroup key={g.rotulo} label={g.rotulo}>{g.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</optgroup>
                  : g.opcoes.map((o) => <option key={`${i}-${o.valor}`} value={o.valor}>{o.rotulo}</option>))}
              </select>
            </Filtro>
            <Filtro rotulo="De">
              <input
                type="date"
                aria-label="Data inicial do gráfico"
                max={filtros.ate}
                value={filtros.de}
                onChange={(e) => e.target.value && navegar({ de: e.target.value })}
                onBlur={(e) => e.target.value && navegar({ de: e.target.value })}
                className="h-10 rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink"
              />
            </Filtro>
            <Filtro rotulo="Até">
              <input
                type="date"
                aria-label="Data final do gráfico"
                min={filtros.de}
                value={filtros.ate}
                onChange={(e) => e.target.value && navegar({ ate: e.target.value })}
                onBlur={(e) => e.target.value && navegar({ ate: e.target.value })}
                className="h-10 rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink"
              />
            </Filtro>
          </BarraFiltros>
        }
      />

      <PageBody>
        {pendente && <p role="status" className="text-[12px] text-ink-3">Atualizando seleção…</p>}
        {/* ── O gasto dia a dia, no período do calendário ──
            Esta é a única parte que aceita qualquer intervalo: a rotina
            noturna pergunta ao canal o número de CADA dia. A tabela por
            anúncio, mais abaixo, segue presa aos relatórios. */}
        {dados.serie.length > 0 ? (
          <Panel className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="label">
                Dia a dia · {dataBr(dados.periodo.de)} a {dataBr(dados.periodo.ate)}
              </p>
              <p className="num text-[12px] text-ink-2">
                {money(serieTotais.investimento)} de mídia ·{" "}
                {serieTotais.receita > 0
                  ? `${pct((serieTotais.investimento * 100) / serieTotais.receita, 1)} do faturamento`
                  : "sem faturamento no período"}
              </p>
            </div>
            <div className="mt-3 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dados.serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="data" {...AXIS} tickFormatter={dataBr} minTickGap={28} />
                  <YAxis {...AXIS} width="auto" tickFormatter={(v) => moneyShort(Number(v))} />
                  <Tooltip
                    cursor={{ fill: "var(--panel-3)" }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof dados.serie)[number];
                      const tacos = d.receita > 0 ? (d.investimento * 100) / d.receita : null;
                      return (
                        <div className="panel px-2.5 py-2 text-[12px]" style={{ boxShadow: "var(--sh-3)" }}>
                          <p className="mb-1 font-semibold text-ink-2">{dataBr(String(label))}</p>
                          <p className="num">mídia {d.midiaInformada === false ? "sem registro" : money(d.investimento)}</p>
                          <p className="num">faturamento {money(d.receita)}</p>
                          {tacos != null && d.midiaInformada !== false && <p className="num">TACoS {pct(tacos, 1)}</p>}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="investimento" fill="var(--s1)" fillOpacity={0.6} isAnimationActive={false} />
                  <Line
                    dataKey="receita"
                    stroke="var(--s3)"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-ink-3">
              Barras: mídia · linha: faturamento. Datas deste gráfico independem do relatório abaixo.
            </p>
          </Panel>
        ) : <Panel className="p-4 text-[13px] text-ink-2">Sem dados diários neste intervalo. Escolha outro período ou atualize as fontes da empresa.</Panel>}

        {dados.vazio ? <SemFonte titulo="Sem relatório de publicidade neste canal" origem="Escolha outro canal acima. No Mercado Livre, use Atualizar agora para buscar a publicidade ou importe um relatório. O gráfico diário continua disponível quando houver dados." /> : <>

        {/* ── Qual relatório está sendo lido ──
            Um por vez, e não a soma: os relatórios do canal se sobrepõem
            (agosto aparece em sete janelas), e somá-los contava o mesmo
            gasto várias vezes. */}
        <Panel className="p-4">
          <p className="label mb-2">Relatório do canal</p>
          <select aria-label="Relatório por anúncio" value={filtros.janela} onChange={(e) => navegar({ janela: e.target.value })} className="min-h-11 w-full max-w-xl rounded-r1 border border-line bg-panel px-3 text-sm text-ink">{periodos.map((p) => <option key={`${p.inicio}|${p.fim}`} value={`${p.inicio}|${p.fim}`}>{p.rotulo} · {money(p.investimento)}</option>)}</select>
          <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
            {dados.contasDoRelatorio?.join(" · ") || "Conta selecionada"} · Indicadores e tabelas usam este intervalo.
          </p>
          {dados.contaNaoIdentificada && <p className="mt-2 text-xs text-warn">Há anúncios sem conta identificada. TACoS indisponível até conferir o vínculo.</p>}
        </Panel>

        {/* ── Os cinco números da janela escolhida ── */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Numero rotulo="Investido" valor={money(totais.investimento)} ajuda={`${count(linhas.length)} anúncios`} />
          <Numero
            rotulo="TACoS"
            valor={totais.tacos != null ? pct(totais.tacos, 1) : "—"}
            ajuda="mídia ÷ faturamento total"
            tom={totais.tacos != null && totais.tacos > 15 ? "down" : undefined}
          />
          <Numero
            rotulo="ACoS"
            valor={
              totais.receitaAtribuida > 0
                ? pct((totais.investimento * 100) / totais.receitaAtribuida, 1)
                : "—"
            }
            ajuda="mídia ÷ receita atribuída"
          />
          <Numero
            rotulo="ROAS"
            valor={
              totais.investimento > 0 && totais.receitaAtribuida > 0
                ? (totais.receitaAtribuida / totais.investimento).toFixed(2)
                : "—"
            }
            ajuda="receita atribuída ÷ mídia"
          />
          <Numero
            rotulo="Faturamento da conta"
            valor={money(totais.receitaTotalConta)}
            ajuda="base do TACoS"
          />
        </div>

        <Disclosure title="Conferir os valores da conta">
          <p>TACoS: {money(totais.investimento)} ÷ {money(totais.receitaTotalConta)}. Faturamento de pedidos válidos das contas listadas no relatório, incluindo vendas sem mídia.</p>
          <p className="mt-2">ACoS: {money(totais.investimento)} ÷ {money(totais.receitaAtribuida)} atribuídos pelo canal. ROAS usa a divisão inversa.</p>
        </Disclosure>

        <Disclosure title="ACoS, TACoS e ROAS — qual decide o quê">
          <p>
            <strong>ACoS</strong> é mídia ÷ receita que o canal <em>atribui</em> à mídia.
            Compare com a margem de contribuição e confira a cobertura dos custos.
          </p>
          <p className="mt-2">
            <strong>ROAS</strong> é o inverso do ACoS (ACoS de 10% = ROAS 10). É a métrica que o
            painel do canal passou a destacar. Não traz informação nova.
          </p>
          <p className="mt-2">
            <strong>TACoS</strong> é mídia ÷ faturamento <em>total</em> da conta, orgânico incluído.
            Se subir, a mídia consome uma parcela maior das vendas. Isso, sozinho, não comprova canibalização nem decide se vale aumentar a verba.
          </p>
          <p className="mt-2">
            O que esta tela <strong>não</strong> tem: impressões perdidas por orçamento e por
            classificação, que diriam se o caminho é subir verba ou melhorar o anúncio. O relatório
            que o canal exporta não traz essas colunas.
          </p>
        </Disclosure>

        {/* ── O número que decide ── */}
        <Panel className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <p className="text-[12px] text-ink-3 mb-1">
                Margem depois de pagar a mídia
              </p>
              {totais.sobraAposMidia != null ? (
                <p
                  className={`num text-[24px] font-semibold leading-none ${
                    totais.sobraAposMidia >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {money(totais.sobraAposMidia)}
                </p>
              ) : (
                <p className="text-[13px] text-ink-3">
                  precisa do custo dos SKUs
                </p>
              )}
              <p className="text-[12px] text-ink-3 mt-1.5 leading-relaxed">
                Margem de contribuição {totais.margem != null ? money(totais.margem) : "—"} menos{" "}
                {money(totais.investimento)} de mídia. Cobre{" "}
                <span className="num">{pct(totais.coberturaMargem, 0)}</span> dos
                anúncios com mídia.
              </p>
            </div>

            <div>
              <p className="text-[12px] text-ink-3 mb-1">
                Quanto o canal credita à mídia
              </p>
              <p className="num text-[24px] font-semibold text-ink leading-none">
                {totais.atribuicao != null ? pct(totais.atribuicao, 1) : "—"}
              </p>
              <p className="text-[12px] text-ink-3 mt-1.5 leading-relaxed">
                {moneyShort(totais.receitaAtribuida)} atribuídos sobre{" "}
                {moneyShort(totais.receitaReal)} nos pedidos desses anúncios. São medidas diferentes.
              </p>
            </div>

            <div>
              <p className="text-[12px] text-ink-3 mb-1">Receita indireta</p>
              <p className="num text-[24px] font-semibold text-ink leading-none">
                {totais.receitaAtribuida > 0
                  ? pct((totais.receitaIndireta * 100) / totais.receitaAtribuida, 1)
                  : "—"}
              </p>
              {/* A indireta é o que mais distorce a leitura do ROAS por
                  anúncio: o clique foi num, a compra foi noutro. */}
              <p className="text-[12px] text-ink-3 mt-1.5 leading-relaxed">
                A pessoa clicou no anúncio e comprou outra coisa. Entra no ROAS
                publicado, mas não é venda daquele anúncio.
              </p>
            </div>
          </div>
        </Panel>

        {conferencia && (conferencia.diario == null || Math.abs(conferencia.relatorio - conferencia.diario) > 1 || conferencia.registrosRegistrados < conferencia.registrosEsperados) && (
          <Panel className="flex items-start gap-2.5 border-warn/30 px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div className="min-w-0 text-[12px] text-ink-2">
              <p className="mb-1 text-[13px] font-medium text-ink">Conferência do investimento · {dataBr(conferencia.inicio)} a {dataBr(conferencia.fim)}</p>
              <p>Relatório: {money(conferencia.relatorio)} · Série diária: {conferencia.diario == null ? "sem registro" : money(conferencia.diario)}</p>
              <p className="mt-1 text-ink-3">Mesma seleção de canal e conta. A série pode conter valores importados ou recebidos pela API.
                {conferencia.diasRegistrados < conferencia.diasEsperados && <> Há registros de mídia em {conferencia.diasRegistrados} de {conferencia.diasEsperados} dias; a comparação pode estar incompleta.</>}
                {conferencia.registrosRegistrados < conferencia.registrosEsperados && <> Cobertura: {conferencia.registrosRegistrados}/{conferencia.registrosEsperados} combinações de conta e dia.</>}
              </p>
            </div>
          </Panel>
        )}

        <Panel className="overflow-hidden">
          <Tabs
            tabs={[
              { value: "anuncios" as const, label: "Por anúncio", count: linhas.length },
              {
                value: "oportunidades" as const,
                label: "O que fazer",
                count:
                  (referencias?.contagem.escalar ?? 0) +
                  (referencias?.contagem.entrar ?? 0) +
                  (referencias?.contagem.rever_preco ?? 0),
              },
              { value: "campanhas" as const, label: "Por campanha", count: campanhas.length },
              {
                value: "desperdicio" as const,
                label: "Gasto sem retorno",
                count: semRetorno.length + semAds.length + prejuizo.length,
              },
            ]}
            value={aba}
            onChange={setAba}
          />

          {aba === "anuncios" && (
            <>
              <div className="flex flex-wrap gap-2 p-3 border-b border-line">
                <Input
                  placeholder="Buscar SKU, código, título ou campanha"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="max-w-sm"
                />
                <select
                  aria-label="Situação dos anúncios"
                  value={situacao}
                  onChange={(e) => setSituacao(e.target.value)}
                  className="min-h-10 max-w-full rounded-r1 border border-line bg-panel px-2 text-sm"
                >
                  <option value="">Todas as situações</option>
                  <option value="sem_retorno">Gasto sem venda</option>
                  <option value="vendeu_sem_ads">Vendas sem atribuição</option>
                  <option value="prejuizo">Mídia maior que a margem</option>
                </select>
              </div>
              {/* Quem ordena é o cabeçalho da tabela: qualquer coluna, nos
                  dois sentidos. O seletor de ordem que existia aqui dava
                  quatro opções fixas e escondia as outras seis. */}
              <DataTable
                columns={colunasAnuncio}
                rows={visiveis}
                rowKey={(l) => l.mlb}
                defaultSort={{ key: "investimento", dir: "desc" }}
                empty={<p className="px-4 py-6 text-[13px] text-ink-3">Nenhum anúncio com esse filtro.</p>}
              />
            </>
          )}

          {aba === "oportunidades" && (
            <>
              {/*
               * A tabela que o relatório do canal não tem.
               *
               * Ela inclui anúncio SEM mídia, que é onde está a pergunta
               * que o painel de ads não responde: o que já vende bem no
               * orgânico e merece verba. Os cortes vêm da mediana do
               * próprio recorte, e ficam escritos aqui em cima para
               * ninguém ter de adivinhar de onde saiu a classificação.
               */}
              <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
                <Input
                  placeholder="Buscar SKU, código ou título"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="max-w-sm"
                />
                <select
                  aria-label="O que fazer"
                  value={acao}
                  onChange={(e) => setAcao(e.target.value)}
                  className="min-h-10 max-w-full rounded-r1 border border-line bg-panel px-2 text-sm"
                >
                  <option value="">Tudo ({oportunidades.length})</option>
                  {(Object.keys(ROTULO_ACAO) as AcaoAds[])
                    .filter((a) => (referencias?.contagem[a] ?? 0) > 0)
                    .map((a) => (
                      <option key={a} value={a}>
                        {ROTULO_ACAO[a]} ({referencias?.contagem[a] ?? 0})
                      </option>
                    ))}
                </select>
                <Button
                  onClick={exportar}
                  disabled={exportando || !oportunidadesVisiveis.length}
                  aria-busy={exportando}
                  className="sm:ml-auto"
                >
                  {exportando ? "Gerando Excel…" : `Baixar Excel (${oportunidadesVisiveis.length})`}
                </Button>
                {erroExport && <span role="alert" className="text-[12.5px] text-down">{erroExport}</span>}
              </div>
              {referencias && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 px-3 py-2 border-b border-line text-[12px] text-ink-3">
                  <span>
                    conversão mediana{" "}
                    <span className="num text-ink-2">
                      {referencias.conversaoMediana != null ? pct(referencias.conversaoMediana, 1) : "—"}
                    </span>
                  </span>
                  <span>
                    já bem visto acima de{" "}
                    <span className="num text-ink-2">{referencias.visitasTeto != null ? count(referencias.visitasTeto) : "—"}</span>{" "}
                    visitas
                  </span>
                  <span>
                    piso de{" "}
                    <span className="num text-ink-2">{count(referencias.visitasMinimas)}</span> visitas para a taxa valer
                  </span>
                  <span>
                    <span className="num text-ink-2">{count(referencias.comVisitaSuficiente)}</span> anúncios acima do piso
                  </span>
                </div>
              )}
              <DataTable
                columns={colunasOportunidade}
                rows={oportunidadesVisiveis}
                rowKey={(l) => l.mlb}
                empty={<p className="px-4 py-6 text-[13px] text-ink-3">Nenhum anúncio com esse filtro.</p>}
              />
            </>
          )}
          {aba === "campanhas" && (
            <DataTable
              columns={colunasCampanha}
              rows={campanhas}
              rowKey={(c) => `${c.conta}|${c.campanha}`}
              defaultSort={{ key: "investimento", dir: "desc" }}
              empty={<p className="px-4 py-6 text-[13px] text-ink-3">Nenhuma campanha nesta janela.</p>}
            />
          )}
          {aba === "desperdicio" && (
            <div className="p-4 space-y-5">
              {[
                {
                  chave: "sem_retorno" as const,
                  lista: semRetorno,
                  titulo: "Não vendeu nem com ads, nem sozinho",
                  nota: "Confira gasto, cliques, oferta e tempo de campanha antes de decidir pela pausa. O C marca anúncio de catálogo: a venda pode ter saído pelo anúncio vencedor.",
                },
                {
                  chave: "vendeu_sem_ads" as const,
                  lista: semAds,
                  titulo: "Vendas sem atribuição à mídia",
                  nota: "Há pedidos, mas o canal não os atribuiu à campanha. Confira o intervalo e a atribuição.",
                },
                {
                  chave: "prejuizo" as const,
                  lista: prejuizo,
                  titulo: "A mídia custou mais que a margem",
                  nota: "O investimento superou a margem registrada no período. Confira se os custos estão completos.",
                },
              ].map(({ chave, lista, titulo, nota }) => (
                <div key={chave}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <TrendingDown className="w-3.5 h-3.5 text-ink-3" />
                    <p className="text-[13px] font-semibold text-ink">{titulo}</p>
                    <span className="num text-[12px] text-ink-3">
                      {count(lista.length)} ·{" "}
                      {money(lista.reduce((s, l) => s + l.investimento, 0))}
                    </span>
                  </div>
                  <p className="text-[12px] text-ink-3 mb-2">{nota}</p>
                  {lista.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {lista
                        .slice(0, 12)
                        .map((l, i) => (
                          <span
                            key={`${l.mlb}-${i}`}
                            className="px-2 py-1 rounded-r1 border border-line text-[12px]"
                            title={l.titulo}
                          >
                            <span className="num text-ink">{l.sku || l.mlb}</span>{" "}
                            <span className="num text-ink-3">
                              {money(l.investimento)}
                            </span>{" "}
                            {/* A etiqueta vem aqui também, e aqui é onde ela mais
                                importa: esta aba é a que sugere desligar. */}
                            <EtiquetaCatalogo situacao={l.catalogo} />
                          </span>
                        ))}
                      {lista.length > 12 && (
                        <span className="px-2 py-1 text-[12px] text-ink-3">
                          +{count(lista.length - 12)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-[12px] text-ink-3">Nenhum.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
        </>}
      </PageBody>
    </>
  );
}

/* ── Um número do topo ── */
function Numero({
  rotulo,
  valor,
  ajuda,
  tom,
}: {
  rotulo: string;
  valor: string;
  ajuda: string;
  tom?: "down" | "up";
}) {
  return (
    <Panel className="p-3">
      <p className="text-[12px] text-ink-3">{rotulo}</p>
      <p
        className={cn(
          "num mt-1 text-[19px] font-semibold leading-none",
          tom === "down" ? "text-down" : tom === "up" ? "text-up" : "text-ink"
        )}
      >
        {valor}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-ink-3">{ajuda}</p>
    </Panel>
  );
}
