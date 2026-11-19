"use client";

import * as React from "react";
import { BookOpen, LocateFixed, Minus, Plus, X } from "lucide-react";
import { TOUR_REAL, capituloDaRotaTourReal, caminhoTourReal, type AlvoTourReal } from "@/lib/demo/tour";
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
    return [...doc.querySelectorAll<HTMLElement>(alvo.seletor)].find(el =>
      !el.closest(".gerizo-real-tour") && el.getClientRects().length > 0 &&
      (!texto || (el.textContent ?? "").toLocaleLowerCase("pt-BR").includes(texto))
    ) ?? null;
  } catch { return null; }
}

/** Guia da aplicação real. Não executa ações, não consulta APIs e não lê dados da operação. */
export function TourReal({ pathname, navegar, iniciar = false, onActiveChange, documentoAlvo }: Props) {
  const caminho = caminhoTourReal(pathname);
  const tituloId = React.useId();
  const [estado, setEstado] = React.useState<Estado>(() => ({
    capitulo: capituloDaRotaTourReal(caminho)?.id ?? TOUR_REAL[0].id,
    passo: 0, ativo: iniciar, compacto: !iniciar, terminou: false,
  }));
  const [pronto, setPronto] = React.useState(false);
  const [temAlvo, setTemAlvo] = React.useState(false);
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
  const passo = capitulo.passos[Math.min(estado.passo, capitulo.passos.length - 1)];
  const quantidadePassos = TOUR_REAL.reduce((s, c) => s + c.passos.length, 0);
  const numeroPasso = TOUR_REAL.slice(0, capituloIndice).reduce((s, c) => s + c.passos.length, 0) + estado.passo + 1;

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
    const estilo = doc.createElement("style");
    estilo.textContent = '[data-gerizo-tour-alvo="true"]{outline:2px solid var(--brand,#7045d1)!important;outline-offset:4px;scroll-margin-block:110px}';
    estilo.dataset.gerizoTour = "destaque";
    doc.head.appendChild(estilo);
    const buscar = () => {
      if (encerrado) return;
      const el = localizarAlvo(doc, passo.alvo!);
      if (el === marcado) return;
      marcado?.removeAttribute("data-gerizo-tour-alvo");
      marcado = el;
      if (el) el.setAttribute("data-gerizo-tour-alvo", "true");
      alvoAtual.current = el;
      setTemAlvo(Boolean(el));
    };
    const agendar = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; buscar(); });
    };
    buscar();
    const observador = new MutationObserver(agendar);
    observador.observe(doc.body, { childList: true, subtree: true });
    doc.defaultView?.addEventListener("resize", agendar);
    return () => {
      encerrado = true;
      if (frame) cancelAnimationFrame(frame);
      observador.disconnect();
      doc.defaultView?.removeEventListener("resize", agendar);
      marcado?.removeAttribute("data-gerizo-tour-alvo");
      estilo.remove();
      alvoAtual.current = null;
    };
  }, [estado.ativo, estado.compacto, passo, caminho, documentoAlvo]);

  const ir = React.useCallback((indice: number, etapa: number) => {
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
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduzido ? "auto" : "smooth", block: "center", inline: "nearest" });
  };
  const fechado = !estado.ativo || estado.compacto;
  const ultimo = capituloIndice === TOUR_REAL.length - 1 && estado.passo === capitulo.passos.length - 1;

  return <section className={`gerizo-real-tour${fechado ? " gerizo-real-tour--compacto" : ""}`} aria-label="Guia da demonstração" data-tour-active={estado.ativo}>
    <div className="gerizo-real-tour-header">
      <span className="gerizo-real-tour-mark"><BookOpen size={18} aria-hidden /></span>
      <div className="gerizo-real-tour-identity"><span>Guia da demonstração</span><strong>{estado.terminou ? "Continue explorando no seu ritmo" : capitulo.nome}</strong></div>
      {!fechado && <label className="gerizo-real-tour-select"><span className="sr-only">Escolher área do guia</span><select value={capitulo.id} onChange={e => ir(TOUR_REAL.findIndex(c => c.id === e.target.value), 0)}>{TOUR_REAL.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>}
      {fechado ? <button type="button" className="gerizo-real-tour-resume" onClick={retomar}><Plus size={16} aria-hidden />{estado.terminou ? "Reabrir guia" : estado.ativo ? "Abrir passo" : "Iniciar guia"}</button> : <div className="gerizo-real-tour-header-actions"><button type="button" onClick={() => setEstado(e => ({ ...e, compacto: true }))} aria-label="Minimizar guia"><Minus size={18} aria-hidden /></button><button type="button" onClick={() => setEstado(e => ({ ...e, ativo: false, compacto: true }))} aria-label="Explorar livremente sem o guia"><X size={18} aria-hidden /></button></div>}
    </div>
    {!fechado && <>
      <div className="gerizo-real-tour-reading" aria-live="polite" aria-atomic="true"><div><p className="gerizo-real-tour-step">Passo {estado.passo + 1} de {capitulo.passos.length} nesta área</p><h2 id={tituloId}>{passo.titulo}</h2><p>{passo.descricao}</p></div><div className="gerizo-real-tour-experiment"><span>Experimente</span><p>{passo.experimentar}</p>{temAlvo && <button type="button" onClick={localizar}><LocateFixed size={15} aria-hidden />Localizar na tela</button>}</div></div>
      <div className="gerizo-real-tour-footer"><span>{capituloIndice + 1} de {TOUR_REAL.length} áreas</span><button type="button" className="gerizo-real-tour-free" onClick={() => setEstado(e => ({ ...e, ativo: false, compacto: true }))}>Explorar livremente</button><div><button type="button" disabled={numeroPasso === 1} onClick={anterior}>Anterior</button><button type="button" className="gerizo-real-tour-next" onClick={proximo}>{ultimo ? "Concluir guia" : estado.passo === capitulo.passos.length - 1 ? "Próxima área" : "Próximo passo"}</button></div></div>
      <div className="gerizo-real-tour-progress" role="progressbar" aria-label="Posição no guia" aria-valuenow={numeroPasso} aria-valuemin={1} aria-valuemax={quantidadePassos}><span style={{ width: `${numeroPasso / quantidadePassos * 100}%` }} /></div>
    </>}
  </section>;
}

export default TourReal;
