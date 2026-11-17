import type * as React from "react";
import Planejamento from "@/app/planejamento/planejamento-cliente";
import Resultados from "@/app/planejamento/resultados/resultados-cliente";
import Financeiro from "@/app/financeiro/financeiro-cliente";
import Custos from "@/app/financeiro/custos/custos-cliente";
import Categorias from "@/app/financeiro/categorias/categorias-cliente";
import Folha from "@/app/financeiro/folha/folha-cliente";
import Fornecedores from "@/app/financeiro/fornecedores/fornecedores-cliente";
import Contas from "@/app/financeiro/contas/contas-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { PLANEJAMENTO_FIXTURE, HOJE_ESTUDIO, FINANCEIRO_PROPS, CUSTOS_PROPS, CATEGORIAS_FIXTURE, FORNECEDORES_FIXTURE, FUNCIONARIOS_FIXTURE, CONTAS_FIXTURE, RESULTADOS_FIXTURE } from "./fixtures-estudio-financeiro";
import { QaEstudioIsolamento } from "./qa-estudio-isolamento";

const cadastro = (titulo: string, children: React.ReactNode) => <><PageHeader title={titulo} /><PageBody className="finance-page">{children}</PageBody></>;
export const ROTAS_ESTUDIO_FINANCEIRO: Record<string, React.ReactNode> = {
  "/__qa/planejamento-operacao": <QaEstudioIsolamento />,
  "/planejamento": <Planejamento dados={PLANEJAMENTO_FIXTURE} hoje={HOJE_ESTUDIO} />,
  "/planejamento/resultados": <Resultados dados={RESULTADOS_FIXTURE} />,
  "/financeiro": <Financeiro {...FINANCEIRO_PROPS} />,
  "/financeiro/custos": <Custos {...CUSTOS_PROPS} />,
  "/financeiro/categorias": cadastro("Categorias", <Categorias linhas={CATEGORIAS_FIXTURE} />),
  "/financeiro/folha": cadastro("Folha de pagamento", <Folha linhas={FUNCIONARIOS_FIXTURE} categorias={CATEGORIAS_FIXTURE} folha={[]} faltaMigracao={null} />),
  "/financeiro/fornecedores": cadastro("Fornecedores", <Fornecedores linhas={FORNECEDORES_FIXTURE} categorias={CATEGORIAS_FIXTURE} faltaMigracao={null} />),
  "/financeiro/contas": cadastro("Contas a pagar", <Contas linhas={CONTAS_FIXTURE} categorias={CATEGORIAS_FIXTURE} fornecedores={FORNECEDORES_FIXTURE.map(f => ({ id: f.id, nome: f.razaoSocial }))} funcionarios={FUNCIONARIOS_FIXTURE.map(f => ({ id: f.id, nome: f.nome }))} canais={CUSTOS_PROPS.canais} faltaMigracao={null} />),
};
