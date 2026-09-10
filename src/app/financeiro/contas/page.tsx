import { carregarContas } from "@/lib/dados/financeiro";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import ContasCliente from "./contas-cliente";

export const dynamic = "force-dynamic";

/**
 * Contas a pagar.
 *
 * É aqui que o boleto vira número: valor, vencimento, categoria e se já
 * foi pago. O fornecedor e o funcionário são só referências — quem tem
 * muitos boletos é o cadastro, não o contrário.
 *
 * A recorrência gera linhas reais, uma por competência, em vez de uma
 * linha calculada na leitura. Conta projetada precisa poder ser editada e
 * paga sozinha: a luz de março custa diferente da de fevereiro, e um
 * valor que muda não pode reescrever os meses já pagos.
 */
export default async function Pagina() {
  const dados = await carregarContas();

  return (
    <>
      <PageHeader
        title="Contas a pagar"
        breadcrumb="Financeiro"
        description="O que vence, o que já foi pago e o que ainda vai vir"
      />
      <PageBody>
        <ContasCliente
          linhas={dados.linhas}
          categorias={dados.categorias}
          fornecedores={dados.fornecedores}
          funcionarios={dados.funcionarios}
          canais={dados.canais}
          faltaMigracao={dados.faltaMigracao}
        />
      </PageBody>
    </>
  );
}
