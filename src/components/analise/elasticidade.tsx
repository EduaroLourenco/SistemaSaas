"use client";

import * as React from "react";
import { Badge } from "@/components/ui/primitives";
import { AXIS, GRID } from "@/components/ui/chart";
import { money, count, pct } from "@/lib/format";
import type { AnuncioAnalisado } from "@/lib/analise";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Elasticidade preço × volume.
 *
 * Cada ponto é uma semana: onde o preço estava e quanto vendeu. O que
 * interessa é o FORMATO da nuvem, não cada ponto.
 *
 * Antes o sistema só dizia "elasticidade positiva: sim ou não". Isso não
 * ajuda a decidir preço. Aqui dá para ver quanto de volume se perde por
 * real subido — e quanto de preço se pode recuperar sem derrubar a venda.
 *
 * O aviso importante está no rodapé: correlação não é causa. Duas semanas
 * de Natal com preço alto e venda alta invertem o sinal sem nada a ver
 * com elasticidade.
 */

/** Regressão linear simples de vendas sobre preço. */
function regressao(pontos: { x: number; y: number }[]) {
  const n = pontos.length;
  if (n < 3) return null;

  const mx = pontos.reduce((s, p) => s + p.x, 0) / n;
  const my = pontos.reduce((s, p) => s + p.y, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of pontos) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;

  const inclinacao = sxy / sxx;
  // r² diz o quanto do movimento de vendas o preço explica.
  const r2 = (sxy * sxy) / (sxx * syy);

  return {
    inclinacao,
    intercepto: my - inclinacao * mx,
    r2,
    mediaPreco: mx,
    mediaVendas: my,
  };
}

export function Elasticidade({ item }: { item: AnuncioAnalisado }) {
  const dados = React.useMemo(
    () =>
      item.semanas
        .filter((w) => w.vendas > 0 && (w.precoRealizado ?? 0) > 0)
        .map((w) => ({
          x: w.precoRealizado!,
          y: w.vendas,
          semana: w.semana,
          intervalo: w.intervalo,
          visitas: w.visitas,
        })),
    [item.semanas]
  );

  const reg = React.useMemo(() => regressao(dados), [dados]);

  if (dados.length < 3) {
    return (
      <div className="px-4 py-3.5 border-b border-line">
        <p className="label mb-1.5">Preço e volume</p>
        <p className="text-[12px] text-ink-3">
          Poucas semanas com venda para desenhar a relação. São necessárias
          pelo menos três.
        </p>
      </div>
    );
  }

  const precos = dados.map((d) => d.x);
  const minP = Math.min(...precos);
  const maxP = Math.max(...precos);
  const faixa = maxP - minP;

  // Linha de tendência: dois pontos bastam para desenhar a reta.
  // A tupla é explícita porque `segment` exige exatamente dois pontos.
  const tendencia: [{ x: number; y: number }, { x: number; y: number }] | null =
    reg
      ? [
          { x: minP, y: reg.intercepto + reg.inclinacao * minP },
          { x: maxP, y: reg.intercepto + reg.inclinacao * maxP },
        ]
      : null;

  // Quanto de venda se perde a cada R$ 100 de aumento.
  const porCem = reg ? reg.inclinacao * 100 : 0;
  const confiavel = (reg?.r2 ?? 0) >= 0.5 && faixa / minP >= 0.03;

  const leitura = !reg
    ? null
    : !confiavel
      ? faixa / minP < 0.03
        ? "O preço quase não variou no período — sem variação não dá para medir reação."
        : "A nuvem está espalhada: o preço explica pouco do que aconteceu com as vendas. Outra coisa está mandando aqui — tráfego, campanha ou concorrência."
      : porCem < 0
        ? `A cada R$ 100 a mais no preço, o volume cai cerca de ${Math.abs(porCem).toFixed(1)} unidades por semana.`
        : `Nesta faixa o volume não caiu com o preço — subiu ${porCem.toFixed(1)} unidades a cada R$ 100. Costuma indicar que outra coisa puxou a venda, não o preço.`;

  return (
    <div className="px-4 py-3.5 border-b border-line">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="label">Preço e volume</p>
          <p className="text-[11px] text-ink-3 mt-0.5">
            cada ponto é uma semana · {dados.length} semanas com venda
          </p>
        </div>
        {reg && (
          <Badge tone={confiavel ? (porCem < 0 ? "warn" : "neutral") : "neutral"}>
            <span className="num">
              r² {reg.r2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </Badge>
        )}
      </div>

      <div className="h-[220px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid {...GRID} vertical />
            <XAxis
              type="number"
              dataKey="x"
              name="Preço"
              {...AXIS}
              domain={["dataMin - 30", "dataMax + 30"]}
              tickFormatter={(v: number) => money(v)}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Vendas"
              {...AXIS}
              width={38}
              domain={[0, "dataMax + 5"]}
            />

            {item.metricas.precoIdeal > 0 && (
              <ReferenceLine
                x={item.metricas.precoIdeal}
                stroke="var(--brand)"
                strokeDasharray="4 4"
                label={{
                  value: "ideal",
                  position: "top",
                  fill: "var(--brand)",
                  fontSize: 10,
                }}
              />
            )}

            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "var(--line-2)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof dados)[number];
                if (!d.semana) return null;
                return (
                  <div
                    className="panel px-2.5 py-2"
                    style={{ boxShadow: "var(--sh-3)" }}
                  >
                    <p className="num text-[11px] font-semibold text-ink-2">
                      {d.semana} · {d.intervalo}
                    </p>
                    <p className="num text-[12px] text-ink mt-1">
                      {money(d.x)} · {count(d.y)} un
                    </p>
                    <p className="num text-[11px] text-ink-3">
                      {count(d.visitas)} visitas ·{" "}
                      {pct((d.y / d.visitas) * 100, 2)}
                    </p>
                  </div>
                );
              }}
            />

            {/*
              A tendência é um SEGMENTO de referência, não um Scatter
              disfarçado. Tentar desenhar a reta com um Scatter de shape
              vazio impedia o scatter de verdade de renderizar — os pontos
              sumiam sem erro nenhum no console.
            */}
            {tendencia && (
              <ReferenceLine
                segment={tendencia}
                stroke="var(--ink-3)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                ifOverflow="extendDomain"
              />
            )}

            <Scatter data={dados} fill="var(--s1)" isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {leitura && (
        <p className="text-[12px] text-ink-2 mt-2 leading-relaxed">
          <span className="font-semibold text-ink">Leitura: </span>
          {leitura}
        </p>
      )}

      <p className="text-[11px] text-ink-3 mt-2">
        A faixa observada vai de {money(minP)} a {money(maxP)}. Fora dela é
        chute — e correlação não é causa: sazonalidade e campanha mexem nos
        dois eixos ao mesmo tempo.
      </p>
    </div>
  );
}
