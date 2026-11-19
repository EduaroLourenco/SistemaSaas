"use client";

import type { ReactNode } from "react";
import Categorias from "@/app/financeiro/categorias/categorias-cliente";
import Fornecedores from "@/app/financeiro/fornecedores/fornecedores-cliente";
import Folha from "@/app/financeiro/folha/folha-cliente";
import Contas from "@/app/financeiro/contas/contas-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { contextoGestaoFinanceiraDemo } from "@/lib/demo/fixtures-gestao-financeira";
import { canaisDemo } from "@/lib/demo/fixtures-base";
import "@/components/financeiro/financeiro.css";

/** A moldura e os formulários são os mesmos das páginas da operação. */
export function GestaoFinanceiraDemo({ pathname }: { pathname: string }) {
  const c=contextoGestaoFinanceiraDemo();
  let titulo="Financeiro",conteudo:ReactNode=null;
  switch(pathname) {
    case "/financeiro/categorias": titulo="Categorias";conteudo=<Categorias linhas={c.categorias}/>;break;
    case "/financeiro/fornecedores": titulo="Fornecedores";conteudo=<Fornecedores linhas={c.fornecedores} categorias={c.categorias} faltaMigracao={null}/>;break;
    case "/financeiro/folha": titulo="Folha de pagamento";conteudo=<Folha linhas={c.funcionarios} categorias={c.categorias} folha={c.folha} faltaMigracao={null}/>;break;
    case "/financeiro/contas": titulo="Contas a pagar";conteudo=<Contas linhas={c.contas} categorias={c.categorias} fornecedores={c.fornecedores.map(f=>({id:f.id,nome:f.razaoSocial}))} funcionarios={c.funcionarios.map(f=>({id:f.id,nome:f.nome}))} canais={canaisDemo.map(c=>({id:c.id,nome:c.nome}))} faltaMigracao={null}/>;break;
    default: return null;
  }
  return <><PageHeader title={titulo}/><PageBody className="finance-page">{conteudo}</PageBody></>;
}

export default GestaoFinanceiraDemo;
