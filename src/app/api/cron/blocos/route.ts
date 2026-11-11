import { NextRequest, NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { acordarFila, pedirAtualizacao } from "@/lib/atualizacao-fila";
import { ehBloco } from "@/lib/atualizacao-blocos";

export const runtime = "nodejs";
export const maxDuration = 60;

function autorizado(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/**
 * Atualização agendada por bloco — GET /api/cron/blocos?b=vendas.
 *
 * Os horários de cada bloco estão no `vercel.json` (em UTC: 3h a mais que
 * Brasília). Aqui só se enfileira um pedido por empresa e se acorda a fila;
 * quem roda é `/api/cron/fila`, uma etapa por vez.
 *
 * As vendas de hora em hora são 24 entradas diárias, e não um `0 * * * *`:
 * no plano Hobby da Vercel uma rotina que roda mais de uma vez por dia
 * barra o deploy, e 24 rotinas diárias funcionam nos dois planos.
 */
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  const blocos = (req.nextUrl.searchParams.get("b") ?? "").split(",").filter(ehBloco);
  if (!blocos.length) return NextResponse.json({ erro: "Diga o bloco em ?b=" }, { status: 400 });

  const { data: ops, error } = await clientePrivilegiado().from("operacoes").select("id,nome").eq("ativa", true);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const empresas: Record<string, unknown>[] = [];
  for (const op of ops ?? []) {
    try {
      const r = await pedirAtualizacao(op.id as string, blocos, "agendada");
      empresas.push({ operacao: op.id, ...("erro" in r ? { pulada: r.erro } : { etapas: r.etapas.length }) });
    } catch (e) {
      empresas.push({ operacao: op.id, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  const origem = req.nextUrl.origin;
  after(() => acordarFila(origem));
  return NextResponse.json({ blocos, empresas });
}
