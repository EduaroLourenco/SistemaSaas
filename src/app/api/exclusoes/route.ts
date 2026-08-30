import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";

export const runtime = "nodejs";

/** Cria uma exclusão de análise. O dado permanece no banco. */
export async function POST(req: Request) {
  try {
    const corpo = await req.json();
    const dataInicio = String(corpo.dataInicio ?? "").slice(0, 10);
    const dataFim = String(corpo.dataFim || corpo.dataInicio || "").slice(0, 10);
    const motivo = String(corpo.motivo ?? "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) {
      return NextResponse.json({ erro: "Informe a data." }, { status: 400 });
    }
    if (dataFim < dataInicio) {
      return NextResponse.json(
        { erro: "A data final não pode ser anterior à inicial." },
        { status: 400 }
      );
    }
    // Motivo é obrigatório de propósito: exclusão sem justificativa vira
    // folclore, e daqui a seis meses ninguém ousa reverter o que não
    // entende.
    if (motivo.length < 3) {
      return NextResponse.json(
        { erro: "Explique o motivo — quem vier depois vai precisar dele." },
        { status: 400 }
      );
    }

    const op = await operacaoPadrao();
    if (!op) {
      return NextResponse.json({ erro: "Nenhuma operação visível." }, { status: 403 });
    }

    const sb = await clienteServidor();
    const { data: usuario } = await sb.auth.getUser();

    const { data, error } = await sb
      .from("exclusoes_analise")
      .insert({
        operacao_id: op.id,
        data_inicio: dataInicio,
        data_fim: dataFim,
        canal_id: corpo.canalId || null,
        conta_canal_id: corpo.contaCanalId || null,
        motivo,
        criado_por: usuario.user?.id ?? null,
      })
      .select("id")
      .single();

    if (error) {
      const semPermissao = error.code === "42501";
      return NextResponse.json(
        { erro: semPermissao ? "Seu papel não permite excluir períodos." : error.message },
        { status: semPermissao ? 403 : 400 }
      );
    }

    return NextResponse.json({ id: data.id });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha ao excluir." },
      { status: 400 }
    );
  }
}

/** Reverte uma exclusão. Nada foi perdido, então voltar é barato. */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Falta o id." }, { status: 400 });

  const sb = await clienteServidor();
  const { error } = await sb.from("exclusoes_analise").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
