"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { BarraFiltros, Filtro } from "@/components/layout/barra-filtros";
import { Panel, Badge, EmptyState } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { Leitura, TudoCerto } from "@/components/ui/leitura";
import { Metrica, Celula, REGRAS } from "@/components/ui/metrica";
import { Tabela, type Coluna } from "@/components/ui/tabela";
import { PainelExclusoes } from "@/components/ui/exclusoes";
import { AXIS, GRID } from "@/components/ui/chart";
import { money, moneyShort, count, pct } from "@/lib/format";
import type {
  DadosCancelamento,
  CancelamentoCanal,
  CancelamentoSku,
} from "@/lib/dados/cancelamentos";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { XCircle } from "lucide-react";

/**
 * Cancelamento por canal e por SKU.
 *
 * Faturamento que volta some da soma e não deixa rastro em nenhuma tela de
 * faturamento. Esta existe para dar rastro.
 *
 * As duas taxas ficam lado a lado de propósito. Taxa por quantidade e taxa
 * por valor discordam quando um canal cancela poucos pedidos grandes — e é
 * justamente esse caso que a taxa por quantidade sozinha esconderia.
 */

type Aba = "canal" | "quando" | "sku" | "mes";

const ABAS = [
  { value: "canal" as const, label: "Por canal" },
  { value: "quando" as const, label: "Canal × mês" },
  { value: "sku" as const, label: "Por SKU" },
  { value: "mes" as const, label: "Ao longo do ano" },
];

/** Como medir a célula da matriz. As duas leituras discordam de propósito. */
type Medida = "valor" | "quantidade";

const MEDIDAS = [
  { value: "valor" as const, label: "Valor" },
  { value: "quantidade" as const, label: "Quantidade" },
];

/** Acima disto, o canal merece investigação, não observação. */
const LIMIAR_GRAVE = 15;

export default function Cancelamentos({ dados }: { dados: DadosCancelamento }) {
  const [aba, setAba] = React.useState<Aba>("canal");

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Cancelamentos" breadcrumb="Vendas" />
        <PageBody>
          <Panel>
            <EmptyState
              icon={XCircle}
              title="Nenhum pedido importado"
              description="Suba a planilha de pedidos em Importar para esta tela ganhar conteúdo."
            />
          </Panel>
        </PageBody>
      </>
    );
  }

  const graves = dados.porCanal.filter(
    (c) => c.taxaQuantidade >= LIMIAR_GRAVE && c.pedidos >= 20
  );
  const pior = dados.porCanal.reduce(
    (a, b) => (b.taxaQuantidade > a.taxaQuantidade ? b : a),
    dados.porCanal[0]
  );

  return (
    <>
      <PageHeader
        title="Cancelamentos"
        breadcrumb="Vendas"
        description="O faturamento que voltou — por canal, por SKU e ao longo do tempo"
        filters={
          <BarraFiltros>
            <Filtro rotulo="Ver">
              <Segmented options={ABAS} value={aba} onChange={setAba} />
            </Filtro>
          </BarraFiltros>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-3">
          <Panel className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Metrica
                rotulo="Valor cancelado"
                valor={money(dados.totalCancelado)}
                detalhe={`de ${moneyShort(dados.totalBruto)} vendidos`}
              />
              <Metrica
                rotulo="Taxa geral"
                valor={pct(dados.taxaGeral)}
                detalhe="sobre o valor, não a quantidade"
              />
              <Metrica
                rotulo="Canais acompanhados"
                valor={count(dados.porCanal.length)}
                detalhe={`${graves.length} acima de ${LIMIAR_GRAVE}%`}
              />
              <Metrica
                rotulo="Período"
                valor={dataBr(dados.periodo.inicio)}
                detalhe={`até ${dataBr(dados.periodo.fim)}`}
              />
            </div>
          </Panel>

          {graves.length > 0 ? (
            <Leitura tom="atencao" titulo="Onde olhar">
              {graves.length === 1 ? (
                <>
                  <span className="font-semibold text-ink">{graves[0].canal}</span>{" "}
                  cancela{" "}
                  <span className="num font-semibold">
                    {pct(graves[0].taxaQuantidade)}
                  </span>{" "}
                  dos pedidos —{" "}
                  <span className="num">{count(graves[0].cancelados)}</span> de{" "}
                  <span className="num">{count(graves[0].pedidos)}</span>, ou{" "}
                  <span className="num">{money(graves[0].valorCancelado)}</span>.
                </>
              ) : (
                <>
                  <span className="num font-semibold">{graves.length} canais</span>{" "}
                  cancelam mais de {LIMIAR_GRAVE}% dos pedidos:{" "}
                  {graves
                    .map((g) => `${g.canal} (${pct(g.taxaQuantidade)})`)
                    .join(", ")}
                  .
                </>
              )}{" "}
              Taxa nesse patamar raramente é comportamento de comprador — costuma
              ser ruptura de estoque ou prazo que o canal não consegue cumprir.
            </Leitura>
          ) : (
            <Panel>
              <TudoCerto
                titulo="Nenhum canal em patamar preocupante"
                detalhe={`O pior é ${pior.canal}, com ${pct(
                  pior.taxaQuantidade
                )} — abaixo dos ${LIMIAR_GRAVE}% que pediriam investigação.`}
              />
            </Panel>
          )}

          <PainelExclusoes
            exclusoes={dados.exclusoes}
            canais={dados.canaisDisponiveis}
            removidas={dados.removidas}
            totalOriginal={dados.totalOriginal}
          />

          {aba === "canal" && <PorCanal dados={dados} />}
          {aba === "quando" && <CanalPorMes dados={dados} />}
          {aba === "sku" && <PorSku dados={dados} />}
          {aba === "mes" && <PorMes dados={dados} />}
        </div>
      </PageBody>
    </>
  );
}

function dataBr(iso: string | null) {
  return iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "—";
}

function PorCanal({ dados }: { dados: DadosCancelamento }) {
  const colunas: Coluna<CancelamentoCanal>[] = [
    {
      id: "canal",
      cabecalho: "Canal",
      chave: true,
      celula: (c) => (
        <span className="min-w-0">
          <span className="text-ink font-medium">{c.canal}</span>
          {c.mostrarConta && (
            <span className="text-ink-3"> · {c.conta}</span>
          )}
        </span>
      ),
      bruto: (c) => (c.mostrarConta ? `${c.canal} — ${c.conta}` : c.canal),
    },
    {
      id: "cancelados",
      cabecalho: "Cancelados",
      alinhar: "dir",
      celula: (c) => (
        <span className="num text-ink-2">
          {count(c.cancelados)}
          <span className="text-ink-3"> / {count(c.pedidos)}</span>
        </span>
      ),
      bruto: (c) => c.cancelados,
    },
    {
      id: "taxaQtd",
      cabecalho: "Taxa (qtd)",
      alinhar: "dir",
      chave: true,
      celula: (c) => (
        <Celula
          valor={c.taxaQuantidade}
          texto={pct(c.taxaQuantidade)}
          regra={(v) => (v >= LIMIAR_GRAVE ? "down" : v >= 10 ? "warn" : null)}
        />
      ),
      bruto: (c) => Number(c.taxaQuantidade.toFixed(2)),
    },
    {
      id: "taxaValor",
      cabecalho: "Taxa (valor)",
      alinhar: "dir",
      celula: (c) => (
        <Celula
          valor={c.taxaValor}
          texto={pct(c.taxaValor)}
          regra={(v) => (v >= LIMIAR_GRAVE ? "down" : v >= 10 ? "warn" : null)}
        />
      ),
      bruto: (c) => Number(c.taxaValor.toFixed(2)),
    },
    {
      id: "valor",
      cabecalho: "Valor cancelado",
      alinhar: "dir",
      chave: true,
      celula: (c) => (
        <span className="num text-ink font-semibold">
          {money(c.valorCancelado)}
        </span>
      ),
      bruto: (c) => Number(c.valorCancelado.toFixed(2)),
    },
    {
      id: "ticket",
      cabecalho: "Ticket cancelado",
      alinhar: "dir",
      celula: (c) => (
        <span className="num text-ink-2">
          {money(c.ticketCancelado)}
          <span className="text-ink-3 text-[11px]">
            {" "}
            vs {money(c.ticketNormal)}
          </span>
        </span>
      ),
      bruto: (c) => Number(c.ticketCancelado.toFixed(2)),
    },
  ];

  return (
    <Panel className="p-4">
      <p className="label mb-2.5">Canais</p>
      <Tabela
        linhas={dados.porCanal}
        colunas={colunas}
        chave={(c) => `${c.canalId}-${c.conta}`}
        nomeExportacao="cancelamentos-por-canal"
      />
      <p className="text-[11.5px] text-ink-3 mt-3 leading-relaxed">
        O ticket cancelado ao lado do normal responde uma pergunta que a taxa
        sozinha não responde: se o que cancela é sistematicamente mais caro que
        o que fica, o problema é de produto ou de prazo, não de volume.
      </p>
    </Panel>
  );
}

function PorSku({ dados }: { dados: DadosCancelamento }) {
  const colunas: Coluna<CancelamentoSku>[] = [
    {
      id: "sku",
      cabecalho: "SKU",
      chave: true,
      celula: (s) => (
        <span className="min-w-0">
          <span className="num text-ink font-medium">{s.sku}</span>
          <span className="block text-[11.5px] text-ink-3 truncate max-w-[280px]">
            {s.titulo}
          </span>
        </span>
      ),
      bruto: (s) => s.sku,
    },
    {
      id: "titulo",
      cabecalho: "Produto",
      celula: () => null,
      bruto: (s) => s.titulo,
    },
    {
      id: "canc",
      cabecalho: "Unid. canceladas",
      alinhar: "dir",
      chave: true,
      celula: (s) => (
        <span className="num text-ink-2">
          {count(s.itensCancelados)}
          <span className="text-ink-3"> / {count(s.itens)}</span>
        </span>
      ),
      bruto: (s) => s.itensCancelados,
    },
    {
      id: "taxa",
      cabecalho: "Taxa",
      alinhar: "dir",
      celula: (s) => (
        <Celula
          valor={s.taxaQuantidade}
          texto={pct(s.taxaQuantidade)}
          regra={(v) => (v >= 30 ? "down" : v >= 15 ? "warn" : null)}
        />
      ),
      bruto: (s) => Number(s.taxaQuantidade.toFixed(2)),
    },
    {
      id: "valor",
      cabecalho: "Valor",
      alinhar: "dir",
      chave: true,
      celula: (s) => (
        <span className="num text-ink font-semibold">
          {money(s.valorCancelado)}
        </span>
      ),
      bruto: (s) => Number(s.valorCancelado.toFixed(2)),
    },
    {
      id: "canais",
      cabecalho: "Canais",
      celula: (s) => (
        <span className="text-[11.5px] text-ink-3">{s.canais.join(", ")}</span>
      ),
      bruto: (s) => s.canais.join(" | "),
    },
  ];

  return (
    <Panel className="p-4">
      <p className="label mb-2.5">
        SKUs mais cancelados{" "}
        <span className="text-ink-3 font-normal">— os 60 maiores em valor</span>
      </p>
      <Tabela
        linhas={dados.porSku}
        colunas={colunas}
        chave={(s) => s.sku}
        nomeExportacao="cancelamentos-por-sku"
        vazio={
          <TudoCerto titulo="Nenhum item cancelado no período" />
        }
      />
      <p className="text-[11.5px] text-ink-3 mt-3 leading-relaxed">
        A taxa compara o cancelado com o total vendido do mesmo SKU. Cinco
        cancelamentos em seis vendas é um problema; em seiscentas, é ruído — e
        sem o denominador as duas situações parecem iguais.
      </p>
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════
   Canal × mês
   ══════════════════════════════════════════════════════════════ */

/**
 * O mapa de calor que responde "quem piorou, e quando".
 *
 * ── Por que uma matriz e não mais um gráfico ──
 *
 * A pergunta tem dois eixos. "Por canal" soma o ano e esconde quando;
 * "ao longo do ano" soma os canais e esconde quem. Um canal que cancela
 * 12% o ano todo é um custo conhecido; um que cancelava 4% e foi para
 * 22% em agosto é um incidente com dono e data. Na soma anual os dois
 * parecem iguais — e era só a soma anual que existia.
 *
 * ── A escala é fixa, não relativa ──
 *
 * A cor sai de uma régua absoluta (5%, 10%, 15%, 25%), e não do maior
 * valor da tabela. Escala relativa faria o mês menos ruim de um ano ruim
 * aparecer verde, e a tela mentiria por normalização. Com régua fixa, o
 * ano inteiro vermelho é lido como ano inteiro vermelho.
 */

/**
 * Régua fixa de gravidade, em % — a mesma em toda a matriz.
 *
 * A faixa mais grave pinta o fundo com `--down` cheio, e aí o texto
 * precisa do CONTRÁRIO do fundo. `text-white` resolvia no claro, onde
 * `--down` é um vermelho escuro, e falhava no escuro, onde ele é um
 * salmão claro — branco sobre salmão fica ilegível. `--panel` é o token
 * que já inverte com o tema: branco no claro, quase preto no escuro.
 * Exatamente o que a legibilidade pede, nos dois.
 */
const FAIXAS = [
  { ate: 5, fundo: "transparent", texto: "text-ink-3", cor: undefined },
  { ate: 10, fundo: "var(--warn-wash)", texto: "text-ink-2", cor: undefined },
  {
    ate: 15,
    fundo: "color-mix(in srgb, var(--warn-wash) 55%, var(--warn) 45%)",
    texto: "text-ink",
    cor: undefined,
  },
  {
    ate: 25,
    fundo: "color-mix(in srgb, var(--down-wash) 60%, var(--down) 40%)",
    texto: "text-ink",
    cor: undefined,
  },
  {
    ate: Infinity,
    fundo: "var(--down)",
    texto: "font-semibold",
    cor: "var(--panel)",
  },
] as const;

function faixaDe(taxa: number) {
  return FAIXAS.find((f) => taxa < f.ate) ?? FAIXAS[FAIXAS.length - 1];
}

const MES_CURTO = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function rotuloMes(m: string) {
  const [ano, mes] = m.split("-");
  return `${MES_CURTO[Number(mes) - 1]}/${ano.slice(2)}`;
}

function CanalPorMes({ dados }: { dados: DadosCancelamento }) {
  const [medida, setMedida] = React.useState<Medida>("valor");
  const { matriz, mesesDisponiveis: meses } = dados;

  if (!matriz.length || !meses.length) {
    return (
      <Panel>
        <EmptyState
          icon={XCircle}
          title="Sem histórico para cruzar"
          description="A matriz precisa de pedidos em mais de um mês para dizer quem piorou e quando."
        />
      </Panel>
    );
  }

  const taxaDe = (c?: { taxaValor: number; taxaQuantidade: number }) =>
    c ? (medida === "valor" ? c.taxaValor : c.taxaQuantidade) : null;

  /*
   * O pior salto do período: o canal-mês que mais subiu contra a própria
   * média. É o que a leitura de baixo aponta — sem isso, a matriz é bonita
   * e muda, e alguém ainda tem que varrer 12 colunas com o olho.
   */
  let salto: {
    linha: (typeof matriz)[number];
    mes: string;
    taxa: number;
    media: number;
  } | null = null;

  for (const l of matriz) {
    const media = taxaDe(l.total) ?? 0;
    if (media <= 0 || l.total.pedidos < 20) continue;
    for (const m of meses) {
      const cel = l.porMes[m];
      if (!cel || cel.pedidos < 10) continue;
      const t = taxaDe(cel) ?? 0;
      if (t < 10) continue;
      const excesso = t - media;
      if (!salto || excesso > salto.taxa - salto.media) {
        salto = { linha: l, mes: m, taxa: t, media };
      }
    }
  }

  const th =
    "px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3 whitespace-nowrap";

  return (
    <>
      <Panel className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line flex-wrap">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">Quem piorou, e quando</p>
            <p className="text-[11.5px] text-ink-3">
              taxa de cancelamento por conta, mês a mês
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <Segmented options={MEDIDAS} value={medida} onChange={setMedida} />
            <Legenda />
          </div>
        </div>

        {/* A tabela é o único elemento que pode passar da largura da tela. */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="bg-panel-2">
              <tr>
                <th className={`${th} text-left sticky left-0 bg-panel-2 z-10`}>
                  Canal
                </th>
                {meses.map((m) => (
                  <th key={m} className={`${th} text-center`}>
                    {rotuloMes(m)}
                  </th>
                ))}
                <th className={`${th} text-right border-l border-line-2`}>
                  Período
                </th>
              </tr>
            </thead>
            <tbody>
              {matriz.map((l) => {
                const total = taxaDe(l.total) ?? 0;
                const f = faixaDe(total);
                return (
                  <tr key={l.chave} className="border-t border-line">
                    <td className="px-2.5 py-1.5 sticky left-0 bg-panel z-10 whitespace-nowrap">
                      <span className="text-ink font-medium">{l.canal}</span>
                      {l.mostrarConta && (
                        <span className="text-ink-3 text-[11.5px]"> · {l.conta}</span>
                      )}
                    </td>
                    {meses.map((m) => {
                      const cel = l.porMes[m];
                      const t = taxaDe(cel);
                      if (t == null) {
                        return (
                          <td
                            key={m}
                            className="px-2.5 py-1.5 text-center text-ink-3 num"
                            title="sem pedido neste mês"
                          >
                            ·
                          </td>
                        );
                      }
                      const fx = faixaDe(t);
                      return (
                        <td
                          key={m}
                          className={`px-2.5 py-1.5 text-center num ${fx.texto}`}
                          style={{ background: fx.fundo, color: fx.cor }}
                          title={`${count(cel!.cancelados)} de ${count(cel!.pedidos)} pedidos · ${money(cel!.valorCancelado)}`}
                        >
                          {t.toFixed(t >= 10 ? 0 : 1)}%
                        </td>
                      );
                    })}
                    <td
                      className={`px-2.5 py-1.5 text-right num border-l border-line-2 ${f.texto}`}
                      style={{ background: f.fundo, color: f.cor }}
                    >
                      {total.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="px-4 py-2.5 text-[11.5px] text-ink-3 border-t border-line">
          {medida === "valor"
            ? "Taxa sobre o VALOR: quanto do faturamento daquele mês voltou. Um canal que cancela poucos pedidos grandes aparece aqui e some na contagem."
            : "Taxa sobre a QUANTIDADE: quantos pedidos de cada cem voltaram. Um canal que cancela muitos pedidos pequenos aparece aqui e some no valor."}{" "}
          O ponto (·) é mês sem pedido nenhum — não é zero de cancelamento.
        </p>
      </Panel>

      {salto ? (
        <Leitura tom="atencao" titulo="O maior desvio do período">
          <span className="font-semibold text-ink">{salto.linha.canal}</span>
          {salto.linha.mostrarConta && (
            <span className="text-ink-2"> · {salto.linha.conta}</span>
          )}{" "}
          cancelou{" "}
          <span className="num font-semibold">{pct(salto.taxa)}</span> em{" "}
          <span className="font-semibold text-ink">{rotuloMes(salto.mes)}</span>,
          contra <span className="num">{pct(salto.media)}</span> de média dele no
          período —{" "}
          <span className="num font-semibold">
            {(salto.taxa - salto.media).toFixed(1)} p.p.
          </span>{" "}
          acima do próprio normal. Um canal que sempre cancela muito é um custo
          conhecido; um que piorou num mês específico tem causa e data, e é esse
          que vale investigar.
        </Leitura>
      ) : (
        <TudoCerto
          titulo="Nenhum mês fora da curva"
          detalhe="Nenhuma conta com volume relevante teve um mês que destoasse da própria média. O que houver de cancelamento aqui é o patamar normal de cada canal — que pode ser alto, mas é estável."
        />
      )}
    </>
  );
}

/** A régua de cor, explicada. Sem ela o mapa de calor é decoração. */
function Legenda() {
  const passos = [
    { rotulo: "< 5%", faixa: FAIXAS[0] },
    { rotulo: "5–10%", faixa: FAIXAS[1] },
    { rotulo: "10–15%", faixa: FAIXAS[2] },
    { rotulo: "15–25%", faixa: FAIXAS[3] },
    { rotulo: "25%+", faixa: FAIXAS[4] },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {passos.map((p) => (
        <span key={p.rotulo} className="flex items-center gap-1">
          <span
            className="w-3.5 h-3.5 rounded-[3px] border border-line"
            style={{ background: p.faixa.fundo }}
          />
          <span className="num text-[10.5px] text-ink-3">{p.rotulo}</span>
        </span>
      ))}
    </div>
  );
}

function PorMes({ dados }: { dados: DadosCancelamento }) {
  const serie = dados.porMes.map((m) => ({
    ...m,
    rotulo: new Date(m.mes + "-15T12:00:00").toLocaleDateString("pt-BR", {
      month: "short",
    }),
  }));

  const media =
    serie.reduce((s, m) => s + m.taxaValor, 0) / Math.max(1, serie.length);
  const ultimo = serie[serie.length - 1];
  const piorMes = serie.reduce((a, b) => (b.taxaValor > a.taxaValor ? b : a), serie[0]);

  return (
    <>
      <Panel className="p-4">
        <p className="label mb-2.5">Valor cancelado por mês</p>
        <div className="h-[260px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="rotulo" {...AXIS} />
              <YAxis {...AXIS} width={52} tickFormatter={(v) => moneyShort(Number(v))} />
              <Tooltip
                cursor={{ fill: "var(--panel-3)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof serie)[number];
                  return (
                    <div className="panel px-2.5 py-2 min-w-[180px]" style={{ boxShadow: "var(--sh-3)" }}>
                      <p className="text-[11px] font-semibold text-ink-2 mb-1.5">
                        {d.rotulo}
                      </p>
                      <Linha rotulo="Cancelado" valor={money(d.valorCancelado)} />
                      <Linha rotulo="Vendido" valor={money(d.receitaBruta)} />
                      <Linha rotulo="Taxa" valor={pct(d.taxaValor)} />
                    </div>
                  );
                }}
              />
              <Bar dataKey="valorCancelado" fill="var(--down)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {ultimo && (
        <Leitura
          tom={ultimo.taxaValor > media * 1.2 ? "atencao" : "neutro"}
          titulo="Leitura"
        >
          A média do período é{" "}
          <span className="num font-semibold">{pct(media)}</span> do valor
          vendido. O pior mês foi{" "}
          <span className="font-semibold text-ink">{piorMes.rotulo}</span>, com{" "}
          <span className="num">{pct(piorMes.taxaValor)}</span> —{" "}
          <span className="num">{money(piorMes.valorCancelado)}</span>.{" "}
          {ultimo.taxaValor > media * 1.2
            ? "O último mês está acima da média, o que costuma indicar problema novo e não sazonalidade."
            : "O último mês está dentro do padrão do período."}
        </Leitura>
      )}
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-ink-2">{rotulo}</span>
      <span className="num text-[12px] font-semibold text-ink">{valor}</span>
    </div>
  );
}
