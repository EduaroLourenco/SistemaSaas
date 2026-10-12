import Link from "next/link";
import { Warehouse, Package, ArrowUpRight } from "lucide-react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge } from "@/components/ui/primitives";
import { BotaoAtualizar } from "@/components/painel/botao-atualizar";
import { Disclosure } from "@/components/ui/disclosure";
import type { carregarEstoques } from "@/lib/dados/estoques";

const numero = (n: number | null) => n == null ? "—" : Number(n).toLocaleString("pt-BR");
const quando = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const controle = "min-h-11 rounded-xl border border-line bg-panel px-3 text-[13px] text-ink w-full";
export function EstoquesConteudo({ d, p = {} }: { d: Awaited<ReturnType<typeof carregarEstoques>>; p?: Record<string, string | string[] | undefined> }) {
  const valor = (k: string) => typeof p[k] === "string" ? p[k] as string : "";
  const f = { sku: valor("sku"), origem: valor("origem"), fonte: valor("fonte"), local: valor("local"), zeros: valor("zeros") === "1" };
  const fontes = new Map(d.fontes.map((s) => [s.id, s]));
  const locais = [...new Map(d.fontes.filter((s) => !f.fonte || s.id === f.fonte).flatMap((s) => s.locais.map((l) => [l.id, l] as const))).values()];
  const paginar = (n: number) => { const qs = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (typeof v === "string") qs.set(k, v); qs.set("pagina", String(n)); return `?${qs}`; };
  return <>
    <PageHeader title="Estoques e origens" description="Canal e ERP, separados por depósito." actions={<BotaoAtualizar />} />
    <PageBody>
      {!d.instalada && <Panel className="p-4"><p className="text-sm">A estrutura de estoques precisa ser instalada no banco: <strong>db/37_estoques_e_origem_dados.sql</strong>.</p></Panel>}
      {d.erro && <p role="alert" className="text-sm text-down">{d.erro}</p>}
      <div className="grid gap-3 lg:grid-cols-3">
        {d.fontes.map((s) => <Panel key={s.id} className="p-4">
          <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2">{s.provedor === "bling" ? <Warehouse size={18} className="shrink-0 text-brand mt-0.5" /> : <Package size={18} className="shrink-0 text-brand mt-0.5" />}<h2 className="text-[13px] font-semibold text-ink">{s.nome}</h2></div>
            <Badge tone={s.estado === "atualizado" ? "up" : s.estado === "erro" ? "down" : "neutral"}>{s.estado === "atualizado" ? "Consultado" : s.estado === "erro" ? "Falhou" : s.estado === "parcial" ? "Parcial" : "Aguardando"}</Badge></div>
          <p className="mt-3 text-[12px] text-ink-3">{s.atualizadaEm ? `${s.estado === "erro" ? "Última tentativa" : "Última leitura"}: ${quando(s.atualizadaEm)}` : "Sem leitura de depósitos ainda"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{s.locais.map((l) => <span key={l.id} className="rounded-md bg-panel-2 px-2 py-1 text-[11px] text-ink-2">{l.nome}{l.ativo === false ? " · inativo" : ""}</span>)}</div>
          {s.erro && <Disclosure title="Detalhes da leitura"><p>{s.erro}</p></Disclosure>}
        </Panel>)}
        {!d.fontes.length && <Panel className="p-4 text-sm text-ink-2">Conecte Mercado Livre ou Bling em <Link href="/integracoes/canais" className="text-brand underline">Canais e contas</Link>.</Panel>}
      </div>
      <Disclosure title={`Filtrar por SKU, origem ou depósito${f.sku ? ` · ${f.sku}` : ""}`}>
        <form className="grid grid-cols-2 items-end gap-3 xl:grid-cols-6">
          <label className="text-xs text-ink-2">SKU<input className={`${controle} mt-1.5`} name="sku" defaultValue={f.sku} placeholder="Buscar SKU" /></label>
          <label className="text-xs text-ink-2">Origem<select className={`${controle} mt-1.5`} name="origem" defaultValue={f.origem}><option value="">Canal e ERP</option><option value="canal">Estoque do canal</option><option value="erp">Estoque do ERP</option></select></label>
          <label className="text-xs text-ink-2">Conta<select className={`${controle} mt-1.5`} name="fonte" defaultValue={f.fonte}><option value="">Todas</option>{d.fontes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
          <label className="text-xs text-ink-2">Depósito<select className={`${controle} mt-1.5`} name="local" defaultValue={f.local}><option value="">Todos</option>{locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
          <label className="flex min-h-11 items-center gap-2 text-xs text-ink-2"><input type="checkbox" name="zeros" value="1" defaultChecked={f.zeros} />Só saldo zero</label>
          <button type="submit" className="min-h-11 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white">Filtrar</button>
        </form>
      </Disclosure>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3"><p>{d.total.toLocaleString("pt-BR")} saldos · zero significa sem disponível · — significa não informado</p><Link href="/integracoes/canais" className="flex items-center gap-1 text-brand">Conexões <ArrowUpRight size={13} /></Link></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {d.saldos.map((s) => {
          const fonte = fontes.get(s.integracao_id);
          const antiga = fonte?.iniciadaEm && s.consultado_em < fonte.iniciadaEm;
          return <Panel key={s.id} className="p-4">
            <div className="flex items-start justify-between gap-2"><span className="text-[11px] font-semibold text-brand">{s.origem === "erp" ? "ERP" : "CANAL"}</span><span className="text-[11px] text-ink-3">{quando(s.consultado_em)}{antiga ? " · anterior" : ""}</span></div>
            <p className="mt-1 text-xs text-ink-3">{fonte?.nome ?? s.provedor}</p>
            <p className="mt-3 text-[13px] font-semibold text-ink break-words">{s.sku || "Sem SKU"}</p><p className="mt-0.5 line-clamp-2 text-xs text-ink-2" title={s.titulo}>{s.titulo}</p>
            <div className="mt-4 rounded-xl bg-panel-2 p-3"><p className="flex items-center gap-1.5 text-xs text-ink-2"><Warehouse size={14} />{s.local_nome}</p><div className="mt-2 flex items-baseline gap-2"><strong className={`num text-3xl ${s.disponivel === 0 ? "text-down" : "text-ink"}`}>{numero(s.disponivel)}</strong><span className="text-xs text-ink-3">disponível</span></div>
              {(s.fisico != null || s.reservado != null) && <p className="mt-2 text-xs text-ink-3">Físico: {numero(s.fisico)} · Reservado: {numero(s.reservado)}</p>}</div>
            {s.anuncios.length > 0 && <Disclosure title={`${s.anuncios.length} anúncio${s.anuncios.length > 1 ? "s compartilham" : " usa"} este saldo`}><div className="flex flex-wrap gap-2">{s.anuncios.map((mlb) => <Link key={mlb} className="text-brand underline" href={`/anuncios/catalogo?q=${encodeURIComponent(mlb)}`}>{mlb}</Link>)}</div></Disclosure>}
            {s.observacao && <p className="mt-2 text-[11px] text-ink-3">{s.observacao}</p>}
          </Panel>;
        })}
      </div>
      {!d.saldos.length && d.instalada && !d.erro && <Panel className="p-8 text-center text-sm text-ink-3">{d.fontes.some((s) => s.atualizadaEm) ? "Nenhum saldo neste filtro." : "Clique em Atualizar para consultar os depósitos conectados."}</Panel>}
      {d.total > 100 && <nav aria-label="Páginas de estoque" className="flex items-center justify-between text-sm">{d.pagina > 0 ? <Link className="p-3 text-brand" href={paginar(d.pagina - 1)}>Anterior</Link> : <span />}<span>Página {d.pagina + 1} de {Math.ceil(d.total / 100)}</span>{(d.pagina + 1) * 100 < d.total ? <Link className="p-3 text-brand" href={paginar(d.pagina + 1)}>Próxima</Link> : <span />}</nav>}
      <Disclosure title="Como interpretar os saldos"><p>O canal informa o que pode vender; o ERP informa os depósitos da empresa. Os números podem representar as mesmas unidades e não são somados. Full é separado do depósito do vendedor. Canais sem API de estoque usam o ERP como referência, sem atribuir seu saldo a um canal específico.</p><p className="mt-2">Os nomes e quantidades vêm da API. Uma leitura parcial mantém a data anterior nos saldos que não puderam ser conferidos.</p></Disclosure>
    </PageBody>
  </>;
}
