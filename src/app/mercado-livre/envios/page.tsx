import { carregarEnvios } from "@/lib/dados/envios-meli";
import EnviosCliente from "./envios-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  return <EnviosCliente dados={await carregarEnvios()} />;
}
