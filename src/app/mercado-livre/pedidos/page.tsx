import { carregarEnvios } from "@/lib/dados/envios-meli";
import PedidosCliente from "./pedidos-cliente";

export const dynamic = "force-dynamic";

/** Acompanhamento de pedidos: a mesma leitura de Envios, com status manual e termômetro. */
export default async function Pagina() {
  return <PedidosCliente dados={await carregarEnvios()} />;
}
