"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { BookOpen, LocateFixed, Minus, X } from "lucide-react";
import { TOUR_REAL, capituloDaRotaTourReal, caminhoTourReal, type AlvoTourReal } from "@/lib/demo/tour";
import { passoVisual } from "@/lib/demo/tour-curto";
import "./tour-real.css";

const CHAVE = "gerizo:demo:tour-real:v1";
type Estado = { capitulo: string; passo: number; ativo: boolean; compacto: boolean; terminou: boolean };
type Props = {
  pathname: string;
  navegar: (href: string) => void;
  iniciar?: boolean;
  onActiveChange?: (ativo: boolean) => void;
  documentoAlvo?: Document | null;
};

function indiceValido(capitulo: string, passo: number) {
  const c = TOUR_REAL.find(c => c.id === capitulo);
  return c && Number.isInteger(passo) && passo >= 0 && passo < c.passos.length;
}
function localizarAlvo(doc: Document, alvo: AlvoTourReal) {
  try {
    const texto = alvo.texto?.toLocaleLowerCase("pt-BR");
    const candidatos = [...doc.querySelectorAll<HTMLElement>(alvo.seletor)].filter(el =>
      !el.closest(".gerizo-real-tour") &&
      (!texto || (el.textContent ?? "").toLocaleLowerCase("pt-BR").includes(texto))
    );
    return candidatos.find(el=>el.getClientRects().length>0) ?? candidatos.find(el=>el.closest("details")) ?? null;
  } catch { return null; }
}

/** Abre visualizações de leitura. Alterações e decisões continuam nas mãos da pessoa. */
export function TourReal({ pathname, navegar, iniciar = false, onActiveChange, documentoAlvo }: Props) {
  const caminho = caminhoTourReal(pathname);
  const tituloId = React.useId();
  const [estado, setEstado] = React.useState<Estado>(() => ({
    capitulo: capituloDaRotaTourReal(caminho)?.id ?? TOUR_REAL[0].id,
    passo: 0, ativo: iniciar, compacto: !iniciar, terminou: false,
  }));
  const [pronto, setPronto] = React.useState(false);
  const [temAlvo, setTemAlvo] = React.useState(false);
  const [portal, setPortal] = React.useState<HTMLElement | null>(null);
  const [aviso, setAviso] = React.useState("");
  const coach = React.useRef<HTMLDivElement>(null);
  const alvoAtual = React.useRef<HTMLElement | null>(null);
  const ultimaRota = React.useRef(caminho);
  const inicioAnterior = React.useRef(iniciar);
  const callback = React.useRef(onActiveChange);
  callback.current = onActiveChange;

  React.useEffect(() => {
    if (!iniciar) {
      try {
        const salvo = JSON.parse(sessionStorage.getItem(CHAVE) ?? "null") as Partial<Estado> | null;
        if (salvo && typeof salvo.capitulo === "string" && typeof salvo.passo === "number" && indiceValido(salvo.capitulo, salvo.passo)) {
          const capituloDaTela = capituloDaRotaTourReal(caminho);
          const mesmoCapitulo = capituloDaTela?.id === salvo.capitulo;
          setEstado({
            capitulo: capituloDaTela?.id ?? salvo.capitulo,
            passo: mesmoCapitulo ? salvo.passo : 0,
            ativo: salvo.ativo === true,
            compacto: salvo.compacto !== false,
            terminou: salvo.terminou === true,
          });
        }
      } catch { /* Navegação privada ou estado antigo não impede o guia. */ }
    }
    setPronto(true);
    // A restauração acontece apenas ao montar. A mudança de tela é tratada abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!pronto) return;
    try { sessionStorage.setItem(CHAVE, JSON.stringify(estado)); } catch {}
    callback.current?.(estado.ativo);
  }, [estado, pronto]);

  React.useEffect(() => {
    if (iniciar && !inicioAnterior.current) {
      const c = capituloDaRotaTourReal(caminho) ?? TOUR_REAL[0];
      setEstado({ capitulo: c.id, passo: 0, ativo: true, compacto: false, terminou: false });
    }
    inicioAnterior.current = iniciar;
  }, [iniciar, caminho]);

  const capitulo = TOUR_REAL.find(c => c.id === estado.capitulo) ?? TOUR_REAL[0];
  const capituloIndice = TOUR_REAL.indexOf(capitulo);
  const original = capitulo.passos[Math.min(estado.passo, capitulo.passos.length - 1)];
  const passo = React.useMemo(()=>passoVisual(original),[original]);
  const quantidadePassos = TOUR_REAL.reduce((s, c) => s + c.passos.length, 0);
  const numeroPasso = TOUR_REAL.slice(0, capituloIndice).reduce((s, c) => s + c.passos.length, 0) + estado.passo + 1;

  React.useEffect(()=>{
    const doc=documentoAlvo??document;
    const sincronizar=()=>{const aberto=[...doc.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1);const destino=aberto??doc.body;setPortal(atual=>atual===destino?atual:destino);};
    sincronizar();const observer=new MutationObserver(sincronizar);observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:["open"]});return()=>observer.disconnect();
  },[documentoAlvo]);
  React.useEffect(()=>{
    const doc=documentoAlvo??document;
    if(!estado.ativo||estado.compacto){delete doc.body.dataset.gerizoTourAtivo;return;}
    doc.body.dataset.gerizoTourAtivo="true";
    const medir=()=>doc.documentElement.style.setProperty("--gerizo-coach-height",`${coach.current?.getBoundingClientRect().height??190}px`);
    medir();const observer=new ResizeObserver(medir);if(coach.current)observer.observe(coach.current);
    return()=>{observer.disconnect();delete doc.body.dataset.gerizoTourAtivo;doc.documentElement.style.removeProperty("--gerizo-coach-height");};
  },[estado.ativo,estado.compacto,passo,portal,documentoAlvo]);

  function mostrarAlvo(el:HTMLElement) {
    const win=el.ownerDocument.defaultView??window, reduzido=win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(el.closest("dialog[open]")){el.scrollIntoView({behavior:reduzido?"auto":"smooth",block:"center",inline:"nearest"});return;}
    const topo=76,limite=coach.current?.getBoundingClientRect().top??win.innerHeight-220,altura=Math.max(80,limite-topo-20),r=el.getBoundingClientRect();
    const destino=win.scrollY+r.top-topo-Math.max(8,(altura-Math.min(r.height,altura))/2);
    win.scrollTo({top:Math.max(0,destino),behavior:reduzido?"auto":"smooth"});
  }

  React.useEffect(() => {
    if (ultimaRota.current === caminho) return;
    ultimaRota.current = caminho;
    const c = capituloDaRotaTourReal(caminho);
    if (!c) return;
    setEstado(anterior => {
      const selecionado = TOUR_REAL.find(c => c.id === anterior.capitulo)?.passos[anterior.passo];
      if (selecionado && caminhoTourReal(selecionado.rota) === caminho) return anterior;
      const i = c.passos.findIndex(p => caminhoTourReal(p.rota) === caminho);
      return { ...anterior, capitulo: c.id, passo: Math.max(0, i), terminou: false };
    });
  }, [caminho]);

  React.useEffect(() => {
    setTemAlvo(false);
    alvoAtual.current = null;
    if (!estado.ativo || estado.compacto || !passo.alvo || caminhoTourReal(passo.rota) !== caminho) return;
    const doc = documentoAlvo ?? document;
    let marcado: HTMLElement | null = null;
    let encerrado = false;
    let frame = 0;
    const realizadas = new Set<number>();
    const buscar = () => {
      if (encerrado) return;
      for(const [indice,acao] of (passo.demonstrar??[]).entries()){
        if(realizadas.has(indice))continue;
        const controle=localizarAlvo(doc,acao);
        if(!controle||!controle.getClientRects().length)continue;
        realizadas.add(indice);
        if(controle.getAttribute("aria-selected")!=="true"&&controle.getAttribute("aria-pressed")!=="true")controle.click();
        requestAnimationFrame(buscar);return;
      }
      let el = localizarAlvo(doc, passo.alvo!);
      if(el?.matches("input[type=file]"))el=el.closest("label")??el.parentElement;
      const detalhe=el?.closest<HTMLDetailsElement>("details");if(detalhe&&!detalhe.open)detalhe.open=true;
      if(!el?.getClientRects().length)el=null;
      if (el === marcado) return;
      marcado?.removeAttribute("data-gerizo-tour-alvo");
      marcado = el;
      if (el) el.setAttribute("data-gerizo-tour-alvo", "true");
      alvoAtual.current = el;
      setTemAlvo(Boolean(el));
      if(el)requestAnimationFrame(()=>{if(!encerrado&&el?.isConnected)mostrarAlvo(el);});
    };
    const agendar = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; buscar(); });
    };
    buscar();
    const observador = new MutationObserver(agendar);
    observador.observe(doc.body, { childList: true, subtree: true, attributes:true, attributeFilter:["open","hidden","aria-expanded","aria-selected"] });
    doc.defaultView?.addEventListener("resize", agendar);
    return () => {
      encerrado = true;
      if (frame) cancelAnimationFrame(frame);
      observador.disconnect();
      doc.defaultView?.removeEventListener("resize", agendar);
      marcado?.removeAttribute("data-gerizo-tour-alvo");
      alvoAtual.current = null;
    };
  }, [estado.ativo, estado.compacto, passo, caminho, documentoAlvo]);

  const ir = React.useCallback((indice: number, etapa: number) => {
    const aberto=[...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1);
    if(aberto){
      const edicao=[...aberto.querySelectorAll<HTMLButtonElement>("button")].some(b=>!b.closest(".gerizo-real-tour")&&/^(Salvar|Criar|Confirmar|Adicionar)/i.test(b.textContent?.trim()??""));
      if(edicao){setAviso("Feche esta ficha para continuar o guia.");return;}
      aberto.querySelector<HTMLButtonElement>('button[aria-label="Fechar painel"],button[aria-label="Fechar"]')?.click();
    }
    setAviso("");
    const c = TOUR_REAL[indice];
    const p = c.passos[etapa];
    setEstado({ capitulo: c.id, passo: etapa, ativo: true, compacto: false, terminou: false });
    if (caminhoTourReal(p.rota) !== caminho) navegar(p.rota);
  }, [caminho, navegar]);
  const anterior = React.useCallback(() => {
    if (estado.passo > 0) ir(capituloIndice, estado.passo - 1);
    else if (capituloIndice > 0) ir(capituloIndice - 1, TOUR_REAL[capituloIndice - 1].passos.length - 1);
  }, [estado.passo, capituloIndice, ir]);
  const proximo = React.useCallback(() => {
    if (estado.passo < capitulo.passos.length - 1) ir(capituloIndice, estado.passo + 1);
    else if (capituloIndice < TOUR_REAL.length - 1) ir(capituloIndice + 1, 0);
    else setEstado(e => ({ ...e, ativo: false, compacto: true, terminou: true }));
  }, [estado.passo, capitulo.passos.length, capituloIndice, ir]);

  React.useEffect(() => {
    if (!estado.ativo || estado.compacto) return;
    const teclado = (event: KeyboardEvent) => {
      const origem = event.target as HTMLElement | null;
      if (event.altKey || event.ctrlKey || event.metaKey || document.querySelector("dialog[open]")) return;
      if (origem?.closest('input,textarea,select,[contenteditable="true"],table,[role="grid"],[role="tablist"]')) return;
      if (event.key === "Escape") { event.preventDefault(); setEstado(e => ({ ...e, compacto: true })); }
      // As setas pertencem à tela. Atalhos do guia exigem foco dentro dele.
      if (!origem?.closest(".gerizo-real-tour")) return;
      if (event.key === "ArrowRight") { event.preventDefault(); proximo(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); anterior(); }
    };
    document.addEventListener("keydown", teclado);
    return () => document.removeEventListener("keydown", teclado);
  }, [estado.ativo, estado.compacto, anterior, proximo]);

  const retomar = () => {
    const c = capituloDaRotaTourReal(caminho);
    if (c && c.id !== estado.capitulo) ir(TOUR_REAL.indexOf(c), Math.max(0, c.passos.findIndex(p => caminhoTourReal(p.rota) === caminho)));
    else if (caminhoTourReal(passo.rota) !== caminho) ir(capituloIndice, estado.passo);
    else setEstado(e => ({ ...e, ativo: true, compacto: false, terminou: false }));
  };
  const localizar = () => {
    const el = alvoAtual.current;
    if (!el) return;
    mostrarAlvo(el);
  };
  const fechado = !estado.ativo || estado.compacto;
  const ultimo = capituloIndice === TOUR_REAL.length - 1 && estado.passo === capitulo.passos.length - 1;

  const barra = <section className="gerizo-real-tour gerizo-real-tour--compacto" aria-label="Guia da demonstração"><div className="gerizo-real-tour-header"><span className="gerizo-real-tour-mark"><BookOpen size={17}/></span><div className="gerizo-real-tour-identity"><strong>{estado.terminou?"Continue explorando":capitulo.nome}</strong></div><button type="button" className="gerizo-real-tour-resume" onClick={retomar}>{estado.ativo?"Continuar o guia":"Começar o guia"}</button></div></section>;
  if(fechado)return barra;
  const painel=<div ref={coach} className="gerizo-real-tour gerizo-tour-coach" role="region" aria-label="Guia passo a passo">
    <div className="gerizo-real-tour-header">
      <label className="gerizo-real-tour-select"><span className="sr-only">Escolher área do guia</span><select value={capitulo.id} onChange={e => ir(TOUR_REAL.findIndex(c => c.id === e.target.value), 0)}>{TOUR_REAL.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <span className="gerizo-tour-count">{estado.passo+1}/{capitulo.passos.length}</span><button type="button" onClick={()=>setEstado(e=>({...e,compacto:true}))} aria-label="Recolher guia"><Minus size={18}/></button><button type="button" onClick={()=>setEstado(e=>({...e,ativo:false,compacto:true}))} aria-label="Fechar guia"><X size={18}/></button>
    </div>
      <div className="gerizo-tour-short-copy" key={passo.id} aria-live="polite"><h2 id={tituloId}>{passo.titulo}</h2><p>{aviso||passo.descricao}</p><span>{passo.experimentar}</span></div>
      <div className="gerizo-real-tour-footer">{temAlvo&&<button type="button" className="gerizo-tour-show" onClick={localizar}><LocateFixed size={15}/>Mostrar</button>}<div><button type="button" disabled={numeroPasso === 1} onClick={anterior}>Voltar</button><button type="button" className="gerizo-real-tour-next" onClick={proximo}>{ultimo?"Concluir":"Próximo"}</button></div></div>
      <div className="gerizo-real-tour-progress" role="progressbar" aria-label="Posição no guia" aria-valuenow={numeroPasso} aria-valuemin={1} aria-valuemax={quantidadePassos}><span style={{ width: `${numeroPasso / quantidadePassos * 100}%` }} /></div>
  </div>;
  return portal?createPortal(painel,portal):barra;
}

export default TourReal;
