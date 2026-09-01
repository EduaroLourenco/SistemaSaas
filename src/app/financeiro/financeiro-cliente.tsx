"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import { Tabs, Input, Select, Field } from "@/components/ui/controls";
import { money, moneyShort, pct, count } from "@/lib/format";
import { AlertCircle, ArrowRight } from "lucide-react";
import type { Resultado, LinhaMargem, Dimensao } from "@/lib/dados/margem";

/**
 * O resultado, do bruto ao que sobra.
 *
 * ── Duas margens, não uma ──
 *
 * A de CONTRIBUIÇÃO é o que a venda deixa depois dos custos que só
 * existem porque ela aconteceu — comissão, frete, imposto, embalagem,
 * mercadoria. Responde "vender mais desta unidade melhora o resultado?".
 *
 * O RESULTADO desconta também o que a operação gasta exista venda ou não
 * — mídia, mensalidade, taxas. Responde "a operação fechou no azul?".
 *
 * Elas ficam separadas de propósito. Ratear custo fixo dentro do preço de
 * um SKU é o erro clássico: produto de giro alto e margem apertada
 * aparece como prejuízo, é despriorizado, e o custo fixo que ele ajudava
 * a pagar não some junto com ele.
 *
 * ── A cobertura vem antes do número ──
 *
 * Enquanto houver SKU sem custo cadastrado, a margem cobre parte da
 * receita. A tela diz qual parte, no topo, antes de qualquer valor. Sem
 * isso, a margem sobe e desce conforme o cadastro avança e ninguém sabe
 * se a operação mudou ou se o dado mudou.
 */

const DIMENSOES: { valor: Dimensao; rotulo: string }[] = [
  { valor: "mes", rotulo: "Mês" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "canal", rotulo: "Canal" },
  { valor: "conta", rotulo: "Conta" },
  { valor: "sku", rotulo: "SKU" },
  { valor: "anuncio", rotulo: "Anúncio" },
];

function Linha({
  rotulo,
  valor,
  tipo = "custo",
  indent,
  nota,
}: {
  rotulo: string;
  valor: number;
  tipo?: "receita" | "custo" | "subtotal" | "final";
  indent?: boolean;
  nota?: string;
}) {
  const forte = tipo === "subtotal" || tipo === "final";
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-1.5 ${
        forte ? "border-t border-line mt-1 pt-2" : ""
      } ${indent ? "pl-4" : ""}`}
    >
      <div className="min-w-0">
        <span
          className={`text-[13px] ${
            forte ? "font-semibold text-ink" : "text-ink-2"
          }`}
        >
          {rotulo}
        </span>
        {nota && (
          <span className="block text-[11px] text-ink-3 leading-tight">{nota}</span>
        )}
      </div>
      <span
        className={`num shrink-0 ${
          tipo === "final"
            ? `text-[16px] font-semibold ${valor >= 0 ? "text-up" : "text-down"}`
            : forte
              ? "text-[14px] font-semibold text-ink"
              : tipo === "custo"
                ? "text-[13px] text-ink-2"
                : "text-[13px] text-ink"
        }`}
      >
        {tipo === "custo" && valor > 0 ? `− ${money(valor)}` : money(valor)}
      </span>
    </div>
  );
}

export default function FinanceiroCliente({
  resultado: r,
  visoes,
  canais,
  inicio,
  fim,
  canalId,
}: {
  resultado: Resultado;
  visoes: Record<Dimensao, LinhaMargem[]>;
  canais: { id: string; nome: string }[];
  inicio: string;
  fim: string;
  canalId: string;
}) {
  const router = useRouter();
  const [dim, setDim] = React.useState<Dimensao>("mes");
  const [filtro, setFiltro] = React.useState({ inicio, fim, canal: canalId });

  function aplicar() {
    const q = new URLSearchParams({
      inicio: filtro.inicio,
      fim: filtro.fim,
      ...(filtro.canal ? { canal: filtro.canal } : {}),
    });
    router.push(`/financeiro?${q}`);
  }

  const linhas = visoes[dim] ?? [];
  const semCusto = r.cobertura < 99.5;

  const th = "px-3 py-2 text-[11px] font-semibold text-ink-3 whitespace-nowrap";
  const td = "px-3 py-2 border-b border-line";

  return (
    <>
      <PageHeader
        title="Financeiro"
        breadcrumb="Financeiro"
        description="Do bruto ao que sobra"
      />

      <PageBody>
        {/* ── Período ── */}
        <Panel className="p-3 mb-3">
          <div className="flex items-end gap-2 flex-wrap">
            <Field label="De">
              <Input
                type="date"
                value={filtro.inicio}
                onChange={(e) => setFiltro({ ...filtro, inicio: e.target.value })}
              />
            </Field>
            <Field label="Até">
              <Input
                type="date"
                value={filtro.fim}
                onChange={(e) => setFiltro({ ...filtro, fim: e.target.value })}
              />
            </Field>
            <Field label="Canal">
              <Select
                value={filtro.canal}
                onChange={(e) => setFiltro({ ...filtro, canal: e.target.value })}
              >
                <option value="">Todos</option>
                {canais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="primary" onClick={aplicar}>
              Aplicar
            </Button>
          </div>
        </Panel>

        {/* ── Cobertura: vem antes de qualquer número ── */}
        {semCusto && (
          <Panel className="px-4 py-3 mb-3 flex items-start gap-2.5 border-warn/30">
            <AlertCircle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-ink">
                A margem cobre{" "}
                <span className="num font-semibold">{pct(r.cobertura, 1)}</span>{" "}
                da receita do período.
              </p>
              <p className="text-[12px] text-ink-2 leading-relaxed mt-0.5">
                Faltam custos de{" "}
                <span className="num">{money(r.receitaSemCusto)}</span> em vendas.
                O que aparece abaixo é a margem da parte apurada — não da
                operação inteira. Cadastre mercadoria, embalagem e imposto por
                SKU para fechar.
              </p>
              <Link
                href="/financeiro/custos"
                className="inline-flex items-center gap-1 text-[12px] text-brand hover:underline mt-1.5"
              >
                Preencher custos
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </Panel>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-3">
          {/* ── DRE ── */}
          <Panel className="p-4 h-fit">
            <p className="text-[13px] font-semibold text-ink mb-2">
              Resultado do período
            </p>

            <Linha rotulo="Receita bruta" valor={r.receitaBruta} tipo="receita" />
            <Linha rotulo="Cancelamentos" valor={r.cancelamentos} />
            <Linha
              rotulo="Receita líquida"
              valor={r.receitaLiquida}
              tipo="subtotal"
            />

            <p className="text-[11px] text-ink-3 mt-3 mb-1">
              Custos que só existem porque houve venda
            </p>
            <Linha rotulo="Comissão do canal" valor={r.comissao} indent />
            <Linha rotulo="Frete" valor={r.frete} indent />
            <Linha
              rotulo="Juros de parcelamento"
              valor={r.juros}
              indent
              nota={
                r.cadaCoberturaDe.jurosInformado === 0
                  ? "nenhum pedido trouxe juros — reimporte para preencher"
                  : undefined
              }
            />
            <Linha rotulo="Impostos" valor={r.impostos} indent />
            <Linha rotulo="Embalagem" valor={r.embalagem} indent />
            <Linha rotulo="Mercadoria" valor={r.mercadoria} indent />

            <Linha
              rotulo="Margem de contribuição"
              valor={r.margemContribuicao}
              tipo="subtotal"
              nota={
                r.margemPct != null
                  ? `${pct(r.margemPct, 1)} da receita apurada`
                  : undefined
              }
            />

            <p className="text-[11px] text-ink-3 mt-3 mb-1">
              Custos da operação, com ou sem venda
            </p>
            <Linha rotulo="Mídia (Ads)" valor={r.ads} indent />
            <Linha rotulo="Fixas recorrentes" valor={r.fixaRecorrente} indent />
            <Linha
              rotulo="Variáveis recorrentes"
              valor={r.variavelRecorrente}
              indent
            />
            <Linha rotulo="Variáveis avulsas" valor={r.variavelAvulsa} indent />

            <Linha rotulo="Resultado" valor={r.resultado} tipo="final" />
            {r.resultadoPct != null && (
              <p className="text-[11.5px] text-ink-3 text-right num">
                {pct(r.resultadoPct, 1)} da receita apurada
              </p>
            )}

            {/* Quanto do custo foi medido, e quanto foi estimado por tabela. */}
            <div className="mt-4 pt-3 border-t border-line">
              <p className="text-[11px] text-ink-3 leading-relaxed">
                Dos {count(r.cadaCoberturaDe.pedidos)} pedidos do período,{" "}
                <span className="num">
                  {count(r.cadaCoberturaDe.comissaoPraticada)}
                </span>{" "}
                trouxeram a comissão cobrada e{" "}
                <span className="num">
                  {count(r.cadaCoberturaDe.fretePraticado)}
                </span>{" "}
                o frete do vendedor. Nos demais, a comissão veio da alíquota de
                tabela e o frete da faixa de peso.
              </p>
            </div>
          </Panel>

          {/* ── Margem por dimensão ── */}
          <Panel className="overflow-hidden">
            <Tabs
              tabs={DIMENSOES.map((d) => ({ value: d.valor, label: d.rotulo }))}
              value={dim}
              onChange={setDim}
            />

            <div className="overflow-x-auto max-h-[640px]">
              <table className="w-full border-collapse min-w-[780px]">
                <thead className="bg-panel-2 sticky top-0 z-10">
                  <tr>
                    <th className={`${th} text-left`}>
                      {DIMENSOES.find((d) => d.valor === dim)?.rotulo}
                    </th>
                    <th className={`${th} text-right`}>Un.</th>
                    <th className={`${th} text-right`}>Receita</th>
                    <th className={`${th} text-right`}>Comissão</th>
                    <th className={`${th} text-right`}>Frete</th>
                    <th className={`${th} text-right`}>Mercadoria</th>
                    <th className={`${th} text-right`}>Margem</th>
                    <th className={`${th} text-right`}>Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.chave} className="hover:bg-panel-2/50">
                      <td className={`${td} text-[12.5px] text-ink`}>
                        <span className="truncate block max-w-[220px]">
                          {l.rotulo}
                        </span>
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-2`}>
                        {count(l.unidades)}
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink`}>
                        {moneyShort(l.receita)}
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-3`}>
                        {l.comissao ? moneyShort(l.comissao) : "—"}
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-3`}>
                        {l.frete ? moneyShort(l.frete) : "—"}
                      </td>
                      <td className={`${td} text-right num text-[12.5px] text-ink-3`}>
                        {l.mercadoria ? moneyShort(l.mercadoria) : "—"}
                      </td>
                      <td className={`${td} text-right`}>
                        {l.margem != null ? (
                          <div className="flex flex-col items-end leading-tight">
                            <span
                              className={`num text-[13px] font-semibold ${
                                l.margem >= 0 ? "text-up" : "text-down"
                              }`}
                            >
                              {moneyShort(l.margem)}
                            </span>
                            <span className="num text-[10.5px] text-ink-3">
                              {pct(l.margemPct ?? 0, 1)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-ink-3">sem custo</span>
                        )}
                      </td>
                      <td className={`${td} text-right`}>
                        {/* Cobertura ao lado da margem, sempre: uma margem de
                            30% sobre 8% da receita não é uma margem de 30%. */}
                        <Badge
                          tone={
                            l.cobertura >= 99.5
                              ? "up"
                              : l.cobertura >= 50
                                ? "warn"
                                : "neutral"
                          }
                        >
                          {pct(l.cobertura, 0)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!linhas.length && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-3 py-8 text-center text-[13px] text-ink-3"
                      >
                        Nenhuma venda no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
