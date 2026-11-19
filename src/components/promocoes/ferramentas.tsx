"use client";

import { DemoLink as Link } from "@/lib/demo/runtime";
import { useEffect, useRef } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import "./promocoes.css";

const DESTINOS = [
  { href: "/promocoes/comparar", titulo: "Comparar propostas", detalhe: "Alternativas para o mesmo anúncio" },
  { href: "/promocoes/campanhas", titulo: "Campanhas processadas", detalhe: "Adesão e itens de cada rodada" },
  { href: "/promocoes/processar", titulo: "Importar planilha de campanha", detalhe: "Conferir preços e decisões" },
  { href: "/anuncios/preco-ideal", titulo: "Referências de preço", detalhe: "Praticado e preço de referência" },
];

export function FerramentasPromocoes({ atual }: { atual?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const fecharFora = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    const fecharEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", fecharFora);
    document.addEventListener("keydown", fecharEscape);
    return () => {
      document.removeEventListener("pointerdown", fecharFora);
      document.removeEventListener("keydown", fecharEscape);
    };
  }, []);
  return <details className="promo-tools" ref={ref}>
    <summary aria-label="Ferramentas de promoções"><span className="promo-tools-label">Ferramentas</span><ChevronDown className="promo-tools-chevron" size={15} aria-hidden="true" /><MoreHorizontal className="promo-tools-icon" size={20} aria-hidden="true" /></summary>
    <div>{DESTINOS.filter(d => d.href !== atual).map(d => <Link key={d.href} href={d.href} onClick={() => { if (ref.current) ref.current.open = false; }}><strong>{d.titulo}</strong><span>{d.detalhe}</span></Link>)}</div>
  </details>;
}
