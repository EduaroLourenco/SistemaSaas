"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { TudoCerto } from "@/components/ui/leitura";
import { CartaoAlerta } from "@/components/ui/alerta";
import { count } from "@/lib/format";
import type { DadosAlertas } from "@/lib/dados/alertas";
import { PainelExclusoes } from "@/components/ui/exclusoes";

type Filtro = "todos" | "critico" | "atencao";

const FILTROS = [
  { value: "todos" as const, label: "Todos" },
  { value: "critico" as const, label: "Críticos" },
  { value: "atencao" as const, label: "Atenção" },
];

export default function Alertas({ dados }: { dados: DadosAlertas }) {
  const { alertas } = dados;
  const [filtro, setFiltro] = React.useState<Filtro>("todos");

  const visiveis = React.useMemo(
    () => (filtro === "todos" ? alertas : alertas.filter((a) => a.severidade === filtro)),
    [alertas, filtro]
  );

  const criticos = alertas.filter((a) => a.severidade === "critico").length;

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
        filters={
          alertas.length > 0 ? (
            <Segmented options={FILTROS} value={filtro} onChange={setFiltro} />
          ) : undefined
        }
      />

      <PageBody>
        <div className="flex flex-col gap-3 max-w-[820px]">
          {/* Fica no topo: quem chega precisa saber que a lista já é um
              recorte antes de ler o primeiro alerta. */}
          <PainelExclusoes
            exclusoes={dados.exclusoes}
            canais={dados.canaisDisponiveis}
            removidas={dados.removidas}
          />

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
