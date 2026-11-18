import Link from "next/link";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
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
        actions={dados.souAdmin ? <Link href="/interessados" className="inline-flex min-h-10 items-center rounded-r1 border border-line-2 bg-panel px-4 text-[14px] font-medium text-ink hover:bg-panel-2">Interessados no Gerizo</Link> : undefined}
        description={
          dados.souAdmin
            ? "Crie a empresa do cliente e mande o link de acesso"
            : "As empresas a que você tem acesso"
        }
      />
      <PageBody className="management-workspace"><WorkspaceNav />
        <EmpresasCliente dados={dados} />
      </PageBody>
    </>
  );
}
