import { NextRequest, NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";

export const runtime = "nodejs";

/**
 * Os pedidos cancelados por trás de um número da tela de Cancelamentos.
 *
 * GET ?conta=<conta_canal_id>&mes=AAAA-MM (mês opcional). Lido pelo cliente
 * da sessão: o RLS e a operação ativa já limitam à empresa de quem pede.
 */
const LIMITE = 300;

export async function GET(req: NextRequest) {
  const conta = req.nextUrl.searchParams.get("conta");
  const mes = req.nextUrl.searchParams.get("mes");
  if (!conta || !/^[0-9a-f-]{36}$/.test(conta)) {
    return NextResponse.json({ erro: "Conta inválida." }, { status: 400 });
  }
  if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });
  }

  const sb = await clienteServidor();
  let q = sb
    .from("pedidos")
    .select("id,codigo_externo,data,status,total,pedido_itens(sku,titulo,quantidade)")
    .eq("conta_canal_id", conta)
    .eq("cancelado", true)
    .order("data", { ascending: false })
    .limit(LIMITE + 1);
  if (mes) {
    const [a, m] = mes.split("-").map(Number);
    const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
    q = q.gte("data", `${mes}-01`).lt("data", fim);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  const linhas = (data ?? []) as {
    id: string;
    codigo_externo: string | null;
    data: string;
    status: string | null;
    total: number | string | null;
    pedido_itens: { sku: string | null; titulo: string | null; quantidade: number | null }[] | null;
  }[];
  return NextResponse.json({
    cortado: linhas.length > LIMITE,
    pedidos: linhas.slice(0, LIMITE).map((p) => ({
      id: p.id,
      codigo: p.codigo_externo,
      data: p.data,
      status: p.status,
      total: Number(p.total) || 0,
      itens: (p.pedido_itens ?? []).map((i) => ({ sku: i.sku, titulo: i.titulo, quantidade: i.quantidade ?? 1 })),
    })),
  });
}
