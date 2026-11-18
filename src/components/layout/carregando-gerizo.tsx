"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Carregando } from "@/components/ui/carregando";
import { NOME_GDF3, useGdf3 } from "@/lib/marca-gdf3";

/**
 * Tela de carregamento com a marca: fundo branco e as letras de "gerizo."
 * voando até formar o nome.
 *
 * Cobre a tela só ao entrar no sistema. Ao trocar de empresa, a espera fica
 * na área de conteúdo, com o menu visível, como entre telas (loading.tsx).
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
  const [naArea, setNaArea] = React.useState(false);
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
        setNaArea(d.modo !== "navegacao");
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

  const area = naArea ? document.getElementById("conteudo") : null;
  return area ? createPortal(<Carregando sobre />, area) : <TelaGerizo />;
}

/**
 * O desenho da tela de carregamento — fundo branco, letras e barra — sem
 * estado nenhum. Separado para a moldura poder desenhá-lo JÁ NO HTML do
 * servidor, na abertura do app: aí ele roda só com CSS, antes de o
 * JavaScript da página chegar.
 */
export function TelaGerizo({ id }: { id?: string }) {
  const gdf3 = useGdf3();
  const letras = gdf3
    ? [...NOME_GDF3.replace(/ /g, " ")].map((c, i) => ({
        c,
        dx: ((i * 53) % 400) - 200,
        dy: ((i * 97) % 300) - 150,
        rot: ((i * 31) % 70) - 35,
      }))
    : LETRAS;
  return (
    <div id={id} className="gerizo-carregando" role="status" aria-live="polite" aria-label="Carregando">
      <div className="gerizo-carregando-marca" aria-hidden="true" style={gdf3 ? { fontSize: "clamp(30px, 7vw, 56px)" } : undefined}>
        {letras.map((l, i) => (
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
