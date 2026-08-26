import { carregarPainel } from "@/lib/dados/painel";
import VisaoGeral from "./painel-cliente";

/**
 * O painel é servido pelo servidor: a consulta roda como o usuário logado,
 * sob RLS, e a tela recebe o resultado pronto. Nada de chave de banco
 * viajando para o navegador, e nada de tela piscando vazia enquanto busca.
 */
export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarPainel();
  return <VisaoGeral dados={dados} />;
}
