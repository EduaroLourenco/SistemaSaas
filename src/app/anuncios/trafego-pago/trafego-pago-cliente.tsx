"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarraFiltros, Filtro } from "@/components/layout/barra-filtros";
import { SeletorCanais } from "@/components/ui/seletor-canais";
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
  vendeu_sem_ads: { rotulo: "vendeu sem o ads", tom: "warn" },
};

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default function TrafegoPagoCliente({ dados }: { dados: DadosTrafegoPago }) {
  const [aba, setAba] = React.useState<Aba>("anuncios");
  const [busca, setBusca] = React.useState("");
  const { totais, periodos, campanhas, linhas, conferencia } = dados;
  const router = useRouter();

  /* Canal e janela andam juntos na URL: trocar de conta pode mudar quais
     relatórios existem, e perder a janela escolhida é melhor que mostrar
     uma que aquela conta não tem. */
  /* O total da série é da JANELA DO CALENDÁRIO, e não da janela de
     relatório — por isso não sai de , que é do relatório. */
  const serieTotais = React.useMemo(
    () =>
      dados.serie.reduce(
        (a, d) => ({ investimento: a.investimento + d.investimento, receita: a.receita + d.receita }),
        { investimento: 0, receita: 0 }
      ),
    [dados.serie]
  );

  const navegar = (mudar: { canais?: string; janela?: string; de?: string; ate?: string }) => {
    const q = new URLSearchParams();
    const canais = mudar.canais ?? dados.recorte;
    if (canais) q.set("canais", canais);
    if (mudar.janela) q.set("janela", mudar.janela);
    const de = mudar.de ?? dados.periodo.de;
    const ate = mudar.ate ?? dados.periodo.ate;
    if (de) q.set("de", de);
    if (ate) q.set("ate", ate);
    router.push(`/anuncios/trafego-pago?${q}`);
  };

  const visiveis = React.useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return linhas;
    return linhas.filter(
      (l) =>
        l.mlb.toLowerCase().includes(t) ||
        l.sku.toLowerCase().includes(t) ||
        l.titulo.toLowerCase().includes(t) ||
        l.campanhas.some((c) => c.toLowerCase().includes(t))
    );
  }, [linhas, busca]);

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
        description="A mídia contra a margem que ela produz"
        badge={<Badge tone="neutral">Mercado Livre</Badge>}
        filters={
          <BarraFiltros>
            <Filtro rotulo="Canais" composto>
              <SeletorCanais
                grupos={dados.opcoes}
                selecionados={dados.recorte ? [dados.recorte] : []}
                aoAplicar={(sel) => navegar({ canais: sel[0] ?? "", janela: undefined })}
              />
            </Filtro>
            <Filtro rotulo="De">
              <input
                type="date"
                value={dados.periodo.de}
                onChange={(e) => e.target.value && navegar({ de: e.target.value })}
                className="h-10 rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink"
              />
            </Filtro>
            <Filtro rotulo="Até">
              <input
                type="date"
                value={dados.periodo.ate}
                onChange={(e) => e.target.value && navegar({ ate: e.target.value })}
                className="h-10 rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink"
              />
            </Filtro>
          </BarraFiltros>
        }
      />

      <PageBody>
        {/* ── O gasto dia a dia, no período do calendário ──
            Esta é a única parte que aceita qualquer intervalo: a rotina
            noturna pergunta ao canal o número de CADA dia. A tabela por
            anúncio, mais abaixo, segue presa aos relatórios. */}
        {dados.serie.length > 0 && (
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
                          <p className="num">mídia {money(d.investimento)}</p>
                          <p className="num">faturamento {money(d.receita)}</p>
                          {tacos != null && <p className="num">TACoS {pct(tacos, 1)}</p>}
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
              Barras = mídia do dia · linha = faturamento do dia. O calendário move só este bloco; a
              tabela por anúncio depende do relatório escolhido abaixo.
            </p>
          </Panel>
        )}

        {/* ── Qual relatório está sendo lido ──
            Um por vez, e não a soma: os relatórios do canal se sobrepõem
            (agosto aparece em sete janelas), e somá-los contava o mesmo
            gasto várias vezes. */}
        <Panel className="p-4">
          <p className="label mb-2">Relatório do canal</p>
          <div className="flex flex-wrap gap-1.5">
            {periodos.map((p) => {
              const chave = `${p.inicio}|${p.fim}`;
              const atual = chave === dados.janela;
              return (
                <Link
                  key={chave}
                  href={`/anuncios/trafego-pago?${new URLSearchParams({ ...(dados.recorte ? { canais: dados.recorte } : {}), janela: chave })}`}
                  scroll={false}
                  className={cn(
                    "rounded-r1 border px-2.5 py-1.5 text-[12px] transition-colors",
                    atual
                      ? "border-brand bg-brand text-brand-ink font-semibold"
                      : "border-line-2 bg-panel text-ink-2 hover:bg-panel-3"
                  )}
                >
                  {p.rotulo}
                  <span className="num ml-1.5 opacity-70">{moneyShort(p.investimento)}</span>
                </Link>
              );
            })}
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
            Cada botão é um relatório que o canal exportou, com o seu próprio intervalo. Eles se
            sobrepõem — o acumulado é reexportado a cada pedido —, então a tela lê{" "}
            <strong>um por vez</strong>. Somar todos contaria o mesmo gasto duas, três, sete vezes.
          </p>
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
            ajuda="o que o canal mostra"
          />
          <Numero
            rotulo="Faturamento da conta"
            valor={moneyShort(totais.receitaTotalConta)}
            ajuda="base do TACoS"
          />
        </div>

        <Disclosure title="ACoS, TACoS e ROAS — qual decide o quê">
          <p>
            <strong>ACoS</strong> é mídia ÷ receita que o canal <em>atribui</em> à mídia. Mede se a
            campanha é eficiente, e é o número que engana sozinho: 14% parece ótimo até se descobrir
            que a margem daquele anúncio é 13,8%. O teto do ACoS é a margem bruta do produto — acima
            dela, cada venda que a mídia traz custa dinheiro.
          </p>
          <p className="mt-2">
            <strong>ROAS</strong> é o inverso do ACoS (ACoS de 10% = ROAS 10). É a métrica que o
            painel do canal passou a destacar. Não traz informação nova.
          </p>
          <p className="mt-2">
            <strong>TACoS</strong> é mídia ÷ faturamento <em>total</em> da conta, orgânico incluído.
            É o número de decidir escalar ou parar, e o painel do canal não mostra. A leitura que
            importa: TACoS subindo com faturamento total parado é{" "}
            <strong>canibalização</strong> — a mídia está comprando a venda que já era orgânica.
            TACoS caindo com faturamento subindo é o que se quer.
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
                {moneyShort(totais.receitaReal)} que esses anúncios faturaram de
                verdade.
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

        {/* ── Conferência do lançamento manual ── */}
        {conferencia.some((c) => Math.abs(c.relatorio - c.lancado) > 1) && (
          <Panel className="px-4 py-3 mb-3 flex items-start gap-2.5 border-warn/30">
            <AlertCircle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[13px] text-ink mb-1">
                O investimento lançado à mão não bate com o relatório
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {conferencia.map((c) => {
                  const dif = c.relatorio - c.lancado;
                  return (
                    <span key={c.mes} className="text-[12px] text-ink-2">
                      <span className="num">{c.mes}</span>{" "}
                      <span className="num">{moneyShort(c.relatorio)}</span> vs{" "}
                      <span className="num">{moneyShort(c.lancado)}</span>
                      {Math.abs(dif) > 1 && (
                        <span
                          className={`num ml-1 ${dif < 0 ? "text-down" : "text-up"}`}
                        >
                          ({dif > 0 ? "+" : ""}
                          {moneyShort(dif)})
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
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
              <div className="p-3 border-b border-line">
                <Input
                  placeholder="Buscar MLB, SKU, título ou campanha"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="max-w-sm"
                />
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
                      <td className={`${td} text-[12.5px] text-ink`}>{c.campanha}</td>
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
                  nota: "Nenhuma venda no período inteiro. É o candidato natural a desligar.",
                },
                {
                  chave: "vendeu_sem_ads" as const,
                  lista: semAds,
                  titulo: "Vendeu bem, mas nada foi atribuído ao ads",
                  nota: "O anúncio faturou; a mídia não recebeu crédito por isso. Vale testar sem ela.",
                },
                {
                  chave: "prejuizo" as const,
                  lista: prejuizo,
                  titulo: "A mídia custou mais que a margem",
                  nota: "Cada venda que o ads traz aqui sai no vermelho.",
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
