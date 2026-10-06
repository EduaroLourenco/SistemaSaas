import { NextRequest, NextResponse } from "next/server";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";

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

/*
 * A chave diz QUAL empresa, não só se pode escrever.
 *
 * A versão anterior comparava com `RELATORIO_CHAVE` e depois gravava na
 * primeira operação ativa que encontrasse. Com uma empresa dava na mesma;
 * com três, a anotação escrita no relatório de uma cairia na outra, sem
 * erro nenhum — e o texto apareceria no relatório de quem não o escreveu.
 */
async function operacaoDaChave(chave: string | null) {
  if (!chave || chave.length < 32) return null;
  const sb = clientePrivilegiado();
  const { data, error } = await sb.rpc("operacao_por_chave_relatorio", { p_chave: chave });
  if (error) return null;
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha?.operacao_id as string | undefined) ?? null;
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
  let operacaoId = await operacaoDaChave(chave ?? null);
  let usuarioId: string | null = null;
  if (!operacaoId) {
    const cliente = await clienteServidor();
    const { data } = await cliente.auth.getUser();
    if (data?.user) {
      usuarioId = data.user.id;
      operacaoId = (await operacaoPadrao())?.id ?? null;
    }
  }
  if (!operacaoId) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const sb = clientePrivilegiado();

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
    .eq("operacao_id", operacaoId)
    .eq("entidade", "relatorio")
    .eq("entidade_id", id);
  if (limpar.error) return NextResponse.json({ erro: limpar.error.message }, { status: 500 });

  if (!texto.trim()) return NextResponse.json({ ok: true, apagado: true });

  const { error } = await sb.from("anotacoes").insert({
    operacao_id: operacaoId,
    entidade: "relatorio",
    entidade_id: id,
    data: hoje,
    texto: texto.slice(0, 5000),
    criado_por: usuarioId,
  });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
