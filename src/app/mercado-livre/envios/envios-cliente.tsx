"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, AlertCircle, CheckCircle2, List, Printer, Table2 } from "lucide-react";
import { count } from "@/lib/format";
import type { DadosEnvios, EnvioMeli } from "@/lib/dados/envios-meli";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "São Paulo — pronta entrega" → "São Paulo"; "2ª conta — venda a prazo" → "A prazo". */
const curto = (n: string) => (/prazo/i.test(n) ? "A prazo" : /são paulo/i.test(n) ? "São Paulo" : n);

function limiteBr(e: EnvioMeli) {
  if (!e.limite) return null;
  const d = new Date(e.limite.slice(0, 10) + "T12:00:00");
  const dia = `${DIAS[d.getDay()]} ${e.limite.slice(8, 10)}/${e.limite.slice(5, 7)}`;
  return e.origem === "canal" ? `${dia} · ${e.limite.slice(11, 13)}h` : dia;
}

const compraBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Dias({ dias }: { dias: number | null }) {
  if (dias == null) return <span className="text-[14px] text-ink-3">Sem prazo</span>;
  const tom = dias < 0 ? "text-down" : dias <= 1 ? "text-warn" : "text-ink";
  const rotulo = dias < 0 ? "atrasado" : dias === 0 ? "hoje" : dias === 1 ? "dia" : "dias";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn("num text-[24px] font-semibold leading-8 tracking-tight", tom)}>
        {dias < 0 ? `−${-dias}` : dias === 0 ? "0" : dias}
      </span>
      <span className={cn("text-[14px] font-medium", tom)}>{rotulo}</span>
    </span>
  );
}

/** O Meli só libera etiqueta de envio com nota e ainda não coletado, e só na conta que usa Mercado Envios. */
const SEM_ETIQUETA = new Set(["", "invoice_pending", "buffered", "shipment_paid"]);
const temEtiqueta = (e: EnvioMeli) => Boolean(e.envio && e.substatus !== undefined && !SEM_ETIQUETA.has(e.substatus) && e.origem === "canal");

function Marcar({ envio, marcados, alternar }: { envio: EnvioMeli; marcados: Set<number>; alternar: (n: number) => void }) {
  if (!temEtiqueta(envio)) return null;
  return (
    <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center" title="Incluir na impressão de etiquetas">
      <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={marcados.has(envio.envio!)} onChange={() => alternar(envio.envio!)} aria-label={`Incluir pedido ${envio.pedido} na impressão de etiquetas`} />
    </label>
  );
}

type Chave = "dias" | "limite" | "produto" | "pedido" | "conta" | "situacao";

const ORDENACAO: { valor: Chave; rotulo: string }[] = [
  { valor: "dias", rotulo: "Prazo restante" },
  { valor: "limite", rotulo: "Enviar até" },
  { valor: "produto", rotulo: "Produto" },
  { valor: "pedido", rotulo: "Pedido" },
  { valor: "conta", rotulo: "Conta" },
  { valor: "situacao", rotulo: "Situação" },
];

function Produtos({ envio }: { envio: EnvioMeli }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {envio.itens.map((i, k) => (
        <div key={k} className="min-w-0">
          <p className="text-[14px] leading-5 text-ink [overflow-wrap:anywhere]">
            <span className="num font-semibold">{i.quantidade}×</span> {i.titulo}
          </p>
          {i.sku && <p className="mt-1 font-mono text-[12px] leading-[18px] text-ink-3 [overflow-wrap:anywhere]">{i.sku}</p>}
        </div>
      ))}
    </div>
  );
}

export default function EnviosCliente({ dados }: { dados: DadosEnvios }) {
  const [conta, setConta] = React.useState("");
  const [ordem, setOrdem] = React.useState<{ chave: Chave; asc: boolean }>({ chave: "dias", asc: true });
  const [tabelaMobile, setTabelaMobile] = React.useState(false);
  const [marcados, setMarcados] = React.useState<Set<number>>(new Set());
  const [imprimindo, setImprimindo] = React.useState(false);
  const [aviso, setAviso] = React.useState<{ tom: "down" | "warn"; texto: string } | null>(null);
  const alternar = (n: number) => setMarcados((m) => { const x = new Set(m); if (x.has(n)) x.delete(n); else x.add(n); return x; });

  async function imprimir() {
    setImprimindo(true);
    setAviso(null);
    const janela = window.open("", "_blank");
    try {
      const r = await fetch("/api/envios/etiquetas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ envios: [...marcados], confirmar: true }) });
      if (!r.ok) {
        janela?.close();
        const j = await r.json().catch(() => ({}));
        const det = (j.falhas ?? []).map((f: { pedido: number; motivo: string }) => `${f.pedido}: ${f.motivo}`).join(" · ");
        setAviso({ tom: "down", texto: `${j.erro ?? "Não consegui gerar as etiquetas."}${det ? " " + det : ""}` });
        return;
      }
      const falhas: { pedido: number; motivo: string }[] = JSON.parse(decodeURIComponent(r.headers.get("x-falhas") ?? "%5B%5D"));
      const url = URL.createObjectURL(await r.blob());
      if (janela) janela.location.href = url; else window.location.href = url;
      if (falhas.length) setAviso({ tom: "warn", texto: `${falhas.length} ficaram de fora: ${falhas.map((f) => `${f.pedido} (${f.motivo})`).join(" · ")}` });
      setMarcados(new Set());
    } catch {
      janela?.close();
      setAviso({ tom: "down", texto: "Falha de conexão ao gerar as etiquetas." });
    } finally {
      setImprimindo(false);
    }
  }

  const lista = React.useMemo(() => {
    const base = dados.envios.filter((e) => !conta || e.conta === conta);
    const val = (e: EnvioMeli) =>
      ordem.chave === "dias" || ordem.chave === "limite"
        ? (e.limite ?? "9999")
        : ordem.chave === "pedido" ? e.pedido : ordem.chave === "conta" ? e.conta : ordem.chave === "produto" ? e.itens.map((i) => i.titulo).join(" ") : e.situacao;
    return [...base].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * (ordem.asc ? 1 : -1);
    });
  }, [dados.envios, conta, ordem]);

  const n = (f: (d: number) => boolean) => lista.filter((e) => e.dias != null && f(e.dias)).length;
  const resumo = [
    { r: "Atrasados", v: n((d) => d < 0), tom: "text-down" },
    { r: "Hoje", v: n((d) => d === 0), tom: "text-warn" },
    { r: "Amanhã", v: n((d) => d === 1), tom: "text-warn" },
    { r: "Depois", v: n((d) => d >= 2), tom: "text-ink" },
  ];
  const falhasVisiveis = dados.falhas.filter((f) => !conta || f.conta === conta);
  const consultaIncompleta = falhasVisiveis.length > 0;
  const semContas = dados.contas.length === 0;

  const ordenar = (chave: Chave) => setOrdem((o) => ({ chave, asc: o.chave === chave ? !o.asc : true }));
  const colunas: { chave: Chave; rotulo: string; largura: string }[] = [
    { chave: "dias", rotulo: "Restam", largura: "w-[110px]" },
    { chave: "limite", rotulo: "Enviar até", largura: "w-[140px]" },
    { chave: "produto", rotulo: "Produto", largura: "min-w-[260px]" },
    { chave: "pedido", rotulo: "Pedido", largura: "w-[160px]" },
    { chave: "conta", rotulo: "Conta", largura: "w-[150px]" },
    { chave: "situacao", rotulo: "Situação", largura: "w-[180px]" },
  ];

  return (
    <>
      <PageHeader
        title="Envios"
        badge={<span className="text-[12px] text-ink-3">
          Leitura de {new Date(dados.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </span>}
      />
      <PageBody>
        {/* Uma faixa de filtro acima de tudo que ela recorta */}
        <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Filtrar envios por conta">
          {["", ...dados.contas].map((c) => (
            <button
              key={c || "todas"}
              type="button"
              aria-pressed={conta === c}
              onClick={() => setConta(c)}
              className={cn(
                "min-h-11 min-w-0 rounded-r1 border px-4 py-2 text-left text-[14px] font-medium [overflow-wrap:anywhere]",
                conta === c ? "border-brand bg-brand-wash text-brand" : "border-line-2 bg-panel text-ink-2 hover:text-ink"
              )}
            >
              {c ? curto(c) : "Todas"}
            </button>
          ))}
        </div>

        {falhasVisiveis.map((f) => (
          <div key={f.conta} role="status" className="flex items-start gap-3 rounded-r1 bg-down-wash p-4 text-[14px] leading-5 text-down">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 [overflow-wrap:anywhere]"><span className="font-semibold">{f.conta}</span>: {f.motivo}</p>
          </div>
        ))}

        <section aria-label="Resumo de envios" className="grid min-w-0 gap-5 border-b border-line pb-6 lg:grid-cols-[minmax(160px,1fr)_minmax(0,3fr)] lg:items-end lg:gap-8">
          <div>
            <p className="mb-2 text-[14px] font-medium text-ink-2">{consultaIncompleta ? "Pendentes nas contas consultadas" : "Envios pendentes"}</p>
            <p className="num text-[48px] font-semibold leading-[56px] tracking-[-0.045em] text-ink md:text-[56px] md:leading-[64px]">{semContas ? "—" : count(lista.length)}</p>
          </div>
          <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {resumo.map((s) => <div key={s.r}>
              <dt className="mb-1 text-[14px] text-ink-2">{s.r}</dt>
              <dd className={cn("num text-[24px] font-semibold leading-8 tracking-tight", s.v ? s.tom : "text-ink-3")}>{semContas ? "—" : count(s.v)}</dd>
            </div>)}
          </dl>
        </section>

        {lista.length === 0 ? (
          <Panel className="flex items-start gap-3 p-5">
            {consultaIncompleta || semContas ? <AlertCircle aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-ink-3" /> : <CheckCircle2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-up" />}
            <div>
              <h2 className="text-[16px] font-semibold text-ink">{consultaIncompleta ? "Consulta incompleta" : semContas ? "Nenhuma conta disponível" : "Nenhum envio pendente"}</h2>
              <p className="mt-1 text-[14px] leading-6 text-ink-2">{consultaIncompleta ? "Não foi possível consultar todas as contas deste recorte. Confira as falhas acima." : semContas ? "Não há contas de Mercado Livre disponíveis nesta leitura." : conta ? `Nenhum envio pendente em ${conta}.` : "Nenhum envio pendente nas contas consultadas."}</p>
            </div>
          </Panel>
        ) : (
          <Panel className="min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
              <h2 className="text-[16px] font-semibold text-ink">Fila de envios <span className="num ml-1 font-normal text-ink-3">{count(lista.length)}</span></h2>
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-[14px] text-ink-2 md:hidden">
                  <span className="sr-only">Ordenar envios por</span>
                  <select aria-label="Ordenar envios por" value={ordem.chave} onChange={(e) => setOrdem({ chave: e.target.value as Chave, asc: true })} className="h-11 min-w-0 flex-1 rounded-r1 border border-line-2 bg-panel px-3 text-[16px] text-ink">
                    {ORDENACAO.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => setOrdem((o) => ({ ...o, asc: !o.asc }))} aria-label={ordem.asc ? "Alterar para ordem decrescente" : "Alterar para ordem crescente"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-r1 border border-line-2 text-ink-2 md:hidden">
                  {ordem.asc ? <ArrowUp aria-hidden="true" size={18} /> : <ArrowDown aria-hidden="true" size={18} />}
                </button>
                <button type="button" onClick={() => setTabelaMobile((v) => !v)} aria-pressed={tabelaMobile} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-r1 border border-line-2 px-3 text-[14px] font-medium text-ink-2 md:hidden">
                  {tabelaMobile ? <List aria-hidden="true" size={18} /> : <Table2 aria-hidden="true" size={18} />}{tabelaMobile ? "Lista" : "Tabela"}
                </button>
                <span className="hidden text-[12px] text-ink-3 md:block">{ordem.chave === "dias" && ordem.asc ? "Do prazo mais próximo ao mais distante" : `Por ${ORDENACAO.find((o) => o.valor === ordem.chave)?.rotulo.toLowerCase()} · ${ordem.asc ? "crescente" : "decrescente"}`}</span>
              </div>
            </div>

            {(lista.some(temEtiqueta) || aviso) && (
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-panel-2 px-4 py-3 md:px-5">
                <button type="button" disabled={!marcados.size || imprimindo} onClick={imprimir} className="inline-flex min-h-11 items-center gap-2 rounded-r1 bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-40">
                  <Printer aria-hidden="true" size={18} />{imprimindo ? "Gerando…" : `Etiquetas com SKU${marcados.size ? ` (${marcados.size})` : ""}`}
                </button>
                <button type="button" onClick={() => setMarcados(new Set(lista.filter(temEtiqueta).map((e) => e.envio!)))} className="min-h-11 rounded-r1 border border-line-2 px-3 text-[14px] font-medium text-ink-2 hover:text-ink">Marcar todos</button>
                <p className="min-w-0 flex-1 text-[12px] leading-[18px] text-ink-3">Baixar a etiqueta marca o envio como impresso no Mercado Livre. Uma conta por vez.</p>
                {aviso && <p role="status" className={cn("w-full text-[14px] leading-5 [overflow-wrap:anywhere]", aviso.tom === "down" ? "text-down" : "text-warn")}>{aviso.texto}</p>}
              </div>
            )}

            <div className={cn("min-w-0 overflow-x-auto", !tabelaMobile && "hidden md:block")} role="region" aria-label="Tabela de envios, com rolagem horizontal" tabIndex={0}>
              <table className="w-full min-w-[1000px] table-fixed text-left text-[14px]">
                <caption className="sr-only">Envios pendentes no recorte selecionado. Ordenação pelo cabeçalho das colunas.</caption>
                <thead className="sticky top-0 z-10 bg-panel-2">
                  <tr>{colunas.map((c, i) => (
                    <th key={c.chave} scope="col" aria-sort={ordem.chave === c.chave ? ordem.asc ? "ascending" : "descending" : "none"} className={cn("border-b border-line px-4 py-1", c.largura, i === 0 && "sticky left-0 z-20 bg-panel-2")}>
                      <button type="button" onClick={() => ordenar(c.chave)} className="inline-flex min-h-11 items-center gap-2 text-left text-[14px] font-medium text-ink-2 hover:text-ink">
                        {c.rotulo}
                        {ordem.chave === c.chave && (ordem.asc ? <ArrowUp aria-hidden="true" size={14} /> : <ArrowDown aria-hidden="true" size={14} />)}
                      </button>
                    </th>
                  ))}</tr>
                </thead>
                <tbody>{lista.map((e) => <tr key={`${e.conta}-${e.pedido}`} className="group border-b border-line last:border-0">
                  <td className="sticky left-0 z-1 bg-panel px-4 py-4 align-top"><div className="flex items-start gap-1"><Marcar envio={e} marcados={marcados} alternar={alternar} /><Dias dias={e.dias} /></div></td>
                  <td className="px-4 py-4 align-top font-medium text-ink">{limiteBr(e) ?? <span className="font-normal text-ink-3">Sem prazo</span>}</td>
                  <td className="px-4 py-4 align-top"><Produtos envio={e} /></td>
                  <td className="px-4 py-4 align-top"><span className="num text-ink-2 [overflow-wrap:anywhere]">{e.pedido}</span><p className="mt-1 text-[12px] text-ink-3">Compra {compraBr(e.compra)}</p></td>
                  <td className="px-4 py-4 align-top leading-5 text-ink-2 [overflow-wrap:anywhere]">{e.conta}</td>
                  <td className="px-4 py-4 align-top"><Badge className="whitespace-normal" tone={e.dias != null && e.dias < 0 ? "down" : "neutral"}>{e.situacao}</Badge></td>
                </tr>)}</tbody>
              </table>
            </div>

            <div className={cn("divide-y divide-line md:hidden", tabelaMobile && "hidden")}>
              {lista.map((e) => <article key={`${e.conta}-${e.pedido}`} aria-label={`Pedido ${e.pedido}`} className="min-w-0 p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-1"><Marcar envio={e} marcados={marcados} alternar={alternar} /><Dias dias={e.dias} /></div>
                  <div className="text-right"><p className="text-[12px] leading-[18px] text-ink-3">Enviar até</p><p className="text-[14px] font-semibold leading-5 text-ink">{limiteBr(e) ?? "Sem prazo"}</p></div>
                </div>
                <Produtos envio={e} />
                <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 text-[14px]">
                  <div><dt className="text-[12px] text-ink-3">Pedido</dt><dd className="num mt-1 text-ink-2 [overflow-wrap:anywhere]">{e.pedido}</dd></div>
                  <div><dt className="text-[12px] text-ink-3">Compra</dt><dd className="num mt-1 text-ink-2">{compraBr(e.compra)}</dd></div>
                  <div className="col-span-2"><dt className="text-[12px] text-ink-3">Conta</dt><dd className="mt-1 text-ink-2 [overflow-wrap:anywhere]">{e.conta}</dd></div>
                  <div className="col-span-2"><dt className="sr-only">Situação</dt><dd><Badge className="whitespace-normal" tone={e.dias != null && e.dias < 0 ? "down" : "neutral"}>{e.situacao}</Badge></dd></div>
                </dl>
              </article>)}
            </div>
          </Panel>
        )}
      </PageBody>
    </>
  );
}
