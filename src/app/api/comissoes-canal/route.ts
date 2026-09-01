import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";

/**
 * A alíquota de tabela por canal e tipo de anúncio.
 *
 * `tipo` nulo é a alíquota que vale para qualquer anúncio do canal — a
 * maioria dos marketplaces cobra uma taxa só. O Mercado Livre é a
 * exceção que motiva a coluna: clássico e premium cobram diferente, e a
 * diferença de cinco pontos muda o preço que fecha uma margem.
 */

const TIPOS = ["classico", "premium", "outro"] as const;
type Tipo = (typeof TIPOS)[number];

type Comissao = {
  id?: string;
  canalId: string;
  tipo: Tipo | null;
  comissao: number;
  vigenciaInicio?: string;
};

export async function POST(req: Request) {
  const sb = await clienteServidor();

  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  let corpo: { comissoes?: Comissao[]; apagar?: string[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  const operacao = await operacaoPadrao();
  if (!operacao) {
    return NextResponse.json({ erro: "Nenhuma operação acessível." }, { status: 403 });
  }

  const apagar = corpo.apagar ?? [];
  if (apagar.length) {
    const { error } = await sb.from("comissoes_canal").delete().in("id", apagar);
    if (error) {
      return NextResponse.json(
        {
          erro:
            error.code === "42501"
              ? "Seu papel não permite apagar alíquotas."
              : error.message,
        },
        { status: error.code === "42501" ? 403 : 400 }
      );
    }
  }

  const comissoes = corpo.comissoes ?? [];
  if (!comissoes.length && !apagar.length) {
    return NextResponse.json({ erro: "Nada para gravar" }, { status: 400 });
  }

  const linhas: Record<string, unknown>[] = [];
  for (const c of comissoes) {
    if (!c.canalId) {
      return NextResponse.json({ erro: "Escolha o canal." }, { status: 400 });
    }
    if (c.tipo != null && !TIPOS.includes(c.tipo)) {
      return NextResponse.json(
        { erro: `Tipo de anúncio desconhecido: ${c.tipo}` },
        { status: 400 }
      );
    }
    if (
      typeof c.comissao !== "number" ||
      !Number.isFinite(c.comissao) ||
      c.comissao < 0 ||
      c.comissao >= 100
    ) {
      return NextResponse.json(
        { erro: "A alíquota precisa estar entre 0 e 100." },
        { status: 400 }
      );
    }

    linhas.push({
      ...(c.id ? { id: c.id } : {}),
      operacao_id: operacao.id,
      canal_id: c.canalId,
      tipo: c.tipo,
      comissao: c.comissao,
      vigencia_inicio: c.vigenciaInicio ?? new Date().toISOString().slice(0, 10),
      atualizado_em: new Date().toISOString(),
    });
  }

  if (linhas.length) {
    const { error } = await sb.from("comissoes_canal").upsert(linhas);
    if (error) {
      const semPermissao = error.code === "42501";
      const duplicada = error.code === "23505";
      return NextResponse.json(
        {
          erro: semPermissao
            ? "Seu papel não permite cadastrar alíquotas."
            : duplicada
              ? "Já existe alíquota para esse canal e tipo com a mesma vigência. Mude a data para registrar um reajuste."
              : error.message,
        },
        { status: semPermissao ? 403 : 400 }
      );
    }
  }

  return NextResponse.json({ gravadas: linhas.length, apagadas: apagar.length });
}
