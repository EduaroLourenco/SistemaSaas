"use client";

import * as React from "react";
import Link from "next/link";
import { Panel, Badge, Delta } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import {
  MUDANCAS,
  RESUMO_MUDANCAS,
  FILTROS_MUDANCA,
  type Mudanca,
} from "@/mock/mudancas";
import {
  TrendingDown,
  TrendingUp,
  Tag,
  Package,
  Target,
  Percent,
  ChevronRight,
  Check,
} from "lucide-react";

/**
 * "Desde ontem" — o bloco que abre o dia.
 *
 * Substitui o topo de totais. Total do mês é número que você já sabia
 * ontem; o que muda decisão é a diferença. Cada linha leva direto ao
 * lugar de agir, e some quando você marca como resolvida.
 */

const ICONE: Record<Mudanca["tipo"], React.ElementType> = {
  venda: TrendingDown,
  preco: Tag,
  campanha: Percent,
  estoque: Package,
  meta: Target,
};

const TOM: Record<Mudanca["severidade"], string> = {
  critico: "bg-down-wash text-down",
  atencao: "bg-warn-wash text-warn",
  bom: "bg-up-wash text-up",
};

export function DesdeOntem() {
  const [filtro, setFiltro] = React.useState<string>("todos");
  const [resolvidas, setResolvidas] = React.useState<string[]>([]);

  const linhas = React.useMemo(
    () =>
      MUDANCAS.filter((m) => !resolvidas.includes(m.id)).filter(
        (m) => filtro === "todos" || m.tipo === filtro
      ),
    [filtro, resolvidas]
  );

  const restantes = MUDANCAS.length - resolvidas.length;

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-ink">Desde ontem</h2>
          <p className="text-[12px] text-ink-3 mt-0.5">
            {restantes === 0
              ? "Tudo revisado. Nada pedindo atenção agora."
              : `${restantes} coisas mudaram e pedem uma olhada`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {RESUMO_MUDANCAS.criticos > 0 && (
            <Badge tone="down">{RESUMO_MUDANCAS.criticos} críticos</Badge>
          )}
          {RESUMO_MUDANCAS.atencao > 0 && (
            <Badge tone="warn">{RESUMO_MUDANCAS.atencao} atenção</Badge>
          )}
          {RESUMO_MUDANCAS.bons > 0 && (
            <Badge tone="up">{RESUMO_MUDANCAS.bons} bons</Badge>
          )}
        </div>
      </div>

      <div className="px-3 pb-2.5 overflow-x-auto">
        <Segmented
          options={FILTROS_MUDANCA.map((f) => ({
            value: f.valor,
            label: f.rotulo,
          }))}
          value={filtro}
          onChange={setFiltro}
        />
      </div>

      {linhas.length === 0 ? (
        <div className="px-4 py-10 flex flex-col items-center text-center border-t border-line">
          <span className="w-9 h-9 rounded-r2 bg-up-wash text-up flex items-center justify-center mb-2.5">
            <Check className="w-4.5 h-4.5" strokeWidth={2.5} />
          </span>
          <p className="text-[13px] font-semibold text-ink">
            {resolvidas.length > 0 ? "Tudo revisado" : "Nada neste filtro"}
          </p>
          <p className="text-[12px] text-ink-3 mt-1 max-w-xs">
            {resolvidas.length > 0
              ? "Você passou por todas as mudanças do dia."
              : "Troque o filtro acima para ver os outros tipos."}
          </p>
          {resolvidas.length > 0 && (
            <button
              onClick={() => setResolvidas([])}
              className="mt-3 text-[12px] text-brand font-medium hover:underline"
            >
              Mostrar as {resolvidas.length} que revisei
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {linhas.map((m) => {
            const Icone = ICONE[m.tipo];
            return (
              <li key={m.id} className="group relative">
                <Link
                  href={m.href}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-panel-2 transition-colors"
                >
                  <span
                    className={
                      "w-7 h-7 rounded-r1 flex items-center justify-center shrink-0 " +
                      TOM[m.severidade]
                    }
                  >
                    {m.severidade === "bom" ? (
                      <TrendingUp className="w-3.5 h-3.5" strokeWidth={2.2} />
                    ) : (
                      <Icone className="w-3.5 h-3.5" strokeWidth={2.2} />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink truncate">
                      {m.titulo}
                    </span>
                    <span className="block text-[11px] text-ink-3 truncate mt-0.5">
                      {m.detalhe}
                    </span>
                  </span>

                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-right">
                      <span
                        className={
                          "num block text-[14px] font-semibold " +
                          (m.severidade === "bom"
                            ? "text-up"
                            : m.severidade === "critico"
                              ? "text-down"
                              : "text-ink")
                        }
                      >
                        {m.valor}
                      </span>
                      <span className="block text-[10px] text-ink-3">{m.quando}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-ink-3" />
                  </span>
                </Link>

                {/* marcar como revisada — some da lista sem sumir do sistema */}
                <button
                  onClick={() => setResolvidas((r) => [...r, m.id])}
                  title="Já vi isso"
                  className="absolute right-11 top-1/2 -translate-y-1/2 w-7 h-7 rounded-r1 hidden group-hover:flex items-center justify-center bg-panel border border-line text-ink-3 hover:text-up hover:border-up transition-colors"
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
