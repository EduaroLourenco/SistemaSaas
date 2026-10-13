import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";

export type PrecoVitrineAtual = { preco: number; data: string | null; origem: "oferta" | "cadastro" };
/** Última oferta observada, independente das datas de vendas escolhidas. */
export async function carregarVitrineAtual() {
  const sb = await clienteServidor();
  const { data, error } = await sb.from("anuncio_estoque_diario").select("data").not("preco", "is", null).order("data", { ascending: false }).limit(1);
  if (error) throw new Error("Não foi possível consultar os preços de vitrine.");
  const resultado = new Map<string, PrecoVitrineAtual>();
  if (!data?.[0]) return resultado;
  const de = new Date(`${data[0].data}T12:00:00Z`); de.setUTCDate(de.getUTCDate() - 30);
  const linhas = await paginar(() => sb.from("anuncio_estoque_diario").select("anuncio_id,data,preco").gte("data", de.toISOString().slice(0,10)).not("preco", "is", null).order("data", { ascending: false }));
  for (const l of linhas) if (!resultado.has(l.anuncio_id) && Number(l.preco) > 0) resultado.set(l.anuncio_id, { preco: Number(l.preco), data: l.data, origem: "oferta" });
  return resultado;
}
