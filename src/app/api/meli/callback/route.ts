import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clienteServidor } from "@/lib/supabase/servidor";
import { gravarToken, vincularIntegracao } from "@/lib/meli/tokens";
import { COOKIE_OAUTH } from "../conectar/route";

export const runtime = "nodejs";

/**
 * Volta da autorização do Mercado Livre.
 *
 * O código que chega aqui vale uma vez e vira o par access/refresh. O
 * refresh vai direto para o cofre, amarrado à conta de canal — nunca passa
 * pela tela nem por variável de ambiente.
 *
 * A integração é criada AQUI, e não na primeira sincronização, porque em
 * servidor sem estado o token pendente em memória não sobrevive de uma
 * requisição para a outra: seria gravado no vazio e perdido.
 */

function pagina(titulo: string, corpo: string, ok: boolean) {
  const resposta = new NextResponse(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${titulo}</title>
     <body style="font:16px/1.6 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#0f1216;color:#e8ecf1">
       <main style="max-width:32rem;padding:2rem">
         <h1 style="font-size:1.4rem;margin:0 0 .75rem;color:${ok ? "#4ade80" : "#f87171"}">${titulo}</h1>
         <p style="margin:0 0 1.5rem;color:#b6bec9">${corpo}</p>
         <a href="/integracoes" style="color:#7dd3fc">Voltar para Integrações</a>
       </main>
     </body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } }
  );
  // O nonce vale uma vez, deu certo ou não.
  resposta.cookies.delete(COOKIE_OAUTH);
  return resposta;
}

function mesmoNonce(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) {
    return pagina("Entre no sistema primeiro", "A conexão precisa de alguém logado.", false);
  }

  const erroMeli = req.nextUrl.searchParams.get("error_description");
  if (erroMeli) return pagina("O Mercado Livre recusou", erroMeli, false);

  const codigo = req.nextUrl.searchParams.get("code");
  const estado = req.nextUrl.searchParams.get("state") ?? "";
  const [nonce, contaId] = estado.split(".");
  const esperado = req.cookies.get(COOKIE_OAUTH)?.value ?? "";

  if (!codigo || !nonce || !contaId) {
    return pagina("Faltou o código", "Recomece a conexão pela tela de Integrações.", false);
  }

  /*
   * O nonce do cookie tem que bater com o do `state`. Sem isto, alguém
   * induziria uma pessoa logada a abrir esta URL e amarraria uma conta de
   * Mercado Livre à empresa dela.
   */
  if (!esperado || !mesmoNonce(nonce, esperado)) {
    return pagina(
      "Conexão não reconhecida",
      "Este retorno não corresponde a uma conexão iniciada aqui. Comece de novo pela tela de Integrações.",
      false
    );
  }

  /* A conta, pelos olhos de quem está logado — RLS faz o isolamento. */
  const { data: conta } = await sb
    .from("contas_canal")
    .select("id,operacao_id,canal_id,nome,identificador")
    .eq("id", contaId)
    .maybeSingle();
  if (!conta) return pagina("Conta não encontrada", "Ela não existe ou não é da sua empresa.", false);

  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", { op: conta.operacao_id });
  if (!podeEditar) {
    return pagina("Sem permissão", "Seu acesso é de leitura. Peça a um administrador.", false);
  }

  const appId = process.env.MELI_APP_ID;
  const segredo = process.env.MELI_CLIENT_SECRET;
  if (!appId || !segredo) {
    return pagina("Falta configurar", "Defina MELI_APP_ID e MELI_CLIENT_SECRET.", false);
  }

  /* 1. O código vira o par de tokens. */
  const r = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: appId,
      client_secret: segredo,
      code: codigo,
      redirect_uri: `${req.nextUrl.origin}/api/meli/callback`,
    }),
  });
  if (!r.ok) {
    return pagina(
      "Não consegui trocar o código",
      `O Mercado Livre respondeu ${r.status}. Confira se a URL de retorno cadastrada na aplicação é exatamente ${req.nextUrl.origin}/api/meli/callback.`,
      false
    );
  }
  const t = (await r.json()) as { access_token: string; refresh_token: string; expires_in: number };

  /* 2. De quem é este token? Confere com o que a conta já declarava. */
  const eu = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  if (!eu.ok) {
    return pagina("Token recusado", "O Mercado Livre não reconheceu o token recém-emitido.", false);
  }
  const vendedor = (await eu.json()) as { id: number; nickname: string };

  const gravado = String(conta.identificador ?? "");
  if (gravado && gravado !== String(vendedor.id)) {
    return pagina(
      "Conta trocada",
      `"${conta.nome}" é do vendedor ${gravado}, mas você autorizou ${vendedor.nickname} (${vendedor.id}). ` +
        "Conectar assim misturaria o catálogo das duas. Escolha a conta certa na tela de Integrações.",
      false
    );
  }
  if (!gravado) {
    await sb.from("contas_canal").update({ identificador: String(vendedor.id) }).eq("id", conta.id);
  }

  /* 3. Cofre. A partir daqui a renovação é sozinha, a cada 6 horas. */
  await vincularIntegracao({
    operacaoId: conta.operacao_id,
    canalId: conta.canal_id,
    contaCanalId: conta.id,
  });
  await gravarToken(conta.id, {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expira_em: new Date(Date.now() + t.expires_in * 1000),
  });

  return pagina(
    "Conta conectada",
    `${vendedor.nickname} está ligada a "${conta.nome}". A sincronização automática passa a usar esta autorização — não é preciso colar token em lugar nenhum.`,
    true
  );
}
