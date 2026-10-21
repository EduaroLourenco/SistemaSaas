"use client";

import * as React from "react";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FotoAnuncio } from "@/components/ui/foto-anuncio";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { ItemHistorico } from "@/lib/dados/promocoes";

/**
 * O outro lado da adesão: por produto, não por campanha.
 *
 * ── A pergunta ──
 *
 * "Adesão por campanha" responde quantos anúncios entraram na campanha
 * X. A pergunta que faltava é a inversa, e é a que ele faz olhando um
 * produto: este SKU entra em quase tudo que aparece? Entrou e vendeu,
 * ou entrou e não aconteceu nada? Quando ficou de fora, por quê?
 *
 * ── Entrou é diferente de funcionou ──
 *
 * A planilha diz se o anúncio foi aceito na campanha. Ela não diz se
 * vendeu. Aqui as duas coisas são colunas separadas, porque a decisão
 * muda: um SKU que entra em 90% das campanhas e não vende em nenhuma
 * está dando desconto de graça.
 *
 * "Vendeu" vem do preço praticado — a média paga nos pedidos do período
 * daquela campanha. Nulo quer dizer que não houve pedido, e nulo não é
 * zero: a tela mostra travessão e não conta como fracasso quando a
 * campanha é recente demais para ter pedido.
 */

type Linha = {
  sku: string;
  titulo: string;
  mlb: string;
  curva: string;
  /** Uma entrada por campanha em que o SKU foi avaliado. */
  campanhas: {
    nome: string;
    data: string;
    tipoCampanha: string;
    entrou: boolean;
    motivo: string | null;
    precoTabela: number | null;
    precoOfertado: number | null;
    precoPraticado: number | null;
    /** Houve pedido no período da campanha. */
    vendeu: boolean;
  }[];
  avaliadas: number;
  entrou: number;
  vendeu: number;
  descontoMedio: number | null;
};

/** O rótulo curto de uma campanha: o nome do arquivo é ilegível. */
function nomeCurto(nome: string) {
  /* "1_Com_reducao_de_tarifas-d0149a47-2b14-..." → "Com redução de tarifas".
     O prefixo numérico e o uuid vêm do nome do arquivo baixado do canal. */
  const semUuid = nome.replace(/-[0-9a-f-]{8,}$/i, "");
  const semData = semUuid.replace(/-\d{4}_\d{2}_\d{2}.*$/, "");
  return semData.replace(/^\d+_/, "").replace(/_/g, " ");
}

export function PromocoesPorSku({
  historico,
  totalCampanhas,
}: {
  historico: ItemHistorico[];
  /** Quantas campanhas distintas existem, para o "entrou em X de Y". */
  totalCampanhas: number;
}) {
  const [busca, setBusca] = React.useState("");
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [limite, setLimite] = React.useState(25);
  const [so, setSo] = React.useState<"todos" | "sem_venda" | "fora">("todos");

  const linhas = React.useMemo(() => {
    const mapa = new Map<string, Linha>();

    for (const h of historico) {
      const chave = h.sku?.trim() || h.mlb;
      const l =
        mapa.get(chave) ??
        ({
          sku: chave,
          titulo: h.titulo,
          mlb: h.mlb,
          curva: h.curva,
          campanhas: [],
          avaliadas: 0,
          entrou: 0,
          vendeu: 0,
          descontoMedio: null,
        } as Linha);

      /*
       * Um SKU pode ter vários anúncios na MESMA campanha — clássico e
       * premium, duas contas. Vale uma entrada por campanha, e a decisão
       * é "entrou" se qualquer anúncio dele entrou.
       */
      const ja = l.campanhas.find((c) => c.nome === h.campanha);
      const vendeu = h.precoPraticado != null;
      if (ja) {
        ja.entrou = ja.entrou || h.aprovado;
        ja.vendeu = ja.vendeu || vendeu;
        if (h.aprovado && h.precoOfertadoML != null) ja.precoOfertado = h.precoOfertadoML;
        if (!ja.motivo && !h.aprovado) ja.motivo = h.motivo;
      } else {
        l.campanhas.push({
          nome: h.campanha,
          data: h.data,
          tipoCampanha: h.tipoCampanha,
          entrou: h.aprovado,
          motivo: h.aprovado ? null : h.motivo,
          precoTabela: h.precoTabela,
          precoOfertado: h.precoOfertadoML,
          precoPraticado: h.precoPraticado,
          vendeu,
        });
      }
      mapa.set(chave, l);
    }

    for (const l of mapa.values()) {
      l.campanhas.sort((a, b) => b.data.localeCompare(a.data));
      l.avaliadas = l.campanhas.length;
      l.entrou = l.campanhas.filter((c) => c.entrou).length;
      l.vendeu = l.campanhas.filter((c) => c.entrou && c.vendeu).length;
      const descontos = l.campanhas
        .filter((c) => c.entrou && c.precoTabela && c.precoOfertado)
        .map((c) => ((c.precoTabela! - c.precoOfertado!) / c.precoTabela!) * 100)
        .filter((d) => d > 0);
      l.descontoMedio = descontos.length
        ? descontos.reduce((s, d) => s + d, 0) / descontos.length
        : null;
    }

    return [...mapa.values()].sort((a, b) => b.entrou - a.entrou || b.avaliadas - a.avaliadas);
  }, [historico]);

  const filtradas = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (so === "sem_venda" && !(l.entrou > 0 && l.vendeu === 0)) return false;
      if (so === "fora" && l.entrou === l.avaliadas) return false;
      if (!q) return true;
      return l.sku.toLowerCase().includes(q) || l.titulo.toLowerCase().includes(q);
    });
  }, [linhas, busca, so]);

  const visiveis = filtradas.slice(0, limite);
  const semVenda = linhas.filter((l) => l.entrou > 0 && l.vendeu === 0).length;

  if (!linhas.length) return null;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Por produto"
        action={
          <span className="num text-[12px] text-ink-3">
            {filtradas.length} SKUs · {totalCampanhas} campanhas
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-line">
        <span className="relative flex-1 min-w-[170px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="SKU ou título"
            className="w-full h-8 pl-8 pr-3 rounded-r1 bg-panel border border-line
                       text-[13px] text-ink outline-none focus:border-brand"
          />
        </span>
        {(
          [
            ["todos", `Todos ${linhas.length}`],
            ["sem_venda", `Entrou e não vendeu ${semVenda}`],
            ["fora", "Já ficou de fora"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSo(id)}
            className={cn(
              "min-h-8 px-3 rounded-r1 border text-[12.5px] transition-colors",
              so === id
                ? "border-brand-edge bg-brand-wash text-ink font-semibold"
                : "border-line bg-panel-2 text-ink-2 hover:border-line-2",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-20 bg-panel text-left px-3 py-2 border-r border-line min-w-[200px] sm:min-w-[250px]">
                <span className="label">Produto</span>
              </th>
              {[
                ["Entrou em", "Em quantas das campanhas avaliadas o produto foi aceito."],
                ["Vendeu em", "Das que entrou, em quantas houve pedido no período."],
                ["Desconto médio", "Quanto abaixo da tabela ficou o preço ofertado, nas que entrou."],
                ["Ficou de fora", "Quantas vezes foi recusado. Abra a linha para ver o motivo de cada uma."],
              ].map(([h, ajuda]) => (
                <th key={h} className="px-3 py-2 text-right whitespace-nowrap">
                  <span className="label" title={ajuda}>
                    {h}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visiveis.map((l) => {
              const expandida = aberto === l.sku;
              const fora = l.avaliadas - l.entrou;
              return (
                <React.Fragment key={l.sku}>
                  <tr
                    className="border-b border-line hover:bg-panel-2 cursor-pointer"
                    onClick={() => setAberto(expandida ? null : l.sku)}
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-panel text-left px-3 py-3
                                 border-r border-line font-normal max-w-[230px] sm:max-w-[310px]"
                    >
                      <span className="flex items-start gap-2">
                        {expandida ? (
                          <ChevronDown className="w-3.5 h-3.5 text-ink-3 mt-1 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-ink-3 mt-1 shrink-0" />
                        )}
                        <FotoAnuncio mlb={l.mlb} alt={l.titulo} tamanho={34} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="num text-[12px] font-semibold text-ink">
                              {l.sku}
                            </span>
                            {l.curva !== "—" && (
                              <Badge tone={l.curva === "A" ? "brand" : "neutral"}>
                                {l.curva}
                              </Badge>
                            )}
                            {l.entrou > 0 && l.vendeu === 0 && (
                              <Badge tone="down">entrou e não vendeu</Badge>
                            )}
                          </span>
                          <span className="text-[12px] text-ink-2 block break-words">
                            {l.titulo}
                          </span>
                        </span>
                      </span>
                    </th>

                    <td className="num px-3 py-3 text-right text-ink">
                      {l.entrou}
                      <span className="text-ink-3">/{l.avaliadas}</span>
                    </td>
                    <td className="num px-3 py-3 text-right">
                      {l.entrou === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <span className={l.vendeu ? "text-ink" : "text-down font-medium"}>
                          {l.vendeu}
                          <span className="text-ink-3">/{l.entrou}</span>
                        </span>
                      )}
                    </td>
                    <td className="num px-3 py-3 text-right text-ink-2">
                      {l.descontoMedio == null ? "—" : pct(l.descontoMedio, 1)}
                    </td>
                    <td className="num px-3 py-3 text-right">
                      {fora ? <span className="text-warn">{fora}</span> : <span className="text-ink-3">—</span>}
                    </td>
                  </tr>

                  {expandida &&
                    l.campanhas.map((c) => (
                      <tr key={c.nome} className="border-b border-line bg-panel-2">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-panel-2 text-left px-3 py-2
                                     border-r border-line font-normal"
                        >
                          <span className="block pl-7 text-[12.5px] text-ink">
                            {nomeCurto(c.nome)}
                          </span>
                          <span className="block pl-7 num text-[11.5px] text-ink-3">
                            {c.data.slice(8, 10)}/{c.data.slice(5, 7)} · {c.tipoCampanha}
                          </span>
                        </th>
                        <td colSpan={4} className="px-3 py-2">
                          <span className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
                            {c.entrou ? (
                              <>
                                <Badge tone="up">entrou</Badge>
                                {c.precoTabela != null && c.precoOfertado != null && (
                                  <span className="num text-ink-3">
                                    tabela {money(c.precoTabela)} → ofertado{" "}
                                    <span className="text-ink-2">{money(c.precoOfertado)}</span>
                                  </span>
                                )}
                                {c.vendeu ? (
                                  <span className="num text-ink-2">
                                    vendeu a {money(c.precoPraticado!)}
                                  </span>
                                ) : (
                                  <span className="text-ink-3">sem pedido no período</span>
                                )}
                              </>
                            ) : (
                              <>
                                <Badge tone="neutral">ficou de fora</Badge>
                                {/* O motivo vem do motor. Antes de 20/10/2026 a
                                    recusa por preço ia sem motivo nenhum. */}
                                <span className="text-ink-2 text-right">
                                  {c.motivo || "motivo não gravado nesta rodada"}
                                </span>
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtradas.length > limite && (
        <button
          onClick={() => setLimite((l) => l + 50)}
          className="w-full py-2.5 text-[12.5px] text-ink-2 hover:text-ink
                     hover:bg-panel-2 border-t border-line"
        >
          Mostrar mais {Math.min(50, filtradas.length - limite)} de {filtradas.length - limite}
        </button>
      )}

      {!filtradas.length && (
        <p className="px-4 py-8 text-center text-[13px] text-ink-3">
          Nenhum produto neste recorte.
        </p>
      )}
    </Panel>
  );
}
