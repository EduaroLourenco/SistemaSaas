import { carregarPromocoes } from "@/lib/dados/promocoes";
import { emCache } from "@/lib/cache-tela";
import HistoricoPromocoes from "./historico-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await emCache("promocoes", null, carregarPromocoes);
  return <HistoricoPromocoes dados={dados} />;
}
