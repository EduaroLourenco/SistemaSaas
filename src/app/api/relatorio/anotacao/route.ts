import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { clienteServidor } from "@/lib/supabase/servidor";

export const runtime = "nodejs";

/**
 * Grava o texto que o Eduardo escreveu no relatório.
 *
 * Quem tem o link tem a caneta: a página é aberta por chave secreta, e
 * quem consegue ler o faturamento da operação também pode escrever a
 * interpretação dele. Separar as duas coisas exigiria login, e o link
 * existe justamente para mandar a diretoria sem criar conta para cada um.
 *
 * Guarda em `anotacoes`, a tabela que já existia para isto, com
 * `entidade = 'relatorio'`. Criar tabela nova seria manter duas.
 */

function chaveCerta(recebida: string | null) {
  const esperada = process.env.RELATORIO_CHAVE;
  if (!esperada || !recebida) return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  let corpo: { chave?: string; id?: string; texto?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const { chave, id, texto } = corpo;
  if (!id || typeof texto !== "string") {
    return NextResponse.json({ erro: "Informe id e texto." }, { status: 400 });
  }

  // Ou a chave do link, ou alguém logado no sistema.
  let autorizado = chaveCerta(chave ?? null);
  let usuarioId: string | null = null;
  if (!autorizado) {
    const sb = await clienteServidor();
    const { data } = await sb.auth.getUser();
    if (data?.user) {
      autorizado = true;
      usuarioId = data.user.id;
    }
  }
  if (!autorizado) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const sb = clientePrivilegiado();

  /*
   * A operação é resolvida com o cliente privilegiado, não com
   * `operacaoPadrao()`.
   *
   * Aquela função lê pela sessão do usuário, e quem abre o relatório por
   * link não tem sessão — a consulta voltava vazia e a gravação
   * respondia "nenhuma operação encontrada" para todo mundo que não
   * estivesse logado. É a mesma operação de onde o relatório foi montado.
   */
  const { data: operacoes } = await sb.from("operacoes").select("id").eq("ativa", true).order("criado_em").limit(1);
  const op = operacoes?.[0];
  if (!op) return NextResponse.json({ erro: "Nenhuma operação encontrada." }, { status: 400 });
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  /*
   * Apaga e grava, em vez de upsert.
   *
   * `anotacoes` não tem restrição única — foi feita para acumular
   * anotação por data, não para guardar uma versão. Um upsert sem
   * restrição viraria inserção repetida, e o campo passaria a ter duas
   * verdades. Apagar antes mantém uma linha por campo do relatório.
   *
   * Texto vazio só apaga: é o que o botão de limpar espera, e devolve o
   * campo ao texto padrão em vez de mostrar um branco que parece defeito.
   */
  const limpar = await sb
    .from("anotacoes")
    .delete()
    .eq("operacao_id", op.id)
    .eq("entidade", "relatorio")
    .eq("entidade_id", id);
  if (limpar.error) return NextResponse.json({ erro: limpar.error.message }, { status: 500 });

  if (!texto.trim()) return NextResponse.json({ ok: true, apagado: true });

  const { error } = await sb.from("anotacoes").insert({
    operacao_id: op.id,
    entidade: "relatorio",
    entidade_id: id,
    data: hoje,
    texto: texto.slice(0, 5000),
    criado_por: usuarioId,
  });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
