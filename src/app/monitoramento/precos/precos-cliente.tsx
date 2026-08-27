"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { SeletorCanal } from "@/components/ui/seletor-canal";
import { SemFonte } from "@/components/ui/sem-fonte";
import { Segmented } from "@/components/ui/controls";
import { AXIS, GRID } from "@/components/ui/chart";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DadosPrecos, SkuPreco } from "@/lib/dados/precos-praticados";
import {
  CartesianGrid,
  ComposedChart,
  Bar,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Search, ChevronRight, ChevronDown } from "lucide-react";

/**
 * Preço praticado por SKU, mês a mês.
 *
 * A tela anterior mostrava preço de concorrente inventado. Isto aqui é
 * outra coisa e mais útil hoje: o que o cliente pagou, de fato, mês a mês
 * — e a variação dentro do mês quando se abre.
 *
 * Preço de concorrente volta quando houver a API de monitoramento; até lá,
 * um número inventado num painel de preço é convite a errar decisão.
 */

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

type Ponto = {
  rotulo: string;
  /** Média ponderada pela quantidade. */
  preco: number | null;
  min: number | null;
  max: number | null;
  unidades: number;
  chave: string;
};

/** Média ponderada: uma venda isolada não move o mês inteiro. */
function agregar(
  vendas: SkuPreco["vendas"],
  chaveDe: (v: SkuPreco["vendas"][number]) => string
): Map<string, { receita: number; un: number; min: number; max: number }> {
  const m = new Map<string, { receita: number; un: number; min: number; max: number }>();
  for (const v of vendas) {
    const k = chaveDe(v);
    const g = m.get(k) ?? { receita: 0, un: 0, min: Infinity, max: 0 };
    g.receita += v.precoUnitario * v.quantidade;
    g.un += v.quantidade;
    g.min = Math.min(g.min, v.precoUnitario);
    g.max = Math.max(g.max, v.precoUnitario);
    m.set(k, g);
  }
  return m;
}

const CORES_CURVA: Record<string, "up" | "brand" | "neutral"> = {
  A: "up",
  B: "brand",
  C: "neutral",
};

export default function MonitoramentoPrecos({ dados }: { dados: DadosPrecos }) {
  const [canal, setCanal] = React.useState("");
  const [curva, setCurva] = React.useState("todas");
  const [busca, setBusca] = React.useState("");
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [mesAberto, setMesAberto] = React.useState<number | null>(null);
  const [limite, setLimite] = React.useState(25);

  const ano = Number((dados.ultimaData || "2026").slice(0, 4));

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dados.skus
      .map((s) =>
        canal ? { ...s, vendas: s.vendas.filter((v) => v.canalId === canal) } : s
      )
      .filter((s) => s.vendas.length)
      .filter((s) => curva === "todas" || s.curva === curva)
      .filter(
        (s) =>
          !q ||
          s.sku.toLowerCase().includes(q) ||
          s.titulo.toLowerCase().includes(q) ||
          s.anuncios.some((a) => a.mlb.toLowerCase().includes(q))
      );
  }, [dados.skus, canal, curva, busca]);

  const selecionado = React.useMemo(
    () => filtrados.find((s) => s.sku === aberto) ?? null,
    [filtrados, aberto]
  );

  /* ── série do SKU aberto ───────────────────────────────── */

  const serieMensal: Ponto[] = React.useMemo(() => {
    if (!selecionado) return [];
    const porMes = agregar(selecionado.vendas, (v) => v.data.slice(0, 7));
    return MESES.map((rotulo, m) => {
      const chave = `${ano}-${String(m + 1).padStart(2, "0")}`;
      const g = porMes.get(chave);
      return {
        rotulo,
        chave,
        // Mês sem venda devolve nulo, não zero: zero num gráfico de PREÇO
        // desenha uma queda a zero que nunca existiu.
        preco: g && g.un ? g.receita / g.un : null,
        min: g ? g.min : null,
        max: g ? g.max : null,
        unidades: g?.un ?? 0,
      };
    });
  }, [selecionado, ano]);

  const serieDiaria: Ponto[] = React.useMemo(() => {
    if (!selecionado || mesAberto == null) return [];
    const prefixo = `${ano}-${String(mesAberto + 1).padStart(2, "0")}`;
    const doMes = selecionado.vendas.filter((v) => v.data.startsWith(prefixo));
    const porDia = agregar(doMes, (v) => v.data);
    return [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, g]) => ({
        rotulo: data.slice(8),
        chave: data,
        preco: g.un ? g.receita / g.un : null,
        min: g.min,
        max: g.max,
        unidades: g.un,
      }));
  }, [selecionado, mesAberto, ano]);

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Preços" breadcrumb="Monitoramento" />
        <PageBody>
          <SemFonte
            titulo="Nenhuma venda importada"
            origem="O preço praticado sai dos itens de pedido. Importe a listagem de pedidos e esta tela se preenche sozinha."
          />
        </PageBody>
      </>
    );
  }

  const visiveis = filtrados.slice(0, limite);

  return (
    <>
      <PageHeader
        title="Preços praticados"
        breadcrumb="Monitoramento"
        description="O que o cliente pagou, por SKU — média ponderada pela quantidade"
        filters={
          <>
            <SeletorCanal canais={dados.canais} valor={canal} onChange={setCanal} />
            <Segmented
              options={[
                { value: "todas", label: "Todas" },
                { value: "A", label: "Curva A" },
                { value: "B", label: "B" },
                { value: "C", label: "C" },
              ]}
              value={curva}
              onChange={setCurva}
            />
            <span className="relative shrink-0 w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="SKU, produto ou MLB"
                className="w-full h-7 pl-8 pr-3 rounded-r1 bg-panel border border-line
                           text-[12.5px] text-ink outline-none focus:border-brand"
              />
            </span>
          </>
        }
      />

      <PageBody>
        {selecionado && (
          <Panel className="overflow-hidden">
            <PanelHeader
              title={selecionado.titulo}
              hint={`${selecionado.sku} · ${selecionado.anuncios.length} anúncio(s) · curva ${selecionado.curva}`}
              action={
                mesAberto != null ? (
                  <button
                    onClick={() => setMesAberto(null)}
                    className="text-[12px] text-brand hover:underline"
                  >
                    ← voltar ao ano
                  </button>
                ) : (
                  <span className="text-[12px] text-ink-3">
                    clique num mês para abrir os dias
                  </span>
                )
              }
            />
            <div className="h-[300px] px-2 pt-3 pb-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={mesAberto == null ? serieMensal : serieDiaria}
                  margin={{ top: 6, right: 10, left: 0, bottom: 0 }}
                  onClick={(e) => {
                    if (mesAberto != null) return;
                    const i = e?.activeTooltipIndex;
                    if (typeof i === "number" && serieMensal[i]?.preco != null) {
                      setMesAberto(i);
                    }
                  }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="rotulo" {...AXIS} />
                  <YAxis
                    yAxisId="preco"
                    {...AXIS}
                    width={64}
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => money(v)}
                  />
                  <YAxis yAxisId="un" orientation="right" {...AXIS} width={38} />
                  <Tooltip
                    cursor={{ fill: "var(--panel-3)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as Ponto;
                      if (p.preco == null) {
                        return (
                          <div className="panel px-2.5 py-2" style={{ boxShadow: "var(--sh-3)" }}>
                            <p className="text-[12px] text-ink-2">Sem venda no período</p>
                          </div>
                        );
                      }
                      return (
                        <div className="panel px-2.5 py-2 min-w-[190px]" style={{ boxShadow: "var(--sh-3)" }}>
                          <p className="num text-[11px] font-semibold text-ink-2 mb-1.5">
                            {p.chave}
                          </p>
                          <p className="num text-[14px] font-semibold text-ink">
                            {money(p.preco)}
                          </p>
                          <p className="text-[11px] text-ink-3 mt-1">
                            {count(p.unidades)} un ·{" "}
                            {p.min != null && p.max != null && p.min !== p.max
                              ? `${money(p.min)} a ${money(p.max)}`
                              : "preço único"}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    yAxisId="un"
                    dataKey="unidades"
                    fill="var(--panel-3)"
                    isAnimationActive={false}
                    radius={[2, 2, 0, 0]}
                  />
                  <Line
                    yAxisId="preco"
                    type="monotone"
                    dataKey="preco"
                    stroke="var(--brand)"
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 0, fill: "var(--brand)" }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        )}

        <Panel className="overflow-hidden">
          <PanelHeader
            title="SKUs vendidos"
            hint="clique para ver a evolução de preço"
            action={
              <span className="num text-[12px] text-ink-3">{filtrados.length}</span>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left px-3 py-2 min-w-[240px]">
                    <span className="label">SKU · produto</span>
                  </th>
                  <th className="text-right px-3 py-2"><span className="label">Preço médio</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Mínimo</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Máximo</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Amplitude</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Unidades</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Receita</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((s) => {
                  const ativo = aberto === s.sku;
                  return (
                    <tr
                      key={s.sku}
                      onClick={() => {
                        setAberto(ativo ? null : s.sku);
                        setMesAberto(null);
                      }}
                      className={cn(
                        "border-b border-line cursor-pointer hover:bg-panel-2",
                        ativo && "bg-brand-wash/40"
                      )}
                    >
                      <td className="px-3 py-2">
                        <span className="flex items-start gap-1.5">
                          {ativo ? (
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
                            <span className="text-[11.5px] text-ink-2 block truncate max-w-[300px]">
                              {s.titulo}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right num font-semibold text-ink">
                        {money(s.precoMedio)}
                      </td>
                      <td className="px-3 py-2 text-right num text-ink-2">{money(s.precoMin)}</td>
                      <td className="px-3 py-2 text-right num text-ink-2">{money(s.precoMax)}</td>
                      <td className="px-3 py-2 text-right">
                        {s.amplitude < 0.5 ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          <span
                            className={cn(
                              "num",
                              s.amplitude > 25 ? "text-warn font-medium" : "text-ink-2"
                            )}
                          >
                            {pct(s.amplitude)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right num text-ink-2">{count(s.unidades)}</td>
                      <td className="px-3 py-2 text-right num text-ink-2">{money(s.receita)}</td>
                    </tr>
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
              Mostrar mais {Math.min(50, filtrados.length - limite)}
            </button>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
