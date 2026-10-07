import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { clienteServidor } from "@/lib/supabase/servidor";
import { ESCOPO, appConfigurado } from "@/lib/ga4/cliente";
import { COOKIE_GA4 } from "@/lib/ga4/pagina";

export const runtime = "nodejs";

/**
 * Começo da conexão com o Google Analytics 4.
 *
 * GET /api/ga4/conectar?conta=<id da conta de canal da loja própria>
 *
 * Mesmo desenho do Mercado Livre (`/api/meli/conectar`): a conta é lida
 * com o cliente da sessão, então conta de outra empresa não volta; conectar
 * exige poder editar a operação; e o `state` leva um nonce cuja outra
 * metade fica num cookie httpOnly.
 */
export async function GET(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 });
  }
  if (!appConfigurado()) {
    return NextResponse.json(
      { erro: "Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET antes de conectar." },
      { status: 503 }
    );
  }

  const pedida = req.nextUrl.searchParams.get("conta") ?? "";
  const { data: conta } = pedida
    ? await sb.from("contas_canal").select("id,operacao_id").eq("id", pedida).maybeSingle()
    : { data: null };
  if (!conta) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });

  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", { op: conta.operacao_id });
  if (!podeEditar) {
    return NextResponse.json(
      { erro: "Seu acesso é de leitura. Peça a um administrador para conectar." },
      { status: 403 }
    );
  }

  const nonce = randomBytes(16).toString("hex");
  const destino = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  destino.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  destino.searchParams.set("redirect_uri", `${req.nextUrl.origin}/api/ga4/callback`);
  destino.searchParams.set("response_type", "code");
  destino.searchParams.set("scope", ESCOPO);
  // offline + consent: sem os dois o Google não manda refresh token para
  // quem já autorizou antes, e a conexão morreria em uma hora.
  destino.searchParams.set("access_type", "offline");
  destino.searchParams.set("prompt", "consent");
  destino.searchParams.set("state", `${nonce}.${conta.id}`);

  const resposta = NextResponse.redirect(destino.toString());
  resposta.cookies.set(COOKIE_GA4, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/api/ga4",
    maxAge: 600,
  });
  return resposta;
}
