"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge, EmptyState } from "@/components/ui/primitives";
import { Tabs, Segmented, Input, Field, Select } from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  regraDoCanal, regraEfetiva, contaNoCanal, precoNoCanal, custoMeliEstimado,
  type CustoProduto, type Logistica, type RegraCanal,
} from "@/lib/precificacao/regras-canal";
import type { Decomposicao } from "@/lib/dados/formula-preco";
import type { DadosPrecificacao, ProdutoPreco } from "@/lib/dados/precificacao";

/**
 * Precificação: preço, recebido e margem por canal; cotação de produto novo;
 * margem de contribuição de um mix.
 *
 * A conta roda no navegador com as mesmas funções de `regras-canal.ts` que
 * o teste cobre — mexer em imposto, margem ou marketing recalcula tudo sem
 * ida ao servidor.
 */

type Aba = "precos" | "cotacao" | "contribuicao";

const ler = (s: string) => {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : null;
};
const tom = (m: number | null) => (m == null ? "" : m < 0 ? "text-down" : m < 10 ? "text-warn" : "text-up");

function Moeda({ v, className }: { v: number | null | undefined; className?: string }) {
  return <span className={cn("num", className)}>{v == null || !Number.isFinite(v) ? "—" : money(v)}</span>;
}

/* ── Tabela que ordena por qualquer coluna, com a primeira fixa ─────────── */

type Col<T> = { id: string; titulo: string; valor: (l: T) => number | null; celula: (l: T) => React.ReactNode; esq?: boolean };

function Grade<T>({ linhas, colunas, chave, linhaInteira }: {
  linhas: T[];
  colunas: Col<T>[];
  chave: (l: T) => string;
  /** Linha sem dado diz o motivo uma vez, depois da coluna indicada. */
  linhaInteira?: (l: T) => { aPartirDe: number; motivo: React.ReactNode } | null;
}) {
  const [ordem, setOrdem] = React.useState<{ id: string; dir: 1 | -1 } | null>(null);
  const ordenadas = React.useMemo(() => {
    if (!ordem) return linhas;
    const c = colunas.find((x) => x.id === ordem.id);
    if (!c) return linhas;
    return [...linhas].sort((a, b) => ((c.valor(a) ?? -Infinity) - (c.valor(b) ?? -Infinity)) * ordem.dir);
  }, [linhas, colunas, ordem]);

  return (
    <div className="overflow-auto rounded-r3 border border-line bg-panel">
      <table className="w-full border-separate border-spacing-0 text-[13.5px]">
        <thead>
          <tr>
            {colunas.map((c, i) => (
              <th
                key={c.id}
                onClick={() => setOrdem((o) => ({ id: c.id, dir: o?.id === c.id && o.dir === -1 ? 1 : -1 }))}
                className={cn(
                  "sticky top-0 cursor-pointer select-none whitespace-nowrap border-b border-line bg-panel-2 px-3 py-2.5 text-[12px] font-medium text-ink-3",
                  c.esq ? "text-left" : "text-right",
                  i === 0 && "left-0 z-20"
                )}
              >
                {c.titulo}
                {ordem?.id === c.id ? (ordem.dir === -1 ? " ↓" : " ↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l) => {
            const inteira = linhaInteira?.(l);
            return (
              <tr key={chave(l)}>
                {colunas.map((c, i) => {
                  if (inteira && i === inteira.aPartirDe)
                    return (
                      <td key={c.id} colSpan={colunas.length - i} className="h-12 border-b border-line px-3 text-left text-[12.5px] text-ink-3">
                        {inteira.motivo}
                      </td>
                    );
                  if (inteira && i > inteira.aPartirDe) return null;
                  return (
                    <td
                      key={c.id}
                      className={cn(
                        "h-12 whitespace-nowrap border-b border-line px-3",
                        c.esq ? "text-left" : "text-right",
                        i === 0 && "sticky left-0 z-10 bg-panel"
                      )}
                    >
                      {c.celula(l)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Tela ─────────────────────────────────────────────────────────────── */

export default function PrecificacaoCliente({ dados }: { dados: DadosPrecificacao | null }) {
  const canalInicial = dados?.canais.find((c) => c.temVenda)?.codigo ?? "mercado_livre";
  const [aba, setAba] = React.useState<Aba>("precos");
  const [canal, setCanal] = React.useState(canalInicial);
  const [imposto, setImposto] = React.useState("");
  const [meta, setMeta] = React.useState("20");
  const [tacos, setTacos] = React.useState(dados?.tacosMeliPct != null ? String(dados.tacosMeliPct) : "0");
  const [cfg, setCfg] = React.useState<Record<string, { tipo: string; comissao: string }>>({});
  const [sim, setSim] = React.useState<Simulacao>({});
  const [produtoCotacao, setProdutoCotacao] = React.useState<string | null>(null);

  if (!dados) {
    return (
      <>
        <PageHeader title="Precificação" />
        <PageBody><EmptyState title="Nenhuma empresa selecionada" /></PageBody>
      </>
    );
  }

  const regraBase = regraDoCanal(canal)!;
  const cfgCanal = cfg[canal] ?? { tipo: regraBase.tipos[0].id, comissao: "" };
  const regra = regraEfetiva(regraBase, cfgCanal.tipo, ler(cfgCanal.comissao));
  const faixaCat = regra.tipos[0].faixaCategoria;
  const ctx: Contexto = {
    dados, canal, regra,
    impostoGlobal: ler(imposto),
    metaPct: ler(meta) ?? 0,
    adsPct: ler(tacos) ?? 0,
    sim, setSim,
  };

  const filtros = (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Imposto %" className="w-[110px]">
        <Input type="number" inputMode="decimal" value={imposto} onChange={(e) => setImposto(e.target.value)} placeholder="do produto" />
      </Field>
      <Field label="Margem desejada %" className="w-[140px]">
        <Input type="number" inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} />
      </Field>
      <Field label="Ads (TACoS) %" className="w-[120px]">
        <Input type="number" inputMode="decimal" value={tacos} onChange={(e) => setTacos(e.target.value)} />
      </Field>
      <Field label="Canal" className="min-w-0">
        <Segmented options={dados.canais.map((c) => ({ value: c.codigo, label: c.nome }))} value={canal} onChange={setCanal} />
      </Field>
      {regraBase.tipos.length > 1 && (
        <Field label="Tipo" className="w-[170px]">
          <Select value={cfgCanal.tipo} onChange={(e) => setCfg({ ...cfg, [canal]: { ...cfgCanal, tipo: e.target.value } })}>
            {regraBase.tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </Select>
        </Field>
      )}
      {faixaCat ? (
        <Field label={`Comissão % (${faixaCat[0]} a ${faixaCat[1]})`} className="w-[150px]">
          <Input type="number" inputMode="decimal" value={cfgCanal.comissao} placeholder={String(regraBase.tipos.find((t) => t.id === cfgCanal.tipo)?.faixas[0].comissaoPct ?? "")} onChange={(e) => setCfg({ ...cfg, [canal]: { ...cfgCanal, comissao: e.target.value } })} />
        </Field>
      ) : (
        <Field label="Comissão">
          <span className="num flex h-10 items-center text-[12.5px] text-ink-2">{regra.faixas.map((x) => `${x.comissaoPct}% + ${money(x.taxaFixa)}`).join(" / ")}</span>
        </Field>
      )}
    </div>
  );

  const cotar = (produtoId: string) => {
    setProdutoCotacao(produtoId);
    setAba("cotacao");
  };

  return (
    <>
      <PageHeader title="Precificação" badge={<Badge>{dados.empresa}</Badge>} filters={filtros} mobileFilters={false} />
      <PageBody>
        <Tabs
          className="-mx-4 md:-mx-6"
          tabs={[
            { value: "precos", label: "Preços" },
            { value: "cotacao", label: "Cotação" },
            { value: "contribuicao", label: "Contribuição" },
          ]}
          value={aba}
          onChange={setAba}
        />
        {regra.conferir && <p className="text-[12.5px] text-warn">{regra.nome}: conferir {regra.conferir}</p>}
        {aba === "precos" && <Precos ctx={ctx} onCotar={cotar} />}
        {aba === "cotacao" && (
          <Cotacao key={produtoCotacao ?? "novo"} dados={dados} produtoId={produtoCotacao} onProduto={setProdutoCotacao} impostoGlobal={ctx.impostoGlobal} metaPct={ctx.metaPct} marketingPct={ctx.adsPct} />
        )}
        {aba === "contribuicao" && <Contribuicao ctx={ctx} />}
      </PageBody>
    </>
  );
}

/* ── O que as abas dividem ────────────────────────────────────────────── */

/** Frete e preço que o usuário digitou para simular, por canal e produto. */
type Simulacao = Record<string, { frete?: string; preco?: string }>;

type Contexto = {
  dados: DadosPrecificacao;
  canal: string;
  /** Já com o tipo de anúncio e a comissão da categoria escolhidos no topo. */
  regra: RegraCanal;
  impostoGlobal: number | null;
  metaPct: number;
  /** Ads planejado: entra no preço sugerido e na simulação. O realizado usa o medido. */
  adsPct: number;
  sim: Simulacao;
  setSim: (s: Simulacao) => void;
};

/**
 * Frete por unidade, do mais confiável ao menos: o digitado aqui, o que o
 * canal cobrou nos pedidos, o salvo no produto, a estimativa do Meli abaixo
 * de R$ 79. Sem nenhum, a linha pede para cotar.
 */
function freteDo(ctx: Contexto, p: ProdutoPreco, precoRef: number | null): { valor: number | null; origem: string } {
  const digitado = ler(ctx.sim[ctx.canal + p.id]?.frete ?? "");
  if (digitado != null) return { valor: digitado, origem: "simulado" };
  if (ctx.regra.frete === "incluso") return { valor: 0, origem: "na tarifa" };
  const v = p.porCanal[ctx.canal];
  if (v?.unidadesComRecebido) return { valor: v.freteVendedor / v.unidadesComRecebido, origem: "medido" };
  if (p.freteSalvo != null) return { valor: p.freteSalvo, origem: "salvo" };
  const est = precoRef != null ? custoMeliEstimado(precoRef, p.pesoKg, "coleta") : null;
  if (est) return { valor: est.frete, origem: "estimado" };
  return { valor: null, origem: "cotar" };
}

/** Ads medido do produto no Meli (gasto ÷ vendido), para o realizado. */
const adsMedido = (p: ProdutoPreco, canal: string) =>
  canal === "mercado_livre" && p.porCanal[canal]?.vendido ? (p.adsMeliPct ?? 0) : null;

type Linha = {
  p: ProdutoPreco;
  custoTotal: number | null;
  vitrine: number | null;
  unidades: number;
  vendidoUn: number | null;
  recebeUn: number | null;
  margemReal: number | null;
  adsReal: number | null;
  frete: { valor: number | null; origem: string };
  preco: number | null;
  precoSim: number | null;
  sim: (Decomposicao & { recebe: number }) | null;
};

function linhaDo(ctx: Contexto, p: ProdutoPreco): Linha {
  const v = p.porCanal[ctx.canal];
  const impostoPct = ctx.impostoGlobal ?? p.impostoPct ?? 0;
  const un = v?.unidadesComRecebido ?? 0;
  const vendidoUn = un ? v!.vendidoComRecebido / un : null;
  const recebeUn = un ? v!.recebido / un : null;
  const custoTotal = p.custo == null ? null : p.custo + (p.embalagem ?? 0);
  const adsReal = adsMedido(p, ctx.canal);

  const margemReal =
    custoTotal != null && vendidoUn && recebeUn != null
      ? ((recebeUn - custoTotal - vendidoUn * ((impostoPct + (adsReal ?? 0)) / 100)) / vendidoUn) * 100
      : null;

  /* Sem anúncio no canal, a vitrine do Meli é o ponto de partida da simulação. */
  const vitrine = v?.vitrine ?? null;
  const referencia = vitrine ?? p.porCanal.mercado_livre?.vitrine ?? null;
  const frete = freteDo(ctx, p, referencia);
  const custo: CustoProduto | null =
    custoTotal == null || frete.valor == null
      ? null
      : { mercadoria: p.custo!, embalagem: p.embalagem ?? 0, frete: frete.valor, impostoPct, marketingPct: ctx.adsPct };

  const r = custo ? precoNoCanal(ctx.regra, custo, p.margemMinimaPct ?? ctx.metaPct) : null;
  const preco = r?.ok ? r.preco : null;
  const precoSim = ler(ctx.sim[ctx.canal + p.id]?.preco ?? "") ?? referencia ?? preco;
  return {
    p, custoTotal, vitrine, unidades: v?.unidades ?? 0, vendidoUn, recebeUn, margemReal, adsReal, frete, preco, precoSim,
    sim: custo && precoSim ? contaNoCanal(ctx.regra, custo, precoSim) : null,
  };
}

/* ── Frete: campo pequeno que abre na linha ───────────────────────────── */

function CampoFrete({ ctx, linha }: { ctx: Contexto; linha: Linha }) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [valor, setValor] = React.useState("");
  const [estado, setEstado] = React.useState<{ carregando?: boolean; erro?: string; salvando?: boolean }>({});
  const k = ctx.canal + linha.p.id;
  const meli = ctx.canal === "mercado_livre";
  const podeBuscar = meli && linha.p.mlbMeli && ctx.dados.contaMeli;

  const buscar = async () => {
    setEstado({ carregando: true });
    try {
      const q = new URLSearchParams({ conta: ctx.dados.contaMeli!, item: linha.p.mlbMeli! });
      const r = await fetch(`/api/precificacao/frete?${q}`);
      const j = await r.json();
      if (r.ok && j.frete != null) { setValor(String(j.frete)); setEstado({}); }
      else setEstado({ erro: j.erro ?? "o Meli não devolveu custo" });
    } catch {
      setEstado({ erro: "sem conexão" });
    }
  };

  const abrir = () => {
    setValor(linha.frete.valor != null ? linha.frete.valor.toFixed(2) : "");
    setEstado({});
    setAberto(true);
    if (podeBuscar && linha.frete.valor == null) void buscar();
  };

  const usarAqui = () => {
    ctx.setSim({ ...ctx.sim, [k]: { ...ctx.sim[k], frete: valor } });
    setAberto(false);
  };

  /* Salvar grava no produto (`frete_unitario`): vale para as outras telas e
     para a próxima visita. É o frete do Meli; nos outros canais fica só aqui. */
  const salvar = async () => {
    const v = ler(valor);
    if (v == null) return;
    setEstado({ salvando: true });
    const r = await fetch("/api/custos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edicoes: [{ produtoId: linha.p.id, freteUnitario: v }] }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setEstado({ erro: j.erro ?? `não salvou (HTTP ${r.status})` });
      return;
    }
    const { [k]: _, ...resto } = ctx.sim;
    void _;
    ctx.setSim(resto);
    setAberto(false);
    router.refresh();
  };

  return (
    <span className="relative inline-block">
      <button type="button" onClick={abrir} className="min-h-[40px] text-right leading-tight">
        {linha.frete.valor != null ? <Moeda v={linha.frete.valor} className="underline decoration-line-2 underline-offset-2" /> : <span className="text-[12.5px] font-medium text-brand">cotar</span>}
        <span className="block text-[11px] text-ink-3">{linha.frete.origem}</span>
      </button>
      {aberto && (
        <span className="absolute right-0 top-full z-30 mt-1 block w-[230px] rounded-r2 border border-line bg-panel p-3 text-left shadow-[var(--sh-3)]">
          <span className="mb-1 block text-[12px] text-ink-3">Frete por unidade</span>
          <Input type="number" inputMode="decimal" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} placeholder={estado.carregando ? "buscando…" : "R$"} />
          {podeBuscar && (
            <button type="button" onClick={buscar} disabled={estado.carregando} className="mt-2 text-[12.5px] font-medium text-brand disabled:opacity-50">
              {estado.carregando ? "Buscando no Meli…" : "Buscar no Meli"}
            </button>
          )}
          {estado.erro && <span className="mt-1 block text-[12px] text-down">{estado.erro}</span>}
          <span className="mt-3 flex gap-2">
            {meli && (
              <button type="button" onClick={salvar} disabled={ler(valor) == null || estado.salvando} className="h-9 flex-1 rounded-r1 bg-brand text-[13px] font-medium text-brand-ink disabled:opacity-50">
                {estado.salvando ? "Salvando…" : "Salvar"}
              </button>
            )}
            <button type="button" onClick={usarAqui} disabled={ler(valor) == null} className="h-9 flex-1 rounded-r1 border border-line text-[13px] disabled:opacity-50">
              Só simular
            </button>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="h-9 w-9 rounded-r1 border border-line text-ink-3">×</button>
          </span>
        </span>
      )}
    </span>
  );
}

/* ── Preços ───────────────────────────────────────────────────────────── */

function Precos({ ctx, onCotar }: { ctx: Contexto; onCotar: (produtoId: string) => void }) {
  const { dados, canal } = ctx;
  const linhas = dados.produtos
    .filter((p) => p.custo != null || (p.porCanal[canal]?.unidades ?? 0) > 0)
    .map((p) => linhaDo(ctx, p));
  const ocultos = dados.produtos.length - linhas.length;

  /* Os números de topo: o realizado do canal na janela, com o Ads medido. */
  let vendido = 0, recebido = 0, custoVendido = 0, semCusto = 0, semImposto = false;
  for (const l of linhas) {
    const v = l.p.porCanal[canal];
    if (!v?.unidadesComRecebido) continue;
    vendido += v.vendidoComRecebido;
    recebido += v.recebido;
    if (l.custoTotal == null) { semCusto += v.unidadesComRecebido; continue; }
    const imp = ctx.impostoGlobal ?? l.p.impostoPct;
    if (imp == null) semImposto = true;
    custoVendido += l.custoTotal * v.unidadesComRecebido + v.vendidoComRecebido * (((imp ?? 0) + (l.adsReal ?? 0)) / 100);
  }
  const contrib = recebido - custoVendido;
  const k = (l: Linha) => canal + l.p.id;

  return (
    <>
      {vendido > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            className="col-span-2"
            label={`Margem de contribuição${semImposto ? " · sem imposto" : ""}${semCusto ? " · com produto sem custo" : ""}`}
            value={money(contrib)}
            hint={`${pct((contrib / vendido) * 100)} do vendido · Ads medido`}
          />
          <StatTile label="Vendido" value={money(vendido)} hint={`${dados.de.slice(8)}/${dados.de.slice(5, 7)} a ${dados.ate.slice(8)}/${dados.ate.slice(5, 7)}`} />
          <StatTile label="Recebido" value={money(recebido)} hint={`${pct((recebido / vendido) * 100)} do vendido · do canal`} />
        </div>
      ) : (
        <Panel className="px-4 py-4">
          <p className="text-[18px] font-semibold text-ink-2">Sem venda neste canal</p>
          <p className="text-[12.5px] text-ink-3">simulação pela tarifa do canal</p>
        </Panel>
      )}

      {linhas.length === 0 ? (
        <EmptyState title="Nenhum produto com custo" description="Cadastre o custo em Financeiro → Custos." />
      ) : (
        <Grade
          linhas={linhas}
          chave={(l) => l.p.id}
          linhaInteira={(l) =>
            l.custoTotal == null
              ? { aPartirDe: 1, motivo: <Link href="/financeiro/custos" className="underline">sem custo cadastrado</Link> }
              : null
          }
          colunas={[
            {
              id: "produto", titulo: "Produto", esq: true, valor: (l) => l.unidades,
              celula: (l) => (
                <span className="block max-w-[250px] whitespace-normal leading-tight">
                  <span className="font-medium text-ink">{l.p.titulo}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-3">
                    {l.p.sku}
                    <button type="button" onClick={() => onCotar(l.p.id)} className="font-medium text-brand">cotar</button>
                  </span>
                </span>
              ),
            },
            { id: "custo", titulo: "Custo", valor: (l) => l.custoTotal, celula: (l) => <Moeda v={l.custoTotal} /> },
            { id: "vitrine", titulo: "Vitrine", valor: (l) => l.vitrine, celula: (l) => (l.vitrine == null ? <span className="text-[12.5px] text-ink-3">sem anúncio</span> : <Moeda v={l.vitrine} />) },
            {
              id: "vendido", titulo: "Vendido a", valor: (l) => l.vendidoUn,
              celula: (l) =>
                l.vendidoUn == null ? (
                  <span className="text-[12.5px] text-ink-3">{l.unidades ? "sem recebido" : "sem venda"}</span>
                ) : (
                  <span className="leading-tight">
                    <Moeda v={l.vendidoUn} />
                    <span className="block text-[11.5px] text-ink-3">{l.unidades} un. · recebe {money(l.recebeUn ?? 0)}</span>
                  </span>
                ),
            },
            {
              id: "margem", titulo: "Margem real", valor: (l) => l.margemReal,
              celula: (l) =>
                l.margemReal == null ? <span className="text-ink-3">—</span> : (
                  <span className="leading-tight">
                    <span className={cn("num font-semibold", tom(l.margemReal))}>{pct(l.margemReal)}</span>
                    <span className="block text-[11.5px] text-ink-3">Ads {pct(l.adsReal ?? 0)}</span>
                  </span>
                ),
            },
            { id: "frete", titulo: "Frete", valor: (l) => l.frete.valor, celula: (l) => <CampoFrete ctx={ctx} linha={l} /> },
            {
              id: "preco", titulo: `Preço p/ ${ctx.metaPct}%`, valor: (l) => l.preco,
              celula: (l) =>
                l.preco != null ? <Moeda v={l.preco} className="font-semibold text-brand" />
                : <span className="text-[12.5px] text-ink-3">{l.frete.valor == null ? "falta frete" : "não fecha"}</span>,
            },
            {
              id: "simular", titulo: "Simular preço", valor: (l) => l.precoSim,
              celula: (l) => (
                <Input
                  aria-label={`Preço simulado de ${l.p.titulo}`}
                  type="number" inputMode="decimal" className="w-24"
                  value={ctx.sim[k(l)]?.preco ?? (l.precoSim != null ? l.precoSim.toFixed(2) : "")}
                  onChange={(e) => ctx.setSim({ ...ctx.sim, [k(l)]: { ...ctx.sim[k(l)], preco: e.target.value } })}
                />
              ),
            },
            {
              id: "resultado", titulo: "Margem simulada", valor: (l) => l.sim?.margemPct ?? null,
              celula: (l) =>
                l.sim == null ? <span className="text-ink-3">—</span> : (
                  <span className="leading-tight">
                    <span className={cn("num font-semibold", tom(l.sim.margemPct))}>{pct(l.sim.margemPct)}</span>
                    <span className="block text-[11.5px] text-ink-3">lucro {money(l.sim.margem)} · recebe {money(l.sim.recebe)}</span>
                  </span>
                ),
            },
          ]}
        />
      )}
      {ocultos > 0 && <p className="text-[12px] text-ink-3">{ocultos} produtos sem custo e sem venda no canal ficaram de fora</p>}
    </>
  );
}

/* ── Cotação de produto novo ──────────────────────────────────────────── */

type AjusteCanal = { tipo: string; comissao: string; frete: string; logistica: Logistica; testar: string };

function Cotacao({ dados, produtoId, onProduto, impostoGlobal, metaPct, marketingPct }: {
  dados: DadosPrecificacao; produtoId: string | null; onProduto: (id: string | null) => void;
  impostoGlobal: number | null; metaPct: number; marketingPct: number;
}) {
  /* Escolher um produto preenche custo, peso e medidas, e o frete do Meli que
     já se conhece dele (medido nas vendas ou salvo). Daí é só variar. */
  const produto = dados.produtos.find((p) => p.id === produtoId) ?? null;
  const txt = (x: number | null | undefined) => (x == null ? "" : String(x));
  const [f, setF] = React.useState({
    custo: txt(produto?.custo), embalagem: txt(produto?.embalagem), peso: txt(produto?.pesoKg),
    altura: txt(produto?.medidas?.altura), largura: txt(produto?.medidas?.largura), comprimento: txt(produto?.medidas?.comprimento),
  });
  const freteConhecido = (() => {
    const v = produto?.porCanal.mercado_livre;
    if (v?.unidadesComRecebido) return v.freteVendedor / v.unidadesComRecebido;
    return produto?.freteSalvo ?? null;
  })();
  const [ajustes, setAjustes] = React.useState<Record<string, AjusteCanal>>((): Record<string, AjusteCanal> =>
    freteConhecido == null ? {} : { mercado_livre: { tipo: "classico", comissao: "", frete: freteConhecido.toFixed(2), logistica: "coleta", testar: txt(produto?.porCanal.mercado_livre?.vitrine) } }
  );
  const [api, setApi] = React.useState<{ valor: number | null; erro?: string; carregando?: boolean; chave?: string }>({ valor: null });
  const v = Object.fromEntries(Object.entries(f).map(([k, s]) => [k, ler(s)])) as Record<keyof typeof f, number | null>;
  const cubico = v.altura && v.largura && v.comprimento ? (v.altura * v.largura * v.comprimento) / 6000 : null;
  const cobrado = v.peso != null || cubico != null ? Math.max(v.peso ?? 0, cubico ?? 0) : null;
  const medidasProntas = Boolean(v.peso && v.altura && v.largura && v.comprimento);

  const ajuste = (codigo: string): AjusteCanal =>
    ajustes[codigo] ?? { tipo: regraDoCanal(codigo)!.tipos[0].id, comissao: "", frete: "", logistica: "coleta", testar: "" };
  const mudar = (codigo: string, parte: Partial<AjusteCanal>) => setAjustes({ ...ajustes, [codigo]: { ...ajuste(codigo), ...parte } });
  const chaveApi = [v.altura, v.largura, v.comprimento, v.peso, ajuste("mercado_livre").tipo].join("|");
  const custoBase = { mercadoria: v.custo ?? 0, embalagem: v.embalagem ?? 0, impostoPct: impostoGlobal ?? 0, marketingPct };

  /* Uma conta por canal. No Meli o custo de envio depende do preço e o preço
     do custo: resolve em poucas voltas, até o preço parar de mudar. */
  const contaDoCanal = (codigo: string) => {
    const regraBase = regraDoCanal(codigo)!;
    const a = ajuste(codigo);
    const efetiva = regraEfetiva(regraBase, a.tipo, ler(a.comissao));
    const freteManual = ler(a.frete);

    const montar = (preco: number | null): { regra: RegraCanal; frete: number | null; origem: string } => {
      if (regraBase.frete === "incluso") return { regra: efetiva, frete: freteManual ?? 0, origem: freteManual != null ? "manual" : "na tarifa" };
      const est = preco != null ? custoMeliEstimado(preco, cobrado, a.logistica) : null;
      const taxaFixa = est?.taxaFixa ?? 0;
      const regra = taxaFixa ? { ...efetiva, faixas: efetiva.faixas.map((x) => ({ ...x, taxaFixa: x.taxaFixa + taxaFixa })) } : efetiva;
      if (freteManual != null) return { regra, frete: freteManual, origem: "manual" };
      if (a.logistica === "coleta" && api.valor != null && api.chave === chaveApi) return { regra, frete: api.valor, origem: "da API" };
      if (est) return { regra, frete: est.frete, origem: a.logistica === "flex" ? "seu frete" : "estimado" };
      return { regra, frete: null, origem: "cotar" };
    };

    let m = montar(null);
    let preco: number | null = null;
    if (v.custo != null) {
      for (let i = 0; i < 4; i++) {
        const tentativa = precoNoCanal(m.regra, { ...custoBase, frete: m.frete ?? 0 }, metaPct);
        if (!tentativa.ok) { preco = null; break; }
        const proximo = montar(tentativa.preco);
        const estavel = proximo.frete === m.frete && proximo.regra.faixas[0].taxaFixa === m.regra.faixas[0].taxaFixa;
        m = proximo;
        preco = tentativa.preco;
        if (estavel) break;
      }
    }
    const ok = preco != null && m.frete != null;
    const conta = ok ? contaNoCanal(m.regra, { ...custoBase, frete: m.frete! }, preco!) : null;
    const precoTeste = ler(a.testar);
    let teste: ReturnType<typeof contaNoCanal> | null = null;
    if (precoTeste && v.custo != null) {
      const mt = montar(precoTeste);
      if (mt.frete != null) teste = contaNoCanal(mt.regra, { ...custoBase, frete: mt.frete }, precoTeste);
    }
    return { a, regraBase, efetiva, preco: ok ? preco : null, conta, frete: m.frete, origem: m.origem, teste };
  };

  const meli = contaDoCanal("mercado_livre");

  /* A cotação do Meli pede preço: usa o testado, senão o que a conta achou,
     senão o preço sem frete. A faixa de frete muda devagar com o preço. */
  const cotar = async () => {
    const semFrete = precoNoCanal(regraEfetiva(regraDoCanal("mercado_livre")!, ajuste("mercado_livre").tipo), { ...custoBase, frete: 0 }, metaPct);
    const preco = ler(ajuste("mercado_livre").testar) ?? meli.preco ?? (semFrete.ok ? semFrete.preco : null);
    if (!medidasProntas || !dados.contaMeli || preco == null) return;
    setApi({ valor: null, carregando: true });
    const q = new URLSearchParams({
      conta: dados.contaMeli, altura: String(v.altura), largura: String(v.largura), comprimento: String(v.comprimento),
      peso: String(v.peso), preco: String(preco), tipo: ajuste("mercado_livre").tipo,
    });
    try {
      const r = await fetch(`/api/precificacao/frete?${q}`);
      const j = await r.json();
      setApi(r.ok ? { valor: j.frete, chave: chaveApi, erro: j.frete == null ? "o Meli não devolveu custo" : undefined } : { valor: null, erro: j.erro });
    } catch {
      setApi({ valor: null, erro: "sem conexão" });
    }
  };

  const campo = (k: keyof typeof f, rotulo: string) => (
    <Field label={rotulo}>
      <Input type="number" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  );

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <Field label="Produto" className="mb-3 max-w-[480px]">
          <Select value={produtoId ?? ""} onChange={(e) => onProduto(e.target.value || null)}>
            <option value="">Produto novo</option>
            {dados.produtos.filter((p) => p.custo != null).map((p) => (
              <option key={p.id} value={p.id}>{p.titulo} · {p.sku}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {campo("custo", "Custo (R$)")}
          {campo("embalagem", "Embalagem (R$)")}
          {campo("peso", "Peso (kg)")}
          {campo("altura", "Altura (cm)")}
          {campo("largura", "Largura (cm)")}
          {campo("comprimento", "Comprimento (cm)")}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {cobrado != null && (
            <span className="text-[12.5px] text-ink-3">
              Peso cobrado <b className="num text-ink">{cobrado.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg</b>{" "}
              {cubico != null && cubico > (v.peso ?? 0) ? "(cúbico)" : "(real)"}
            </span>
          )}
          <button
            type="button"
            onClick={cotar}
            disabled={!medidasProntas || !dados.contaMeli || v.custo == null || api.carregando}
            className="h-10 rounded-r2 bg-brand px-4 text-[13.5px] font-medium text-brand-ink disabled:opacity-50"
          >
            {api.carregando ? "Cotando…" : "Cotar frete no Mercado Livre"}
          </button>
          {!dados.contaMeli && <span className="text-[12px] text-ink-3">sem conta do Mercado Livre conectada</span>}
          {api.erro && <span className="text-[12px] text-down">{api.erro}</span>}
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {dados.canais.map((c) => {
          const r = c.codigo === "mercado_livre" ? meli : contaDoCanal(c.codigo);
          const faixaCat = r.efetiva.tipos[0].faixaCategoria;
          const comissaoPadrao = r.efetiva.tipos[0].faixas[0].comissaoPct;
          const comissaoDigitada = ler(r.a.comissao);
          const foraDaFaixa = comissaoDigitada != null && faixaCat != null && (comissaoDigitada < faixaCat[0] || comissaoDigitada > faixaCat[1]);
          return (
            <Panel key={c.codigo} className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-semibold text-ink">{c.nome}</span>
                {r.regraBase.tipos.length > 1 && (
                  <Select value={r.a.tipo} onChange={(e) => mudar(c.codigo, { tipo: e.target.value })} className="h-9 w-auto text-[13px]">
                    {r.regraBase.tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </Select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {faixaCat ? (
                  <Field label={`Comissão % (${faixaCat[0]} a ${faixaCat[1]})`}>
                    <Input type="number" inputMode="decimal" value={r.a.comissao} placeholder={String(comissaoPadrao)} invalid={foraDaFaixa} onChange={(e) => mudar(c.codigo, { comissao: e.target.value })} />
                  </Field>
                ) : (
                  <Field label="Comissão">
                    <span className="num flex h-10 items-center text-[12.5px] text-ink-2">
                      {r.efetiva.faixas.map((x) => `${x.comissaoPct}% + ${money(x.taxaFixa)}`).join(" / ")}
                    </span>
                  </Field>
                )}
                <Field label={`Frete R$ · ${r.origem}`}>
                  <Input type="number" inputMode="decimal" value={r.a.frete} placeholder={r.frete != null ? r.frete.toFixed(2) : "cotar"} onChange={(e) => mudar(c.codigo, { frete: e.target.value })} />
                </Field>
                {c.codigo === "mercado_livre" && (
                  <Field label="Envio" className="col-span-2">
                    <Segmented
                      options={[{ value: "coleta", label: "Coleta / Full" }, { value: "flex", label: "Flex / próprio" }]}
                      value={r.a.logistica}
                      onChange={(lg) => mudar(c.codigo, { logistica: lg as Logistica })}
                    />
                  </Field>
                )}
              </div>

              <div className="border-t border-line pt-3">
                <span className="text-[12px] text-ink-3">Preço para {metaPct}%</span>
                <div className="num text-[30px] font-semibold leading-tight text-brand">
                  {r.preco != null ? money(r.preco) : <span className="text-[15px] font-normal text-ink-3">{v.custo == null ? "informe o custo" : r.frete == null ? "cotar o frete" : "não fecha"}</span>}
                </div>
                {r.conta && (
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
                    <dt className="text-ink-3">Comissão</dt><dd className="num text-right">{money(r.conta.comissao)}</dd>
                    {r.conta.taxaFixa > 0 && (<><dt className="text-ink-3">Taxa fixa</dt><dd className="num text-right">{money(r.conta.taxaFixa)}</dd></>)}
                    <dt className="text-ink-3">Frete</dt><dd className="num text-right">{money(r.conta.frete)}</dd>
                    <dt className="text-ink-3">Recebe</dt><dd className="num text-right font-medium">{money(r.conta.recebe)}</dd>
                    <dt className="text-ink-3">Lucro/un.</dt><dd className="num text-right font-medium">{money(r.conta.margem)}</dd>
                  </dl>
                )}
              </div>

              <div className="flex items-end gap-2 border-t border-line pt-3">
                <Field label="Testar preço" className="w-28">
                  <Input type="number" inputMode="decimal" value={r.a.testar} onChange={(e) => mudar(c.codigo, { testar: e.target.value })} />
                </Field>
                {r.teste && (
                  <span className="pb-2 text-[13px]">
                    <span className={cn("num font-semibold", tom(r.teste.margemPct))}>{pct(r.teste.margemPct)}</span>
                    <span className="text-ink-3"> · lucro </span>
                    <span className="num">{money(r.teste.margem)}</span>
                  </span>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

/* ── Contribuição de um mix ───────────────────────────────────────────── */

function Contribuicao({ ctx }: { ctx: Contexto }) {
  const { dados, canal } = ctx;
  const produtos = dados.produtos.filter((p) => p.custo != null);
  const [qtd, setQtd] = React.useState<Record<string, number>>({});

  /* Preço e frete vêm da mesma simulação da aba Preços: mudar lá muda aqui. */
  const linhas = produtos.map((p) => {
    const l = linhaDo(ctx, p);
    const k = canal + p.id;
    const v = p.porCanal[canal];
    const q = qtd[k] ?? v?.unidades ?? 0;
    return { l, k, q, lucro: l.sim ? l.sim.margem * q : null, vendido: l.sim && l.precoSim ? l.precoSim * q : 0 };
  });
  const T = linhas.reduce((a, x) => ({ vendido: a.vendido + x.vendido, lucro: a.lucro + (x.lucro ?? 0), un: a.un + (x.l.sim ? x.q : 0) }), { vendido: 0, lucro: 0, un: 0 });

  /* Realizado: o recebido que o canal informou, com o Ads medido. */
  let rVend = 0, rLucro = 0;
  for (const p of produtos) {
    const v = p.porCanal[canal];
    if (!v?.unidadesComRecebido) continue;
    rVend += v.vendidoComRecebido;
    rLucro += v.recebido - (p.custo! + (p.embalagem ?? 0)) * v.unidadesComRecebido - v.vendidoComRecebido * (((ctx.impostoGlobal ?? p.impostoPct ?? 0) + (adsMedido(p, canal) ?? 0)) / 100);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile className="col-span-2" label={`Contribuição estimada · Ads ${pct(ctx.adsPct)}`} value={money(T.lucro)} hint={T.vendido ? `${pct((T.lucro / T.vendido) * 100)} de ${money(T.vendido)} · ${T.un} un.` : "escolha as quantidades"} />
        <StatTile label="Realizado 30 dias" value={rVend ? money(rLucro) : "—"} hint={rVend ? `${pct((rLucro / rVend) * 100)} de ${money(rVend)} · Ads medido` : "sem venda no canal"} />
      </div>
      <Grade
        linhas={linhas}
        chave={(x) => x.k}
        linhaInteira={(x) => (x.l.frete.valor == null ? { aPartirDe: 1, motivo: "falta o frete — cote na aba Preços" } : null)}
        colunas={[
          { id: "produto", titulo: "Produto", esq: true, valor: (x) => x.q, celula: (x) => <span className="block max-w-[240px] whitespace-normal font-medium leading-tight">{x.l.p.titulo}</span> },
          {
            id: "qtd", titulo: "Quantidade", valor: (x) => x.q,
            celula: (x) => (
              <span className="inline-flex overflow-hidden rounded-r1 border border-line">
                <button type="button" aria-label="menos" className="h-10 w-10 bg-panel-2 text-ink-2" onClick={() => setQtd({ ...qtd, [x.k]: Math.max(0, x.q - 1) })}>−</button>
                <input aria-label="quantidade" inputMode="numeric" className="num h-10 w-14 bg-panel text-center" value={x.q} onChange={(e) => setQtd({ ...qtd, [x.k]: Math.max(0, parseInt(e.target.value) || 0) })} />
                <button type="button" aria-label="mais" className="h-10 w-10 bg-panel-2 text-ink-2" onClick={() => setQtd({ ...qtd, [x.k]: x.q + 1 })}>+</button>
              </span>
            ),
          },
          {
            id: "preco", titulo: "Preço", valor: (x) => x.l.precoSim,
            celula: (x) => (
              <Input aria-label="preço" type="number" inputMode="decimal" className="w-24"
                value={ctx.sim[x.k]?.preco ?? (x.l.precoSim != null ? x.l.precoSim.toFixed(2) : "")}
                onChange={(e) => ctx.setSim({ ...ctx.sim, [x.k]: { ...ctx.sim[x.k], preco: e.target.value } })} />
            ),
          },
          { id: "lucroun", titulo: "Lucro/un.", valor: (x) => x.l.sim?.margem ?? null, celula: (x) => <Moeda v={x.l.sim?.margem} className={tom(x.l.sim?.margemPct ?? null)} /> },
          { id: "vendido", titulo: "Vendido", valor: (x) => x.vendido, celula: (x) => <Moeda v={x.vendido} /> },
          { id: "contrib", titulo: "Contribuição", valor: (x) => x.lucro, celula: (x) => <Moeda v={x.lucro} className="font-semibold" /> },
        ]}
      />
    </>
  );
}
