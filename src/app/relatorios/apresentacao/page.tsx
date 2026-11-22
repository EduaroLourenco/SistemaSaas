import { carregarApresentacao } from "@/lib/dados/apresentacao";
import Apresentacao from "./apresentacao-cliente";
import PaginaAcompanhamento from "./pagina-acompanhamento";

export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { searchParams: Promise<{ roteiro?: string }> }) {
  // O acompanhamento busca os próprios dados pela rota: aqui não carrega a base de vendas à toa.
  if ((await searchParams).roteiro === "meli") return <PaginaAcompanhamento />;
  const dados = await carregarApresentacao();
  return <Apresentacao dados={dados} />;
}
