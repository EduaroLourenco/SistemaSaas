"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Tela de carregamento com a marca: fundo branco e as letras de "gerizo."
 * voando até formar o nome.
 *
 * Aparece nos dois momentos em que a espera é esperada e longa — entrar no
 * sistema e trocar de empresa — e em nenhum outro: carregamento de tela
 * comum continua com o esqueleto da própria tela, que diz o que vem.
 *
 * Quem liga chama `iniciarCarregando(modo)`:
 *  - "navegacao": some sozinha quando o endereço muda (o login vai para a
 *    Visão geral);
 *  - "manual": some com `encerrarCarregando()` (a troca de empresa fica no
 *    mesmo endereço e recarrega os dados).
 *
 * Fica no mínimo 1,1s na tela para a palavra terminar de se formar — sumir
 * no meio da animação parece defeito — e no máximo 30s, para uma falha de
 * rede nunca prender a pessoa atrás da marca.
 */

const EVENTO = "gerizo:carregando";
type Modo = "navegacao" | "manual";

export function iniciarCarregando(modo: Modo = "manual") {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { ligar: true, modo } }));
}
export function encerrarCarregando() {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { ligar: false } }));
}

/* De onde cada letra parte: deslocamento, giro e atraso. Fixo, não
   aleatório, para a animação ser igual toda vez e o servidor e o
   navegador desenharem o mesmo. */
const LETRAS = [
  { c: "g", dx: -180, dy: -90, rot: -38 },
  { c: "e", dx: -60, dy: 140, rot: 24 },
  { c: "r", dx: 40, dy: -160, rot: -18 },
  { c: "i", dx: 120, dy: 120, rot: 32 },
  { c: "z", dx: 190, dy: -70, rot: -26 },
  { c: "o", dx: 230, dy: 90, rot: 40 },
  { c: ".", dx: 280, dy: -130, rot: 0 },
];

const MINIMO = 1100;
const MAXIMO = 30000;

export function CarregandoGerizo() {
  const pathname = usePathname();
  const [visivel, setVisivel] = React.useState(false);
  const estado = React.useRef<{ modo: Modo; desde: number; caminho: string } | null>(null);
  const timers = React.useRef<number[]>([]);

  const esconder = React.useCallback(() => {
    const e = estado.current;
    if (!e) return;
    const falta = Math.max(0, MINIMO - (Date.now() - e.desde));
    timers.current.push(
      window.setTimeout(() => {
        estado.current = null;
        setVisivel(false);
      }, falta)
    );
  }, []);

  React.useEffect(() => {
    const ouvir = (ev: Event) => {
      const d = (ev as CustomEvent<{ ligar: boolean; modo?: Modo }>).detail;
      if (d.ligar) {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        estado.current = { modo: d.modo ?? "manual", desde: Date.now(), caminho: window.location.pathname };
        setVisivel(true);
        timers.current.push(window.setTimeout(() => esconder(), MAXIMO));
      } else {
        esconder();
      }
    };
    window.addEventListener(EVENTO, ouvir);
    return () => window.removeEventListener(EVENTO, ouvir);
  }, [esconder]);

  /*
   * Modo navegação: a tela nova chegou quando o endereço mudou E o
   * esqueleto de carregamento dela saiu. Só o endereço não basta: o Next
   * troca o endereço assim que mostra o esqueleto (loading.tsx), e a marca
   * sumia para revelar cartões vazios. Os esqueletos se marcam com
   * aria-busy="true".
   */
  React.useEffect(() => {
    const e = estado.current;
    if (e?.modo !== "navegacao" || pathname === e.caminho) return;
    const espera = window.setInterval(() => {
      if (!document.querySelector('main [aria-busy="true"]')) {
        window.clearInterval(espera);
        esconder();
      }
    }, 150);
    timers.current.push(espera);
    return () => window.clearInterval(espera);
  }, [pathname, esconder]);

  if (!visivel) return null;

  return (
    <div className="gerizo-carregando" role="status" aria-live="polite" aria-label="Carregando">
      <div className="gerizo-carregando-marca" aria-hidden="true">
        {LETRAS.map((l, i) => (
          <span
            key={i}
            className={l.c === "." ? "gerizo-letra gerizo-ponto" : "gerizo-letra"}
            style={
              {
                "--dx": `${l.dx}px`,
                "--dy": `${l.dy}px`,
                "--rot": `${l.rot}deg`,
                // O ponto tem duas animações (voo e pulso): um atraso para
                // cada, senão o pulso começaria no meio do voo.
                animationDelay: l.c === "." ? `${i * 90}ms, ${i * 90 + 800}ms` : `${i * 90}ms`,
              } as React.CSSProperties
            }
          >
            {l.c}
          </span>
        ))}
      </div>
      <div className="gerizo-carregando-barra" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
