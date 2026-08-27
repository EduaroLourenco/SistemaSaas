"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { SemFonte } from "@/components/ui/sem-fonte";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DadosPromocoes, CampanhaResumo } from "@/lib/dados/promocoes";
import { Search, Trash2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Campanhas, montadas do que foi processado.
 *
 * O canal não exporta um identificador estável de campanha — o nome que
 * vem na planilha é a única identidade que existe. Por isso a mesma
 * campanha processada duas vezes soma na mesma linha em vez de duplicar.
 *
 * "Adesão" é a fração de itens que participaram. É o número que diz se a
 * campanha vale a pena: adesão baixa com muitos itens quase no piso
 * significa que faltou pouco, e talvez um desconto extra resolvesse.
 */

export default function Campanhas({ dados }: { dados: DadosPromocoes }) {
  const [busca, setBusca] = React.useState("");
  const [reducao, setReducao] = React.useState("todas");
  const [de, setDe] = React.useState("");
  const [ate, setAte] = React.useState("");

  /*
   * A confirmação é um passo separado, e não um `confirm()` do navegador,
   * porque o que se apaga não cabe numa frase: são as ofertas, o histórico
   * e possivelmente a rodada de processamento. Quem confirma precisa ver
   * os números antes, senão está clicando "ok" no escuro.
   */
  const [aApagar, setAApagar] = React.useState<CampanhaResumo | null>(null);
  const [apagando, setApagando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const router = useRouter();

  async function apagar(c: CampanhaResumo) {
    setApagando(true);
    setErro(null);
    try {
      const r = await fetch("/api/promocoes/limpar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campanhaId: c.id }),
      });
      // Lê como texto antes: uma página de erro da hospedagem não é JSON,
      // e `r.json()` estouraria escondendo o status que explica tudo.
      const bruto = await r.text();
      let dados: { erro?: string } = {};
      try {
        dados = JSON.parse(bruto);
      } catch {
        throw new Error(`o servidor respondeu ${r.status} sem JSON`);
      }
      if (!r.ok) throw new Error(dados.erro ?? `erro ${r.status}`);
      setAApagar(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não deu para apagar");
    } finally {
      setApagando(false);
    }
  }

  const linhas = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dados.campanhas
      .filter((c) => c.itens > 0)
      .filter((c) => {
        if (reducao === "com" && !c.temReducao) return false;
        if (reducao === "sem" && c.temReducao) return false;
        if (de && c.ultimoProcessamento && c.ultimoProcessamento < de) return false;
        if (ate && c.ultimoProcessamento && c.ultimoProcessamento > ate) return false;
        return !q || c.nome.toLowerCase().includes(q);
      })
      .sort((a, b) => b.itens - a.itens);
  }, [dados.campanhas, busca, reducao, de, ate]);

  const totais = React.useMemo(
    () =>
      linhas.reduce(
        (t, c) => ({
          itens: t.itens + c.itens,
          participam: t.participam + c.participam,
        }),
        { itens: 0, participam: 0 }
      ),
    [linhas]
  );

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Campanhas" breadcrumb="Promoções" />
        <PageBody>
          <SemFonte
            titulo="Nenhuma campanha processada"
            origem="As campanhas saem das planilhas da Central de Promoções: o nome de cada uma vem na própria planilha. Processe uma e ela aparece aqui, com quantos itens participaram e quantos ficaram de fora."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Campanhas"
        breadcrumb="Promoções"
        description="Adesão por campanha, do que foi processado"
        filters={
          <>
            <Segmented
              options={[
                { value: "todas", label: "Todas" },
                { value: "com", label: "Com redução" },
                { value: "sem", label: "Sem redução" },
              ]}
              value={reducao}
              onChange={setReducao}
            />
            <span className="flex items-center gap-1.5 shrink-0">
              <input
                type="date"
                value={de}
                onChange={(e) => setDe(e.target.value)}
                className="h-7 px-2 rounded-r1 bg-panel border border-line-2 text-[12.5px] text-ink outline-none focus:border-brand"
              />
              <span className="text-[12px] text-ink-3">até</span>
              <input
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
                className="h-7 px-2 rounded-r1 bg-panel border border-line-2 text-[12.5px] text-ink outline-none focus:border-brand"
              />
            </span>
            <span className="relative shrink-0 w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome da campanha"
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
            title="Adesão por campanha"
            hint="participam sobre itens lidos"
            action={
              <span className="num text-[12px] text-ink-2">
                {count(totais.participam)} de {count(totais.itens)}
                {totais.itens > 0 && (
                  <span className="text-ink-3">
                    {" "}
                    · {pct((totais.participam / totais.itens) * 100)}
                  </span>
                )}
              </span>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left px-3 py-2 min-w-[260px]">
                    <span className="label">Campanha</span>
                  </th>
                  <th className="text-right px-3 py-2"><span className="label">Itens</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Participam</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Fora</span></th>
                  <th className="text-right px-3 py-2 min-w-[150px]">
                    <span className="label">Adesão</span>
                  </th>
                  <th className="text-right px-3 py-2"><span className="label">Processada em</span></th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((c) => {
                  const adesao = c.itens ? (c.participam / c.itens) * 100 : 0;
                  return (
                    <tr key={c.id} className="border-b border-line hover:bg-panel-2">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[12.5px] font-medium text-ink truncate">
                            {c.nome}
                          </span>
                          <Badge tone={c.temReducao ? "brand" : "neutral"}>
                            {c.temReducao ? "com redução" : "sem redução"}
                          </Badge>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right num text-ink-2">{count(c.itens)}</td>
                      <td className="px-3 py-2 text-right num text-up font-medium">
                        {count(c.participam)}
                      </td>
                      <td className="px-3 py-2 text-right num text-ink-2">{count(c.fora)}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center justify-end gap-2">
                          <span className="hidden lg:block w-20 h-1.5 rounded-full bg-panel-3 overflow-hidden">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${adesao}%`,
                                background:
                                  adesao >= 70
                                    ? "var(--up)"
                                    : adesao >= 40
                                      ? "var(--warn)"
                                      : "var(--down)",
                              }}
                            />
                          </span>
                          <span
                            className={cn(
                              "num text-[12px]",
                              adesao >= 70 ? "text-up" : adesao >= 40 ? "text-warn" : "text-down"
                            )}
                          >
                            {pct(adesao)}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right num text-[12px] text-ink-3">
                        {c.ultimoProcessamento
                          ? c.ultimoProcessamento.split("-").reverse().join("/")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => { setAApagar(c); setErro(null); }}
                          title="Apagar esta campanha e seu histórico"
                          className="p-1 rounded-r1 text-ink-3 hover:text-down hover:bg-panel-3"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {aApagar && (
          <ConfirmarApagar
            campanha={aApagar}
            apagando={apagando}
            erro={erro}
            onCancelar={() => setAApagar(null)}
            onConfirmar={() => apagar(aApagar)}
          />
        )}

        {/*
          Itens que ficaram de fora por pouco. É a lista acionável da tela:
          adesão baixa com muitos itens "quase" significa que faltou pouco,
          e um desconto extra na próxima rodada resolveria.
        */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Ficaram fora por pouco"
            hint="itens marcados como quase no piso, do menor para o maior"
          />
          <ul className="divide-y divide-line">
            {dados.historico
              .filter((h) => !h.aprovado && h.tags.includes("quase"))
              .slice(0, 12)
              .map((h) => (
                <li key={h.id} className="px-4 py-2.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <p className="text-[12.5px] text-ink truncate">{h.titulo}</p>
                    <p className="num text-[11px] text-ink-3">
                      {h.sku} · {h.mlb} · {h.campanha}
                    </p>
                  </span>
                  <span className="num text-[12px] text-ink-2 shrink-0 text-right">
                    <span className="block">
                      ofertado {h.precoOfertadoML != null ? money(h.precoOfertadoML) : "—"}
                    </span>
                    <span className="block text-ink-3">
                      piso {h.precoPiso != null ? money(h.precoPiso) : "—"}
                    </span>
                  </span>
                </li>
              ))}
            {!dados.historico.some((h) => !h.aprovado && h.tags.includes("quase")) && (
              <li className="px-4 py-6 text-center text-[13px] text-ink-3">
                Nenhum item ficou de fora por pouco nas rodadas processadas.
              </li>
            )}
          </ul>
        </Panel>
      </PageBody>
    </>
  );
}

/* ───────────────────────────────────────────────────────────── */

/**
 * Confirmação de exclusão.
 *
 * Mostra os números antes de perguntar. "Tem certeza?" sem dizer o que
 * sai é uma pergunta que não dá para responder — e aqui o que sai são
 * três coisas diferentes: as ofertas, as linhas de histórico e, quando
 * ninguém mais depende dela, a rodada de processamento.
 *
 * O nome da campanha vem inteiro, com o período. Duas campanhas do mesmo
 * arquivo em datas diferentes só se distinguem por ele.
 */
function ConfirmarApagar({
  campanha,
  apagando,
  erro,
  onCancelar,
  onConfirmar,
}: {
  campanha: CampanhaResumo;
  apagando: boolean;
  erro: string | null;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancelar}
    >
      <div
        className="w-full max-w-md rounded-r2 bg-panel border border-line shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-line">
          <p className="text-[13px] font-semibold text-ink">Apagar esta campanha?</p>
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="text-[12.5px] text-ink-2 break-words">{campanha.nome}</p>

          <ul className="text-[12.5px] text-ink-2 space-y-1">
            <li>
              <span className="num text-ink">{count(campanha.itens)}</span> linhas de
              histórico e suas ofertas
            </li>
            <li>
              a rodada de processamento, se nenhuma outra campanha depender dela
            </li>
          </ul>

          <p className="text-[11.5px] text-ink-3 leading-relaxed">
            Não tem como desfazer. Para recuperar, processe a planilha de novo — e
            é exatamente para isso que este botão existe: voltar ao ponto de
            partida antes de reanalisar.
          </p>

          {erro && (
            <p className="text-[12px] text-down bg-down-wash rounded-r1 px-2.5 py-2">
              {erro}
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-line flex justify-end gap-2">
          <button
            onClick={onCancelar}
            disabled={apagando}
            className="h-7 px-3 rounded-r1 border border-line-2 text-[12.5px] text-ink-2
                       hover:bg-panel-2 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={apagando}
            className="h-7 px-3 rounded-r1 bg-down text-white text-[12.5px] font-medium
                       inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {apagando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {apagando ? "Apagando" : "Apagar"}
          </button>
        </div>
      </div>
    </div>
  );
}
