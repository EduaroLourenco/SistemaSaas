import { NextRequest, NextResponse } from "next/server";
import { opcoesFrete } from "@/lib/meli/cliente";
import { comMeli, contaDaQuery } from "@/lib/meli/rota";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Frete de um ou mais anúncios para uma lista de CEPs.
 *
 * É a coleta do módulo Monitoramento · Fretes. As combinações são feitas
 * em série de propósito: varrer anúncio × CEP em paralelo estoura o limite
 * de chamadas do canal rápido demais.
 *
 * POST { mlbs: ["MLB123"], ceps: ["01001000"], quantidade?: 1 }
 */
export async function POST(req: NextRequest) {
  let corpo: { mlbs?: unknown; ceps?: unknown; quantidade?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const mlbs = Array.isArray(corpo.mlbs)
    ? corpo.mlbs.map((m) => String(m).trim().toUpperCase()).filter((m) => /^MLB\d+$/.test(m))
    : [];
  const ceps = Array.isArray(corpo.ceps)
    ? corpo.ceps.map((c) => String(c).replace(/\D/g, "")).filter((c) => c.length === 8)
    : [];
  const quantidade = Number(corpo.quantidade ?? 1) || 1;
  const conta = contaDaQuery(new URL(req.url));

  if (!mlbs.length || !ceps.length) {
    return NextResponse.json(
      { erro: "Envie `mlbs` com códigos MLB e `ceps` com 8 dígitos." },
      { status: 400 }
    );
  }

  if (mlbs.length * ceps.length > 200) {
    return NextResponse.json(
      {
        erro: `Combinação grande demais: ${mlbs.length} anúncios × ${ceps.length} CEPs. O teto por chamada é 200 — quebre em lotes menores.`,
      },
      { status: 400 }
    );
  }

  return comMeli(async () => {
    const linhas: {
      mlb: string;
      cep: string;
      opcoes: Awaited<ReturnType<typeof opcoesFrete>>;
      erro?: string;
    }[] = [];

    for (const mlb of mlbs) {
      for (const cep of ceps) {
        try {
          linhas.push({ mlb, cep, opcoes: await opcoesFrete({ mlb, cep, quantidade, conta }) });
        } catch (e) {
          linhas.push({
            mlb,
            cep,
            opcoes: [],
            erro: e instanceof Error ? e.message : "falhou",
          });
        }
      }
    }

    const todas = linhas.flatMap((l) => l.opcoes);

    return {
      quantidade,
      combinacoes: linhas.length,
      comErro: linhas.filter((l) => l.erro).length,
      resumo: {
        freteMedio: todas.length
          ? +(todas.reduce((s, o) => s + o.valor, 0) / todas.length).toFixed(2)
          : null,
        gratis: todas.filter((o) => o.gratis).length,
      },
      linhas,
    };
  }, conta);
}
