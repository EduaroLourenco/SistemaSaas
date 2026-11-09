import { NextResponse } from "next/server";
import { contasMeli } from "@/lib/meli/rota";
import { meliGet, vendedor } from "@/lib/meli/cliente";

/**
 * Frete que o vendedor banca no Mercado Livre, para um produto que ainda não
 * tem anúncio: medidas, peso, preço e tipo.
 *
 * Sem preço e tipo junto das medidas o canal devolve `list_cost = 0`, que
 * pareceria frete de graça — por isso os quatro são obrigatórios aqui.
 * A conta é validada pelo RLS (`contasMeli` usa o cliente da sessão).
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const conta = u.searchParams.get("conta") ?? "";
  const num = (k: string) => Number(u.searchParams.get(k));
  const [a, l, c, pesoKg, preco] = ["altura", "largura", "comprimento", "peso", "preco"].map(num);
  const tipo = u.searchParams.get("tipo") === "premium" ? "gold_pro" : "gold_special";

  if (![a, l, c, pesoKg, preco].every((v) => Number.isFinite(v) && v > 0)) {
    return NextResponse.json({ erro: "Informe altura, largura, comprimento, peso e preço." }, { status: 400 });
  }
  if (!(await contasMeli()).some((x) => x.id === conta && x.conectada)) {
    return NextResponse.json({ erro: "Conta do Mercado Livre não conectada." }, { status: 403 });
  }

  try {
    const eu = await vendedor(conta);
    const q = new URLSearchParams({
      dimensions: `${Math.ceil(a)}x${Math.ceil(l)}x${Math.ceil(c)},${Math.ceil(pesoKg * 1000)}`,
      item_price: preco.toFixed(2),
      listing_type_id: tipo,
      mode: "me2",
      condition: "new",
      free_shipping: "true",
      verbose: "true",
    });
    const r = await meliGet<{ coverage?: { all_country?: { list_cost?: number } } }>(
      `/users/${eu.id}/shipping_options/free?${q}`,
      conta
    );
    const custo = r.coverage?.all_country?.list_cost;
    return NextResponse.json({ frete: typeof custo === "number" && custo > 0 ? custo : null });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha na consulta" }, { status: 502 });
  }
}
