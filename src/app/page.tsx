import { redirect } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import { carregarPainel } from "@/lib/dados/painel";
import VisaoGeral from "./painel-cliente";

/**
 * O painel é servido pelo servidor: a consulta roda como o usuário logado,
 * sob RLS, e a tela recebe o resultado pronto. Nada de chave de banco
 * viajando para o navegador, e nada de tela piscando vazia enquanto busca.
 *
 * ── Quem ainda não tem empresa não para aqui ──
 *
 * A tela `/comecar` existe desde sempre e sabe devolver para cá quem já
 * tem empresa. Faltava o contrário: ninguém MANDAVA para lá quem não tem.
 * O proxy só cuida de "sem sessão vai para /entrar" e "com sessão sai de
 * /entrar", e depois do login todo mundo cai na raiz.
 *
 * O resultado era o pior desfecho possível para um cadastro novo: a pessoa
 * confirmava o e-mail, entrava, e encontrava o sistema inteiro em branco —
 * sem erro, porque o RLS estava funcionando exatamente como devia. Nada na
 * tela dizia "crie sua empresa".
 *
 * A consulta é barata e só existe no caminho da raiz: uma linha de
 * `membros`, que o RLS já restringe ao próprio usuário.
 */
export const dynamic = "force-dynamic";

export default async function Pagina() {
  const sb = await clienteServidor();
  const { data: membros } = await sb.from("membros").select("organizacao_id").limit(1);
  if (!membros?.length) redirect("/comecar");

  const dados = await carregarPainel();
  return <VisaoGeral dados={dados} />;
}
