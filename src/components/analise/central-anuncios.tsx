"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, RefreshCw, Search, SlidersHorizontal, X, Download } from "lucide-react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Badge, Delta } from "@/components/ui/primitives";
import { FilterSheet, Field, Select } from "@/components/ui/controls";
import { FotoAnuncio } from "@/components/ui/foto-anuncio";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { BlocosDoSku } from "./blocos-sku";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DadosAnalise } from "@/lib/dados/analise";
import type { AnuncioAnalisado } from "@/lib/analise";
import { FILAS, prepararAnuncios, pertenceFila, resumoAnuncios, sinalAnuncio, type FilaAnuncios } from "@/lib/central-anuncios";
import { agrupaPorDia, atalhosPeriodo, coletaCompleta, coletaPorConta, periodoComparado, periodoValido, recortarAnuncio, totaisNoPeriodo, type ModoComparacao, type Periodo, type Totais } from "@/lib/periodo-anuncios";
import { variacao } from "@/lib/comparar";
import { money, moneyShort, count, pct, shortDate } from "@/lib/format";
import { linkDoAnuncio } from "@/lib/links";
import "./central-anuncios.css";

const ORDEM = [
  ["receita", "Maior receita"], ["vendas", "Mais unidades"], ["visitas", "Mais visitas"],
  ["conversao", "Maior conversão"], ["titulo", "Nome do anúncio"],
] as const;
type Ordem = typeof ORDEM[number][0];
type Aba = "desempenho" | "precos" | "produto";
const ABAS: { id: Aba; nome: string }[] = [{ id: "desempenho", nome: "Desempenho" }, { id: "precos", nome: "Preços" }, { id: "produto", nome: "Produto" }];
const data = (v?: string | null) => v ? new Date(v).toLocaleDateString("pt-BR", {timeZone:"America/Sao_Paulo"}) : "sem data";
const saldo = (a: AnuncioAnalisado) => a.estoque == null ? "Sem leitura" : a.estoque >= 40000 ? "Sob encomenda" : `${count(a.estoque)} un`;
const medido = (a: AnuncioAnalisado, valor: string) => a.semanas.length ? valor : "Sem histórico";
const MODOS: { id: ModoComparacao; nome: string }[] = [{ id: "anterior", nome: "Período anterior" }, { id: "mes", nome: "Mês anterior" }, { id: "ano", nome: "Ano anterior" }, { id: "livre", nome: "Escolher" }, { id: "nenhum", nome: "Nada" }];
/* O ano só aparece quando não é o corrente: "01/10 × 01/10" não diz nada. */
const dataCurta = (d: string, hoje: string) => d.slice(0,4) === hoje.slice(0,4) ? shortDate(d) : `${shortDate(d)}/${d.slice(2,4)}`;
const faixa = (p: Periodo, hoje: string) => p.de === p.ate ? dataCurta(p.de,hoje) : `${dataCurta(p.de,hoje)} – ${dataCurta(p.ate,hoje)}`;
const taxa = (t: Totais | null) => t?.visitas ? t.vendasComVisita / t.visitas * 100 : null;

/** A comparação de um número: variação e o valor de antes, que dá o tamanho dela. */
function Variacao({ atual, antes, formato, motivo }: { atual: number | null; antes: number | null; formato: (v: number) => string; motivo?: string }) {
  if (motivo) return <small className="ads-var">{motivo}</small>;
  const v = atual == null || antes == null ? null : variacao(atual, antes);
  if (v == null) return <small className="ads-var">sem base</small>;
  return <small className="ads-var"><Delta value={v}/> antes {formato(antes!)}</small>;
}

export default function CentralAnuncios({ dados, inicial }: { dados: DadosAnalise; inicial: { periodo: Periodo; modo: ModoComparacao; livre: Periodo | null } }) {
  const router = useRouter();
  const [busca, setBusca] = React.useState("");
  const termo = React.useDeferredValue(busca.trim().toLocaleLowerCase("pt-BR"));
  const [conta, setConta] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [recorte, setRecorte] = React.useState(inicial.periodo);
  const [modo, setModo] = React.useState(inicial.modo);
  const [livre, setLivre] = React.useState(inicial.livre);
  const [fila, setFila] = React.useState<FilaAnuncios>("todos");
  const [ordem, setOrdem] = React.useState<Ordem>("receita");
  const [filtros, setFiltros] = React.useState(false);
  const [id, setId] = React.useState<string | null>(null);
  const [marcados, setMarcados] = React.useState<string[]>([]);
  const [comparando, setComparando] = React.useState(false);
  const [atualizando, setAtualizando] = React.useState(false);
  const [aviso, setAviso] = React.useState("");
  const [erro, setErro] = React.useState(false);
  const detalheRef = React.useRef<HTMLElement>(null);
  const listaRef = React.useRef<HTMLElement>(null);
  const atalhos = React.useMemo(() => atalhosPeriodo(dados.hoje), [dados.hoje]);
  const coleta = React.useMemo(() => coletaPorConta(dados.anuncios), [dados.anuncios]);
  const base = React.useMemo(() => modo === "livre" ? livre : periodoComparado(recorte, modo), [modo, livre, recorte]);
  /* Base que começa antes do primeiro dado está pela metade: variação contra ela seria falsa. */
  const baseInteira = !!base && !!dados.primeiraData && base.de >= dados.primeiraData;
  const periodo = faixa(recorte, dados.hoje);
  const itens = React.useMemo(() => {
    const recortados = dados.anuncios.map(a => recortarAnuncio(a, recorte, coleta));
    return prepararAnuncios(recortados, [...new Set(recortados.flatMap(a => a.semanas.map(s => s.semana)))]);
  }, [dados.anuncios, recorte, coleta]);
  const contas = React.useMemo(() => [...new Set(itens.map(a=>a.conta))].sort(),[itens]);
  const recortados = React.useMemo(() => itens.filter(a => (!conta || a.conta===conta) && (!tipo || a.tipo===tipo) && (!status || a.status===status) && (!termo || `${a.titulo} ${a.sku} ${a.mlb}`.toLocaleLowerCase("pt-BR").includes(termo))),[itens,conta,tipo,status,termo]);
  const filtrados = React.useMemo(() => recortados.filter(a => pertenceFila(a,fila)).sort((a,b)=>{
    if (ordem === "titulo") return a.titulo.localeCompare(b.titulo,"pt-BR");
    if (!a.semanas.length !== !b.semanas.length) return a.semanas.length ? -1 : 1;
    return b.metricas[ordem]-a.metricas[ordem] || a.mlb.localeCompare(b.mlb);
  }),[recortados,fila,ordem]);
  const resumo = React.useMemo(()=>resumoAnuncios(filtrados),[filtrados]);
  const antes = React.useMemo(()=>{
    const mapa = new Map<string,Totais>();
    if (!base || !baseInteira) return mapa;
    for (const a of itens) { const t = totaisNoPeriodo(a,base,coleta); if (t) mapa.set(a.mlb,t); }
    return mapa;
  },[itens,base,baseInteira,coleta]);
  const totalAntes = React.useMemo(()=>{
    const t = { visitas:0,vendas:0,vendasComVisita:0,receita:0 };
    for (const a of filtrados) { const x = antes.get(a.mlb); if (x) { t.visitas+=x.visitas;t.vendas+=x.vendas;t.vendasComVisita+=x.vendasComVisita;t.receita+=x.receita; } }
    return t;
  },[filtrados,antes]);
  const contasNaTela = conta ? [conta] : contas;
  const visitasInteiras = coletaCompleta(contasNaTela,recorte,coleta);
  const motivoVisitas = !visitasInteiras || (base && !coletaCompleta(contasNaTela,base,coleta)) ? "coleta parcial" : undefined;
  /* Zero aqui seria mentira: ninguém mediu. */
  const semColeta = !visitasInteiras && resumo.visitas === 0;
  const { visible, pagination } = usePagination(filtrados,12);
  const selecionado = itens.find(a=>a.mlb===id);
  const comparados = itens.filter(a=>marcados.includes(a.mlb));

  React.useEffect(()=>{
    const ler = () => setId(new URLSearchParams(window.location.search).get("anuncio")?.toUpperCase() ?? null);
    ler(); window.addEventListener("popstate",ler);
    return ()=>window.removeEventListener("popstate",ler);
  },[]);
  React.useEffect(()=>{
    if (!selecionado || window.innerWidth >= 1100) return;
    detalheRef.current?.focus({preventScroll:true});
    detalheRef.current?.scrollIntoView({block:"start",behavior:"instant"});
  },[selecionado?.mlb]);
  function abrir(mlb: string | null, moverFoco = true) {
    const url = new URL(window.location.href);
    if (mlb) url.searchParams.set("anuncio",mlb); else url.searchParams.delete("anuncio");
    if (mlb && !id) window.history.pushState(null,"",url); else window.history.replaceState(null,"",url);
    setId(mlb); setComparando(false);
    if (!moverFoco) return;
    requestAnimationFrame(()=>{
      const alvo = mlb ? detalheRef.current : listaRef.current;
      alvo?.focus({preventScroll:true});
      if (window.innerWidth < 1100) alvo?.scrollIntoView({block:"start",behavior:"instant"});
    });
  }
  /* Na URL para sobreviver a recarga e a link; `replaceState` não recarrega a página. */
  function guardarPeriodo(p: Periodo, m: ModoComparacao, l: Periodo | null) {
    const url = new URL(window.location.href);
    url.searchParams.set("de",p.de); url.searchParams.set("ate",p.ate); url.searchParams.set("vs",m);
    if (m==="livre"&&l) { url.searchParams.set("vsde",l.de); url.searchParams.set("vsate",l.ate); } else { url.searchParams.delete("vsde"); url.searchParams.delete("vsate"); }
    window.history.replaceState(null,"",url);
  }
  function mudarPeriodo(p: Periodo) { setRecorte(p); guardarPeriodo(p,modo,livre); }
  function mudarModo(m: ModoComparacao) {
    const l = m==="livre" ? livre ?? periodoComparado(recorte,"anterior") : livre;
    setModo(m); setLivre(l); guardarPeriodo(recorte,m,l);
  }
  function mudarLivre(l: Periodo) { setLivre(l); guardarPeriodo(recorte,"livre",l); }
  function limpar() { setBusca("");setConta("");setTipo("");setStatus("");setFila("todos");abrir(null,false); }
  function marcar(mlb:string) { setMarcados(old=>old.includes(mlb)?old.filter(x=>x!==mlb):old.length<4?[...old,mlb]:old); }
  async function atualizar() {
    setAtualizando(true);setAviso("");setErro(false);
    try {
      const r=await fetch("/api/anuncios/precos",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mlbs:selecionado?[selecionado.mlb]:filtrados.map(a=>a.mlb)})});
      const j=await r.json(); if(!r.ok) throw new Error(j.erro||"Não foi possível atualizar os preços.");
      setAviso(`${count(j.recebidos-j.comErro)} preços atualizados${j.comErro?` · ${count(j.comErro)} sem resposta`:""}`); router.refresh();
    } catch(e) {setErro(true);setAviso(e instanceof Error?e.message:"Falha na atualização. Tente novamente.");}
    finally {setAtualizando(false);}
  }
  function exportar() {
    const campos=["MLB","SKU","Anúncio","Conta","Status","Receita","Unidades","Visitas","Conversão (%)","Vitrine (cadastro)","Estoque","Histórico no recorte"];
    const escapar=(v:unknown)=>`"${String(v??"").replace(/^[=+@\-]/,"'$&").replaceAll('"','""')}"`;
    const linhas=filtrados.map(a=>[a.mlb,a.sku,a.titulo,a.conta,a.status,a.semanas.length?a.metricas.receita:null,a.semanas.length?a.metricas.vendas:null,a.semanas.length?a.metricas.visitas:null,a.metricas.visitas?a.metricas.conversao:null,a.precoAtual,a.estoque,a.semanas.length?"Sim":"Não"]);
    const url=URL.createObjectURL(new Blob(["\uFEFF"+[campos,...linhas].map(l=>l.map(escapar).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download="anuncios.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  return <>
    <PageHeader title="Anúncios" breadcrumb="Mercado Livre" areaNavigation={false} actions={<><Button onClick={()=>setFiltros(true)}><SlidersHorizontal size={16}/>Filtros{[conta,tipo,status].filter(Boolean).length>0?` (${[conta,tipo,status].filter(Boolean).length})`:""}</Button><Button className="hidden md:inline-flex" onClick={exportar} disabled={!filtrados.length}><Download size={16}/>CSV</Button></>} />
    <PageBody className="ads-center">
      <div className="ads-period">
        <div role="group" aria-label="Período"><span>Período</span><div className="ads-chips">{atalhos.map(x=><button type="button" key={x.id} aria-pressed={x.de===recorte.de&&x.ate===recorte.ate} onClick={()=>mudarPeriodo({de:x.de,ate:x.ate})}>{x.nome}</button>)}</div><div className="ads-dates"><input type="date" aria-label="Data inicial" min={dados.primeiraData??undefined} max={dados.hoje} value={recorte.de} onChange={e=>{const p=periodoValido(e.target.value,recorte.ate);if(p)mudarPeriodo(p);}}/><input type="date" aria-label="Data final" min={dados.primeiraData??undefined} max={dados.hoje} value={recorte.ate} onChange={e=>{const p=periodoValido(recorte.de,e.target.value);if(p)mudarPeriodo(p);}}/></div></div>
        <div role="group" aria-label="Comparar com"><span>Comparar com</span><div className="ads-chips">{MODOS.map(x=><button type="button" key={x.id} aria-pressed={modo===x.id} onClick={()=>mudarModo(x.id)}>{x.nome}</button>)}</div>{modo==="livre"&&livre&&<div className="ads-dates"><input type="date" aria-label="Início da comparação" min={dados.primeiraData??undefined} max={dados.hoje} value={livre.de} onChange={e=>{const p=periodoValido(e.target.value,livre.ate);if(p)mudarLivre(p);}}/><input type="date" aria-label="Fim da comparação" min={dados.primeiraData??undefined} max={dados.hoje} value={livre.ate} onChange={e=>{const p=periodoValido(livre.de,e.target.value);if(p)mudarLivre(p);}}/></div>}</div>
      </div>
      <div className="ads-context"><span>{periodo}{recorte.ate>=dados.hoje?" · hoje parcial":""}{base?` × ${faixa(base,dados.hoje)}`:""}{base&&!baseInteira&&dados.primeiraData?` · sem dado antes de ${dataCurta(dados.primeiraData,dados.hoje)}`:""}</span><span>{conta || "Todas as contas"}</span><details><summary>Ferramentas</summary><nav><Link href="/anuncios/tipo">Clássico e Premium</Link><Link href="/anuncios/catalogo">Catálogo</Link><Link href="/anuncios/preco-ideal">Preço de referência</Link><Link href="/anuncios/trafego-pago">Tráfego pago</Link><Link href="/importar">Importar dados</Link><button type="button" onClick={exportar} disabled={!filtrados.length}>Exportar CSV</button></nav></details></div>
      <div className="ads-summary" aria-label="Totais dos resultados filtrados">
        <div><span>Receita</span><strong>{resumo.medidos?money(resumo.receita):"Sem histórico"}</strong>{base&&<Variacao atual={resumo.receita} antes={baseInteira?totalAntes.receita:null} formato={moneyShort}/>}</div>
        <div><span>Unidades</span><strong>{resumo.medidos?count(resumo.vendas):"—"}</strong>{base&&<Variacao atual={resumo.vendas} antes={baseInteira?totalAntes.vendas:null} formato={count}/>}</div>
        <div><span>Visitas</span><strong>{semColeta?"Sem coleta":resumo.medidos?count(resumo.visitas):"—"}</strong>{semColeta?null:base?<Variacao atual={resumo.visitas} antes={baseInteira?totalAntes.visitas:null} formato={count} motivo={motivoVisitas}/>:motivoVisitas&&<small className="ads-var">{motivoVisitas}</small>}</div>
        <div><span>Conversão</span><strong>{resumo.conversao==null?"Sem base":pct(resumo.conversao,2)}</strong>{base&&<Variacao atual={resumo.conversao} antes={baseInteira?taxa(totalAntes):null} formato={v=>pct(v,2)}/>}</div>
      </div>
      <div className="ads-search"><Search size={19}/><input aria-label="Buscar anúncios" value={busca} onChange={e=>{setBusca(e.target.value);abrir(null,false);}} placeholder="Nome, SKU ou MLB"/>{busca&&<button aria-label="Limpar busca" onClick={()=>setBusca("")}><X size={18}/></button>}</div>
      <div className="ads-queues" role="group" aria-label="Filtrar anúncios por situação">{FILAS.map(f=><button type="button" key={f.id} aria-pressed={fila===f.id} onClick={()=>{setFila(f.id);abrir(null,false);}}>{f.nome}<span>{count(recortados.filter(a=>pertenceFila(a,f.id)).length)}</span></button>)}</div>
      <div className="ads-list-toolbar"><span aria-live="polite">{count(filtrados.length)} anúncios · {count(resumo.medidos)} com histórico</span><label>Ordenar<Select aria-label="Ordenar anúncios" value={ordem} onChange={e=>setOrdem(e.target.value as Ordem)}>{ORDEM.map(([v,n])=><option key={v} value={v}>{n}</option>)}</Select></label></div>
      {aviso&&<p role={erro?"alert":"status"} className={erro?"text-down":"text-ink-2"}>{aviso}</p>}
      {marcados.length>0&&<div className="ads-compare-bar"><span>{marcados.length}/4 selecionados</span><Button disabled={marcados.length<2} onClick={()=>{abrir(null);setComparando(true);}}>Comparar</Button><Button onClick={()=>{setMarcados([]);setComparando(false);}}>Limpar seleção</Button></div>}
      {comparando ? <Comparacao itens={comparados} voltar={()=>setComparando(false)}/> : <div className={`ads-workspace ${selecionado?"ads-has-selection":""}`}>
        <section ref={listaRef} tabIndex={-1} className="ads-list" aria-label="Lista de anúncios">
          {!filtrados.length&&<div className="ads-empty"><h2>Nenhum anúncio encontrado</h2><p>Revise a busca ou os filtros.</p><Button onClick={limpar}>Limpar filtros</Button></div>}
          {visible.map(a=>{const sinal=sinalAnuncio(a);return <article className="ads-row" key={a.mlb} data-selected={a.mlb===id}>
            <button type="button" className="ads-row-open" onClick={()=>abrir(a.mlb)} aria-label={`Ver anúncio ${a.mlb}`} aria-pressed={a.mlb===id}>
              <FotoAnuncio mlb={a.mlb} tamanho={48}/><div className="ads-row-name"><h2>{a.titulo}</h2><span>{a.sku || "Sem SKU"} · {a.mlb}</span><small>{a.conta} · {a.tipo}</small></div><ArrowRight size={17}/>
              <div className="ads-row-values"><div><span>Receita</span><strong>{medido(a,money(a.metricas.receita))}</strong><DeltaLinha atual={a.semanas.length?a.metricas.receita:null} antes={antes.get(a.mlb)?.receita}/></div><div><span>Unidades</span><strong>{medido(a,count(a.metricas.vendas))}</strong></div><div><span>Estoque</span><strong>{saldo(a)}</strong></div></div>
            </button><div className="ads-row-footer"><Badge tone={sinal.tom}>{sinal.texto}</Badge><label><input type="checkbox" aria-label={`Comparar ${a.mlb}`} checked={marcados.includes(a.mlb)} disabled={!marcados.includes(a.mlb)&&marcados.length>=4} onChange={()=>marcar(a.mlb)}/>Comparar</label></div>
          </article>;})}
          <Pagination {...pagination}/>
        </section>
        <section ref={detalheRef} tabIndex={-1} className="ads-inspector" aria-label="Detalhes do anúncio">
          {selecionado ? <Detalhe key={selecionado.mlb} item={selecionado} periodo={periodo} porDia={agrupaPorDia(recorte)} antes={base&&baseInteira?antes.get(selecionado.mlb)??null:base?null:undefined} motivoVisitas={!coletaCompleta([selecionado.conta],recorte,coleta)||(base&&!coletaCompleta([selecionado.conta],base,coleta))?"coleta parcial":undefined} itens={itens} fechar={()=>abrir(null)} abrir={abrir} atualizar={atualizar} atualizando={atualizando}/> : <div className="ads-empty"><Search size={28}/><h2>Selecione um anúncio</h2><p>Desempenho, preços e estoque no mesmo lugar.</p></div>}
        </section>
      </div>}
      {id&&!selecionado&&<p role="status">Anúncio não encontrado nesta operação.</p>}
      {filtros&&<FilterSheet onClose={()=>setFiltros(false)} onClear={limpar} applyLabel={`Ver ${count(filtrados.length)} anúncios`}>
        <Field label="Conta"><Select aria-label="Conta" value={conta} onChange={e=>{setConta(e.target.value);abrir(null,false);}}><option value="">Todas as contas</option>{contas.map(c=><option key={c}>{c}</option>)}</Select></Field>
        <Field label="Tipo"><Select aria-label="Tipo" value={tipo} onChange={e=>{setTipo(e.target.value);abrir(null,false);}}><option value="">Todos</option><option>Clássico</option><option>Premium</option></Select></Field>
        <Field label="Situação"><Select aria-label="Situação" value={status} onChange={e=>{setStatus(e.target.value);abrir(null,false);}}><option value="">Todas</option><option value="ativo">Ativos</option><option value="pausado">Pausados</option><option value="finalizado">Finalizados</option></Select></Field>
      </FilterSheet>}
    </PageBody>
  </>;
}

function DeltaLinha({atual,antes}:{atual:number|null;antes?:number}) {const v=atual==null||antes==null?null:variacao(atual,antes);return v==null?null:<Delta value={v}/>;}

function Dado({nome,valor,nota,variacao}:{nome:string;valor:React.ReactNode;nota?:string;variacao?:React.ReactNode}) {return <div><dt>{nome}</dt><dd>{valor}</dd>{variacao}{nota&&<small>{nota}</small>}</div>;}

function Detalhe({item:a,periodo,porDia,antes,motivoVisitas,itens,fechar,abrir,atualizar,atualizando}:{item:AnuncioAnalisado;periodo:string;porDia:boolean;antes:Totais|null|undefined;motivoVisitas?:string;itens:AnuncioAnalisado[];fechar:()=>void;abrir:(id:string)=>void;atualizar:()=>void;atualizando:boolean}) {
  const [aba,setAba]=React.useState<Aba>("desempenho");
  const [serie,setSerie]=React.useState<"vendas"|"visitas"|"receita">("vendas");
  const m=a.metricas;
  const ref=m.precoIdeal || a.precoReferencia;
  const ultimaVenda=[...a.semanas].reverse().find(s=>s.vendas>0);
  const ultimaVitrine=[...a.semanas].reverse().find(s=>s.precoAnunciado!=null);
  const linkCanal=linkDoAnuncio(a.mlb);
  const unidade=porDia?"dia":"semana";
  /* `undefined`: sem comparação escolhida. `null`: escolhida, sem movimento no período dela. */
  const compara=antes!==undefined;
  return <>
    <div className="ads-inspector-head"><Button onClick={fechar}><ArrowLeft size={16}/>Voltar à lista</Button>{linkCanal&&<a href={linkCanal} target="_blank" rel="noreferrer" aria-label="Abrir no Mercado Livre">Mercado Livre <ExternalLink size={14}/></a>}</div>
    <div className="ads-identity"><FotoAnuncio mlb={a.mlb} tamanho={64}/><div><span>{a.mlb} · {a.tipo}</span><h2>{a.titulo}</h2><small>{a.conta} · {a.status}</small></div></div>
    <div role="tablist" aria-label="Dados do anúncio" className="ads-tabs">{ABAS.map((t,i)=><button role="tab" type="button" id={`ads-tab-${t.id}`} tabIndex={aba===t.id?0:-1} aria-selected={aba===t.id} aria-controls={`ads-panel-${t.id}`} key={t.id} onClick={()=>setAba(t.id)} onKeyDown={e=>{
      const proxima=e.key==="ArrowRight"?(i+1)%ABAS.length:e.key==="ArrowLeft"?(i+ABAS.length-1)%ABAS.length:e.key==="Home"?0:e.key==="End"?ABAS.length-1:null;
      if(proxima==null)return;
      e.preventDefault();setAba(ABAS[proxima].id);document.getElementById(`ads-tab-${ABAS[proxima].id}`)?.focus();
    }}>{t.nome}</button>)}</div>
    <div role="tabpanel" id={`ads-panel-${aba}`} aria-labelledby={`ads-tab-${aba}`} className="ads-detail-body">
      {aba==="desempenho"&&<>
        <p className="ads-source">{periodo}</p>
        <dl className="ads-metrics"><Dado nome="Receita" valor={medido(a,money(m.receita))} variacao={compara&&<Variacao atual={m.receita} antes={antes?.receita??null} formato={moneyShort}/>}/><Dado nome="Unidades" valor={medido(a,count(m.vendas))} variacao={compara&&<Variacao atual={m.vendas} antes={antes?.vendas??null} formato={count}/>}/><Dado nome="Visitas" valor={m.visitas===0&&motivoVisitas?"Sem coleta":medido(a,count(m.visitas))} variacao={compara&&m.visitas>0&&<Variacao atual={m.visitas} antes={antes?.visitas??null} formato={count} motivo={motivoVisitas}/>}/><Dado nome="Conversão" valor={m.visitas?pct(m.conversao,2):"Sem base"} variacao={compara&&<Variacao atual={m.visitas?m.conversao:null} antes={taxa(antes??null)} formato={v=>pct(v,2)}/>}/></dl>
        {a.semanas.length>0?<>
          <div className="ads-chart-switch" role="group" aria-label="Métrica no período">{([['vendas','Unidades'],['visitas','Visitas'],['receita','Receita']] as const).map(([v,n])=><button key={v} aria-pressed={serie===v} onClick={()=>setSerie(v)}>{n}</button>)}</div>
          <div className="ads-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={a.semanas} margin={{top:12,right:8,bottom:0,left:0}}><XAxis dataKey="semana" tick={{fontSize:11,fill:"var(--ink-3)"}} axisLine={false} tickLine={false} minTickGap={20}/><YAxis width={50} tick={{fontSize:11,fill:"var(--ink-3)"}} tickLine={false} axisLine={false} tickFormatter={v=>serie==='receita'?`${Math.round(v/1000)} mil`:count(v)}/><Tooltip formatter={v=>serie==='receita'?money(Number(v)):count(Number(v))} contentStyle={{background:"var(--panel)",border:"1px solid var(--line)",borderRadius:8}}/><Bar dataKey={serie} name={serie==='vendas'?'Unidades':serie==='visitas'?'Visitas':'Receita'} fill="var(--s1)" radius={[3,3,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>
          <details className="ads-disclosure"><summary>Valores por {unidade}</summary><div className="ads-week-table"><table><thead><tr><th>{porDia?"Dia":"Semana"}</th><th>Unidades</th><th>Visitas</th><th>Receita</th></tr></thead><tbody>{a.semanas.map(s=><tr key={s.semana}><th scope="row">{s.intervalo}</th><td>{count(s.vendas)}</td><td>{count(s.visitas)}</td><td>{money(s.receita)}</td></tr>)}</tbody></table></div></details>
        </>:<div className="ads-empty"><h3>Sem histórico neste período</h3><p>Preço e estoque continuam disponíveis nas outras abas.</p></div>}
        <details className="ads-disclosure"><summary>Critérios dos filtros</summary><p>“Abaixo/acima da tabela” exige diferença de pelo menos 3% em relação à referência. “Baixa conversão” reúne mais visitas e menos conversão que a média dos anúncios com histórico. “Poucas visitas” exige pelo menos duas vendas e conversão acima dessa média. São sinais para investigar, não causas confirmadas.</p></details>
      </>}
      {aba==="precos"&&<>
        <dl className="ads-price-grid"><Dado nome="Vitrine · cadastro" valor={a.precoAtual==null?"Sem leitura":money(a.precoAtual)} nota={`Sincronização: ${data(a.sincronizadoEm)}`}/><Dado nome="Preço de referência" valor={ref?money(ref):"Sem referência"} nota="Fórmula base"/><Dado nome="Preço pago" valor={m.precoPraticado==null?"Sem venda":money(m.precoPraticado)} nota={ultimaVenda?`Média · ${ultimaVenda.semana}`:undefined}/><Dado nome="Vitrine no período" valor={m.precoVitrine==null?"Sem leitura":money(m.precoVitrine)} nota={ultimaVitrine?.semana}/></dl>
        <Button onClick={atualizar} disabled={atualizando}><RefreshCw size={16} className={atualizando?"animate-spin":""}/>{atualizando?"Consultando…":"Atualizar este preço"}</Button>
        <dl className="ads-price-grid"><Dado nome="Tarifa cobrada" valor={m.tarifaCobrada==null?"Sem leitura":pct(m.tarifaCobrada,2)} nota={`${pct(m.coberturaTarifa*100)} da receita coberta`}/><Dado nome="Diferença acumulada" valor={a.semanas.length&&ref?money(m.subsidio):"Sem base"} nota="Vendas abaixo da referência"/></dl>
        <details className="ads-disclosure"><summary>Como comparar os preços</summary><p>O preço pago é a média do último {unidade} com venda. A vitrine é o preço publicado na última leitura da semana. A referência vem da Fórmula base; quando não existe referência histórica, usa a fórmula atual. A diferença acumulada soma valores abaixo dessa referência e não representa perda de lucro.</p></details>
        <details className="ads-disclosure"><summary>Preços por {unidade}</summary><div className="ads-week-table"><table><thead><tr><th>{porDia?"Dia":"Semana"}</th><th>Pago</th><th>Vitrine</th><th>Tarifa cobrada</th></tr></thead><tbody>{a.semanas.map(s=><tr key={s.semana}><th scope="row">{s.intervalo}</th><td>{s.precoRealizado==null?"Sem venda":money(s.precoRealizado)}</td><td>{s.precoAnunciado==null?"Sem leitura":money(s.precoAnunciado)}</td><td>{s.tarifaCobrada==null?"Sem leitura":pct(s.tarifaCobrada,2)}</td></tr>)}</tbody></table>{!a.semanas.length&&<p>Sem histórico neste período.</p>}</div></details>
      </>}
      {aba==="produto"&&<>
        <dl className="ads-price-grid"><Dado nome="SKU" valor={a.sku||"Sem SKU"}/><Dado nome="Estoque no anúncio" valor={saldo(a)} nota={data(a.sincronizadoEm)}/></dl>
        <BlocosDoSku sku={a.sku} atual={a.mlb} selecionar={mlb=>{if(itens.some(i=>i.mlb===mlb))abrir(mlb);}}/>
      </>}
    </div>
  </>;
}

function Comparacao({itens,voltar}:{itens:AnuncioAnalisado[];voltar:()=>void}) {
  const linhas:[string,(a:AnuncioAnalisado)=>string][]=[
    ["Conta",a=>a.conta],["Tipo",a=>a.tipo],["Situação",a=>a.status],["Receita",a=>medido(a,money(a.metricas.receita))],
    ["Unidades",a=>medido(a,count(a.metricas.vendas))],["Visitas",a=>medido(a,count(a.metricas.visitas))],
    ["Conversão",a=>a.metricas.visitas?pct(a.metricas.conversao,2):"Sem base"],["Preço pago",a=>a.metricas.precoPraticado==null?"Sem venda":money(a.metricas.precoPraticado)],
    ["Vitrine · cadastro",a=>a.precoAtual==null?"Sem leitura":money(a.precoAtual)],["Estoque",saldo],
  ];
  return <section className="ads-comparison"><Button onClick={voltar}><ArrowLeft size={16}/>Voltar à lista</Button><h2>Comparar anúncios</h2><div className="ads-week-table" tabIndex={0} role="region" aria-label="Comparação de anúncios. Deslize para ver todos."><table><thead><tr><th>Métrica</th>{itens.map(a=><th key={a.mlb}>{a.mlb}<small>{a.titulo}</small></th>)}</tr></thead><tbody>{linhas.map(([nome,valor])=><tr key={nome}><th scope="row">{nome}</th>{itens.map(a=><td key={a.mlb}>{valor(a)}</td>)}</tr>)}</tbody></table></div></section>;
}
