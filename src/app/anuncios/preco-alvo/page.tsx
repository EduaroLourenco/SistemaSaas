import { carregarPrecoAlvo } from "@/lib/dados/preco-alvo";
import PrecoAlvoCliente from "./preco-alvo-cliente";

export const dynamic = "force-dynamic";

/**
 * Preço-alvo.
 *
 * Separada de `/anuncios/preco-ideal`, que compara o preço ideal de uma
 * planilha importada com o praticado. Esta CALCULA o preço a partir do
 * custo e da margem que se quer — outra pergunta, outra fonte, outra
 * tela.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string }>;
}) {
  const { canal } = await searchParams;
  const dados = await carregarPrecoAlvo(canal || undefined);
  return <PrecoAlvoCliente dados={dados} />;
}
