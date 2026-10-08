import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { abastecerProdutos } from "@/lib/produtos/abastecer";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cadastro de produto.
 *
 *   { acao: "abastecer" }  cria produto para todo SKU anunciado ou vendido
 *                          que ainda não tem (o mesmo que a sincronização faz)
 *   { acao: "novo", sku, titulo, custo?, embalagem?, imposto?, peso? }
 *
 * Cliente de SESSÃO: o RLS de `produtos` decide quem grava.
 */
export async function POST(req: Request) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) return NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 });
  const op = await operacaoPadrao();
  if (!op) return NextResponse.json({ erro: "Nenhuma operação." }, { status: 404 });
  const { data: pode } = await sb.rpc("pode_editar_operacao", { op: op.id });
  if (!pode) return NextResponse.json({ erro: "Seu acesso é de leitura." }, { status: 403 });

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (corpo.acao === "abastecer") {
    try {
      return NextResponse.json(await abastecerProdutos(sb, op.id));
    } catch (e) {
      return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
    }
  }

  if (corpo.acao === "novo") {
    const sku = String(corpo.sku ?? "").trim();
    const titulo = String(corpo.titulo ?? "").trim();
    if (!sku || sku.length > 80) return NextResponse.json({ erro: "Informe o SKU." }, { status: 400 });
    const num = (v: unknown, teto: number) => {
      if (v === undefined || v === null || v === "") return null;
      const x = Number(String(v).replace(",", "."));
      return Number.isFinite(x) && x >= 0 && x <= teto ? x : NaN;
    };
    const campos = {
      custo_unitario: num(corpo.custo, 1_000_000),
      embalagem: num(corpo.embalagem, 100_000),
      aliquota_impostos: num(corpo.imposto, 100),
      peso_kg: num(corpo.peso, 10_000),
    };
    if (Object.values(campos).some((v) => Number.isNaN(v))) {
      return NextResponse.json({ erro: "Algum valor está fora do razoável." }, { status: 400 });
    }
    const { error } = await sb.from("produtos").insert({
      operacao_id: op.id,
      sku,
      titulo: titulo || sku,
      ...campos,
      custo_atualizado_em: campos.custo_unitario != null ? new Date().toISOString() : null,
    });
    if (error) {
      const repetido = error.code === "23505";
      return NextResponse.json(
        { erro: repetido ? `O SKU ${sku} já está cadastrado.` : error.message },
        { status: repetido ? 409 : 400 }
      );
    }
    // Liga anúncios que já usam esse SKU.
    await abastecerProdutos(sb, op.id).catch(() => null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "Ação desconhecida." }, { status: 400 });
}
