import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { contaConectada } from "@/lib/meli/cliente";
import { integracoesMeli } from "@/lib/meli/tokens";
import { capturarPrecosDeVenda } from "@/lib/meli/precos";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Retrato diário do preço que o comprador paga — GET /api/cron/meli-precos,
 * chamado pelo agendador da Vercel (`vercel.json`), às 06h30 de Brasília.
 *
 * O tempo da função é dividido entre as contas, e cada uma para no seu
 * prazo: uma conta grande não pode deixar as outras sem preço nenhum.
 */
function autorizado(req: NextRequest, segredo: string) {
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return NextResponse.json({ erro: "CRON_SECRET não definido." }, { status: 503 });
  if (!autorizado(req, segredo)) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const inicio = Date.now();
  const fim = inicio + 270_000;
  const contas = [];
  for (const c of await integracoesMeli()) {
    if (await contaConectada(c.contaCanalId)) contas.push(c);
  }
  const saida: Record<string, unknown>[] = [];
  for (let k = 0; k < contas.length; k++) {
    const c = contas[k];
    // A fatia de cada conta: o que sobra dividido pelas que faltam.
    const prazo = Date.now() + (fim - Date.now()) / (contas.length - k);
    try {
      saida.push({ conta: c.nome, ...(await capturarPrecosDeVenda(c.contaCanalId, prazo)) });
    } catch (e) {
      saida.push({ conta: c.nome, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ segundos: Math.round((Date.now() - inicio) / 1000), contas: saida });
}
