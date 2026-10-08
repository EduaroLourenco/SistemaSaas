"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Target } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge, EmptyState } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { Disclosure } from "@/components/ui/disclosure";
import { AXIS, GRID } from "@/components/ui/chart";
import { money, moneyShort, count } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  DadosResultados,
  LinhaPromocao,
  LinhaResultado,
  ProdutoResultado,
  Veredito,
} from "@/lib/dados/planejamento-resultados";

const TOM: Record<Veredito, "up" | "neutral" | "down" | "info"> = {
  "deu certo": "up",
  neutra: "neutral",
  "não deu certo": "down",
  "sem base": "info",
  futura: "info",
  "sem recorte": "neutral",
  "cedo demais": "info",
};

type Aba = "planejamento" | "promocoes";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const curta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pc = (v: number | null) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const varPct = (agora: number, antes: number) => (antes > 0 ? ((agora - antes) / antes) * 100 : null);
const efeitoTxt = (v: number | null) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} p.p.`;
const corEfeito = (v: number | null) => (v == null ? "" : v >= 10 ? "text-up" : v <= -10 ? "text-down" : "");

/**
 * Deu certo? As ações do Planejamento e as promoções do Mercado Livre.
 *
 * Cada linha abre o que importa para responder: o que foi feito, contra o
 * que foi comparado, produto a produto, e o dia a dia.
 */
export default function ResultadosCliente({ dados }: { dados: DadosResultados }) {
  const [aba, setAba] = React.useState<Aba>(
    dados.linhas.some((l) => l.atual) || !dados.promocoes.length ? "planejamento" : "promocoes"
  );
  const contar = (lista: { veredito: Veredito }[], v: Veredito) => lista.filter((l) => l.veredito === v).length;
  const lista = aba === "planejamento" ? dados.linhas : dados.promocoes;

  return (
    <>
      <PageHeader
        title="Resultados das campanhas"
        breadcrumb="Planejamento"
        description="O que foi feito, contra o que se compara, e se deu certo"
        actions={
          <Link
            href="/planejamento"
            className="inline-flex h-9 items-center gap-1.5 rounded-r1 border border-line-2 bg-panel px-3 text-[12px] font-medium text-ink hover:bg-panel-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Planejamento
          </Link>
        }
      />
      <PageBody>
        {dados.aviso && (
          <Panel className="px-4 py-3 border-warn/40">
            <p className="text-[13px] text-ink-2">{dados.aviso}</p>
          </Panel>
        )}

        <Segmented
          options={[
            { value: "planejamento" as Aba, label: `Suas campanhas · ${dados.linhas.length}` },
            { value: "promocoes" as Aba, label: `Promoções do Mercado Livre · ${dados.promocoes.length}` },
          ]}
          value={aba}
          onChange={setAba}
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Contador rotulo="Deram certo" valor={contar(lista, "deu certo")} tom="text-up" />
          <Contador rotulo="Neutras" valor={contar(lista, "neutra")} tom="text-ink" />
          <Contador rotulo="Não deram certo" valor={contar(lista, "não deu certo")} tom="text-down" />
          <Contador
            rotulo="Ainda sem medida"
            valor={lista.length - contar(lista, "deu certo") - contar(lista, "neutra") - contar(lista, "não deu certo")}
            tom="text-ink-3"
          />
        </div>

        {aba === "planejamento" ? (
          <>
            <Disclosure title="Como o resultado é medido">
              <p>
                Cada ação é comparada com o período imediatamente anterior, do mesmo tamanho. Crescer contra o
                período anterior não basta: se o canal inteiro cresceu junto (data comemorativa, frete grátis do
                canal), a ação não fez a diferença. Por isso ela é medida contra o <strong>resto do canal</strong>{" "}
                nas mesmas datas. Ação de canal inteiro, sem produto, é medida contra os outros canais.
              </p>
              <p className="mt-2">
                <strong>Efeito</strong> = crescimento da ação − crescimento do resto, em pontos percentuais.{" "}
                <strong>Deu certo</strong> a partir de +10 p.p.; <strong>não deu certo</strong> a partir de −10 p.p.;
                entre os dois, <strong>neutra</strong>.
              </p>
            </Disclosure>
            {dados.linhas.length === 0 ? (
              <Panel>
                <EmptyState
                  icon={Target}
                  title="Nenhuma ação planejada"
                  description="Crie campanhas no Planejamento, com produtos ou canais escolhidos, e o resultado aparece aqui quando o período começar."
                />
              </Panel>
            ) : (
              <Panel className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {dados.linhas.map((l) => (
                    <LinhaAcao key={l.id} l={l} />
                  ))}
                </ul>
              </Panel>
            )}
          </>
        ) : (
          <>
            <Disclosure title="Como as promoções são medidas">
              <p>
                Cada planilha da Central de Promoções processada aqui vira uma linha. A data é a do processamento (a
                planilha não traz a data da campanha). A medida compara os <strong>14 dias depois</strong> com os 14
                dias antes, e compara <strong>os anúncios que entraram</strong> com <strong>os que ficaram de fora</strong>{" "}
                da mesma campanha. É a comparação mais justa possível: mesmas datas, mesma campanha, só a decisão de
                participar muda.
              </p>
              <p className="mt-2">
                Um anúncio que está em duas campanhas ao mesmo tempo aparece nas duas: as campanhas se sobrepõem, e a
                venda dele não se separa entre elas.
              </p>
            </Disclosure>
            {dados.promocoes.length === 0 ? (
              <Panel>
                <EmptyState
                  icon={Target}
                  title="Nenhuma promoção processada"
                  description="Processe as planilhas da Central de Promoções em Mercado Livre › Promoções."
                />
              </Panel>
            ) : (
              <Panel className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {dados.promocoes.map((p) => (
                    <LinhaPromo key={p.id} p={p} />
                  ))}
                </ul>
              </Panel>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

function Contador({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: string }) {
  return (
    <Panel className="px-4 py-3">
      <p className={cn("num text-[24px] font-semibold leading-none", tom)}>{count(valor)}</p>
      <p className="mt-1.5 text-[12px] text-ink-3">{rotulo}</p>
    </Panel>
  );
}

/* ══ Ação do planejamento ═════════════════════════════════════ */

function Cabeca({
  aberta,
  alternar,
  titulo,
  sub,
  colunas,
  veredito,
}: {
  aberta: boolean;
  alternar: () => void;
  titulo: string;
  sub: string;
  colunas: { rotulo: string; valor: string; sub?: string; cor?: string }[];
  veredito: Veredito;
}) {
  const Seta = aberta ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={alternar}
      aria-expanded={aberta}
      className="grid w-full grid-cols-[1rem_minmax(0,1fr)] gap-2 px-4 py-3 text-left hover:bg-panel-2 md:grid-cols-[1rem_minmax(0,2fr)_repeat(3,minmax(0,1fr))_8rem] md:items-center md:gap-4"
    >
      <Seta className="mt-0.5 h-4 w-4 text-ink-3 md:mt-0" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-ink">{titulo}</span>
        <span className="num block text-[12px] text-ink-3">{sub}</span>
      </span>
      {colunas.map((c) => (
        <span key={c.rotulo} className="col-start-2 flex items-baseline justify-between gap-2 md:col-start-auto md:block md:text-right">
          <span className="text-[11px] text-ink-3 md:hidden">{c.rotulo}</span>
          <span>
            <span className={cn("num block text-[13px] font-semibold text-ink", c.cor)}>{c.valor}</span>
            {c.sub && <span className="num block text-[11px] text-ink-3">{c.sub}</span>}
          </span>
        </span>
      ))}
      <span className="col-start-2 md:col-start-auto md:text-right">
        <Badge tone={TOM[veredito]}>{veredito}</Badge>
      </span>
    </button>
  );
}

function LinhaAcao({ l }: { l: LinhaResultado }) {
  const [aberta, setAberta] = React.useState(false);
  return (
    <li>
      <Cabeca
        aberta={aberta}
        alternar={() => setAberta((v) => !v)}
        titulo={l.titulo}
        sub={`${l.feito.tipo} · ${dataBr(l.inicio)} a ${dataBr(l.fim)}${l.skus ? ` · ${l.skus} produto(s)` : ""}${l.parcial && l.veredito !== "futura" ? " · em andamento" : ""}`}
        colunas={[
          { rotulo: "Receita", valor: l.atual ? money(l.atual.receita) : "—", sub: l.anterior ? `antes ${money(l.anterior.receita)}` : "" },
          { rotulo: "Ação", valor: pc(l.crescimento), sub: l.crescimentoResto != null ? `resto ${pc(l.crescimentoResto)}` : "" },
          { rotulo: "Efeito", valor: efeitoTxt(l.efeito), cor: corEfeito(l.efeito), sub: l.atual ? `${count(l.atual.unidades)} un · ${count(l.atual.pedidos)} ped.` : "" },
        ]}
        veredito={l.veredito}
      />
      {aberta && <DetalheAcao l={l} />}
    </li>
  );
}

function DetalheAcao({ l }: { l: LinhaResultado }) {
  const f = l.feito;
  const feitos = f.checklist.filter((c) => c.feito).length;
  const campos: [string, string][] = [
    ["Tipo", f.tipo],
    ["Andamento", f.status],
    ["Etapa", f.etapa],
    ["Período", `${dataBr(l.inicio)} a ${dataBr(l.fim)}`],
    ["Canais", f.canais.length ? f.canais.join(", ") : "nenhum escolhido"],
    ["Produtos", l.skus ? `${l.skus} escolhido(s)` : "nenhum escolhido"],
    ["Responsável", f.responsavel || "—"],
    ["Orçamento", f.orcamento != null ? money(f.orcamento) : "—"],
    ["Meta", f.meta || "—"],
  ];
  return (
    <div className="flex flex-col gap-5 bg-panel-2 px-4 pb-5 pt-2 md:pl-10">
      <p className="text-[13px] leading-relaxed text-ink">
        <Badge tone={TOM[l.veredito]}>{l.veredito}</Badge> <span className="ml-1">{l.leitura}</span>
      </p>

      <section>
        <h3 className="label mb-2">O que foi feito</h3>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
          {campos.map(([k, v]) => (
            <p key={k} className="min-w-0">
              <span className="text-ink-3">{k}: </span>
              <span className="text-ink">{v}</span>
            </p>
          ))}
        </div>
        {(f.ideia || f.foco || f.hipotese) && (
          <div className="mt-2 flex flex-col gap-1 text-[13px]">
            {f.ideia && (
              <p>
                <span className="text-ink-3">A ideia: </span>
                {f.ideia}
              </p>
            )}
            {f.foco && (
              <p>
                <span className="text-ink-3">Foco: </span>
                {f.foco}
              </p>
            )}
            {f.hipotese && (
              <p>
                <span className="text-ink-3">Hipótese: </span>
                {f.hipotese}
              </p>
            )}
          </div>
        )}
        {f.checklist.length > 0 && (
          <div className="mt-3">
            <p className="text-[12px] text-ink-3">
              Passos: {feitos} de {f.checklist.length} feitos
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-[13px]">
              {f.checklist.map((c, i) => (
                <li key={i} className={cn("flex items-center gap-1.5", c.feito ? "text-ink" : "text-ink-3")}>
                  <Check className={cn("h-3.5 w-3.5", c.feito ? "text-up" : "opacity-30")} /> {c.texto}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(f.fechamento.funcionou || f.fechamento.problemas || f.fechamento.proximoPasso) && (
          <div className="mt-3 flex flex-col gap-1 text-[13px]">
            {f.fechamento.funcionou && <p><span className="text-ink-3">O que funcionou: </span>{f.fechamento.funcionou}</p>}
            {f.fechamento.problemas && <p><span className="text-ink-3">Problemas: </span>{f.fechamento.problemas}</p>}
            {f.fechamento.proximoPasso && <p><span className="text-ink-3">Próximo passo: </span>{f.fechamento.proximoPasso}</p>}
          </div>
        )}
        {!l.skus && !f.canais.length && (
          <p className="mt-3 text-[13px]">
            <Link href="/planejamento" className="font-medium text-brand hover:underline">
              Escolher os produtos e o canal desta ação no Planejamento
            </Link>{" "}
            <span className="text-ink-3">para que o resultado meça a ação, e não a loja inteira.</span>
          </p>
        )}
      </section>

      {l.atual && l.anterior && l.anteriorInicio && l.anteriorFim && (
        <>
          <section>
            <h3 className="label mb-2">Comparação</h3>
            <div className="overflow-x-auto rounded-r1 border border-line bg-panel">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[12px] text-ink-3">
                    <th className="px-3 py-2 text-left font-semibold"></th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Antes
                      <span className="num block font-normal">{curta(l.anteriorInicio)}–{curta(l.anteriorFim)}</span>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Durante
                      <span className="num block font-normal">{curta(l.inicio)}–{curta(l.atual.fim)}</span>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">Variação</th>
                  </tr>
                </thead>
                <tbody className="num">
                  <Linha3 rotulo={l.skus || f.canais.length ? "Receita da ação" : "Receita da loja"} antes={l.anterior.receita} agora={l.atual.receita} dinheiro />
                  <Linha3 rotulo="Pedidos" antes={l.anterior.pedidos} agora={l.atual.pedidos} />
                  <Linha3 rotulo="Unidades" antes={l.anterior.unidades} agora={l.atual.unidades} />
                  <Linha3
                    rotulo="Ticket médio"
                    antes={l.anterior.pedidos ? l.anterior.receita / l.anterior.pedidos : 0}
                    agora={l.atual.pedidos ? l.atual.receita / l.atual.pedidos : 0}
                    dinheiro
                  />
                  {l.restoAtual != null && l.restoAnterior != null && (
                    <Linha3 rotulo={l.produtosSaoDoCanal ? "Outros canais" : "Resto do canal"} antes={l.restoAnterior} agora={l.restoAtual} dinheiro discreto />
                  )}
                  {l.efeito != null && (
                    <tr className="border-t border-line">
                      <td className="px-3 py-2 font-sans font-medium text-ink">Efeito da ação</td>
                      <td></td>
                      <td></td>
                      <td className={cn("px-3 py-2 text-right font-semibold", corEfeito(l.efeito))}>{efeitoTxt(l.efeito)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="label mb-2">
              Dia a dia · roxo = {l.skus || f.canais.length ? "a ação" : "a loja"}
              {l.restoAtual != null ? ` · cinza = ${l.produtosSaoDoCanal ? "outros canais" : "resto do canal"} (eixo da direita)` : ""}
            </h3>
            <div className="h-[220px] rounded-r1 border border-line bg-panel p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={l.serie} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <ReferenceArea yAxisId="a" x1={l.anteriorInicio} x2={l.anteriorFim} fill="var(--panel-3)" fillOpacity={0.7} />
                  <XAxis dataKey="data" {...AXIS} tickFormatter={curta} minTickGap={24} />
                  <YAxis yAxisId="a" {...AXIS} width="auto" tickFormatter={(v) => moneyShort(Number(v))} />
                  {l.restoAtual != null && <YAxis yAxisId="r" orientation="right" {...AXIS} width="auto" tickFormatter={(v) => moneyShort(Number(v))} />}
                  <Tooltip
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="panel px-2.5 py-2 text-[12px]" style={{ boxShadow: "var(--sh-3)" }}>
                          <p className="mb-1 font-semibold text-ink-2">{dataBr(String(label))}</p>
                          {payload.map((p) => (
                            <p key={String(p.dataKey)} className="num">
                              {p.dataKey === "acao" ? "ação" : "resto"} {money(Number(p.value))}
                            </p>
                          ))}
                        </div>
                      ) : null
                    }
                  />
                  <Line yAxisId="a" dataKey="acao" stroke="var(--brand)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  {l.restoAtual != null && (
                    <Line yAxisId="r" dataKey="resto" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-ink-3">A faixa cinza é o período anterior.</p>
          </section>

          {l.produtos.length > 0 && (
            <section>
              <h3 className="label mb-2">
                {l.produtosSaoDoCanal
                  ? "Produtos que mais venderam no período (a ação não tem produto escolhido)"
                  : "Produto a produto"}
              </h3>
              <TabelaProdutos produtos={l.produtos} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Linha3({
  rotulo,
  antes,
  agora,
  dinheiro,
  discreto,
}: {
  rotulo: string;
  antes: number;
  agora: number;
  dinheiro?: boolean;
  discreto?: boolean;
}) {
  const v = varPct(agora, antes);
  const f = (x: number) => (dinheiro ? money(x) : count(x));
  return (
    <tr className={cn("border-t border-line", discreto && "text-ink-3")}>
      <td className="px-3 py-2 font-sans">{rotulo}</td>
      <td className="px-3 py-2 text-right">{f(antes)}</td>
      <td className="px-3 py-2 text-right font-semibold">{f(agora)}</td>
      <td className={cn("px-3 py-2 text-right", v != null && (v < 0 ? "text-down" : v > 0 ? "text-up" : ""))}>{pc(v)}</td>
    </tr>
  );
}

function TabelaProdutos({ produtos }: { produtos: ProdutoResultado[] }) {
  return (
    <div className="overflow-x-auto rounded-r1 border border-line bg-panel">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead>
          <tr className="text-[12px] text-ink-3">
            <th className="px-3 py-2 text-left font-semibold">Produto</th>
            <th className="px-3 py-2 text-right font-semibold">Receita antes → durante</th>
            <th className="px-3 py-2 text-right font-semibold">Variação</th>
            <th className="px-3 py-2 text-right font-semibold">Unidades</th>
            <th className="px-3 py-2 text-right font-semibold">Preço médio vendido</th>
          </tr>
        </thead>
        <tbody className="num">
          {produtos.map((p) => {
            const v = varPct(p.agora.receita, p.antes.receita);
            return (
              <tr key={p.chave} className="border-t border-line">
                <td className="max-w-[320px] px-3 py-2">
                  <span className="block font-semibold text-ink">{p.chave}</span>
                  <span className="block truncate font-sans text-[12px] text-ink-3" title={p.titulo}>{p.titulo}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="text-ink-3">{moneyShort(p.antes.receita)}</span> → <span className="font-semibold">{moneyShort(p.agora.receita)}</span>
                </td>
                <td className={cn("px-3 py-2 text-right", v != null && (v < 0 ? "text-down" : "text-up"))}>
                  {p.antes.receita > 0 ? pc(v) : p.agora.receita > 0 ? "novo" : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {count(p.antes.unidades)} → {count(p.agora.unidades)}
                </td>
                <td className="px-3 py-2 text-right">
                  {p.antes.preco != null ? money(p.antes.preco) : "—"} → {p.agora.preco != null ? money(p.agora.preco) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ══ Promoção do Mercado Livre ════════════════════════════════ */

function LinhaPromo({ p }: { p: LinhaPromocao }) {
  const [aberta, setAberta] = React.useState(false);
  return (
    <li>
      <Cabeca
        aberta={aberta}
        alternar={() => setAberta((v) => !v)}
        titulo={p.nome}
        sub={`processada em ${dataBr(p.processadaEm)}${p.comReducao ? " · com redução de tarifa" : ""} · ${p.participam} entraram, ${p.fora} de fora`}
        colunas={[
          {
            rotulo: "Quem entrou",
            valor: money(p.receitaParticipantes.agora),
            sub: `antes ${money(p.receitaParticipantes.antes)}`,
          },
          { rotulo: "Entraram × controle", valor: pc(p.crescimento), sub: `${p.controle === "fora da campanha" ? "fora" : "resto Meli"} ${pc(p.crescimentoFora)}` },
          { rotulo: "Efeito", valor: efeitoTxt(p.efeito), cor: corEfeito(p.efeito), sub: `${p.dias} dias` },
        ]}
        veredito={p.veredito}
      />
      {aberta && (
        <div className="flex flex-col gap-5 bg-panel-2 px-4 pb-5 pt-2 md:pl-10">
          <p className="text-[13px] leading-relaxed text-ink">
            <Badge tone={TOM[p.veredito]}>{p.veredito}</Badge> <span className="ml-1">{p.leitura}</span>
          </p>
          <section>
            <h3 className="label mb-2">Comparação · {p.dias} dias antes e depois do processamento</h3>
            <div className="overflow-x-auto rounded-r1 border border-line bg-panel">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[12px] text-ink-3">
                    <th className="px-3 py-2 text-left font-semibold"></th>
                    <th className="px-3 py-2 text-right font-semibold">Antes</th>
                    <th className="px-3 py-2 text-right font-semibold">Depois</th>
                    <th className="px-3 py-2 text-right font-semibold">Variação</th>
                  </tr>
                </thead>
                <tbody className="num">
                  <Linha3 rotulo={`Entraram (${p.participam})`} antes={p.receitaParticipantes.antes} agora={p.receitaParticipantes.agora} dinheiro />
                  <Linha3
                    rotulo={p.controle === "fora da campanha" ? `Ficaram de fora (${p.fora})` : "Resto do Mercado Livre (controle)"}
                    antes={p.receitaFora.antes}
                    agora={p.receitaFora.agora}
                    dinheiro
                    discreto
                  />
                  {p.efeito != null && (
                    <tr className="border-t border-line">
                      <td className="px-3 py-2 font-sans font-medium text-ink">Efeito de entrar</td>
                      <td></td>
                      <td></td>
                      <td className={cn("px-3 py-2 text-right font-semibold", corEfeito(p.efeito))}>{efeitoTxt(p.efeito)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          {p.anuncios.length > 0 && (
            <section>
              <h3 className="label mb-2">Anúncios que entraram, dos que mais venderam</h3>
              <div className="overflow-x-auto rounded-r1 border border-line bg-panel">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="text-[12px] text-ink-3">
                      <th className="px-3 py-2 text-left font-semibold">Anúncio</th>
                      <th className="px-3 py-2 text-right font-semibold">Preço de oferta</th>
                      <th className="px-3 py-2 text-right font-semibold">Receita antes → depois</th>
                      <th className="px-3 py-2 text-right font-semibold">Variação</th>
                      <th className="px-3 py-2 text-right font-semibold">Unidades depois</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {p.anuncios.map((a) => {
                      const v = varPct(a.agora, a.antes);
                      return (
                        <tr key={a.codigo} className="border-t border-line">
                          <td className="max-w-[320px] px-3 py-2">
                            <span className="block font-semibold text-ink">{a.codigo}</span>
                            <span className="block truncate font-sans text-[12px] text-ink-3" title={a.titulo}>{a.titulo}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {a.precoOferta != null ? money(a.precoOferta) : "—"}
                            {a.precoTabela != null && <span className="block text-[11px] text-ink-3">tabela {money(a.precoTabela)}</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-ink-3">{moneyShort(a.antes)}</span> → <span className="font-semibold">{moneyShort(a.agora)}</span>
                          </td>
                          <td className={cn("px-3 py-2 text-right", v != null && (v < 0 ? "text-down" : "text-up"))}>
                            {a.antes > 0 ? pc(v) : a.agora > 0 ? "novo" : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">{count(a.unidadesAgora)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </li>
  );
}
