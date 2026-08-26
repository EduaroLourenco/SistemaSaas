import { NextRequest, NextResponse } from "next/server";
import { precosAtuais } from "@/lib/meli/cliente";
import { comMeli, contaDaQuery } from "@/lib/meli/rota";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Retrato do preço atual dos anúncios.
 *
 * É disparado pelo botão da tela, não por rotina: o preço da vitrine muda
 * pouco dentro da semana, e varrer todo dia gastaria chamada à toa. Quem
 * traz o histórico de preço é a rota de pedidos — ali cada venda já vem com
 * `unit_price` e data.
 *
 * POST /api/anuncios/precos?conta=principal|segunda
 * Corpo: { mlbs: ["MLB123", ...] }
 */
export async function POST(req: NextRequest) {
  const conta = contaDaQuery(new URL(req.url));

  let corpo: { mlbs?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const ids = Array.isArray(corpo.mlbs)
    ? corpo.mlbs
        .map((m) => String(m).trim().toUpperCase())
        .filter((m) => /^MLB\d+$/.test(m))
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { erro: "Envie em `mlbs` ao menos um código de anúncio válido." },
      { status: 400 }
    );
  }

  return comMeli(async () => {
    const precos = await precosAtuais(ids, conta);
    return {
      pedidos: ids.length,
      recebidos: precos.length,
      comErro: precos.filter((p) => p.erro).length,
      precos,
    };
  }, conta);
}
