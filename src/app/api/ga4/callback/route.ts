import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clienteServidor } from "@/lib/supabase/servidor";
import { garantirIntegracao, gravarSegredo } from "@/lib/integracoes/cofre";
import { PROVEDOR, listarPropriedades, trocarCodigo } from "@/lib/ga4/cliente";
import { fixarPropriedade } from "@/lib/ga4/sincronizar";
import { COOKIE_GA4, esc, pagina } from "@/lib/ga4/pagina";

export const runtime = "nodejs";
/** A primeira conexão já traz 400 dias de histórico. */
export const maxDuration = 120;

function mesmoNonce(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Volta da autorização do Google.
 *
 * O refresh token vai direto para o cofre, amarrado à conta de canal da
 * loja própria. Depois lista as propriedades GA4 que a conta Google
 * enxerga: se é uma só, já fica escolhida e o histórico é trazido; se são
 * várias, a pessoa escolhe — o GA4 de outra loja do mesmo dono não pode
 * cair no site errado por adivinhação.
 */
export async function GET(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) return pagina("Entre no sistema primeiro", "A conexão precisa de alguém logado.", false);

  const erroGoogle = req.nextUrl.searchParams.get("error");
  if (erroGoogle) return pagina("O Google recusou", esc(erroGoogle), false);

  const codigo = req.nextUrl.searchParams.get("code");
  const [nonce, contaId] = (req.nextUrl.searchParams.get("state") ?? "").split(".");
  const esperado = req.cookies.get(COOKIE_GA4)?.value ?? "";
  if (!codigo || !nonce || !contaId) {
    return pagina("Faltou o código", "Recomece a conexão pela tela de Canais e contas.", false);
  }
  if (!esperado || !mesmoNonce(nonce, esperado)) {
    return pagina(
      "Conexão não reconhecida",
      "Este retorno não corresponde a uma conexão iniciada aqui. Comece de novo pela tela de Canais e contas.",
      false
    );
  }

  const { data: conta } = await sb
    .from("contas_canal")
    .select("id,operacao_id,canal_id,nome")
    .eq("id", contaId)
    .maybeSingle();
  if (!conta) return pagina("Conta não encontrada", "Ela não existe ou não é da sua empresa.", false);
  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", { op: conta.operacao_id });
  if (!podeEditar) return pagina("Sem permissão", "Seu acesso é de leitura. Peça a um administrador.", false);

  let t;
  try {
    t = await trocarCodigo(codigo, `${req.nextUrl.origin}/api/ga4/callback`);
  } catch (e) {
    return pagina(
      "Não consegui trocar o código",
      `${esc((e as Error).message)}<br>Confira se a URL de retorno cadastrada no Google Cloud é exatamente <code>${esc(req.nextUrl.origin)}/api/ga4/callback</code>.`,
      false
    );
  }
  if (!t.refresh_token) {
    return pagina(
      "O Google não mandou a autorização permanente",
      "Remova o acesso do app em myaccount.google.com/permissions e conecte de novo.",
      false
    );
  }

  const integ = await garantirIntegracao(PROVEDOR, {
    operacaoId: conta.operacao_id,
    canalId: conta.canal_id,
    contaCanalId: conta.id,
  });
  if (!integ) return pagina("Não consegui registrar a integração", "Veja os logs do servidor.", false);
  const erroCofre = await gravarSegredo(integ, { refresh_token: t.refresh_token });
  if (erroCofre) return pagina("Não consegui guardar a autorização", esc(erroCofre.message), false);

  let props;
  try {
    props = await listarPropriedades(t.access_token!);
  } catch (e) {
    return pagina(
      "Conectado, mas não consegui listar as propriedades",
      `${esc((e as Error).message)}<br>Confira se a <b>Google Analytics Admin API</b> está ativada no projeto.`,
      false
    );
  }

  if (props.length === 0) {
    return pagina(
      "Nenhuma propriedade GA4 nesta conta Google",
      "Conecte com a conta Google que tem acesso ao GA4 da loja.",
      false
    );
  }

  if (props.length === 1) {
    try {
      const r = await fixarPropriedade(integ, props[0]);
      return pagina(
        "Google Analytics conectado",
        `<b>${esc(props[0].nome)}</b> está ligada a "${esc(conta.nome)}". ${r.dias} dias de visitas trazidos.` +
          (r.avisos.length ? `<br><br>${r.avisos.map(esc).join("<br>")}` : ""),
        true
      );
    } catch (e) {
      return pagina("Conectado, mas a primeira leitura falhou", esc((e as Error).message), false);
    }
  }

  /* Várias propriedades: a pessoa escolhe. POST para não caber em link. */
  const opcoes = props
    .map(
      (p) =>
        `<form method="post" action="/api/ga4/propriedade" style="margin:.4rem 0">
           <input type="hidden" name="conta" value="${esc(conta.id)}">
           <input type="hidden" name="propriedade" value="${esc(p.id)}">
           <button style="font:inherit;padding:.5rem .8rem;border-radius:8px;border:1px solid #3a4250;background:#1b1f29;color:#e8ecf1;cursor:pointer;text-align:left;width:100%">
             ${esc(p.nome)} <span style="color:#8a94a6">· ${esc(p.conta)}</span>
           </button>
         </form>`
    )
    .join("");
  return pagina(
    "Qual propriedade é a da loja?",
    `A conta Google enxerga ${props.length} propriedades. Escolha a de "${esc(conta.nome)}":${opcoes}`,
    true
  );
}
