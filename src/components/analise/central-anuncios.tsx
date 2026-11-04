"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, RefreshCw, Search, SlidersHorizontal, X, Download } from "lucide-react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Badge } from "@/components/ui/primitives";
import { FilterSheet, Field, Select, Checkbox } from "@/components/ui/controls";
import { FotoAnuncio } from "@/components/ui/foto-anuncio";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { BlocosDoSku } from "./blocos-sku";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DadosAnalise } from "@/lib/dados/analise";
import type { AnuncioAnalisado } from "@/lib/analise";
import { FILAS, prepararAnuncios, pertenceFila, resumoAnuncios, sinalAnuncio, type FilaAnuncios } from "@/lib/central-anuncios";
import { money, count, pct, shortDate } from "@/lib/format";
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

export default function CentralAnuncios({ dados }: { dados: DadosAnalise }) {
  const router = useRouter();
  const [busca, setBusca] = React.useState("");
  const termo = React.useDeferredValue(busca.trim().toLocaleLowerCase("pt-BR"));
  const [conta, setConta] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [recorte, setRecorte] = React.useState(8);
  const [parcial, setParcial] = React.useState(false);
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
  const emCurso = dados.semanas.find(s => s.parcial);
  const base = React.useMemo(() => dados.semanas.filter(s => parcial || !s.parcial), [dados.semanas, parcial]);
  const quantidade = Math.min(recorte, base.length);
  const semanas = React.useMemo(() => quantidade ? base.slice(-quantidade) : [], [base, quantidade]);
  const chaves = React.useMemo(() => semanas.map(s => s.semana), [semanas]);
  const periodo = semanas.length ? `${shortDate(semanas[0].inicio)} – ${shortDate(semanas.at(-1)!.fim)}` : "Sem histórico semanal";
  const opcoes = [...new Set([4,8,12,26,52,base.length].filter(n => n > 0 && n <= base.length))].sort((a,b)=>a-b);
  const itens = React.useMemo(() => prepararAnuncios(dados.anuncios,chaves),[dados.anuncios,chaves]);
  const contas = React.useMemo(() => [...new Set(itens.map(a=>a.conta))].sort(),[itens]);
  const recortados = React.useMemo(() => itens.filter(a => (!conta || a.conta===conta) && (!tipo || a.tipo===tipo) && (!status || a.status===status) && (!termo || `${a.titulo} ${a.sku} ${a.mlb}`.toLocaleLowerCase("pt-BR").includes(termo))),[itens,conta,tipo,status,termo]);
  const filtrados = React.useMemo(() => recortados.filter(a => pertenceFila(a,fila)).sort((a,b)=>{
    if (ordem === "titulo") return a.titulo.localeCompare(b.titulo,"pt-BR");
    if (!a.semanas.length !== !b.semanas.length) return a.semanas.length ? -1 : 1;
    return b.metricas[ordem]-a.metricas[ordem] || a.mlb.localeCompare(b.mlb);
  }),[recortados,fila,ordem]);
  const resumo = React.useMemo(()=>resumoAnuncios(filtrados),[filtrados]);
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
      <div className="ads-context"><span>{periodo}{parcial&&emCurso?" · inclui semana parcial":""}</span><span>{conta || "Todas as contas"}</span><details><summary>Ferramentas</summary><nav><Link href="/anuncios/tipo">Clássico e Premium</Link><Link href="/anuncios/catalogo">Catálogo</Link><Link href="/anuncios/preco-ideal">Preço de referência</Link><Link href="/anuncios/trafego-pago">Tráfego pago</Link><Link href="/importar">Importar dados</Link><button type="button" onClick={exportar} disabled={!filtrados.length}>Exportar CSV</button></nav></details></div>
      <div className="ads-summary" aria-label="Totais dos resultados filtrados">
        <div><span>Receita</span><strong>{resumo.medidos?money(resumo.receita):"Sem histórico"}</strong></div>
        <div><span>Unidades</span><strong>{resumo.medidos?count(resumo.vendas):"—"}</strong></div>
        <div><span>Visitas</span><strong>{resumo.medidos?count(resumo.visitas):"—"}</strong></div>
        <div><span>Conversão</span><strong>{resumo.conversao==null?"Sem base":pct(resumo.conversao,2)}</strong></div>
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
              <div className="ads-row-values"><div><span>Receita</span><strong>{medido(a,money(a.metricas.receita))}</strong></div><div><span>Unidades</span><strong>{medido(a,count(a.metricas.vendas))}</strong></div><div><span>Estoque</span><strong>{saldo(a)}</strong></div></div>
            </button><div className="ads-row-footer"><Badge tone={sinal.tom}>{sinal.texto}</Badge><label><input type="checkbox" aria-label={`Comparar ${a.mlb}`} checked={marcados.includes(a.mlb)} disabled={!marcados.includes(a.mlb)&&marcados.length>=4} onChange={()=>marcar(a.mlb)}/>Comparar</label></div>
          </article>;})}
          <Pagination {...pagination}/>
        </section>
        <section ref={detalheRef} tabIndex={-1} className="ads-inspector" aria-label="Detalhes do anúncio">
          {selecionado ? <Detalhe key={selecionado.mlb} item={selecionado} periodo={periodo} itens={itens} fechar={()=>abrir(null)} abrir={abrir} atualizar={atualizar} atualizando={atualizando}/> : <div className="ads-empty"><Search size={28}/><h2>Selecione um anúncio</h2><p>Desempenho, preços e estoque no mesmo lugar.</p></div>}
        </section>
      </div>}
      {id&&!selecionado&&<p role="status">Anúncio não encontrado nesta operação.</p>}
      {filtros&&<FilterSheet onClose={()=>setFiltros(false)} onClear={limpar} applyLabel={`Ver ${count(filtrados.length)} anúncios`}>
        <Field label="Conta"><Select aria-label="Conta" value={conta} onChange={e=>{setConta(e.target.value);abrir(null,false);}}><option value="">Todas as contas</option>{contas.map(c=><option key={c}>{c}</option>)}</Select></Field>
        <Field label="Período"><Select aria-label="Período" value={quantidade} disabled={!base.length} onChange={e=>setRecorte(Number(e.target.value))}>{!base.length&&<option value={0}>Sem histórico</option>}{opcoes.map(n=><option value={n} key={n}>{n} semanas</option>)}</Select></Field>
        {emCurso&&<Checkbox checked={parcial} onChange={setParcial} label={`Incluir semana em curso · ${emCurso.dias} de 7 dias`}/>}
        <Field label="Tipo"><Select aria-label="Tipo" value={tipo} onChange={e=>{setTipo(e.target.value);abrir(null,false);}}><option value="">Todos</option><option>Clássico</option><option>Premium</option></Select></Field>
        <Field label="Situação"><Select aria-label="Situação" value={status} onChange={e=>{setStatus(e.target.value);abrir(null,false);}}><option value="">Todas</option><option value="ativo">Ativos</option><option value="pausado">Pausados</option><option value="finalizado">Finalizados</option></Select></Field>
      </FilterSheet>}
    </PageBody>
  </>;
}

function Dado({nome,valor,nota}:{nome:string;valor:React.ReactNode;nota?:string}) {return <div><dt>{nome}</dt><dd>{valor}</dd>{nota&&<small>{nota}</small>}</div>;}

function Detalhe({item:a,periodo,itens,fechar,abrir,atualizar,atualizando}:{item:AnuncioAnalisado;periodo:string;itens:AnuncioAnalisado[];fechar:()=>void;abrir:(id:string)=>void;atualizar:()=>void;atualizando:boolean}) {
  const [aba,setAba]=React.useState<Aba>("desempenho");
  const [serie,setSerie]=React.useState<"vendas"|"visitas"|"receita">("vendas");
  const m=a.metricas;
  const ref=m.precoIdeal || a.precoReferencia;
  const ultimaVenda=[...a.semanas].reverse().find(s=>s.vendas>0);
  const ultimaVitrine=[...a.semanas].reverse().find(s=>s.precoAnunciado!=null);
  const linkCanal=linkDoAnuncio(a.mlb);
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
        <p className="ads-source">{periodo} · {a.semanas.length} semanas com registro</p>
        <dl className="ads-metrics"><Dado nome="Receita" valor={medido(a,money(m.receita))}/><Dado nome="Unidades" valor={medido(a,count(m.vendas))}/><Dado nome="Visitas" valor={medido(a,count(m.visitas))}/><Dado nome="Conversão" valor={m.visitas?pct(m.conversao,2):"Sem base"}/></dl>
        {a.semanas.length>0?<>
          <div className="ads-chart-switch" role="group" aria-label="Métrica por semana">{([['vendas','Unidades'],['visitas','Visitas'],['receita','Receita']] as const).map(([v,n])=><button key={v} aria-pressed={serie===v} onClick={()=>setSerie(v)}>{n}</button>)}</div>
          <div className="ads-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={a.semanas} margin={{top:12,right:8,bottom:0,left:0}}><XAxis dataKey="semana" tick={{fontSize:11,fill:"var(--ink-3)"}} axisLine={false} tickLine={false} minTickGap={20}/><YAxis width={50} tick={{fontSize:11,fill:"var(--ink-3)"}} tickLine={false} axisLine={false} tickFormatter={v=>serie==='receita'?`${Math.round(v/1000)} mil`:count(v)}/><Tooltip formatter={v=>serie==='receita'?money(Number(v)):count(Number(v))} contentStyle={{background:"var(--panel)",border:"1px solid var(--line)",borderRadius:8}}/><Bar dataKey={serie} name={serie==='vendas'?'Unidades':serie==='visitas'?'Visitas':'Receita'} fill="var(--s1)" radius={[3,3,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>
          <details className="ads-disclosure"><summary>Valores por semana</summary><div className="ads-week-table"><table><thead><tr><th>Semana</th><th>Unidades</th><th>Visitas</th><th>Receita</th></tr></thead><tbody>{a.semanas.map(s=><tr key={s.semana}><th scope="row">{s.semana}<small>{s.intervalo}</small></th><td>{count(s.vendas)}</td><td>{count(s.visitas)}</td><td>{money(s.receita)}</td></tr>)}</tbody></table></div></details>
        </>:<div className="ads-empty"><h3>Sem histórico neste período</h3><p>Preço e estoque continuam disponíveis nas outras abas.</p></div>}
        <details className="ads-disclosure"><summary>Critérios dos filtros</summary><p>“Abaixo/acima da tabela” exige diferença de pelo menos 3% em relação à referência. “Baixa conversão” reúne mais visitas e menos conversão que a média dos anúncios com histórico. “Poucas visitas” exige pelo menos duas vendas e conversão acima dessa média. São sinais para investigar, não causas confirmadas.</p></details>
      </>}
      {aba==="precos"&&<>
        <dl className="ads-price-grid"><Dado nome="Vitrine · cadastro" valor={a.precoAtual==null?"Sem leitura":money(a.precoAtual)} nota={`Sincronização: ${data(a.sincronizadoEm)}`}/><Dado nome="Preço de referência" valor={ref?money(ref):"Sem referência"} nota="Fórmula base"/><Dado nome="Preço pago" valor={m.precoPraticado==null?"Sem venda":money(m.precoPraticado)} nota={ultimaVenda?`Média · ${ultimaVenda.semana}`:undefined}/><Dado nome="Vitrine no período" valor={m.precoVitrine==null?"Sem leitura":money(m.precoVitrine)} nota={ultimaVitrine?.semana}/></dl>
        <Button onClick={atualizar} disabled={atualizando}><RefreshCw size={16} className={atualizando?"animate-spin":""}/>{atualizando?"Consultando…":"Atualizar este preço"}</Button>
        <dl className="ads-price-grid"><Dado nome="Tarifa cobrada" valor={m.tarifaCobrada==null?"Sem leitura":pct(m.tarifaCobrada,2)} nota={`${pct(m.coberturaTarifa*100)} da receita coberta`}/><Dado nome="Diferença acumulada" valor={a.semanas.length&&ref?money(m.subsidio):"Sem base"} nota="Vendas abaixo da referência"/></dl>
        <details className="ads-disclosure"><summary>Como comparar os preços</summary><p>O preço pago é a média da última semana com venda. A vitrine é o preço publicado na última leitura. A referência vem da Fórmula base; quando não existe referência histórica, usa a fórmula atual. A diferença acumulada soma valores abaixo dessa referência e não representa perda de lucro.</p></details>
        <details className="ads-disclosure"><summary>Preços por semana</summary><div className="ads-week-table"><table><thead><tr><th>Semana</th><th>Pago</th><th>Vitrine</th><th>Tarifa cobrada</th></tr></thead><tbody>{a.semanas.map(s=><tr key={s.semana}><th scope="row">{s.semana}</th><td>{s.precoRealizado==null?"Sem venda":money(s.precoRealizado)}</td><td>{s.precoAnunciado==null?"Sem leitura":money(s.precoAnunciado)}</td><td>{s.tarifaCobrada==null?"Sem leitura":pct(s.tarifaCobrada,2)}</td></tr>)}</tbody></table>{!a.semanas.length&&<p>Sem histórico neste período.</p>}</div></details>
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
