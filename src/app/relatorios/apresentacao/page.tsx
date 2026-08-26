import { carregarApresentacao } from "@/lib/dados/apresentacao";
import Apresentacao from "./apresentacao-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarApresentacao();
  return <Apresentacao dados={dados} />;
}
