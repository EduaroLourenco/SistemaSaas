"use client";

import * as React from "react";
import { PromocoesPorSku } from "@/components/promocoes/por-sku";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { FerramentasPromocoes } from "@/components/promocoes/ferramentas";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Segmented, Sheet } from "@/components/ui/controls";
import { SemFonte } from "@/components/ui/sem-fonte";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DadosPromocoes, CampanhaResumo } from "@/lib/dados/promocoes";
import { Search, Trash2, Loader2, ChevronDown } from "lucide-react";
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
  const [expandida, setExpandida] = React.useState<string | null>(null);
  const ultimas = React.useMemo(() => {
    const rodada = new Map<string, string>();
    return dados.historico.filter((h) => {
      const id = h.processamentoId ?? h.data;
      if (!rodada.has(h.campanha)) rodada.set(h.campanha, id);
      return rodada.get(h.campanha) === id;
    });
  }, [dados.historico]);

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
        <PageHeader title="Campanhas processadas" actions={<FerramentasPromocoes atual="/promocoes/campanhas" />} />
        <PageBody className="op-workspace op-promocoes-campanhas">
          <SemFonte
            titulo="Nenhuma campanha processada"
            origem="Importe uma planilha de campanha para acompanhar itens e decisões por rodada."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Campanhas processadas" actions={<FerramentasPromocoes atual="/promocoes/campanhas" />} />
      <PageBody className="op-workspace op-promocoes-campanhas promo-workspace">
        <section className="promo-overview" aria-label="Última rodada das campanhas filtradas">
          <div><strong>{count(totais.participam)}</strong><span>aprovados</span></div>
          <div><strong>{count(linhas.length)}</strong><span>campanhas</span></div>
          <div><strong>{count(totais.itens)}</strong><span>itens analisados</span></div>
        </section>
        <div className="promo-toolbar">
          <label className="promo-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar campanha</span><input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Nome da campanha" /></label>
          <Segmented options={[{value:"todas",label:"Todas"},{value:"com",label:"Com redução"},{value:"sem",label:"Sem redução"}]} value={reducao} onChange={setReducao} />
          <details className="promo-filter"><summary>Período<ChevronDown size={15} /></summary><div className="promo-filter-fields">
            <label>De<input type="date" value={de} onChange={e=>setDe(e.target.value)} /></label>
            <label>Até<input type="date" value={ate} onChange={e=>setAte(e.target.value)} /></label>
          </div></details>
        </div>
        <div className="promo-campaign-list">
          {!linhas.length && <Panel className="p-5 text-[14px] text-ink-2">Nenhuma campanha neste recorte.</Panel>}
          {linhas.map(c=>{
            const adesao=c.itens?(c.participam/c.itens)*100:0;
            const aberta=expandida===c.id;
            return <article className="promo-campaign" key={c.id}>
              <div className="promo-campaign-head">
                <div className="min-w-0"><h2>{c.nome}</h2><p>{c.temReducao?"Com redução de tarifa":"Sem redução de tarifa"}{c.ultimoProcessamento?" · "+c.ultimoProcessamento.split("-").reverse().join("/"):""}</p></div>
                <button type="button" onClick={()=>{setAApagar(c);setErro(null);}} title="Apagar esta campanha e seu histórico" aria-label={"Apagar "+c.nome+" e seu histórico"} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-r1 text-ink-3 hover:bg-panel-2 hover:text-down"><Trash2 size={16} /></button>
              </div>
              <div className="promo-campaign-summary"><dl><div><dt>Itens</dt><dd>{count(c.itens)}</dd></div><div><dt>Aprovados</dt><dd className="text-up">{count(c.participam)}</dd></div><div><dt>Fora</dt><dd>{count(c.fora)}</dd></div><div><dt>Adesão</dt><dd>{pct(adesao)}</dd></div></dl><button type="button" aria-expanded={aberta} onClick={()=>setExpandida(aberta?null:c.id)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-r1 border border-line px-3 text-[14px] hover:bg-panel-2">{aberta?"Fechar itens":"Ver itens"}<ChevronDown size={15} className={cn("transition-transform",aberta&&"rotate-180")} /></button></div>
              {aberta&&<div className="promo-campaign-items">{ultimas.filter(h=>h.campanha===c.nome).map(h=><article key={h.id}>
                <div className="promo-record-heading"><div><strong>{h.titulo||h.sku}</strong><p>{h.sku} · {h.mlb}</p></div><Badge tone={h.aprovado?"up":"neutral"}>{h.aprovado?"Aprovada":"Fora"}</Badge></div>
                <dl className="promo-prices"><div><dt>Oferta do canal</dt><dd>{h.precoOfertadoML==null?"—":money(h.precoOfertadoML)}</dd></div><div><dt>Referência</dt><dd>{h.precoTabela==null?"—":money(h.precoTabela)}</dd></div><div><dt>Piso</dt><dd>{h.precoPiso==null?"—":money(h.precoPiso)}</dd></div></dl>
                {h.motivo&&<p className="promo-record-reason">{h.motivo}</p>}
              </article>)}</div>}
            </article>;
          })}
        </div>
        <details className="promo-secondary"><summary>Sobre a aprovação registrada<ChevronDown size={15} /></summary><div>O resumo reúne a última rodada processada de cada campanha. A decisão do sistema precisa ser conferida no canal.</div></details>

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
        {/* O inverso da adesão: por produto, não por campanha. */}
        <details className="promo-reference-source"><summary><span>Participação por produto</span><ChevronDown size={16} /></summary><div><PromocoesPorSku historico={dados.historico} totalCampanhas={dados.campanhas.length} /></div></details>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Ficaram fora por pouco"
            hint="itens marcados como quase no piso, do menor para o maior"
          />
          <ul className="divide-y divide-line">
            {ultimas
              .filter((h) => !h.aprovado && h.tags.includes("quase"))
              .slice(0, 12)
              .map((h) => (
                <li key={h.id} className="px-4 py-2.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <p className="text-[14px] text-ink truncate">{h.titulo}</p>
                    <p className="num text-[12px] text-ink-3">
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
              <li className="px-4 py-6 text-center text-[14px] text-ink-3">
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
    <Sheet title="Apagar esta campanha?" onClose={onCancelar} width="520px" footer={<>
      <button onClick={onCancelar} disabled={apagando} className="h-11 rounded-r1 border border-line-2 px-4 text-[14px] text-ink-2 hover:bg-panel-2 disabled:opacity-50">Cancelar</button>
      <button onClick={onConfirmar} disabled={apagando} className="inline-flex h-11 items-center gap-2 rounded-r1 bg-down px-4 text-[14px] font-medium text-white disabled:opacity-60">{apagando && <Loader2 className="h-4 w-4 animate-spin" />}{apagando ? "Apagando" : "Apagar campanha"}</button>
    </>}>
        <div className="p-5 space-y-4">
          <p className="text-[14px] text-ink-2 break-words">{campanha.nome}</p>

          <ul className="text-[14px] text-ink-2 space-y-1">
            <li>
              <span className="num text-ink">{count(campanha.itens)}</span> linhas de
              histórico e suas ofertas
            </li>
            <li>
              a rodada de processamento, se nenhuma outra campanha depender dela
            </li>
          </ul>

          <p className="text-[12px] text-ink-3 leading-relaxed">
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

    </Sheet>
  );
}
