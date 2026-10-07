import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";

export const runtime = "nodejs";

/**
 * Renomear e apagar a empresa, e mexer nas operações dela.
 *
 * Quem decide se pode é o banco, não esta rota: `organizacoes` e
 * `operacoes` só têm política de leitura, e toda escrita passa por função
 * `security definer` que confere o papel. Repetir a checagem aqui daria
 * duas verdades para manter em dia.
 *
 * As recusas do banco viram status HTTP para a tela poder distinguir
 * "não pode" de "não deu": 42501 é permissão, 23503 e 23514 são trava de
 * integridade — empresa com pedido, ou a última operação.
 */
const STATUS: Record<string, number> = {
  "42501": 403,
  "23503": 409,
  "23514": 409,
  P0002: 404,
  "22023": 400,
};

const recusa = (e: { code?: string; message: string }) =>
  NextResponse.json({ erro: e.message }, { status: STATUS[e.code ?? ""] ?? 400 });

type Corpo = {
  acao?: unknown;
  nome?: unknown;
  operacaoId?: unknown;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: organizacaoId } = await ctx.params;
    const corpo = (await req.json().catch(() => null)) as Corpo | null;
    const acao = typeof corpo?.acao === "string" ? corpo.acao : "";
    const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
    const operacaoId = typeof corpo?.operacaoId === "string" ? corpo.operacaoId : "";

    /* Sem estreitamento: a tela de empresas trabalha fora da escolhida. */
    const sb = await clienteServidor({ todasOperacoes: true });

    switch (acao) {
      case "renomear": {
        if (!nome) return NextResponse.json({ erro: "Dê um nome." }, { status: 400 });
        const { error } = await sb.rpc("renomear_organizacao", {
          p_org: organizacaoId,
          p_nome: nome,
        });
        return error ? recusa(error) : NextResponse.json({ ok: true });
      }

      case "excluir": {
        const { error } = await sb.rpc("excluir_organizacao", { p_org: organizacaoId });
        return error ? recusa(error) : NextResponse.json({ ok: true });
      }

      case "criar-operacao": {
        if (!nome) return NextResponse.json({ erro: "Dê um nome à operação." }, { status: 400 });
        const { data, error } = await sb.rpc("criar_operacao", {
          p_org: organizacaoId,
          p_nome: nome,
        });
        return error ? recusa(error) : NextResponse.json({ ok: true, operacaoId: data });
      }

      case "renomear-operacao": {
        if (!operacaoId) return NextResponse.json({ erro: "Diga qual operação." }, { status: 400 });
        if (!nome) return NextResponse.json({ erro: "Dê um nome." }, { status: 400 });
        const { error } = await sb.rpc("renomear_operacao", {
          p_operacao: operacaoId,
          p_nome: nome,
        });
        return error ? recusa(error) : NextResponse.json({ ok: true });
      }

      case "excluir-operacao": {
        if (!operacaoId) return NextResponse.json({ erro: "Diga qual operação." }, { status: 400 });
        const { error } = await sb.rpc("excluir_operacao", { p_operacao: operacaoId });
        return error ? recusa(error) : NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ erro: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha." },
      { status: 500 }
    );
  }
}

/** As operações da empresa, para a tela montar a lista expandida. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: organizacaoId } = await ctx.params;
    const sb = await clienteServidor({ todasOperacoes: true });
    const { data, error } = await sb.rpc("operacoes_da_organizacao", { p_org: organizacaoId });
    if (error) return recusa(error);

    type Linha = {
      operacao_id: string;
      nome: string;
      slug: string;
      contas: number;
      pedidos: number;
      conectadas: number;
    };
    return NextResponse.json({
      operacoes: ((data ?? []) as Linha[]).map((o) => ({
        id: o.operacao_id,
        nome: o.nome,
        slug: o.slug,
        contas: Number(o.contas),
        pedidos: Number(o.pedidos),
        conectadas: Number(o.conectadas),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha." },
      { status: 500 }
    );
  }
}
