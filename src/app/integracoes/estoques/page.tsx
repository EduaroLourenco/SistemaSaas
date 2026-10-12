import { carregarEstoques } from "@/lib/dados/estoques";
import { EstoquesConteudo } from "@/components/painel/estoques-conteudo";
export const dynamic = "force-dynamic";
export default async function Estoques({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const valor = (k: string) => typeof p[k] === "string" ? p[k] as string : "";
  const d = await carregarEstoques({ sku: valor("sku"), origem: valor("origem"), fonte: valor("fonte"), local: valor("local"), zeros: valor("zeros") === "1", pagina: Number(valor("pagina")) || 0 });
  return <EstoquesConteudo d={d} p={p} />;
}
