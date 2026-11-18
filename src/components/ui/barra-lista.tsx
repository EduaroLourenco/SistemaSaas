"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/controls";
import { Panel } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Lista longa fechada numa barra com o resumo. O toque abre um cartão por cima
 * da tela, e fechar devolve ao mesmo ponto.
 *
 * `abertaNoComputador`: em tela larga a lista fica à vista, só o celular fecha.
 */
export function BarraLista({
  titulo,
  detalhe,
  valor,
  subtitulo,
  vazio,
  largura = "960px",
  abertaNoComputador = false,
  className,
  children,
}: {
  titulo: string;
  detalhe?: string;
  valor?: string;
  subtitulo?: string;
  /** Sem lista para abrir: o motivo aparece na própria barra. */
  vazio?: string;
  largura?: string;
  abertaNoComputador?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = React.useState(false);
  const texto = (
    <span className="min-w-0 flex-1">
      <span className="block text-[14px] font-semibold text-ink">{titulo}</span>
      {(vazio ?? detalhe) && <span className="block truncate text-[12px] text-ink-3">{vazio ?? detalhe}</span>}
    </span>
  );
  const caixa = cn(
    "flex min-h-[60px] w-full items-center gap-3 rounded-r2 border border-line bg-panel px-4 py-2.5 text-left",
    abertaNoComputador && "xl:hidden",
    className,
  );

  return (
    <>
      {vazio ? (
        <div className={caixa}>{texto}</div>
      ) : (
        <button type="button" aria-haspopup="dialog" onClick={() => setAberta(true)} className={cn(caixa, "hover:bg-panel-2")}>
          {texto}
          {valor && <span className="num shrink-0 text-[13px] font-medium text-ink-2">{valor}</span>}
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
        </button>
      )}
      {abertaNoComputador && (
        <Panel className={cn("hidden overflow-hidden xl:block", className)}>
          <h2 className="border-b border-line px-4 py-3 text-[14px] font-semibold text-ink">{titulo}</h2>
          {children}
        </Panel>
      )}
      {aberta && (
        <Sheet title={titulo} subtitle={subtitulo} width={largura} className="cartao" onClose={() => setAberta(false)}>
          {children}
        </Sheet>
      )}
    </>
  );
}
