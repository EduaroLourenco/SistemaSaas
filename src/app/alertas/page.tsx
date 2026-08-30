import { carregarAlertas } from "@/lib/dados/alertas";
import Alertas from "./alertas-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarAlertas();
  return <Alertas dados={dados} />;
}
