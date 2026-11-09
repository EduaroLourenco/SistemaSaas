"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge, EmptyState } from "@/components/ui/primitives";
import { Tabs, Segmented, Input, Field } from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { regraDoCanal, contaNoCanal, precoNoCanal, type CustoProduto } from "@/lib/precificacao/regras-canal";
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

  if (!dados) {
    return (
      <>
        <PageHeader title="Precificação" />
        <PageBody><EmptyState title="Nenhuma empresa selecionada" /></PageBody>
      </>
    );
  }

  const regra = regraDoCanal(canal)!;
  const impostoGlobal = ler(imposto);
  const metaPct = ler(meta) ?? 0;
  const marketingPct = ler(tacos) ?? 0;

  const filtros = (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Imposto %" className="w-[120px]">
        <Input type="number" inputMode="decimal" value={imposto} onChange={(e) => setImposto(e.target.value)} placeholder="do produto" />
      </Field>
      <Field label="Margem desejada %" className="w-[140px]">
        <Input type="number" inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} />
      </Field>
      <Field label="Marketing (TACoS) %" className="w-[150px]">
        <Input type="number" inputMode="decimal" value={tacos} onChange={(e) => setTacos(e.target.value)} />
      </Field>
      <Field label="Canal" className="min-w-0">
        <Segmented options={dados.canais.map((c) => ({ value: c.codigo, label: c.nome }))} value={canal} onChange={setCanal} />
      </Field>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Precificação"
        badge={<Badge>{dados.empresa}</Badge>}
        filters={filtros}
        mobileFilters={false}
      />
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
        {aba === "precos" && (
          <Precos dados={dados} canal={canal} impostoGlobal={impostoGlobal} metaPct={metaPct} marketingPct={marketingPct} />
        )}
        {aba === "cotacao" && (
          <Cotacao dados={dados} impostoGlobal={impostoGlobal} metaPct={metaPct} marketingPct={marketingPct} />
        )}
        {aba === "contribuicao" && (
          <Contribuicao dados={dados} canal={canal} impostoGlobal={impostoGlobal} marketingPct={marketingPct} />
        )}
      </PageBody>
    </>
  );
}

/* ── A conta de um produto num canal ──────────────────────────────────── */

type Linha = {
  p: ProdutoPreco;
  custo: CustoProduto | null;
  semImposto: boolean;
  vitrine: number | null;
  unidades: number;
  vendidoUn: number | null;
  recebeUn: number | null;
  margemReal: number | null;
  frete: number | null;
  preco: number | null;
  lucroUn: number | null;
};

function linhaDo(p: ProdutoPreco, canal: string, impostoGlobal: number | null, metaPct: number, marketingPct: number): Linha {
  const regra = regraDoCanal(canal)!;
  const v = p.porCanal[canal];
  const impostoPct = p.impostoPct ?? impostoGlobal;
  const un = v?.unidadesComRecebido ?? 0;
  const vendidoUn = un ? v!.vendidoComRecebido / un : null;
  const recebeUn = un ? v!.recebido / un : null;
  /* Frete do vendedor: o que o canal cobrou nos pedidos. Canal com frete
     incluso na tarifa não tem esta parcela. Sem venda no Meli, falta medir. */
  const frete = regra.frete === "incluso" ? 0 : un ? v!.freteVendedor / un : null;

  const base = p.custo == null ? null : p.custo + (p.embalagem ?? 0);
  const custo: CustoProduto | null =
    base == null || frete == null
      ? null
      : { mercadoria: p.custo!, embalagem: p.embalagem ?? 0, frete, impostoPct: impostoPct ?? 0, marketingPct };

  const margemReal =
    base != null && vendidoUn && recebeUn != null
      ? ((recebeUn - base - vendidoUn * (((impostoPct ?? 0) + marketingPct) / 100)) / vendidoUn) * 100
      : null;

  const r = custo ? precoNoCanal(regra, custo, p.margemMinimaPct ?? metaPct) : null;
  const preco = r?.ok ? r.preco : null;
  return {
    p,
    custo,
    semImposto: impostoPct == null,
    vitrine: v?.vitrine ?? null,
    unidades: v?.unidades ?? 0,
    vendidoUn,
    recebeUn,
    margemReal,
    frete,
    preco,
    lucroUn: preco != null && custo ? contaNoCanal(regra, custo, preco).margem : null,
  };
}

/* ── Preços ───────────────────────────────────────────────────────────── */

function Precos({ dados, canal, impostoGlobal, metaPct, marketingPct }: {
  dados: DadosPrecificacao; canal: string; impostoGlobal: number | null; metaPct: number; marketingPct: number;
}) {
  const linhas = dados.produtos
    .filter((p) => p.custo != null || (p.porCanal[canal]?.unidades ?? 0) > 0)
    .map((p) => linhaDo(p, canal, impostoGlobal, metaPct, marketingPct));
  const ocultos = dados.produtos.length - linhas.length;

  /* Os números de topo: o realizado do canal na janela. */
  let vendido = 0, recebido = 0, custoVendido = 0, semCusto = 0, semImposto = false;
  for (const l of linhas) {
    const v = l.p.porCanal[canal];
    if (!v?.unidadesComRecebido) continue;
    vendido += v.vendidoComRecebido;
    recebido += v.recebido;
    if (l.p.custo == null) { semCusto += v.unidadesComRecebido; continue; }
    const imp = l.p.impostoPct ?? impostoGlobal;
    if (imp == null) semImposto = true;
    custoVendido += (l.p.custo + (l.p.embalagem ?? 0)) * v.unidadesComRecebido + v.vendidoComRecebido * (((imp ?? 0) + marketingPct) / 100);
  }
  const contrib = recebido - custoVendido;

  return (
    <>
      {vendido > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            className="col-span-2"
            label={`Margem de contribuição${semImposto ? " · sem imposto" : ""}${semCusto ? " · com produto sem custo" : ""}`}
            value={money(contrib)}
            hint={`${pct((contrib / vendido) * 100)} do vendido`}
          />
          <StatTile label="Vendido" value={money(vendido)} hint={`${dados.de.slice(8)}/${dados.de.slice(5, 7)} a ${dados.ate.slice(8)}/${dados.ate.slice(5, 7)}`} />
          <StatTile label="Recebido" value={money(recebido)} hint={`${pct((recebido / vendido) * 100)} do vendido · do canal`} />
        </div>
      ) : (
        <Panel className="px-4 py-5">
          <p className="text-[22px] font-semibold text-ink-3">Sem venda neste canal</p>
          <p className="text-[12.5px] text-ink-3">preço pela tabela do canal</p>
        </Panel>
      )}

      {linhas.length === 0 ? (
        <EmptyState title="Nenhum produto com custo" description="Cadastre o custo em Financeiro → Custos." />
      ) : (
        <Grade
          linhas={linhas}
          chave={(l) => l.p.id}
          linhaInteira={(l) =>
            l.p.custo == null
              ? { aPartirDe: 1, motivo: <Link href="/financeiro/custos" className="underline">sem custo cadastrado</Link> }
              : null
          }
          colunas={[
            {
              id: "produto", titulo: "Produto", esq: true, valor: (l) => l.unidades,
              celula: (l) => (
                <span className="block max-w-[260px] whitespace-normal leading-tight">
                  <span className="font-medium text-ink">{l.p.titulo}</span>
                  <span className="block text-[11.5px] text-ink-3">{l.p.sku}</span>
                </span>
              ),
            },
            { id: "custo", titulo: "Custo", valor: (l) => (l.p.custo == null ? null : l.p.custo + (l.p.embalagem ?? 0)), celula: (l) => <Moeda v={l.p.custo == null ? null : l.p.custo + (l.p.embalagem ?? 0)} /> },
            { id: "vitrine", titulo: "Vitrine", valor: (l) => l.vitrine, celula: (l) => (l.vitrine == null ? <span className="text-[12.5px] text-ink-3">sem anúncio</span> : <Moeda v={l.vitrine} />) },
            {
              id: "vendido", titulo: "Vendido a", valor: (l) => l.vendidoUn,
              celula: (l) =>
                l.vendidoUn == null ? (
                  <span className="text-[12.5px] text-ink-3">{l.unidades ? "sem recebido do canal" : "sem venda"}</span>
                ) : (
                  <span className="leading-tight">
                    <Moeda v={l.vendidoUn} />
                    <span className="block text-[11.5px] text-ink-3">{l.unidades} un.</span>
                  </span>
                ),
            },
            { id: "recebe", titulo: "Recebe", valor: (l) => l.recebeUn, celula: (l) => <Moeda v={l.recebeUn} /> },
            {
              id: "margem", titulo: "Margem", valor: (l) => l.margemReal,
              celula: (l) => (l.margemReal == null ? <span className="text-ink-3">—</span> : <span className={cn("num font-semibold", tom(l.margemReal))}>{pct(l.margemReal)}</span>),
            },
            {
              id: "preco", titulo: `Preço p/ ${metaPct}%`, valor: (l) => l.preco,
              celula: (l) =>
                l.preco != null ? <Moeda v={l.preco} className="font-semibold text-brand" />
                : l.frete == null ? <span className="text-[12.5px] text-ink-3">frete: cotar</span>
                : <span className="text-[12.5px] text-ink-3">não fecha</span>,
            },
            { id: "lucro", titulo: "Lucro/un.", valor: (l) => l.lucroUn, celula: (l) => <Moeda v={l.lucroUn} /> },
          ]}
        />
      )}
      {ocultos > 0 && <p className="text-[12px] text-ink-3">{ocultos} produtos sem custo e sem venda no canal ficaram de fora</p>}
    </>
  );
}

/* ── Cotação de produto novo ──────────────────────────────────────────── */

function Cotacao({ dados, impostoGlobal, metaPct, marketingPct }: {
  dados: DadosPrecificacao; impostoGlobal: number | null; metaPct: number; marketingPct: number;
}) {
  const [f, setF] = React.useState({ custo: "", embalagem: "", peso: "", altura: "", largura: "", comprimento: "" });
  const [freteMeli, setFreteMeli] = React.useState<{ valor: number | null; erro?: string; carregando?: boolean }>({ valor: null });
  const v = Object.fromEntries(Object.entries(f).map(([k, s]) => [k, ler(s)])) as Record<keyof typeof f, number | null>;
  const cubico = v.altura && v.largura && v.comprimento ? (v.altura * v.largura * v.comprimento) / 6000 : null;
  const cobrado = v.peso != null || cubico != null ? Math.max(v.peso ?? 0, cubico ?? 0) : null;
  const pronto = v.custo != null && v.peso && v.altura && v.largura && v.comprimento;

  const base = (frete: number): CustoProduto => ({
    mercadoria: v.custo ?? 0, embalagem: v.embalagem ?? 0, frete, impostoPct: impostoGlobal ?? 0, marketingPct,
  });

  /* O frete do Meli depende do preço, e o preço do frete: cota no preço sem
     frete, recalcula com o frete que voltou. Uma volta basta — a faixa de
     frete muda devagar com o preço. */
  const cotar = async () => {
    if (!pronto || !dados.contaMeli) return;
    const r0 = precoNoCanal(regraDoCanal("mercado_livre")!, base(0), metaPct);
    if (!r0.ok) return;
    setFreteMeli({ valor: null, carregando: true });
    const q = new URLSearchParams({
      conta: dados.contaMeli, altura: String(v.altura), largura: String(v.largura), comprimento: String(v.comprimento),
      peso: String(v.peso), preco: String(r0.preco),
    });
    try {
      const r = await fetch(`/api/precificacao/frete?${q}`);
      const j = await r.json();
      setFreteMeli(r.ok ? { valor: j.frete } : { valor: null, erro: j.erro });
    } catch {
      setFreteMeli({ valor: null, erro: "sem conexão" });
    }
  };

  const campo = (k: keyof typeof f, rotulo: string) => (
    <Field label={rotulo}>
      <Input type="number" inputMode="decimal" value={f[k]} onChange={(e) => { setF({ ...f, [k]: e.target.value }); setFreteMeli({ valor: null }); }} />
    </Field>
  );

  const linhas = dados.canais.map((c) => {
    const regra = regraDoCanal(c.codigo)!;
    const frete = regra.frete === "incluso" ? 0 : freteMeli.valor;
    const custo = v.custo != null && frete != null ? base(frete) : null;
    const r = custo ? precoNoCanal(regra, custo, metaPct) : null;
    const conta = r?.ok && custo ? contaNoCanal(regra, custo, r.preco) : null;
    return { c, regra, frete, preco: r?.ok ? r.preco : null, conta };
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Panel className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          {campo("custo", "Custo")}
          {campo("embalagem", "Embalagem")}
          {campo("peso", "Peso (kg)")}
          {campo("altura", "Altura (cm)")}
          {campo("largura", "Largura (cm)")}
          {campo("comprimento", "Comprimento (cm)")}
        </div>
        {cobrado != null && (
          <p className="text-[12.5px] text-ink-3">
            Peso cobrado <b className="num text-ink">{cobrado.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg</b>{" "}
            {cubico != null && cubico > (v.peso ?? 0) ? "(cúbico)" : "(real)"}
          </p>
        )}
        <button
          type="button"
          onClick={cotar}
          disabled={!pronto || !dados.contaMeli || freteMeli.carregando}
          className="h-11 w-full rounded-r2 bg-brand text-[14px] font-medium text-brand-ink disabled:opacity-50"
        >
          {freteMeli.carregando ? "Cotando…" : "Cotar frete no Mercado Livre"}
        </button>
        {!dados.contaMeli && <p className="text-[12px] text-ink-3">sem conta do Mercado Livre conectada</p>}
        {freteMeli.erro && <p className="text-[12px] text-down">{freteMeli.erro}</p>}
      </Panel>
      <Grade
        linhas={linhas}
        chave={(l) => l.c.codigo}
        colunas={[
          { id: "canal", titulo: "Canal", esq: true, valor: () => null, celula: (l) => <span className="font-medium">{l.c.nome}</span> },
          {
            id: "preco", titulo: `Preço p/ ${metaPct}%`, valor: (l) => l.preco,
            celula: (l) =>
              l.preco != null ? <Moeda v={l.preco} className="text-[15px] font-semibold text-brand" />
              : <span className="text-[12.5px] text-ink-3">{v.custo == null ? "informe o custo" : l.frete == null ? "cotar frete" : "não fecha"}</span>,
          },
          { id: "taxas", titulo: "Taxas", valor: (l) => (l.conta ? l.conta.comissao + l.conta.taxaFixa : null), celula: (l) => <Moeda v={l.conta ? l.conta.comissao + l.conta.taxaFixa : null} /> },
          {
            id: "frete", titulo: "Frete", valor: (l) => l.frete,
            celula: (l) => (l.regra.frete === "incluso" ? <span className="text-[12.5px] text-ink-3">na tarifa</span> : <Moeda v={l.frete} />),
          },
          { id: "recebe", titulo: "Recebe", valor: (l) => l.conta?.recebe ?? null, celula: (l) => <Moeda v={l.conta?.recebe} /> },
          { id: "lucro", titulo: "Lucro/un.", valor: (l) => l.conta?.margem ?? null, celula: (l) => <Moeda v={l.conta?.margem} /> },
        ]}
      />
    </div>
  );
}

/* ── Contribuição de um mix ───────────────────────────────────────────── */

function Contribuicao({ dados, canal, impostoGlobal, marketingPct }: {
  dados: DadosPrecificacao; canal: string; impostoGlobal: number | null; marketingPct: number;
}) {
  const regra = regraDoCanal(canal)!;
  const produtos = dados.produtos.filter((p) => p.custo != null);
  const [qtd, setQtd] = React.useState<Record<string, number>>({});
  const [precos, setPrecos] = React.useState<Record<string, string>>({});

  const linhas = produtos.map((p) => {
    const v = p.porCanal[canal];
    const k = canal + p.id;
    const un = v?.unidadesComRecebido ?? 0;
    const frete = regra.frete === "incluso" ? 0 : un ? v!.freteVendedor / un : null;
    const custo: CustoProduto | null =
      frete == null ? null : { mercadoria: p.custo!, embalagem: p.embalagem ?? 0, frete, impostoPct: p.impostoPct ?? impostoGlobal ?? 0, marketingPct };
    const sugerido = un ? v!.vendidoComRecebido / un : v?.vitrine ?? null;
    const preco = ler(precos[k] ?? "") ?? sugerido;
    const q = qtd[k] ?? v?.unidades ?? 0;
    const conta = custo && preco ? contaNoCanal(regra, custo, preco) : null;
    return { p, k, q, preco, conta, lucro: conta ? conta.margem * q : null, vendido: preco ? preco * q : 0, frete };
  });
  const T = linhas.reduce((a, l) => ({ vendido: a.vendido + (l.conta ? l.vendido : 0), lucro: a.lucro + (l.lucro ?? 0), un: a.un + (l.conta ? l.q : 0) }), { vendido: 0, lucro: 0, un: 0 });

  /* Realizado: o mesmo cálculo, com o recebido que o canal informou. */
  let rVend = 0, rLucro = 0;
  for (const p of produtos) {
    const v = p.porCanal[canal];
    if (!v?.unidadesComRecebido) continue;
    rVend += v.vendidoComRecebido;
    rLucro += v.recebido - (p.custo! + (p.embalagem ?? 0)) * v.unidadesComRecebido - v.vendidoComRecebido * (((p.impostoPct ?? impostoGlobal ?? 0) + marketingPct) / 100);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile className="col-span-2" label="Contribuição estimada" value={money(T.lucro)} hint={T.vendido ? `${pct((T.lucro / T.vendido) * 100)} de ${money(T.vendido)} · ${T.un} un.` : "escolha as quantidades"} />
        <StatTile label="Realizado 30 dias" value={rVend ? money(rLucro) : "—"} hint={rVend ? `${pct((rLucro / rVend) * 100)} de ${money(rVend)}` : "sem venda no canal"} />
      </div>
      <Grade
        linhas={linhas}
        chave={(l) => l.k}
        linhaInteira={(l) => (l.frete == null ? { aPartirDe: 1, motivo: "sem frete medido neste canal — cote na aba Cotação" } : null)}
        colunas={[
          { id: "produto", titulo: "Produto", esq: true, valor: (l) => l.q, celula: (l) => <span className="block max-w-[240px] whitespace-normal font-medium leading-tight">{l.p.titulo}</span> },
          {
            id: "qtd", titulo: "Quantidade", valor: (l) => l.q,
            celula: (l) => (
              <span className="inline-flex overflow-hidden rounded-r1 border border-line">
                <button type="button" aria-label="menos" className="h-10 w-10 bg-panel-2 text-ink-2" onClick={() => setQtd({ ...qtd, [l.k]: Math.max(0, l.q - 1) })}>−</button>
                <input aria-label="quantidade" inputMode="numeric" className="num h-10 w-14 bg-panel text-center" value={l.q} onChange={(e) => setQtd({ ...qtd, [l.k]: Math.max(0, parseInt(e.target.value) || 0) })} />
                <button type="button" aria-label="mais" className="h-10 w-10 bg-panel-2 text-ink-2" onClick={() => setQtd({ ...qtd, [l.k]: l.q + 1 })}>+</button>
              </span>
            ),
          },
          {
            id: "preco", titulo: "Preço", valor: (l) => l.preco,
            celula: (l) => (
              <Input aria-label="preço" inputMode="decimal" className="w-24" value={precos[l.k] ?? (l.preco != null ? l.preco.toFixed(2).replace(".", ",") : "")} onChange={(e) => setPrecos({ ...precos, [l.k]: e.target.value })} />
            ),
          },
          { id: "lucroun", titulo: "Lucro/un.", valor: (l) => l.conta?.margem ?? null, celula: (l) => <Moeda v={l.conta?.margem} className={tom(l.conta?.margemPct ?? null)} /> },
          { id: "vendido", titulo: "Vendido", valor: (l) => l.vendido, celula: (l) => <Moeda v={l.vendido} /> },
          { id: "contrib", titulo: "Contribuição", valor: (l) => l.lucro, celula: (l) => <Moeda v={l.lucro} className="font-semibold" /> },
        ]}
      />
    </>
  );
}
