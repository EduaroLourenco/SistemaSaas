import { carregarAutomacoes } from "@/lib/dados/automacoes";
import { carregarTrafegoPago } from "@/lib/dados/trafego-pago";
import Automacoes from "./automacoes-cliente";

export const dynamic = "force-dynamic";

/**
 * Automações: as duas coisas que o sistema pode mudar no canal.
 *
 * Promoção e publicidade vêm na mesma página porque são a mesma decisão
 * vista de dois lados — onde pôr desconto e onde pôr verba — e porque a
 * aplicação de escrita do Meli pede as duas permissões juntas.
 */
export default async function Pagina() {
  const [dados, ads] = await Promise.all([carregarAutomacoes(), carregarTrafegoPago()]);
  return <Automacoes dados={dados} ads={ads} />;
}
