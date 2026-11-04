"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Compass } from "lucide-react";

const ROTAS = [
  { prefix: "/vendas", nome: "Vendas", passos: [["Compare os canais", "/vendas/canais"], ["Encontre a queda", "/vendas/queda"], ["Acompanhe as metas", "/vendas/metas"]] },
  { prefix: "/anuncios", nome: "Anúncios", passos: [["Analise o desempenho", "/anuncios/analise"], ["Compare preços", "/produtos"], ["Revise a mídia", "/anuncios/trafego-pago"]] },
  { prefix: "/financeiro", nome: "Financeiro", passos: [["Leia o resultado", "/financeiro"], ["Confira os custos", "/financeiro/custos"], ["Organize as contas", "/financeiro/contas"]] },
  { prefix: "/promocoes", nome: "Promoções", passos: [["Veja as campanhas", "/promocoes/campanhas"], ["Compare ofertas", "/promocoes/comparar"], ["Consulte o histórico", "/promocoes/historico"]] },
  { prefix: "/integracoes", nome: "Conexões", passos: [["Confira as fontes", "/integracoes"], ["Gerencie as contas", "/integracoes/canais"], ["Veja os estoques", "/integracoes/estoques"]] },
  { prefix: "/relatorios", nome: "Relatórios", passos: [["Prepare a apresentação", "/relatorios/apresentacao"], ["Exporte os dados", "/relatorios/exportacoes"]] },
  { prefix: "/automacoes", nome: "Automações", passos: [["Revise a fila", "/automacoes"], ["Confira as regras", "/automacoes/regras"]] },
] as const;

export function RoteiroArea() {
  const pathname = usePathname();
  const area = ROTAS.find((a) => pathname === a.prefix || pathname.startsWith(a.prefix + "/"));
  if (!area) return null;
  return <details className="gerizo-route-guide">
    <summary><Compass size={15} /><span>Atalhos de {area.nome.toLowerCase()}</span></summary>
    <nav aria-label={`Roteiro de ${area.nome}`}>{area.passos.map(([nome, href]) => <Link href={href} key={href} aria-current={pathname === href ? "page" : undefined}>{nome}<ArrowUpRight size={15} /></Link>)}</nav>
  </details>;
}
