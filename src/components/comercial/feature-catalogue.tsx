"use client";

import { useState } from "react";
import { Play, Search } from "lucide-react";
import { CATEGORIAS_FUNCIONALIDADES, ETAPAS_HISTORIA, FUNCIONALIDADES, contextoHistoria } from "@/lib/comercial/funcionalidades";
import { FeatureVideoFeed } from "./feature-video-feed";
import { fontesSite } from "./fontes";
import { COR_CATEGORIA } from "./marketing-page";
import { SiteRodape, SiteTopo } from "./site-comum";
import "./site.css";
import "./feature-catalogue.css";

export function FeatureCatalogue({ initialId, initialCategory }: { initialId?: string; initialCategory?: string }) {
  const [categoria, setCategoria] = useState(CATEGORIAS_FUNCIONALIDADES.find((c) => c === initialCategory) ?? "Todas");
  const [aberto, setAberto] = useState(FUNCIONALIDADES.some((f) => f.id === initialId) ? initialId! : null);
  const [busca,setBusca]=useState("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(Boolean(initialCategory));
  const normalizar=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
  const termo=normalizar(busca.trim());
  const visiveis = FUNCIONALIDADES.filter((f) => (categoria === "Todas" || f.categoria === categoria)&&(!termo||normalizar(`${f.titulo} ${f.descricao} ${f.pergunta} ${f.categoria}`).includes(termo)));
  function abrir(id: string) {
    setAberto(id);
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
        <h1>Da queda nas vendas à próxima ação.</h1>
        <p>Acompanhe uma loja de exemplo, uma pergunta de cada vez.</p>
        <div className="gz-historia-comecar"><button type="button" className="gz-btn gz-btn-primary" onClick={() => abrir(FUNCIONALIDADES[0].id)}><Play size={18} fill="currentColor" aria-hidden />Começar a história</button><span>{FUNCIONALIDADES.length} capítulos curtos · dados fictícios</span></div>
      </section>
      <section className="gz-wrap" id="lista" aria-label="Lista de funcionalidades">
        <details className="gz-historia-busca" open={filtrosAbertos} onToggle={e => setFiltrosAbertos(e.currentTarget.open)}><summary>Quer encontrar uma função específica?</summary><div>
          <label className="gz-busca-func"><Search size={18} aria-hidden/><span className="sr-only">Buscar funcionalidade</span><input type="search" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Busque preço, promoção, frete…"/></label>
          <div className="gz-filtros" role="group" aria-label="Filtrar por assunto">
            {["Todas", ...CATEGORIAS_FUNCIONALIDADES].map((c) => <button type="button" key={c} aria-pressed={categoria === c} onClick={() => setCategoria(c as typeof categoria)}>{c}</button>)}
          </div>
        </div></details>
        {(termo || categoria !== "Todas") && <div className="gz-historia-resultados" role="status"><span>{visiveis.length} {visiveis.length === 1 ? "capítulo encontrado" : "capítulos encontrados"}</span><button type="button" onClick={() => { setBusca(""); setCategoria("Todas"); }}>Ver a história completa</button></div>}
        <div className="gz-lista">
          {!visiveis.length&&<p className="gz-sem-resultados" role="status">Nenhum vídeo encontrado. Tente outro nome ou assunto.</p>}
          {ETAPAS_HISTORIA.map(etapa => {
            const capitulos = visiveis.filter(item => etapa.videos.includes(item.id));
            if (!capitulos.length) return null;
            return <section key={etapa.id} className="gz-historia-etapa" aria-labelledby={`historia-${etapa.id}`}>
              <h2 id={`historia-${etapa.id}`}>{etapa.titulo}</h2>
              {capitulos.map(f => {
                const contexto = contextoHistoria(f.id);
                return <button type="button" key={f.id} className="gz-linha-func" style={{ "--c": COR_CATEGORIA[f.categoria] } as React.CSSProperties} onClick={() => abrir(f.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.video?.poster ?? `/site/telas/${f.id}.webp`} alt="" loading="lazy" width={96} height={128} />
                  <span><small>Capítulo {String(contexto.numero).padStart(2, "0")} · {f.categoria}</small><b>{f.pergunta}</b><span className="gz-desc">{contexto.ligacao}</span></span>
                  <span className="gz-assistir"><Play size={20} aria-hidden/><span className="sr-only">Assistir</span></span>
                </button>;
              })}
            </section>;
          })}
        </div>
      </section>
      <SiteRodape />
      {aberto && <FeatureVideoFeed items={FUNCIONALIDADES} initialId={aberto} onClose={fechar} />}
    </main>
  );
}
