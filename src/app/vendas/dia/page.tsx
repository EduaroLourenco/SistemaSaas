import { carregarDia } from "@/lib/dados/dia";
import DiaCliente from "./dia-cliente";

export const dynamic = "force-dynamic";

/**
 * O dia.
 *
 * "Mês até aqui" responde se o mês fecha. Esta responde o que aconteceu
 * ontem e se foi bom — que é outra pergunta, feita por outra pessoa, em
 * outro momento do dia.
 *
 * O recorte vive na URL: dá para mandar "olha o dia 12" como link.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; canal?: string }>;
}) {
  const { data, canal } = await searchParams;
  const dados = await carregarDia(data, canal || undefined);
  return <DiaCliente dados={dados} />;
}
