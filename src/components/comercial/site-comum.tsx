"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/ui/brand";

export function SiteTopo({ aoPedir }: { aoPedir?: () => void }) {
  const [rolou, setRolou] = useState(false);
  useEffect(() => {
    const ler = () => setRolou(window.scrollY > 8);
    ler();
    window.addEventListener("scroll", ler, { passive: true });
    return () => window.removeEventListener("scroll", ler);
  }, []);
  return (
    <header className={`gz-top${rolou ? " is-scrolled" : ""}`}>
      <div className="gz-wrap">
        <Link href="/conheca" aria-label="Gerizo, início"><Brand /></Link>
        <nav aria-label="Site">
          <Link href="/funcionalidades">Funcionalidades</Link>
          <Link href="/demonstracao/sistema/vendas/dia">Sistema de exemplo</Link>
          <Link href="/entrar" className="gz-fica">Entrar</Link>
          {aoPedir
            ? <button type="button" className="gz-btn gz-btn-primary gz-btn-small" onClick={aoPedir}>Pedir demonstração</button>
            : <Link href="/conheca#monte" className="gz-btn gz-btn-primary gz-btn-small gz-fica">Pedir demonstração</Link>}
        </nav>
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
          <Link href="/conheca#monte">Pedir demonstração</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
        </nav>
      </div>
    </footer>
  );
}
