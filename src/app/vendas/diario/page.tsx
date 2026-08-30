import { carregarDiario } from "@/lib/dados/diario";
import ComparativoDiario from "./diario-cliente";

export const dynamic = "force-dynamic";

/**
 * O canal escolhido vive na URL, não no estado do componente.
 *
 * Assim o recorte sobrevive ao recarregar e pode ser colado para outra
 * pessoa — "olha o diário da Magalu" vira um link, não uma instrução de
 * onde clicar. E o filtro roda no banco, que é onde ele custa menos.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string }>;
}) {
  const { canal } = await searchParams;
  const dados = await carregarDiario(canal);
  return <ComparativoDiario dados={dados} canalAtual={canal ?? ""} />;
}
