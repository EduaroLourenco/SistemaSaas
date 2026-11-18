import Link from "next/link";
import { notFound } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import { listarInteresses } from "@/lib/interesses";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function Interessados() {
  const sb = await clienteServidor({ todasOperacoes: true });
  const { data: admin } = await sb.rpc("eh_admin_plataforma");
  if (admin !== true) notFound();
  const contatos = await listarInteresses();
  return <><PageHeader title="Interessados" actions={<Link href="/api/interesse?formato=csv" className="inline-flex min-h-11 items-center rounded-r1 border border-line-2 bg-panel px-4 text-[14px] font-medium">Exportar esta lista</Link>} /><PageBody>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[14px] text-ink-2">{contatos.length} contatos{contatos.length === 100 ? " mais recentes" : " recebidos pelo site"}</p><Link href="/empresas" className="text-[14px] text-brand">Voltar às empresas</Link></div>
    <Panel className="overflow-hidden"><ul className="divide-y divide-line">{contatos.length ? contatos.map(c => <li key={c.telefone} className="flex flex-wrap items-center justify-between gap-4 p-4"><div className="min-w-0"><h2 className="text-[16px] font-semibold [overflow-wrap:anywhere]">{c.nome}</h2><a href={`tel:+${c.telefone.length > 11 ? c.telefone : '55'+c.telefone}`} className="inline-flex min-h-11 items-center text-[14px] text-brand">{c.telefone}</a></div><time className="text-[13px] text-ink-3" dateTime={c.criadoEm}>{new Date(c.criadoEm).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</time></li>) : <li className="p-6 text-[14px] text-ink-2">Os cadastros de interesse aparecerão aqui.</li>}</ul></Panel>
  </PageBody></>;
}
