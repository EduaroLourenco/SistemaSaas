import { carregarTrafegoPago } from "@/lib/dados/trafego-pago";
import TrafegoPagoCliente from "./trafego-pago-cliente";

export const dynamic = "force-dynamic";

/**
 * Tráfego pago.
 *
 * Separada da análise de anúncios porque a pergunta é outra: lá é "este
 * anúncio vende?", aqui é "a mídia deste anúncio se paga?".
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ janela?: string; canais?: string; de?: string; ate?: string }>;
}) {
  /* A janela vem da URL para o seletor sobreviver a recarga e a link
     compartilhado — e porque somar janelas sobrepostas inflava o gasto. */
  const { janela, canais, de, ate } = await searchParams;
  const dados = await carregarTrafegoPago(janela, canais, { de, ate });

  return <TrafegoPagoCliente dados={dados} />;
}
