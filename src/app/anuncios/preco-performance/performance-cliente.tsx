"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import { Input, Select, Field, Segmented } from "@/components/ui/controls";
import { money, moneyShort, pct, count } from "@/lib/format";
import { AXIS, GRID, ChartTooltip } from "@/components/ui/chart";
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertCircle, Info, X, Download, Loader2 } from "lucide-react";
import type {
  DadosPerformancePreco, LinhaPreco, Situacao,
} from "@/lib/dados/performance-preco";

/**
 * Performance de preço.
 *
 * ── A pergunta ──
 *
 * A que preço este SKU vende melhor, e o preço de hoje está nele?
 *
 * A medida é UNIDADES POR DIA em que cada preço esteve valendo. Total de
 * unidades premiaria o preço que ficou mais tempo no ar, e a resposta
 * seria sempre "o preço de sempre".
 *
 * ── A coluna que decide ──
 *
 * "Subiu e caiu": o preço saiu do de melhor desempenho para cima E o
 * ritmo de venda caiu. As duas juntas, porque preço que subiu sem cair
 * venda não é problema, e venda que caiu sem o preço mudar tem outra
 * causa — e outro dono.
 *
 * ── O que a tela avisa e não esconde ──
 *
 * Isto é correlação. O preço mais barato costuma coincidir com campanha,
 * e campanha traz tráfego que venderia mais a qualquer preço. O aviso
 * fica no rodapé, sempre visível, e não numa ajuda que ninguém abre.
 */

const SITUACAO: Record<
  Situacao,
  { rotulo: string; tom: "up" | "down" | "warn" | "neutral" } | null
> = {
  sem_evidencia: null,
  no_melhor: { rotulo: "no melhor preço", tom: "up" },
  subiu_e_caiu: { rotulo: "subiu e caiu venda", tom: "down" },
  subiu: { rotulo: "acima do melhor", tom: "warn" },
  abaixo: { rotulo: "abaixo do melhor", tom: "neutral" },
  estavel: { rotulo: "caiu sem mudar preço", tom: "warn" },
};

const PERIODOS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
] as const;

export default function PerformancePrecoCliente({
  dados,
}: {
  dados: DadosPerformancePreco;
}) {
  const router = useRouter();
  const { linhas, canais, dias, periodo, resumo } = dados;

  const [busca, setBusca] = React.useState("");
  const [curva, setCurva] = React.useState<"" | "A" | "B" | "C">("");
  const [so, setSo] = React.useState<"" | "problema" | "evidencia">("");
  const [aberto, setAberto] = React.useState<string | null>(null);

  const [baixando, setBaixando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  /**
   * Exporta preço × volume × receita no recorte que está na tela.
   *
   * A tela mostra a faixa de mais volume; a planilha traz também a de
   * mais RECEITA por dia, que é a que decide se baixar compensa — e que
   * quase nunca é a mesma faixa.
   */
  async function exportar() {
    setBaixando(true);
    setErro(null);
    try {
      const q = new URLSearchParams({ dias: String(dias) });
      if (dados.canalId) q.set("canal", dados.canalId);

      const r = await fetch(`/api/exportar/preco?${q}`);
      if (!r.ok) {
        const corpo = await r.json().catch(() => ({}));
        setErro(corpo.erro ?? `Falha ao gerar (HTTP ${r.status})`);
        return;
      }
      const cd = r.headers.get("content-disposition") ?? "";
      const nome = cd.match(/filename="([^"]+)"/)?.[1] ?? "preco.xlsx";

      const blob = await r.blob();
      if (blob.size === 0) {
        setErro("O arquivo veio vazio.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Sem conexão — nada foi baixado.");
    } finally {
      setBaixando(false);
    }
  }

  function ir(novoDias: number, canal: string | null) {
    const q = new URLSearchParams({ dias: String(novoDias) });
    if (canal) q.set("canal", canal);
    router.push(`/anuncios/preco-performance?${q}`);
  }

  const visiveis = React.useMemo(() => {
    const t = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (curva && l.curva !== curva) return false;
      if (so === "problema" && l.situacao !== "subiu_e_caiu") return false;
      if (so === "evidencia" && !l.melhor) return false;
      if (!t) return true;
      return (
        l.sku.toLowerCase().includes(t) ||
        l.titulo.toLowerCase().includes(t) ||
        l.mlbs.some((m) => m.mlb.toLowerCase().includes(t))
      );
    });
  }, [linhas, busca, curva, so]);

  const detalhe = aberto ? linhas.find((l) => l.sku === aberto) ?? null : null;

  const th = "px-2.5 py-2 text-[11px] font-semibold text-ink-3 whitespace-nowrap";
  const td = "px-2.5 py-1.5 border-b border-line";

  return (
    <>
      <PageHeader
        title="Performance de preço"
        breadcrumb="Anúncios"
        description={
          periodo.inicio
            ? `${periodo.inicio.slice(8, 10)}/${periodo.inicio.slice(5, 7)} a ${periodo.fim.slice(8, 10)}/${periodo.fim.slice(5, 7)}`
            : undefined
        }
      />

      <PageBody>
        {erro && (
          <Panel className="px-4 py-3 mb-3 flex items-start gap-2.5 border-down/30">
            <AlertCircle className="w-4 h-4 text-down shrink-0 mt-0.5" />
            <p className="text-[13px] text-ink-2">{erro}</p>
          </Panel>
        )}

        {/* ── Recorte ── */}
        <Panel className="p-3 mb-3">
          <div className="flex items-end gap-2 flex-wrap">
            <Field label="Período">
              <Segmented
                options={PERIODOS}
                value={String(dias) as "7" | "30" | "90"}
                onChange={(v) => ir(Number(v), dados.canalId)}
              />
            </Field>
            <Field label="Canal">
              <Select
                value={dados.canalId ?? ""}
                onChange={(e) => ir(dias, e.target.value || null)}
              >
                <option value="">Todos os canais</option>
                {canais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex-1" />
            <Button disabled={baixando} onClick={exportar}>
              {baixando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Montando
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" strokeWidth={2.25} />
                  Exportar Excel
                </>
              )}
            </Button>
            <Input
              placeholder="Buscar SKU, título ou MLB"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </Panel>

        {/* ── Resumo ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {[
            { r: "SKUs com venda", v: count(resumo.total) },
            {
              r: "Com preço de referência",
              v: count(resumo.comEvidencia),
              nota: "passaram no piso de evidência",
            },
            {
              r: "Acima do melhor preço",
              v: count(resumo.acimaDoMelhor),
              alerta: resumo.acimaDoMelhor > 0,
            },
            {
              r: "Subiu e caiu venda",
              v: count(resumo.subiuECaiu),
              alerta: resumo.subiuECaiu > 0,
              nota: "preço acima e ritmo abaixo",
            },
          ].map((k) => (
            <Panel key={k.r} className="p-3">
              <p className="text-[11px] text-ink-3 mb-1">{k.r}</p>
              <p
                className={`num text-[18px] font-semibold leading-none ${
                  k.alerta ? "text-down" : "text-ink"
                }`}
              >
                {k.v}
              </p>
              {k.nota && (
                <p className="text-[11px] text-ink-3 mt-1.5">{k.nota}</p>
              )}
            </Panel>
          ))}
        </div>

        {/* ── Gráfico do SKU aberto ── */}
        {detalhe && (
          <Panel className="p-4 mb-3">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">
                  <span className="num">{detalhe.sku}</span> — unidades por dia
                  em cada preço
                </p>
                <p className="text-[11.5px] text-ink-3 truncate max-w-xl">
                  {detalhe.titulo}
                </p>
                {detalhe.mlbs.length > 0 && (
                  <p className="num text-[11px] text-ink-3 mt-0.5">
                    {detalhe.mlbs.map((m) => `${m.mlb} (${m.tipo})`).join(" · ")}
                  </p>
                )}
              </div>
              <button
                onClick={() => setAberto(null)}
                className="text-ink-3 hover:text-ink-2 shrink-0"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={detalhe.faixas.map((f) => ({
                    preco: f.preco,
                    unDia: f.unDia,
                    unidades: f.unidades,
                    dias: f.dias,
                    melhor: f.melhor,
                    atual: f.atual,
                  }))}
                  margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis
                    dataKey="preco"
                    {...AXIS}
                    tickFormatter={(v: number) => moneyShort(v)}
                  />
                  <YAxis {...AXIS} width={34} />
                  <Tooltip
                    content={
                      <ChartTooltip formatter={(v: number) => `${v} un/dia`} />
                    }
                  />
                  {detalhe.precoUltimo != null && (
                    <ReferenceLine
                      x={detalhe.precoUltimo}
                      stroke="var(--brand)"
                      strokeDasharray="4 3"
                      label={{
                        value: "agora",
                        position: "top",
                        fill: "var(--ink-3)",
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Bar dataKey="unDia" radius={[3, 3, 0, 0]}>
                    {detalhe.faixas.map((f, i) => (
                      <Cell
                        key={i}
                        fill={
                          f.melhor
                            ? "var(--up)"
                            : f.dias >= 3 && f.unidades >= 3
                              ? "var(--s1)"
                              : "var(--line-2)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Barras cinza são faixas sem evidência: existem no gráfico
                para mostrar que houve venda ali, e não competem pelo
                título de melhor preço. */}
            <p className="text-[11px] text-ink-3 mt-2 leading-relaxed">
              Verde é a faixa de melhor desempenho. Cinza são faixas com menos
              de 3 dias ou 3 unidades — aparecem porque houve venda, mas não
              disputam o melhor preço. A linha tracejada é o preço do último pedido.
            </p>
          </Panel>
        )}

        {/* ── Lista ── */}
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-line flex-wrap">
            <Segmented
              options={[
                { value: "" as const, label: "Todas" },
                { value: "A" as const, label: "A" },
                { value: "B" as const, label: "B" },
                { value: "C" as const, label: "C" },
              ]}
              value={curva}
              onChange={setCurva}
            />
            <Segmented
              options={[
                { value: "" as const, label: "Tudo" },
                { value: "evidencia" as const, label: "Com referência" },
                { value: "problema" as const, label: "Subiu e caiu" },
              ]}
              value={so}
              onChange={setSo}
            />
            <span className="num text-[12px] text-ink-3">
              {count(visiveis.length)} SKUs
            </span>
          </div>

          <div className="overflow-x-auto max-h-[620px]">
            <table className="w-full border-collapse min-w-[980px]">
              <thead className="bg-panel-2 sticky top-0 z-10">
                <tr>
                  <th className={`${th} text-left`}>SKU</th>
                  <th className={`${th} text-right`}>Un.</th>
                  <th className={`${th} text-right`}>Melhor preço</th>
                  <th className={`${th} text-right`}>Un/dia nele</th>
                  <th className={`${th} text-right`}>Último preço</th>
                  <th className={`${th} text-right`}>Média 14 dias</th>
                  <th className={`${th} text-right`}>Vitrine / desconto</th>
                  <th className={`${th} text-right`}>Variação</th>
                  <th className={`${th} text-right`}>Impacto na venda</th>
                  <th className={`${th} text-left`}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.slice(0, 200).map((l) => {
                  const s = SITUACAO[l.situacao];
                  return (
                    <tr
                      key={l.sku}
                      onClick={() => setAberto(aberto === l.sku ? null : l.sku)}
                      className={`cursor-pointer hover:bg-panel-2/50 ${
                        aberto === l.sku ? "bg-panel-2/60" : ""
                      }`}
                    >
                      <td className={td}>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            tone={l.curva === "A" ? "up" : l.curva === "B" ? "warn" : "neutral"}
                          >
                            {l.curva}
                          </Badge>
                          <span className="num text-[12.5px] text-ink font-medium">
                            {l.sku}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-3 truncate max-w-[220px]">
                          {l.titulo}
                        </p>
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-2`}>
                        {count(l.unidades)}
                      </td>
                      <td className={`${td} text-right`}>
                        {l.melhor ? (
                          <div className="flex flex-col items-end leading-tight">
                            <span className="num text-[13px] font-semibold text-up">
                              {money(l.melhor.preco)}
                            </span>
                            <span className="num text-[10.5px] text-ink-3">
                              {count(l.melhor.unidades)} un / {count(l.melhor.dias)} dias
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-ink-3">
                            sem evidência
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-2`}>
                        {l.melhor ? l.melhor.unDia : "—"}
                      </td>
                      {/* O último preço é o que a comparação usa: a média
                          dilui uma mudança recente, e é ele que está
                          valendo agora. */}
                      <td className={`${td} text-right`}>
                        {l.precoUltimo != null ? (
                          <div className="flex flex-col items-end leading-tight">
                            <span className="num text-[13px] text-ink font-medium">
                              {money(l.precoUltimo)}
                            </span>
                            <span className="num text-[10.5px] text-ink-3">
                              {l.dataUltimo
                                ? `${l.dataUltimo.slice(8, 10)}/${l.dataUltimo.slice(5, 7)}`
                                : ""}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-ink-3">sem venda</span>
                        )}
                      </td>
                      {/* A média ao lado mostra se o último preço é o novo
                          patamar ou um ponto fora da curva. */}
                      <td className={`${td} text-right`}>
                        {l.precoRecente != null ? (
                          <span className="num text-[12.5px] text-ink-2">
                            {money(l.precoRecente)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-ink-3">—</span>
                        )}
                      </td>
                      {/* A vitrine fica ao lado e nunca vira base de
                          comparação: ela é o preço de tabela, e a distância
                          para o praticado é o desconto que vem sendo dado. */}
                      <td className={`${td} text-right`}>
                        {l.precoVitrine != null ? (
                          <div className="flex flex-col items-end leading-tight">
                            <span className="num text-[12.5px] text-ink-2">
                              {money(l.precoVitrine)}
                            </span>
                            {l.precoUltimo != null && l.precoVitrine > 0 && (
                              <span className="num text-[10.5px] text-ink-3">
                                {pct(
                                  ((l.precoUltimo - l.precoVitrine) / l.precoVitrine) * 100,
                                  0
                                )}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-ink-3">—</span>
                        )}
                      </td>
                      <td className={`${td} text-right`}>
                        {l.variacao != null ? (
                          <span
                            className={`num text-[12.5px] font-medium ${
                              l.variacao > 2
                                ? "text-down"
                                : l.variacao < -2
                                  ? "text-ink-2"
                                  : "text-up"
                            }`}
                          >
                            {l.variacao > 0 ? "+" : ""}
                            {pct(l.variacao, 1)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-ink-3">—</span>
                        )}
                      </td>
                      <td className={`${td} text-right`}>
                        {l.impacto != null ? (
                          <div className="flex flex-col items-end leading-tight">
                            <span
                              className={`num text-[12.5px] font-medium ${
                                l.impacto < -20 ? "text-down" : l.impacto > 20 ? "text-up" : "text-ink-2"
                              }`}
                            >
                              {l.impacto > 0 ? "+" : ""}
                              {pct(l.impacto, 0)}
                            </span>
                            <span className="num text-[10.5px] text-ink-3">
                              {l.unDiaRecente} un/dia agora
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-ink-3">
                            sem venda recente
                          </span>
                        )}
                      </td>
                      <td className={td}>
                        {s ? (
                          <Badge tone={s.tom}>{s.rotulo}</Badge>
                        ) : (
                          <span className="text-[11px] text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {visiveis.length > 200 && (
            <p className="px-3 py-2 text-[11.5px] text-ink-3 border-t border-line">
              Mostrando os 200 de maior receita. Use a busca ou os filtros.
            </p>
          )}
        </Panel>

        <Panel className="p-4 mt-3 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-ink-3 shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold text-ink mb-1">
              Como ler, e o que isto não prova
            </p>
            <p className="text-[11.5px] text-ink-3 leading-relaxed max-w-3xl">
              O melhor preço é o que teve mais{" "}
              <span className="text-ink-2">unidades por dia</span> enquanto
              esteve valendo — não o que somou mais unidades, que premiaria o
              preço praticado por mais tempo. Só entram faixas com pelo menos 3
              dias e 3 unidades; sem isso, um pedido grande num único dia
              venceria.
            </p>
            <p className="text-[11.5px] text-ink-3 leading-relaxed max-w-3xl mt-1.5">
              <span className="text-ink-2 font-medium">Isto é correlação.</span>{" "}
              O preço mais baixo costuma coincidir com campanha, e campanha traz
              tráfego que venderia mais a qualquer preço. Serve para escolher o
              que testar, não como prova de que baixar o preço aumenta a venda.
            </p>
          </div>
        </Panel>
      </PageBody>
    </>
  );
}

