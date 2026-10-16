"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS, GRID } from "@/components/ui/chart";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { BarraFiltros, Filtro, FiltroDivisor } from "@/components/layout/barra-filtros";
import { Panel, PanelHeader, Badge, Button, Delta } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { linkDoAnuncio } from "@/lib/links";
import { money, moneyShort, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, TriangleAlert, Flame, Snowflake, Minus } from "lucide-react";
import type { DadosTermometro, DiaTermometro } from "@/lib/dados/termometro";

/**
 * Termômetro do Mercado Livre.
 *
 * ── O que a tela é ──
 *
 * O painel que se abre de manhã. Uma leitura só no alto — a semana está
 * mais quente ou mais fria que a passada —, e abaixo dela o detalhe que
 * sustenta essa leitura: o dia a dia das duas semanas lado a lado, os
 * números do ritmo, a reputação das contas, o que está no ar e o que
 * precisa de olho hoje.
 *
 * ── Por que a comparação é com a semana anterior, e não com a meta ──
 *
 * Meta é mês; operação é dia. Quem olha de manhã quer saber se o que fez
 * ontem está funcionando, e a referência mais honesta para isso é o mesmo
 * dia da semana passada: sábado não se parece com terça, e nenhuma média
 * mensal responde "a terça foi boa?".
 */

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const varPct = (agora: number | null, antes: number | null) =>
  agora != null && antes != null && antes !== 0 ? ((agora - antes) / Math.abs(antes)) * 100 : undefined;

/** O rótulo do nível de reputação do canal, em português. */
const NIVEL: Record<string, { rotulo: string; tom: "up" | "down" | "warn" | "neutral" | "brand" }> = {
  "5_green": { rotulo: "Verde", tom: "up" },
  "4_light_green": { rotulo: "Verde claro", tom: "up" },
  "3_yellow": { rotulo: "Amarelo", tom: "warn" },
  "2_orange": { rotulo: "Laranja", tom: "warn" },
  "1_red": { rotulo: "Vermelho", tom: "down" },
};

/**
 * A faixa do termômetro.
 *
 * Os cortes não são redondos por estética: ±8% é a banda em que a variação
 * de uma semana de poucos pedidos é ruído — com 12 pedidos na semana, um
 * pedido a mais já move 8%. Fora dela, o movimento é grande o bastante para
 * merecer ação.
 */
function leitura(v: number | undefined) {
  if (v == null) return { rotulo: "Sem base", tom: "neutral" as const, Icone: Minus, cor: "var(--ink-3)" };
  if (v >= 25) return { rotulo: "Muito acima", tom: "up" as const, Icone: Flame, cor: "var(--up)" };
  if (v >= 8) return { rotulo: "Acima", tom: "up" as const, Icone: Flame, cor: "var(--up)" };
  if (v > -8) return { rotulo: "No mesmo ritmo", tom: "neutral" as const, Icone: Minus, cor: "var(--ink-2)" };
  if (v > -25) return { rotulo: "Abaixo", tom: "warn" as const, Icone: Snowflake, cor: "var(--warn)" };
  return { rotulo: "Muito abaixo", tom: "down" as const, Icone: Snowflake, cor: "var(--down)" };
}

export default function TermometroCliente({ dados }: { dados: DadosTermometro }) {
  const router = useRouter();
  const [metrica, setMetrica] = React.useState<"receita" | "unidades" | "visitas">("receita");
  const [diaAberto, setDiaAberto] = React.useState<string | null>(null);

  function navegar(mudar: { conta?: string; semana?: string }) {
    const q = new URLSearchParams();
    const conta = mudar.conta ?? dados.contaSelecionada;
    const semana = mudar.semana ?? dados.semana.inicio;
    if (conta) q.set("conta", conta);
    if (semana) q.set("semana", semana);
    router.push(`/mercado-livre${q.size ? `?${q}` : ""}`, { scroll: false });
  }
  const somarSemana = (passo: number) => {
    const d = new Date(Date.parse(dados.semana.inicio + "T12:00:00Z") + passo * 7 * 86400000);
    return d.toISOString().slice(0, 10);
  };

  const r = dados.ritmo;
  const varReceita = varPct(r.receita, r.receitaAnterior);
  const l = leitura(varReceita);

  /*
   * O gráfico põe a semana corrente em BARRA e a anterior em LINHA.
   *
   * Duas barras lado a lado dobram a largura e, no celular, viram sete
   * pares ilegíveis. A linha atrás da barra deixa a comparação imediata e
   * cabe em 360px.
   */
  const serie = dados.dias.map((d, i) => ({
    dia: DIAS[d.diaSemana],
    data: d.data,
    atual: metrica === "receita" ? d.receita : metrica === "unidades" ? d.unidades : d.visitas ?? 0,
    anterior:
      metrica === "receita"
        ? dados.diasAnteriores[i]?.receita ?? 0
        : metrica === "unidades"
          ? dados.diasAnteriores[i]?.unidades ?? 0
          : dados.diasAnteriores[i]?.visitas ?? 0,
    futuro: d.data > dados.hoje,
    parcial: d.data === dados.hoje && dados.parcial,
  }));
  const formatar = (v: number) => (metrica === "receita" ? moneyShort(v) : count(v));

  const detalhe = diaAberto ? dados.dias.find((d) => d.data === diaAberto) : null;

  if (dados.vazio && !dados.contas.length) {
    return (
      <>
        <PageHeader title="Termômetro" breadcrumb="Mercado Livre" description="A leitura operacional do dia." />
        <PageBody>
          <Panel>
            <PanelHeader
              title="Nenhuma conta do Mercado Livre nesta empresa"
              hint="Conecte a conta em Integrações para o termômetro começar a medir."
            />
          </Panel>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Termômetro"
        breadcrumb="Mercado Livre"
        description={`Semana de ${dataBr(dados.semana.inicio)} a ${dataBr(dados.semana.fim)} contra ${dataBr(dados.semanaAnterior.inicio)} a ${dataBr(dados.semanaAnterior.fim)} · ${dados.diasCorridos} ${dados.diasCorridos === 1 ? "dia completo" : "dias completos"}`}
        filters={
          <BarraFiltros>
            <Filtro rotulo="Conta">
              <select
                aria-label="Conta do Mercado Livre"
                value={dados.contaSelecionada}
                onChange={(e) => navegar({ conta: e.target.value })}
                className="h-10 w-[230px] max-w-full rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink"
              >
                <option value="">Todas as contas</option>
                {dados.contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Filtro>
            <FiltroDivisor />
            <Filtro rotulo="Semana">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Semana anterior"
                  onClick={() => navegar({ semana: somarSemana(-1) })}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-r1 border border-line bg-panel text-ink-2 hover:bg-panel-3"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="num px-2 text-[13px] text-ink-2 whitespace-nowrap">
                  {dataBr(dados.semana.inicio)} – {dataBr(dados.semana.fim)}
                </span>
                <button
                  type="button"
                  aria-label="Semana seguinte"
                  disabled={dados.semana.fim >= dados.hoje}
                  onClick={() => navegar({ semana: somarSemana(1) })}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-r1 border border-line bg-panel text-ink-2 hover:bg-panel-3 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </Filtro>
          </BarraFiltros>
        }
      />
      <PageBody>
        {/* ── O termômetro ───────────────────────────────────────── */}
        <Panel className="overflow-hidden">
          <div className="grid gap-0 md:grid-cols-[minmax(0,300px)_1fr]">
            <div className="flex flex-col justify-center gap-2 border-b border-line p-5 md:border-b-0 md:border-r">
              <span className="label">Ritmo da semana</span>
              <div className="flex items-center gap-3">
                <l.Icone className="w-8 h-8 shrink-0" strokeWidth={1.75} style={{ color: l.cor }} />
                <div className="min-w-0">
                  <p className="num text-[30px] font-bold leading-none text-ink">
                    {varReceita == null ? "—" : `${varReceita > 0 ? "+" : ""}${Math.round(varReceita)}%`}
                  </p>
                  <Badge tone={l.tom}>{l.rotulo}</Badge>
                </div>
              </div>
              <p className="text-[12.5px] text-ink-2">
                {money(r.receita)} contra {money(r.receitaAnterior)} nos mesmos{" "}
                {dados.diasCorridos === 1 ? "1 dia" : `${dados.diasCorridos} dias`} da semana anterior.
              </p>
              {dados.parcial && (
                <p className="text-[12px] text-ink-3">
                  Hoje ({dataBr(dados.hoje)}) fica fora da conta: o dia não terminou.
                </p>
              )}
            </div>

            {/* A barra do termômetro: escala de -50% a +50%, com o zero no meio. */}
            <div className="p-5 flex flex-col justify-center gap-4">
              <div>
                <div className="relative h-7 rounded-full overflow-hidden" style={{ background: "linear-gradient(90deg, var(--down) 0%, var(--warn) 30%, var(--panel-3) 50%, var(--up) 100%)" }}>
                  <div
                    className="absolute top-0 bottom-0 w-[3px] bg-ink rounded-full"
                    style={{ left: `${Math.min(99, Math.max(1, 50 + (varReceita ?? 0) / 2))}%` }}
                    aria-hidden
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-ink-3 num">
                  <span>−50%</span>
                  <span>igual</span>
                  <span>+50%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Pedidos", valor: count(r.pedidos), d: varPct(r.pedidos, r.pedidosAnterior), antes: count(r.pedidosAnterior) },
                  { label: "Unidades", valor: count(r.unidades), d: varPct(r.unidades, r.unidadesAnterior), antes: count(r.unidadesAnterior) },
                  { label: "Visitas", valor: r.visitas == null ? "—" : count(r.visitas), d: varPct(r.visitas, r.visitasAnterior), antes: r.visitasAnterior == null ? "—" : count(r.visitasAnterior) },
                  { label: "Conversão", valor: r.conversao == null ? "—" : pct(r.conversao, 2), d: varPct(r.conversao, r.conversaoAnterior), antes: r.conversaoAnterior == null ? "—" : pct(r.conversaoAnterior, 2) },
                ].map((x) => (
                  <div key={x.label} className="min-w-0">
                    <p className="label">{x.label}</p>
                    <p className="num text-[18px] font-semibold text-ink leading-tight">{x.valor}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {x.d !== undefined && <Delta value={x.d} />}
                      <span className="num text-[11.5px] text-ink-3">era {x.antes}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        {/* ── Dia a dia ──────────────────────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Dia a dia, contra a mesma semana anterior"
            hint="A barra é esta semana; a linha é a anterior. Clique no dia para abrir os números dele."
            action={
              <div className="flex gap-1">
                {([
                  ["receita", "Receita"],
                  ["unidades", "Unidades"],
                  ["visitas", "Visitas"],
                ] as const).map(([v, rot]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMetrica(v)}
                    className={cn(
                      "min-h-9 rounded-r1 border px-2.5 text-[12px] font-medium transition-colors",
                      metrica === v ? "border-brand bg-brand text-brand-ink" : "border-line-2 bg-panel text-ink-2 hover:bg-panel-3"
                    )}
                  >
                    {rot}
                  </button>
                ))}
              </div>
            }
          />
          <div className="h-[260px] px-2 pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} onClick={(e) => {
                  /* O tipo do recharts não expõe activePayload no clique, mas ele
                     vem no evento — é como se descobre em qual barra clicou. */
                  const p = (e as unknown as { activePayload?: { payload?: { data?: string } }[] }).activePayload;
                  setDiaAberto(p?.[0]?.payload?.data ?? null);
                }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="dia" {...AXIS} />
                <YAxis {...AXIS} tickFormatter={formatar} width={54} />
                <Tooltip
                  formatter={(v, nome) => [formatar(Number(v) || 0), nome === "atual" ? "esta semana" : "semana anterior"]}
                  labelFormatter={(_, p) => {
                    const d = (p?.[0]?.payload as { data?: string })?.data;
                    return d ? dataBr(d) : "";
                  }}
                  contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="atual" name="atual" fill="var(--s1)" radius={[4, 4, 0, 0]} maxBarSize={44} cursor="pointer" />
                <Line dataKey="anterior" name="anterior" stroke="var(--ink-3)" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-7 gap-1 border-t border-line p-2">
            {dados.dias.map((d) => (
              <button
                key={d.data}
                type="button"
                onClick={() => setDiaAberto(d.data === diaAberto ? null : d.data)}
                className={cn(
                  "rounded-r1 px-1 py-1.5 text-center transition-colors",
                  d.data === diaAberto ? "bg-brand-wash" : "hover:bg-panel-2",
                  d.data > dados.hoje && "opacity-40"
                )}
              >
                <span className="block text-[11px] text-ink-3">{DIAS[d.diaSemana]}</span>
                <span className="num block text-[11.5px] text-ink">{d.data > dados.hoje ? "—" : moneyShort(d.receita)}</span>
                {d.anterior && d.data <= dados.hoje && (
                  <span className={cn("num block text-[10.5px]", d.receita >= d.anterior.receita ? "text-up" : "text-down")}>
                    {d.anterior.receita > 0 ? `${d.receita >= d.anterior.receita ? "+" : ""}${Math.round(((d.receita - d.anterior.receita) / d.anterior.receita) * 100)}%` : "novo"}
                  </span>
                )}
              </button>
            ))}
          </div>
          {detalhe && <DetalheDoDia dia={detalhe} />}
        </Panel>

        {/* ── Hoje, mídia e ticket ───────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label={dados.parcial ? `Hoje (${dataBr(dados.hoje)}) · parcial` : `Último dia (${dataBr(dados.hoje)})`}
            value={money(dados.dia?.receita ?? 0)}
            hint={`${count(dados.dia?.pedidos ?? 0)} pedidos · ${count(dados.dia?.unidades ?? 0)} unidades`}
            delta={varPct(dados.dia?.receita ?? 0, dados.dia?.anterior?.receita ?? null)}
            ajuda="Comparado com o MESMO dia da semana passada, não com ontem: sábado não se parece com terça."
          />
          <StatTile
            label="Ticket médio da semana"
            value={r.ticket == null ? "—" : money(r.ticket)}
            delta={varPct(r.ticket, r.ticketAnterior)}
            hint={r.ticketAnterior == null ? undefined : `era ${money(r.ticketAnterior)}`}
          />
          <StatTile
            label="Mídia na semana"
            value={money(r.investimento)}
            delta={varPct(r.investimento, r.investimentoAnterior)}
            inverse
            hint={r.investimentoAnterior ? `era ${money(r.investimentoAnterior)}` : undefined}
            ajuda="Investimento em Product Ads nos dias completos da semana. Subir não é ruim por si: compare com a receita."
          />
          <StatTile
            label="Visitas por pedido"
            value={r.visitas && r.pedidos ? count(Math.round(r.visitas / r.pedidos)) : "—"}
            hint={r.visitasAnterior && r.pedidosAnterior ? `era ${count(Math.round(r.visitasAnterior / r.pedidosAnterior))}` : undefined}
            inverse
            ajuda="Quantas visitas o canal entrega por pedido fechado. Subir significa que está custando mais tráfego para vender o mesmo."
          />
        </div>

        {/* ── Reputação ──────────────────────────────────────────── */}
        <Panel>
          <PanelHeader
            title="Reputação das contas"
            hint={`As mesmas taxas que o canal usa para classificar a conta. Leitura de ${dados.frescor.reputacao ? dataBr(dados.frescor.reputacao) : "—"}.`}
          />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {dados.reputacao.length === 0 && (
              <p className="text-[13px] text-ink-3">Nenhuma leitura de reputação ainda. Ela vem na sincronização do canal.</p>
            )}
            {dados.reputacao.map((rep) => {
              const nivel = rep.nivel ? NIVEL[rep.nivel] : null;
              return (
                <div key={rep.conta} className="panel panel-1 p-4 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold text-ink">{rep.conta}</p>
                    <div className="flex items-center gap-1.5">
                      {nivel && <Badge tone={nivel.tom}>{nivel.rotulo}</Badge>}
                      {rep.categoria && <Badge tone="neutral">{rep.categoria}</Badge>}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { rot: "Reclamações", v: rep.reclamacoes, limite: 2 },
                      { rot: "Cancelamentos", v: rep.cancelamentos, limite: 2 },
                      { rot: "Atrasos", v: rep.atrasos, limite: 4 },
                    ].map((x) => (
                      <div key={x.rot}>
                        <p className="label">{x.rot}</p>
                        <p className={cn("num text-[16px] font-semibold leading-tight", x.v != null && x.v >= x.limite ? "text-down" : "text-ink")}>
                          {x.v == null ? "—" : pct(x.v, 2)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-[12px] text-ink-3 flex-wrap">
                    <span>
                      <span className="num text-ink-2">{count(rep.vendas60d ?? 0)}</span> vendas em 60 dias
                    </span>
                    <span className={cn((rep.perguntasSemResposta ?? 0) > 0 && "text-down font-medium")}>
                      <span className="num">{count(rep.perguntasSemResposta ?? 0)}</span> pergunta(s) sem resposta
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* ── Atenção + no ar ────────────────────────────────────── */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel className="overflow-hidden">
            <PanelHeader title="Precisa de olho hoje" hint={`${dados.atencao.length} ponto(s), do mais grave para o menos.`} />
            {dados.atencao.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-ink-3">Nada fora do esperado nas regras que a tela checa.</p>
            ) : (
              <ul className="divide-y divide-line">
                {dados.atencao.map((a) => (
                  <li key={a.chave} className="flex items-start gap-2.5 px-4 py-3">
                    <TriangleAlert
                      className={cn("w-4 h-4 shrink-0 mt-0.5", a.gravidade === "alta" ? "text-down" : a.gravidade === "media" ? "text-warn" : "text-ink-3")}
                      strokeWidth={2}
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">{a.titulo}</p>
                      <p className="text-[12px] text-ink-2">{a.detalhe}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="No ar nas duas semanas"
              hint="Do Planejamento. Campanha que terminou explica queda que o número sozinho não explica."
              action={
                <Link href="/planejamento" className="text-[12.5px] font-medium text-brand hover:underline">
                  Abrir planejamento →
                </Link>
              }
            />
            {dados.campanhas.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-ink-3">Nenhuma campanha cadastrada nestas duas semanas.</p>
            ) : (
              <ul className="divide-y divide-line">
                {dados.campanhas.map((c) => (
                  <li key={`${c.titulo}-${c.inicio}`} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] text-ink truncate">{c.titulo}</p>
                      <p className="num text-[11.5px] text-ink-3">
                        {dataBr(c.inicio)} a {dataBr(c.fim)}
                        {c.skus > 0 && ` · ${c.skus} SKUs`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge tone={c.status === "Concluída" ? "neutral" : c.status === "Em andamento" ? "up" : "warn"}>{c.status}</Badge>
                      <span className="text-[11px] text-ink-3">{c.onde}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* ── Mais vistos ────────────────────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title={`Mais vistos em ${dataBr(dados.diaDoRanking)}`}
            hint="Visitas do dia por anúncio, com o que cada um converteu. Visita alta sem venda é preço, foto ou prazo."
          />
          {dados.maisVistos.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-ink-3">Sem visita medida neste dia.</p>
          ) : (
            <div className="gerizo-table-scroll" tabIndex={0} role="region" aria-label="Produtos mais vistos do dia">
              <table className="w-full border-collapse text-[13px] min-w-[620px]">
                <thead>
                  <tr className="bg-panel-2">
                    {["Produto", "Visitas", "Unidades", "Conversão", "Receita", "Estoque"].map((h, i) => (
                      <th
                        key={h}
                        className={cn(
                          "h-10 px-4 border-b border-line text-[12px] font-medium text-ink-2 whitespace-nowrap",
                          i === 0 ? "text-left" : "text-right"
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.maisVistos.map((p, i) => (
                    <tr key={p.mlb} className={cn("border-b border-line last:border-0", i % 2 === 1 && "bg-panel-2/55")}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="num text-[12.5px] font-medium text-ink">{p.sku || "sem SKU"}</span>
                          {linkDoAnuncio(p.mlb) ? (
                            <a href={linkDoAnuncio(p.mlb)!} target="_blank" rel="noreferrer" className="num text-[11.5px] text-brand hover:underline">
                              {p.mlb}
                            </a>
                          ) : (
                            <span className="num text-[11.5px] text-ink-3">{p.mlb}</span>
                          )}
                          {p.tipo === "Premium" && <Badge tone="neutral">premium</Badge>}
                        </div>
                        <p className="text-[12px] text-ink-2 break-words max-w-[320px]">
                          {p.titulo}
                        </p>
                      </td>
                      <td className="num px-4 py-2.5 text-right text-ink">{count(p.visitas)}</td>
                      <td className={cn("num px-4 py-2.5 text-right", p.unidades === 0 ? "text-down font-medium" : "text-ink")}>{count(p.unidades)}</td>
                      <td className="num px-4 py-2.5 text-right text-ink-2">{p.conversao == null ? "—" : pct(p.conversao, 2)}</td>
                      <td className="num px-4 py-2.5 text-right text-ink-2">{p.receita > 0 ? money(p.receita) : "—"}</td>
                      <td className={cn("num px-4 py-2.5 text-right", p.estoque === 0 ? "text-down font-semibold" : "text-ink-2")}>
                        {p.estoque == null ? "—" : count(p.estoque)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <p className="text-[12px] leading-relaxed text-ink-3">
          Vendas e visitas atualizadas em{" "}
          <span className="num">{dados.frescor.vendas ? new Date(dados.frescor.vendas).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</span>
          {dados.frescor.ads && (
            <>
              {" "}· mídia em <span className="num">{new Date(dados.frescor.ads).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
            </>
          )}
          . O botão Atualizar, no topo, relê o canal.
        </p>
      </PageBody>
    </>
  );
}

/** Os números de um dia, quando se clica nele. */
function DetalheDoDia({ dia }: { dia: DiaTermometro }) {
  const linhas: { rot: string; agora: string; antes: string; d?: number }[] = [
    { rot: "Receita", agora: money(dia.receita), antes: money(dia.anterior?.receita ?? 0), d: varPct(dia.receita, dia.anterior?.receita ?? null) },
    { rot: "Pedidos", agora: count(dia.pedidos), antes: count(dia.anterior?.pedidos ?? 0), d: varPct(dia.pedidos, dia.anterior?.pedidos ?? null) },
    { rot: "Unidades", agora: count(dia.unidades), antes: count(dia.anterior?.unidades ?? 0), d: varPct(dia.unidades, dia.anterior?.unidades ?? null) },
    { rot: "Visitas", agora: dia.visitas == null ? "—" : count(dia.visitas), antes: dia.anterior?.visitas == null ? "—" : count(dia.anterior.visitas), d: varPct(dia.visitas, dia.anterior?.visitas ?? null) },
    { rot: "Conversão", agora: dia.conversao == null ? "—" : pct(dia.conversao, 2), antes: "—" },
    { rot: "Cancelados", agora: count(dia.cancelados), antes: "—" },
    { rot: "Mídia", agora: money(dia.investimento), antes: "—" },
    { rot: "Receita ads", agora: money(dia.receitaAds), antes: "—" },
  ];
  return (
    <div className="border-t border-line bg-panel-2/40 p-4">
      <p className="label mb-2">
        {DIAS[dia.diaSemana]}, {dataBr(dia.data)}
        {dia.anterior && ` · contra ${DIAS[dia.diaSemana]}, ${dataBr(dia.anterior.data)}`}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {linhas.map((x) => (
          <div key={x.rot} className="min-w-0">
            <p className="text-[11.5px] text-ink-3">{x.rot}</p>
            <p className="num text-[15px] font-semibold text-ink leading-tight">{x.agora}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {x.d !== undefined && <Delta value={x.d} />}
              {x.antes !== "—" && <span className="num text-[11px] text-ink-3">era {x.antes}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
