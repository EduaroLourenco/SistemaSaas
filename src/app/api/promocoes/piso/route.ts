import { NextRequest, NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";

export const runtime = "nodejs";

/**
 * O piso de promoção da empresa escolhida — ler e gravar.
 *
 * GET  /api/promocoes/piso
 * POST /api/promocoes/piso  { usarComoPiso: boolean, toleranciaPct: number }
 *
 * São duas decisões comerciais que estavam fixas no código (db/36):
 * se o número da Fórmula base é piso ou preço a propor, e quanto a oferta
 * do canal pode ficar abaixo dele e ainda ser aceita.
 *
 * Ficam na operação, não no usuário: é regra da empresa, e duas pessoas
 * processando a mesma campanha têm de chegar ao mesmo resultado.
 */

async function alvo() {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) return { erro: "Não autenticado.", status: 401 as const };
  const op = await operacaoPadrao();
  if (!op) return { erro: "Nenhuma empresa escolhida.", status: 409 as const };
  return { sb, op };
}

export async function GET() {
  const a = await alvo();
  if ("erro" in a) return NextResponse.json({ erro: a.erro }, { status: a.status });

  const { data, error } = await a.sb
    .from("operacoes")
    .select("promo_usar_como_piso,promo_tolerancia_pct")
    .eq("id", a.op.id)
    .maybeSingle();

  // Sem a migração 36 as colunas não existem: devolve o padrão antigo em
  // vez de erro, para a tela abrir mesmo antes de alguém rodar o SQL.
  if (error) return NextResponse.json({ erro: "Não foi possível ler a regra da empresa. Confira a migração db/36_piso_promocao_por_empresa.sql." }, { status: 503 });
  if (!data) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
  return NextResponse.json({
    usarComoPiso: Boolean(data.promo_usar_como_piso),
    toleranciaPct: Number(data.promo_tolerancia_pct ?? 5),
  });
}

export async function POST(req: NextRequest) {
  const a = await alvo();
  if ("erro" in a) return NextResponse.json({ erro: a.erro }, { status: a.status });

  const { data: podeEditar, error: erroAcesso } = await a.sb.rpc("pode_editar_operacao", { op: a.op.id });
  if (erroAcesso || !podeEditar) return NextResponse.json({ erro: "Seu acesso é de leitura. Um editor da empresa pode salvar a regra." }, { status: 403 });

  let corpo: { usarComoPiso?: unknown; toleranciaPct?: unknown } = {};
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  if (!corpo || typeof corpo.usarComoPiso !== "boolean" || typeof corpo.toleranciaPct !== "number") {
    return NextResponse.json({ erro: "Informe a regra e uma tolerância numérica." }, { status: 400 });
  }
  const pct = corpo.toleranciaPct;
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) {
    return NextResponse.json({ erro: "A tolerância vai de 0 a 50%." }, { status: 400 });
  }

  // Operações têm RLS apenas de leitura. Após conferir sessão, associação e
  // permissão acima, gravamos somente estes dois campos da operação resolvida.
  const { data, error } = await clientePrivilegiado()
    .from("operacoes")
    .update({ promo_usar_como_piso: Boolean(corpo.usarComoPiso), promo_tolerancia_pct: pct })
    .eq("id", a.op.id)
    .select("promo_usar_como_piso,promo_tolerancia_pct")
    .single();
  if (error || !data) {
    return NextResponse.json({ erro: "A regra não foi salva. Confira a migração db/36_piso_promocao_por_empresa.sql e tente novamente." }, { status: 503 });
  }
  return NextResponse.json({ usarComoPiso: data.promo_usar_como_piso, toleranciaPct: Number(data.promo_tolerancia_pct) });
}
