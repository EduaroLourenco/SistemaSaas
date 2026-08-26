"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, Badge } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import {
  INTEGRACOES,
  GRUPOS_INTEGRACAO,
  type Integracao,
} from "@/mock/sistema";
import { count } from "@/lib/format";
import { Info, Plug, RefreshCw, Settings, CircleAlert } from "lucide-react";

const STATUS_TOM = {
  conectada: "up",
  desconectada: "neutral",
  erro: "down",
} as const;

const STATUS_ROTULO = {
  conectada: "Conectado",
  desconectada: "Não conectado",
  erro: "Erro",
} as const;

function CartaoIntegracao({ i }: { i: Integracao }) {
  return (
    <div className="panel panel-1 flex flex-col">
      <div className="px-4 pt-3.5 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink truncate">{i.nome}</p>
          <p className="text-[12px] text-ink-3 mt-0.5 leading-snug">
            {i.sincroniza}
          </p>
        </div>
        <Badge tone={STATUS_TOM[i.status]}>{STATUS_ROTULO[i.status]}</Badge>
      </div>

      <div className="px-4 pb-3 mt-auto">
        {i.status === "erro" && i.erro && (
          <div className="flex gap-2 mb-3 px-2.5 py-2 rounded-r1 bg-down-wash">
            <CircleAlert
              className="w-3.5 h-3.5 text-down shrink-0 mt-px"
              strokeWidth={2}
            />
            <p className="text-[11px] text-ink-2">{i.erro}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
          <span className="min-w-0">
            <span className="block text-[11px] text-ink-2 truncate">
              {i.resumo}
            </span>
            {i.status === "conectada" && (
              <span className="num block text-[11px] text-ink-3">
                sincronizado {i.ultimaSincronizacao}
              </span>
            )}
          </span>
          <Button size="sm" variant={i.status === "conectada" ? "default" : "primary"}>
            {i.status === "conectada" ? (
              <>
                <Settings className="w-3.5 h-3.5" />
                Configurar
              </>
            ) : i.status === "erro" ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Reconectar
              </>
            ) : (
              <>
                <Plug className="w-3.5 h-3.5" />
                Conectar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Integracoes() {
  const conectadas = INTEGRACOES.filter((i) => i.status === "conectada").length;
  const comErro = INTEGRACOES.filter((i) => i.status === "erro").length;

  return (
    <>
      <PageHeader
        title="Integrações"
        description="Conectores que alimentam o sistema automaticamente"
        actions={
          <Button size="sm" variant="primary">
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sincronizar tudo</span>
          </Button>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Conectadas"
            value={count(conectadas)}
            hint={`de ${INTEGRACOES.length} disponíveis`}
          />
          <StatTile
            label="Com erro"
            value={count(comErro)}
            delta={comErro > 0 ? 100 : 0}
            inverse
            hint="precisam de atenção"
          />
          <StatTile label="Última sincronização" value="há 5 min" hint="VTEX" />
          <StatTile
            label="Próxima janela"
            value="em 48 min"
            hint="a cada hora"
          />
        </div>

        <Panel className="px-4 py-3 flex gap-2.5">
          <Info className="w-4 h-4 text-ink-3 shrink-0 mt-px" strokeWidth={1.75} />
          <p className="text-[12px] text-ink-2">
            Enquanto um canal não estiver conectado, os números dele entram por
            planilha na tela de{" "}
            <span className="font-medium text-ink">Vendas · Lançamentos</span>. A
            conexão não apaga o que já foi lançado à mão — ela passa a preencher os
            dias seguintes e marca a origem de cada linha.
          </p>
        </Panel>

        {GRUPOS_INTEGRACAO.map((grupo) => {
          const itens = INTEGRACOES.filter((i) => i.grupo === grupo);
          return (
            <div key={grupo} className="space-y-3">
              <SectionTitle
                title={grupo}
                hint={`${itens.filter((i) => i.status === "conectada").length} de ${
                  itens.length
                } conectados`}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {itens.map((i) => (
                  <CartaoIntegracao key={i.id} i={i} />
                ))}
              </div>
            </div>
          );
        })}
      </PageBody>
    </>
  );
}
