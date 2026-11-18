"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { FerramentasPromocoes } from "@/components/promocoes/ferramentas";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import { Segmented, Sheet } from "@/components/ui/controls";
import { SemFonte } from "@/components/ui/sem-fonte";
import { money, count, pct } from "@/lib/format";
import type { DadosPromocoes, ItemHistorico } from "@/lib/dados/promocoes";
import { Search, ChevronRight, ChevronDown } from "lucide-react";

/**
 * Histórico de promoções, por SKU.
 *
 * Cada linha é um SKU, com Clássico e Premium agrupados embaixo — o mesmo
 * produto costuma viver nos dois, e separá-los divide a decisão do mesmo
 * item em duas linhas que ninguém consegue comparar.
 *
 * A última decisão fica na lista. O painel do produto mantém as rodadas,
 * os quatro preços e os motivos juntos para comparar sem perder o contexto.
 */

type Grupo = {
  sku: string;
  titulo: string;
  curva: string;
  itens: ItemHistorico[];
  aprovados: number;
  precoPraticado: number | null;
  /** A decisão mais recente do SKU. */
  ultima: ItemHistorico;
};

export default function HistoricoPromocoes({ dados }: { dados: DadosPromocoes }) {
  const [busca, setBusca] = React.useState("");
  const [decisao, setDecisao] = React.useState("todas");
  const [curva, setCurva] = React.useState("todas");
  const [tipo, setTipo] = React.useState("todos");
  const [campanha, setCampanha] = React.useState("todas");
  const [de, setDe] = React.useState("");
  const [ate, setAte] = React.useState("");
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [limite, setLimite] = React.useState(30);
  const [buscaRodada, setBuscaRodada] = React.useState("");
  const [visao, setVisao] = React.useState<"skus" | "processamentos">("skus");

  const campanhasDisponiveis = React.useMemo(
    () => [...new Set(dados.historico.map((h) => h.campanha))].sort(),
    [dados.historico]
  );

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dados.historico.filter((h) => {
      if (decisao === "sim" && !h.aprovado) return false;
      if (decisao === "nao" && h.aprovado) return false;
      if (curva !== "todas" && h.curva !== curva) return false;
      if (tipo !== "todos" && h.tipoAnuncio !== tipo) return false;
      if (campanha !== "todas" && h.campanha !== campanha) return false;
      if (de && h.data < de) return false;
      if (ate && h.data > ate) return false;
      if (!q) return true;
      return (
        h.sku.toLowerCase().includes(q) ||
        h.mlb.toLowerCase().includes(q) ||
        h.titulo.toLowerCase().includes(q)
      );
    });
  }, [dados.historico, busca, decisao, curva, tipo, campanha, de, ate]);

  const grupos = React.useMemo(() => {
    const m = new Map<string, Grupo>();
    for (const h of filtrados) {
      const g =
        m.get(h.sku) ??
        ({
          sku: h.sku,
          titulo: h.titulo,
          curva: h.curva,
          itens: [],
          aprovados: 0,
          precoPraticado: h.precoPraticado,
          ultima: h,
        } as Grupo);
      g.itens.push(h);
      if (h.aprovado) g.aprovados++;
      // O histórico vem em ordem decrescente de data, então o primeiro é o
      // mais recente — não precisa reordenar por linha.
      if (h.data > g.ultima.data) g.ultima = h;
      m.set(h.sku, g);
    }
    return [...m.values()].sort((a, b) => b.ultima.data.localeCompare(a.ultima.data) || b.itens.length - a.itens.length);
  }, [filtrados]);

  const rodadas = dados.processamentos.filter(p => !buscaRodada.trim() || p.arquivos.join(" ").toLowerCase().includes(buscaRodada.trim().toLowerCase()));
  const selecionado = grupos.find(g => g.sku === aberto);
  const visiveis = grupos.slice(0, limite);
  const filtrosAtivos = [decisao !== "todas", curva !== "todas", tipo !== "todos", campanha !== "todas", Boolean(de), Boolean(ate)].filter(Boolean).length;
  const limpar = () => { setBusca(""); setDecisao("todas"); setCurva("todas"); setTipo("todos"); setCampanha("todas"); setDe(""); setAte(""); };

  return <>
    <PageHeader title="Histórico de promoções" actions={<FerramentasPromocoes atual="/promocoes/historico" />} />
    <PageBody className="op-workspace promo-workspace op-promocoes-historico">
      {dados.vazio ? <SemFonte titulo="Nenhuma decisão registrada" origem="As rodadas processadas aparecem aqui." /> : <>
        <section className="promo-overview" aria-label="Resumo do histórico">
          {visao === "skus" ? <>
          <div><strong>{count(grupos.length)}</strong><span>produtos</span></div>
          <div><strong>{count(filtrados.length)}</strong><span>decisões no recorte</span></div>
          <div><strong>{count(filtrados.filter(h => h.aprovado).length)}</strong><span>decisões aprovadas</span></div>
          </> : <><div><strong>{count(rodadas.length)}</strong><span>rodadas</span></div><div><strong>{count(rodadas.reduce((n,p)=>n+p.lidos,0))}</strong><span>itens lidos</span></div><div><strong>{count(rodadas.reduce((n,p)=>n+p.aprovados,0))}</strong><span>decisões aprovadas</span></div></>}
        </section>
        <div className="promo-toolbar">
          <Segmented options={[{value:"skus",label:"Produtos"},{value:"processamentos",label:"Rodadas"}]} value={visao} onChange={setVisao} />
          {visao === "skus" ? <>
          <label className="promo-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar no histórico de promoções</span><input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Produto, SKU ou anúncio" /></label>
          <details className="promo-filter"><summary>Filtros{filtrosAtivos ? ` · ${filtrosAtivos}` : ""}<ChevronDown size={15} aria-hidden="true" /></summary><div className="promo-filter-fields">
            <label>Decisão<select value={decisao} onChange={e=>setDecisao(e.target.value)}><option value="todas">Todas</option><option value="sim">Participaram</option><option value="nao">Ficaram de fora</option></select></label>
            <label>Curva<select value={curva} onChange={e=>setCurva(e.target.value)}><option value="todas">Todas</option>{["A","B","C"].map(c=><option key={c}>{c}</option>)}</select></label>
            <label>Tipo de anúncio<select value={tipo} onChange={e=>setTipo(e.target.value)}><option value="todos">Todos</option><option>Clássico</option><option>Premium</option></select></label>
            <label>Campanha<select value={campanha} onChange={e=>setCampanha(e.target.value)}><option value="todas">Todas</option>{campanhasDisponiveis.map(c=><option key={c}>{c}</option>)}</select></label>
            <label>De<input type="date" value={de} onChange={e=>setDe(e.target.value)} /></label>
            <label>Até<input type="date" value={ate} onChange={e=>setAte(e.target.value)} /></label>
            <Button onClick={limpar}>Limpar filtros</Button>
          </div></details>
          </> : <label className="promo-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar arquivo processado</span><input value={buscaRodada} onChange={e=>setBuscaRodada(e.target.value)} placeholder="Nome do arquivo" /></label>}
        </div>
        {visao === "skus" ? <div className="promo-products">
          {!visiveis.length && <div className="p-5"><p className="text-[14px] text-ink-2">Nenhum produto neste recorte.</p><Button variant="ghost" onClick={limpar}>Limpar filtros</Button></div>}
          {visiveis.map(g => <button key={g.sku} type="button" className="promo-product" onClick={()=>setAberto(g.sku)} aria-label={`Abrir histórico de ${g.sku}`}>
            <div><p className="promo-product-title">{g.titulo}</p><p className="promo-product-meta"><span className="font-mono">{g.sku}</span>{g.curva!=="—"&&<span>Curva {g.curva}</span>}<span>{g.itens.length} {g.itens.length===1?"decisão":"decisões"} · {g.aprovados} {g.aprovados===1?"aprovada":"aprovadas"}</span></p><div className="promo-product-last"><Badge tone={g.ultima.aprovado?"up":"neutral"}>{g.ultima.aprovado?"Aprovada":"Fora"}</Badge><span>{g.ultima.campanha} · {dataBr(g.ultima.data)}</span></div></div>
            <div className="promo-product-price"><strong>{valor(g.ultima.precoComExtra ?? g.ultima.precoOfertadoML)}</strong><span>última proposta</span><ChevronRight size={17} aria-hidden="true" /></div>
          </button>)}
          {grupos.length>limite&&<Button variant="ghost" className="w-full" onClick={()=>setLimite(l=>l+50)}>Mostrar mais {Math.min(50,grupos.length-limite)}</Button>}
        </div> : <Panel className="overflow-hidden"><ul className="promo-processing-list">{!rodadas.length&&<li><p>Nenhuma rodada encontrada.</p></li>}{rodadas.map(p=><li key={p.id}><div className="min-w-0 flex-1"><strong>{p.arquivos.length?p.arquivos.join(", "):"Rodada sem nome de arquivo"}</strong><p>{dataBr(p.quando)}{p.descontoExtra>0?` · desconto extra ${pct(p.descontoExtra*100)}`:""}</p><p>{count(p.lidos)} itens · {count(p.aprovados)} aprovados · {count(p.reprovados)} fora</p>{(p.status==="falhou"||p.status==="sem_registro")&&<Link href="/promocoes/processar" className="inline-flex min-h-11 items-center text-[13px] text-brand">Reprocessar arquivo</Link>}</div><Badge tone={p.status==="falhou"||p.status==="sem_registro"?"down":"neutral"}>{p.status==="falhou"||p.status==="sem_registro"?"Não gravado":p.status==="executando"?"Em processamento":"Processado"}</Badge></li>)}</ul><div className="px-5 py-3 border-t border-line"><Link href="/promocoes/campanhas" className="inline-flex min-h-11 items-center gap-2 text-[14px] text-brand">Ver campanhas por rodada <ChevronRight size={15} /></Link></div></Panel>}
        <details className="promo-secondary"><summary>O que este histórico mostra<ChevronDown size={15} /></summary><div>Decisões das rodadas processadas, com os preços usados em cada uma. A aprovação registrada deve ser conferida no canal. Para ver as oportunidades abertas agora, acesse <Link href="/automacoes" className="text-brand">Promoções abertas</Link>.</div></details>
      </>}
    </PageBody>
    {selecionado&&<Sheet title="Histórico do produto" subtitle={selecionado.sku} onClose={()=>setAberto(null)} width="650px"><div className="promo-detail">
      <h3>{selecionado.titulo}</h3>
      <div className="promo-detail-actions"><Link href={`/promocoes/comparar?sku=${encodeURIComponent(selecionado.sku)}`}>Comparar propostas</Link><Link href="/anuncios/analise">Ir para anúncios</Link></div>
      <dl className="promo-prices"><div><dt>Preço médio praticado</dt><dd>{valor(selecionado.precoPraticado)}</dd></div><div><dt>Decisões aprovadas</dt><dd>{selecionado.aprovados} de {selecionado.itens.length}</dd></div></dl>
      {selecionado.itens.map(h=><article className="promo-record" key={h.id}><div className="promo-record-heading"><div><strong>{h.campanha}</strong><p>{dataBr(h.data)} · {h.tipoAnuncio} · {h.tipoCampanha}</p><p className="font-mono">{h.mlb}</p></div><Badge tone={h.aprovado?"up":"neutral"}>{h.aprovado?"Aprovada":"Fora"}</Badge></div>
        <dl className="promo-prices"><div><dt>Canal ofereceu</dt><dd>{valor(h.precoOfertadoML)}</dd></div><div><dt>Preço de tabela</dt><dd>{valor(h.precoTabela)}</dd></div><div><dt>Piso da rodada</dt><dd>{valor(h.precoPiso)}</dd></div><div><dt>Com desconto extra</dt><dd>{valor(h.precoComExtra)}</dd></div><div><dt>Redução de tarifa</dt><dd>{h.reducaoTarifa || "—"}</dd></div></dl>
        {h.motivo&&<p className="promo-record-reason">{h.motivo}</p>}{h.tags.length>0&&<div className="mt-3 flex flex-wrap gap-2">{h.tags.map(t=><Badge key={t} tone="warn">{t.replace(/_/g," ")}</Badge>)}</div>}
      </article>)}
      <details className="promo-secondary"><summary>Entender os preços<ChevronDown size={15} /></summary><div>Tabela é a referência da rodada; piso é o limite usado na decisão. O desconto extra, quando aplicado, altera o preço ofertável. Os valores de cada rodada permanecem registrados separadamente.</div></details>
    </div></Sheet>}
  </>;
}

const dataBr = (data: string) => data.slice(0,10).split("-").reverse().join("/");
const valor = (n: number | null) => n == null ? "—" : money(n);
