"use client";

import * as React from "react";
import { Check, PackageCheck, Printer, RotateCcw, Tag } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { count } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EnvioMeli } from "@/lib/dados/envios-meli";
import { entraNaSeparacao, montarSeparacao, type RecorteSeparacao } from "@/lib/envios/separacao";

const RECORTES: { id: RecorteSeparacao; nome: string }[] = [
  { id: "hoje", nome: "Até hoje" },
  { id: "amanha", nome: "Até amanhã" },
  { id: "todos", nome: "Todos" },
];

const prazo = (d: number | null) =>
  d == null ? "sem prazo" : d < 0 ? `atrasado ${-d}d` : d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`;

const plural = (n: number, um: string, varios: string) => `${count(n)} ${n === 1 ? um : varios}`;

function Marca({ feito }: { feito: boolean }) {
  return <span className={cn("sep-check", feito && "is-done")} aria-hidden="true">{feito && <Check size={18} strokeWidth={3} />}</span>;
}

export function Separador({ envios, chaveLocal, aoGerarEtiquetas }: { envios: EnvioMeli[]; chaveLocal: string; aoGerarEtiquetas?: (envios: number[]) => void }) {
  const [escolhido, setRecorte] = React.useState<RecorteSeparacao | null>(null);
  const [etapa, setEtapa] = React.useState<"pegar" | "montar">("pegar");
  const [feitos, setFeitos] = React.useState<Set<string>>(new Set());

  /* Marcação é de quem está separando, neste aparelho e neste dia. */
  React.useEffect(() => {
    try {
      setFeitos(new Set(JSON.parse(localStorage.getItem(chaveLocal) ?? "[]") as string[]));
    } catch {
      setFeitos(new Set());
    }
  }, [chaveLocal]);

  const gravar = (novos: Set<string>) => {
    setFeitos(novos);
    try { localStorage.setItem(chaveLocal, JSON.stringify([...novos])); } catch {}
  };
  const alternar = (chave: string) => {
    const novos = new Set(feitos);
    if (novos.has(chave)) novos.delete(chave); else novos.add(chave);
    gravar(novos);
  };

  const porRecorte = React.useMemo(
    () => Object.fromEntries(RECORTES.map((r) => [r.id, montarSeparacao(envios.filter((e) => entraNaSeparacao(e, r.id)))])) as Record<RecorteSeparacao, ReturnType<typeof montarSeparacao>>,
    [envios],
  );
  /* Abre no prazo mais próximo que tem o que separar. */
  const recorte = escolhido ?? RECORTES.find((r) => porRecorte[r.id].pedidos > 0)?.id ?? "hoje";
  const s = porRecorte[recorte];

  /* A quantidade entra na chave: pedido novo do produto reabre a marcação. */
  const marcaProduto = (p: (typeof s.produtos)[number]) => `pegar:${p.chave}:${p.unidades}`;
  const marcaPedido = (id: string, grupo: string) => `montar:${id}:${grupo}`;
  const pegos = s.produtos.filter((p) => feitos.has(marcaProduto(p))).length;
  const montados = s.grupos.reduce((t, g) => t + g.pedidos.filter((p) => feitos.has(marcaPedido(p.id, g.chave))).length, 0);
  const enviosMontados = [...new Set(s.grupos.flatMap((g) => g.pedidos.filter((p) => feitos.has(marcaPedido(p.id, g.chave))).flatMap((p) => p.envios)))];
  const feito = etapa === "pegar" ? pegos : montados;
  const total = etapa === "pegar" ? s.produtos.length : s.pedidos;

  return (
    <section className="sep" aria-label="Separador de produtos">
      <div className="sep-ranges sep-no-print" role="group" aria-label="Pedidos a separar">
        {RECORTES.map((r) => (
          <button key={r.id} type="button" aria-pressed={recorte === r.id} onClick={() => setRecorte(r.id)}>
            <span>{r.nome}</span><strong className="num">{count(porRecorte[r.id].unidades)}</strong>
          </button>
        ))}
      </div>

      {s.pedidos === 0 ? (
        <div className="sep-empty"><PackageCheck size={28} aria-hidden="true" /><h2>Nada para separar neste prazo</h2></div>
      ) : (
        <div className="sep-print">
          <div className="sep-hero">
            <div><strong className="num">{count(s.unidades)}</strong><span>{s.unidades === 1 ? "unidade" : "unidades"}</span></div>
            <p>{plural(s.produtos.length, "produto", "produtos")} · {plural(s.pedidos, "pedido", "pedidos")}</p>
          </div>

          <div className="sep-bar sep-no-print">
            <div className="sep-steps" role="group" aria-label="Etapa da separação">
              <button type="button" aria-pressed={etapa === "pegar"} onClick={() => setEtapa("pegar")}>1. Pegar <span className="num">{pegos}/{s.produtos.length}</span></button>
              <button type="button" aria-pressed={etapa === "montar"} onClick={() => setEtapa("montar")}>2. Montar <span className="num">{montados}/{s.pedidos}</span></button>
            </div>
            <div className="sep-tools">
              {etapa === "montar" && montados > 0 && aoGerarEtiquetas && <Button variant="primary" disabled={!enviosMontados.length} onClick={() => aoGerarEtiquetas(enviosMontados)}><Tag size={16} aria-hidden="true" />Etiquetas dos montados <span className="num">({montados})</span></Button>}
              <Button className="hidden md:inline-flex" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Imprimir</Button>
              {feitos.size > 0 && <Button variant="ghost" onClick={() => gravar(new Set())}><RotateCcw size={16} aria-hidden="true" />Limpar</Button>}
            </div>
            <div className="sep-progress" role="progressbar" aria-label="Progresso da etapa" aria-valuemin={0} aria-valuemax={total} aria-valuenow={feito}><span style={{ width: `${total ? (feito / total) * 100 : 0}%` }} /></div>
          </div>

          {etapa === "pegar" ? (
            <ol className="sep-list">
              {s.produtos.map((p) => {
                const marca = marcaProduto(p), ok = feitos.has(marca);
                return (
                  <li key={p.chave} className={cn("sep-product", ok && "is-done")}>
                    <button type="button" aria-pressed={ok} aria-label={`${ok ? "Desmarcar" : "Marcar como pego"}: ${p.unidades} de ${p.titulo}`} onClick={() => alternar(marca)}>
                      <Marca feito={ok} />
                      <strong className="num sep-qty">{count(p.unidades)}<small>un</small></strong>
                      <span className="sep-name"><b>{p.titulo}</b>{p.sku && <code>{p.sku}</code>}</span>
                    </button>
                    <details>
                      <summary>{plural(p.pedidos.length, "pedido", "pedidos")}</summary>
                      <ul>{p.pedidos.map((v) => <li key={v.id}><span className="num">{v.venda}</span><span>{v.quantidade} un · {prazo(v.dias)}</span></li>)}</ul>
                    </details>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="sep-groups">
              {s.grupos.map((g) => (
                <article key={g.chave} className="sep-group">
                  <header>
                    <span className="sep-count">{g.pedidos.length === 1 ? "1 pedido" : `${count(g.pedidos.length)} pedidos iguais`}</span>
                    {g.itens.map((i) => <p key={i.chave}><strong className="num">{i.quantidade}×</strong> {i.titulo}{i.sku && <code>{i.sku}</code>}</p>)}
                  </header>
                  <ul>
                    {g.pedidos.map((p) => {
                      const marca = marcaPedido(p.id, g.chave), ok = feitos.has(marca);
                      return (
                        <li key={p.id}>
                          <button type="button" className={cn(ok && "is-done")} aria-pressed={ok} aria-label={`${ok ? "Desmarcar" : "Marcar como montado"}: pedido ${p.venda}`} onClick={() => alternar(marca)}>
                            <Marca feito={ok} />
                            <span className="sep-order"><b className="num">{p.venda}</b><small>{p.conta}</small></span>
                            <span className="sep-order-state"><span className={cn(p.dias != null && p.dias < 0 && "text-down")}>{prazo(p.dias)}</span><Badge tone={p.situacao === "Falta emitir a nota" ? "warn" : "neutral"}>{p.situacao}</Badge></span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
