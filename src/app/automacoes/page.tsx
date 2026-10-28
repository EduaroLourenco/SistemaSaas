import { carregarAutomacoes } from "@/lib/dados/automacoes";
import { carregarTrafegoPago } from "@/lib/dados/trafego-pago";
import { carregarRegras } from "@/lib/dados/regras-promocao";
import { carregarFolgas } from "@/lib/dados/folga-campanha";
import { carregarFila } from "@/lib/dados/fila-aprovacao";
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
  const [dados, ads, { regras }, folgas, fila] = await Promise.all([
    carregarAutomacoes(),
    carregarTrafegoPago(),
    carregarRegras(),
    carregarFolgas(),
    carregarFila(),
  ]);
  return <Automacoes dados={dados} ads={ads} regras={regras} folgas={folgas} fila={fila} />;
}
