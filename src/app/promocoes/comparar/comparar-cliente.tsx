"use client";
import { gerizoFetch } from "@/lib/demo/runtime";


import * as React from "react";
import { FotoAnuncio } from "@/components/ui/foto-anuncio";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { FerramentasPromocoes } from "@/components/promocoes/ferramentas";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { SemFonte } from "@/components/ui/sem-fonte";
import { money, count } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  DadosComparacao,
  AnuncioComOfertas,
  Oferta,
} from "@/lib/dados/comparar-ofertas";
import { Search, ChevronDown, ChevronRight, Download, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * Comparação de ofertas por anúncio.
 *
 * O canal propõe várias faixas de desconto para o mesmo anúncio, e o
 * mesmo anúncio pode estar em mais de uma campanha ao mesmo tempo. A
 * decisão de entrar não sai de olhar uma proposta isolada — sai de ver as
 * propostas lado a lado e contra o piso.
 *
 * Por isso a linha é o ANÚNCIO e as ofertas ficam dentro dela, e não uma
 * linha por oferta: numa lista plana de 549 linhas, as três propostas do
 * mesmo anúncio ficam separadas por centenas de outras e a comparação —
 * que é o motivo da tela existir — não acontece.
 *
 * O que ela responde, em ordem: quais anúncios têm mais de uma proposta;
 * qual delas passa; e, quando nenhuma passa, quanto faltou — porque essa
 * é a que vira pedido de desconto extra.
 */

type Filtro = "todos" | "varias" | "nenhuma" | "alguma";

export default function Comparar({ dados, buscaInicial = "" }: { dados: DadosComparacao; buscaInicial?: string }) {
  const [busca, setBusca] = React.useState(buscaInicial);
  const [filtro, setFiltro] = React.useState<Filtro>("todos");
  const [campanha, setCampanha] = React.useState("todas");
  const [abertos, setAbertos] = React.useState<Set<string>>(new Set());
  const [baixando, setBaixando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  /**
   * Exporta as ofertas RECUSADAS do recorte, para decidir fora da tela.
   *
   * O motor recusa o que fura o piso, e está certo na regra geral. Mas a
   * regra não sabe que um SKU parado há três semanas vale entrar com
   * margem menor. Essa decisão é de quem opera, e a planilha leva os
   * números — inclusive a comissão que sobra depois da redução, que é o
   * número que decide e que a tela deixava para a cabeça de quem lê.
   */
  async function exportarRecusadas() {
    setBaixando(true);
    setErro(null);
    try {
      const q = campanha !== "todas" ? `?campanha=${campanha}` : "";
      const r = await gerizoFetch(`/api/exportar/recusadas${q}`);
      if (!r.ok) {
        const corpo = await r.json().catch(() => ({}));
        setErro(corpo.erro ?? `Falha ao gerar (HTTP ${r.status})`);
        return;
      }

      const cd = r.headers.get("content-disposition") ?? "";
      const nome =
        cd.match(/filename="([^"]+)"/)?.[1] ?? "ofertas-recusadas.xlsx";

      const blob = await r.blob();
      if (blob.size === 0) {
        setErro("O arquivo veio vazio.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Sem conexão — nada foi baixado.");
    } finally {
      setBaixando(false);
    }
  }

  const alternar = (id: string) =>
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.clear();
      else { proximo.clear(); proximo.add(id); }
      return proximo;
    });

  const linhas = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dados.anuncios.filter((a) => {
      if (campanha !== "todas" && !a.ofertas.some((o) => o.campanhaId === campanha)) {
        return false;
      }
      if (filtro === "varias" && a.ofertas.length < 2) return false;
      if (filtro === "nenhuma" && a.participam > 0) return false;
      if (filtro === "alguma" && a.participam === 0) return false;
      if (!q) return true;
      return (
        a.mlb.toLowerCase().includes(q) ||
        a.sku.toLowerCase().includes(q) ||
        a.titulo.toLowerCase().includes(q)
      );
    });
  }, [dados.anuncios, busca, filtro, campanha]);

  const totais = React.useMemo(
    () =>
      linhas.reduce(
        (t, a) => ({
          ofertas: t.ofertas + a.ofertas.length,
          participam: t.participam + a.participam,
          semNenhuma: t.semNenhuma + (a.participam === 0 ? 1 : 0),
        }),
        { ofertas: 0, participam: 0, semNenhuma: 0 }
      ),
    [linhas]
  );

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Comparar propostas" actions={<FerramentasPromocoes atual="/promocoes/comparar" />} />
        <PageBody className="op-workspace op-promocoes-comparar">
          <SemFonte
            titulo="Nenhuma oferta processada"
            origem="As propostas registradas aparecem aqui após o processamento de uma campanha."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Comparar propostas" actions={<FerramentasPromocoes atual="/promocoes/comparar" />} />
      <PageBody className="op-workspace promo-workspace op-promocoes-comparar">
        <section className="promo-overview" aria-label="Resumo das propostas">
          <div><strong>{count(linhas.length)}</strong><span>anúncios</span></div><div><strong>{count(totais.ofertas)}</strong><span>propostas</span></div><div><strong>{count(totais.participam)}</strong><span>propostas aprovadas</span></div><div><strong>{count(totais.semNenhuma)}</strong><span>sem proposta aprovada</span></div>
        </section>
        <div className="promo-toolbar">
          <label className="promo-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar propostas</span><input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Produto, SKU ou anúncio" /></label>
          <details className="promo-filter"><summary>Filtros{(filtro!=="todos"||campanha!=="todas")?` · ${Number(filtro!=="todos")+Number(campanha!=="todas")}`:""}<ChevronDown size={15} /></summary><div className="promo-filter-fields">
          <label>Situação<select aria-label="Situação das propostas" value={filtro} onChange={e=>setFiltro(e.target.value as Filtro)} className="h-11 max-w-full rounded-r1 border border-line-2 bg-panel px-3 text-[14px]"><option value="todos">Todos os anúncios</option><option value="varias">Com várias propostas</option><option value="nenhuma">Nenhuma passa</option><option value="alguma">Alguma passa</option></select></label>
          <label>Campanha<select aria-label="Campanha das propostas" value={campanha} onChange={e=>setCampanha(e.target.value)} className="h-11 max-w-full rounded-r1 border border-line-2 bg-panel px-3 text-[14px]"><option value="todas">Todas as campanhas</option>{dados.campanhasDisponiveis.map(c=><option key={c.id} value={c.id}>{c.nome}{c.temReducao?" · com redução":""}</option>)}</select></label>
          </div></details>
          <Button disabled={baixando} onClick={exportarRecusadas}>{baixando?<Loader2 size={16} className="animate-spin" />:<Download size={16} />}{baixando?"Preparando…":"Exportar recusadas"}</Button>
        </div>
        {erro && (
          <Panel className="px-4 py-3 mb-3 flex items-start gap-2.5 border-down/30">
            <AlertCircle className="w-4 h-4 text-down shrink-0 mt-0.5" />
            <p className="text-[14px] text-ink-2">{erro}</p>
          </Panel>
        )}

        <Panel className="op-primary-table overflow-hidden">
          <PanelHeader title="Escolha um anúncio para comparar" />

          {!linhas.length ? (
            <p className="px-3 py-10 text-center text-[14px] text-ink-3">
              Nenhum anúncio com esse recorte.
            </p>
          ) : (
            <div>
              {linhas.map((a) => (
                <LinhaAnuncio
                  key={a.anuncioId}
                  anuncio={a}
                  aberto={abertos.has(a.anuncioId)}
                  onAlternar={() => alternar(a.anuncioId)}
                  campanhaFiltrada={campanha === "todas" ? null : campanha}
                  semOrigem={dados.semOrigem}
                />
              ))}
            </div>
          )}
        </Panel>
      </PageBody>
    </>
  );
}

/* ───────────────────────────────────────────────────────────── */

function LinhaAnuncio({
  anuncio: a,
  aberto,
  onAlternar,
  campanhaFiltrada,
  semOrigem,
}: {
  anuncio: AnuncioComOfertas;
  aberto: boolean;
  onAlternar: () => void;
  campanhaFiltrada: string | null;
  semOrigem: boolean;
}) {
  const visiveis = campanhaFiltrada
    ? a.ofertas.filter((o) => o.campanhaId === campanhaFiltrada)
    : a.ofertas;

  return (
    <div className="border-b border-line">
      <button
        onClick={onAlternar}
        className="promo-offer-row w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-panel-2"
        aria-expanded={aberto}
      >
        {aberto ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-ink-3" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-ink-3" />
        )}

        <FotoAnuncio mlb={a.mlb} alt={a.titulo ?? a.mlb} tamanho={32} />

        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink truncate">
            {a.titulo || a.mlb}
          </span>
          <span className="block text-[12px] text-ink-3 truncate">
            {a.sku ? `${a.sku} · ` : ""}
            {a.mlb}
            {a.campanhas > 1 ? ` · ${a.campanhas} campanhas` : ""}
          </span>
        </span>

        {/*
          Faixa, não um valor só: cada oferta tem a sua tabela, porque a
          comissão muda por faixa e a Fórmula base devolve outro preço.
          Um número no cabeçalho contradiria as linhas de baixo.
        */}
        <span className="hidden sm:block shrink-0 text-right w-36">
          <span className="block label">Tabela</span>
          <span className="block num text-[14px] text-ink-2">
            {a.tabelaDe == null
              ? "—"
              : a.tabelaDe === a.tabelaAte
                ? money(a.tabelaDe)
                : `${money(a.tabelaDe)} – ${money(a.tabelaAte!)}`}
          </span>
        </span>

        <span className="shrink-0">
          <Resultado anuncio={a} />
        </span>
      </button>

      {aberto && (
        <div className="bg-panel-2 px-3 py-2.5 border-t border-line">
          {/*
            A legenda mora aqui, junto das linhas, e não num canto da tela.
            Sem ela "vs piso" negativo com decisão "participa" parece
            contradição — e é a primeira coisa que se pergunta ao abrir.
          */}
          <div className="promo-proposal-cards">{visiveis.map(o=><article key={o.id} className="promo-proposal-card" data-best={o.id===a.melhorAceitavel?.id||undefined}><h4>{o.campanha}</h4><div className="flex flex-wrap items-center gap-2"><Badge tone={o.participa?"up":"neutral"}>{o.participa?"Passa pelos critérios":"Fora dos critérios"}</Badge>{o.id===a.melhorAceitavel?.id&&<span className="text-[12px] font-medium text-brand">Melhor aceitável</span>}{a.participam===0&&o.id===a.recusadaMaisProxima?.id&&<span className="text-[12px] text-warn">Mais próxima do piso</span>}</div><dl className="promo-prices"><div><dt>Canal pediu</dt><dd>{o.precoCanal==null?"—":money(o.precoCanal)}</dd></div><div><dt>Nosso preço</dt><dd>{o.precoOferta==null?"—":money(o.precoOferta)}</dd></div><div><dt>Piso efetivo</dt><dd>{o.pisoEfetivo==null?"—":money(o.pisoEfetivo)}</dd></div><div><dt>Comissão resultante</dt><dd>{o.comissaoResultante==null?"—":o.comissaoResultante.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%"}</dd></div></dl><p>{o.motivo|| (o.folgaAtePiso==null?"Sem distância ao piso calculada.":`${o.folgaAtePiso>=0?"Folga de":"Faltam"} ${money(Math.abs(o.folgaAtePiso))} ${o.folgaAtePiso>=0?"acima do piso.":"para alcançar o piso."}`)}</p></article>)}</div>
          <details className="promo-secondary mt-4"><summary>Todos os dados das propostas<ChevronDown size={15} /></summary>


          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left px-2 py-1.5 min-w-[200px]">
                    <span className="label">Campanha</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">Redução</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">Canal pediu</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">Nosso preço</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">Tabela</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">Piso</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">vs tabela</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">vs piso</span>
                  </th>
                  <th className="text-left px-2 py-1.5 min-w-[140px]">
                    <span className="label">Decisão</span>
                  </th>
                  {!semOrigem && (
                    <th className="text-left px-2 py-1.5">
                      <span className="label">Origem</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((o) => (
                  <LinhaOferta
                    key={o.id}
                    oferta={o}
                    melhor={o.id === a.melhorAceitavel?.id}
                    maisProxima={
                      a.participam === 0 && o.id === a.recusadaMaisProxima?.id
                    }
                    semOrigem={semOrigem}
                  />
                ))}
              </tbody>
            </table>
          </div>

          </details>
          <details className="promo-secondary"><summary>Como comparar os preços<ChevronDown size={15} /></summary><div>          <p className="mb-2 text-[12px] text-ink-3 leading-relaxed">
            <strong className="text-ink-2">Tabela</strong> é o preço que
            preserva a margem naquela comissão — muda de faixa para faixa.{" "}
            <strong className="text-ink-2">Piso</strong> é tabela − 5%, o menor
            preço ofertável; com desconto extra ele desce de propósito.{" "}
            <strong className="text-ink-2">Redução</strong> é a fatia da tarifa
            que o canal abate nesta faixa — é ela que muda a comissão e, com
            isso, o preço de tabela da linha.{" "}
            {a.ofertas.some((o) => !o.temReducao) && (
              <>
                Nas campanhas <em>sem redução de tarifa</em> o preço do canal é
                só um pedido: o sistema reescreve com o da Fórmula base, e é por
                isso que as duas primeiras colunas divergem.{" "}
              </>
            )}
          </p></div></details>
          {a.participam === 0 && a.recusadaMaisProxima?.folgaAtePiso != null && (
            <p className="mt-2 text-[12px] text-ink-3">
              Nenhuma proposta passa. A mais próxima está{" "}
              <span className="num font-medium text-ink-2">
                {money(Math.abs(a.recusadaMaisProxima.folgaAtePiso))}
              </span>{" "}
              abaixo do piso — é a que um desconto extra pode alcançar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Resultado({ anuncio: a }: { anuncio: AnuncioComOfertas }) {
  const total = a.ofertas.length;
  if (a.participam === 0) {
    return <Badge tone="down">{total === 1 ? "não passa" : `0 de ${total}`}</Badge>;
  }
  if (a.participam === total) {
    return <Badge tone="up">{total === 1 ? "passa" : `${total} de ${total}`}</Badge>;
  }
  return (
    <Badge tone="warn">
      {a.participam} de {total}
    </Badge>
  );
}

function LinhaOferta({
  oferta: o,
  melhor,
  maisProxima,
  semOrigem,
}: {
  oferta: Oferta;
  melhor: boolean;
  maisProxima: boolean;
  semOrigem: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b border-line last:border-0",
        melhor && "bg-up-wash",
        maisProxima && "bg-warn-wash"
      )}
    >
      <td className="px-2 py-1.5">
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="text-ink truncate">{o.campanha}</span>
          {o.temReducao && <Badge tone="brand">redução</Badge>}
          {melhor && (
            <span className="text-[12px] font-medium text-up">melhor aceitável</span>
          )}
          {maisProxima && (
            <span className="text-[12px] font-medium text-warn">faltou menos</span>
          )}
        </span>
      </td>

      {/*
        Os dois preços, sempre. Com redução de tarifa eles coincidem — o
        preço é do canal. Sem redução o sistema reescreve com o da Fórmula
        base, e é aí que a diferença conta: o canal pediu R$ 2.235,35 e
        publicamos R$ 1.314,42. Mostrar um só escondia essa folga.
      */}
      {/*
        A redução é o que separa duas ofertas do mesmo anúncio: comissão
        menor, preço de tabela menor. Sem ela, tabelas diferentes na mesma
        linha de produto parecem inconsistência.

        O percentual vem primeiro porque é assim que o canal comunica —
        "reduzi 5% da sua tarifa"; os reais ficam embaixo, para conferir.
      */}
      <td className="px-2 py-1.5 text-right num">
        {o.reducaoPercentual == null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <>
            <span className="text-ink">
              {o.reducaoPercentual.toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}
              %
            </span>
            {o.reducaoTarifa != null && (
              <span className="block text-[12px] text-ink-3">
                {money(o.reducaoTarifa)}
              </span>
            )}
          </>
        )}
      </td>

      <td className="px-2 py-1.5 text-right num text-ink-3">
        {o.precoCanal != null ? money(o.precoCanal) : "—"}
      </td>

      <td className="px-2 py-1.5 text-right num text-ink">
        {o.precoOferta != null ? money(o.precoOferta) : "—"}
      </td>

      <td className="px-2 py-1.5 text-right num text-ink-3">
        {o.precoTabela != null ? money(o.precoTabela) : "—"}
      </td>

      <td className="px-2 py-1.5 text-right num text-ink-3">
        {o.pisoEfetivo != null ? money(o.pisoEfetivo) : "—"}
        {o.descontoExtra != null && (
          <span className="block text-[12px] text-ink-3">
            piso −{Math.round(o.descontoExtra * 100)}%
          </span>
        )}
      </td>

      <td className="px-2 py-1.5 text-right num text-ink-2">
        {o.descontoSobreTabela != null
          ? `${o.descontoSobreTabela.toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
            })}%`
          : "—"}
      </td>

      <td
        className={cn(
          "px-2 py-1.5 text-right num",
          o.folgaAtePiso == null
            ? "text-ink-3"
            : o.folgaAtePiso >= 0
              ? "text-up"
              : "text-down"
        )}
      >
        {o.folgaAtePiso == null
          ? "—"
          : `${o.folgaAtePiso >= 0 ? "+" : "−"}${money(Math.abs(o.folgaAtePiso))}`}
      </td>

      <td className="px-2 py-1.5">
        {o.participa ? (
          <Badge tone="up">participa</Badge>
        ) : (
          <span className="text-[12px] text-ink-3">{o.motivo || "fora"}</span>
        )}
      </td>

      {!semOrigem && (
        <td className="px-2 py-1.5 text-[12px] text-ink-3 whitespace-nowrap">
          {o.arquivo
            ? `${o.arquivo.replace(/\.xlsx$/i, "").slice(0, 26)}${
                o.linhaPlanilha ? ` · linha ${o.linhaPlanilha}` : ""
              }`
            : "—"}
        </td>
      )}
    </tr>
  );
}
