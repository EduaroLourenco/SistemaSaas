"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Compass } from "lucide-react";

const ROTAS = [
  { prefix: "/vendas", nome: "Vendas", pergunta: "Do resultado à explicação.", passos: [["Compare os canais", "/vendas/canais"], ["Encontre a queda", "/vendas/queda"], ["Acompanhe as metas", "/vendas/metas"]] },
  { prefix: "/anuncios", nome: "Anúncios", pergunta: "Encontre o produto. Entenda a oportunidade.", passos: [["Analise o desempenho", "/anuncios/analise"], ["Compare preços", "/produtos"], ["Revise a mídia", "/anuncios/trafego-pago"]] },
  { prefix: "/financeiro", nome: "Financeiro", pergunta: "Veja o resultado por trás das vendas.", passos: [["Leia o resultado", "/financeiro"], ["Confira os custos", "/financeiro/custos"], ["Organize as contas", "/financeiro/contas"]] },
  { prefix: "/promocoes", nome: "Promoções", pergunta: "Da oportunidade à campanha.", passos: [["Veja as campanhas", "/promocoes/campanhas"], ["Compare ofertas", "/promocoes/comparar"], ["Consulte o histórico", "/promocoes/historico"]] },
  { prefix: "/integracoes", nome: "Conexões", pergunta: "Dados confiáveis começam na origem.", passos: [["Confira as fontes", "/integracoes"], ["Gerencie as contas", "/integracoes/canais"], ["Veja os estoques", "/integracoes/estoques"]] },
  { prefix: "/relatorios", nome: "Relatórios", pergunta: "Transforme a análise em uma conversa clara.", passos: [["Prepare a apresentação", "/relatorios/apresentacao"], ["Exporte os dados", "/relatorios/exportacoes"]] },
  { prefix: "/automacoes", nome: "Automações", pergunta: "Mais controle sobre o próximo movimento.", passos: [["Revise a fila", "/automacoes"], ["Confira as regras", "/automacoes/regras"]] },
] as const;

export function RoteiroArea() {
  const pathname = usePathname();
  const area = ROTAS.find((a) => pathname === a.prefix || pathname.startsWith(a.prefix + "/"));
  if (!area) return null;
  return <details className="gerizo-route-guide">
    <summary><Compass size={15} /><span>{area.pergunta}</span><small>Explorar {area.nome.toLowerCase()}</small></summary>
    <nav aria-label={`Roteiro de ${area.nome}`}>{area.passos.map(([nome, href], i) => <Link href={href} key={href} aria-current={pathname === href ? "page" : undefined}><span>0{i + 1}</span>{nome}<ArrowUpRight size={15} /></Link>)}</nav>
  </details>;
}
