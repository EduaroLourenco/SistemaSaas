"use client";

import * as React from "react";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AnuncioAnalisado } from "@/lib/analise";
import { ArrowDown, ArrowUp } from "lucide-react";

/**
 * A carteira anúncio a anúncio, ordenável.
 *
 * ── Por que ela existe, se já há a tabela de produtos ──
 *
 * São duas perguntas diferentes. A de produtos responde "qual colchão tem
 * problema" e por isso soma os 3,9 anúncios de cada SKU numa linha. Esta
 * responde "qual ANÚNCIO", que é a pergunta de quem vai mexer no preço:
 * clássico e premium têm tarifa diferente, as duas contas têm preço
 * diferente, e é num MLB que se mexe — não num SKU.
 *
 * ── O que ela mostra que a outra não mostrava ──
 *
 * Vitrine e praticado em colunas separadas. Eram um campo só, e anúncio
 * que vendeu nunca mostrava a vitrine: não havia onde pôr. A diferença
 * entre os dois é campanha, cupom ou frete embutido — e é ela que explica
 * por que o desvio contra a tabela não bate com o preço que está no ar.
 *
 * ── O que está vazio, e por quê ──
 *
 * Medido em 28/10/2026, nos 1.016 anúncios da Probel em 8 semanas: 729
 * têm leitura de vitrine, 124 venderam, 122 estão fora da Fórmula base.
 * Então a maioria das linhas tem célula vazia em alguma coluna de preço,
 * e cada vazio diz o motivo em duas palavras — "sem leitura" não é a
 * mesma coisa que "sem venda", nem que "sem tabela".
 */

/** Acima disto o canal não controla estoque: é anúncio sob encomenda. */
const SOB_ENCOMENDA = 40000;

type Chave =
  | "titulo"
  | "visitas"
  | "vendas"
  | "conversao"
  | "receita"
  | "vitrine"
  | "praticado"
  | "tabela"
  | "desvio"
  | "subsidio"
  | "estoque";

type Coluna = {
  chave: Chave;
  nome: string;
  ajuda: string;
  /** O valor que ordena. Null é "não medimos", e vai sempre para o fim. */
  valor?: (a: AnuncioAnalisado) => number | null;
  /** Como a célula se desenha quando há valor. */
  celula?: (v: number, a: AnuncioAnalisado) => React.ReactNode;
  /** O que a célula diz quando não há. Duas palavras, dentro da própria célula. */
  vazio?: string;
  /** Fecha um grupo de colunas com um fio. */
  fecha?: boolean;
};

/** Cor semântica do desvio: perto da tabela é bom, longe é caro. */
function tomDesvio(d: number) {
  const a = Math.abs(d);
  return a < 2 ? "up" : a < 6 ? "warn" : "down";
}

const COLUNAS: Coluna[] = [
  {
    chave: "visitas",
    nome: "Visitas",
    ajuda: "Quantas pessoas abriram o anúncio no período.",
    valor: (a) => a.metricas.visitas,
    celula: (v) => <span className="text-ink-2">{count(v)}</span>,
  },
  {
    chave: "vendas",
    nome: "Vendas",
    ajuda: "Unidades vendidas no período.",
    valor: (a) => a.metricas.vendas,
    celula: (v) => <span className="text-ink">{count(v)}</span>,
  },
  {
    chave: "conversao",
    nome: "Conversão",
    ajuda: "De cada 100 visitas, quantas viraram venda.",
    /* `metricas.conversao` já vem em pontos percentuais. */
    valor: (a) => (a.metricas.vendas ? a.metricas.conversao : null),
    celula: (v) => <span className="text-ink-2">{pct(v, 2)}</span>,
    vazio: "sem venda",
    fecha: true,
  },
  {
    chave: "receita",
    nome: "Receita",
    ajuda: "Quanto entrou no período.",
    valor: (a) => a.metricas.receita,
    celula: (v) => <span className="font-medium text-ink">{money(v)}</span>,
    fecha: true,
  },
  {
    chave: "vitrine",
    nome: "Vitrine",
    ajuda:
      "O preço publicado, que o comprador vê antes de comprar. Da última semana do recorte com leitura — elas começam em 30/09/2026.",
    valor: (a) => a.metricas.precoVitrine,
    celula: (v) => <span className="text-ink-2">{money(v)}</span>,
    vazio: "sem leitura",
  },
  {
    chave: "praticado",
    nome: "Praticado",
    ajuda:
      "O que o cliente pagou: receita dividida por unidades, na última semana com venda. Difere da vitrine por campanha, cupom ou frete embutido.",
    valor: (a) => a.metricas.precoPraticado,
    celula: (v) => <span className="text-ink">{money(v)}</span>,
    vazio: "sem venda",
  },
  {
    chave: "tabela",
    nome: "Tabela",
    ajuda: "O preço da sua Fórmula base para este anúncio, na comissão dele.",
    valor: (a) => a.metricas.precoIdeal || null,
    celula: (v) => <span className="text-ink-2">{money(v)}</span>,
    vazio: "sem tabela",
  },
  {
    chave: "desvio",
    nome: "vs. tabela",
    ajuda: "Quanto o praticado ficou acima ou abaixo da tabela.",
    valor: (a) =>
      a.metricas.precoIdeal && a.metricas.precoPraticado != null ? a.metricas.desvio : null,
    celula: (v) => (
      <Badge tone={tomDesvio(v)}>
        <span className="num">
          {v > 0 ? "+" : ""}
          {v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
        </span>
      </Badge>
    ),
  },
  {
    chave: "subsidio",
    nome: "Deixou de ganhar",
    ajuda:
      "A diferença entre a tabela e o preço pago, multiplicada pelas unidades, nas semanas em que vendeu abaixo.",
    valor: (a) => a.metricas.subsidio || null,
    celula: (v) => <span className="font-medium text-down">{money(v)}</span>,
    fecha: true,
  },
  {
    chave: "estoque",
    nome: "Estoque",
    ajuda: 'Saldo da última sincronização. "Sob encomenda" é anúncio que o canal não controla.',
    valor: (a) => a.estoque,
    celula: (v) =>
      v >= SOB_ENCOMENDA ? (
        <span className="text-[12px] text-ink-3">sob encomenda</span>
      ) : (
        <span className={v === 0 ? "text-down font-medium" : "text-ink-2"}>{count(v)}</span>
      ),
    vazio: "sem leitura",
  },
];

/**
 * A forma das vendas no recorte, em 64 por 18 pixels.
 *
 * SVG à mão: são centenas de linhas, e um gráfico de biblioteca por linha
 * trava a rolagem.
 */
function MiniSerie({ serie }: { serie: number[] }) {
  const L = 64;
  const A = 18;
  if (serie.filter((v) => v > 0).length < 2)
    return <span className="inline-block" style={{ width: L }} />;

  const alto = Math.max(...serie);
  const baixo = Math.min(...serie);
  const faixa = alto - baixo || 1;
  const px = (i: number) => (i * L) / Math.max(1, serie.length - 1);
  const py = (v: number) => A - 1 - ((v - baixo) / faixa) * (A - 2);
  const caminho = serie
    .map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`)
    .join(" ");
  const cor = serie[serie.length - 1] >= serie[0] ? "var(--up)" : "var(--down)";

  return (
    <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} className="shrink-0" aria-hidden>
      <path d={`${caminho} L${L},${A} L0,${A} Z`} fill={cor} opacity={0.12} />
      <path d={caminho} fill="none" stroke={cor} strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  );
}

export function TabelaBI({
  itens,
  semanas,
  abrir,
}: {
  itens: AnuncioAnalisado[];
  semanas: string[];
  abrir: (a: AnuncioAnalisado) => void;
}) {
  const [ordem, setOrdem] = React.useState<Chave>("receita");
  const [desc, setDesc] = React.useState(true);
  const [limite, setLimite] = React.useState(60);

  const ordenados = React.useMemo(() => {
    const col = COLUNAS.find((c) => c.chave === ordem);
    const lista = [...itens];
    if (!col) {
      lista.sort((a, b) => (desc ? -1 : 1) * a.titulo.localeCompare(b.titulo, "pt-BR"));
      return lista;
    }
    /*
     * Nulo vai sempre para o fim, nas duas direções. Tratá-lo como zero
     * encheria o topo da ordenação por "vitrine" com os 287 anúncios que
     * nunca tiveram leitura — e eles não são os mais baratos, são os que
     * não medimos.
     */
    lista.sort((a, b) => {
      const x = col.valor!(a);
      const y = col.valor!(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return desc ? y - x : x - y;
    });
    return lista;
  }, [itens, ordem, desc]);

  const visiveis = ordenados.slice(0, limite);

  function ordenarPor(chave: Chave) {
    if (ordem === chave) setDesc((v) => !v);
    else {
      setOrdem(chave);
      setDesc(true);
    }
  }

  const Seta = desc ? ArrowDown : ArrowUp;

  return (
    <Panel>
      <PanelHeader
        title="Anúncios"
        hint="uma linha por MLB · clique abre o raio-x"
        action={<span className="num text-[12px] text-ink-3">{count(itens.length)} anúncios</span>}
      />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="sticky left-0 z-20 bg-panel text-left px-3 py-2 border-r border-line
                           min-w-[190px] sm:min-w-[280px]"
              >
                <button
                  onClick={() => ordenarPor("titulo")}
                  className="label inline-flex items-center gap-1 hover:text-ink"
                >
                  Anúncio
                  {ordem === "titulo" && <Seta className="w-3 h-3" />}
                </button>
              </th>
              {COLUNAS.map((c) => (
                <th
                  key={c.chave}
                  scope="col"
                  className={cn(
                    "px-3 py-2 text-right whitespace-nowrap",
                    c.fecha && "border-r border-line/60"
                  )}
                >
                  <button
                    onClick={() => ordenarPor(c.chave)}
                    title={c.ajuda}
                    className={cn(
                      "label inline-flex items-center gap-1 hover:text-ink",
                      ordem === c.chave && "text-brand"
                    )}
                  >
                    {c.nome}
                    {ordem === c.chave && <Seta className="w-3 h-3" />}
                  </button>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right">
                <span className="label" title="Vendas semana a semana, no recorte.">
                  {semanas.length} semanas
                </span>
              </th>
            </tr>
          </thead>

          <tbody>
            {visiveis.map((a) => (
              <tr
                key={a.mlb}
                onClick={() => abrir(a)}
                className="border-b border-line hover:bg-panel-2 cursor-pointer"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-panel text-left px-3 py-2.5
                             border-r border-line font-normal max-w-[190px] sm:max-w-[320px]"
                >
                  <span className="text-[12.5px] text-ink block leading-snug line-clamp-2">
                    {a.titulo}
                  </span>
                  <span className="num text-[11px] text-ink-3 block mt-0.5">
                    {a.sku || "sem SKU"}
                    {/* O MLB não cabe ao lado do SKU no telefone, e lá ninguém
                        lê um código de 13 dígitos: ele está no raio-x. */}
                    <span className="hidden sm:inline"> · {a.mlb}</span>
                  </span>
                  <span className="hidden sm:flex flex-wrap items-center gap-1 mt-1">
                    <span className="text-[11px] text-ink-3">
                      {a.conta} · {a.tipo}
                    </span>
                    {a.status === "pausado" && <Badge tone="warn">pausado</Badge>}
                  </span>
                </th>

                {COLUNAS.map((c) => {
                  const v = c.valor!(a);
                  return (
                    <td
                      key={c.chave}
                      className={cn(
                        "num px-3 py-2.5 text-right whitespace-nowrap",
                        c.fecha && "border-r border-line/60"
                      )}
                    >
                      {v == null ? (
                        <span className="text-[11.5px] text-ink-3">{c.vazio ?? "—"}</span>
                      ) : (
                        c.celula!(v, a)
                      )}
                    </td>
                  );
                })}

                <td className="px-3 py-2.5 text-right">
                  <MiniSerie serie={a.metricas.serieVendas} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ordenados.length > limite && (
        <button
          onClick={() => setLimite((l) => l + 60)}
          className="w-full py-2.5 text-[12.5px] text-ink-2 hover:text-ink
                     hover:bg-panel-2 border-t border-line"
        >
          Mostrar mais {Math.min(60, ordenados.length - limite)} de {ordenados.length - limite}
        </button>
      )}

      <details className="border-t border-line group">
        <summary className="px-4 py-2.5 text-[12.5px] text-ink-3 hover:text-ink cursor-pointer list-none marker:hidden">
          O que cada coluna quer dizer
          <span className="group-open:hidden"> ›</span>
          <span className="hidden group-open:inline"> ⌄</span>
        </summary>
        <dl className="grid gap-x-6 gap-y-2 px-4 pb-4 sm:grid-cols-2">
          {COLUNAS.map((c) => (
            <div key={c.chave} className="flex gap-2 text-[12.5px]">
              <dt className="font-semibold text-ink shrink-0">{c.nome}</dt>
              <dd className="m-0 text-ink-2">{c.ajuda}</dd>
            </div>
          ))}
          <div className="flex gap-2 text-[12.5px]">
            <dt className="font-semibold text-ink shrink-0">Célula vazia</dt>
            <dd className="m-0 text-ink-2">
              Diz o motivo: sem leitura, sem venda ou sem tabela. Nenhum deles é zero.
            </dd>
          </div>
        </dl>
      </details>

      {!itens.length && (
        <p className="px-4 py-10 text-center text-[13px] text-ink-3">
          Nenhum anúncio neste recorte.
        </p>
      )}
    </Panel>
  );
}
