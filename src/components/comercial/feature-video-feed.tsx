"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Captions, ChevronDown, ChevronUp, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import type { CategoriaFuncionalidade, Funcionalidade } from "@/lib/comercial/funcionalidades";
import "./feature-video-feed.css";

type Props = { items: Funcionalidade[]; initialId: string; onClose: () => void };

const COR: Record<CategoriaFuncionalidade, string> = {
  Vendas: "#7045d1", "Mercado Livre": "#2f6fe4", Promoções: "#c2367a", Operação: "#0f8f7e", Dinheiro: "#b45b17",
};
const linkDemo = (rota: string) => rota.startsWith("/demonstracao") ? rota : `/demonstracao/sistema${rota.startsWith("/") ? rota : "/" + rota}`;

/** Feed vertical: painel lateral no computador e tela cheia no celular. */
export function FeatureVideoFeed({ items, initialId, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const paginas = useRef<(HTMLElement | null)[]>([]);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const inicial = useRef(Math.max(0, items.findIndex((i) => i.id === initialId)));
  const [ativo, setAtivo] = useState(inicial.current);
  const indiceAtivo = useRef(inicial.current);
  const [pronto, setPronto] = useState(false);
  const [mudo, setMudo] = useState(true);
  const [tocando, setTocando] = useState(false);
  const [legendas, setLegendas] = useState(true);
  const [progresso, setProgresso] = useState(0);
  const [falhas, setFalhas] = useState<Record<string, boolean>>({});
  const titulo = useId();
  const fechar = useRef(onClose);
  fechar.current = onClose;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const anterior = document.activeElement as HTMLElement | null;
    const rolagem = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    if (!el.open) el.showModal();
    const quadro = requestAnimationFrame(() => {
      if (feed.current) feed.current.scrollTop = inicial.current * feed.current.clientHeight;
      setPronto(true);
    });
    return () => {
      cancelAnimationFrame(quadro);
      videos.current.forEach((v) => v?.pause());
      if (el.open) el.close();
      document.documentElement.style.overflow = rolagem;
      requestAnimationFrame(() => { if (anterior?.isConnected) anterior.focus({ preventScroll: true }); });
    };
  }, []);

  useEffect(() => {
    if (!pronto || !feed.current) return;
    const vis = new Map<number, number>();
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) vis.set(Number((e.target as HTMLElement).dataset.indice), e.intersectionRatio);
      let melhor = indiceAtivo.current, maior = 0;
      for (const [i, v] of vis) if (v > maior) { melhor = i; maior = v; }
      if (maior >= 0.55 && melhor !== indiceAtivo.current) { indiceAtivo.current = melhor; setAtivo(melhor); }
    }, { root: feed.current, threshold: [0, 0.55, 1] });
    paginas.current.forEach((p) => p && obs.observe(p));
    return () => obs.disconnect();
  }, [pronto, items.length]);

  useEffect(() => {
    setTocando(false); setProgresso(0);
    videos.current.forEach((v, i) => { if (v && i !== ativo) v.pause(); });
    const v = videos.current[ativo];
    if (!v || !pronto) return;
    v.muted = mudo;
    for (const f of v.textTracks) f.mode = legendas ? "showing" : "hidden";
    void v.play().catch(() => setTocando(false));
    return () => v.pause();
    // Só a troca de página inicia o vídeo; som e legenda não reiniciam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, pronto]);
  useEffect(() => { const v = videos.current[ativo]; if (v) v.muted = mudo; }, [mudo, ativo]);
  useEffect(() => { const v = videos.current[ativo]; if (v) for (const f of v.textTracks) f.mode = legendas ? "showing" : "hidden"; }, [legendas, ativo]);
  useEffect(() => {
    const oculto = () => { if (document.visibilityState !== "visible") videos.current.forEach((v) => v?.pause()); };
    document.addEventListener("visibilitychange", oculto);
    return () => document.removeEventListener("visibilitychange", oculto);
  }, []);

  const ir = useCallback((i: number) => {
    if (!feed.current || i < 0 || i >= items.length) return;
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    feed.current.scrollTo({ top: i * feed.current.clientHeight, behavior: reduzir ? "auto" : "smooth" });
  }, [items.length]);

  if (!items.length) return null;
  const atual = items[ativo];
  const temVideoAtual = Boolean(atual?.video?.src) && !falhas[atual.id];

  return (
    <dialog ref={dialog} className="gz-feed" aria-labelledby={titulo}
      onCancel={(e) => { e.preventDefault(); fechar.current(); }}
      onClick={(e) => { if (e.target === e.currentTarget) fechar.current(); }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input,textarea,select")) return;
        if (["ArrowDown", "PageDown"].includes(e.key)) { e.preventDefault(); ir(ativo + 1); }
        if (["ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); ir(ativo - 1); }
      }}>
      <div className="gz-feed-shell">
        <aside className="gz-feed-lista" aria-label="Funcionalidades">
          <h2 id={titulo}>Funcionalidades</h2>
          <ol>{items.map((item, i) => (
            <li key={item.id}><button type="button" aria-current={i === ativo ? "true" : undefined} onClick={() => ir(i)} style={{ "--c": COR[item.categoria] } as React.CSSProperties}>
              <span>{item.categoria}</span><b>{item.titulo}</b>
            </button></li>
          ))}</ol>
        </aside>

        <div className="gz-feed-main">
          <header className="gz-feed-top">
            <span className="gz-feed-pos" aria-live="polite">{ativo + 1}<small>/{items.length}</small></span>
            <div className="gz-feed-barras" aria-hidden="true">{items.map((item, i) => <i key={item.id} className={i < ativo ? "is-feito" : i === ativo ? "is-agora" : ""}><span style={i === ativo ? { width: temVideoAtual ? `${progresso * 100}%` : "100%" } : undefined} /></i>)}</div>
            <button type="button" className="gz-feed-icone" onClick={() => fechar.current()} aria-label="Fechar" autoFocus><X size={22} aria-hidden /></button>
          </header>

          <div className="gz-feed-rolo" ref={feed} tabIndex={-1}>
            {items.map((item, i) => {
              const selecionado = i === ativo;
              const temVideo = Boolean(item.video?.src) && !falhas[item.id];
              return (
                <article key={item.id} className="gz-feed-slide" data-indice={i} ref={(el) => { paginas.current[i] = el; }} aria-hidden={!selecionado} inert={!selecionado} style={{ "--c": COR[item.categoria] } as React.CSSProperties}>
                  <div className="gz-feed-palco">
                    {temVideo ? (
                      <video ref={(el) => { videos.current[i] = el; }} src={item.video!.src} poster={item.video?.poster} muted={mudo} playsInline loop
                        preload={selecionado || i === ativo + 1 ? "metadata" : "none"} aria-label={`Vídeo: ${item.titulo}`} onClick={() => { const v = videos.current[i]; if (v) { if (v.paused) void v.play(); else v.pause(); } }}
                        onPlay={() => { if (i === indiceAtivo.current) setTocando(true); }} onPause={() => { if (i === indiceAtivo.current) setTocando(false); }}
                        onTimeUpdate={(e) => { if (i === indiceAtivo.current && e.currentTarget.duration) setProgresso(e.currentTarget.currentTime / e.currentTarget.duration); }}
                        onError={() => setFalhas((f) => ({ ...f, [item.id]: true }))}>
                        {item.video?.legendas && <track kind="captions" src={item.video.legendas} srcLang="pt-BR" label="Português" default />}
                      </video>
                    ) : (
                      <div className={`gz-feed-historia${selecionado ? " is-ativa" : ""}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/site/telas/${item.id}.webp`} alt={`Tela ${item.titulo} no sistema de exemplo`} loading={Math.abs(i - ativo) <= 1 ? "eager" : "lazy"} />
                        <strong>{item.pergunta}</strong>
                        <span className="gz-feed-breve">vídeo em breve</span>
                      </div>
                    )}
                  </div>
                  <div className="gz-feed-info">
                    <span className="gz-feed-cat">{item.categoria}</span>
                    <h3>{item.titulo}</h3>
                    <p>{item.descricao}</p>
                    <Link className="gz-feed-cta" href={linkDemo(item.rotaDemo)} onClick={() => fechar.current()}>Abrir esta tela ao vivo <ArrowUpRight size={17} aria-hidden /></Link>
                  </div>
                  {temVideo && selecionado && (
                    <div className="gz-feed-acoes">
                      <button type="button" className="gz-feed-icone" onClick={() => { const v = videos.current[i]; if (v) { if (v.paused) void v.play(); else v.pause(); } }} aria-label={tocando ? "Pausar" : "Reproduzir"}>{tocando ? <Pause size={20} aria-hidden /> : <Play size={20} aria-hidden />}</button>
                      <button type="button" className="gz-feed-icone" onClick={() => setMudo((m) => !m)} aria-label={mudo ? "Ativar som" : "Tirar som"}>{mudo ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}</button>
                      {item.video?.legendas && <button type="button" className="gz-feed-icone" onClick={() => setLegendas((l) => !l)} aria-pressed={legendas} aria-label="Legendas"><Captions size={20} aria-hidden /></button>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="gz-feed-nav">
            <button type="button" onClick={() => ir(ativo - 1)} disabled={ativo === 0} aria-label="Anterior"><ChevronUp size={20} aria-hidden /></button>
            <button type="button" onClick={() => ir(ativo + 1)} disabled={ativo === items.length - 1} aria-label="Próxima"><ChevronDown size={20} aria-hidden /></button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

export default FeatureVideoFeed;
