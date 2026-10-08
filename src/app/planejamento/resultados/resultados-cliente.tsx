"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Target } from "lucide-react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge, EmptyState } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { Disclosure } from "@/components/ui/disclosure";
import { money, count } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DadosResultados, LinhaResultado, Veredito } from "@/lib/dados/planejamento-resultados";

const TOM: Record<Veredito, "up" | "neutral" | "down" | "info"> = {
  "deu certo": "up",
  neutra: "neutral",
  "não deu certo": "down",
  "sem base": "info",
  futura: "info",
  "sem recorte": "neutral",
};

type Filtro = "medidas" | "deu certo" | "não deu certo" | "todas";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const pc = (v: number | null) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

/**
 * Resultados das campanhas e ações do planejamento, todas de uma vez.
 *
 * A pergunta de cada linha é "deu certo?", e a resposta não é o
 * crescimento da ação sozinho — é quanto ela cresceu ACIMA do resto do
 * canal no mesmo período. É o que separa efeito da campanha de maré.
 */
export default function ResultadosCliente({ dados }: { dados: DadosResultados }) {
  const [filtro, setFiltro] = React.useState<Filtro>("medidas");
  const medidas = dados.linhas.filter((l) => l.efeito != null || l.crescimento != null);
  const contagem = (v: Veredito) => dados.linhas.filter((l) => l.veredito === v).length;
  const visiveis = dados.linhas.filter((l) =>
    filtro === "todas" ? true : filtro === "medidas" ? medidas.includes(l) : l.veredito === filtro
  );

  return (
    <>
      <PageHeader
        title="Resultados das campanhas"
        breadcrumb="Planejamento"
        description="Cada ação contra o período anterior, descontado o que o resto do canal fez sozinho"
        actions={
          <Link
            href="/planejamento"
            className="inline-flex h-9 items-center gap-1.5 rounded-r1 border border-line-2 bg-panel px-3 text-[12px] font-medium text-ink hover:bg-panel-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Planejamento
          </Link>
        }
      />
      <PageBody>
        {dados.aviso && (
          <Panel className="px-4 py-3 border-warn/40">
            <p className="text-[13px] text-ink-2">{dados.aviso}</p>
          </Panel>
        )}
        {dados.linhas.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Target}
              title="Nenhuma ação planejada"
              description="Crie campanhas no Planejamento, com produtos ou canais escolhidos, e o resultado aparece aqui quando o período começar."
            />
          </Panel>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Contador rotulo="Deram certo" valor={contagem("deu certo")} tom="text-up" />
              <Contador rotulo="Neutras" valor={contagem("neutra")} tom="text-ink" />
              <Contador rotulo="Não deram certo" valor={contagem("não deu certo")} tom="text-down" />
              <Contador
                rotulo="Ainda sem medida"
                valor={contagem("futura") + contagem("sem base") + contagem("sem recorte")}
                tom="text-ink-3"
              />
            </div>

            <Disclosure title="Como o resultado é medido">
              <p>
                Cada ação é comparada com o período imediatamente anterior, do mesmo tamanho. Mas crescer contra o
                período anterior não basta: se o canal inteiro cresceu junto (data comemorativa, frete grátis do
                canal), a campanha não fez a diferença. Por isso a ação é medida contra o <strong>resto do canal</strong>{" "}
                — o que não estava nela — nas mesmas datas. Ação que escolhe só canal, sem produto, é medida contra
                os outros canais.
              </p>
              <p className="mt-2">
                <strong>Efeito</strong> = crescimento da ação − crescimento do resto, em pontos percentuais.{" "}
                <strong>Deu certo</strong> a partir de +10 p.p.; <strong>não deu certo</strong> a partir de −10 p.p.;
                entre os dois, <strong>neutra</strong> (a diferença cabe na oscilação normal de uma semana para
                outra). Receita é a de pedidos não cancelados, fora os períodos excluídos da análise.
              </p>
            </Disclosure>

            <Panel className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <Segmented
                  options={[
                    { value: "medidas" as Filtro, label: "Com resultado" },
                    { value: "deu certo" as Filtro, label: "Deram certo" },
                    { value: "não deu certo" as Filtro, label: "Não deram" },
                    { value: "todas" as Filtro, label: "Todas" },
                  ]}
                  value={filtro}
                  onChange={setFiltro}
                />
              </div>
              {visiveis.length === 0 ? (
                <p className="px-4 py-6 text-[13px] text-ink-3">Nada neste filtro.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {visiveis.map((l) => (
                    <Linha key={l.id} l={l} />
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
      </PageBody>
    </>
  );
}

function Contador({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: string }) {
  return (
    <Panel className="px-4 py-3">
      <p className={cn("num text-[24px] font-semibold leading-none", tom)}>{count(valor)}</p>
      <p className="mt-1.5 text-[12px] text-ink-3">{rotulo}</p>
    </Panel>
  );
}

function Linha({ l }: { l: LinhaResultado }) {
  return (
    <li className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_8rem] md:items-center md:gap-4">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-ink">{l.titulo}</p>
        <p className="num text-[12px] text-ink-3">
          {l.natureza === "campanha" ? "Campanha" : l.tipo || "Ação"} · {dataBr(l.inicio)} a {dataBr(l.fim)}
          {l.skus > 0 && ` · ${l.skus} produto(s)`}
          {l.parcial && l.veredito !== "futura" && " · em andamento"}
        </p>
        <p className="mt-1 text-[12px] leading-snug text-ink-2">{l.leitura}</p>
      </div>
      <Numero
        rotulo="Receita"
        valor={l.atual ? money(l.atual.receita) : "—"}
        sub={l.anterior ? `antes ${money(l.anterior.receita)}` : ""}
      />
      <Numero rotulo="Ação" valor={pc(l.crescimento)} sub={`resto ${pc(l.crescimentoResto)}`} />
      <Numero
        rotulo="Efeito"
        valor={
          l.efeito == null
            ? "—"
            : `${l.efeito > 0 ? "+" : ""}${l.efeito.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} p.p.`
        }
        destaque={l.efeito == null ? undefined : l.efeito >= 10 ? "text-up" : l.efeito <= -10 ? "text-down" : undefined}
        sub={l.atual ? `${count(l.atual.unidades)} un · ${count(l.atual.pedidos)} ped.` : ""}
      />
      <div className="md:text-right">
        <Badge tone={TOM[l.veredito]}>{l.veredito}</Badge>
      </div>
    </li>
  );
}

function Numero({ rotulo, valor, sub, destaque }: { rotulo: string; valor: string; sub: string; destaque?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 md:block md:text-right">
      <span className="text-[11px] text-ink-3 md:hidden">{rotulo}</span>
      <span>
        <span className={cn("num block text-[13px] font-semibold text-ink", destaque)}>{valor}</span>
        <span className="num block text-[11px] text-ink-3">{sub}</span>
      </span>
    </div>
  );
}
