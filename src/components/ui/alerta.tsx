"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "./primitives";
import { AXIS } from "./chart";
import { money, count, pct } from "@/lib/format";
import type { Alerta } from "@/lib/dados/alertas";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, AlertCircle, Info, ArrowRight, ChevronDown } from "lucide-react";

/**
 * Alerta com a prova ao lado da afirmação.
 *
 * O gráfico não é enfeite: ele responde a pergunta que todo alerta provoca
 * — "isso é novo ou sempre foi assim?". Sem a série, quem lê precisa abrir
 * outra tela para descobrir, e depois de algumas vezes para de abrir.
 *
 * O texto vem antes do número de propósito. Número sozinho ainda exige
 * interpretação, e interpretar é o trabalho que o sistema deveria estar
 * fazendo.
 */

const TOM = {
  critico: { icone: AlertCircle, cor: "text-down", fundo: "bg-down-wash", badge: "down" as const },
  atencao: { icone: AlertTriangle, cor: "text-warn", fundo: "bg-warn-wash", badge: "warn" as const },
  info: { icone: Info, cor: "text-info", fundo: "bg-info-wash", badge: "info" as const },
};

const ROTULO = { critico: "Crítico", atencao: "Atenção", info: "Informativo" };

/*
 * Linha compacta, como na referência aprovada de Alertas: ícone, selo,
 * título, resumo em números e "Investigar" — escaneável numa lista. A
 * leitura e o gráfico (a prova) continuam ali, na segunda camada: um clique
 * abre. Antes cada alerta ocupava ~300px e cinco deles enchiam a tela.
 */
export function CartaoAlerta({ alerta }: { alerta: Alerta }) {
  const t = TOM[alerta.severidade];
  const Icone = t.icone;
  const [aberto, setAberto] = React.useState(false);
  /*
   * O id do degradê vem de useId, não do id do alerta: este é
   * "cancelamento-<nome do canal>", e nome com espaço ("Madeira Madeira")
   * quebra o url(#…) — o preenchimento caía em cinza chapado.
   */
  const gid = "g" + React.useId().replace(/[^a-zA-Z0-9]/g, "");

  const formatar = React.useCallback(
    (v: number) =>
      alerta.formato === "moeda"
        ? money(v)
        : alerta.formato === "percentual"
        ? pct(v, 2)
        : count(v),
    [alerta.formato]
  );

  const cor =
    alerta.severidade === "critico"
      ? "var(--down)"
      : alerta.severidade === "atencao"
      ? "var(--warn)"
      : "var(--info)";

  return (
    <div className="panel">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", t.fundo)}>
          <Icone className={cn("h-[18px] w-[18px]", t.cor)} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={t.badge}>{ROTULO[alerta.severidade]}</Badge>
            <p className="text-[14px] font-semibold text-ink leading-snug min-w-0">{alerta.titulo}</p>
          </div>
          <p className="num mt-1 text-[12.5px] text-ink-2 truncate">
            {alerta.numeros.map((n) => `${n.rotulo} ${n.valor}`).join(" · ")}
          </p>
        </div>
        {alerta.destino && (
          <Link
            href={alerta.destino.href}
            className="hidden sm:inline-flex h-9 shrink-0 items-center gap-1 rounded-r1 border border-line-2 bg-panel px-3 text-[12.5px] font-medium text-ink hover:bg-panel-3"
          >
            Investigar
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-label={aberto ? "Esconder detalhes" : "Ver detalhes e evolução"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-r1 text-ink-3 hover:bg-panel-3 hover:text-ink"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
        </button>
      </div>

      {aberto && (
        <div className="border-t border-line px-4 py-3 sm:pl-[68px]">
          <p className="text-[13px] text-ink-2 leading-relaxed">{alerta.leitura}</p>

          {alerta.evidencia.length > 1 && (
            <div className="mt-3 h-[110px] -ml-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={alerta.evidencia} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cor} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={cor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="rotulo" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} width={38} tickFormatter={(v) => formatar(Number(v))} hide />
                  <Tooltip
                    cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="panel px-2.5 py-1.5" style={{ boxShadow: "var(--sh-3)" }}>
                          <p className="num text-[12px] text-ink-3">{String(label)}</p>
                          <p className="num text-[12px] font-semibold text-ink">{formatar(Number(payload[0].value))}</p>
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="valor" stroke={cor} strokeWidth={1.75} fill={`url(#${gid})`} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {alerta.destino && (
            <Link
              href={alerta.destino.href}
              className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline underline-offset-2"
            >
              {alerta.destino.texto}
              <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
