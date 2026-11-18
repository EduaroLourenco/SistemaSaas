"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { MOBILE_TABS } from "@/lib/nav";

/* Tempo sem rolagem para a barra voltar ao tamanho cheio. */
const VOLTA_MS = 240;

/** Barra flutuante: cheia parada, compacta enquanto a tela rola. */
export function BarraCelular({ pathname, onMore }: { pathname: string; onMore: () => void }) {
  const barra = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const rolou = (e: Event) => {
      /* Vale a rolagem vertical de qualquer área; faixa lateral não conta. */
      const alvo = e.target;
      if (alvo instanceof Element && alvo.scrollHeight <= alvo.clientHeight) return;
      barra.current?.setAttribute("data-rolando", "");
      clearTimeout(timer);
      timer = setTimeout(() => barra.current?.removeAttribute("data-rolando"), VOLTA_MS);
    };
    const opcoes = { passive: true, capture: true };
    document.addEventListener("scroll", rolou, opcoes);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("scroll", rolou, opcoes);
    };
  }, []);

  return (
    <nav ref={barra} aria-label="Navegação" className="gerizo-mobile-nav md:hidden">
      {MOBILE_TABS.map((t) => {
        const Icon = t.icon;
        const active = pathname === t.href || Boolean(t.rotas?.some((r) => pathname === r || pathname.startsWith(r + "/")));
        return (
          <Link key={t.href} href={t.href} aria-label={t.label} aria-current={active ? "page" : undefined}>
            <Icon size={21} aria-hidden="true" />
            <span>{t.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={onMore} aria-label="Mais telas">
        <Menu size={21} aria-hidden="true" />
        <span>Mais</span>
      </button>
    </nav>
  );
}
