"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import { Input, Select, Field, Checkbox } from "@/components/ui/controls";
import { money, moneyShort, pct, count } from "@/lib/format";
import {
  Target, Loader2, AlertCircle, Check, Lock, Unlock, Info,
} from "lucide-react";
import { ratearPorPeso } from "@/lib/dados/ratear-meta";
import type { DadosPlanejamento } from "@/lib/dados/metas-planejamento";

/**
 * Metas: um número, e o sistema distribui.
 *
 * ── O que se digita ──
 *
 * A meta do mês e quais canais participam. Só isso. O peso de cada canal
 * vem da receita líquida dos últimos 90 dias, e o alvo de cada dia sai do
 * padrão de dia da semana do próprio histórico.
 *
 * Pedir a meta canal por canal seria pedir para a pessoa refazer de
 * cabeça a conta que o histórico já responde melhor.
 *
 * ── A prévia é local ──
 *
 * A divisão por canal é recalculada no navegador enquanto se digita, com
 * a mesma função que o servidor usa na hora de gravar. Ver a fatia mudar
 * ao marcar um canal é o que torna a escolha compreensível — esperar uma
 * ida ao servidor a cada clique tornaria a tela inutilizável.
 *
 * ── Dia fixado ──
 *
 * O cadeado prende o valor daquele dia. O rateio soma os fixados, tira do
 * total do canal e divide o resto entre os demais — o mês continua
 * fechando, e o ajuste sobrevive ao próximo recálculo.
 */

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function ler(s: string): number {
  const limpo = s.trim().replace(/[R$\s]/g, "");
  if (!limpo) return 0;
  const v = parseFloat(
    limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo
  );
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

export default function PlanejarMetas({ dados }: { dados: DadosPlanejamento }) {
  const router = useRouter();
  const { ano, mes, canais, dias, janela } = dados;

  const [total, setTotal] = React.useState(
    dados.metaTotal > 0 ? String(dados.metaTotal).replace(".", ",") : ""
  );
  const [selecionados, setSelecionados] = React.useState<string[]>(
    canais.filter((c) => c.selecionado).map((c) => c.id)
  );
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [salvo, setSalvo] = React.useState(false);

  const valorTotal = ler(total);

  /* A mesma função do servidor, rodando aqui para a prévia. */
  const fatias = React.useMemo(() => {
    const pesos = selecionados.map((id) => ({
      canalId: id,
      peso: canais.find((c) => c.id === id)?.peso ?? 0,
    }));
    return new Map(ratearPorPeso(valorTotal, pesos).map((f) => [f.canalId, f]));
  }, [valorTotal, selecionados, canais]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch("/api/metas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ano, mes, total: valorTotal, canais: selecionados }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? `Falha ao gravar (HTTP ${r.status})`);
        return;
      }
      setAviso(corpo.aviso ?? null);
      setSalvo(true);
      router.refresh();
    } catch {
      setErro("Sem conexão — nada foi gravado.");
    } finally {
      setSalvando(false);
    }
  }

  /* ── Ajuste de um dia ── */

  const [editandoDia, setEditandoDia] = React.useState<string | null>(null);
  const [valorDia, setValorDia] = React.useState("");

  async function gravarDia(data: string, manual: boolean) {
    // Um dia só pode ser fixado num canal por vez; com mais de um canal
    // selecionado a tela pergunta em qual. Com um só, não há o que
    // perguntar.
    if (selecionados.length !== 1) {
      setErro(
        "Para fixar um dia, filtre para um canal só — a meta do dia é por canal, e dividir um valor entre canais aqui seria adivinhação."
      );
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/metas/dia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          canalId: selecionados[0],
          data,
          valor: ler(valorDia),
          manual,
        }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? `Falha ao gravar (HTTP ${r.status})`);
        return;
      }
      setAviso(corpo.aviso ?? null);
      setEditandoDia(null);
      router.refresh();
    } catch {
      setErro("Sem conexão — nada foi gravado.");
    } finally {
      setSalvando(false);
    }
  }

  const metaDoMes = dias.reduce((s, d) => s + d.meta, 0);
  const realizado = dias.reduce((s, d) => s + (d.realizado ?? 0), 0);
  const decorridos = dias.filter((d) => d.realizado != null);
  const metaAteAgora = decorridos.reduce((s, d) => s + d.meta, 0);

  const th = "px-2.5 py-2 text-[11px] font-semibold text-ink-3 whitespace-nowrap";
  const td = "px-2.5 py-1.5 border-b border-line";

  return (
    <>
      <PageHeader
        title="Metas"
        breadcrumb="Vendas"
        description="Defina o mês; o sistema divide por canal e por dia"
      />

      <PageBody>
        {erro && (
          <Panel className="px-4 py-3 mb-3 flex items-start gap-2.5 border-down/30">
            <AlertCircle className="w-4 h-4 text-down shrink-0 mt-0.5" />
            <p className="text-[13px] text-ink-2">{erro}</p>
          </Panel>
        )}
        {aviso && (
          <Panel className="px-4 py-3 mb-3 flex items-start gap-2.5 border-warn/30">
            <AlertCircle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
            <p className="text-[13px] text-ink-2">{aviso}</p>
          </Panel>
        )}

        {/* ── Definir ── */}
        <Panel className="p-4 mb-3">
          <div className="flex items-end gap-3 flex-wrap">
            <Field label="Mês">
              <Select
                value={String(mes)}
                onChange={(e) =>
                  router.push(`/vendas/metas?ano=${ano}&mes=${e.target.value}`)
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
                value={String(ano)}
                onChange={(e) =>
                  router.push(`/vendas/metas?ano=${e.target.value}&mes=${mes}`)
                }
              >
                {[ano - 1, ano, ano + 1].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Meta do mês" hint="receita líquida">
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={total}
                onChange={(e) => {
                  setTotal(e.target.value);
                  setSalvo(false);
                }}
                className="w-40"
              />
            </Field>
            <Button
              variant="primary"
              disabled={salvando || valorTotal <= 0 || !selecionados.length}
              onClick={salvar}
            >
              {salvando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Distribuindo
                </>
              ) : salvo ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Distribuída
                </>
              ) : (
                <>
                  <Target className="w-3.5 h-3.5" />
                  Distribuir meta
                </>
              )}
            </Button>
          </div>

          <p className="text-[11.5px] text-ink-3 mt-3 leading-relaxed max-w-2xl">
            O peso de cada canal vem da receita líquida entre{" "}
            <span className="num">{janela.inicio.split("-").reverse().join("/")}</span> e{" "}
            <span className="num">{janela.fim.split("-").reverse().join("/")}</span> —
            cancelamento já descontado. O alvo de cada dia sai do padrão de dia
            da semana do mesmo período.
          </p>
        </Panel>

        {/* ── Canais ── */}
        <Panel className="overflow-hidden mb-3">
          <div className="px-4 py-2.5 border-b border-line flex items-center gap-2">
            <p className="text-[13px] font-semibold text-ink">
              Canais na meta
            </p>
            <span className="num text-[12px] text-ink-3">
              {count(selecionados.length)} de {count(canais.length)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[640px]">
              <thead className="bg-panel-2">
                <tr>
                  <th className={`${th} text-left w-[44px]`} />
                  <th className={`${th} text-left`}>Canal</th>
                  <th className={`${th} text-right`}>Receita 90 dias</th>
                  <th className={`${th} text-right`}>Peso</th>
                  <th className={`${th} text-right`}>Meta do canal</th>
                  <th className={`${th} text-right`}>Pedidos-alvo</th>
                </tr>
              </thead>
              <tbody>
                {canais.map((c) => {
                  const marcado = selecionados.includes(c.id);
                  const f = fatias.get(c.id);
                  // Pedidos-alvo é derivado do ticket recente: não é uma
                  // segunda meta a bater, é a tradução da mesma meta em
                  // volume, que é como a operação pensa no dia a dia.
                  const pedidosAlvo =
                    f && c.ticket ? Math.round(f.valor / c.ticket) : null;
                  return (
                    <tr key={c.id} className={marcado ? "" : "opacity-45"}>
                      <td className={td}>
                        <Checkbox
                          checked={marcado}
                          onChange={() => {
                            setSelecionados((s) =>
                              s.includes(c.id)
                                ? s.filter((x) => x !== c.id)
                                : [...s, c.id]
                            );
                            setSalvo(false);
                          }}
                          aria-label={c.nome}
                        />
                      </td>
                      <td className={td}>
                        <span className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                            style={{ background: c.cor }}
                          />
                          <span className="text-[12.5px] text-ink">{c.nome}</span>
                        </span>
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-2`}>
                        {moneyShort(c.receitaRecente)}
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-2`}>
                        {pct(c.peso, 1)}
                      </td>
                      <td className={`${td} text-right`}>
                        {marcado && f ? (
                          <div className="flex flex-col items-end leading-tight">
                            <span className="num text-[13px] font-semibold text-ink">
                              {money(f.valor)}
                            </span>
                            <span className="num text-[10.5px] text-ink-3">
                              {pct(f.peso, 1)} do total
                            </span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-ink-3">—</span>
                        )}
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-3`}>
                        {pedidosAlvo != null ? count(pedidosAlvo) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {valorTotal > 0 && (
            <div className="px-4 py-2 border-t border-line flex items-baseline justify-between">
              <span className="text-[12px] text-ink-3">
                Soma das fatias
              </span>
              <span className="num text-[13px] font-semibold text-ink">
                {money(
                  [...fatias.values()].reduce((s, f) => s + f.valor, 0)
                )}
              </span>
            </div>
          )}
        </Panel>

        {/* ── Dias ── */}
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line flex items-baseline gap-4 flex-wrap">
            <p className="text-[13px] font-semibold text-ink">
              {MESES[mes - 1]} de {ano}, dia a dia
            </p>
            <span className="num text-[12px] text-ink-3">
              meta {moneyShort(metaDoMes)}
            </span>
            {decorridos.length > 0 && (
              <span className="text-[12px] text-ink-3">
                até aqui{" "}
                <span
                  className={`num font-medium ${
                    realizado >= metaAteAgora ? "text-up" : "text-down"
                  }`}
                >
                  {moneyShort(realizado)}
                </span>{" "}
                de {moneyShort(metaAteAgora)}
                {metaAteAgora > 0 && (
                  <span className="num ml-1">
                    ({pct((realizado * 100) / metaAteAgora, 0)})
                  </span>
                )}
              </span>
            )}
          </div>

          {metaDoMes === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-ink-2">
                Nenhuma meta distribuída para este mês.
              </p>
              <p className="text-[12px] text-ink-3 mt-1">
                Informe o valor acima e clique em Distribuir meta.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-px bg-line">
              {dias.map((d) => {
                const bateu = d.realizado != null && d.realizado >= d.meta;
                const editando = editandoDia === d.data;
                return (
                  <div
                    key={d.data}
                    className="bg-panel p-2 min-h-[86px] flex flex-col"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="num text-[11px] text-ink-3">
                        {d.data.slice(8, 10)} {DOW[d.diaSemana]}
                      </span>
                      <button
                        onClick={() => {
                          if (d.manual) {
                            void gravarDia(d.data, false);
                          } else {
                            setEditandoDia(d.data);
                            setValorDia(String(d.meta).replace(".", ","));
                          }
                        }}
                        className={`transition-colors ${
                          d.manual ? "text-brand" : "text-ink-3 hover:text-ink-2"
                        }`}
                        aria-label={d.manual ? "Soltar o dia" : "Fixar o dia"}
                        title={
                          d.manual
                            ? "Fixado à mão — clique para devolver ao rateio"
                            : "Fixar este dia"
                        }
                      >
                        {d.manual ? (
                          <Lock className="w-3 h-3" />
                        ) : (
                          <Unlock className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    {editando ? (
                      <div className="flex flex-col gap-1">
                        <Input
                          inputMode="decimal"
                          value={valorDia}
                          autoFocus
                          onChange={(e) => setValorDia(e.target.value)}
                          className="h-7 text-[12px]"
                        />
                        <div className="flex gap-1">
                          <Button
                            variant="primary"
                            className="h-6 px-2 text-[11px] flex-1"
                            disabled={salvando}
                            onClick={() => gravarDia(d.data, true)}
                          >
                            Fixar
                          </Button>
                          <Button
                            className="h-6 px-2 text-[11px]"
                            onClick={() => setEditandoDia(null)}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="num text-[13px] text-ink font-medium leading-none">
                          {moneyShort(d.meta)}
                        </span>
                        {d.realizado != null && (
                          <span
                            className={`num text-[11px] mt-1 ${
                              bateu ? "text-up" : "text-down"
                            }`}
                          >
                            {moneyShort(d.realizado)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className="p-4 mt-3 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-ink-3 shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold text-ink mb-1">
              O que acontece com essa meta
            </p>
            <p className="text-[11.5px] text-ink-3 leading-relaxed max-w-2xl">
              Ela alimenta o anual e a tela de Lançamentos, onde o alvo do dia
              aparece ao lado do realizado. Ajustar um dia aqui — fixando com o
              cadeado — redistribui o restante do mês entre os dias livres, então
              o total continua fechando com o que você definiu.
            </p>
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
