import { carregarResultadosPlanejamento } from "@/lib/dados/planejamento-resultados";
import ResultadosCliente from "./resultados-cliente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resultados das campanhas" };

export default async function Pagina() {
  const dados = await carregarResultadosPlanejamento();
  return <ResultadosCliente dados={dados} />;
}
