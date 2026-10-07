"use client";

import * as React from "react";
import { AlertCircle, AlertTriangle, ListChecks } from "lucide-react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel } from "@/components/ui/primitives";
import { TudoCerto } from "@/components/ui/leitura";
import { CartaoAlerta } from "@/components/ui/alerta";
import { count } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DadosAlertas } from "@/lib/dados/alertas";
import { PainelExclusoes } from "@/components/ui/exclusoes";

type Filtro = "todos" | "critico" | "atencao";

/*
 * Layout da referência aprovada de Alertas: resumo por severidade, filtro
 * em pílulas com contagem e lista escaneável. O painel lateral de "Regras e
 * notificações" da referência fica de fora de propósito — o sistema não tem
 * regra configurável nem envio por e-mail/WhatsApp, e o pacote do redesenho
 * proíbe inventar funcionalidade.
 */
export default function Alertas({ dados }: { dados: DadosAlertas }) {
  const { alertas } = dados;
  const [filtro, setFiltro] = React.useState<Filtro>("todos");

  const visiveis = React.useMemo(
    () => (filtro === "todos" ? alertas : alertas.filter((a) => a.severidade === filtro)),
    [alertas, filtro]
  );

  const criticos = alertas.filter((a) => a.severidade === "critico").length;
  const atencao = alertas.filter((a) => a.severidade === "atencao").length;

  const resumo = [
    { rotulo: "Críticos", valor: criticos, icone: AlertCircle, cor: "text-down", fundo: "bg-down-wash" },
    { rotulo: "Atenção", valor: atencao, icone: AlertTriangle, cor: "text-warn", fundo: "bg-warn-wash" },
    { rotulo: "Achados no total", valor: alertas.length, icone: ListChecks, cor: "text-info", fundo: "bg-info-wash" },
  ];
  const pilulas: { valor: Filtro; rotulo: string; n: number }[] = [
    { valor: "todos", rotulo: "Todos", n: alertas.length },
    { valor: "critico", rotulo: "Críticos", n: criticos },
    { valor: "atencao", rotulo: "Atenção", n: atencao },
  ];

  return (
    <>
      <PageHeader
        title="Alertas"
        breadcrumb="Operação"
        description={
          alertas.length
            ? `${count(alertas.length)} achados · ${count(criticos)} críticos`
            : "Nada exige atenção agora"
        }
      />

      <PageBody>
        {alertas.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {resumo.map((r) => (
              <Panel key={r.rotulo} className="flex items-center gap-3 px-4 py-3.5">
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", r.fundo)}>
                  <r.icone className={cn("h-5 w-5", r.cor)} strokeWidth={2.25} />
                </span>
                <span>
                  <span className="block text-[12px] text-ink-2">{r.rotulo}</span>
                  <span className="num block text-[24px] font-semibold leading-tight text-ink">{count(r.valor)}</span>
                </span>
              </Panel>
            ))}
          </div>
        )}

        {/* Fica antes da lista: quem chega precisa saber que ela já é um
            recorte antes de ler o primeiro alerta. */}
        <PainelExclusoes
          exclusoes={dados.exclusoes}
          canais={dados.canaisDisponiveis}
          removidas={dados.removidas}
        />

        {alertas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtrar por severidade">
            {pilulas.map((p) => (
              <button
                key={p.valor}
                type="button"
                role="tab"
                aria-selected={filtro === p.valor}
                onClick={() => setFiltro(p.valor)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                  filtro === p.valor
                    ? "border-brand bg-brand-wash text-brand"
                    : "border-line-2 bg-panel text-ink-2 hover:text-ink"
                )}
              >
                {p.rotulo}
                <span className="num rounded-full bg-panel-3 px-1.5 text-[12px] text-ink-2">{p.n}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {visiveis.length === 0 ? (
            <Panel>
              <TudoCerto
                titulo={
                  alertas.length
                    ? "Nenhum alerta nesta severidade"
                    : "Nada exige sua atenção"
                }
                detalhe={
                  alertas.length
                    ? "Troque o filtro para ver os demais."
                    : "Cancelamento, receita e conversão estão dentro do padrão do período. Este estado também é uma resposta — não precisa procurar."
                }
              />
            </Panel>
          ) : (
            visiveis.map((a) => <CartaoAlerta key={a.id} alerta={a} />)
          )}
        </div>
      </PageBody>
    </>
  );
}
