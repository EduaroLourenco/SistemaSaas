import Link from "next/link";
import { carregarCanais } from "@/lib/dados/canais";
import { carregarAutomacao } from "@/lib/dados/automacao";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "@/lib/dados/paginar";
import { Panel } from "@/components/ui/primitives";

export async function MapaFontes() {
  const sb = await clienteServidor();
  const [d, automacao, dias] = await Promise.all([
    carregarCanais(), carregarAutomacao(),
    paginar(() => sb.from("vendas_diarias").select("conta_canal_id,data,origem_vendas,origem_visitas,origem_ads").order("data")).catch(() => []),
  ]);
  const cobertura = new Map<string, string>();
  for (const dia of dias) for (const campo of ["vendas", "visitas", "ads"] as const) {
    if (dia[`origem_${campo}`] === "api") cobertura.set(`${dia.conta_canal_id}|${campo}`, dia.data);
  }
  const ate = (id: string, campo: string) => {
    const data = cobertura.get(`${id}|${campo}`);
    return data ? `até ${data.slice(8,10)}/${data.slice(5,7)}` : "leitura a conferir";
  };
  return <Panel className="overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4"><h2 className="text-sm font-semibold text-ink">Dados por canal</h2><Link className="text-xs text-brand" href="/integracoes/estoques">Ver estoques por depósito →</Link></div>
    <div className="grid gap-px bg-line md:grid-cols-2 xl:grid-cols-3">{d.contas.filter((c) => c.ativa).map((c) => {
      const a = automacao[c.id];
      return <div key={c.id} className="bg-panel p-4"><h3 className="text-[13px] font-semibold text-ink">{c.canalNome}</h3>{c.nome !== "Conta principal" && <p className="mt-0.5 text-xs text-ink-3">{c.nome}</p>}
        <dl className="mt-3 space-y-2 text-xs">{([['vendas','Vendas'],['visitas','Visitas'],['ads','Mídia']] as const).map(([chave,nome]) => <div key={chave} className="flex items-start justify-between gap-3"><dt className="text-ink-3">{nome}</dt><dd className="text-right text-ink-2">{a?.[chave] ? <><span className="text-brand">{a[chave]} · API</span><small className="block text-ink-3">{ate(c.id,chave)}</small></> : chave === 'vendas' ? "Planilha / sem API" : "Sem API conectada"}</dd></div>)}
        <div className="flex justify-between gap-3"><dt className="text-ink-3">Estoque</dt><dd className="text-right text-ink-2">{c.canalCodigo === "mercado_livre" && c.conectada ? "Canal · por local" : d.erp?.conectado ? "ERP · depósitos do Bling" : "Sem coleta por depósito"}</dd></div></dl>
      </div>;
    })}</div>
    <p className="border-t border-line p-3 text-[11px] text-ink-3">API conectada indica a fonte. As datas mostram até onde há leitura identificada. Estoque do ERP é compartilhado e não pertence exclusivamente a um canal.</p>
  </Panel>;
}
