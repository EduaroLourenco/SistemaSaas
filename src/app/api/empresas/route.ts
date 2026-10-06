import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";

export const runtime = "nodejs";

/**
 * Criar a empresa de um cliente.
 *
 * Quem decide se pode é o banco: `criar_empresa_para` recusa quem não tem
 * a marca de admin da plataforma. Repetir a checagem aqui só daria duas
 * verdades para manter em dia.
 *
 * Devolve o token do convite; a tela monta o endereço. Não há envio de
 * e-mail, igual à tela de Equipe — quem convida copia o link e manda pelo
 * canal que já usa.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const corpo = (await req.json().catch(() => null)) as
      | { nome?: unknown; email?: unknown }
      | null;

    const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
    const email = typeof corpo?.email === "string" ? corpo.email.trim().toLowerCase() : "";

    if (!nome) {
      return NextResponse.json({ erro: "Dê um nome à empresa." }, { status: 400 });
    }
    if (!EMAIL.test(email)) {
      return NextResponse.json({ erro: "E-mail inválido." }, { status: 400 });
    }

    const sb = await clienteServidor({ todasOperacoes: true });
    const { data, error } = await sb.rpc("criar_empresa_para", {
      p_nome: nome,
      p_email: email,
      p_papel: "proprietario",
    });

    if (error) {
      /* 42501 é a recusa por permissão, e merece 403 em vez de 500. */
      const status = error.code === "42501" ? 403 : 400;
      return NextResponse.json({ erro: error.message }, { status });
    }

    const linha = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      ok: true,
      organizacaoId: linha?.organizacao_id ?? null,
      operacaoId: linha?.operacao_id ?? null,
      token: linha?.token ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha." },
      { status: 500 }
    );
  }
}
