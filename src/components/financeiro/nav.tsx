"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import "./financeiro.css";

const DESTINOS = [
  ["Resultado", "/financeiro"], ["Custos", "/financeiro/custos"],
  ["Contas a pagar", "/financeiro/contas"], ["Categorias", "/financeiro/categorias"],
  ["Folha", "/financeiro/folha"], ["Fornecedores", "/financeiro/fornecedores"],
] as const;

export function FinanceNav() {
  const pathname = usePathname();
  return <nav className="finance-nav" aria-label="Financeiro">{DESTINOS.map(([label, href]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={cn(pathname === href && "active")}>{label}</Link>)}</nav>;
}
