import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { AUTORIZAR, appConfigurado } from "@/lib/bling/cliente";

export const runtime = "nodejs";

export const COOKIE_BLING = "bling_oauth";

/**
 * Começo da conexão com o Bling — GET /api/bling/conectar
 *
 * Conecta a OPERAÇÃO ATIVA (a do seletor do topo): o ERP é da empresa
 * inteira, não de uma conta de canal. O `state` leva nonce + operação, com
 * a metade secreta num cookie httpOnly, como no Mercado Livre.
 *
 * O Bling não recebe `redirect_uri` na URL: ele usa o link cadastrado no
 * aplicativo, que tem que ser exatamente /api/bling/callback.
 */
export async function GET(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) return NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 });
  if (!appConfigurado()) {
    return NextResponse.json({ erro: "Defina BLING_CLIENT_ID e BLING_CLIENT_SECRET antes de conectar." }, { status: 503 });
  }

  const op = await operacaoPadrao();
  if (!op) return NextResponse.json({ erro: "Nenhuma operação disponível." }, { status: 404 });
  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", { op: op.id });
  if (!podeEditar) {
    return NextResponse.json({ erro: "Seu acesso é de leitura. Peça a um administrador para conectar." }, { status: 403 });
  }

  const nonce = randomBytes(16).toString("hex");
  const destino = new URL(AUTORIZAR);
  destino.searchParams.set("response_type", "code");
  destino.searchParams.set("client_id", process.env.BLING_CLIENT_ID!);
  destino.searchParams.set("state", `${nonce}.${op.id}`);

  const r = NextResponse.redirect(destino.toString());
  r.cookies.set(COOKIE_BLING, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/api/bling",
    maxAge: 600,
  });
  return r;
}
