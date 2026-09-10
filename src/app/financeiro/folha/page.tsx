import { carregarFuncionarios } from "@/lib/dados/financeiro";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import FolhaCliente from "./folha-cliente";

export const dynamic = "force-dynamic";

/**
 * Folha de pagamento.
 *
 * Duas coisas diferentes moram aqui, e a tela separa: o FUNCIONÁRIO, que
 * é cadastro e muda pouco, e a COMPETÊNCIA, que é o mês fechado e muda
 * todo mês.
 *
 * O cadastro guarda o padrão — salário, benefícios, encargos, dia de
 * pagamento. A competência é o que de fato saiu naquele mês, que quase
 * sempre é o padrão e às vezes não é: férias, rescisão, bônus.
 *
 * Guardar só o cadastro faria a DRE de março usar o salário de hoje. É o
 * mesmo erro do frete de tabela reescrevendo a margem de julho.
 */
export default async function Pagina() {
  const dados = await carregarFuncionarios();

  return (
    <>
      <PageHeader
        title="Folha de pagamento"
        breadcrumb="Financeiro"
        description="Quem está na equipe e quanto custa por mês"
      />
      <PageBody>
        <FolhaCliente
          linhas={dados.linhas}
          categorias={dados.categorias}
          folha={dados.folha}
          faltaMigracao={dados.faltaMigracao}
        />
      </PageBody>
    </>
  );
}
