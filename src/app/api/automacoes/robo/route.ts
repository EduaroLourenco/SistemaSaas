import { NextRequest, NextResponse } from "next/server";
import { carregarParametros, gravarParametros } from "@/lib/dados/sugestoes";
import { PARAMETROS_PADRAO, REGRAS_DO_ROBO, type Parametros } from "@/lib/planilhas/sugestoes-promocao";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await carregarParametros());
}

const CODIGOS = new Set(REGRAS_DO_ROBO.map((r) => r.codigo));
const numero = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

/** Guarda os parâmetros da empresa. Tudo vem do cliente: limites conferidos aqui. */
export async function POST(req: NextRequest) {
  let c: Partial<Parametros>;
  try {
    c = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const P = PARAMETROS_PADRAO;
  const p: Parametros = {
    toleranciaPct: numero(c.toleranciaPct, 0, 50, P.toleranciaPct),
    diferencaMinimaPct: numero(c.diferencaMinimaPct, 0, 50, P.diferencaMinimaPct),
    diasParado: numero(c.diasParado, 1, 365, P.diasParado),
    toleranciaParadoPct: numero(c.toleranciaParadoPct, 0, 50, P.toleranciaParadoPct),
    coberturaAltaDias: numero(c.coberturaAltaDias, 1, 3650, P.coberturaAltaDias),
    coberturaBaixaDias: numero(c.coberturaBaixaDias, 0, 365, P.coberturaBaixaDias),
    margemMinimaPct: c.margemMinimaPct == null || (c.margemMinimaPct as unknown) === "" ? null : numero(c.margemMinimaPct, -50, 90, 0),
    unidadesRelampagoPct: numero(c.unidadesRelampagoPct, 1, 100, P.unidadesRelampagoPct),
    listaFora: Array.isArray(c.listaFora) ? c.listaFora.map((s) => String(s).trim()).filter(Boolean).slice(0, 2000) : [],
    regrasDesligadas: Array.isArray(c.regrasDesligadas) ? c.regrasDesligadas.filter((r) => CODIGOS.has(r)) : [],
  };
  const r = await gravarParametros(p);
  return r.erro ? NextResponse.json(r, { status: 400 }) : NextResponse.json({ ok: true, parametros: p });
}
