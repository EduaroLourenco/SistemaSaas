"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge, EmptyState, Delta } from "@/components/ui/primitives";
import { Field, Segmented, Checkbox } from "@/components/ui/controls";
import { SelectRecorte } from "@/components/ui/select-recorte";
import { Leitura } from "@/components/ui/leitura";
import { Metrica, Celula } from "@/components/ui/metrica";
import { Tabela, type Coluna } from "@/components/ui/tabela";
import { money, moneyShort, count, pct } from "@/lib/format";
import type { DadosTipo, ParSku, Periodo, ResumoTipo } from "@/lib/dados/tipo-anuncio";
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
 *
 * ── Duas tarifas, de propósito ──
 *
 * A de tabela é a régua do canal; a praticada é o que saiu do caixa. Como
 * quase todo anúncio aqui tem redução negociada, uma tela que só mostrasse
 * a de tabela estaria conversando sobre um custo que não existe. As duas
 * ficam juntas, com a cobertura ao lado da praticada, para dar para julgar
 * o quanto ela representa.
 */

const NOME: Record<string, string> = {
  classico: "Clássico",
  premium: "Premium",
  outro: "Outro",
};

const PERIODOS = [
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "180", label: "180 dias" },
  { value: "365", label: "1 ano" },
  { value: "0", label: "Tudo" },
];

function dm(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function rotuloPeriodo(p: Periodo) {
  return `${dm(p.inicio)} a ${dm(p.fim)} · ${count(p.semanas)} semanas`;
}

export default function TipoAnuncio({ dados }: { dados: DadosTipo }) {
  const router = useRouter();

  function ir(campos: { dias?: number; canal?: string; comparar?: boolean }) {
    const dias = campos.dias ?? dados.dias;
    const canal = campos.canal ?? dados.canalId;
    const comparar = campos.comparar ?? Boolean(dados.anterior);
    const q = new URLSearchParams({ dias: String(dias) });
    if (canal) q.set("canal", canal);
    // Comparar com "tudo" não faz sentido: não existe janela anterior a
    // todo o histórico.
    if (comparar && dias > 0) q.set("comparar", "1");
    router.push(`/anuncios/tipo?${q}`);
  }

  const filtros = (
    <Panel className="p-3">
      <div className="flex items-end gap-2 flex-wrap">
        <Field label="Período">
          <Segmented
            options={PERIODOS}
            value={String(dados.dias)}
            onChange={(v) => ir({ dias: Number(v) })}
          />
        </Field>
        <Field label="Canal">
          <SelectRecorte
            grupos={dados.opcoes}
            valor={dados.canalId}
            onChange={(v) => ir({ canal: v })}
          />
        </Field>
        {dados.dias > 0 && (
          <div className="pb-1.5">
            <Checkbox
              checked={Boolean(dados.anterior)}
              onChange={(v) => ir({ comparar: v })}
              label="Comparar com o período anterior"
            />
          </div>
        )}
      </div>
    </Panel>
  );

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Clássico vs Premium" breadcrumb="Anúncios" />
        <PageBody>
          <div className="flex flex-col gap-3">
            {filtros}
            <Panel>
              <EmptyState
                icon={Layers}
                title="Sem dados de desempenho neste recorte"
                description="Suba o catálogo e o relatório de desempenho em Importar, ou amplie o período e o canal acima."
              />
            </Panel>
          </div>
        </PageBody>
      </>
    );
  }

  const cl = dados.resumo.find((r) => r.tipo === "classico");
  const pr = dados.resumo.find((r) => r.tipo === "premium");
  const anteriorPorTipo = new Map(
    (dados.anterior?.resumo ?? []).map((r) => [r.tipo, r])
  );

  return (
    <>
      <PageHeader
        title="Clássico vs Premium"
        breadcrumb="Anúncios"
        description={
          dados.periodo
            ? `${dados.rotuloRecorte} · ${rotuloPeriodo(dados.periodo)}`
            : dados.rotuloRecorte
        }
      />

      <PageBody>
        <div className="flex flex-col gap-3">
          {filtros}

          {dados.anterior && (
            <p className="text-[12px] text-ink-3">
              Comparando com{" "}
              <span className="text-ink-2">{rotuloPeriodo(dados.anterior.periodo)}</span>
              .
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {dados.resumo
              .filter((r) => r.tipo !== "outro")
              .map((r) => (
                <Cartao key={r.tipo} r={r} antes={anteriorPorTipo.get(r.tipo)} />
              ))}
          </div>

          {cl && pr && <LeituraMedias cl={cl} pr={pr} />}

          <Pares pares={dados.pares} />
        </div>
      </PageBody>
    </>
  );
}

/** Variação percentual, só quando os dois lados existem e o de base não é zero. */
function variacao(agora: number, antes?: number) {
  if (antes === undefined || !antes) return undefined;
  return ((agora - antes) / Math.abs(antes)) * 100;
}

function Cartao({ r, antes }: { r: ResumoTipo; antes?: ResumoTipo }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Badge tone={r.tipo === "premium" ? "brand" : "neutral"}>{NOME[r.tipo]}</Badge>
        <span className="num text-[11px] text-ink-3">{count(r.anuncios)} anúncios</span>
        {antes && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-3">
            receita
            <Delta value={variacao(r.receita, antes.receita) ?? 0} />
          </span>
        )}
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
          detalhe="no período"
        />
        <Metrica
          rotulo="Tarifa de tabela"
          valor={pct(r.tarifaMedia)}
          detalhe="alíquota do canal"
        />
        <Metrica
          rotulo="Tarifa praticada"
          valor={r.tarifaPraticada == null ? "—" : pct(r.tarifaPraticada)}
          detalhe={
            r.tarifaPraticada == null
              ? "nenhum pedido com comissão informada"
              : `o que foi cobrado · ${pct(r.coberturaTarifa, 0)} da receita`
          }
        />
        <Metrica
          rotulo="Custo de tarifa"
          valor={
            r.custoTarifaPraticada == null
              ? moneyShort(r.custoTarifa)
              : moneyShort(r.custoTarifaPraticada)
          }
          detalhe={
            r.custoTarifaPraticada == null
              ? `pela tabela, sobre ${moneyShort(r.receita)}`
              : `pela praticada · ${moneyShort(r.custoTarifa)} se fosse tabela`
          }
        />
        <Metrica
          rotulo="Receita"
          valor={moneyShort(r.receita)}
          detalhe={antes ? `antes: ${moneyShort(antes.receita)}` : "no período"}
        />
      </div>
    </Panel>
  );
}

function LeituraMedias({ cl, pr }: { cl: ResumoTipo; pr: ResumoTipo }) {
  const premiumPiorConversao = pr.conversao < cl.conversao;
  const premiumMenosVisitas = pr.visitasPorAnuncio < cl.visitasPorAnuncio;
  // Se a praticada existe dos dois lados, a diferença que importa é essa —
  // a de tabela é a que ninguém pagou.
  const temPraticada = pr.tarifaPraticada != null && cl.tarifaPraticada != null;
  const pontosAMais = temPraticada
    ? pr.tarifaPraticada! - cl.tarifaPraticada!
    : pr.tarifaMedia - cl.tarifaMedia;

  return (
    <Leitura
      tom={premiumPiorConversao && premiumMenosVisitas ? "atencao" : "neutro"}
      titulo="O que as médias sugerem"
    >
      O Premium paga <span className="num font-semibold">{pct(pontosAMais)}</span> a mais
      de tarifa que o Clássico{" "}
      {temPraticada ? (
        <>
          (pela tarifa <span className="font-semibold text-ink">realmente cobrada</span>;
          pela tabela a diferença seria de{" "}
          <span className="num">{pct(pr.tarifaMedia - cl.tarifaMedia)}</span>)
        </>
      ) : (
        <>(pela alíquota de tabela — não há pedido com comissão informada no recorte)</>
      )}
      . Em troca, recebe{" "}
      <span className="num font-semibold">{count(Math.round(pr.visitasPorAnuncio))}</span>{" "}
      visitas por anúncio contra{" "}
      <span className="num font-semibold">{count(Math.round(cl.visitasPorAnuncio))}</span>
      , e converte <span className="num font-semibold">{pct(pr.conversao, 2)}</span> contra{" "}
      <span className="num font-semibold">{pct(cl.conversao, 2)}</span>.
      {premiumPiorConversao && premiumMenosVisitas ? (
        <>
          {" "}
          Ou seja: nas médias o Premium recebe menos visita, converte pior e custa mais.{" "}
          <span className="font-semibold text-ink">
            Isso levanta a pergunta, não a responde
          </span>{" "}
          — os dois grupos anunciam produtos diferentes, e mix explica diferença sem que o
          tipo tenha culpa. A tabela abaixo é que decide.
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
  const custoTotal = pares.reduce(
    (s, p) => s + (p.custoExtraPraticado ?? p.custoExtra),
    0
  );
  const comPraticado = pares.filter((p) => p.custoExtraPraticado != null).length;

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
      id: "tarifas",
      cabecalho: "Tarifa praticada C./P.",
      alinhar: "dir",
      celula: (p) => (
        <span className="num text-ink-2">
          {p.classico.tarifaPraticada == null ? "—" : pct(p.classico.tarifaPraticada)}
          {" / "}
          {p.premium.tarifaPraticada == null ? "—" : pct(p.premium.tarifaPraticada)}
        </span>
      ),
      bruto: (p) => p.premium.tarifaPraticada ?? 0,
    },
    {
      id: "custo",
      cabecalho: "Tarifa extra paga",
      alinhar: "dir",
      chave: true,
      celula: (p) => (
        <span className="num font-semibold">
          {p.custoExtraPraticado == null ? (
            <span className="text-ink-3" title="sem tarifa praticada nos dois lados">
              {money(p.custoExtra)}*
            </span>
          ) : (
            <span className="text-ink">{money(p.custoExtraPraticado)}</span>
          )}
        </span>
      ),
      bruto: (p) => Number((p.custoExtraPraticado ?? p.custoExtra).toFixed(2)),
    },
  ];

  return (
    <>
      <Panel className="p-4">
        <p className="label mb-1">
          O mesmo SKU nos dois tipos
          <span className="text-ink-3 font-normal"> — {count(pares.length)} produtos</span>
        </p>
        <p className="text-[12px] text-ink-2 leading-relaxed mb-3">
          Aqui o produto é o mesmo dos dois lados, então o que sobra na diferença é o tipo
          do anúncio. É a única comparação desta tela que decide alguma coisa. A tarifa
          extra usa a alíquota <span className="font-semibold text-ink">praticada</span>{" "}
          quando ela existe nos dois lados; as linhas marcadas com{" "}
          <span className="num">*</span> caíram de volta na de tabela, e valem menos.
        </p>
        <Tabela
          linhas={pares}
          colunas={colunas}
          chave={(p) => p.sku}
          nomeExportacao="classico-vs-premium"
        />
      </Panel>

      <Leitura tom={premiumGanhou < pares.length / 2 ? "atencao" : "bom"} titulo="Leitura">
        Em <span className="num font-semibold">{count(premiumGanhou)}</span> dos{" "}
        <span className="num font-semibold">{count(pares.length)}</span> produtos
        comparáveis o Premium converteu melhor que o Clássico. A tarifa extra somou{" "}
        <span className="num font-semibold">{money(custoTotal)}</span> no período, com{" "}
        <span className="num font-semibold">{count(comPraticado)}</span> produtos usando a
        alíquota realmente cobrada e o resto a de tabela.{" "}
        {premiumGanhou < pares.length / 2 ? (
          <>
            Na maioria dos casos o Premium não devolveu em conversão o que cobrou a mais —
            vale rever os que estão no topo da tabela, que são os que mais custaram.
          </>
        ) : (
          <>
            Na maioria dos casos o Premium se pagou em conversão. Os que aparecem em
            vermelho na coluna de diferença são as exceções.
          </>
        )}
      </Leitura>
    </>
  );
}
