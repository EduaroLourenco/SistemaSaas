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

/** O que cada lente tem de dinheiro em jogo, e como dizer. */
const DINHEIRO: Partial<Record<Lente, (d: AnuncioAnalisado[]) => string>> = {
  sangrando: (d) => money(d.reduce((s, i) => s + i.metricas.subsidio, 0)),
  falsa_tracao: (d) => money(d.reduce((s, i) => s + i.metricas.subsidio, 0)),
  joias: (d) => money(d.reduce((s, i) => s + i.metricas.receita, 0)),
  desperdicio: (d) => `${count(d.reduce((s, i) => s + i.metricas.visitas, 0))} visitas`,
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
          valor: DINHEIRO[L.id]?.(dentro) ?? null,
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
      <div className="flex flex-wrap items-end gap-x-7 gap-y-4 px-4 pt-4 pb-3.5">
        <div className="flex flex-col gap-0.5">
          <b className="num text-[40px] sm:text-[44px] leading-[0.9] font-semibold tracking-tight text-down">
            {money(naMesa)}
          </b>
          <span className="text-[13px] text-ink-2">
            abaixo da tabela em {periodo} · {count(comSubsidio)} anúncios
          </span>
        </div>

        <div className="flex flex-wrap gap-x-7 gap-y-3 sm:ml-auto">
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

      {/* No telefone a fila rola dentro de si: quebrar em duas linhas de
          cartão empurra a tabela para fora da primeira tela. */}
      <div className="flex gap-2 px-4 pb-4 overflow-x-auto sm:flex-wrap sm:overflow-visible">
        {fichas.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => escolher(lente === f.id ? "todos" : f.id)}
            className={cn(
              "flex flex-col items-start gap-px shrink-0 min-h-[56px] px-3.5 py-2 rounded-r2 border text-left transition-colors",
              lente === f.id
                ? "border-brand-edge bg-brand-wash"
                : "border-line bg-panel-2 hover:border-line-2",
            )}
          >
            <b className="num text-[19px] font-semibold leading-tight">{count(f.n)}</b>
            <span className="text-[12px] text-ink-2 whitespace-nowrap">{f.rotulo}</span>
            {f.valor && <em className="num not-italic text-[11.5px] text-ink-3">{f.valor}</em>}
          </button>
        ))}
        <button
          type="button"
          onClick={() => escolher("todos")}
          className={cn(
            "flex flex-col items-start gap-px shrink-0 min-h-[56px] px-3.5 py-2 rounded-r2 border text-left transition-colors",
            lente === "todos"
              ? "border-brand-edge bg-brand-wash"
              : "border-line bg-panel-2 hover:border-line-2",
          )}
        >
          <b className="num text-[19px] font-semibold leading-tight">{count(itens.length)}</b>
          <span className="text-[12px] text-ink-2">Todos</span>
        </button>
      </div>

      {lente !== "todos" && definicao && (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pb-3.5 text-[12.5px] text-ink-2">
          <b className="font-semibold text-ink">{definicao.rotulo}</b>
          <span>{definicao.regra}</span>
          <span className="text-ink-3">· {definicao.acao}</span>
        </p>
      )}
    </Panel>
  );
}
