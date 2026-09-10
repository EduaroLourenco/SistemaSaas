import { carregarCategorias } from "@/lib/dados/financeiro";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import CategoriasCliente from "./categorias-cliente";

export const dynamic = "force-dynamic";

/**
 * Categorias de custo.
 *
 * É o cadastro de base do financeiro: fornecedor, funcionário e conta
 * apontam para aqui, e é por aqui que a DRE agrupa. Por isso ela vem
 * antes das outras no menu — cadastrar conta sem categoria existir
 * obrigaria a voltar depois em cada lançamento.
 */
export default async function Pagina() {
  const categorias = await carregarCategorias();

  return (
    <>
      <PageHeader
        title="Categorias"
        breadcrumb="Financeiro"
        description="Como o custo é agrupado na DRE"
      />
      <PageBody>
        <CategoriasCliente linhas={categorias} />
      </PageBody>
    </>
  );
}
