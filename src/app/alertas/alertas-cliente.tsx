"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { EmptyState, Panel } from "@/components/ui/primitives";
import { CartaoAlerta } from "@/components/ui/alerta";
import { count } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DadosAlertas } from "@/lib/dados/alertas";
import { PainelExclusoes } from "@/components/ui/exclusoes";

type Filtro = "todos" | "critico" | "atencao";

export default function Alertas({ dados }: { dados: DadosAlertas }) {
  const { alertas } = dados;
  const [filtro, setFiltro] = React.useState<Filtro>("todos");

  const visiveis = React.useMemo(
    () => [...(filtro === "todos" ? alertas : alertas.filter((a) => a.severidade === filtro))].sort((a, b) => ({critico: 0, atencao: 1, info: 2}[a.severidade] - {critico: 0, atencao: 1, info: 2}[b.severidade])),
    [alertas, filtro]
  );

  const criticos = alertas.filter((a) => a.severidade === "critico").length;
  const atencao = alertas.filter((a) => a.severidade === "atencao").length;

  const pilulas: { valor: Filtro; rotulo: string; n: number }[] = [
    { valor: "todos", rotulo: "Todos", n: alertas.length },
    { valor: "critico", rotulo: "Críticos", n: criticos },
    { valor: "atencao", rotulo: "Atenção", n: atencao },
  ];

  return (
    <>
      <PageHeader title="Alertas" />

      <PageBody>
        {alertas.length > 0 && (
          <section aria-label="Resumo dos alertas" className="flex flex-wrap items-end gap-x-8 gap-y-5 border-b border-line pb-6 md:gap-x-12">
            <div className="min-w-0">
              <p className="mb-2 text-[14px] font-medium text-ink-2">Críticos</p>
              <p className={cn("num text-[48px] font-semibold leading-[56px] tracking-[-0.045em]", criticos ? "text-down" : "text-ink")}>{count(criticos)}</p>
            </div>
            <dl className="flex min-w-0 flex-wrap gap-x-8 gap-y-4 pb-1">
              <div>
                <dt className="mb-2 text-[14px] text-ink-2">Atenção</dt>
                <dd className={cn("num text-[28px] font-semibold leading-9 tracking-tight", atencao ? "text-warn" : "text-ink")}>{count(atencao)}</dd>
              </div>
              <div>
                <dt className="mb-2 text-[14px] text-ink-2">Achados no total</dt>
                <dd className="num text-[28px] font-semibold leading-9 tracking-tight text-ink">{count(alertas.length)}</dd>
              </div>
            </dl>
          </section>
        )}

        {/* Fica antes da lista: quem chega precisa saber que ela já é um
            recorte antes de ler o primeiro alerta. */}
        <PainelExclusoes
          exclusoes={dados.exclusoes}
          canais={dados.canaisDisponiveis}
          removidas={dados.removidas}
        />

        {alertas.length > 0 && (
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por severidade">
            {pilulas.map((p) => (
              <button
                key={p.valor}
                type="button"
                aria-pressed={filtro === p.valor}
                onClick={() => setFiltro(p.valor)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-r1 border px-4 text-[14px] font-medium transition-colors",
                  filtro === p.valor
                    ? "border-brand bg-brand-wash text-brand"
                    : "border-line-2 bg-panel text-ink-2 hover:text-ink"
                )}
              >
                {p.rotulo}
                <span className="num text-[14px] opacity-80">{count(p.n)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="min-w-0" aria-live="polite" aria-atomic="false">
          {visiveis.length === 0 ? (
            <Panel>
              <EmptyState
                title={
                  alertas.length
                    ? "Nenhum alerta nesta severidade"
                    : "Nenhum alerta encontrado"
                }
                description={
                  alertas.length
                    ? "Troque o filtro para ver os demais."
                    : "Nenhum achado nos dados disponíveis. A cobertura das fontes pode ser conferida em Fontes de dados."
                }
                action={!alertas.length && <Link href="/integracoes" className="inline-flex min-h-11 items-center rounded-r1 px-3 text-[14px] font-medium text-brand hover:bg-brand-wash">Ver fontes de dados</Link>}
              />
            </Panel>
          ) : (
            <Panel className="divide-y divide-line overflow-hidden">
              {visiveis.map((a) => <CartaoAlerta key={a.id} alerta={a} emLista />)}
            </Panel>
          )}
        </div>
      </PageBody>
    </>
  );
}
