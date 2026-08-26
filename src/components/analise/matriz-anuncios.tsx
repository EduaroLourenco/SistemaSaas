"use client";

import * as React from "react";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { AXIS, GRID } from "@/components/ui/chart";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AnuncioAnalisado } from "@/lib/analise";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

/**
 * Anúncios em matriz: um SKU por linha, semanas nas colunas.
 *
 * A lista por anúncio responde "quanto vendeu"; não responde "o que mudou".
 * Aqui cada linha é uma faixa horizontal de oito semanas, então a queda ou
 * a subida aparece sem precisar abrir nada.
 *
 * O agrupamento é por SKU porque o mesmo produto costuma viver em mais de
 * um anúncio — Clássico e Premium, contas diferentes. Olhar MLB a MLB
 * divide a venda do mesmo produto em duas linhas e some com o total.
 */

type Metrica = "receita" | "vendas" | "visitas" | "conversao" | "preco";

const METRICAS: { value: Metrica; label: string }[] = [
  { value: "receita", label: "Receita" },
  { value: "vendas", label: "Unidades" },
  { value: "visitas", label: "Visitas" },
  { value: "conversao", label: "Conversão" },
  { value: "preco", label: "Preço pago" },
];

const FORMATO: Record<Metrica, (v: number) => string> = {
  receita: (v) => money(v),
  vendas: (v) => count(v),
  visitas: (v) => count(v),
  conversao: (v) => pct(v, 2),
  preco: (v) => money(v),
};

type Celula = { valor: number | null; temDado: boolean };

type Grupo = {
  chave: string;
  sku: string;
  titulo: string;
  mlbs: { mlb: string; tipo: string; conta: string }[];
  porSemana: Map<string, { receita: number; vendas: number; visitas: number }>;
  receita: number;
  vendas: number;
  /** Variação da última metade contra a primeira, em %. */
  tendencia: number | null;
};

function valorDe(
  g: Grupo,
  semana: string,
  m: Metrica
): Celula {
  const s = g.porSemana.get(semana);
  if (!s) return { valor: null, temDado: false };
  switch (m) {
    case "receita":
      return { valor: s.receita, temDado: true };
    case "vendas":
      return { valor: s.vendas, temDado: true };
    case "visitas":
      return { valor: s.visitas, temDado: true };
    case "conversao":
      return { valor: s.visitas ? (s.vendas * 100) / s.visitas : null, temDado: s.visitas > 0 };
    case "preco":
      // Sem venda não há preço pago. Zero aqui seria "vendeu de graça".
      return { valor: s.vendas ? s.receita / s.vendas : null, temDado: s.vendas > 0 };
  }
}

export function MatrizAnuncios({
  itens,
  semanas,
}: {
  itens: AnuncioAnalisado[];
  semanas: string[];
}) {
  const [metrica, setMetrica] = React.useState<Metrica>("receita");
  const [busca, setBusca] = React.useState("");
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [limite, setLimite] = React.useState(30);

  const grupos = React.useMemo(() => {
    const mapa = new Map<string, Grupo>();

    for (const a of itens) {
      // Sem SKU, o próprio MLB vira a chave — melhor uma linha isolada que
      // um balde "sem SKU" misturando produtos que não têm relação.
      const chave = a.sku?.trim() || a.mlb;
      const g =
        mapa.get(chave) ??
        ({
          chave,
          sku: a.sku?.trim() || "—",
          titulo: a.titulo,
          mlbs: [],
          porSemana: new Map(),
          receita: 0,
          vendas: 0,
          tendencia: null,
        } as Grupo);

      g.mlbs.push({ mlb: a.mlb, tipo: a.tipo, conta: a.conta });

      for (const w of a.semanas) {
        const at = g.porSemana.get(w.semana) ?? { receita: 0, vendas: 0, visitas: 0 };
        at.receita += w.receita;
        at.vendas += w.vendas;
        at.visitas += w.visitas;
        g.porSemana.set(w.semana, at);
      }
      g.receita += a.metricas.receita;
      g.vendas += a.metricas.vendas;
      mapa.set(chave, g);
    }

    /*
     * Tendência: média da segunda metade contra a da primeira.
     *
     * Comparar só a última semana com a anterior faz qualquer oscilação
     * virar "tendência". Metade contra metade precisa de movimento
     * sustentado para mudar de sinal.
     */
    const metade = Math.floor(semanas.length / 2);
    for (const g of mapa.values()) {
      if (metade < 1) continue;
      const soma = (lista: string[]) =>
        lista.reduce((s, w) => s + (g.porSemana.get(w)?.receita ?? 0), 0) / lista.length;
      const antes = soma(semanas.slice(0, metade));
      const depois = soma(semanas.slice(metade));
      g.tendencia = antes > 0 ? ((depois - antes) / antes) * 100 : null;
    }

    return [...mapa.values()].sort((a, b) => b.receita - a.receita);
  }, [itens, semanas]);

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return grupos;
    return grupos.filter(
      (g) =>
        g.sku.toLowerCase().includes(q) ||
        g.titulo.toLowerCase().includes(q) ||
        g.mlbs.some((m) => m.mlb.toLowerCase().includes(q))
    );
  }, [grupos, busca]);

  const visiveis = filtrados.slice(0, limite);

  /* ── quem cresceu, quem caiu ─────────────────────────────── */

  const movimento = React.useMemo(() => {
    const comTendencia = grupos.filter(
      (g) => g.tendencia != null && Number.isFinite(g.tendencia) && g.receita > 0
    );
    const ordenado = [...comTendencia].sort((a, b) => b.tendencia! - a.tendencia!);
    const sobem = ordenado.slice(0, 8);
    const caem = ordenado.slice(-8).reverse();
    return [...sobem, ...caem]
      .filter((g, i, arr) => arr.findIndex((x) => x.chave === g.chave) === i)
      .map((g) => ({
        sku: g.sku,
        titulo: g.titulo,
        variacao: Math.max(-100, Math.min(300, g.tendencia!)),
        receita: g.receita,
      }));
  }, [grupos]);

  return (
    <div className="flex flex-col gap-4">
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Quem cresceu, quem caiu"
          hint="Média das últimas semanas contra as primeiras — oscilação de uma semana não muda o sinal"
        />
        <div className="h-[260px] px-2 pt-3 pb-1">
          {movimento.length === 0 ? (
            <p className="text-[13px] text-ink-3 px-3 py-8 text-center">
              Sem semanas suficientes para comparar.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={movimento}
                layout="vertical"
                margin={{ top: 4, right: 40, left: 4, bottom: 0 }}
              >
                <CartesianGrid {...GRID} horizontal={false} />
                <XAxis
                  type="number"
                  {...AXIS}
                  tickFormatter={(v) => `${v}%`}
                  domain={["dataMin", "dataMax"]}
                />
                <YAxis
                  type="category"
                  dataKey="sku"
                  {...AXIS}
                  width={78}
                  tick={{ fontSize: 10 }}
                />
                <ReferenceLine x={0} stroke="var(--line-2)" />
                <Tooltip
                  cursor={{ fill: "var(--panel-3)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof movimento)[number];
                    return (
                      <div
                        className="panel px-2.5 py-2 max-w-[240px]"
                        style={{ boxShadow: "var(--sh-3)" }}
                      >
                        <p className="text-[12px] font-medium text-ink leading-snug">
                          {d.titulo}
                        </p>
                        <p className="num text-[11px] text-ink-3 mt-0.5">{d.sku}</p>
                        <p className="num text-[12px] mt-1.5">
                          <span
                            className={d.variacao >= 0 ? "text-up" : "text-down"}
                          >
                            {d.variacao >= 0 ? "+" : ""}
                            {d.variacao.toLocaleString("pt-BR", {
                              maximumFractionDigits: 0,
                            })}
                            %
                          </span>
                          <span className="text-ink-3"> · {money(d.receita)}</span>
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="variacao" isAnimationActive={false} radius={[0, 2, 2, 0]}>
                  {movimento.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.variacao >= 0 ? "var(--up)" : "var(--down)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="SKU por semana"
          hint="Um produto por linha · semanas nas colunas"
          action={
            <span className="num text-[12px] text-ink-3">
              {filtrados.length} SKUs
            </span>
          }
        />

        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-line">
          <Segmented
            options={METRICAS}
            value={metrica}
            onChange={setMetrica}
          />
          <span className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="SKU, título ou MLB"
              className="w-full h-8 pl-8 pr-3 rounded-r1 bg-panel border border-line
                         text-[13px] text-ink outline-none focus:border-brand"
            />
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-20 bg-panel text-left px-3 py-2 border-r border-line min-w-[220px]">
                  <span className="label">SKU · produto</span>
                </th>
                {semanas.map((w) => (
                  <th key={w} className="px-3 py-2 text-right min-w-[92px]">
                    <span className="num text-[12px] font-semibold text-ink">{w}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-right min-w-[86px]">
                  <span className="label">Tendência</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((g) => {
                const expandido = aberto === g.chave;
                return (
                  <React.Fragment key={g.chave}>
                    <tr
                      className="border-b border-line hover:bg-panel-2 cursor-pointer"
                      onClick={() => setAberto(expandido ? null : g.chave)}
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-panel text-left px-3 py-2
                                   border-r border-line font-normal max-w-[260px]"
                      >
                        <span className="flex items-start gap-1.5">
                          {expandido ? (
                            <ChevronDown className="w-3.5 h-3.5 text-ink-3 mt-0.5 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-ink-3 mt-0.5 shrink-0" />
                          )}
                          <span className="min-w-0">
                            <span className="num text-[12px] font-semibold text-ink block">
                              {g.sku}
                            </span>
                            <span className="text-[11.5px] text-ink-2 block truncate">
                              {g.titulo}
                            </span>
                            {g.mlbs.length > 1 && (
                              <span className="text-[10.5px] text-ink-3">
                                {g.mlbs.length} anúncios
                              </span>
                            )}
                          </span>
                        </span>
                      </th>

                      {semanas.map((w) => {
                        const c = valorDe(g, w, metrica);
                        return (
                          <td key={w} className="px-3 py-2 text-right">
                            <span
                              className={cn(
                                "num",
                                c.valor == null ? "text-ink-3" : "text-ink-2"
                              )}
                            >
                              {c.valor == null ? "—" : FORMATO[metrica](c.valor)}
                            </span>
                          </td>
                        );
                      })}

                      <td className="px-3 py-2 text-right">
                        {g.tendencia == null ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          <Badge tone={g.tendencia >= 0 ? "up" : "down"}>
                            {g.tendencia >= 0 ? "+" : ""}
                            {g.tendencia.toLocaleString("pt-BR", {
                              maximumFractionDigits: 0,
                            })}
                            %
                          </Badge>
                        )}
                      </td>
                    </tr>

                    {expandido &&
                      g.mlbs.map((m) => (
                        <tr key={m.mlb} className="border-b border-line bg-panel-2">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 bg-panel-2 text-left px-3 py-1.5
                                       border-r border-line font-normal"
                          >
                            <span className="flex items-center gap-1.5 pl-5">
                              <span className="num text-[11.5px] text-ink-2">
                                {m.mlb}
                              </span>
                              <Badge tone={m.tipo === "Premium" ? "brand" : "neutral"}>
                                {m.tipo}
                              </Badge>
                            </span>
                            <span className="block pl-5 text-[10.5px] text-ink-3">
                              {m.conta}
                            </span>
                          </th>
                          <td
                            colSpan={semanas.length + 1}
                            className="px-3 py-1.5 text-[11.5px] text-ink-3"
                          >
                            Anúncio deste SKU — os números da linha acima somam todos.
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtrados.length > limite && (
          <button
            onClick={() => setLimite((l) => l + 50)}
            className="w-full py-2.5 text-[12.5px] text-ink-2 hover:text-ink
                       hover:bg-panel-2 border-t border-line"
          >
            Mostrar mais {Math.min(50, filtrados.length - limite)} de{" "}
            {filtrados.length - limite} restantes
          </button>
        )}
      </Panel>
    </div>
  );
}
