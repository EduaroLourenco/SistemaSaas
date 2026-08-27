"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { SemFonte } from "@/components/ui/sem-fonte";
import { money, count } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  DadosComparacao,
  AnuncioComOfertas,
  Oferta,
} from "@/lib/dados/comparar-ofertas";
import { Search, ChevronDown, ChevronRight } from "lucide-react";

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

export default function Comparar({ dados }: { dados: DadosComparacao }) {
  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState<Filtro>("varias");
  const [campanha, setCampanha] = React.useState("todas");
  const [abertos, setAbertos] = React.useState<Set<string>>(new Set());

  const alternar = (id: string) =>
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
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
        <PageHeader title="Comparar ofertas" breadcrumb="Promoções" />
        <PageBody>
          <SemFonte
            titulo="Nenhuma oferta processada"
            origem="As ofertas saem das planilhas da Central de Promoções. O canal costuma propor mais de uma faixa de desconto para o mesmo anúncio — processe uma planilha e elas aparecem aqui, lado a lado."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Comparar ofertas"
        breadcrumb="Promoções"
        description="Todas as propostas do canal para cada anúncio, lado a lado"
        filters={
          <>
            <Segmented
              options={[
                { value: "varias", label: "Mais de uma" },
                { value: "nenhuma", label: "Nenhuma passa" },
                { value: "alguma", label: "Alguma passa" },
                { value: "todos", label: "Todos" },
              ]}
              value={filtro}
              onChange={(v) => setFiltro(v as Filtro)}
            />

            <select
              value={campanha}
              onChange={(e) => setCampanha(e.target.value)}
              className="h-7 px-2 rounded-r1 bg-panel border border-line-2 text-[12.5px]
                         text-ink outline-none focus:border-brand shrink-0 max-w-[220px]"
            >
              <option value="todas">Todas as campanhas</option>
              {dados.campanhasDisponiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.temReducao ? " · com redução" : ""}
                </option>
              ))}
            </select>

            <span className="relative shrink-0 w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="MLB, SKU ou título"
                className="w-full h-7 pl-8 pr-3 rounded-r1 bg-panel border border-line
                           text-[12.5px] text-ink outline-none focus:border-brand"
              />
            </span>
          </>
        }
      />

      <PageBody>
        <Panel className="overflow-hidden">
          <PanelHeader
            title={`${count(linhas.length)} anúncios`}
            hint="clique para abrir as propostas"
            action={
              <span className="num text-[12px] text-ink-2">
                {count(totais.ofertas)} propostas ·{" "}
                <span className="text-up">{count(totais.participam)} passam</span>
                {totais.semNenhuma > 0 && (
                  <span className="text-down">
                    {" "}
                    · {count(totais.semNenhuma)} sem nenhuma
                  </span>
                )}
              </span>
            }
          />

          {!linhas.length ? (
            <p className="px-3 py-10 text-center text-[12.5px] text-ink-3">
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
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-panel-2"
      >
        {aberto ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-ink-3" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-ink-3" />
        )}

        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-ink truncate">
            {a.titulo || a.mlb}
          </span>
          <span className="block text-[11.5px] text-ink-3 truncate">
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
          <span className="block num text-[12.5px] text-ink-2">
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
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left px-2 py-1.5 min-w-[200px]">
                    <span className="label">Campanha</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">Proposta</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">Tabela</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">Piso</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">Desconto</span>
                  </th>
                  <th className="text-right px-2 py-1.5">
                    <span className="label">Contra o piso</span>
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

          {a.participam === 0 && a.recusadaMaisProxima?.folgaAtePiso != null && (
            <p className="mt-2 text-[11.5px] text-ink-3">
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
            <span className="text-[11px] font-medium text-up">melhor aceitável</span>
          )}
          {maisProxima && (
            <span className="text-[11px] font-medium text-warn">faltou menos</span>
          )}
        </span>
      </td>

      <td className="px-2 py-1.5 text-right num text-ink">
        {o.precoOferta != null ? money(o.precoOferta) : "—"}
      </td>

      <td className="px-2 py-1.5 text-right num text-ink-3">
        {o.precoTabela != null ? money(o.precoTabela) : "—"}
      </td>

      <td className="px-2 py-1.5 text-right num text-ink-3">
        {o.precoPiso != null ? money(o.precoPiso) : "—"}
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
          <span className="text-[11.5px] text-ink-3">{o.motivo || "fora"}</span>
        )}
      </td>

      {!semOrigem && (
        <td className="px-2 py-1.5 text-[11.5px] text-ink-3 whitespace-nowrap">
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
