"use client";

import * as React from "react";
import { Panel } from "@/components/ui/primitives";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LENTES, type AnuncioAnalisado, type Lente } from "@/lib/analise";

/**
 * O que está custando dinheiro, e o filtro para olhar.
 *
 * ── O que isto substituiu ──
 *
 * Cinco cartões de total — Receita acumulada, Unidades, Conversão,
 * Visitas, Margem subsidiada — que diziam o tamanho da operação e nada
 * sobre o que fazer. Dois deles mentiam: "Margem subsidiada" mostrava
 * R$ 0,00 desde sempre, porque o preço de tabela nunca era carregado.
 *
 * O diagnóstico existia, escondido num seletor de lente que ninguém
 * abria. Agora ele é a primeira coisa da tela, com o dinheiro ao lado
 * da contagem — porque 74 anúncios não decide nada e R$ 30.870 decide.
 *
 * ── Por que a regra aparece ──
 *
 * Uma linha, só da lente escolhida. "Sangrando margem" não se explica
 * sozinho, e sem o critério o número não dá para conferir. É a única
 * frase da tela, e ela some quando a lente é "Todos".
 */

/**
 * O tamanho de cada problema, em dinheiro ou em gente.
 *
 * O número de anúncios sozinho não decide: 74 anúncios pode ser
 * R$ 300 ou R$ 30.000. Lente sem valor aqui é lente cujo tamanho já
 * está na contagem.
 */
const TAMANHO: Partial<Record<Lente, (d: AnuncioAnalisado[]) => string>> = {
  abaixo_tabela: (d) => `${money(d.reduce((s, i) => s + i.metricas.subsidio, 0))} a menos`,
  converte_bem: (d) => `${money(d.reduce((s, i) => s + i.metricas.receita, 0))} já`,
  nao_fecha: (d) => `${count(d.reduce((s, i) => s + i.metricas.visitas, 0))} visitas`,
};

export function PainelLentes({
  itens,
  lente,
  escolher,
  periodo,
}: {
  itens: AnuncioAnalisado[];
  lente: Lente;
  escolher: (l: Lente) => void;
  /** "8 semanas", para o número herói dizer de quando ele é. */
  periodo: string;
}) {
  const fichas = React.useMemo(() => {
    return LENTES.filter((L) => L.id !== "todos")
      .map((L) => {
        const dentro = itens.filter((i) => i.lentes.includes(L.id));
        return {
          id: L.id,
          rotulo: L.rotulo,
          n: dentro.length,
          valor: TAMANHO[L.id]?.(dentro) ?? null,
        };
      })
      .filter((f) => f.n > 0);
  }, [itens]);

  const naMesa = itens.reduce((s, i) => s + i.metricas.subsidio, 0);
  const comSubsidio = itens.filter((i) => i.metricas.subsidio > 0).length;
  const receita = itens.reduce((s, i) => s + i.metricas.receita, 0);
  const vendas = itens.reduce((s, i) => s + i.metricas.vendas, 0);
  const visitas = itens.reduce((s, i) => s + i.metricas.visitas, 0);
  const definicao = LENTES.find((L) => L.id === lente);

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4 px-4 pt-4 pb-3.5">
        <div className="flex flex-col gap-1">
          <span className="label">Deixou de ganhar</span>
          <b className="num text-[40px] sm:text-[46px] leading-[0.9] font-semibold tracking-tight text-down">
            {money(naMesa)}
          </b>
          <span className="text-[12.5px] text-ink-2">
            {count(comSubsidio)} anúncios vendidos abaixo da sua tabela, em {periodo}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3 sm:ml-auto">
          {[
            { v: money(receita), r: "receita" },
            { v: count(vendas), r: "unidades" },
            { v: count(visitas), r: "visitas" },
            { v: visitas ? pct((vendas / visitas) * 100, 2) : "—", r: "conversão" },
          ].map((x) => (
            <div key={x.r} className="flex flex-col gap-0.5">
              <b className="num text-[19px] font-semibold text-ink">{x.v}</b>
              <span className="text-[12px] text-ink-3">{x.r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* A única frase fixa da tela. Sem ela, os botões abaixo são cinco
          números sem pergunta. */}
      <p className="px-4 pb-2 text-[12.5px] text-ink-3">
        Clique num problema para ver só os anúncios dele.
      </p>

      {/* No telefone a fila rola dentro de si: quebrar em duas linhas de
          cartão empurra a tabela para fora da primeira tela. */}
      <div className="flex gap-2 px-4 pb-4 overflow-x-auto sm:flex-wrap sm:overflow-visible">
        {fichas.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => escolher(lente === f.id ? "todos" : f.id)}
            className={cn(
              "flex flex-col items-start gap-1 shrink-0 min-h-[62px] px-3.5 py-2.5 rounded-r2 border text-left transition-colors",
              lente === f.id
                ? "border-brand-edge bg-brand-wash"
                : "border-line bg-panel-2 hover:border-line-2",
            )}
          >
            <span className="text-[12.5px] font-semibold text-ink whitespace-nowrap">
              {f.rotulo}
            </span>
            <span className="flex items-baseline gap-1.5">
              <b className="num text-[17px] font-semibold leading-none">{count(f.n)}</b>
              {f.valor && (
                <em className="num not-italic text-[11.5px] text-ink-3">{f.valor}</em>
              )}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => escolher("todos")}
          className={cn(
            "flex flex-col items-start gap-1 shrink-0 min-h-[62px] px-3.5 py-2.5 rounded-r2 border text-left transition-colors",
            lente === "todos"
              ? "border-brand-edge bg-brand-wash"
              : "border-line bg-panel-2 hover:border-line-2",
          )}
        >
          <span className="text-[12.5px] font-semibold text-ink">Todos</span>
          <b className="num text-[17px] font-semibold leading-none">{count(itens.length)}</b>
        </button>
      </div>

      {lente !== "todos" && definicao && (
        <div className="border-t border-line bg-panel-2 px-4 py-3">
          <p className="text-[12.5px] text-ink-2">
            <b className="font-semibold text-ink">Como calculei:</b> {definicao.regra}
          </p>
          <p className="mt-1 text-[12.5px] text-ink-2">
            <b className="font-semibold text-ink">O que fazer:</b> {definicao.acao}
          </p>
        </div>
      )}
    </Panel>
  );
}
