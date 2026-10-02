import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sincronizarVtex } from "@/lib/vtex/sincronizar";
import { lojasVtex, vtexConectada } from "@/lib/vtex/cliente";

export const runtime = "nodejs";
/** Cada pedido é uma chamada de detalhe; 3 dias da loja são ~150. */
export const maxDuration = 300;

/**
 * Sincronização agendada da loja própria (VTEX).
 *
 * GET /api/cron/vtex — chamada pelo agendador da Vercel (`vercel.json`),
 * nunca por gente. Roda junto do turno da madrugada, quando o dia anterior
 * já fechou: é aí que cancelamento tardio e pagamento de boleto aparecem.
 *
 * Três dias de janela, e não um, porque pedido da VTEX muda de status
 * depois de criado — o que foi "pagamento pendente" ontem pode ser
 * faturado ou cancelado hoje, e o registro precisa acompanhar.
 */
const DIAS = 3;

function autorizado(req: NextRequest, segredo: string) {
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

function diaSP(deslocamento = 0) {
  const d = new Date(Date.now() + deslocamento * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return NextResponse.json(
      { erro: "CRON_SECRET não definido — sincronização agendada desligada." },
      { status: 503 }
    );
  }
  if (!autorizado(req, segredo)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  /*
   * Uma loja por empresa, varridas do banco. Era uma só, a do ambiente —
   * numa segunda empresa isso leria os pedidos da primeira.
   */
  const lojas = await lojasVtex();
  if (lojas.length === 0) {
    return NextResponse.json({ erro: "Nenhuma loja VTEX cadastrada." }, { status: 503 });
  }

  const resultados: Record<string, unknown>[] = [];
  for (const loja of lojas) {
    if (!(await vtexConectada(loja.id))) {
      resultados.push({ loja: loja.nome, pulada: "não conectada" });
      continue;
    }
    const comecou = Date.now();
    try {
      const r = await sincronizarVtex({ de: diaSP(-DIAS), ate: diaSP(), conta: loja.id });
      resultados.push({ ok: true, segundos: Math.round((Date.now() - comecou) / 1000), ...r });
    } catch (e) {
      // Uma loja falhando não pode impedir a outra de atualizar.
      const erro = e instanceof Error ? e.message : String(e);
      console.error("[vtex] sincronização agendada falhou em " + loja.nome + ":", erro);
      resultados.push({ loja: loja.nome, ok: false, erro });
    }
  }

  const falhou = resultados.some((r) => r.ok === false);
  return NextResponse.json({ lojas: resultados }, { status: falhou ? 500 : 200 });
}
