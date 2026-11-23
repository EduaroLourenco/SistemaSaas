"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Segmented, Input, Field } from "@/components/ui/controls";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { lerOferta, recebeNaFaixa } from "@/lib/planilhas/faixa-comissao";
import type { LinhaFaixas, TabelaFaixas } from "@/lib/dados/tabela-faixas";

/**
 * Fórmula base do Meli em duas leituras: o preço por faixa de comissão e o
 * que sobra em cada uma. Em cima, o preço final e o "Você recebe" da Central
 * de Promoções dizem a faixa e se a oferta fica dentro do mínimo.
 */

const pc = (f: number) => `${(f * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const data = (iso: string) => iso.split("-").reverse().join("/");
const ler = (s: string) => {
  const v = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
};
const minimoDe = (t: number, tol: number) => Math.round(t * (1 - tol) * 100) / 100;

function variacao(l: LinhaFaixas, faixas: number[]) {
  const agora = l.precos[faixas.indexOf(l.cheia)];
  return l.antes && agora ? agora / l.antes - 1 : null;
}

type Ordem = { col: "nome" | "var" | number; dir: 1 | -1 };

export default function FaixasCliente({ dados, empresa }: { dados: TabelaFaixas | null; empresa: string | null }) {
  const [sel, setSel] = React.useState<LinhaFaixas | null>(null);
  const [busca1, setBusca1] = React.useState("");
  const [preco, setPreco] = React.useState("");
  const [recebe, setRecebe] = React.useState("");
  const [leitura, setLeitura] = React.useState<"preco" | "recebe">("preco");
  const [escopo, setEscopo] = React.useState<"anuncio" | "todos">("anuncio");
  const [busca, setBusca] = React.useState("");
  const [ordem, setOrdem] = React.useState<Ordem>({ col: "var", dir: -1 });

  const linhas = React.useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    const val = (l: LinhaFaixas): number | null => {
      if (ordem.col === "var") return variacao(l, dados.faixas);
      if (ordem.col === "nome") return null;
      const v = l.precos[ordem.col];
      return v == null ? null : leitura === "preco" ? v : recebeNaFaixa(v, dados.faixas[ordem.col]);
    };
    return dados.linhas
      .filter((l) => (escopo === "todos" || l.mlbs.length > 0) && (!q || l.chave.toLowerCase().includes(q) || (l.titulo ?? "").toLowerCase().includes(q)))
      .sort((a, b) =>
        ordem.col === "nome"
          ? (a.titulo ?? a.chave).localeCompare(b.titulo ?? b.chave) * ordem.dir
          : ((val(a) ?? -Infinity) - (val(b) ?? -Infinity)) * ordem.dir
      );
  }, [dados, busca, escopo, ordem, leitura]);

  if (!dados) {
    return (
      <>
        <PageHeader title="Tabela por faixa" />
        <PageBody><EmptyState title={empresa ? "Sem Fórmula base cadastrada" : "Nenhuma empresa selecionada"} /></PageBody>
      </>
    );
  }

  const p = ler(preco);
  const r = ler(recebe);
  const leituraOferta = sel && p ? lerOferta(Object.fromEntries(dados.faixas.map((f, i) => [f, sel.precos[i]]).filter(([, v]) => v != null)), p, r, sel.cheia, dados.tolerancia) : null;

  const escolher = (l: LinhaFaixas) => {
    setSel(l);
    setBusca1(l.chave);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const ordenar = (col: Ordem["col"]) => setOrdem((o) => ({ col, dir: o.col === col && o.dir === -1 ? 1 : -1 }));
  const seta = (col: Ordem["col"]) => (ordem.col === col ? (ordem.dir === -1 ? " ↓" : " ↑") : "");

  return (
    <>
      <PageHeader title="Tabela por faixa" badge={<Badge>{`Fórmula base de ${data(dados.vigenteDe)}`}</Badge>} />
      <PageBody>
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-r2 border border-line bg-panel p-4">
            <Field label="Produto">
              <Input
                list="faixas-produtos"
                value={busca1}
                placeholder="SKU ou nome"
                className="h-11"
                onChange={(e) => {
                  setBusca1(e.target.value);
                  const l = dados.linhas.find((x) => x.chave === e.target.value.trim().toUpperCase());
                  if (l) setSel(l);
                }}
              />
            </Field>
            <datalist id="faixas-produtos">
              {dados.linhas.filter((l) => l.titulo).map((l) => <option key={l.chave} value={l.chave}>{l.titulo}</option>)}
            </datalist>
            {sel && (
              <p className="mt-3 font-semibold">
                {sel.titulo ?? sel.chave}
                <span className="block text-[12.5px] font-normal text-ink-3">
                  {sel.chave} · {sel.tipo ?? "sem anúncio"} {pc(sel.cheia)} · {sel.mlbs.length} anúncio{sel.mlbs.length === 1 ? "" : "s"}
                </span>
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Preço final">
                <Input inputMode="decimal" className="h-11" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="458,58" />
              </Field>
              <Field label="Você recebe">
                <Input inputMode="decimal" className="h-11" value={recebe} onChange={(e) => setRecebe(e.target.value)} placeholder="442,54" />
              </Field>
            </div>
            {!sel && <p className="mt-4 text-[13px] text-ink-3">Escolha um produto aqui ou na tabela.</p>}
            {sel && !p && r && <p className="mt-4 text-[13px] text-ink-3">Falta o preço final.</p>}
            {leituraOferta && (
              <>
                <div className="mt-4 flex flex-wrap items-baseline gap-3">
                  <b className="num text-[52px] font-semibold leading-none">{pc(leituraOferta.faixa)}</b>
                  {leituraOferta.minimo == null ? (
                    <Badge tone="down">sem preço nesta faixa</Badge>
                  ) : leituraOferta.dentro ? (
                    <Badge tone="up">Dentro</Badge>
                  ) : (
                    <Badge tone="down">{`Fora · faltam ${money(leituraOferta.minimo - p!)}`}</Badge>
                  )}
                </div>
                <p className="num mt-2 text-[13px] text-ink-2">
                  {leituraOferta.efetiva == null ? "alíquota cheia" : `comissão efetiva ${pc(leituraOferta.efetiva)}`}
                  {leituraOferta.tabela != null && ` · tabela ${money(leituraOferta.tabela)} · mínimo ${money(leituraOferta.minimo!)}`}
                  {r == null && ` · recebe ${money(leituraOferta.recebe)}`}
                </p>
              </>
            )}
          </div>

          {sel && (
            <div className="overflow-hidden rounded-r2 border border-line bg-panel">
              <table className="num w-full border-separate border-spacing-0 text-[13.5px]">
                <thead>
                  <tr className="text-[12px] text-ink-3">
                    {["Faixa", "Preço", "Você recebe", "Mínimo"].map((t, i) => (
                      <th key={t} scope="col" className={cn("border-b border-line bg-panel-2 px-3 py-2 font-medium", i ? "text-right" : "text-left")}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.faixas.map((f, i) => {
                    const t = sel.precos[i];
                    return (
                      <tr key={f} className={cn(leituraOferta?.faixa === f && "bg-brand-wash font-semibold")}>
                        <td className={cn("border-b border-line px-3 py-1.5", f === sel.cheia && "font-bold")}>
                          {pc(f)}{f === sel.cheia && <span className="ml-1 text-[12px] font-normal text-ink-3">cheia</span>}
                        </td>
                        <td className="border-b border-line px-3 py-1.5 text-right">{t == null ? "—" : money(t)}</td>
                        <td className="border-b border-line px-3 py-1.5 text-right">{t == null ? "—" : money(recebeNaFaixa(t, f))}</td>
                        <td className="border-b border-line px-3 py-1.5 text-right">{t == null ? "—" : money(minimoDe(t, dados.tolerancia))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar SKU ou nome" className="h-11 max-w-[320px]" />
          <Segmented options={[{ value: "preco", label: "Preço" }, { value: "recebe", label: "Você recebe" }]} value={leitura} onChange={setLeitura} />
          <Segmented options={[{ value: "anuncio", label: "Com anúncio" }, { value: "todos", label: "Todos" }]} value={escopo} onChange={setEscopo} />
        </div>

        <div className="max-h-[70vh] max-w-full overflow-auto rounded-r2 border border-line bg-panel" role="region" aria-label="Tabela por faixa de comissão" tabIndex={0}>
          <table className="num w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="text-[12px] text-ink-3">
                <th scope="col" className="sticky left-0 top-0 z-20 min-w-[150px] max-w-[150px] border-b border-line bg-panel-2 px-3 text-left font-medium md:min-w-[240px] md:max-w-[240px]">
                  <button type="button" className="min-h-11" onClick={() => ordenar("nome")}>Produto · {linhas.length}{seta("nome")}</button>
                </th>
                <th scope="col" className="sticky top-0 z-10 border-b border-line bg-panel-2 px-3 text-right font-medium whitespace-nowrap">
                  <button type="button" className="min-h-11" onClick={() => ordenar("var")}>{dados.anterior ? `vs ${data(dados.anterior).slice(0, 5)}` : "variação"}{seta("var")}</button>
                </th>
                {dados.faixas.map((f, i) => (
                  <th key={f} scope="col" className="sticky top-0 z-10 border-b border-line bg-panel-2 px-3 text-right font-medium whitespace-nowrap">
                    <button type="button" className="min-h-11" onClick={() => ordenar(i)}>{pc(f)}{seta(i)}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.slice(0, 400).map((l) => {
                const v = variacao(l, dados.faixas);
                const ativo = sel?.chave === l.chave;
                return (
                  <tr key={l.chave} onClick={() => escolher(l)} className="group cursor-pointer">
                    <td className={cn("sticky left-0 z-[1] min-w-[150px] max-w-[150px] border-b border-line px-3 py-2 font-sans md:min-w-[240px] md:max-w-[240px]", ativo ? "bg-brand-wash" : "bg-panel group-hover:bg-panel-2")}>
                      {l.titulo ?? <span className="text-ink-3">sem cadastro</span>}
                      <span className="block text-[12px] text-ink-3">{l.chave}</span>
                    </td>
                    <td className={cn("border-b border-line px-3 text-right whitespace-nowrap", ativo && "bg-brand-wash", v != null && v > 0.001 && "text-down", v != null && v < -0.001 && "text-up")}>
                      {v == null ? <span className="text-ink-3">{dados.anterior ? "nova" : "—"}</span> : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")}%`}
                    </td>
                    {dados.faixas.map((f, i) => {
                      const t = l.precos[i];
                      return (
                        <td key={f} className={cn("border-b border-line px-3 text-right whitespace-nowrap", ativo && "bg-brand-wash", f === l.cheia && "font-bold")}>
                          {t == null ? <span className="text-ink-3">—</span> : n2(leitura === "preco" ? t : recebeNaFaixa(t, f))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {linhas.length > 400 && <p className="px-3 py-2 text-[12.5px] text-ink-3">400 de {linhas.length} · use a busca</p>}
        </div>
      </PageBody>
    </>
  );
}
