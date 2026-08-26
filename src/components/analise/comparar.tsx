"use client";

import * as React from "react";
import { Badge, Button, Delta } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/controls";
import { AXIS, GRID } from "@/components/ui/chart";
import { money, count, pct } from "@/lib/format";
import type { AnuncioAnalisado } from "@/lib/analise";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Trophy } from "lucide-react";

/**
 * Comparação de anúncios lado a lado.
 *
 * O caso que motivou: o mesmo SKU vive em mais de um anúncio — Clássico e
 * Premium, conta de São Paulo e conta a prazo. Olhar um de cada vez não
 * responde qual configuração vende melhor; só a comparação direta responde.
 *
 * A leitura por linha marca o vencedor de cada métrica. Numa linha só é
 * opinião; em seis linhas, o padrão aparece.
 */

type Metrica = {
  chave: string;
  rotulo: string;
  valor: (a: AnuncioAnalisado) => number;
  formato: (v: number) => string;
  /** true quando menor é melhor. */
  menorMelhor?: boolean;
  dica?: string;
};

const METRICAS: Metrica[] = [
  {
    chave: "receita",
    rotulo: "Receita",
    valor: (a) => a.metricas.receita,
    formato: money,
  },
  {
    chave: "vendas",
    rotulo: "Unidades vendidas",
    valor: (a) => a.metricas.vendas,
    formato: count,
  },
  {
    chave: "visitas",
    rotulo: "Visitas",
    valor: (a) => a.metricas.visitas,
    formato: count,
  },
  {
    chave: "conversao",
    rotulo: "Conversão",
    valor: (a) => a.metricas.conversao,
    formato: (v) => pct(v, 2),
    dica: "Quantas visitas viraram venda",
  },
  {
    chave: "preco",
    rotulo: "Preço pago",
    valor: (a) => a.metricas.preco,
    formato: money,
    dica: "Média do que o cliente desembolsou",
  },
  {
    chave: "desvio",
    rotulo: "Desvio do ideal",
    valor: (a) => Math.abs(a.metricas.desvio),
    formato: (v) => pct(v),
    menorMelhor: true,
    dica: "Distância do preço alvo, em módulo",
  },
  {
    chave: "subsidio",
    rotulo: "Margem subsidiada",
    valor: (a) => a.metricas.subsidio,
    formato: money,
    menorMelhor: true,
    dica: "Quanto ficou na mesa por vender abaixo do ideal",
  },
  {
    chave: "comissao",
    rotulo: "Comissão do canal",
    valor: (a) => a.metricas.comissao,
    formato: (v) => pct(v),
    menorMelhor: true,
  },
];

const CORES = ["var(--s1)", "var(--s2)", "var(--s4)"];

export function CompararAnuncios({
  itens,
  onClose,
}: {
  itens: AnuncioAnalisado[];
  onClose: () => void;
}) {
  // Todas as semanas que aparecem em qualquer um dos anúncios.
  const semanas = React.useMemo(() => {
    const set = new Set<string>();
    for (const i of itens) for (const w of i.semanas) set.add(w.semana);
    return [...set].sort();
  }, [itens]);

  const serie = React.useMemo(
    () =>
      semanas.map((s) => {
        const linha: Record<string, string | number> = { semana: s };
        itens.forEach((i, idx) => {
          const w = i.semanas.find((x) => x.semana === s);
          linha[`a${idx}`] = w?.vendas ?? 0;
        });
        return linha;
      }),
    [semanas, itens]
  );

  /** Índice do vencedor de cada métrica, ou -1 no empate. */
  function vencedor(m: Metrica) {
    const valores = itens.map(m.valor);
    const alvo = m.menorMelhor ? Math.min(...valores) : Math.max(...valores);
    const quantos = valores.filter((v) => v === alvo).length;
    return quantos > 1 ? -1 : valores.indexOf(alvo);
  }

  const placar = React.useMemo(() => {
    const p = itens.map(() => 0);
    for (const m of METRICAS) {
      const v = vencedor(m);
      if (v >= 0) p[v] += 1;
    }
    return p;
  }, [itens]);

  const lider = placar.indexOf(Math.max(...placar));
  const empate = placar.filter((v) => v === placar[lider]).length > 1;

  return (
    <Sheet
      title="Comparar anúncios"
      subtitle={`${itens.length} anúncios · ${semanas.length} semanas`}
      onClose={onClose}
      width="760px"
      footer={
        <Button variant="primary" className="flex-1 max-sm:h-11" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {/* cabeçalho de cada anúncio */}
      <div
        className="grid border-b border-line"
        style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}
      >
        {itens.map((i, idx) => (
          <div
            key={i.mlb}
            className={
              "px-4 py-3 min-w-0 " + (idx > 0 ? "border-l border-line" : "")
            }
          >
            <span className="flex items-center gap-1.5 mb-1.5">
              <span
                className="w-2 h-2 rounded-[2px] shrink-0"
                style={{ background: CORES[idx % CORES.length] }}
              />
              <Badge tone={i.tipo === "Premium" ? "brand" : "neutral"}>
                {i.tipo}
              </Badge>
              {!empate && idx === lider && (
                <Badge tone="up">
                  <Trophy className="w-3 h-3 mr-0.5" strokeWidth={2.5} />
                  {placar[idx]}/{METRICAS.length}
                </Badge>
              )}
            </span>
            <p className="text-[13px] font-medium text-ink leading-snug line-clamp-2">
              {i.titulo}
            </p>
            <p className="num text-[11px] text-ink-3 mt-1">{i.mlb}</p>
            <p className="text-[11px] text-ink-3">{i.conta}</p>
          </div>
        ))}
      </div>

      {/* métricas linha a linha */}
      <div className="border-b border-line">
        {METRICAS.map((m) => {
          const v = vencedor(m);
          return (
            <div key={m.chave} className="px-4 py-2.5 border-b border-line last:border-0">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="label">{m.rotulo}</span>
                {m.dica && (
                  <span className="text-[11px] text-ink-3 truncate hidden sm:block">
                    {m.dica}
                  </span>
                )}
              </div>
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))`,
                }}
              >
                {itens.map((i, idx) => {
                  const val = m.valor(i);
                  const ganhou = idx === v;
                  return (
                    <span
                      key={i.mlb}
                      className={
                        "num text-[14px] px-2 py-1 rounded-r1 " +
                        (ganhou
                          ? "bg-up-wash text-up font-semibold"
                          : "text-ink-2")
                      }
                    >
                      {m.formato(val)}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* curva de vendas sobreposta */}
      <div className="px-4 py-3.5">
        <p className="label mb-2">Vendas por semana</p>
        <div className="h-[220px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="semana" {...AXIS} />
              <YAxis {...AXIS} width={34} />
              <Tooltip
                cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div
                      className="panel px-2.5 py-2 min-w-[190px]"
                      style={{ boxShadow: "var(--sh-3)" }}
                    >
                      <p className="num text-[11px] font-semibold text-ink-2 mb-1.5">
                        {String(label ?? "")}
                      </p>
                      {payload.map((p, k) => (
                        <div
                          key={k}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-[2px] shrink-0"
                              style={{ background: p.color }}
                            />
                            <span className="text-[11px] text-ink-2 truncate">
                              {p.name}
                            </span>
                          </span>
                          <span className="num text-[12px] font-semibold text-ink">
                            {count(Number(p.value))} un
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              {itens.map((i, idx) => (
                <Line
                  key={i.mlb}
                  type="monotone"
                  dataKey={`a${idx}`}
                  name={`${i.tipo} · ${i.conta}`}
                  stroke={CORES[idx % CORES.length]}
                  strokeWidth={1.75}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {!empate && (
          <p className="text-[12px] text-ink-2 mt-3 leading-relaxed">
            <span className="font-semibold text-ink">Leitura: </span>
            O anúncio {itens[lider].tipo} de {itens[lider].mlb} ({itens[lider].conta})
            venceu em <span className="num">{placar[lider]}</span> das{" "}
            <span className="num">{METRICAS.length}</span> métricas. Uma métrica
            isolada é ruído; o padrão no conjunto é que decide.
          </p>
        )}
      </div>
    </Sheet>
  );
}
