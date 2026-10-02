import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { clienteServidor } from "@/lib/supabase/servidor";

export const runtime = "nodejs";

/** Nome do cookie que guarda o nonce do `state`. Ver abaixo. */
export const COOKIE_OAUTH = "meli_oauth";

/**
 * Começo da autorização do Mercado Livre.
 *
 * GET /api/meli/conectar?conta=<id de contas_canal> — leva a pessoa ao
 * Mercado Livre, que volta em `/api/meli/callback` com o código.
 *
 * Por que existe, já que havia `MELI_REFRESH_TOKEN` no ambiente: o refresh
 * token do Meli é de uso único e rotaciona a cada 6 horas. Guardado numa
 * variável de ambiente ele vence e ninguém percebe — foi o que deixou o
 * sistema sem dado novo de 14/09 a 21/09. Vindo por aqui, ele nasce e se
 * renova dentro do cofre, sem ninguém colar nada. E num SaaS é o único
 * caminho possível: não existe variável de ambiente por cliente.
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

  const pedida = req.nextUrl.searchParams.get("conta") ?? "";
  if (!pedida) {
    return NextResponse.json(
      { erro: "Diga qual conta conectar: ?conta=<id da conta de canal>." },
      { status: 400 }
    );
  }

  /*
   * A conta é lida com o cliente da SESSÃO. `contas_canal` tem RLS por
   * `pode_ver_operacao`, então uma conta de outra empresa não volta — e o
   * fluxo morre aqui, antes de qualquer ida ao Mercado Livre.
   */
  const { data: conta } = await sb
    .from("contas_canal")
    .select("id,operacao_id,nome")
    .eq("id", pedida)
    .maybeSingle();
  if (!conta) {
    return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  }

  // Ver a conta não basta para conectá-la: conectar é escrita. Quem só lê
  // não liga a empresa a um canal.
  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", {
    op: conta.operacao_id,
  });
  if (!podeEditar) {
    return NextResponse.json(
      { erro: "Seu acesso é de leitura. Peça a um administrador para conectar a conta." },
      { status: 403 }
    );
  }

  /*
   * O `state` diz para QUAL conta o código que voltar pertence — a mesma
   * aplicação autoriza várias, e sem isto o retorno seria ambíguo.
   *
   * Mas ele não pode ser só o id: quem advinha o state induz alguém logado
   * a abrir o callback e amarra uma conta de Mercado Livre à empresa dela.
   * Por isso vai um nonce aleatório junto, com a outra metade num cookie
   * httpOnly — o retorno só vale se as duas baterem.
   */
  const nonce = randomBytes(16).toString("hex");
  const destino = new URL("https://auth.mercadolivre.com.br/authorization");
  destino.searchParams.set("response_type", "code");
  destino.searchParams.set("client_id", appId);
  destino.searchParams.set("redirect_uri", `${req.nextUrl.origin}/api/meli/callback`);
  destino.searchParams.set("state", `${nonce}.${conta.id}`);

  const resposta = NextResponse.redirect(destino.toString());
  resposta.cookies.set(COOKIE_OAUTH, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/api/meli",
    maxAge: 600,
  });
  return resposta;
}
