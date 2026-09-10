import { carregarFornecedores } from "@/lib/dados/financeiro";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import FornecedoresCliente from "./fornecedores-cliente";

export const dynamic = "force-dynamic";

/**
 * Fornecedores.
 *
 * A tela era um aviso de ausência: "a tabela existe no banco e espera a
 * primeira carga". Agora ela é onde a carga acontece.
 *
 * O cadastro guarda quem é o fornecedor e como ele cobra — condição de
 * pagamento, dia de vencimento. O boleto em si é uma CONTA, e vive em
 * "Contas a pagar" apontando para aqui: um fornecedor tem muitos boletos,
 * e misturar os dois faria cada nova fatura virar um cadastro novo.
 */
export default async function Pagina() {
  const dados = await carregarFornecedores();

  return (
    <>
      <PageHeader
        title="Fornecedores"
        breadcrumb="Financeiro"
        description="Quem cobra, e como cobra"
      />
      <PageBody>
        <FornecedoresCliente
          linhas={dados.linhas}
          categorias={dados.categorias}
          faltaMigracao={dados.faltaMigracao}
        />
      </PageBody>
    </>
  );
}
