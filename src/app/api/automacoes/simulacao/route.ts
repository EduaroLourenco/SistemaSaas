import { NextRequest, NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { carregarCanais } from "@/lib/dados/canais";
import { paginar } from "@/lib/dados/paginar";
import type { DiaDoAnuncio } from "@/lib/planilhas/sugestoes-promocao";

export const dynamic = "force-dynamic";

/**
 * Os últimos 90 dias de um anúncio, dia a dia: preço que o comprador
 * pagou (leitura diária de `sale_price`), unidades vendidas, visitas e
 * estoque. A tela agrupa por faixa de preço — ver `desempenhoPorPreco`.
 * Só banco; nenhuma chamada ao canal.
 */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  const conta = q.get("conta") ?? "";
  const mlb = (q.get("mlb") ?? "").toUpperCase();
  if (!conta || !mlb) return NextResponse.json({ erro: "faltou conta ou mlb" }, { status: 400 });

  const { contas } = await carregarCanais();
  if (!contas.some((c) => c.id === conta)) return NextResponse.json({ erro: "conta não encontrada" }, { status: 404 });

  const sb = await clienteServidor();
  const { data: a } = await sb.from("anuncios").select("id").eq("conta_canal_id", conta).eq("codigo_externo", mlb).maybeSingle();
  if (!a) return NextResponse.json({ erro: "anúncio não encontrado" }, { status: 404 });

  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [estoque, desempenho, vendas] = await Promise.all([
    paginar(() => sb.from("anuncio_estoque_diario").select("id,data,preco,estoque").eq("anuncio_id", a.id).gte("data", desde).order("id")),
    paginar(() => sb.from("anuncio_desempenho_diario").select("id,data,visitas").eq("anuncio_id", a.id).gte("data", desde).order("id")),
    paginar(() =>
      sb.from("pedido_itens").select("id,quantidade,pedidos!inner(data,cancelado)").eq("anuncio_id", a.id)
        .gte("pedidos.data", desde).eq("pedidos.cancelado", false).order("id")
    ),
  ]) as unknown as [
    { data: string; preco: number | string | null; estoque: number | null }[],
    { data: string; visitas: number | null }[],
    { quantidade: number | string | null; pedidos: { data: string } | { data: string }[] }[],
  ];

  const dia = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const porDia = new Map<string, DiaDoAnuncio>();
  const pegar = (d: string) => {
    const k = d.slice(0, 10);
    if (!porDia.has(k)) porDia.set(k, { data: k, preco: null, unidades: 0, visitas: null, estoque: null });
    return porDia.get(k)!;
  };
  for (const e of estoque) { const d = pegar(e.data); d.preco = e.preco == null ? null : Number(e.preco); d.estoque = e.estoque; }
  for (const v of desempenho) pegar(v.data).visitas = v.visitas;
  for (const p of vendas) {
    const quando = Array.isArray(p.pedidos) ? p.pedidos[0]?.data : p.pedidos?.data;
    if (quando) pegar(dia(quando)).unidades += Number(p.quantidade ?? 1) || 1;
  }
  return NextResponse.json({ dias: [...porDia.values()].sort((x, y) => x.data.localeCompare(y.data)) });
}
