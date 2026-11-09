import { carregarPrecificacao } from "@/lib/dados/precificacao";
import PrecificacaoCliente from "./precificacao-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarPrecificacao();
  return <PrecificacaoCliente dados={dados} />;
}
