import { carregarTermometro } from "@/lib/dados/termometro";
import { emCache } from "@/lib/cache-tela";
import TermometroCliente from "./termometro-cliente";

export const dynamic = "force-dynamic";

/**
 * Termômetro do Mercado Livre.
 *
 * Conta e semana vêm da URL para que "a semana passada da 2ª conta" seja
 * um link que se cola no chat.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ conta?: string; semana?: string }>;
}) {
  const { conta, semana } = await searchParams;
  const dados = await emCache("termometro", { conta, semana }, () => carregarTermometro({ conta, semana }));
  return <TermometroCliente dados={dados} />;
}
