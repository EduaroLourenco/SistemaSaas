import { carregarMtd } from "@/lib/dados/mtd";
import MtdCliente from "./mtd-cliente";

export const dynamic = "force-dynamic";

/**
 * Mês até aqui.
 *
 * Mês e canais vêm da URL para que o recorte sobreviva ao refresh depois
 * de redistribuir, e para que um link com o recorte possa ser mandado a
 * alguém.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; mes?: string; canais?: string }>;
}) {
  const p = await searchParams;
  const hoje = new Date();
  const ano = Number(p.ano) || hoje.getFullYear();
  const mes = Number(p.mes) || hoje.getMonth() + 1;
  const canais = p.canais ? p.canais.split(",").filter(Boolean) : undefined;

  const dados = await carregarMtd(ano, mes, canais);
  return <MtdCliente dados={dados} />;
}
