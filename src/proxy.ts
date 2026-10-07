/**
 * Renova a sessão a cada navegação e barra quem não está logado.
 *
 * Existe porque Server Component não pode escrever cookie: sem este passo
 * o token venceria e o usuário cairia para a tela de login no meio do uso,
 * sem ter feito nada.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
 * `/api/cron/` não tem sessão: quem chama é o agendador da Vercel. Não é
 * rota aberta — cada uma confere o CRON_SECRET e recusa sem ele. A barra
 * final impede que uma rota futura como `/api/cronograma` herde a isenção.
 */
/*
 * `/relatorio/` e `/api/relatorio/` ficam públicos porque a página é
 * aberta por chave secreta na própria URL — é assim que o link chega à
 * diretoria sem criar conta para cada pessoa. A chave vive
 * em `operacoes.relatorio_chave`, uma por empresa, e é ela que decide de
 * qual loja o relatório é. Sem chave que resolva, responde 404.
 */
/*
 * `/convite/` é pública porque quem recebe o link precisa saber de qual
 * empresa ele é ANTES de criar conta — mandá-la para o login primeiro é
 * pedir que se cadastre às cegas. O token é o segredo, e o aceite em si
 * continua exigindo sessão.
 */
const PUBLICAS = [
  "/entrar",
  "/cadastro",
  "/auth",
  "/convite/",
  "/api/cron/",
  "/relatorio/",
  "/api/relatorio/",
  // Manual de integração: o Bling exige o link, e quem lê ainda não é cliente.
  "/manual/",
  // Manifesto do "adicionar à tela inicial": o celular o busca sem sessão.
  "/manifest.webmanifest",
];

/**
 * Compara sem entregar o tamanho da coincidência pelo tempo de resposta.
 *
 * O `timingSafeEqual` do Node não existe aqui: proxy roda no edge. São
 * quatro linhas, e o laço percorre a chave esperada inteira em qualquer
 * caso — sair no primeiro caractere diferente é justamente o que se mede.
 */
async function chaveResolve(recebida: string) {
  if (!recebida || recebida.length < 32) return false;
  try {
    const r = await fetch(
      process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/rpc/operacao_por_chave_relatorio",
      {
        method: "POST",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: "Bearer " + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_chave: recebida }),
      }
    );
    if (!r.ok) return false;
    const linhas = await r.json();
    return Array.isArray(linhas) && linhas.length > 0;
  } catch {
    /*
     * Banco fora do ar não pode virar porta aberta. Sem resposta, 404 — e
     * quem está logado continua entrando pelo outro caminho.
     */
    return false;
  }
}

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

  /*
   * O 404 da chave errada sai daqui, e não da página.
   *
   * A página também confere a chave, mas o `notFound()` dela chega tarde:
   * o Next despacha o cabeçalho com o `<title>` antes de rodar o corpo,
   * então a resposta ia com 200 e o 404 aparecia só dentro do HTML. Dado
   * nenhum vazava — vazava o status, que é o que um varredor lê. Aqui não
   * renderiza nada.
   */
  if (caminho.startsWith("/relatorio/") && !data.user) {
    const chave = caminho.split("/")[2] ?? "";
    if (!(await chaveResolve(decodeURIComponent(chave)))) {
      return new NextResponse(null, { status: 404 });
    }
  }

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
