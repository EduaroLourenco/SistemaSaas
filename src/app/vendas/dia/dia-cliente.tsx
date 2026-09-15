"use client";

import { SelectRecorte } from "@/components/ui/select-recorte";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge, Delta, EmptyState } from "@/components/ui/primitives";
import { Select } from "@/components/ui/controls";
import { money, moneyShort, pct, count, nomeDoDia } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlertTriangle, CalendarDays, Trophy, TrendingDown } from "lucide-react";
import type { DadosDia, DiaLinha } from "@/lib/dados/dia";

/**
 * A visão do dia.
 *
 * ── O calendário é o miolo ──
 *
 * Uma lista de dias em tabela não responde "qual semana foi melhor" — o
 * olho não agrupa linha por linha. Em grade, com as colunas sendo os dias
 * da semana, o padrão salta: segunda fraca, fim de semana forte, a semana
 * em que mexeram no preço.
 *
 * ── Verde e vermelho são meta, não receita ──
 *
 * A cor diz se o dia bateu a meta, não se vendeu muito. Dia de R$ 40 mil
 * com meta de R$ 50 mil é vermelho mesmo sendo o segundo melhor do mês —
 * e é essa a leitura que importa para quem cobra resultado.
 */

const br = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/** "hoje às 13:04", "ontem às 01:02" ou "09/09 às 13:05" — sempre em Brasília. */
function quando(iso: string) {
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(d);
  const d = new Date(iso);
  const dia = fmt(d, { day: "2-digit", month: "2-digit" });
  const hora = fmt(d, { hour: "2-digit", minute: "2-digit" });
  const hoje = fmt(new Date(), { day: "2-digit", month: "2-digit" });
  const ontem = fmt(new Date(Date.now() - 86_400_000), { day: "2-digit", month: "2-digit" });
  const rotulo = dia === hoje ? "hoje" : dia === ontem ? "ontem" : dia;
  return `${rotulo} às ${hora}`;
}

function textoAtualizacao(a: DadosDia["atualizacao"]) {
  if (!a) return null;
  const ref = a.ok ? a.em : a.ultimaOk;
  if (!ref) return "canal ainda sem sincronização concluída";
  return `atualizado ${quando(ref)}${a.ok && a.automatica ? " (automático)" : ""}`;
}

/**
 * Faixa de aviso quando a última sincronização falhou.
 *
 * Fica acima dos números, e não num rodapé, porque o que ela diz muda a
 * leitura de tudo abaixo: o dia pode estar incompleto.
 */
function AvisoFalha({ a }: { a: DadosDia["atualizacao"] }) {
  if (!a || a.ok) return null;
  return (
    <div className="panel bg-warn-wash border-transparent px-3 py-2.5 mb-3 flex gap-2.5">
      <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-px" strokeWidth={2} />
      <p className="text-[12px] text-ink-2">
        <span className="font-semibold text-ink">
          A sincronização de {quando(a.em)} falhou.
        </span>{" "}
        {a.ultimaOk
          ? `Os números abaixo são de ${quando(a.ultimaOk)} e podem estar incompletos.`
          : "Nenhuma sincronização foi concluída ainda."}
        {a.erro && <span className="block text-ink-3 mt-0.5">{a.erro}</span>}
      </p>
    </div>
  );
}

export default function DiaCliente({ dados }: { dados: DadosDia }) {
  const router = useRouter();

  function ir(campo: "data" | "canal", valor: string) {
    const q = new URLSearchParams();
    if (campo === "data" ? valor : dados.hoje?.data) {
      q.set("data", campo === "data" ? valor : dados.hoje!.data);
    }
    const canal = campo === "canal" ? valor : dados.canalId;
    if (canal) q.set("canal", canal);
    router.push(`/vendas/dia${q.toString() ? "?" + q : ""}`);
  }

  if (dados.vazio || !dados.hoje) {
    return (
      <>
        <PageHeader title="Dia" breadcrumb="Vendas" />
        <PageBody>
          <Panel className="p-6">
            <EmptyState
              icon={CalendarDays}
              title="Sem movimento registrado"
              description="Importe os lançamentos ou sincronize o canal para a visão do dia aparecer."
            />
          </Panel>
        </PageBody>
      </>
    );
  }

  const h = dados.hoje;

  return (
    <>
      <PageHeader
        title="Dia"
        breadcrumb="Vendas"
        description={[
          `${nomeDoDia(h.diaSemana)}, ${br(h.data)}`,
          dados.mesRotulo,
          textoAtualizacao(dados.atualizacao),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            <SelectRecorte
              grupos={dados.opcoes}
              valor={dados.canalId}
              onChange={(v) => ir("canal", v)}
              className="w-[240px]"
            />
          </div>
        }
      />

      <PageBody>
        <AvisoFalha a={dados.atualizacao} />

        {/* ── O dia ── */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-px bg-line border border-line rounded-r2 overflow-hidden mb-3">
          <Cartao
            k="Receita líquida"
            v={money(h.receitaLiquida)}
            sub={h.valorCancelado > 0 ? `${moneyShort(h.valorCancelado)} cancelados` : "sem cancelamento"}
          />
          <Cartao
            k="Meta do dia"
            v={h.meta > 0 ? money(h.meta) : "—"}
            sub={
              h.meta > 0
                ? h.sobraMeta >= 0
                  ? `sobrou ${moneyShort(h.sobraMeta)}`
                  : `faltou ${moneyShort(-h.sobraMeta)}`
                : dados.metaPorConta
                  ? "meta é do canal inteiro"
                  : "sem meta para o dia"
            }
            tom={h.bateu === null ? undefined : h.bateu ? "up" : "down"}
          />
          <Cartao k="Pedidos" v={count(h.pedidosValidos)} sub={`${count(h.pedidos)} no total`} />
          <Cartao
            k="Ticket médio"
            v={h.ticket != null ? money(h.ticket) : "—"}
            sub="líquida ÷ válidos"
          />
          <Cartao
            k="Visitas"
            v={h.visitas > 0 ? count(h.visitas) : "—"}
            sub={h.conversao != null ? `conversão ${pct(h.conversao, 2)}` : "sem visita registrada"}
          />
          <Cartao
            k="Ads"
            v={h.ads > 0 ? money(h.ads) : "—"}
            sub={
              h.ads > 0 && h.receitaLiquida > 0
                ? `TACOS ${pct((h.ads / h.receitaLiquida) * 100, 1)}`
                : "sem investimento"
            }
          />
        </div>

        {/* ── Contra o quê ── */}
        <Panel className="px-4 py-3 mb-3">
          <p className="text-[12px] text-ink-3 mb-2">
            {nomeDoDia(h.diaSemana)}, {br(h.data)} comparada com
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
            {dados.comparacoes.map((c) => (
              <div key={c.rotulo} className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[12px] text-ink-2 truncate">{c.rotulo}</span>
                <div className="flex items-baseline gap-2">
                  <span className="num text-[15px] text-ink">
                    {c.receita != null ? money(c.receita) : "—"}
                  </span>
                  {c.variacao != null && <Delta value={c.variacao} />}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-3 mt-2.5 leading-relaxed">
            A comparação com a mesma {nomeDoDia(h.diaSemana)} evita a conclusão errada
            mais comum: segunda sempre parece ruim ao lado de domingo.
          </p>
        </Panel>

        {/* ── O mês em grade ── */}
        <Panel className="overflow-hidden mb-3">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line flex-wrap">
            <p className="text-[13px] font-semibold text-ink">{dados.mesRotulo}</p>
            {dados.comMeta > 0 && (
              <Badge tone={dados.bateram >= dados.comMeta / 2 ? "up" : "warn"}>
                {dados.bateram} de {dados.comMeta} dias na meta
              </Badge>
            )}
            <span className="text-[11.5px] text-ink-3 ml-auto">
              verde bateu a meta · vermelho não · clique no dia para abrir
            </span>
          </div>
          <Calendario dias={dados.mes} foco={h.data} aoEscolher={(d) => ir("data", d)} />
        </Panel>

        {/* ── Melhor e pior ── */}
        {dados.melhor && dados.pior && dados.melhor.data !== dados.pior.data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Destaque
              icone={Trophy}
              titulo="Melhor dia do mês"
              dia={dados.melhor}
              tom="up"
              aoAbrir={() => ir("data", dados.melhor!.data)}
            />
            <Destaque
              icone={TrendingDown}
              titulo="Pior dia do mês"
              dia={dados.pior}
              tom="down"
              aoAbrir={() => ir("data", dados.pior!.data)}
            />
          </div>
        )}
      </PageBody>
    </>
  );
}

function Cartao({
  k,
  v,
  sub,
  tom,
}: {
  k: string;
  v: string;
  sub?: string;
  tom?: "up" | "down";
}) {
  return (
    <div className="bg-panel px-3.5 py-2.5 flex flex-col gap-0.5">
      <span className="label">{k}</span>
      <span
        className={cn(
          "num text-[19px] font-semibold",
          tom === "up" && "text-up",
          tom === "down" && "text-down",
          !tom && "text-ink"
        )}
      >
        {v}
      </span>
      {sub && <span className="text-[11px] text-ink-3">{sub}</span>}
    </div>
  );
}

/**
 * O mês em grade de 7 colunas, começando no domingo.
 *
 * Os dias antes do primeiro do mês entram como célula vazia, senão a
 * primeira semana desalinha das demais e o padrão semanal — que é o que
 * a grade existe para mostrar — deixa de se ver.
 */
function Calendario({
  dias,
  foco,
  aoEscolher,
}: {
  dias: DiaLinha[];
  foco: string;
  aoEscolher: (data: string) => void;
}) {
  if (!dias.length) return null;

  const vazias = dias[0].diaSemana;
  const maior = Math.max(...dias.map((d) => d.receitaLiquida), 1);

  return (
    <div className="p-3">
      <div className="grid grid-cols-7 gap-1.5">
        {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
          <div key={d} className="label text-center pb-1">
            {d}
          </div>
        ))}

        {Array.from({ length: vazias }).map((_, i) => (
          <div key={`vazio-${i}`} />
        ))}

        {dias.map((d) => {
          const altura = Math.round((d.receitaLiquida / maior) * 22);
          return (
            <button
              key={d.data}
              onClick={() => aoEscolher(d.data)}
              className={cn(
                "text-left rounded-r1 border p-1.5 min-h-[74px] flex flex-col gap-0.5 transition-colors",
                "hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand",
                d.data === foco ? "border-brand bg-brand-wash" : "border-line bg-panel",
                d.parcial && "opacity-45"
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="num text-[11px] text-ink-3">{d.data.slice(8, 10)}</span>
                {d.bateu !== null && (
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      d.bateu ? "bg-up" : "bg-down"
                    )}
                    aria-label={d.bateu ? "bateu a meta" : "não bateu a meta"}
                  />
                )}
              </div>

              <span className="num text-[11.5px] font-semibold text-ink leading-tight">
                {d.receitaLiquida > 0 ? moneyShort(d.receitaLiquida) : "—"}
              </span>

              {d.meta > 0 && (
                <span className="num text-[10px] text-ink-3 leading-tight">
                  meta {moneyShort(d.meta)}
                </span>
              )}

              {/* barrinha proporcional: dá o perfil do mês de relance */}
              <div className="mt-auto h-[3px] bg-line rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    d.bateu === null ? "bg-ink-3" : d.bateu ? "bg-up" : "bg-down"
                  )}
                  style={{ width: `${Math.max(2, altura * 4)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Destaque({
  icone: Icone,
  titulo,
  dia,
  tom,
  aoAbrir,
}: {
  icone: React.ElementType;
  titulo: string;
  dia: DiaLinha;
  tom: "up" | "down";
  aoAbrir: () => void;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-start gap-2.5">
        <Icone
          className={cn("w-4 h-4 shrink-0 mt-0.5", tom === "up" ? "text-up" : "text-down")}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-ink-3">{titulo}</p>
          <button
            onClick={aoAbrir}
            className="text-[15px] font-semibold text-ink hover:text-brand transition-colors"
          >
            {nomeDoDia(dia.diaSemana)}, {br(dia.data)}
          </button>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[12px] text-ink-2">
            <span className="num">{money(dia.receitaLiquida)}</span>
            <span className="num">{count(dia.pedidosValidos)} pedidos</span>
            {dia.conversao != null && (
              <span className="num">conversão {pct(dia.conversao, 2)}</span>
            )}
            {dia.ticket != null && <span className="num">ticket {money(dia.ticket)}</span>}
          </div>
        </div>
      </div>
    </Panel>
  );
}
