"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge, EmptyState } from "@/components/ui/primitives";
import { Leitura } from "@/components/ui/leitura";
import { Metrica, Celula } from "@/components/ui/metrica";
import { Tabela, type Coluna } from "@/components/ui/tabela";
import { money, moneyShort, count, pct } from "@/lib/format";
import type { DadosTipo, ParSku, ResumoTipo } from "@/lib/dados/tipo-anuncio";
import { Layers } from "lucide-react";

/**
 * Clássico contra Premium.
 *
 * A tela é organizada em duas camadas porque as duas respondem coisas
 * diferentes: as médias LEVANTAM a pergunta, os pares por SKU a RESPONDEM.
 *
 * Misturar as duas seria o erro fácil aqui. Média de Premium contra média
 * de Clássico compara também o mix de produto, e mix explica diferença sem
 * que o tipo de anúncio tenha nada a ver com ela.
 */

const NOME: Record<string, string> = {
  classico: "Clássico",
  premium: "Premium",
  outro: "Outro",
};

export default function TipoAnuncio({ dados }: { dados: DadosTipo }) {
  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Clássico vs Premium" breadcrumb="Anúncios" />
        <PageBody>
          <Panel>
            <EmptyState
              icon={Layers}
              title="Sem dados de desempenho"
              description="Suba o catálogo e o relatório de desempenho em Importar para esta comparação existir."
            />
          </Panel>
        </PageBody>
      </>
    );
  }

  const cl = dados.resumo.find((r) => r.tipo === "classico");
  const pr = dados.resumo.find((r) => r.tipo === "premium");

  return (
    <>
      <PageHeader
        title="Clássico vs Premium"
        breadcrumb="Anúncios"
        description={`O que a tarifa a mais comprou — ${dados.semanas} semanas`}
      />

      <PageBody>
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            {dados.resumo
              .filter((r) => r.tipo !== "outro")
              .map((r) => (
                <Cartao key={r.tipo} r={r} />
              ))}
          </div>

          {cl && pr && <LeituraMedias cl={cl} pr={pr} />}

          <Pares pares={dados.pares} />
        </div>
      </PageBody>
    </>
  );
}

function Cartao({ r }: { r: ResumoTipo }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Badge tone={r.tipo === "premium" ? "brand" : "neutral"}>
          {NOME[r.tipo]}
        </Badge>
        <span className="num text-[11px] text-ink-3">
          {count(r.anuncios)} anúncios
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Metrica
          rotulo="Conversão"
          valor={pct(r.conversao, 2)}
          detalhe={`${count(r.vendas)} vendas em ${count(r.visitas)} visitas`}
        />
        <Metrica
          rotulo="Visitas por anúncio"
          valor={count(Math.round(r.visitasPorAnuncio))}
          detalhe="no período todo"
        />
        <Metrica
          rotulo="Tarifa média"
          valor={pct(r.tarifaMedia)}
          detalhe="alíquota do canal"
        />
        <Metrica
          rotulo="Custo de tarifa"
          valor={moneyShort(r.custoTarifa)}
          detalhe={`sobre ${moneyShort(r.receita)} de receita`}
        />
      </div>
    </Panel>
  );
}

function LeituraMedias({ cl, pr }: { cl: ResumoTipo; pr: ResumoTipo }) {
  const premiumPiorConversao = pr.conversao < cl.conversao;
  const premiumMenosVisitas = pr.visitasPorAnuncio < cl.visitasPorAnuncio;
  const pontosAMais = pr.tarifaMedia - cl.tarifaMedia;

  return (
    <Leitura
      tom={premiumPiorConversao && premiumMenosVisitas ? "atencao" : "neutro"}
      titulo="O que as médias sugerem"
    >
      O Premium paga{" "}
      <span className="num font-semibold">{pct(pontosAMais)}</span> a mais de
      tarifa que o Clássico. Em troca, recebe{" "}
      <span className="num font-semibold">
        {count(Math.round(pr.visitasPorAnuncio))}
      </span>{" "}
      visitas por anúncio contra{" "}
      <span className="num font-semibold">
        {count(Math.round(cl.visitasPorAnuncio))}
      </span>
      , e converte{" "}
      <span className="num font-semibold">{pct(pr.conversao, 2)}</span> contra{" "}
      <span className="num font-semibold">{pct(cl.conversao, 2)}</span>.
      {premiumPiorConversao && premiumMenosVisitas ? (
        <>
          {" "}
          Ou seja: nas médias o Premium recebe menos visita, converte pior e
          custa mais.{" "}
          <span className="font-semibold text-ink">
            Isso levanta a pergunta, não a responde
          </span>{" "}
          — os dois grupos anunciam produtos diferentes, e mix explica
          diferença sem que o tipo tenha culpa. A tabela abaixo é que decide.
        </>
      ) : (
        <> A tabela abaixo compara o mesmo SKU nos dois tipos.</>
      )}
    </Leitura>
  );
}

function Pares({ pares }: { pares: ParSku[] }) {
  if (!pares.length) {
    return (
      <Panel>
        <EmptyState
          icon={Layers}
          title="Nenhum SKU nos dois tipos"
          description="A comparação justa exige o mesmo produto anunciado como Clássico e como Premium, com visita nos dois. Sem isso, só há a comparação de médias — que mistura tipo e mix."
        />
      </Panel>
    );
  }

  const premiumGanhou = pares.filter((p) => p.ganhoConversao > 0).length;
  const custoTotal = pares.reduce((s, p) => s + p.custoExtra, 0);

  const colunas: Coluna<ParSku>[] = [
    {
      id: "sku",
      cabecalho: "SKU",
      chave: true,
      celula: (p) => (
        <span className="min-w-0">
          <span className="num text-ink font-medium">{p.sku}</span>
          <span className="block text-[11.5px] text-ink-3 truncate max-w-[260px]">
            {p.titulo}
          </span>
        </span>
      ),
      bruto: (p) => p.sku,
    },
    {
      id: "convC",
      cabecalho: "Conv. Clássico",
      alinhar: "dir",
      celula: (p) => (
        <span className="num text-ink-2">{pct(p.classico.conversao, 2)}</span>
      ),
      bruto: (p) => Number(p.classico.conversao.toFixed(3)),
    },
    {
      id: "convP",
      cabecalho: "Conv. Premium",
      alinhar: "dir",
      celula: (p) => (
        <span className="num text-ink-2">{pct(p.premium.conversao, 2)}</span>
      ),
      bruto: (p) => Number(p.premium.conversao.toFixed(3)),
    },
    {
      id: "ganho",
      cabecalho: "Diferença",
      alinhar: "dir",
      chave: true,
      celula: (p) => (
        <Celula
          valor={p.ganhoConversao}
          texto={`${p.ganhoConversao > 0 ? "+" : p.ganhoConversao < 0 ? "−" : ""}${Math.abs(
            p.ganhoConversao
          ).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} p.p.`}
          regra={(v) => (v > 0.05 ? "up" : v < -0.05 ? "down" : null)}
        />
      ),
      bruto: (p) => Number(p.ganhoConversao.toFixed(3)),
    },
    {
      id: "visitas",
      cabecalho: "Visitas Prem./Cláss.",
      alinhar: "dir",
      celula: (p) => (
        <Celula
          valor={p.razaoVisitas}
          texto={`${p.razaoVisitas.toLocaleString("pt-BR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}×`}
          regra={(v) => (v >= 1.2 ? "up" : v <= 0.8 ? "down" : null)}
        />
      ),
      bruto: (p) => Number(p.razaoVisitas.toFixed(2)),
    },
    {
      id: "custo",
      cabecalho: "Tarifa extra paga",
      alinhar: "dir",
      chave: true,
      celula: (p) => (
        <span className="num text-ink font-semibold">{money(p.custoExtra)}</span>
      ),
      bruto: (p) => Number(p.custoExtra.toFixed(2)),
    },
  ];

  return (
    <>
      <Panel className="p-4">
        <p className="label mb-1">
          O mesmo SKU nos dois tipos
          <span className="text-ink-3 font-normal">
            {" "}
            — {count(pares.length)} produtos
          </span>
        </p>
        <p className="text-[12px] text-ink-2 leading-relaxed mb-3">
          Aqui o produto é o mesmo dos dois lados, então o que sobra na
          diferença é o tipo do anúncio. É a única comparação desta tela que
          decide alguma coisa.
        </p>
        <Tabela
          linhas={pares}
          colunas={colunas}
          chave={(p) => p.sku}
          nomeExportacao="classico-vs-premium"
        />
      </Panel>

      <Leitura
        tom={premiumGanhou < pares.length / 2 ? "atencao" : "bom"}
        titulo="Leitura"
      >
        Em <span className="num font-semibold">{count(premiumGanhou)}</span> dos{" "}
        <span className="num font-semibold">{count(pares.length)}</span> produtos
        comparáveis o Premium converteu melhor que o Clássico. A tarifa extra
        somou <span className="num font-semibold">{money(custoTotal)}</span> no
        período.{" "}
        {premiumGanhou < pares.length / 2 ? (
          <>
            Na maioria dos casos o Premium não devolveu em conversão o que
            cobrou a mais — vale rever os que estão no topo da tabela, que são
            os que mais custaram.
          </>
        ) : (
          <>
            Na maioria dos casos o Premium se pagou em conversão. Os que
            aparecem em vermelho na coluna de diferença são as exceções.
          </>
        )}
      </Leitura>
    </>
  );
}
