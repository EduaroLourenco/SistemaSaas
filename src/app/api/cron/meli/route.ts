import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sincronizarMeli } from "@/lib/meli/sincronizar";
import { CONTAS, contaConectada } from "@/lib/meli/cliente";

export const runtime = "nodejs";
/** Uma conta leva ~2 min: o freio de 4 chamadas/s × ~430 anúncios nas visitas. */
export const maxDuration = 300;

/**
 * Sincronização agendada com o Mercado Livre.
 *
 * GET /api/cron/meli?turno=13h|01h — chamada pelo agendador da Vercel
 * (`vercel.json`), nunca por gente. Os horários lá estão em UTC: 16:00 e
 * 04:00 UTC são 13h e 01h em Brasília, que não tem horário de verão.
 *
 * Os dois turnos têm trabalhos diferentes:
 *
 *   13h — o dia em andamento. Traz a manhã de hoje (parcial) e revisa
 *         ontem, que ainda recebe pedido pago tarde e cancelamento.
 *   01h — fecha o dia. Recolhe os três últimos dias inteiros: é quando o
 *         dia anterior fica completo e os cancelamentos tardios aparecem.
 *
 * O catálogo vem nos dois: é ele que traz estoque e pausa, e estoque zerado
 * de manhã não pode esperar até a madrugada para aparecer.
 */
const TURNOS = {
  "13h": { diasPedidos: 1, diasVisitas: 2 },
  "01h": { diasPedidos: 3, diasVisitas: 3 },
} as const;
type Turno = keyof typeof TURNOS;

/** Data em Brasília, AAAA-MM-DD, deslocada em dias. */
function diaSP(deslocamento = 0) {
  const d = new Date(Date.now() + deslocamento * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/**
 * Compara o segredo em tempo constante.
 *
 * `===` para no primeiro caractere diferente, e o tempo de resposta vaza
 * quantos acertou. É um ataque lento, mas esta rota dispara chamadas numa
 * cota compartilhada — não custa fechar.
 */
function autorizado(req: NextRequest, segredo: string) {
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    // Sem segredo a rota ficaria aberta para qualquer um disparar
    // sincronização. Melhor desligada do que aberta.
    return NextResponse.json(
      { erro: "CRON_SECRET não definido — sincronização agendada desligada." },
      { status: 503 }
    );
  }
  if (!autorizado(req, segredo)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const pedido = req.nextUrl.searchParams.get("turno");
  const turno: Turno = pedido === "01h" ? "01h" : "13h";
  const { diasPedidos, diasVisitas } = TURNOS[turno];

  const contas: Record<string, unknown>[] = [];
  // Uma conta por vez, de propósito: o freio de consumo é por processo, e
  // duas em paralelo dobrariam a rajada na cota dos agentes.
  for (const c of CONTAS) {
    if (!(await contaConectada(c.slug))) {
      contas.push({ conta: c.slug, pulada: "não conectada" });
      continue;
    }
    const comecou = Date.now();
    try {
      const r = await sincronizarMeli({
        conta: c.slug,
        de: diaSP(-diasPedidos),
        ate: diaSP(0),
        diasVisitas,
        registro: { origem: "agendada", turno },
      });
      contas.push({
        conta: c.slug,
        ok: true,
        segundos: Math.round((Date.now() - comecou) / 1000),
        pedidos: r.pedidos.gravados,
        dias: r.diarias.dias,
        avisos: r.avisos,
      });
    } catch (e) {
      // Uma conta falhando não pode impedir a outra de atualizar.
      contas.push({
        conta: c.slug,
        ok: false,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const falhou = contas.some((c) => c.ok === false);
  return NextResponse.json({ turno, contas }, { status: falhou ? 500 : 200 });
}
