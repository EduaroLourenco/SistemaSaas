import { NextRequest, NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { CONTAS, type Conta } from "@/lib/meli/cliente";

export const runtime = "nodejs";

/**
 * Começo da autorização do Mercado Livre.
 *
 * GET /api/meli/conectar?conta=principal — leva a pessoa ao Mercado Livre,
 * que volta em `/api/meli/callback` com o código.
 *
 * Por que existe, já que havia `MELI_REFRESH_TOKEN` no ambiente: o refresh
 * token do Meli é de uso único e rotaciona a cada 6 horas. Guardado numa
 * variável de ambiente ele vence e ninguém percebe — foi o que deixou o
 * sistema sem dado novo de 14/09 a 21/09. Vindo por aqui, ele nasce e se
 * renova dentro do cofre, sem ninguém colar nada.
 */
export async function GET(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 });
  }

  const appId = process.env.MELI_APP_ID;
  if (!appId) {
    return NextResponse.json(
      { erro: "Defina MELI_APP_ID e MELI_CLIENT_SECRET antes de conectar." },
      { status: 503 }
    );
  }

  const pedida = req.nextUrl.searchParams.get("conta") ?? "principal";
  const conta = CONTAS.find((c) => c.slug === pedida)?.slug as Conta | undefined;
  if (!conta) {
    return NextResponse.json(
      { erro: `Conta desconhecida. Use ${CONTAS.map((c) => c.slug).join(" ou ")}.` },
      { status: 400 }
    );
  }

  const destino = new URL("https://auth.mercadolivre.com.br/authorization");
  destino.searchParams.set("response_type", "code");
  destino.searchParams.set("client_id", appId);
  destino.searchParams.set("redirect_uri", `${req.nextUrl.origin}/api/meli/callback`);
  // O `state` diz para QUAL conta o código que voltar pertence: a mesma
  // aplicação autoriza as duas, e sem isto o retorno seria ambíguo.
  destino.searchParams.set("state", conta);

  return NextResponse.redirect(destino.toString());
}
