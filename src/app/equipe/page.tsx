import { carregarEquipe } from "@/lib/dados/equipe";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import EquipeCliente from "./equipe-cliente";

export const dynamic = "force-dynamic";

/**
 * Quem tem acesso à empresa.
 *
 * As funções de convite existem no banco desde a migração 20 e nenhuma tela
 * as chamava — só o dono entrava, e dar acesso a alguém dependia de alguém
 * com acesso ao banco.
 *
 * Não há envio de e-mail: convidar devolve um link, e quem convidou manda
 * pelo canal que já usa. É de propósito — a plataforma mandar mensagem em
 * nome de alguém é outra decisão, e um link copiável resolve hoje.
 */
export default async function Pagina() {
  const equipe = await carregarEquipe();

  return (
    <>
      <PageHeader
        title="Equipe"
        description={
          equipe.organizacaoNome
            ? `Quem entra em ${equipe.organizacaoNome}, e com qual permissão`
            : "Quem entra, e com qual permissão"
        }
      />
      <PageBody>
        <EquipeCliente equipe={equipe} />
      </PageBody>
    </>
  );
}
