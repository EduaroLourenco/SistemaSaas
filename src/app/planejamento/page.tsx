import { carregarPlanejamentoComercial } from "@/lib/dados/planejamento";
import Planejamento from "./planejamento-cliente";
export const dynamic = "force-dynamic";
export const metadata = { title: "Planejamento" };
export default async function Pagina() {
  const dados = await carregarPlanejamentoComercial();
  const hoje = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  return <Planejamento key={dados.operacao} dados={dados} hoje={hoje} />;
}
