import { carregarPromocoes } from "@/lib/dados/promocoes";
import HistoricoPromocoes from "./historico-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarPromocoes();
  return <HistoricoPromocoes dados={dados} />;
}
