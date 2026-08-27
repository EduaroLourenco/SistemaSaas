import { carregarPromocoes } from "@/lib/dados/promocoes";
import Campanhas from "./campanhas-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarPromocoes();
  return <Campanhas dados={dados} />;
}
