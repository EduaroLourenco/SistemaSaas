"use client";

import * as React from "react";
import { Panel } from "@/components/ui/primitives";
import { money, moneyShort, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Resultado } from "@/lib/dados/margem";

/**
 * A DRE mês a mês, com análise vertical.
 *
 * ── Por que mês a mês ──
 *
 * Uma DRE de uma coluna só não se lê. "Margem de contribuição de 22%" não
 * diz nada sozinho; ao lado dos 31% do mês passado, diz tudo. Contador
 * nenhum publica DRE sem o período anterior ao lado, e é por isso.
 *
 * ── Por que a coluna de % ──
 *
 * É a análise vertical: cada linha como fatia da RECEITA LÍQUIDA. É o que
 * permite comparar meses de tamanhos diferentes — R$ 40 mil de comissão
 * num mês de R$ 300 mil e noutro de R$ 500 mil são a mesma linha e coisas
 * opostas.
 *
 * A base é a receita líquida, não a bruta: o cancelamento não gera
 * comissão nem frete, então medir custo variável contra a bruta dilui a
 * porcentagem exatamente nos meses de mais cancelamento — que são os que
 * mais precisam de atenção.
 */

type Grupo = {
  rotulo: string;
  linhas: {
    rotulo: string;
    campo: keyof Resultado;
    /** Custo desce do resultado; entra com sinal negativo na leitura. */
    custo?: boolean;
    forte?: boolean;
  }[];
};

const ESTRUTURA: Grupo[] = [
  {
    rotulo: "Receita",
    linhas: [
      { rotulo: "Receita bruta", campo: "receitaBruta", forte: true },
      { rotulo: "(−) Cancelamentos", campo: "cancelamentos", custo: true },
      { rotulo: "= Receita líquida", campo: "receitaLiquida", forte: true },
    ],
  },
  {
    rotulo: "Custos variáveis — só existem porque houve venda",
    linhas: [
      { rotulo: "(−) Comissão do canal", campo: "comissao", custo: true },
      { rotulo: "(−) Frete", campo: "frete", custo: true },
      { rotulo: "(−) Juros de parcelamento", campo: "juros", custo: true },
      { rotulo: "(−) Impostos", campo: "impostos", custo: true },
      { rotulo: "(−) Embalagem", campo: "embalagem", custo: true },
      { rotulo: "(−) Mercadoria", campo: "mercadoria", custo: true },
      { rotulo: "= Margem de contribuição", campo: "margemContribuicao", forte: true },
    ],
  },
  {
    rotulo: "Despesas — saem exista venda ou não",
    linhas: [
      { rotulo: "(−) Mídia (Ads)", campo: "ads", custo: true },
      { rotulo: "(−) Fixas recorrentes", campo: "fixaRecorrente", custo: true },
      { rotulo: "(−) Variáveis recorrentes", campo: "variavelRecorrente", custo: true },
      { rotulo: "(−) Variáveis avulsas", campo: "variavelAvulsa", custo: true },
      { rotulo: "= RESULTADO", campo: "resultado", forte: true },
    ],
  },
];

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (r: Resultado) => {
  const [a, m] = r.inicio.split("-").map(Number);
  return `${MES[m - 1]}/${String(a).slice(2)}`;
};

export function DreMensal({
  mensal,
  total,
}: {
  mensal: Resultado[];
  total: Resultado;
}) {
  if (!mensal.length) return null;

  const base = (r: Resultado) => (r.receitaLiquida > 0 ? r.receitaLiquida : null);
  const vert = (r: Resultado, v: number) => {
    const b = base(r);
    return b == null ? null : (v / b) * 100;
  };

  const colunas = [...mensal, total];
  const ehTotal = (i: number) => i === colunas.length - 1;

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line flex-wrap">
        <p className="text-[13px] font-semibold text-ink">Demonstrativo mês a mês</p>
        <span className="text-[11.5px] text-ink-3">
          cada linha em reais e como % da receita líquida
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line">
              <th className="label text-left px-3 py-2 sticky left-0 bg-panel z-10 min-w-[210px]">
                Conta
              </th>
              {colunas.map((r, i) => (
                <th
                  key={i}
                  className={cn(
                    "label text-right px-3 py-2 whitespace-nowrap min-w-[112px]",
                    ehTotal(i) && "bg-panel-2 border-l border-line-2"
                  )}
                >
                  {ehTotal(i) ? "Período" : rotuloMes(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ESTRUTURA.map((g) => (
              <React.Fragment key={g.rotulo}>
                <tr>
                  <td
                    colSpan={colunas.length + 1}
                    className="px-3 pt-3 pb-1 text-[11px] text-ink-3 sticky left-0 bg-panel"
                  >
                    {g.rotulo}
                  </td>
                </tr>
                {g.linhas.map((l) => (
                  <tr
                    key={l.rotulo}
                    className={cn(
                      "border-b border-line/60",
                      l.forte && "bg-panel-2/40"
                    )}
                  >
                    <td
                      className={cn(
                        "px-3 py-1.5 sticky left-0 z-10",
                        l.forte ? "bg-panel-2 font-semibold text-ink" : "bg-panel text-ink-2"
                      )}
                    >
                      {l.rotulo}
                    </td>
                    {colunas.map((r, i) => {
                      // `resultado` é nulo quando a cobertura de custo não
                      // fecha. Cair para zero mostraria "R$ 0" na linha de
                      // RESULTADO, que se lê como "empatou" — e não é isso.
                      const bruto = r[l.campo];
                      if (bruto == null) {
                        return (
                          <td
                            key={i}
                            className={cn(
                              "px-3 py-1.5 text-right whitespace-nowrap text-ink-3",
                              ehTotal(i) && "bg-panel-2/60 border-l border-line-2",
                              l.forte && "font-semibold"
                            )}
                          >
                            <span className="num">—</span>
                          </td>
                        );
                      }
                      const v = Number(bruto);
                      const p = vert(r, v);
                      /*
                       * Resultado negativo é o único número desta tabela que
                       * precisa gritar. Custo alto já se lê pela linha de
                       * margem logo abaixo; prejuízo, não.
                       */
                      const negativo = l.campo === "resultado" && v < 0;
                      return (
                        <td
                          key={i}
                          className={cn(
                            "px-3 py-1.5 text-right whitespace-nowrap",
                            ehTotal(i) && "bg-panel-2/60 border-l border-line-2",
                            l.forte && "font-semibold",
                            negativo && "text-down"
                          )}
                        >
                          <span className="num">
                            {l.custo && v > 0 ? "−" : ""}
                            {moneyShort(Math.abs(v))}
                          </span>
                          {p != null && (
                            <span className="num block text-[10.5px] text-ink-3 leading-tight">
                              {p.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <EvolucaoMargem mensal={mensal} />
    </Panel>
  );
}

/**
 * Duas linhas: margem de contribuição e resultado, em % da receita líquida.
 *
 * São percentuais e não reais de propósito. Em reais, o mês de pico tapa
 * os outros e a tendência some atrás do tamanho — que é o oposto do que a
 * DRE existe para mostrar.
 */
function EvolucaoMargem({ mensal }: { mensal: Resultado[] }) {
  if (mensal.length < 2) return null;

  const pontos = mensal.map((r) => ({
    rotulo: rotuloMes(r),
    margem: r.receitaLiquida > 0 ? (r.margemContribuicao / r.receitaLiquida) * 100 : 0,
    // Nulo quando o mês não tem cobertura suficiente para ter resultado.
    resultado:
      r.resultado != null && r.receitaLiquida > 0
        ? (r.resultado / r.receitaLiquida) * 100
        : null,
  }));

  /*
   * A série do resultado só é desenhada se algum mês tiver resultado. Com
   * custos por SKU em branco, nenhum tem — e uma linha reta no zero
   * chamada "Resultado" seria lida como "a operação empatou".
   */
  const temResultado = pontos.some((p) => p.resultado != null);
  const todos = pontos.flatMap((p) =>
    p.resultado == null ? [p.margem] : [p.margem, p.resultado]
  );
  const max = Math.max(10, ...todos);
  const min = Math.min(0, ...todos);
  const faixa = max - min || 1;

  const L = 54, R = 16, T = 18, B = 26;
  const largura = Math.max(320, pontos.length * 74);
  const alturaPlot = 128;
  const x = (i: number) =>
    L + (pontos.length === 1 ? 0 : (i * (largura - L - R)) / (pontos.length - 1));
  const y = (v: number) => T + alturaPlot - ((v - min) / faixa) * alturaPlot;

  const linha = (campo: "margem" | "resultado") =>
    pontos
      .map((p, i) => [p[campo], i] as const)
      .filter((par): par is readonly [number, number] => par[0] != null)
      .map(([v, i]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");

  const zeroY = y(0);

  return (
    <div className="px-4 py-3 border-t border-line">
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
          <i className="w-3 h-0.5 bg-brand inline-block" />
          Margem de contribuição
        </span>
        {temResultado && (
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
            <i className="w-3 h-0.5 bg-up inline-block" />
            Resultado
          </span>
        )}
        <span className="text-[11px] text-ink-3 ml-auto">% da receita líquida</span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${largura} ${T + alturaPlot + B}`}
          className="block"
          style={{ width: "100%", minWidth: largura, height: "auto" }}
          role="img"
          aria-label="Evolução da margem de contribuição e do resultado, em porcentagem da receita líquida."
        >
          {/* zero só aparece quando há prejuízo em algum mês */}
          {min < 0 && (
            <line
              x1={L} y1={zeroY} x2={largura - R} y2={zeroY}
              stroke="var(--down)" strokeWidth="1" strokeDasharray="3 3"
            />
          )}
          <line
            x1={L} y1={T + alturaPlot} x2={largura - R} y2={T + alturaPlot}
            stroke="var(--line-2)" strokeWidth="1"
          />
          <text x={L - 8} y={T + 4} textAnchor="end" className="num" fontSize="10" fill="var(--ink-3)">
            {max.toFixed(0)}%
          </text>
          <text x={L - 8} y={T + alturaPlot} textAnchor="end" className="num" fontSize="10" fill="var(--ink-3)">
            {min.toFixed(0)}%
          </text>

          <polyline points={linha("margem")} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" />
          {temResultado && (
            <polyline points={linha("resultado")} fill="none" stroke="var(--up)" strokeWidth="2" strokeLinejoin="round" />
          )}

          {pontos.map((p, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(p.margem)} r="3" fill="var(--brand)" />
              {p.resultado != null && (
                <circle cx={x(i)} cy={y(p.resultado)} r="3" fill="var(--up)" />
              )}
              <text
                x={x(i)} y={T + alturaPlot + 15} textAnchor="middle"
                className="num" fontSize="10" fill="var(--ink-3)"
              >
                {p.rotulo}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/** Linha simples com análise vertical, para o resumo do período. */
export function LinhaVertical({
  rotulo,
  valor,
  base,
  tipo = "custo",
  indent,
  nota,
}: {
  rotulo: string;
  valor: number;
  /** Receita líquida do período. Sem ela, a % não é calculada. */
  base: number | null;
  tipo?: "receita" | "custo" | "subtotal" | "final";
  indent?: boolean;
  nota?: string;
}) {
  const forte = tipo === "subtotal" || tipo === "final";
  const p = base && base > 0 ? (valor / base) * 100 : null;

  return (
    <div
      className={cn(
        "flex items-baseline gap-2 py-1",
        forte && "border-t border-line mt-1 pt-1.5",
        indent && "pl-3"
      )}
    >
      <span
        className={cn(
          "text-[12.5px] flex-1 min-w-0",
          forte ? "font-semibold text-ink" : "text-ink-2"
        )}
      >
        {rotulo}
        {nota && <span className="block text-[11px] text-ink-3">{nota}</span>}
      </span>
      {p != null && (
        <span className="num text-[11px] text-ink-3 shrink-0 w-12 text-right">
          {p.toFixed(1)}%
        </span>
      )}
      <span
        className={cn(
          "num shrink-0 text-right",
          forte ? "text-[14px] font-semibold" : "text-[12.5px]",
          tipo === "final" && valor < 0 && "text-down",
          tipo === "final" && valor >= 0 && "text-up"
        )}
      >
        {tipo === "custo" && valor > 0 ? "−" : ""}
        {money(Math.abs(valor))}
      </span>
    </div>
  );
}

/** Cabeçalho com os quatro números que resumem a DRE. */
export function ResumoDre({ r }: { r: Resultado }) {
  const parcial = r.cobertura < 99.5;
  const cartoes = [
    { k: "Receita líquida", v: money(r.receitaLiquida), sub: `bruta ${moneyShort(r.receitaBruta)}` },
    {
      k: "Margem de contribuição",
      v: r.margemPct != null ? pct(r.margemPct, 1) : "—",
      /*
       * A porcentagem é sobre a receita APURADA, não sobre a do período.
       * Com 30% de cobertura, "margem de 18%" significa 18% de 30% da
       * receita — e sem esta linha alguém lê 18% da operação.
       */
      sub: parcial
        ? `${money(r.margemContribuicao)} · só da parte apurada`
        : money(r.margemContribuicao),
    },
    {
      k: "Resultado",
      v: r.resultadoPct != null ? pct(r.resultadoPct, 1) : "—",
      // Sem cobertura não há resultado. Dizer o que falta vale mais que
      // um número vermelho que só reflete a mídia do período.
      sub: r.resultado != null ? money(r.resultado) : "falta custo por SKU",
      ruim: r.resultado != null && r.resultado < 0,
    },
    { k: "Cobertura da margem", v: pct(r.cobertura, 1), sub: `${moneyShort(r.receitaSemCusto)} sem custo` },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-px bg-line border border-line rounded-r2 overflow-hidden mb-3">
      {cartoes.map((c) => (
        <div key={c.k} className="bg-panel px-3.5 py-2.5 flex flex-col gap-0.5">
          <span className="label">{c.k}</span>
          <span
            className={cn(
              "num text-[19px] font-semibold",
              c.ruim ? "text-down" : "text-ink"
            )}
          >
            {c.v}
          </span>
          <span className="text-[11px] text-ink-3 num">{c.sub}</span>
        </div>
      ))}
    </div>
  );
}
