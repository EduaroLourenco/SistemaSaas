import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { erroEquipe as erroDoBanco } from "@/lib/equipe-erros";

export const runtime = "nodejs";

/**
 * Convidar, mudar papel, remover e cancelar convite.
 *
 * Nenhuma regra de quem-pode-o-quê vive aqui. Tudo passa por função do
 * banco (`reconvidar_membro`, `alterar_papel_membro`, `remover_membro`),
 * que é `security definer` e carrega as travas: só administração mexe em
 * membro, e a empresa nunca fica sem proprietário.
 *
 * Checagem escrita na rota é checagem que a próxima rota esquece de
 * repetir. A do banco vale para qualquer caminho, inclusive um script.
 */

const PAPEIS = new Set(["proprietario", "administrador", "editor", "leitor"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  let corpo: {
    acao?: string;
    organizacaoId?: string;
    email?: string;
    papel?: string;
    membroId?: string;
    conviteId?: string;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  switch (corpo.acao) {
    case "convidar": {
      const email = (corpo.email ?? "").trim().toLowerCase();
      const papel = corpo.papel ?? "leitor";
      if (!EMAIL.test(email)) {
        return NextResponse.json({ erro: "E-mail inválido." }, { status: 400 });
      }
      if (!PAPEIS.has(papel)) {
        return NextResponse.json({ erro: "Papel desconhecido." }, { status: 400 });
      }
      if (!corpo.organizacaoId) {
        return NextResponse.json({ erro: "Falta a empresa." }, { status: 400 });
      }

      const { data, error } = await sb.rpc("reconvidar_membro", {
        p_organizacao: corpo.organizacaoId,
        p_email: email,
        p_papel: papel,
      });
      if (error) {
        const t = erroDoBanco(error);
        return NextResponse.json({ erro: t.erro }, { status: t.status });
      }
      // O token volta para a tela montar o link. Não há envio de e-mail:
      // quem convida copia o link e manda pelo canal que já usa.
      return NextResponse.json({ ok: true, token: data as string });
    }

    case "papel": {
      if (!corpo.membroId || !PAPEIS.has(corpo.papel ?? "")) {
        return NextResponse.json({ erro: "Pedido incompleto." }, { status: 400 });
      }
      const { error } = await sb.rpc("alterar_papel_membro", {
        p_membro: corpo.membroId,
        p_papel: corpo.papel,
      });
      if (error) {
        const t = erroDoBanco(error);
        return NextResponse.json({ erro: t.erro }, { status: t.status });
      }
      return NextResponse.json({ ok: true });
    }

    case "remover": {
      if (!corpo.membroId) {
        return NextResponse.json({ erro: "Falta o membro." }, { status: 400 });
      }
      const { error } = await sb.rpc("remover_membro", { p_membro: corpo.membroId });
      if (error) {
        const t = erroDoBanco(error);
        return NextResponse.json({ erro: t.erro }, { status: t.status });
      }
      return NextResponse.json({ ok: true });
    }

    case "cancelar": {
      if (!corpo.conviteId) {
        return NextResponse.json({ erro: "Falta o convite." }, { status: 400 });
      }
      // Apagar convite é o único caminho direto, e a política de DELETE de
      // `convites` já exige proprietário ou administrador.
      const { error, count } = await sb
        .from("convites")
        .delete({ count: "exact" })
        .eq("id", corpo.conviteId);
      if (error) {
        const t = erroDoBanco(error);
        return NextResponse.json({ erro: t.erro }, { status: t.status });
      }
      if (!count) {
        return NextResponse.json(
          { erro: "Convite não encontrado, ou seu papel não permite cancelar." },
          { status: 403 }
        );
      }
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ erro: "Ação desconhecida." }, { status: 400 });
  }
}
