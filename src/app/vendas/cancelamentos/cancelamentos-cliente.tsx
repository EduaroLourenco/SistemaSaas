"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
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

type Aba = "canal" | "sku" | "mes";

const ABAS = [
  { value: "canal" as const, label: "Por canal" },
  { value: "sku" as const, label: "Por SKU" },
  { value: "mes" as const, label: "Ao longo do ano" },
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
        filters={<Segmented options={ABAS} value={aba} onChange={setAba} />}
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
