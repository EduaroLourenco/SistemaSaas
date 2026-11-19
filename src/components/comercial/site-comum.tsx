"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Brand } from "@/components/ui/brand";

export function SiteTopo({ aoPedir }: { aoPedir?: () => void }) {
  const [rolou, setRolou] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const ler = () => setRolou(window.scrollY > 8);
    ler();
    window.addEventListener("scroll", ler, { passive: true });
    return () => window.removeEventListener("scroll", ler);
  }, []);
  useEffect(() => {
    const fechar = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.current?.contains(e.target as Node)) {
        if (menu.current) menu.current.open = false;
      }
    };
    document.addEventListener("pointerdown", fechar);
    document.addEventListener("keydown", fechar);
    return () => { document.removeEventListener("pointerdown", fechar); document.removeEventListener("keydown", fechar); };
  }, []);
  return (
    <header className={`gz-top${rolou ? " is-scrolled" : ""}`}>
      <div className="gz-wrap">
        <Link href="/conheca" aria-label="Gerizo, início"><Brand /></Link>
        <nav className="gz-nav-desktop" aria-label="Site">
          <Link href="/funcionalidades">Funcionalidades</Link>
          <Link href="/demonstracao/sistema/vendas/dia">Sistema de exemplo</Link>
          <Link href="/entrar" className="gz-fica">Entrar</Link>
          {aoPedir
            ? <button type="button" className="gz-btn gz-btn-primary gz-btn-small" onClick={aoPedir}>Pedir demonstração</button>
            : <Link href="/conheca?demonstracao=1" className="gz-btn gz-btn-primary gz-btn-small gz-fica">Pedir demonstração</Link>}
        </nav>
        <div className="gz-nav-mobile">
          <Link href="/demonstracao/sistema/vendas/dia?tour=1" className="gz-mobile-experimentar">Experimentar</Link>
          <details ref={menu} className="gz-menu">
            <summary><Menu size={20} aria-hidden /><span>Menu</span></summary>
            <nav aria-label="Site no celular" onClick={() => { if (menu.current) menu.current.open = false; }}>
              <Link href="/funcionalidades">Funcionalidades e vídeos</Link>
              <Link href="/demonstracao/sistema/vendas/dia?tour=1">Explorar o sistema</Link>
              {aoPedir ? <button type="button" onClick={aoPedir}>Pedir demonstração</button> : <Link href="/conheca?demonstracao=1">Pedir demonstração</Link>}
              <Link href="/conheca#monte">Montar meu pacote</Link>
              <Link href="/entrar">Entrar na minha conta</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteRodape() {
  return (
    <footer className="gz-rodape">
      <div className="gz-wrap">
        <span>Gerizo, para quem vende online</span>
        <nav aria-label="Rodapé">
          <Link href="/funcionalidades">Funcionalidades</Link>
          <Link href="/conheca?demonstracao=1">Pedir demonstração</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
        </nav>
      </div>
    </footer>
  );
}
