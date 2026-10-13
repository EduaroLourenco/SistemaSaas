"use client";
import * as React from "react";
import Link from "next/link";
import type { carregarEstoques } from "@/lib/dados/estoques";

type Dados = Awaited<ReturnType<typeof carregarEstoques>>;
const numero = (n: number | null) => n == null ? "—" : Number(n).toLocaleString("pt-BR");
export function EstoqueProduto({ sku, anuncio }: { sku?: string; anuncio?: string }) {
  const [dados, setDados] = React.useState<Dados | null>(null);
  const [erro, setErro] = React.useState("");
  const [pagina, setPagina] = React.useState(0);
  React.useEffect(() => {
    const abort = new AbortController();
    setDados(null); setErro("");
    const q = new URLSearchParams({ pagina: String(pagina) });
    if (sku && sku !== "—") q.set("sku", sku); else if (anuncio) q.set("anuncio", anuncio);
    if (!q.has("sku") && !q.has("anuncio")) { setErro("Este item ainda não tem SKU ou anúncio vinculado."); return; }
    fetch(`/api/estoques/produto?${q}`, { signal: abort.signal }).then(async (r) => {
      const d = await r.json(); if (!r.ok || d.erro) throw new Error(d.erro || "Falha ao consultar");
      setDados(d);
    }).catch((e) => { if (!abort.signal.aborted) setErro(e.message); });
    return () => abort.abort();
  }, [sku, anuncio, pagina]);
  if (erro) return <p role="alert" className="text-sm text-down">{erro}</p>;
  if (!dados) return <p role="status" className="text-sm text-ink-3">Consultando estoques…</p>;
  const fontes = new Map(dados.fontes.map((f) => [f.id, f]));
  return <div className="space-y-3">
    <p className="text-xs text-ink-3">Todas as origens deste produto na empresa. Canal e ERP podem representar as mesmas unidades; os saldos ficam separados.</p>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{dados.saldos.map((s) => {
      const fonte = fontes.get(s.integracao_id);
      return <div key={s.id} className="rounded-xl border border-line bg-panel p-3">
        <p className="text-[11px] font-semibold text-brand">{s.origem === "erp" ? "ERP" : "CANAL"} · {fonte?.nome || s.provedor}</p>
        <p className="mt-2 text-sm font-medium text-ink">{s.local_nome}</p>
        <p className="mt-2 text-ink"><strong className="num text-2xl">{numero(s.disponivel)}</strong> <span className="text-xs text-ink-3">disponível</span></p>
        <p className="mt-1 text-xs text-ink-3">Físico {numero(s.fisico)} · reservado {numero(s.reservado)}</p>
        <p className="mt-2 text-[11px] text-ink-3">Leitura: {new Date(s.consultado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{fonte?.iniciadaEm && s.consultado_em < fonte.iniciadaEm ? " · leitura anterior" : ""}</p>
        {s.anuncios.length > 1 && <p className="mt-1 text-[11px] text-ink-3">{s.anuncios.length} anúncios compartilham este saldo.</p>}
        {s.observacao && <p className="mt-1 text-[11px] text-ink-3">{s.observacao}</p>}
      </div>;
    })}</div>
    {!dados.saldos.length && <p className="text-sm text-ink-2">{dados.instalada ? "Sem saldo consultado para este produto. Ausência de registro não significa estoque zero." : "A estrutura de estoques ainda não está instalada."}</p>}
    {dados.fontes.filter((f) => f.estado !== "atualizado").map((f) => <p key={f.id} className="text-xs text-ink-3">{f.nome}: {f.estado === "erro" ? "última consulta falhou" : "consulta ainda incompleta"}.</p>)}
    {dados.total > 100 && <div className="flex items-center gap-3 text-xs"><button className="min-h-11 text-brand disabled:opacity-40" disabled={!pagina} onClick={() => setPagina(pagina - 1)}>Anterior</button><span>{pagina + 1}/{Math.ceil(dados.total / 100)}</span><button className="min-h-11 text-brand disabled:opacity-40" disabled={(pagina + 1) * 100 >= dados.total} onClick={() => setPagina(pagina + 1)}>Próxima</button></div>}
    <Link className="inline-block py-2 text-xs text-brand" href={`/integracoes/estoques?sku=${encodeURIComponent(sku || "")}`}>Abrir todas as fontes →</Link>
  </div>;
}
