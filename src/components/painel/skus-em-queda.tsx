"use client";

import * as React from "react";
import Link from "next/link";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { AXIS, GRID } from "@/components/ui/chart";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SkuEmQueda } from "@/lib/dados/recomendacoes";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight, ChevronDown, ArrowRight } from "lucide-react";

/**
 * SKUs que caíram, com o que mudou dentro deles.
 *
 * Saber que caiu não resolve; saber POR QUE caiu resolve. Receita é
 * visita × conversão × preço, então a tela mostra as três séries lado a
 * lado — a que despencou é a explicação.
 *
 * A causa provável vem calculada, não escrita: "perdeu visitas" só
 * aparece quando as visitas caíram e a conversão não. Frase fixa por tipo
 * de card seria adivinhação com cara de diagnóstico.
 */

type Metrica = "receita" | "visitas" | "conversao" | "preco";

const METRICAS: { value: Metrica; label: string }[] = [
  { value: "receita", label: "Receita" },
  { value: "visitas", label: "Visitas" },
  { value: "conversao", label: "Conversão" },
  { value: "preco", label: "Preço pago" },
];

const FORMATO: Record<Metrica, (v: number) => string> = {
  receita: money,
  visitas: count,
  conversao: (v) => pct(v, 2),
  preco: money,
};

const CORES_CURVA: Record<string, "up" | "brand" | "neutral"> = {
  A: "up",
  B: "brand",
  C: "neutral",
};

function Variacao({ v, menorMelhor }: { v: number | null; menorMelhor?: boolean }) {
  if (v == null) return <span className="text-ink-3">—</span>;
  const bom = menorMelhor ? v < 0 : v > 0;
  return (
    <span className={cn("num text-[12px]", bom ? "text-up" : "text-down")}>
      {v > 0 ? "+" : ""}
      {v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
    </span>
  );
}

export function SkusEmQueda({ itens }: { itens: SkuEmQueda[] }) {
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [metrica, setMetrica] = React.useState<Metrica>("receita");
  const [curva, setCurva] = React.useState("todas");

  const filtrados = React.useMemo(
    () => (curva === "todas" ? itens : itens.filter((i) => i.curva === curva)),
    [itens, curva]
  );

  if (!itens.length) {
    return (
      <Panel className="px-4 py-5">
        <p className="text-[13px] font-semibold text-ink">Nenhum SKU em queda</p>
        <p className="text-[12.5px] text-ink-2 mt-1">
          Nada caiu mais de 10% comparando a segunda metade das semanas contra a
          primeira.
        </p>
      </Panel>
    );
  }

  const selecionado = filtrados.find((i) => i.sku === aberto) ?? null;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="SKUs em queda"
        hint="segunda metade das semanas contra a primeira · curva A primeiro"
        action={
          <span className="flex items-center gap-2">
            <Segmented
              options={[
                { value: "todas", label: "Todas" },
                { value: "A", label: "A" },
                { value: "B", label: "B" },
                { value: "C", label: "C" },
              ]}
              value={curva}
              onChange={setCurva}
            />
          </span>
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left px-3 py-2 min-w-[240px]">
                <span className="label">SKU · produto</span>
              </th>
              <th className="text-right px-3 py-2"><span className="label">Receita</span></th>
              <th className="text-right px-3 py-2"><span className="label">Visitas</span></th>
              <th className="text-right px-3 py-2"><span className="label">Conversão</span></th>
              <th className="text-right px-3 py-2"><span className="label">Preço</span></th>
              <th className="text-left px-3 py-2 min-w-[150px]">
                <span className="label">Causa provável</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((s) => {
              const expandido = aberto === s.sku;
              return (
                <React.Fragment key={s.sku}>
                  <tr
                    onClick={() => setAberto(expandido ? null : s.sku)}
                    className="border-b border-line cursor-pointer hover:bg-panel-2"
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-start gap-1.5">
                        {expandido ? (
                          <ChevronDown className="w-3.5 h-3.5 text-ink-3 mt-0.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-ink-3 mt-0.5 shrink-0" />
                        )}
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="num text-[12px] font-semibold text-ink">
                              {s.sku}
                            </span>
                            <Badge tone={CORES_CURVA[s.curva]}>{s.curva}</Badge>
                          </span>
                          <span className="text-[11.5px] text-ink-2 block truncate max-w-[280px]">
                            {s.titulo}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Variacao v={s.variacaoReceita} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Variacao v={s.variacaoVisitas} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Variacao v={s.variacaoConversao} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Variacao v={s.variacaoPreco} />
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone="warn">{s.causaProvavel}</Badge>
                    </td>
                  </tr>

                  {expandido && (
                    <tr className="border-b border-line bg-panel-2">
                      <td colSpan={6} className="px-3 py-3">
                        <span className="flex items-center justify-between gap-3 mb-2">
                          <Segmented
                            options={METRICAS}
                            value={metrica}
                            onChange={setMetrica}
                          />
                          <Link
                            href={`/anuncios/analise?anuncio=${s.mlb}`}
                            className="text-[12.5px] text-brand hover:underline flex items-center gap-1"
                          >
                            Abrir o anúncio
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </span>

                        <div className="h-[190px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={s.semanas}
                              margin={{ top: 6, right: 10, left: 0, bottom: 0 }}
                            >
                              <CartesianGrid {...GRID} />
                              <XAxis dataKey="semana" {...AXIS} />
                              <YAxis
                                {...AXIS}
                                width={58}
                                domain={["auto", "auto"]}
                                tickFormatter={(v: number) => FORMATO[metrica](v)}
                              />
                              <Tooltip
                                cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }}
                                content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  const v = payload[0].value;
                                  return (
                                    <div
                                      className="panel px-2.5 py-2"
                                      style={{ boxShadow: "var(--sh-3)" }}
                                    >
                                      <p className="num text-[11px] text-ink-3 mb-0.5">
                                        {String(label ?? "")}
                                      </p>
                                      <p className="num text-[13px] font-semibold text-ink">
                                        {v == null ? "sem venda" : FORMATO[metrica](Number(v))}
                                      </p>
                                    </div>
                                  );
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey={metrica}
                                stroke="var(--brand)"
                                strokeWidth={2}
                                dot={{ r: 3, strokeWidth: 0, fill: "var(--brand)" }}
                                /*
                                 * Semana sem venda não vira zero na linha:
                                 * o gráfico mostra o buraco em vez de
                                 * desenhar uma queda a zero que não houve.
                                 */
                                connectNulls={false}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
