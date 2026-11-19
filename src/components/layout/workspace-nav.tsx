"use client";

import { DemoLink as Link } from "@/lib/demo/runtime";
import { useGerizoPathname as usePathname } from "@/lib/demo/runtime";

const GRUPOS = {
  administracao: [["Empresas", "/empresas"], ["Equipe", "/equipe"], ["Canais e contas", "/integracoes/canais"], ["Fontes de dados", "/integracoes"], ["Estoques", "/integracoes/estoques"], ["Preferências", "/configuracoes"]],
  relatorios: [["Exportações", "/relatorios/exportacoes"]],
} as const;

/** Só destinos já presentes na navegação; não anuncia telas ocultas. */
export function WorkspaceNav({ area = "administracao" }: { area?: keyof typeof GRUPOS }) {
  const pathname = usePathname();
  return <nav className="workspace-area-nav" aria-label={area === "administracao" ? "Administração" : "Relatórios"}>
    {GRUPOS[area].map(([nome, href]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{nome}</Link>)}
  </nav>;
}
