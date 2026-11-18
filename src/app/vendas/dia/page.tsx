import { carregarDia } from "@/lib/dados/dia";
import { Suspense } from "react";
import { Carregando } from "@/components/ui/carregando";
import DiaCliente from "./dia-cliente";
import { OperacaoHoje } from "./operacao-hoje";

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
  searchParams: Promise<{ data?: string; canal?: string; mes?: string }>;
}) {
  const { data, canal, mes } = await searchParams;
  // canal aceita lista ("a,conta:b"); mes ("AAAA-MM") é a navegação do calendário.
  const dados = await carregarDia(data, canal || undefined, mes || undefined);
  /* Olhando outro dia, a operação de agora só atrapalharia. */
  const operacao = !data && !mes ? <Suspense fallback={<Carregando compacto />}><OperacaoHoje /></Suspense> : null;
  return <DiaCliente dados={dados} operacao={operacao} />;
}
