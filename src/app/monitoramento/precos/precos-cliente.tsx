"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { OperationMethod } from "@/components/analise/operation-layout";
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
        <PageBody className="op-workspace op-monitoramento-precos">
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
                           text-[14px] text-ink outline-none focus:border-brand"
              />
            </span>
          </>
        }
      />

      <PageBody className="op-workspace op-monitoramento-precos">
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <p className="text-[14px] text-ink-2">Preço médio ponderado e unidades em escalas independentes</p>
              <label className="flex items-center gap-2 text-[14px] text-ink-2">Detalhar período
                <select value={mesAberto == null ? "ano" : String(mesAberto)} onChange={(e) => setMesAberto(e.target.value === "ano" ? null : Number(e.target.value))} className="min-h-10 rounded-r1 border border-line-2 bg-panel px-3 text-ink"><option value="ano">Ano completo</option>{serieMensal.map((p, i) => <option key={p.chave} value={i} disabled={p.preco == null}>{p.rotulo}</option>)}</select>
              </label>
            </div>
            <div className="grid min-w-0 gap-6 p-4 xl:grid-cols-2 md:p-5">
              {(["preco", "unidades"] as const).map((metrica) => <section key={metrica} className="min-w-0" aria-label={metrica === "preco" ? "Evolução do preço médio" : "Evolução das unidades"}>
                <h3 className="mb-3 text-[14px] font-medium text-ink-2">{metrica === "preco" ? "Preço médio · R$" : "Unidades vendidas"}</h3>
                <div className="h-[220px] min-w-0 md:h-[260px]">
                  <ResponsiveContainer width="100%" height="100%"><ComposedChart data={mesAberto == null ? serieMensal : serieDiaria} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} onClick={(e) => { if (mesAberto != null) return; const i = e?.activeTooltipIndex; if (typeof i === "number" && serieMensal[i]?.preco != null) setMesAberto(i); }}>
                    <CartesianGrid {...GRID} /><XAxis dataKey="rotulo" {...AXIS} minTickGap={28}/>
                    <YAxis {...AXIS} width={metrica === "preco" ? 80 : 42} tickFormatter={(v: number) => metrica === "preco" ? money(v) : count(v)} domain={metrica === "preco" ? ["auto", "auto"] : [0, "auto"]}/>
                    <Tooltip content={({active,payload}) => {if(!active || !payload?.length)return null; const p=payload[0].payload as Ponto; return <div className="panel p-3 text-[14px]"><p className="text-ink-3">{p.chave}</p><p className="num font-semibold">{metrica === "preco" ? p.preco == null ? "Sem venda no período" : money(p.preco) : count(p.unidades) + " un"}</p>{p.min != null && p.max != null && <p className="mt-1 text-[12px] text-ink-2">{money(p.min)} a {money(p.max)}</p>}</div>; }}/>
                    {metrica === "preco" ? <Line type="linear" dataKey="preco" name="Preço médio" stroke="var(--brand)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false}/> : <Bar dataKey="unidades" name="Unidades" fill="var(--info)" radius={[2,2,0,0]} isAnimationActive={false}/>}
                  </ComposedChart></ResponsiveContainer>
                </div>
              </section>)}
            </div>
            <div className="px-5"><OperationMethod title="Ver dados da evolução"><div className="overflow-auto" tabIndex={0} role="region" aria-label="Valores de preço e unidades"><table className="op-table"><thead><tr><th>Período</th><th>Preço médio</th><th>Mínimo</th><th>Máximo</th><th>Unidades</th></tr></thead><tbody>{(mesAberto == null ? serieMensal : serieDiaria).map((p)=><tr key={p.chave}><td>{p.chave}</td><td className="num">{p.preco == null ? "—" : money(p.preco)}</td><td className="num">{p.min == null ? "—" : money(p.min)}</td><td className="num">{p.max == null ? "—" : money(p.max)}</td><td className="num">{count(p.unidades)}</td></tr>)}</tbody></table></div></OperationMethod></div>
          </Panel>
        )}

        <Panel className="op-primary-table overflow-hidden">
          <PanelHeader
            title="SKUs vendidos"
            hint="clique para ver a evolução de preço"
            action={
              <span className="num text-[12px] text-ink-3">{filtrados.length}</span>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
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
                      tabIndex={0}
                      aria-expanded={ativo}
                      aria-label={`Evolução de preço de ${s.titulo}`}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
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
                            <span className="text-[12px] text-ink-2 block break-words max-w-[300px]">
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
              className="w-full py-2.5 text-[14px] text-ink-2 hover:text-ink
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
