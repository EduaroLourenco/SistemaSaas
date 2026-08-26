/**
 * Renova a sessão a cada navegação e barra quem não está logado.
 *
 * Existe porque Server Component não pode escrever cookie: sem este passo
 * o token venceria e o usuário cairia para a tela de login no meio do uso,
 * sem ter feito nada.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLICAS = ["/entrar", "/auth"];

export async function proxy(req: NextRequest) {
  let resposta = NextResponse.next({ request: req });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (novos) => {
          for (const { name, value } of novos) req.cookies.set(name, value);
          resposta = NextResponse.next({ request: req });
          for (const { name, value, options } of novos) {
            resposta.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // getUser() e não getSession(): só ele valida o token no servidor. A
  // sessão do cookie pode estar forjada; o usuário verificado, não.
  const { data } = await sb.auth.getUser();

  const caminho = req.nextUrl.pathname;
  const publica = PUBLICAS.some((p) => caminho.startsWith(p));

  if (!data.user && !publica) {
    // Rota de API responde em JSON, não em redirecionamento.
    //
    // `fetch` segue redirecionamento por padrão: a chamada receberia 200
    // com o HTML do login e quebraria no `res.json()`, com um erro de
    // parse que não tem nada a ver com a causa. 401 diz o que aconteceu.
    if (caminho.startsWith("/api/")) {
      return NextResponse.json(
        { erro: "Não autenticado", codigo: "sem_sessao" },
        { status: 401 }
      );
    }

    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    // Guarda para onde ele queria ir, e devolve depois do login.
    url.searchParams.set("destino", caminho);
    return NextResponse.redirect(url);
  }

  if (data.user && caminho === "/entrar") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return resposta;
}

export const config = {
  matcher: [
    // Tudo, menos estático e imagem — eles não têm sessão para renovar.
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
