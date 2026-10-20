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
import { FotoAnuncio } from "@/components/ui/foto-anuncio";
import { TagAnuncio } from "@/components/ui/tag-anuncio";

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

type Semanas = Map<string, { receita: number; vendas: number; visitas: number }>;

type LinhaAnuncio = {
  mlb: string;
  tipo: string;
  conta: string;
  status: string;
  /*
   * A semana de cada anúncio, e não só a do SKU.
   *
   * Antes o grupo guardava apenas a soma, e por isso a linha aberta de
   * cada MLB tinha uma frase no lugar dos números — repetida oito vezes
   * num SKU com oito anúncios. O dado por anúncio sempre existiu; ele
   * era somado e jogado fora.
   */
  porSemana: Semanas;
  receita: number;
};

type Grupo = {
  chave: string;
  sku: string;
  titulo: string;
  mlbs: LinhaAnuncio[];
  porSemana: Semanas;
  receita: number;
  vendas: number;
};

function valorDe(
  g: { porSemana: Semanas },
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

/**
 * Variação da segunda metade das semanas contra a primeira, na métrica
 * que está na tela.
 *
 * Comparar só a última semana com a anterior faz qualquer oscilação
 * virar tendência; metade contra metade precisa de movimento sustentado.
 * Semana sem dado fica de fora da média em vez de entrar como zero —
 * senão um anúncio que não teve leitura numa semana "cai" sozinho.
 */
function tendenciaDe(
  g: { porSemana: Semanas },
  semanas: string[],
  m: Metrica
): number | null {
  const metade = Math.floor(semanas.length / 2);
  if (metade < 1) return null;
  const media = (lista: string[]) => {
    const vs = lista
      .map((w) => valorDe(g, w, m))
      .filter((c) => c.temDado && c.valor != null)
      .map((c) => c.valor as number);
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
  };
  const antes = media(semanas.slice(0, metade));
  const depois = media(semanas.slice(metade));
  if (antes == null || depois == null || antes === 0) return null;
  return ((depois - antes) / antes) * 100;
}

/**
 * A curva da linha, em oito pontos.
 *
 * A tabela responde "quanto"; ela não responde "que formato". Com oito
 * colunas de número, a queda no meio do período só aparece para quem
 * compara as células uma a uma. O traço resolve antes da leitura — e é
 * SVG à mão porque são 256 linhas: um gráfico de biblioteca por linha
 * trava a tela.
 */
function Curva({
  g,
  semanas,
  metrica,
}: {
  g: { porSemana: Semanas };
  semanas: string[];
  metrica: Metrica;
}) {
  const L = 72;
  const A = 22;
  const vs = semanas.map((w) => valorDe(g, w, metrica).valor);
  const comDado = vs.filter((v): v is number => v != null);
  if (comDado.length < 2) return <span className="inline-block shrink-0" style={{ width: L }} />;

  const baixo = Math.min(...comDado);
  const faixa = Math.max(...comDado) - baixo || 1;
  const px = (i: number) => (i * L) / Math.max(1, vs.length - 1);
  const py = (v: number) => A - 1 - ((v - baixo) / faixa) * (A - 2);

  /*
   * Semana sem leitura quebra o traço em vez de ligar os vizinhos: a
   * reta por cima do buraco inventa um valor que ninguém mediu.
   */
  const trechos: { x: number; y: number }[][] = [];
  let atual: { x: number; y: number }[] = [];
  vs.forEach((v, i) => {
    if (v == null) {
      if (atual.length > 1) trechos.push(atual);
      atual = [];
      return;
    }
    atual.push({ x: px(i), y: py(v) });
  });
  if (atual.length > 1) trechos.push(atual);

  const caminho = (p: { x: number; y: number }[]) =>
    p.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");
  const area = (p: { x: number; y: number }[]) =>
    `${caminho(p)} L${p[p.length - 1].x.toFixed(1)},${A} L${p[0].x.toFixed(1)},${A} Z`;

  const primeiro = comDado[0];
  const ultimo = comDado[comDado.length - 1];
  const cor = ultimo >= primeiro ? "var(--up)" : "var(--down)";

  return (
    <svg
      width={L}
      height={A}
      viewBox={`0 0 ${L} ${A}`}
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      {trechos.map((p, i) => (
        <g key={i}>
          {/* A área é o que faz o traço existir ao lado do texto: 1,75px
              de fio sozinho some na linha da tabela. */}
          <path d={area(p)} fill={cor} opacity={0.12} stroke="none" />
          <path
            d={caminho(p)}
            fill="none"
            stroke={cor}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </svg>
  );
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
          /* A capa do SKU é a do primeiro anúncio que tiver uma: são o
             mesmo produto, e um deles pode nunca ter sido sincronizado. */
          mlbs: [],
          porSemana: new Map(),
          receita: 0,
          vendas: 0,
        } as Grupo);

      const porAnuncio: Semanas = new Map();
      for (const w of a.semanas) {
        porAnuncio.set(w.semana, {
          receita: w.receita,
          vendas: w.vendas,
          visitas: w.visitas,
        });
        const at = g.porSemana.get(w.semana) ?? { receita: 0, vendas: 0, visitas: 0 };
        at.receita += w.receita;
        at.vendas += w.vendas;
        at.visitas += w.visitas;
        g.porSemana.set(w.semana, at);
      }

      g.mlbs.push({
        mlb: a.mlb,
        tipo: a.tipo,
        conta: a.conta,
        status: a.status,
        porSemana: porAnuncio,
        receita: a.metricas.receita,
      });
      g.receita += a.metricas.receita;
      g.vendas += a.metricas.vendas;
      mapa.set(chave, g);
    }

    for (const g of mapa.values()) {
      /* O anúncio que mais vende primeiro: num SKU com oito anúncios, a
         ordem de chegada do banco não diz nada. */
      g.mlbs.sort((x, y) => y.receita - x.receita);
    }

    return [...mapa.values()].sort((a, b) => b.receita - a.receita);
  }, [itens, semanas]);

  /* A tendência acompanha a métrica da tela, não a receita. */
  const tendencias = React.useMemo(() => {
    const m = new Map<string, number | null>();
    for (const g of grupos) m.set(g.chave, tendenciaDe(g, semanas, metrica));
    return m;
  }, [grupos, semanas, metrica]);

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
    const comTendencia = grupos
      .map((g) => ({ ...g, tendencia: tendenciaDe(g, semanas, "receita") }))
      .filter((g) => g.tendencia != null && Number.isFinite(g.tendencia) && g.receita > 0);
    const ordenado = [...comTendencia].sort((a, b) => b.tendencia! - a.tendencia!);
    const sobem = ordenado.slice(0, 8);
    const caem = ordenado.slice(-8).reverse();
    return [...sobem, ...caem]
      .filter((g, i, arr) => arr.findIndex((x) => x.chave === g.chave) === i)
      .map((g) => ({
        sku: g.sku,
        titulo: g.titulo,
        // A barra para em 300% para um SKU fora da curva não esmagar os
        // outros; o tooltip mostra o número de verdade.
        variacao: Math.max(-100, Math.min(300, g.tendencia!)),
        real: g.tendencia!,
        receita: g.receita,
      }));
  }, [grupos, semanas]);

  return (
    <div className="flex flex-col gap-4">
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Quem cresceu, quem caiu"
          hint="Média das últimas semanas contra as primeiras — oscilação de uma semana não muda o sinal"
        />
        <div className="h-[380px] px-2 pt-3 pb-1">
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
                  width={84}
                  interval={0}
                  /* Herdar o tick do AXIS: só trocar o tamanho perdia a cor,
                     e o Recharts pintava o rótulo com a cor da linha — quase
                     branco, ilegível. */
                  tick={{ ...AXIS.tick, fill: "var(--ink-2)" }}
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
                        <p className="num text-[12px] text-ink-3 mt-0.5">{d.sku}</p>
                        <p className="num text-[12px] mt-1.5">
                          <span
                            className={d.variacao >= 0 ? "text-up" : "text-down"}
                          >
                            {d.real >= 0 ? "+" : ""}
                            {d.real.toLocaleString("pt-BR", {
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
                <th className="sticky left-0 z-20 bg-panel text-left px-3 py-2 border-r border-line min-w-[180px] sm:min-w-[220px]">
                  <span className="label">SKU · produto</span>
                </th>
                {semanas.map((w) => (
                  <th key={w} className="px-3 py-2 text-right min-w-[92px]">
                    <span className="num text-[12px] font-semibold text-ink">{w}</span>
                  </th>
                ))}
                <th className="px-2 py-2 min-w-[84px]">
                  <span className="label">Curva</span>
                </th>
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
                                   border-r border-line font-normal max-w-[210px] sm:max-w-[280px]"
                      >
                        <span className="flex items-start gap-1.5">
                          {expandido ? (
                            <ChevronDown className="w-3.5 h-3.5 text-ink-3 mt-0.5 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-ink-3 mt-0.5 shrink-0" />
                          )}
                          <FotoAnuncio mlb={g.mlbs[0]?.mlb} alt={g.titulo} tamanho={32} />
                          <span className="min-w-0 flex-1">
                            <span className="num text-[12px] font-semibold text-ink block">
                              {g.sku}
                            </span>
                            <span className="text-[12px] text-ink-2 block break-words">
                              {g.titulo}
                            </span>
                            {g.mlbs.length > 1 && (
                              <span className="text-[12px] text-ink-3">
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
                            {/* Zero vira um ponto: com dezenas de células "R$ 0,00", a semana que
                                vendeu sumia no meio. "—" segue sendo semana sem dado nenhum. */}
                            <span
                              className={cn(
                                "num",
                                c.valor == null || c.valor === 0 ? "text-ink-3" : "text-ink-2"
                              )}
                              title={c.valor === 0 ? "sem venda nesta semana" : undefined}
                            >
                              {c.valor == null ? "—" : c.valor === 0 ? "·" : FORMATO[metrica](c.valor)}
                            </span>
                          </td>
                        );
                      })}

                      <td className="px-2 py-2">
                        <Curva g={g} semanas={semanas} metrica={metrica} />
                      </td>

                      <td className="px-3 py-2 text-right">
                        {(() => {
                          const t = tendencias.get(g.chave);
                          if (t == null) return <span className="text-ink-3">—</span>;
                          return (
                            <Badge tone={t >= 0 ? "up" : "down"}>
                              {t >= 0 ? "+" : ""}
                              {t.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                            </Badge>
                          );
                        })()}
                      </td>
                    </tr>

                    {expandido &&
                      /*
                       * Oito dos doze anúncios de um SKU podem não ter
                       * nenhuma leitura na janela. Dar oito colunas de
                       * travessão a cada um deles enterra os quatro que
                       * importam; eles saem resumidos numa linha abaixo.
                       */
                      g.mlbs
                        .filter((m) =>
                          semanas.some((w) => valorDe(m, w, metrica).temDado),
                        )
                        .map((m) => (
                        <tr key={m.mlb} className="border-b border-line bg-panel-2">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 bg-panel-2 text-left px-3 py-1.5
                                       border-r border-line font-normal"
                          >
                            <span className="flex items-start gap-1.5 pl-5">
                              <FotoAnuncio mlb={m.mlb} alt={m.mlb} tamanho={26} />
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5 flex-wrap">
                                  <span className="num text-[12px] text-ink-2">
                                    {m.mlb}
                                  </span>
                                  <Badge tone={m.tipo === "Premium" ? "brand" : "neutral"}>
                                    {m.tipo}
                                  </Badge>
                                  <TagAnuncio status={m.status} />
                                </span>
                                <span className="block text-[12px] text-ink-3">
                                  {m.conta}
                                </span>
                              </span>
                            </span>
                          </th>

                          {semanas.map((w) => {
                            const c = valorDe(m, w, metrica);
                            return (
                              <td key={w} className="px-3 py-1.5 text-right">
                                <span
                                  className={cn(
                                    "num text-[12px]",
                                    c.valor == null || c.valor === 0
                                      ? "text-ink-3"
                                      : "text-ink-2"
                                  )}
                                  title={
                                    c.valor === 0 ? "sem venda nesta semana" : undefined
                                  }
                                >
                                  {c.valor == null
                                    ? "—"
                                    : c.valor === 0
                                      ? "·"
                                      : FORMATO[metrica](c.valor)}
                                </span>
                              </td>
                            );
                          })}

                          <td className="px-2 py-1.5">
                            <Curva g={m} semanas={semanas} metrica={metrica} />
                          </td>

                          <td className="px-3 py-1.5 text-right">
                            {(() => {
                              const t = tendenciaDe(m, semanas, metrica);
                              if (t == null) return <span className="text-ink-3">—</span>;
                              return (
                                <span
                                  className={cn(
                                    "num text-[12px]",
                                    t >= 0 ? "text-up" : "text-down"
                                  )}
                                >
                                  {t >= 0 ? "+" : ""}
                                  {t.toLocaleString("pt-BR", {
                                    maximumFractionDigits: 0,
                                  })}
                                  %
                                </span>
                              );
                            })()}
                          </td>
                        </tr>
                      ))}

                    {expandido &&
                      (() => {
                        const mudos = g.mlbs.filter(
                          (m) => !semanas.some((w) => valorDe(m, w, metrica).temDado),
                        );
                        if (!mudos.length) return null;
                        const parados = mudos.filter((m) => m.status !== "ativo").length;
                        return (
                          <tr className="border-b border-line bg-panel-2">
                            <td
                              colSpan={semanas.length + 3}
                              className="px-3 py-1.5 pl-[46px] text-[12px] text-ink-3"
                            >
                              {mudos.length} sem leitura no período
                              {parados ? ` · ${parados} fora do ar` : ""}
                            </td>
                          </tr>
                        );
                      })()}
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
