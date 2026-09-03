"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import { Select, Field } from "@/components/ui/controls";
import { money, moneyShort, pct, count } from "@/lib/format";
import {
  Loader2, AlertCircle, ArrowRight, Split, Check, Target,
} from "lucide-react";
import type { DadosMtd, Alavanca } from "@/lib/dados/mtd";

/**
 * Mês até aqui.
 *
 * ── Por que o gap vem antes de tudo ──
 *
 * É a única pergunta que a tela existe para responder. Quanto eu deveria
 * ter vendido, quanto vendi, quanto falta — nessa ordem, no topo, em
 * corpo grande. O resto da tela explica esse número.
 *
 * ── As três alavancas ──
 *
 * `receita = visitas × conversão × ticket`. Fixando duas e resolvendo a
 * terceira, sai quanto de cada uma fecharia o mês. Um gap de R$ 300 mil
 * que precisa de +8% de conversão é um problema de página; o mesmo gap
 * precisando de +90% de visitas é de mídia. O número sozinho não separa
 * os dois; as alavancas separam.
 *
 * Cada linha compara o MÊS INTEIRO, não o que falta: "preciso de 1,4% nos
 * próximos 12 dias" não se compara com nada, enquanto "o mês precisa
 * fechar em 1,1% contra 0,9% de agora" se compara com o mês passado e com
 * o que o time sabe ser possível.
 *
 * ── Redistribuir ──
 *
 * Um clique, sem campo de valor: o quanto redistribuir é `meta − realizado`,
 * não uma escolha. Deixar digitar abriria a porta para um número que não
 * fecha com a meta.
 */

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const brData = (iso: string) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";

function LinhaAlavanca({
  nome,
  a,
  formatar,
  ajuda,
}: {
  nome: string;
  a: Alavanca;
  formatar: (v: number) => string;
  ajuda: string;
}) {
  const falta = a.variacao != null && a.variacao > 0.5;
  const sobra = a.variacao != null && a.variacao < -0.5;

  return (
    <tr>
      <td className="px-3 py-2.5 border-b border-line">
        <p className="text-[12.5px] text-ink font-medium">{nome}</p>
        <p className="text-[11px] text-ink-3">{ajuda}</p>
      </td>
      <td className="px-3 py-2.5 border-b border-line text-right num text-[13px] text-ink-2">
        {a.atual != null ? formatar(a.atual) : "—"}
      </td>
      <td className="px-3 py-2.5 border-b border-line text-right num text-[13px] text-ink font-semibold">
        {a.necessario != null ? formatar(a.necessario) : "—"}
      </td>
      <td className="px-3 py-2.5 border-b border-line text-right">
        {a.variacao != null ? (
          <span
            className={`num text-[13px] font-semibold ${
              falta ? "text-down" : sobra ? "text-up" : "text-ink-2"
            }`}
          >
            {a.variacao > 0 ? "+" : ""}
            {pct(a.variacao, 1)}
          </span>
        ) : (
          <span className="text-[11px] text-ink-3">—</span>
        )}
      </td>
    </tr>
  );
}

export default function MtdCliente({ dados: d }: { dados: DadosMtd }) {
  const router = useRouter();
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [feito, setFeito] = React.useState(false);

  const [sel, setSel] = React.useState<string[]>(d.selecionados);
  const todosMarcados = sel.length === d.canais.length;

  function aplicar(novos: string[]) {
    setSel(novos);
    const q = new URLSearchParams({ ano: String(d.ano), mes: String(d.mes) });
    // Todos marcados não vai na URL: o link fica limpo e "todos" é o
    // padrão de quem abre a tela sem recorte.
    if (novos.length && novos.length < d.canais.length) {
      q.set("canais", novos.join(","));
    }
    router.push(`/vendas/mtd?${q}`);
  }

  async function redistribuir() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/metas/redistribuir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ano: d.ano, mes: d.mes, canais: sel }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? `Falha ao redistribuir (HTTP ${r.status})`);
        return;
      }
      setFeito(true);
      router.refresh();
    } catch {
      setErro("Sem conexão — nada foi alterado.");
    } finally {
      setSalvando(false);
    }
  }

  const devendo = d.gap > 0;
  const semMeta = d.metaMes === 0;

  return (
    <>
      <PageHeader
        title="Mês até aqui"
        breadcrumb="Vendas"
        description={
          d.ate
            ? `Fechado até ${brData(d.ate)} · ${d.diasDecorridos} de ${d.diasDecorridos + d.diasRestantes} dias`
            : "Sem dado no mês"
        }
      />

      <PageBody>
        {erro && (
          <Panel className="px-4 py-3 mb-3 flex items-start gap-2.5 border-down/30">
            <AlertCircle className="w-4 h-4 text-down shrink-0 mt-0.5" />
            <p className="text-[13px] text-ink-2">{erro}</p>
          </Panel>
        )}

        {/* ── Recorte ── */}
        <Panel className="p-3 mb-3">
          <div className="flex items-end gap-2 flex-wrap">
            <Field label="Mês">
              <Select
                value={String(d.mes)}
                onChange={(e) =>
                  router.push(
                    `/vendas/mtd?ano=${d.ano}&mes=${e.target.value}${
                      sel.length < d.canais.length ? `&canais=${sel.join(",")}` : ""
                    }`
                  )
                }
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ano">
              <Select
                value={String(d.ano)}
                onChange={(e) =>
                  router.push(`/vendas/mtd?ano=${e.target.value}&mes=${d.mes}`)
                }
              >
                {[d.ano - 1, d.ano, d.ano + 1].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex-1" />
            <Button
              onClick={() =>
                aplicar(todosMarcados ? [] : d.canais.map((c) => c.id))
              }
            >
              {todosMarcados ? "Limpar canais" : "Todos os canais"}
            </Button>
          </div>

          {/* Canais como fichas: com dez canais, dez caixas de seleção
              empilhadas ocupariam a tela inteira antes do número. */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {d.canais.map((c) => {
              const on = sel.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() =>
                    aplicar(on ? sel.filter((x) => x !== c.id) : [...sel, c.id])
                  }
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-r1 border text-[12px] transition-colors ${
                    on
                      ? "border-brand/50 bg-brand/10 text-ink"
                      : "border-line text-ink-3 hover:text-ink-2"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-[2px] shrink-0"
                    style={{ background: on ? c.cor : "var(--ink-3)" }}
                  />
                  {c.nome}
                </button>
              );
            })}
          </div>
        </Panel>

        {/* ── O gap ── */}
        <Panel className="p-4 mb-3">
          {semMeta ? (
            <div className="flex items-start gap-2.5">
              <Target className="w-4 h-4 text-ink-3 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] text-ink">
                  Nenhuma meta definida para {MESES[d.mes - 1]}.
                </p>
                <Link
                  href={`/vendas/metas?ano=${d.ano}&mes=${d.mes}`}
                  className="inline-flex items-center gap-1 text-[12px] text-brand hover:underline mt-1"
                >
                  Definir a meta do mês
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                <div>
                  <p className="text-[11px] text-ink-3 mb-1">
                    Deveria ter vendido
                  </p>
                  <p className="num text-[20px] font-semibold text-ink leading-none">
                    {money(d.metaAteAqui)}
                  </p>
                  <p className="text-[11px] text-ink-3 mt-1">
                    até {brData(d.ate)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-3 mb-1">Vendi</p>
                  <p className="num text-[20px] font-semibold text-ink leading-none">
                    {money(d.receitaPaga)}
                  </p>
                  <p className="num text-[11px] text-ink-3 mt-1">
                    {d.metaAteAqui > 0
                      ? `${pct((d.receitaPaga * 100) / d.metaAteAqui, 0)} da meta`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-3 mb-1">
                    {devendo ? "Falta recuperar" : "Adiantado"}
                  </p>
                  <p
                    className={`num text-[20px] font-semibold leading-none ${
                      devendo ? "text-down" : "text-up"
                    }`}
                  >
                    {money(Math.abs(d.gap))}
                  </p>
                  <p className="text-[11px] text-ink-3 mt-1">
                    {d.diasRestantes} dias restantes
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-3 mb-1">
                    Precisa por dia
                  </p>
                  <p className="num text-[20px] font-semibold text-ink leading-none">
                    {d.porDiaRestante != null ? money(d.porDiaRestante) : "—"}
                  </p>
                  <p className="text-[11px] text-ink-3 mt-1">
                    para fechar {moneyShort(d.metaMes)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-line flex-wrap">
                <Button
                  variant="primary"
                  disabled={salvando || d.diasRestantes === 0}
                  onClick={redistribuir}
                >
                  {salvando ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Redistribuindo
                    </>
                  ) : feito ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Redistribuído
                    </>
                  ) : (
                    <>
                      <Split className="w-3.5 h-3.5" />
                      Jogar o que falta nos dias restantes
                    </>
                  )}
                </Button>
                <p className="text-[11.5px] text-ink-3 leading-relaxed max-w-lg">
                  Divide {money(d.faltaNoMes)} entre os {d.diasRestantes} dias
                  que faltam, pelo peso de cada dia da semana. Dias fixados à
                  mão são preservados.
                  {d.projecao != null && (
                    <>
                      {" "}No ritmo de agora, o mês fecha em{" "}
                      <span
                        className={`num ${
                          d.projecao >= d.metaMes ? "text-up" : "text-down"
                        }`}
                      >
                        {moneyShort(d.projecao)}
                      </span>
                      .
                    </>
                  )}
                </p>
              </div>
            </>
          )}
        </Panel>

        {/* ── Onde está sendo perdido ── */}
        {!semMeta && (
          <Panel className="overflow-hidden mb-3">
            <div className="px-4 py-2.5 border-b border-line">
              <p className="text-[13px] font-semibold text-ink">
                O que precisaria mudar
              </p>
              <p className="text-[11.5px] text-ink-3 mt-0.5">
                Cada linha resolve a meta do mês mexendo só naquela alavanca e
                mantendo as outras duas como estão hoje.
              </p>
            </div>
            <table className="w-full border-collapse">
              <thead className="bg-panel-2">
                <tr>
                  <th className="px-3 py-2 text-[11px] font-semibold text-ink-3 text-left">
                    Alavanca
                  </th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-ink-3 text-right">
                    Cenário atual
                  </th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-ink-3 text-right">
                    Cenário ideal
                  </th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-ink-3 text-right">
                    Diferença
                  </th>
                </tr>
              </thead>
              <tbody>
                <LinhaAlavanca
                  nome="Visitas"
                  ajuda="no mês inteiro, mantendo conversão e ticket"
                  a={d.visitasAlavanca}
                  formatar={(v) => count(Math.round(v))}
                />
                <LinhaAlavanca
                  nome="Conversão"
                  ajuda="mantendo o ritmo de visitas e o ticket"
                  a={d.conversaoAlavanca}
                  formatar={(v) => pct(v, 2)}
                />
                <LinhaAlavanca
                  nome="Ticket médio"
                  ajuda="mantendo visitas e conversão"
                  a={d.ticketAlavanca}
                  formatar={money}
                />
              </tbody>
            </table>
          </Panel>
        )}

        {/* ── O mês em números ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { r: "Receita bruta", v: moneyShort(d.receitaBruta) },
            {
              r: "Cancelada",
              v: moneyShort(d.receitaCancelada),
              nota:
                d.receitaBruta > 0
                  ? pct((d.receitaCancelada * 100) / d.receitaBruta, 1)
                  : undefined,
              alerta: d.receitaBruta > 0 && d.receitaCancelada / d.receitaBruta > 0.1,
            },
            { r: "Receita paga", v: moneyShort(d.receitaPaga) },
            {
              r: "Pedidos",
              v: count(d.pedidos),
              nota: d.pedidosCancelados
                ? `${count(d.pedidosCancelados)} cancelados`
                : undefined,
            },
            { r: "Visitas", v: d.visitas ? count(d.visitas) : "—" },
            {
              r: "Conversão",
              v: d.conversao != null ? pct(d.conversao, 2) : "—",
              nota: d.ticket != null ? `ticket ${money(d.ticket)}` : undefined,
            },
          ].map((k) => (
            <Panel key={k.r} className="p-3">
              <p className="text-[11px] text-ink-3 mb-1">{k.r}</p>
              <p
                className={`num text-[17px] font-semibold leading-none ${
                  k.alerta ? "text-down" : "text-ink"
                }`}
              >
                {k.v}
              </p>
              {k.nota && (
                <p className="num text-[11px] text-ink-3 mt-1.5">{k.nota}</p>
              )}
            </Panel>
          ))}
        </div>

        {/* Visitas em branco tem causa conhecida e conserto conhecido —
            dizer os dois evita que a conversão seja lida como queda. */}
        {!d.visitas && (
          <Panel className="px-4 py-3 mt-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-ink-3 shrink-0 mt-0.5" />
            <p className="text-[12px] text-ink-3 leading-relaxed">
              Sem visitas lançadas no mês, a conversão e a alavanca de visitas
              ficam vazias. As visitas entram na tela de{" "}
              <Link href="/vendas/lancamentos" className="text-brand hover:underline">
                Lançamentos
              </Link>{" "}
              ou pelo relatório de desempenho de anúncios.
            </p>
          </Panel>
        )}
      </PageBody>
    </>
  );
}
