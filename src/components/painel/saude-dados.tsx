"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Panel, Badge } from "@/components/ui/primitives";
import type { Estado, Verificacao } from "@/lib/dados/saude";

const TOM: Record<Estado, "up" | "warn" | "down"> = { ok: "up", atencao: "warn", problema: "down" };
const ROTULO: Record<Estado, string> = { ok: "ok", atencao: "atenção", problema: "problema" };

/**
 * As verificações de saúde, uma por linha: a pergunta, o selo e a resposta.
 * O detalhe (conta a conta) abre com um clique — no dia a dia só interessa
 * saber se há alguma coisa amarela ou vermelha.
 */
export function SaudeDados({ verificacoes }: { verificacoes: Verificacao[] }) {
  const problemas = verificacoes.filter((v) => v.estado !== "ok").length;
  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[15px] font-semibold text-ink">Saúde dos dados</p>
        <p className="text-[12px] text-ink-3">
          {problemas
            ? `${problemas} ponto(s) para olhar. Enquanto estiverem amarelos ou vermelhos, algumas telas mostram menos do que aconteceu.`
            : "Tudo em dia: as telas mostram o que aconteceu."}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {verificacoes.map((v) => (
          <Linha key={v.id} v={v} />
        ))}
      </ul>
    </Panel>
  );
}

function Linha({ v }: { v: Verificacao }) {
  const [aberta, setAberta] = React.useState(v.estado !== "ok" && v.detalhes.length <= 8);
  const Seta = aberta ? ChevronDown : ChevronRight;
  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => setAberta((a) => !a)}
        disabled={!v.detalhes.length}
        aria-expanded={aberta}
        className="flex w-full items-start gap-2 text-left"
      >
        {v.detalhes.length ? <Seta className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" /> : <span className="w-4 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-ink">{v.pergunta}</span>
            <Badge tone={TOM[v.estado]}>{ROTULO[v.estado]}</Badge>
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">{v.resposta}</span>
        </span>
      </button>
      {aberta && v.detalhes.length > 0 && (
        <ul className="ml-6 mt-2 flex flex-col gap-1">
          {v.detalhes.map((d) => (
            <li key={d.nome} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]">
              <span className="flex min-w-0 items-center gap-1.5 text-ink">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: d.estado === "ok" ? "var(--up)" : d.estado === "atencao" ? "var(--warn)" : "var(--down)" }}
                />
                {d.nome}
              </span>
              <span className="num text-ink-2">{d.valor}</span>
            </li>
          ))}
        </ul>
      )}
      {v.link && v.estado !== "ok" && (
        <Link href={v.link.href} className="ml-6 mt-2 inline-block text-[12.5px] font-medium text-brand hover:underline">
          {v.link.rotulo}
        </Link>
      )}
    </li>
  );
}
