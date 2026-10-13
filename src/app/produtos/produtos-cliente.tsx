"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import { SeletorCanais } from "@/components/ui/seletor-canais";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { Detalhe } from "@/app/vendas/queda/queda-cliente";
import type { DadosQueda } from "@/lib/dados/queda";
import { count, money } from "@/lib/format";

const controle = "min-h-11 rounded-r1 border border-line bg-panel px-3 text-sm text-ink max-w-full";
export default function ProdutosCliente({ dados }: { dados: DadosQueda }) {
  const router = useRouter();
  const [busca, setBusca] = React.useState("");
  const [semVenda, setSemVenda] = React.useState(false);
  const [ordem, setOrdem] = React.useState("sku");
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [datas, setDatas] = React.useState({ de: dados.de, ate: dados.ate });
  const [pendente, transicao] = React.useTransition();
  function navegar(canais = dados.recorte) {
    const q = new URLSearchParams(datas); if (canais.length) q.set("canais", canais.join(","));
    if (dados.skuFiltro) q.set("sku",dados.skuFiltro);
    transicao(() => router.push(`/produtos?${q}`, {scroll:false}));
  }
  const linhas = React.useMemo(() => dados.linhas.filter((l) => (!semVenda || l.agora.unidades === 0) && `${l.sku} ${l.codigo} ${l.titulo} ${l.onde}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR"))).sort((a,b) => ordem === "vendas" ? b.agora.receita-a.agora.receita : ordem === "preco" ? (b.precoAtual ?? -1)-(a.precoAtual ?? -1) : a.sku.localeCompare(b.sku, "pt-BR", {numeric:true}) || a.onde.localeCompare(b.onde)), [dados.linhas, busca, semVenda, ordem]);
  const {visible,pagination} = usePagination(linhas);
  function exportar() {
    const csv = (v: unknown) => { if (typeof v === "number") return String(v).replace(".",","); const s = String(v ?? ""); return '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"','""') + '"'; };
    const rows = [["SKU","Produto","Canal / conta","Anúncio","Unidades","Receita","Preço vendido médio","Último preço anunciado","Tipo do preço","Data da leitura"], ...linhas.map((l) => [l.sku,l.titulo,l.onde,l.codigo,l.agora.unidades,l.agora.receita,l.agora.precoVendido,l.precoAtual,l.precoAtualOrigem === "oferta" ? "Oferta" : "Cadastro (cheio)",l.precoAtualData])];
    const url = URL.createObjectURL(new Blob(['\uFEFF'+rows.map((r) => r.map(csv).join(';')).join('\r\n')], {type:'text/csv;charset=utf-8;'}));
    const a = document.createElement('a'); a.href=url; a.download=`produtos-${dados.de}-${dados.ate}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return <><PageHeader title="Produtos e preços" breadcrumb="Catálogo" description="Anunciados e vendidos, separados por canal." actions={<Button onClick={exportar}>Exportar tabela</Button>} filters={<div className="flex flex-wrap items-end gap-3">
    <div className="max-w-full"><SeletorCanais grupos={dados.opcoes} selecionados={dados.recorte} aoAplicar={navegar} /></div>
    <label className="text-xs text-ink-3">De<input aria-label="Data inicial" className={`${controle} block mt-1`} type="date" max={datas.ate} value={datas.de} onChange={(e) => setDatas({...datas,de:e.target.value})} /></label>
    <label className="text-xs text-ink-3">Até<input aria-label="Data final" className={`${controle} block mt-1`} type="date" min={datas.de} value={datas.ate} onChange={(e) => setDatas({...datas,ate:e.target.value})} /></label>
    <Button disabled={pendente || !datas.de || !datas.ate || datas.de > datas.ate} onClick={() => navegar()}>{pendente ? "Carregando…" : "Aplicar"}</Button>
  </div>} />
  <PageBody>
    <div className="flex flex-wrap gap-2 text-xs text-ink-2"><Badge tone="neutral">{count(linhas.length)} itens</Badge><Badge tone="neutral">{count(linhas.filter((l) => !l.agora.unidades).length)} sem venda</Badge><span className="py-1">Vendas no calendário escolhido · preço anunciado na data da última leitura</span></div>
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-3"><input className={`${controle} w-64`} aria-label="Buscar produto" placeholder="SKU, produto ou anúncio" value={busca} onChange={(e) => setBusca(e.target.value)} /><label className="flex min-h-11 items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={semVenda} onChange={(e) => setSemVenda(e.target.checked)} />Sem venda no período</label><select className={controle} aria-label="Ordenar produtos" value={ordem} onChange={(e) => setOrdem(e.target.value)}><option value="sku">Agrupar por SKU</option><option value="vendas">Maior receita</option><option value="preco">Maior preço anunciado</option></select></div>
      <div className="divide-y divide-line">{visible.map((l) => <article key={l.chave}>
        <button className="grid w-full grid-cols-2 gap-3 p-4 text-left hover:bg-panel-2 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]" type="button" aria-expanded={aberto === l.chave} onClick={() => setAberto(aberto === l.chave ? null : l.chave)}>
          <div className="col-span-2 min-w-0 md:col-span-1"><p className="text-sm font-semibold text-ink">{l.sku || l.codigo}</p><p className="line-clamp-2 text-xs text-ink-2">{l.titulo}</p><p className="mt-1 text-xs text-brand">{l.onde}</p><p className="mt-1 text-[11px] text-ink-3">{l.codigo} · {aberto === l.chave ? "Fechar" : "Abrir histórico e estoques"}</p></div>
          <div><p className="text-[11px] text-ink-3">Vendido no período</p><p className="num text-sm font-semibold text-ink">{count(l.agora.unidades)} un</p><p className="num text-xs text-ink-2">{money(l.agora.receita)}</p></div>
          <div><p className="text-[11px] text-ink-3">Preço vendido médio</p><p className="num text-sm font-semibold text-ink">{l.agora.precoVendido == null ? "—" : money(l.agora.precoVendido)}</p><p className="text-[11px] text-ink-3">{!l.agora.unidades ? "sem venda" : "pedidos válidos"}</p></div>
          <div><p className="text-[11px] text-ink-3">{l.precoAtualOrigem === "cadastro" ? "Anunciado (cheio)" : "Última oferta lida"}</p><p className="num text-sm font-semibold text-ink">{l.precoAtual == null ? "—" : money(l.precoAtual)}</p><p className="text-[11px] text-ink-3">{l.precoAtualData ? l.precoAtualData.split('-').reverse().join('/') : "sem leitura"}</p></div>
        </button>
        {aberto === l.chave && <Detalhe l={l} dados={dados} />}
      </article>)}</div>
      {!linhas.length && <p className="p-6 text-sm text-ink-3">Nenhum produto neste filtro.</p>}
      <Pagination {...pagination} />
    </Panel>
    <p className="text-xs text-ink-3">Zero unidades significa sem venda. Preços ausentes ficam em branco. Sem API de catálogo, o canal mostra os produtos identificados nos pedidos; histórico de vitrine só existe a partir das leituras registradas.</p>
  </PageBody></>;
}
