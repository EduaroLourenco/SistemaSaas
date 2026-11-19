"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { CATEGORIAS_FUNCIONALIDADES, FUNCIONALIDADES, type Funcionalidade } from "@/lib/comercial/funcionalidades";
import { FeatureVideoFeed } from "./feature-video-feed";
import { fontesSite } from "./fontes";
import { COR_CATEGORIA } from "./marketing-page";
import { SiteRodape, SiteTopo } from "./site-comum";
import "./site.css";

export function FeatureCatalogue({ initialId, initialCategory }: { initialId?: string; initialCategory?: string }) {
  const [categoria, setCategoria] = useState(CATEGORIAS_FUNCIONALIDADES.find((c) => c === initialCategory) ?? "Todas");
  const [aberto, setAberto] = useState(FUNCIONALIDADES.some((f) => f.id === initialId) ? initialId! : null);
  const [feed, setFeed] = useState<Funcionalidade[]>(FUNCIONALIDADES);
  const visiveis = FUNCIONALIDADES.filter((f) => categoria === "Todas" || f.categoria === categoria);
  function abrir(id: string) {
    setFeed(visiveis.length ? visiveis : FUNCIONALIDADES); setAberto(id);
    const url = new URL(window.location.href); url.searchParams.set("video", id); window.history.replaceState(window.history.state, "", url);
  }
  function fechar() {
    setAberto(null);
    const url = new URL(window.location.href); url.searchParams.delete("video"); window.history.replaceState(window.history.state, "", url);
  }
  return (
    <main className={`gz ${fontesSite}`}>
      <a className="gz-skip" href="#lista">Ir para o conteúdo</a>
      <SiteTopo />
      <section className="gz-cat gz-wrap">
        <h1>Uma pergunta por vez. A resposta na tela.</h1>
        <p>Escolha um assunto ou assista em sequência, deslizando como num feed.</p>
        <button type="button" className="gz-btn gz-btn-primary" onClick={() => abrir(visiveis[0]?.id ?? FUNCIONALIDADES[0].id)}><Play size={18} fill="currentColor" aria-hidden />Assistir em sequência</button>
      </section>
      <section className="gz-wrap" id="lista" aria-label="Lista de funcionalidades">
        <div className="gz-filtros" role="group" aria-label="Filtrar por assunto">
          {["Todas", ...CATEGORIAS_FUNCIONALIDADES].map((c) => <button type="button" key={c} aria-pressed={categoria === c} onClick={() => setCategoria(c as typeof categoria)}>{c}</button>)}
        </div>
        <div className="gz-lista">
          {visiveis.map((f) => (
            <button type="button" key={f.id} className="gz-linha-func" style={{ "--c": COR_CATEGORIA[f.categoria] } as React.CSSProperties} onClick={() => abrir(f.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.video?.poster ?? `/site/telas/${f.id}.webp`} alt="" loading="lazy" width={96} height={128} />
              <span>
                <small>{f.categoria}</small>
                <b>{f.pergunta}</b>
                <span className="gz-desc">{f.titulo}. {f.descricao}</span>
              </span>
              <span className="gz-assistir">Assistir</span>
            </button>
          ))}
        </div>
      </section>
      <SiteRodape />
      {aberto && <FeatureVideoFeed items={feed} initialId={aberto} onClose={fechar} />}
    </main>
  );
}
