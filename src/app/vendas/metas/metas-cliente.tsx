"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { SeletorCanal } from "@/components/ui/seletor-canal";
import { SemFonte } from "@/components/ui/sem-fonte";
import { Matriz, type IndicadorMatriz, type ColunaMatriz } from "@/components/ui/matriz";
import { CompararPeriodo, type LinhaComparacao } from "@/components/ui/comparar-periodo";
import { money, count, pct } from "@/lib/format";
import type { DadosMetas } from "@/lib/dados/metas";

/**
 * Metas contra realizado, mês a mês.
 *
 * A tabela de metas está vazia — as colunas "Meta (R$)" da planilha de
 * KPIs vieram em branco. Enquanto for assim, a tela mostra o REALIZADO sem
 * alvo, e diz isso.
 *
 * Alternativa seria inventar uma meta a partir do histórico. Não: meta
 * vira linha de referência no gráfico, e ninguém desconfia de uma linha de
 * referência. Um alvo derivado do próprio realizado sempre pareceria
 * batido, o que é o oposto do que uma meta serve para fazer.
 */

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export default function VendasMetas({ dados }: { dados: DadosMetas }) {
  const [canal, setCanal] = React.useState("");
  const [mesAberto, setMesAberto] = React.useState<number | null>(null);

  const porMes = React.useMemo(() => {
    const acc = Array.from({ length: 12 }, (_, m) => ({
      mes: m + 1,
      meta: 0,
      realizado: 0,
      pedidos: 0,
    }));
    for (const l of dados.linhas) {
      if (canal && l.canalId !== canal) continue;
      const alvo = acc[l.mes - 1];
      alvo.meta += l.meta;
      alvo.realizado += l.realizado;
      alvo.pedidos += l.pedidos;
    }
    return acc;
  }, [dados.linhas, canal]);

  const colunas: ColunaMatriz[] = React.useMemo(
    () => MESES.map((m, i) => ({ chave: String(i), rotulo: m })),
    []
  );

  const indicadores: IndicadorMatriz<(typeof porMes)[number]>[] = React.useMemo(() => {
    const base: IndicadorMatriz<(typeof porMes)[number]>[] = [
      {
        chave: "realizado",
        rotulo: "Receita realizada",
        destaque: true,
        // Mês sem movimento vem vazio: zero afirmaria que não vendeu, e o
        // que há é mês que ainda não chegou.
        valor: (l) => (l.realizado > 0 ? l.realizado : null),
        formato: (v) => money(v),
      },
      {
        chave: "pedidos",
        rotulo: "Pedidos",
        valor: (l) => (l.pedidos > 0 ? l.pedidos : null),
        formato: (v) => count(v),
      },
    ];

    if (!dados.temMeta) return base;

    return [
      {
        chave: "meta",
        rotulo: "Meta",
        valor: (l) => (l.meta > 0 ? l.meta : null),
        formato: (v) => money(v),
      },
      ...base,
      {
        chave: "atingimento",
        rotulo: "Atingimento",
        dica: "realizado sobre a meta",
        valor: (l) => (l.meta > 0 ? (l.realizado / l.meta) * 100 : null),
        formato: (v) => pct(v),
      },
    ];
  }, [dados.temMeta]);

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Metas" breadcrumb="Vendas" />
        <PageBody>
          <SemFonte
            titulo="Sem vendas importadas"
            origem="Metas comparam o realizado com o alvo. Sem lançamentos no período não há o que comparar."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Metas"
        breadcrumb="Vendas"
        description={`Realizado mês a mês em ${dados.ano}`}
        filters={
          <SeletorCanal canais={dados.canais} valor={canal} onChange={setCanal} />
        }
      />

      <PageBody>
        {!dados.temMeta && (
          <Panel className="px-4 py-3 flex items-start gap-2.5">
            <Badge tone="warn">sem meta</Badge>
            <p className="text-[12.5px] text-ink-2 leading-relaxed">
              Nenhuma meta cadastrada para {dados.ano}. As colunas{" "}
              <span className="num">Meta (R$)</span> da planilha de KPIs estão em
              branco — as onze, para todos os canais. O importador já lê essas
              colunas: preencha na planilha e reimporte, ou lance direto na tabela{" "}
              <span className="num">metas</span>, que a linha de alvo e o
              atingimento aparecem aqui.
            </p>
          </Panel>
        )}

        <Panel className="overflow-hidden">
          <PanelHeader
            title={dados.temMeta ? "Meta e realizado" : "Realizado, mês a mês"}
            hint="meses nas colunas · a seta compara com o mês à esquerda"
          />
          <Matriz
            colunas={colunas}
            periodos={porMes}
            indicadores={indicadores}
            onAbrirColuna={setMesAberto}
          />
        </Panel>
      </PageBody>

      {mesAberto != null && (
        <CompararPeriodo
          titulo={`${MESES[mesAberto]} de ${dados.ano}`}
          rotuloAtual={MESES[mesAberto]}
          rotuloAnterior={mesAberto > 0 ? MESES[mesAberto - 1] : "sem anterior"}
          linhas={indicadores.map((ind) => ({
            chave: ind.chave,
            rotulo: ind.rotulo,
            dica: ind.dica,
            destaque: ind.destaque,
            menorMelhor: ind.menorMelhor,
            formato: ind.formato,
            atual: ind.valor(porMes[mesAberto]),
            anterior: mesAberto > 0 ? ind.valor(porMes[mesAberto - 1]) : null,
          })) as LinhaComparacao[]}
          onClose={() => setMesAberto(null)}
        />
      )}
    </>
  );
}
