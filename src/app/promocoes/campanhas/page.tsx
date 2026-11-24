import { carregarPromocoes } from "@/lib/dados/promocoes";
import { emCache } from "@/lib/cache-tela";
import Campanhas from "./campanhas-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await emCache("promocoes", null, carregarPromocoes);
  return <Campanhas dados={dados} />;
}
