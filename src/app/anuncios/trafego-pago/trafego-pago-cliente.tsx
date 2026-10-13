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
import type { DadosTrafegoPago, LinhaAnuncioAds } from "@/lib/dados/trafego-pago";

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

type Aba = "anuncios" | "campanhas" | "desperdicio";

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
  const [ordem, setOrdem] = React.useState<"investimento" | "acos" | "receitaReal" | "cliques">("investimento");
  const { totais, periodos, campanhas, linhas, conferencia } = dados;
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
    ).sort((a,b) => (b[ordem] ?? -Infinity) - (a[ordem] ?? -Infinity));
  }, [linhas, busca, situacao, ordem]);

  const semRetorno = linhas.filter((l) => l.situacao === "sem_retorno");
  const semAds = linhas.filter((l) => l.situacao === "vendeu_sem_ads");
  const prejuizo = linhas.filter((l) => l.situacao === "prejuizo");

  const th = "px-2.5 py-2 text-[12px] font-semibold text-ink-3 whitespace-nowrap";
  const td = "px-2.5 py-2 border-b border-line";

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
                  placeholder="Buscar MLB, SKU, título ou campanha"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="max-w-sm"
                />
                <select aria-label="Situação dos anúncios" value={situacao} onChange={(e)=>setSituacao(e.target.value)} className="min-h-10 max-w-full rounded-r1 border border-line bg-panel px-2 text-sm"><option value="">Todas as situações</option><option value="sem_retorno">Gasto sem venda</option><option value="vendeu_sem_ads">Vendas sem atribuição</option><option value="prejuizo">Mídia maior que a margem</option></select>
                <select aria-label="Ordenar anúncios" value={ordem} onChange={(e)=>setOrdem(e.target.value as typeof ordem)} className="min-h-10 max-w-full rounded-r1 border border-line bg-panel px-2 text-sm"><option value="investimento">Maior investimento</option><option value="acos">Maior ACoS</option><option value="receitaReal">Maior faturamento</option><option value="cliques">Mais cliques</option></select>
              </div>
              <div className="overflow-x-auto max-h-[620px]">
                <table className="w-full border-collapse min-w-[980px]">
                  <thead className="bg-panel-2 sticky top-0 z-10">
                    <tr>
                      <th className={`${th} text-left`}>Anúncio</th>
                      <th className={`${th} text-right`}>Investido</th>
                      <th className={`${th} text-right`}>Cliques</th>
                      <th className={`${th} text-right`}>CPC</th>
                      <th className={`${th} text-right`}>Receita ads</th>
                      <th className={`${th} text-right`}>ACOS</th>
                      <th className={`${th} text-right`}>Faturou</th>
                      <th className={`${th} text-right`}>Margem</th>
                      <th className={`${th} text-right`}>Sobra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.slice(0, 300).map((l, i) => {
                      const s = SITUACAO[l.situacao];
                      return (
                        <tr key={`${l.mlb}-${i}`} className="hover:bg-panel-2/50">
                          <td className={td}>
                            <div className="flex items-center gap-1.5">
                              <span className="num text-[12.5px] text-ink font-medium">
                                {l.sku || l.mlb}
                              </span>
                              {l.tipo === "premium" && (
                                <Badge tone="neutral">premium</Badge>
                              )}
                              {s && <Badge tone={s.tom}>{s.rotulo}</Badge>}
                            </div>
                            <p className="text-[11px] text-ink-3">{l.conta}</p>
                            <p className="text-[12px] text-ink-3 truncate max-w-[260px]">
                              {l.campanhas.join(" · ")}
                            </p>
                          </td>
                          <td className={`${td} text-right num text-[12.5px] text-ink`}>
                            {money(l.investimento)}
                          </td>
                          <td className={`${td} text-right num text-[12.5px] text-ink-3`}>
                            {count(l.cliques)}
                          </td>
                          <td className={`${td} text-right num text-[12.5px] text-ink-3`}>
                            {l.cpc != null ? money(l.cpc) : "—"}
                          </td>
                          <td className={`${td} text-right num text-[12.5px] text-ink-2`}>
                            {l.receitaAtribuida > 0 ? moneyShort(l.receitaAtribuida) : "—"}
                          </td>
                          <td className={`${td} text-right`}>
                            {l.acos != null ? (
                              <span
                                className={`num text-[12.5px] font-medium ${
                                  l.margemPct != null && l.acos > l.margemPct
                                    ? "text-down"
                                    : "text-ink-2"
                                }`}
                              >
                                {pct(l.acos, 1)}
                              </span>
                            ) : (
                              <span className="text-[12px] text-ink-3">—</span>
                            )}
                          </td>
                          <td className={`${td} text-right num text-[12.5px] text-ink-2`}>
                            {l.receitaReal > 0 ? moneyShort(l.receitaReal) : "—"}
                          </td>
                          <td className={`${td} text-right`}>
                            {l.margem != null ? (
                              <div className="flex flex-col items-end leading-tight">
                                <span className="num text-[12.5px] text-ink">
                                  {moneyShort(l.margem)}
                                </span>
                                <span className="num text-[12px] text-ink-3">
                                  {pct(l.margemPct ?? 0, 1)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[12px] text-ink-3">sem custo</span>
                            )}
                          </td>
                          <td className={`${td} text-right`}>
                            {l.sobraAposMidia != null ? (
                              <span
                                className={`num text-[13px] font-semibold ${
                                  l.sobraAposMidia >= 0 ? "text-up" : "text-down"
                                }`}
                              >
                                {moneyShort(l.sobraAposMidia)}
                              </span>
                            ) : (
                              <span className="text-[12px] text-ink-3">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {visiveis.length > 300 && (
                <p className="px-3 py-2 text-[12px] text-ink-3 border-t border-line">
                  Mostrando os 300 de maior investimento. Use a busca para o resto.
                </p>
              )}
            </>
          )}

          {aba === "campanhas" && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[820px]">
                <thead className="bg-panel-2">
                  <tr>
                    <th className={`${th} text-left`}>Campanha</th>
                    <th className={`${th} text-right`}>Anúncios</th>
                    <th className={`${th} text-right`}>Investido</th>
                    <th className={`${th} text-right`}>Cliques</th>
                    <th className={`${th} text-right`}>Receita ads</th>
                    <th className={`${th} text-right`}>ACOS</th>
                    <th className={`${th} text-right`}>Margem</th>
                    <th className={`${th} text-right`}>Sobra</th>
                  </tr>
                </thead>
                <tbody>
                  {campanhas.map((c, i) => (
                    <tr key={`${c.campanha}-${i}`} className="hover:bg-panel-2/50">
                      <td className={`${td} text-[12.5px] text-ink`}>{c.campanha}<p className="mt-0.5 text-[11px] text-ink-3">{c.conta}</p></td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-3`}>
                        {count(c.anuncios)}
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink`}>
                        {money(c.investimento)}
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-3`}>
                        {count(c.cliques)}
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-2`}>
                        {c.receitaAtribuida > 0 ? moneyShort(c.receitaAtribuida) : "—"}
                      </td>
                      <td className={`${td} text-right`}>
                        {c.acos != null ? (
                          <span
                            className={`num text-[12.5px] font-medium ${
                              c.acos > 15 ? "text-down" : "text-ink-2"
                            }`}
                          >
                            {pct(c.acos, 1)}
                          </span>
                        ) : (
                          <Badge tone="down">nada vendeu</Badge>
                        )}
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-2`}>
                        {c.margem != null ? moneyShort(c.margem) : "—"}
                      </td>
                      <td className={`${td} text-right`}>
                        {c.sobraAposMidia != null ? (
                          <span
                            className={`num text-[13px] font-semibold ${
                              c.sobraAposMidia >= 0 ? "text-up" : "text-down"
                            }`}
                          >
                            {moneyShort(c.sobraAposMidia)}
                          </span>
                        ) : (
                          <span className="text-[12px] text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {aba === "desperdicio" && (
            <div className="p-4 space-y-5">
              {[
                {
                  chave: "sem_retorno" as const,
                  lista: semRetorno,
                  titulo: "Não vendeu nem com ads, nem sozinho",
                  nota: "Confira gasto, cliques, oferta e tempo de campanha antes de decidir pela pausa.",
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
                            </span>
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
