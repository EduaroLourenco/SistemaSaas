"use client";

import * as React from "react";
import { Badge } from "@/components/ui/primitives";
import { money, count, pct, delta as fmtDelta } from "@/lib/format";
import type { AnuncioAnalisado } from "@/lib/analise";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

/** Cor semântica do desvio de preço — mesma régua da tela. */
function tomDesvio(d: number) {
  const a = Math.abs(d);
  return a < 2 ? "up" : a < 6 ? "warn" : "down";
}

type ColunaSemana =
  | "semana"
  | "visitas"
  | "vendas"
  | "conversao"
  | "receita"
  | "realizado"
  | "anunciado"
  | "comissao"
  | "cobrada"
  | "desvio";

const COLUNAS: {
  id: ColunaSemana;
  rotulo: string;
  dica?: string;
  align: "left" | "right";
}[] = [
  { id: "semana", rotulo: "Semana", align: "left" },
  { id: "visitas", rotulo: "Visitas", align: "right" },
  { id: "vendas", rotulo: "Vendas", align: "right" },
  { id: "conversao", rotulo: "Conv.", align: "right" },
  { id: "receita", rotulo: "Receita", align: "right" },
  {
    id: "realizado",
    rotulo: "Preço pago",
    dica: "Média do que o cliente pagou de fato, vinda dos pedidos",
    align: "right",
  },
  {
    id: "anunciado",
    rotulo: "Na vitrine",
    dica: "Preço que estava publicado no anúncio naquela semana",
    align: "right",
  },
  {
    id: "comissao",
    rotulo: "Tarifa tabela",
    dica: "Alíquota cheia do anúncio, do catálogo. Referência, não custo.",
    align: "right",
  },
  {
    id: "cobrada",
    rotulo: "Tarifa cobrada",
    dica:
      "O que o canal reteve de fato na semana. Menor que a de tabela quando " +
      "houve redução por campanha. Vazio quando não houve venda com comissão conhecida.",
    align: "right",
  },
  { id: "desvio", rotulo: "vs. ideal", align: "right" },
];

/**
 * Semana a semana do anúncio, ordenável por qualquer coluna.
 *
 * Mostra os DOIS preços de propósito. O "pago" só existe quando houve venda;
 * o "da vitrine" existe sempre. Quando as vendas caem, comparar os dois é o
 * que separa "subi o preço" de "o mercado parou de comprar".
 */
export function TabelaSemanal({ item }: { item: AnuncioAnalisado }) {
  const [ordem, setOrdem] = React.useState<{
    col: ColunaSemana;
    dir: "asc" | "desc";
  }>({ col: "semana", dir: "asc" });
  const [aberta, setAberta] = React.useState<string | null>(null);

  const linhas = React.useMemo(() => {
    const valor = (w: (typeof item.semanas)[number], col: ColunaSemana) => {
      const pago = w.precoRealizado ?? w.precoAnunciado;
      switch (col) {
        case "semana":
          return w.semana;
        case "visitas":
          return w.visitas;
        case "vendas":
          return w.vendas;
        case "conversao":
          return w.visitas ? (w.vendas / w.visitas) * 100 : 0;
        case "receita":
          return w.receita;
        case "realizado":
          return pago;
        case "anunciado":
          return w.precoAnunciado;
        case "comissao":
          return w.comissao;
        case "cobrada":
          return w.tarifaCobrada ?? -1;
        case "desvio":
          return w.precoIdeal ? ((pago - w.precoIdeal) / w.precoIdeal) * 100 : 0;
      }
    };

    const dir = ordem.dir === "asc" ? 1 : -1;
    return [...item.semanas].sort((a, b) => {
      const va = valor(a, ordem.col);
      const vb = valor(b, ordem.col);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    });
  }, [item.semanas, ordem]);

  function ordenar(col: ColunaSemana) {
    setOrdem((o) =>
      o.col === col
        ? { col, dir: o.dir === "asc" ? "desc" : "asc" }
        : { col, dir: col === "semana" ? "asc" : "desc" }
    );
  }

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="label">Semana a semana</p>
        <p className="text-[11px] text-ink-3 text-right">
          ordene pelo cabeçalho · clique na semana para ver os dias
        </p>
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full border-collapse text-[12px] min-w-[640px]">
          <thead>
            <tr className="bg-panel-2">
              {COLUNAS.map((c) => {
                const ativa = ordem.col === c.id;
                return (
                  <th
                    key={c.id}
                    title={c.dica}
                    className={
                      "h-8 px-2 border-b border-line font-semibold text-[10px] uppercase tracking-[0.04em] whitespace-nowrap " +
                      (c.align === "left" ? "text-left" : "text-right") +
                      (ativa ? " text-ink" : " text-ink-3")
                    }
                  >
                    <button
                      onClick={() => ordenar(c.id)}
                      className={
                        "inline-flex items-center gap-1 hover:text-ink transition-colors " +
                        (c.align === "right" ? "flex-row-reverse" : "")
                      }
                    >
                      {c.rotulo}
                      {ativa ? (
                        ordem.dir === "asc" ? (
                          <ChevronUp className="w-3 h-3" strokeWidth={2.5} />
                        ) : (
                          <ChevronDown className="w-3 h-3" strokeWidth={2.5} />
                        )
                      ) : (
                        <ChevronsUpDown
                          className="w-3 h-3 opacity-40"
                          strokeWidth={2.5}
                        />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {linhas.map((w, i) => {
              const pago = w.precoRealizado ?? w.precoAnunciado;
              const desvio = w.precoIdeal
                ? ((pago - w.precoIdeal) / w.precoIdeal) * 100
                : 0;
              const conv = w.visitas ? (w.vendas / w.visitas) * 100 : 0;
              // Pago abaixo da vitrine = houve desconto extra na venda:
              // campanha relâmpago, cupom ou frete embutido.
              const comDesconto =
                w.precoRealizado !== null &&
                w.precoRealizado < w.precoAnunciado * 0.995;
              const escolhida = aberta === w.semana;

              return (
                <React.Fragment key={w.semana}>
                  <tr
                    onClick={() => setAberta(escolhida ? null : w.semana)}
                    className={
                      "border-b border-line cursor-pointer transition-colors " +
                      (escolhida
                        ? "bg-brand-wash"
                        : i % 2 === 1
                          ? "bg-panel-2/55 hover:bg-panel-3"
                          : "hover:bg-panel-3")
                    }
                  >
                    <td className="h-8 px-2 whitespace-nowrap">
                      <span className="num text-ink font-medium">{w.semana}</span>
                      <span className="num text-ink-3 ml-1.5 hidden sm:inline">
                        {w.intervalo}
                      </span>
                    </td>
                    <td className="num h-8 px-2 text-right text-ink-2">
                      {count(w.visitas)}
                    </td>
                    <td className="num h-8 px-2 text-right text-ink">
                      {count(w.vendas)}
                    </td>
                    <td className="num h-8 px-2 text-right text-ink-2">
                      {pct(conv, 2)}
                    </td>
                    <td className="num h-8 px-2 text-right text-ink font-medium">
                      {money(w.receita)}
                    </td>
                    <td className="num h-8 px-2 text-right">
                      {w.precoRealizado === null ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <span className={comDesconto ? "text-warn" : "text-ink-2"}>
                          {money(w.precoRealizado)}
                        </span>
                      )}
                    </td>
                    <td className="num h-8 px-2 text-right text-ink-3">
                      {money(w.precoAnunciado)}
                    </td>
                    <td className="num h-8 px-2 text-right text-ink-3">
                      {w.comissao > 0 ? pct(w.comissao) : "—"}
                    </td>
                    <td className="num h-8 px-2 text-right">
                      {w.tarifaCobrada == null ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <span
                          className={
                            // Verde quando ficou abaixo da tabela: é campanha
                            // que valeu, e o olho precisa achar isso rápido.
                            w.comissao > 0 && w.tarifaCobrada < w.comissao - 0.5
                              ? "text-up font-semibold"
                              : "text-ink"
                          }
                        >
                          {pct(w.tarifaCobrada)}
                        </span>
                      )}
                    </td>
                    <td className="h-8 px-2 text-right">
                      <Badge tone={tomDesvio(desvio)}>
                        <span className="num">{fmtDelta(desvio)}</span>
                      </Badge>
                    </td>
                  </tr>

                  {escolhida && (
                    <tr className="border-b border-line bg-panel-2">
                      <td colSpan={COLUNAS.length} className="px-2 py-2.5">
                        {w.dias.length === 0 ? (
                          <p className="text-[11px] text-ink-3">
                            Nenhuma venda nesta semana. Na vitrine o preço era{" "}
                            <span className="num">{money(w.precoAnunciado)}</span>.
                          </p>
                        ) : (
                          <>
                            <p className="label mb-1.5">Quando vendeu</p>
                            <div className="flex flex-wrap gap-1.5">
                              {w.dias.map((d) => (
                                <span
                                  key={d.data}
                                  className="flex items-center gap-1.5 h-7 px-2 rounded-r1 border border-line bg-panel"
                                >
                                  <span className="text-[11px] font-medium text-ink-2">
                                    {d.diaSemana}
                                  </span>
                                  <span className="num text-[11px] text-ink-3">
                                    {d.data.slice(8)}/{d.data.slice(5, 7)}
                                  </span>
                                  <span className="num text-[12px] font-semibold text-ink">
                                    {count(d.vendas)}
                                    <span className="text-ink-3 font-normal"> un</span>
                                  </span>
                                  <span className="num text-[11px] text-ink-2">
                                    {money(d.preco)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
