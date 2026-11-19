"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tela real com marcas de caneta por cima, como quem revisa um relatório.
 * Posições em porcentagem da imagem, para acompanhar qualquer largura.
 */
export type Marca =
  | { tipo: "circulo"; x: number; y: number; w: number; h: number }
  | { tipo: "marca-texto"; x: number; y: number; w: number; h: number }
  | { tipo: "check"; x: number; y: number; w: number; h: number };

const CIRCULO = "M52 4C80 3 98 14 97 30 96 47 74 57 47 56 20 55 2 45 3 29 4 13 25 3 56 6";
const CHECK = "M8 52 34 82 92 12";

export function TelaAnotada({ src, alt, marcas, nota, largura = 1600, altura = 1000, prioridade = false }: {
  src: string; alt: string; marcas: Marca[]; nota?: string; largura?: number; altura?: number; prioridade?: boolean;
}) {
  const caixa = useRef<HTMLElement>(null);
  const [viu, setViu] = useState(false);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setViu(true); obs.disconnect(); } }, { threshold: 0.45 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <figure ref={caixa} className={`gz-tela${viu ? " is-vista" : ""}`}>
      <div className="gz-tela-quadro">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={largura} height={altura} loading={prioridade ? "eager" : "lazy"} decoding="async" />
        {marcas.map((m, i) => (
          <span key={i} className={`gz-marca gz-marca-${m.tipo}`} style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%`, "--atraso": `${0.25 + i * 0.35}s` } as React.CSSProperties} aria-hidden="true">
            {m.tipo !== "marca-texto" && (
              <svg viewBox={m.tipo === "check" ? "0 0 100 100" : "0 0 100 60"} preserveAspectRatio="none"><path d={m.tipo === "check" ? CHECK : CIRCULO} pathLength={1} /></svg>
            )}
          </span>
        ))}
      </div>
      {nota && <figcaption className="gz-nota"><svg viewBox="0 0 60 40" aria-hidden="true"><path d="M4 36C18 34 40 26 52 6M52 6 40 9M52 6 54 18" pathLength={1} /></svg>{nota}</figcaption>}
    </figure>
  );
}
