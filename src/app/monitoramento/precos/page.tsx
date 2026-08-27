import { carregarPrecosPraticados } from "@/lib/dados/precos-praticados";
import MonitoramentoPrecos from "./precos-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarPrecosPraticados();
  return <MonitoramentoPrecos dados={dados} />;
}
