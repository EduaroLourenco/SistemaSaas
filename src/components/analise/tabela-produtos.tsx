"use client";

import * as React from "react";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AnuncioAnalisado, Lente } from "@/lib/analise";
import { FotoAnuncio } from "@/components/ui/foto-anuncio";
import { TagAnuncio } from "@/components/ui/tag-anuncio";
import { ChevronDown, ChevronRight, Columns2, Search } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * A carteira, um produto por linha.
 *
 * ── O que esta tabela substituiu ──
 *
 * Duas. A matriz de SKU × semana, com oito colunas de dinheiro, e a
 * "Lista por anúncio", com as mesmas 1.004 linhas num grão mais fino.
 * Eram a mesma carteira duas vezes, e nenhuma das duas respondia a
 * pergunta de quem abre a tela: qual produto tem problema, e qual.
 *
 * ── Por que as semanas viraram um traço ──
 *
 * Oito colunas de número pedem que alguém compare célula a célula para
 * ver o formato. A curva mostra o formato de uma vez, e as colunas que
 * sobram passam a ser as que decidem: preço contra a tabela, subsídio,
 * conversão, estoque. O detalhe semana a semana continua existindo, no
 * raio-X do anúncio, que é onde a pergunta "quando foi" aparece.
 *
 * ── Por que o grão é o SKU ──
 *
 * São 3,9 anúncios por produto — clássico e premium, duas contas. Ler
 * MLB a MLB divide a venda do mesmo colchão em quatro linhas e nenhuma
 * delas é o produto. A linha abre nos anúncios quando a pergunta for
 * qual dos quatro.
 */

type Curva = "receita" | "visitas" | "preco";

const CURVAS: { value: Curva; label: string }[] = [
  { value: "receita", label: "Receita" },
  { value: "visitas", label: "Visitas" },
  { value: "preco", label: "Preço pago" },
];

/** As lentes que viram etiqueta na linha, da mais cara para a menos. */
const ETIQUETA: { id: Lente; texto: string; tom: "down" | "warn" | "neutral" | "up" }[] = [
  { id: "sangrando", texto: "sangrando", tom: "down" },
  { id: "falsa_tracao", texto: "falsa tração", tom: "warn" },
  { id: "desperdicio", texto: "desperdício", tom: "warn" },
  { id: "fora_do_preco", texto: "fora do preço", tom: "neutral" },
  { id: "joias", texto: "joia", tom: "up" },
];

/**
 * Acima disto o canal não controla estoque: é anúncio sob encomenda, e
 * o vendedor declara um número alto para não ficar sem anúncio. Somar
 * afoga o estoque real dos irmãos do mesmo SKU — um produto com quatro
 * anúncios assim aparecia com 160.004 unidades.
 */
const SOB_ENCOMENDA = 40000;

type Semanas = Map<string, { receita: number; vendas: number; visitas: number }>;

type Produto = {
  chave: string;
  sku: string;
  titulo: string;
  mlbPrincipal: string;
  anuncios: AnuncioAnalisado[];
  porSemana: Semanas;
  visitas: number;
  vendas: number;
  receita: number;
  /** Preço pago na última semana com venda, somando os anúncios. */
  preco: number;
  precoIdeal: number;
  subsidio: number;
  estoque: number | null;
  /** Algum anúncio do produto é sob encomenda: o estoque não é quantidade. */
  sobEncomenda: boolean;
  lentes: Lente[];
  /** Nenhum anúncio do produto está no ar. */
  todoParado: boolean;
};

function valorDe(porSemana: Semanas, semana: string, c: Curva): number | null {
  const s = porSemana.get(semana);
  if (!s) return null;
  if (c === "receita") return s.receita;
  if (c === "visitas") return s.visitas;
  /* Sem venda não há preço pago. Zero aqui seria "vendeu de graça". */
  return s.vendas ? s.receita / s.vendas : null;
}

/**
 * A forma das semanas, em 76 por 22 pixels.
 *
 * SVG à mão porque são 256 linhas: um gráfico de biblioteca por linha
 * trava a rolagem. Semana sem leitura quebra o traço em vez de ligar os
 * vizinhos — a reta por cima do buraco inventa um valor que ninguém
 * mediu.
 */
function Tracado({
  porSemana,
  semanas,
  curva,
}: {
  porSemana: Semanas;
  semanas: string[];
  curva: Curva;
}) {
  const L = 76;
  const A = 22;
  const vs = semanas.map((w) => valorDe(porSemana, w, curva));
  const com = vs.filter((v): v is number => v != null);
  if (com.length < 2)
    return <span className="inline-block shrink-0" style={{ width: L }} />;

  const baixo = Math.min(...com);
  const faixa = Math.max(...com) - baixo || 1;
  const px = (i: number) => (i * L) / Math.max(1, vs.length - 1);
  const py = (v: number) => A - 1 - ((v - baixo) / faixa) * (A - 2);

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

  const cor = com[com.length - 1] >= com[0] ? "var(--up)" : "var(--down)";

  return (
    <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} className="shrink-0" aria-hidden>
      {trechos.map((p, i) => (
        <g key={i}>
          {/* A área é o que faz o traço existir na linha da tabela: 1,75px
              de fio sozinho some. */}
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

export function TabelaProdutos({
  itens,
  semanas,
  abrir,
  marcados,
  marcar,
  comparar,
}: {
  itens: AnuncioAnalisado[];
  semanas: string[];
  abrir: (a: AnuncioAnalisado) => void;
  marcados: string[];
  marcar: (m: string[]) => void;
  comparar: () => void;
}) {
  const [curva, setCurva] = React.useState<Curva>("receita");
  const [busca, setBusca] = React.useState("");
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [limite, setLimite] = React.useState(40);

  const produtos = React.useMemo(() => {
    const mapa = new Map<string, Produto>();

    for (const a of itens) {
      /* Sem SKU, o próprio MLB vira a chave — melhor uma linha isolada
         que um balde "sem SKU" misturando produtos sem relação. */
      const chave = a.sku?.trim() || a.mlb;
      const p =
        mapa.get(chave) ??
        ({
          chave,
          sku: a.sku?.trim() || "—",
          titulo: a.titulo,
          mlbPrincipal: a.mlb,
          anuncios: [],
          porSemana: new Map(),
          visitas: 0,
          vendas: 0,
          receita: 0,
          preco: 0,
          precoIdeal: 0,
          subsidio: 0,
          estoque: null,
          sobEncomenda: false,
          lentes: [],
          todoParado: true,
        } as Produto);

      p.anuncios.push(a);
      p.visitas += a.metricas.visitas;
      p.vendas += a.metricas.vendas;
      p.receita += a.metricas.receita;
      p.subsidio += a.metricas.subsidio;
      if (a.estoque != null) {
        if (a.estoque >= SOB_ENCOMENDA) p.sobEncomenda = true;
        else p.estoque = (p.estoque ?? 0) + a.estoque;
      }
      if (a.status === "ativo") p.todoParado = false;
      for (const l of a.lentes) if (l !== "todos" && !p.lentes.includes(l)) p.lentes.push(l);

      for (const w of a.semanas) {
        const at = p.porSemana.get(w.semana) ?? { receita: 0, vendas: 0, visitas: 0 };
        at.receita += w.receita;
        at.vendas += w.vendas;
        at.visitas += w.visitas;
        p.porSemana.set(w.semana, at);
      }
      mapa.set(chave, p);
    }

    for (const p of mapa.values()) {
      /* O que mais vende primeiro: a ordem de chegada do banco não diz
         nada, e é o anúncio campeão que responde pelo produto. */
      p.anuncios.sort((x, y) => y.metricas.receita - x.metricas.receita);
      p.mlbPrincipal = p.anuncios[0]?.mlb ?? p.mlbPrincipal;
      /* Preço do produto: o pago no conjunto, não a média das médias —
         um anúncio com uma venda pesaria igual a outro com quinze. */
      p.preco = p.vendas ? p.receita / p.vendas : 0;
      /* O ideal é o do anúncio campeão: é a referência que vale para o
         produto, e os outros anúncios do mesmo SKU compartilham tabela. */
      p.precoIdeal = p.anuncios.find((a) => a.metricas.precoIdeal > 0)?.metricas.precoIdeal ?? 0;
    }

    return [...mapa.values()].sort((a, b) => b.receita - a.receita);
  }, [itens]);

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return produtos;
    return produtos.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.titulo.toLowerCase().includes(q) ||
        p.anuncios.some((a) => a.mlb.toLowerCase().includes(q)),
    );
  }, [produtos, busca]);

  const visiveis = filtrados.slice(0, limite);

  const desvioDe = (preco: number, ideal: number) =>
    ideal > 0 && preco > 0 ? ((preco - ideal) / ideal) * 100 : null;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Por produto"
        action={
          marcados.length ? (
            <span className="flex items-center gap-2">
              <span className="num text-[12px] text-ink-2">
                {marcados.length} marcados
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={comparar}
                disabled={marcados.length < 2 || marcados.length > 3}
                title={
                  marcados.length < 2
                    ? "Marque ao menos dois anúncios"
                    : marcados.length > 3
                      ? "Compare no máximo três de cada vez"
                      : "Ver lado a lado"
                }
              >
                <Columns2 className="w-3.5 h-3.5" />
                Comparar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => marcar([])}>
                Limpar
              </Button>
            </span>
          ) : (
            <span className="num text-[12px] text-ink-3">{filtrados.length} SKUs</span>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-line">
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
        <span className="flex items-center gap-2">
          <span className="label">Curva</span>
          <Segmented options={CURVAS} value={curva} onChange={setCurva} />
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-20 bg-panel text-left px-3 py-2 border-r border-line min-w-[200px] sm:min-w-[260px]">
                <span className="label">Produto</span>
              </th>
              <th className="px-2 py-2 min-w-[88px]">
                <span className="label">Curva</span>
              </th>
              {["Visitas", "Vendas", "Conversão", "Receita", "Preço pago", "vs. tabela", "Deixado na mesa", "Estoque"].map(
                (h) => (
                  <th key={h} className="px-3 py-2 text-right whitespace-nowrap">
                    <span className="label">{h}</span>
                  </th>
                ),
              )}
            </tr>
          </thead>

          <tbody>
            {visiveis.map((p) => {
              const expandido = aberto === p.chave;
              const desvio = desvioDe(p.preco, p.precoIdeal);
              return (
                <React.Fragment key={p.chave}>
                  <tr
                    className="border-b border-line hover:bg-panel-2 cursor-pointer"
                    onClick={() => setAberto(expandido ? null : p.chave)}
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-panel text-left px-3 py-2
                                 border-r border-line font-normal max-w-[230px] sm:max-w-[320px]"
                    >
                      <span className="flex items-start gap-2">
                        {expandido ? (
                          <ChevronDown className="w-3.5 h-3.5 text-ink-3 mt-1 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-ink-3 mt-1 shrink-0" />
                        )}
                        <FotoAnuncio mlb={p.mlbPrincipal} alt={p.titulo} tamanho={34} />
                        <span className="min-w-0">
                          <span className="num text-[12px] font-semibold text-ink block">
                            {p.sku}
                          </span>
                          <span className="text-[12px] text-ink-2 block break-words">
                            {p.titulo}
                          </span>
                          <span className="flex flex-wrap items-center gap-1 mt-1">
                            <span className="text-[11.5px] text-ink-3">
                              {p.anuncios.length} anúncio{p.anuncios.length > 1 ? "s" : ""}
                            </span>
                            {p.todoParado && <Badge tone="warn">fora do ar</Badge>}
                            {/* Duas etiquetas no máximo: quatro viram ruído e
                                param de ser lidas. As mais caras primeiro. */}
                            {ETIQUETA.filter((e) => p.lentes.includes(e.id))
                              .slice(0, 2)
                              .map((e) => (
                                <Badge key={e.id} tone={e.tom}>
                                  {e.texto}
                                </Badge>
                              ))}
                          </span>
                        </span>
                      </span>
                    </th>

                    <td className="px-2 py-2">
                      <Tracado porSemana={p.porSemana} semanas={semanas} curva={curva} />
                    </td>
                    <td className="num px-3 py-2 text-right text-ink-2">{count(p.visitas)}</td>
                    <td className="num px-3 py-2 text-right text-ink">{count(p.vendas)}</td>
                    <td className="num px-3 py-2 text-right text-ink-2">
                      {p.visitas ? pct((p.vendas / p.visitas) * 100, 2) : "—"}
                    </td>
                    <td className="num px-3 py-2 text-right text-ink font-medium">
                      {money(p.receita)}
                    </td>
                    <td className="num px-3 py-2 text-right text-ink-2">
                      {p.preco ? money(p.preco) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {desvio == null ? (
                        <span
                          className="text-ink-3"
                          title={p.precoIdeal ? "sem venda no período" : "fora da Fórmula base"}
                        >
                          —
                        </span>
                      ) : (
                        <Badge tone={Math.abs(desvio) < 3 ? "neutral" : desvio < 0 ? "down" : "warn"}>
                          {desvio > 0 ? "+" : ""}
                          {desvio.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                        </Badge>
                      )}
                    </td>
                    <td className="num px-3 py-2 text-right">
                      {p.subsidio > 0 ? (
                        <span className="text-down">{money(p.subsidio)}</span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="num px-3 py-2 text-right text-ink-2">
                      {/* Com parte do SKU sob encomenda, um "0 +" na frente
                          só atrapalha: o zero ali é dos irmãos com controle. */}
                      {p.estoque != null && (p.estoque > 0 || !p.sobEncomenda) && count(p.estoque)}
                      {p.sobEncomenda && (
                        <span
                          className="text-[11.5px] text-ink-3"
                          title="o canal não controla o estoque deste anúncio"
                        >
                          {p.estoque ? " + " : ""}sob encomenda
                        </span>
                      )}
                      {p.estoque == null && !p.sobEncomenda && (
                        <span className="text-ink-3" title="canal não informou">
                          —
                        </span>
                      )}
                    </td>
                  </tr>

                  {expandido &&
                    /*
                     * Só abre com números quem tem número. Oito linhas de
                     * zero enterram os dois anúncios que venderam, e zero
                     * aqui seria mentira: ninguém mediu.
                     */
                    p.anuncios
                      .filter((a) => a.metricas.visitas > 0 || a.metricas.vendas > 0)
                      .map((a) => {
                      const d = desvioDe(a.metricas.preco, a.metricas.precoIdeal);
                      return (
                        <tr
                          key={a.mlb}
                          className="border-b border-line bg-panel-2 hover:bg-panel-3 cursor-pointer"
                          onClick={() => abrir(a)}
                        >
                          <th
                            scope="row"
                            className="sticky left-0 z-10 bg-panel-2 text-left px-3 py-1.5
                                       border-r border-line font-normal"
                          >
                            <span className="flex items-start gap-2 pl-1">
                              <input
                                type="checkbox"
                                aria-label={`Marcar ${a.mlb} para comparar`}
                                checked={marcados.includes(a.mlb)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  marcar(
                                    e.target.checked
                                      ? [...marcados, a.mlb]
                                      : marcados.filter((m) => m !== a.mlb),
                                  )
                                }
                                className="mt-1.5 w-3.5 h-3.5 shrink-0 accent-brand cursor-pointer"
                              />
                              <FotoAnuncio mlb={a.mlb} alt={a.mlb} tamanho={26} />
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5 flex-wrap">
                                  <span className="num text-[12px] text-ink-2">{a.mlb}</span>
                                  <Badge tone={a.tipo === "Premium" ? "brand" : "neutral"}>
                                    {a.tipo}
                                  </Badge>
                                  <TagAnuncio status={a.status} />
                                </span>
                                <span className="block text-[12px] text-ink-3">{a.conta}</span>
                              </span>
                            </span>
                          </th>

                          <td className="px-2 py-1.5">
                            <Tracado
                              porSemana={
                                new Map(
                                  a.semanas.map((w) => [
                                    w.semana,
                                    { receita: w.receita, vendas: w.vendas, visitas: w.visitas },
                                  ]),
                                )
                              }
                              semanas={semanas}
                              curva={curva}
                            />
                          </td>
                          <td className="num px-3 py-1.5 text-right text-ink-3">
                            {count(a.metricas.visitas)}
                          </td>
                          <td className="num px-3 py-1.5 text-right text-ink-2">
                            {count(a.metricas.vendas)}
                          </td>
                          <td className="num px-3 py-1.5 text-right text-ink-3">
                            {a.metricas.visitas ? pct(a.metricas.conversao, 2) : "—"}
                          </td>
                          <td className="num px-3 py-1.5 text-right text-ink-2">
                            {money(a.metricas.receita)}
                          </td>
                          <td className="num px-3 py-1.5 text-right text-ink-3">
                            {a.metricas.preco ? money(a.metricas.preco) : "—"}
                          </td>
                          <td className="num px-3 py-1.5 text-right text-ink-3">
                            {d == null
                              ? "—"
                              : `${d > 0 ? "+" : ""}${d.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
                          </td>
                          <td className="num px-3 py-1.5 text-right text-ink-3">
                            {a.metricas.subsidio > 0 ? money(a.metricas.subsidio) : "—"}
                          </td>
                          <td className="num px-3 py-1.5 text-right text-ink-3">
                            {a.estoque == null
                              ? "—"
                              : a.estoque >= SOB_ENCOMENDA
                                ? "sob encomenda"
                                : count(a.estoque)}
                          </td>
                        </tr>
                      );
                    })}

                  {expandido &&
                    (() => {
                      const mudos = p.anuncios.filter(
                        (a) => !a.metricas.visitas && !a.metricas.vendas,
                      );
                      if (!mudos.length) return null;
                      const parados = mudos.filter((a) => a.status !== "ativo").length;
                      return (
                        <tr className="border-b border-line bg-panel-2">
                          <td colSpan={10} className="px-3 py-1.5 pl-10 text-[12px] text-ink-3">
                            {mudos.length} sem visita nem venda no período
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
          onClick={() => setLimite((l) => l + 60)}
          className="w-full py-2.5 text-[12.5px] text-ink-2 hover:text-ink
                     hover:bg-panel-2 border-t border-line"
        >
          Mostrar mais {Math.min(60, filtrados.length - limite)} de{" "}
          {filtrados.length - limite}
        </button>
      )}

      {!filtrados.length && (
        <p className={cn("px-4 py-10 text-center text-[13px] text-ink-3")}>
          Nenhum produto neste recorte.
        </p>
      )}
    </Panel>
  );
}
