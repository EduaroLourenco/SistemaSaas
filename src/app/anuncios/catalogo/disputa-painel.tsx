"use client";

import * as React from "react";
import { FotoAnuncio } from "@/components/ui/foto-anuncio";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Input } from "@/components/ui/controls";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatTile } from "@/components/ui/stat-tile";
import { linkDoAnuncio } from "@/lib/links";
import { TagAnuncio } from "@/components/ui/tag-anuncio";
import { money, pct, count } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DadosDisputa, LinhaDisputa, SituacaoDisputa, Fatia } from "@/lib/dados/disputa-catalogo";

/**
 * Disputa de catálogo.
 *
 * A pergunta é uma: estou ganhando a página do produto? A tabela responde
 * em três colunas — situação de hoje, dias ganhando sobre dias medidos, e
 * quanto falta em reais — e deixa a decisão de baixar preço para quem
 * conhece a margem.
 *
 * Sem texto de recomendação: cada linha tem o número que basta, e a ordem
 * de abertura já põe no topo quem perde por menos dinheiro.
 */

const ROTULO: Record<SituacaoDisputa, string> = {
  ganhando: "Ganhando",
  dividindo: "Dividindo 1º",
  competindo: "Perdendo",
  listado: "Só listado",
  fora: "Fora do catálogo",
};

const TOM: Record<SituacaoDisputa, "up" | "down" | "warn" | "neutral" | "brand"> = {
  ganhando: "up",
  dividindo: "brand",
  competindo: "down",
  listado: "warn",
  fora: "neutral",
};

const FATIA: Record<Exclude<Fatia, null>, string> = {
  maxima: "máxima",
  alta: "alta",
  media: "média",
  baixa: "baixa",
};

/* A ordem da pior para a melhor posição: é por ela que a coluna ordena, e
   não pelo alfabeto — "Fora" antes de "Ganhando" não diz nada. */
const ORDEM: Record<SituacaoDisputa, number> = { competindo: 0, listado: 1, fora: 2, dividindo: 3, ganhando: 4 };

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function DisputaPainel({ disputa }: { disputa: DadosDisputa }) {
  const [busca, setBusca] = React.useState("");
  const [situacao, setSituacao] = React.useState<string>("");
  const [soComEstoque, setSoComEstoque] = React.useState(false);

  const linhas = React.useMemo(() => {
    const t = busca.trim().toLowerCase();
    return disputa.linhas
      .filter((l) => !situacao || l.situacao === situacao)
      .filter((l) => !soComEstoque || l.estoque == null || l.estoque > 0)
      .filter(
        (l) =>
          !t ||
          l.mlb.toLowerCase().includes(t) ||
          l.sku.toLowerCase().includes(t) ||
          l.titulo.toLowerCase().includes(t)
      );
  }, [disputa.linhas, busca, situacao, soComEstoque]);

  if (disputa.vazio) {
    return (
      <Panel>
        <PanelHeader
          title="Disputa de catálogo"
          hint="Sem medição ainda · a leitura é diária"
        />
      </Panel>
    );
  }

  const colunas: Column<LinhaDisputa>[] = [
    {
      key: "situacao",
      header: "Situação",
      sticky: true,
      mobile: "title",
      width: "150px",
      sortValue: (l) => ORDEM[l.situacao],
      cell: (l) => (
        <div className="min-w-0">
          {/* Perder para o próprio anúncio não é perder. O premium do
              mesmo produto custa mais (comissão 16,5% contra 11,5%) e
              por isso aparece atrás do clássico da casa. */}
          <Badge tone={l.casaJaGanha ? "neutral" : TOM[l.situacao]}>
            {l.casaJaGanha ? "a casa já ganha" : ROTULO[l.situacao]}
          </Badge>
          {l.casaJaGanha && l.vencedorDaCasa && (
            <p className="num text-[11px] text-ink-3 mt-0.5">por {l.vencedorDaCasa}</p>
          )}
          {!l.casaJaGanha && l.situacao === "dividindo" && l.dividindoCom != null && (
            <p className="text-[11px] text-ink-3 mt-0.5">com {l.dividindoCom} vendedor(es)</p>
          )}
          {l.dia !== disputa.ultimoDia && (
            <p className="text-[11px] text-ink-3 mt-0.5">medido em {dataBr(l.dia)}</p>
          )}
        </div>
      ),
    },
    {
      key: "anuncio",
      header: "Anúncio",
      width: "300px",
      sortValue: (l) => l.sku || l.mlb,
      cell: (l) => (
        <div className="flex items-start gap-2 min-w-0">
          <FotoAnuncio mlb={l.mlb} alt={l.titulo} tamanho={34} />
          <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="num text-[12.5px] font-medium text-ink">{l.sku || "sem SKU"}</span>
            {linkDoAnuncio(l.mlb) ? (
              <a
                href={linkDoAnuncio(l.mlb)!}
                target="_blank"
                rel="noreferrer"
                className="num text-[11.5px] text-brand hover:underline"
              >
                {l.mlb}
              </a>
            ) : (
              <span className="num text-[11.5px] text-ink-3">{l.mlb}</span>
            )}
            {l.tipo === "Premium" && <Badge tone="neutral">premium</Badge>}
            {/* Pausado ou encerrado: a recomendação de preço não cabe. */}
            <TagAnuncio status={l.status} />
          </div>
          <p className="text-[12px] text-ink-2 break-words max-w-[280px]">
            {l.titulo}
          </p>
          <p className="text-[11px] text-ink-3">{l.conta}</p>
          </div>
        </div>
      ),
    },
    {
      /* Dias ganhando sobre dias medidos: "ganhando hoje" esconde quem
         ganha e perde todo dia, que é o caso de quem disputa por centavos. */
      key: "dias",
      header: "Dias ganhando",
      align: "right",
      width: "118px",
      sortValue: (l) => (l.diasMedidos ? l.diasGanhando / l.diasMedidos : -1),
      cell: (l) => (
        <div className="flex flex-col items-end leading-tight">
          <span className="num text-[12.5px] text-ink">
            {l.diasGanhando} de {l.diasMedidos}
          </span>
          {l.diasMedidos > 0 && (
            <span className="num text-[11.5px] text-ink-3">{pct((l.diasGanhando * 100) / l.diasMedidos, 0)}</span>
          )}
        </div>
      ),
    },
    {
      key: "fatia",
      header: "Fatia de visita",
      width: "108px",
      sortValue: (l) => (l.fatia ? { maxima: 4, alta: 3, media: 2, baixa: 1 }[l.fatia] : 0),
      cell: (l) =>
        l.fatia ? (
          <span className={cn("text-[12.5px]", l.fatia === "baixa" ? "text-down" : l.fatia === "maxima" ? "text-up" : "text-ink-2")}>
            {FATIA[l.fatia]}
          </span>
        ) : (
          <span className="text-[12px] text-ink-3">—</span>
        ),
    },
    {
      key: "meuPreco",
      header: "Meu preço",
      align: "right",
      width: "104px",
      sortValue: (l) => l.meuPreco ?? -1,
      cell: (l) => <span className="num text-[12.5px] text-ink">{l.meuPreco != null ? money(l.meuPreco) : "—"}</span>,
    },
    {
      key: "precoVencedor",
      header: "Vencedor",
      align: "right",
      width: "104px",
      sortValue: (l) => l.precoVencedor ?? -1,
      cell: (l) => (
        <span className="num text-[12.5px] text-ink-2">{l.precoVencedor != null ? money(l.precoVencedor) : "—"}</span>
      ),
    },
    {
      key: "precoParaGanhar",
      header: "Para ganhar",
      align: "right",
      width: "108px",
      sortValue: (l) => l.precoParaGanhar ?? -1,
      cell: (l) => (
        <span className="num text-[12.5px] text-ink-2">{l.precoParaGanhar != null ? money(l.precoParaGanhar) : "—"}</span>
      ),
    },
    {
      /* A coluna de decisão. Em R$ e em %: R$ 2 num produto de R$ 30 é uma
         coisa, R$ 2 num de R$ 1.600 é outra. */
      key: "falta",
      header: "Falta baixar",
      align: "right",
      mobile: "metric",
      width: "116px",
      sortValue: (l) => l.faltaPct ?? -1,
      cell: (l) =>
        l.casaJaGanha ? (
          <span className="text-[12px] text-ink-3" title="Baixar aqui é competir com o próprio anúncio">
            nada a fazer
          </span>
        ) : l.faltaReais == null ? (
          <span className="text-[12px] text-ink-3">—</span>
        ) : (
          <div className="flex flex-col items-end leading-tight">
            <span className="num text-[12.5px] font-semibold text-down">{money(l.faltaReais)}</span>
            <span className="num text-[11.5px] text-ink-3">{pct(l.faltaPct ?? 0, 1)}</span>
          </div>
        ),
    },
    {
      /* Ganhar sem baixar preço: o canal diz quais alavancas estão
         disponíveis, e elas custam logística, não margem por unidade. */
      key: "alavancas",
      header: "Sem baixar preço",
      width: "180px",
      sortValue: (l) => l.alavancas.length,
      cell: (l) =>
        l.alavancas.length ? (
          <span className="text-[12px] text-ink-2">{l.alavancas.join(", ")}</span>
        ) : !l.elegivel ? (
          <span className="text-[12px] text-ink-3" title={l.motivos.join(", ")}>
            não elegível
          </span>
        ) : (
          <span className="text-[12px] text-ink-3">—</span>
        ),
    },
    {
      key: "estoque",
      header: "Estoque",
      align: "right",
      width: "92px",
      sortValue: (l) => l.estoque ?? -1,
      cell: (l) =>
        l.estoque == null ? (
          <span className="text-[12px] text-ink-3">não lido</span>
        ) : (
          <span className={cn("num text-[12.5px]", l.estoque === 0 ? "text-down font-semibold" : "text-ink-2")}>
            {l.estoque}
          </span>
        ),
    },
  ];

  const total = disputa.linhas.length;
  const ganhandoOuDividindo = disputa.resumo.ganhando + disputa.resumo.dividindo;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Disputa de catálogo"
        hint={`${total} anúncios de catálogo · medição de ${disputa.primeiroDia ? dataBr(disputa.primeiroDia) : "—"} a ${disputa.ultimoDia ? dataBr(disputa.ultimoDia) : "—"} (${disputa.diasNaJanela} dias)`}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-line">
        <StatTile
          label="Ganhando ou dividindo"
          value={count(ganhandoOuDividindo)}
          hint={total ? `${pct((ganhandoOuDividindo * 100) / total, 0)} dos anúncios` : undefined}
        />
        <StatTile label="Perdendo" value={count(disputa.resumo.competindo)} hint="o canal mostra outro vendedor" />
        <StatTile
          label="Com preço para ganhar"
          value={count(disputa.resumo.comCaminhoDePreco)}
          hint="o canal informou quanto baixar"
        />
        <StatTile
          label="Só listado ou fora"
          value={count(disputa.resumo.listado + disputa.resumo.fora)}
          hint="não aparece na disputa"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
        <Input
          placeholder="Buscar SKU, código ou título"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <select
          aria-label="Situação na disputa"
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          className="min-h-10 max-w-full rounded-r1 border border-line bg-panel px-2 text-sm"
        >
          <option value="">Todas as situações ({total})</option>
          {(Object.keys(ROTULO) as SituacaoDisputa[])
            .filter((s) => disputa.linhas.some((l) => l.situacao === s))
            .map((s) => (
              <option key={s} value={s}>
                {ROTULO[s]} ({disputa.linhas.filter((l) => l.situacao === s).length})
              </option>
            ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <input type="checkbox" checked={soComEstoque} onChange={(e) => setSoComEstoque(e.target.checked)} />
          só com estoque
        </label>
      </div>
      <DataTable
        columns={colunas}
        rows={linhas}
        rowKey={(l) => l.mlb}
        empty={<p className="px-4 py-6 text-[13px] text-ink-3">Nenhum anúncio com esse filtro.</p>}
      />
      <p className="px-4 py-3 text-[12px] text-ink-3 border-t border-line">
        &quot;Falta baixar&quot; é a diferença até o preço que o canal diz que ganharia a disputa. Confira a margem em Preço
        alvo antes de baixar — o canal informa o preço, não o seu custo.
      </p>
    </Panel>
  );
}
