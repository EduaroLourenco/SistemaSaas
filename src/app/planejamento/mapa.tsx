"use client";
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
  Expand,
  Grip,
  Hand,
  Minus,
  Plus,
  RotateCcw,
  ArrowUpRight,
} from "lucide-react";
import { type Item, type Dados } from "@/lib/planejamento/modelo";
import { Cartao } from "./quadro";

type Ponto = { x: number; y: number };
export default function Mapa({
  itens,
  dados,
  campanha,
  abrir,
  selecionar,
  atualizar,
  ocupado,
  novo,
  avulsas,
}: {
  itens: Item[];
  dados: Dados;
  campanha: Item | null;
  abrir: (i: Item) => void;
  selecionar: (id: string) => void;
  atualizar: (i: Item) => Promise<boolean>;
  ocupado: boolean;
  novo: () => void;
  avulsas: boolean;
}) {
  const [zoom, setZoom] = useState(0.85),
    [movendo, setMovendo] = useState<{ id: string; ponto: Ponto } | null>(null),
    [pan, setPan] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const gesto = useRef<{
    id: string;
    x: number;
    y: number;
    inicio: Ponto;
    ultimo: Ponto;
    pointerId: number;
  } | null>(null);
  const panGesto = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const contexto = campanha?.id ?? "geral";
  const lista = campanha
    ? itens.filter((i) => i.natureza === "acao")
    : itens.filter((i) => i.natureza === "campanha" || !i.campanha_id);
  function posicao(i: Item, idx: number): Ponto {
    if (movendo?.id === i.id) return movendo.ponto;
    if (i.detalhes.visual?.contexto === contexto) return i.detalhes.visual;
    return { x: 410 + (idx % 3) * 330, y: 105 + Math.floor(idx / 3) * 340 };
  }
  function iniciar(ev: PointerEvent<HTMLButtonElement>, i: Item, idx: number) {
    if (ocupado || ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const ponto = posicao(i, idx);
    gesto.current = {
      id: i.id,
      x: ev.clientX,
      y: ev.clientY,
      inicio: ponto,
      ultimo: ponto,
      pointerId: ev.pointerId,
    };
    setMovendo({ id: i.id, ponto });
  }
  function mover(ev: PointerEvent<HTMLButtonElement>) {
    const g = gesto.current;
    if (!g || ev.pointerId !== g.pointerId) return;
    const ponto = {
      x: Math.round(
        Math.max(20, Math.min(5700, g.inicio.x + (ev.clientX - g.x) / zoom)),
      ),
      y: Math.round(
        Math.max(20, Math.min(3600, g.inicio.y + (ev.clientY - g.y) / zoom)),
      ),
    };
    g.ultimo = ponto;
    setMovendo({ id: g.id, ponto });
  }
  async function terminar(ev: PointerEvent<HTMLButtonElement>, i: Item) {
    const g = gesto.current;
    if (!g || ev.pointerId !== g.pointerId) return;
    gesto.current = null;
    if (ev.currentTarget.hasPointerCapture(ev.pointerId))
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    if (g.inicio.x !== g.ultimo.x || g.inicio.y !== g.ultimo.y)
      await atualizar({
        ...i,
        detalhes: { ...i.detalhes, visual: { ...g.ultimo, contexto } },
      });
    setMovendo(null);
  }
  function vistaInicial() {
    setZoom(0.85);
    viewport.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }
  return (
    <section className="st-map-wrap">
      <div className="st-view-caption">
        <p>
          Conecte as peças da campanha. Arraste pela alça dos cartões para
          organizar suas ideias.
        </p>
        <button className="st-text-button" onClick={novo}>
          <Plus size={14} />
          {campanha || avulsas ? "Nova ação" : "Nova campanha"}
        </button>
      </div>
      <div
        className={`st-map ${pan ? "is-panning" : ""}`}
        ref={viewport}
        onPointerDown={(ev) => {
          if (
            ev.button !== 0 ||
            (ev.target as HTMLElement).closest(
              "button, article, input, a, select",
            )
          )
            return;
          ev.currentTarget.setPointerCapture(ev.pointerId);
          panGesto.current = {
            x: ev.clientX,
            y: ev.clientY,
            left: ev.currentTarget.scrollLeft,
            top: ev.currentTarget.scrollTop,
          };
          setPan(true);
        }}
        onPointerMove={(ev) => {
          const p = panGesto.current;
          if (!p) return;
          ev.currentTarget.scrollLeft = p.left - (ev.clientX - p.x);
          ev.currentTarget.scrollTop = p.top - (ev.clientY - p.y);
        }}
        onPointerUp={(ev) => {
          panGesto.current = null;
          setPan(false);
          if (ev.currentTarget.hasPointerCapture(ev.pointerId))
            ev.currentTarget.releasePointerCapture(ev.pointerId);
        }}
        onPointerCancel={() => {
          panGesto.current = null;
          setPan(false);
        }}
      >
        <div
          className="st-map-size"
          style={{ width: 6100 * zoom, height: 4100 * zoom }}
        >
          <div className="st-map-world" style={{ transform: `scale(${zoom})` }}>
            <svg
              className="st-map-connections"
              width="6100"
              height="4100"
              aria-hidden="true"
            >
              {lista.map((i, idx) => {
                const p = posicao(i, idx);
                return (
                  <path
                    key={i.id}
                    d={`M 330 255 C ${Math.max(365, p.x - 80)} 255, ${p.x - 90} ${p.y + 80}, ${p.x} ${p.y + 80}`}
                    stroke={i.cor}
                    fill="none"
                    strokeWidth="2"
                    opacity=".3"
                  />
                );
              })}
            </svg>
            <div
              className="st-map-anchor"
              style={
                {
                  "--project-color": campanha?.cor ?? "#8472b3",
                } as CSSProperties
              }
            >
              <span className="st-kicker">
                {campanha ? "O PONTO DE PARTIDA" : "VISÃO GERAL"}
              </span>
              <h2>
                {campanha?.titulo ??
                  (avulsas ? "Suas ideias avulsas" : "Suas próximas campanhas")}
              </h2>
              <p>
                {campanha?.detalhes.objetivo ||
                  "Um lugar para enxergar como as ideias se conectam."}
              </p>
              <button onClick={() => (campanha ? abrir(campanha) : novo())}>
                {campanha
                  ? "Abrir o plano"
                  : avulsas
                    ? "Adicionar ideia"
                    : "Adicionar campanha"}
                <ArrowUpRight size={15} />
              </button>
              <div className="st-anchor-dot" />
            </div>
            {lista.map((i, idx) => {
              const p = posicao(i, idx);
              return (
                <div
                  className={`st-map-node ${movendo?.id === i.id ? "is-dragging" : ""}`}
                  key={i.id}
                  style={{ left: p.x, top: p.y }}
                >
                  <button
                    className="st-map-handle"
                    aria-label={`Mover ${i.titulo} no mapa. Use as setas do teclado.`}
                    disabled={ocupado}
                    onPointerDown={(ev) => iniciar(ev, i, idx)}
                    onPointerMove={mover}
                    onPointerUp={(ev) => void terminar(ev, i)}
                    onPointerCancel={() => {
                      gesto.current = null;
                      setMovendo(null);
                    }}
                    onKeyDown={(ev) => {
                      const delta: Record<string, Ponto> = {
                        ArrowLeft: { x: -24, y: 0 },
                        ArrowRight: { x: 24, y: 0 },
                        ArrowUp: { x: 0, y: -24 },
                        ArrowDown: { x: 0, y: 24 },
                      };
                      if (delta[ev.key] && !ev.repeat && !ocupado) {
                        ev.preventDefault();
                        void atualizar({
                          ...i,
                          detalhes: {
                            ...i.detalhes,
                            visual: {
                              contexto,
                              x: Math.max(
                                20,
                                Math.min(5700, p.x + delta[ev.key].x),
                              ),
                              y: Math.max(
                                20,
                                Math.min(3600, p.y + delta[ev.key].y),
                              ),
                            },
                          },
                        });
                      }
                    }}
                  >
                    <Grip size={17} />
                  </button>
                  <Cartao
                    item={i}
                    dados={dados}
                    abrir={
                      i.natureza === "campanha" && !campanha
                        ? () => selecionar(i.id)
                        : abrir
                    }
                    ocupado={ocupado}
                    arrastavel={false}
                  />
                  {i.natureza === "campanha" && (
                    <button
                      className="st-map-expand"
                      onClick={() => selecionar(i.id)}
                    >
                      <Expand size={13} />
                      Explorar{" "}
                      {
                        dados.itens.filter((a) => a.campanha_id === i.id).length
                      }{" "}
                      ações
                    </button>
                  )}
                </div>
              );
            })}
            {!lista.length && (
              <button className="st-map-empty" onClick={novo}>
                <Plus size={24} />
                <strong>
                  {campanha
                    ? "Qual é a primeira ação?"
                    : "Coloque uma ideia no mapa"}
                </strong>
                <span>Clique para começar</span>
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="st-map-controls">
        <span>
          <Hand size={15} />
          Arraste o fundo para navegar
        </span>
        <div>
          <button
            aria-label="Diminuir zoom"
            onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
          >
            <Minus size={16} />
          </button>
          <output aria-label="Zoom do mapa">{Math.round(zoom * 100)}%</output>
          <button
            aria-label="Aumentar zoom"
            onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
          >
            <Plus size={16} />
          </button>
          <button aria-label="Voltar à visão inicial" onClick={vistaInicial}>
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}
