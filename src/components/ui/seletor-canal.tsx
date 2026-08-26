"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

/**
 * Escolha de canal, com "todos" como primeira opção.
 *
 * Existe em toda tela de análise pelo mesmo motivo: no consolidado, a alta
 * de um canal cobre a queda de outro e a semana parece estável. Só olhando
 * um por vez dá para responder "quem caiu".
 *
 * O menu é renderizado num PORTAL, com posição fixa. A faixa de filtros do
 * cabeçalho tem `overflow-x-auto` para rolar em telas estreitas, e isso
 * recorta qualquer filho posicionado — a lista aparecia cortada na segunda
 * linha. Portal é o que tira o menu de dentro do contêiner que rola.
 */

export type OpcaoCanal = { id: string; nome: string; cor?: string };

export function SeletorCanal({
  canais,
  valor,
  onChange,
  rotuloTodos = "Todos os canais",
  className,
}: {
  canais: OpcaoCanal[];
  /** "" significa todos. */
  valor: string;
  onChange: (v: string) => void;
  rotuloTodos?: string;
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [caixa, setCaixa] = React.useState<{ x: number; y: number; w: number } | null>(null);
  const botao = React.useRef<HTMLButtonElement>(null);
  const menu = React.useRef<HTMLDivElement>(null);

  const posicionar = React.useCallback(() => {
    const b = botao.current?.getBoundingClientRect();
    if (!b) return;
    const largura = Math.max(b.width, 232);
    // Encosta na direita quando não couber: menu saindo da tela é pior que
    // menu desalinhado.
    const x = Math.min(b.left, window.innerWidth - largura - 8);
    setCaixa({ x: Math.max(8, x), y: b.bottom + 4, w: largura });
  }, []);

  React.useLayoutEffect(() => {
    if (aberto) posicionar();
  }, [aberto, posicionar]);

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (botao.current?.contains(alvo) || menu.current?.contains(alvo)) return;
      setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    // Rolar ou redimensionar move o botão; o menu fixo ficaria para trás.
    const mover = () => posicionar();

    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("resize", mover);
    window.addEventListener("scroll", mover, true);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("resize", mover);
      window.removeEventListener("scroll", mover, true);
    };
  }, [aberto, posicionar]);

  const atual = canais.find((c) => c.id === valor);
  const rotulo = atual?.nome ?? rotuloTodos;
  const opcoes: OpcaoCanal[] = [{ id: "", nome: rotuloTodos }, ...canais];

  // Até três canais cabem em fileira sem quebrar o cabeçalho.
  if (canais.length <= 3) {
    return (
      <div
        className={cn(
          "flex items-center gap-1 p-0.5 rounded-r1 bg-panel-3 border border-line shrink-0",
          className
        )}
      >
        {opcoes.map((c) => (
          <button
            key={c.id || "todos"}
            onClick={() => onChange(c.id)}
            className={cn(
              "h-6 px-2.5 rounded-[4px] text-[12px] font-medium transition-colors whitespace-nowrap",
              valor === c.id
                ? "bg-panel text-ink shadow-[var(--sh-1)]"
                : "text-ink-3 hover:text-ink"
            )}
          >
            {c.nome}
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <button
        ref={botao}
        onClick={() => setAberto((a) => !a)}
        className={cn(
          "h-7 pl-2.5 pr-2 flex items-center gap-1.5 rounded-r1 bg-panel shrink-0",
          "border border-line-2 text-[12.5px] text-ink hover:bg-panel-3",
          "transition-colors max-w-[260px]",
          className
        )}
      >
        {atual?.cor && (
          <span
            className="w-2 h-2 rounded-[2px] shrink-0"
            style={{ background: atual.cor }}
          />
        )}
        <span className="truncate">{rotulo}</span>
        <ChevronDown className="w-3.5 h-3.5 text-ink-3 shrink-0" />
      </button>

      {aberto &&
        caixa &&
        createPortal(
          <div
            ref={menu}
            className="fixed z-[60] panel py-1 overflow-y-auto"
            style={{
              left: caixa.x,
              top: caixa.y,
              width: caixa.w,
              // Nunca passar do fim da janela: com quinze canais a lista
              // ultrapassaria a dobra e as últimas opções ficariam fora.
              maxHeight: `min(340px, calc(100vh - ${caixa.y + 12}px))`,
              boxShadow: "var(--sh-3)",
            }}
          >
            {opcoes.map((c) => (
              <button
                key={c.id || "todos"}
                onClick={() => {
                  onChange(c.id);
                  setAberto(false);
                }}
                className={cn(
                  "w-full px-2.5 py-1.5 flex items-center gap-2 text-left text-[12.5px]",
                  valor === c.id
                    ? "text-ink bg-panel-3"
                    : "text-ink-2 hover:bg-panel-3 hover:text-ink"
                )}
              >
                <span className="w-3.5 shrink-0">
                  {valor === c.id && <Check className="w-3.5 h-3.5 text-brand" />}
                </span>
                {c.cor && (
                  <span
                    className="w-2 h-2 rounded-[2px] shrink-0"
                    style={{ background: c.cor }}
                  />
                )}
                <span className="truncate">{c.nome}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
