import { carregarAutomacoes } from "@/lib/dados/automacoes";
import Automacoes from "./automacoes-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarAutomacoes();
  return <Automacoes dados={dados} />;
}
