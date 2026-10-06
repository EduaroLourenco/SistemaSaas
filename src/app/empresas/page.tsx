import { carregarEmpresas } from "@/lib/dados/empresas";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import EmpresasCliente from "./empresas-cliente";

export const dynamic = "force-dynamic";

/**
 * As empresas da plataforma.
 *
 * Criar a empresa de um cliente não passava por tela nenhuma:
 * `criar_organizacao` faz de quem chama o proprietário, e serve para o
 * lojista que se cadastra sozinho. Abrir a loja de outra pessoa exigia
 * acesso ao banco.
 *
 * Quem não é admin da plataforma vê só as empresas de que é membro, e sem
 * o formulário. A tela não quebra para ele.
 */
export default async function Pagina() {
  const dados = await carregarEmpresas();

  return (
    <>
      <PageHeader
        title="Empresas"
        description={
          dados.souAdmin
            ? "Crie a empresa do cliente e mande o link de acesso"
            : "As empresas a que você tem acesso"
        }
      />
      <PageBody>
        <EmpresasCliente dados={dados} />
      </PageBody>
    </>
  );
}
