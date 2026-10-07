import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clienteServidor } from "@/lib/supabase/servidor";
import { garantirIntegracaoDaOperacao } from "@/lib/integracoes/cofre";
import { PROVEDOR, dadosDaEmpresa, guardar, trocarCodigo } from "@/lib/bling/cliente";
import { sincronizarBling } from "@/lib/bling/sincronizar";
import { diaSP } from "@/lib/ga4/sincronizar";
import { esc, pagina } from "@/lib/ga4/pagina";
import { COOKIE_BLING } from "../conectar/route";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Primeira leitura: curta, para caber no tempo de uma requisição. O
 *  histórico mais antigo entra pelo agendamento e pelo script local. */
const DIAS_INICIAIS = 15;

function mesmoNonce(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  const sair = (t: string, c: string, ok = false) => {
    const r = pagina(t, c, ok);
    r.cookies.delete(COOKIE_BLING);
    return r;
  };
  if (!sessao?.user) return sair("Entre no sistema primeiro", "A conexão precisa de alguém logado.");

  const codigo = req.nextUrl.searchParams.get("code");
  const [nonce, operacaoId] = (req.nextUrl.searchParams.get("state") ?? "").split(".");
  const esperado = req.cookies.get(COOKIE_BLING)?.value ?? "";
  if (!codigo || !nonce || !operacaoId) {
    return sair("O Bling não devolveu a autorização", "Recomece pela aba ERP em Canais e contas.");
  }
  if (!esperado || !mesmoNonce(nonce, esperado)) {
    return sair("Conexão não reconhecida", "Este retorno não corresponde a uma conexão iniciada aqui.");
  }
  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", { op: operacaoId });
  if (!podeEditar) return sair("Sem permissão", "Seu acesso é de leitura. Peça a um administrador.");

  let par;
  try {
    par = await trocarCodigo(codigo);
  } catch (e) {
    return sair("Não consegui trocar o código", esc((e as Error).message));
  }

  const integ = await garantirIntegracaoDaOperacao(PROVEDOR, operacaoId);
  if (!integ) return sair("Não consegui registrar a integração", "Veja os logs do servidor.");
  try {
    await guardar(integ, par);
  } catch (e) {
    return sair("Não consegui guardar a autorização", esc((e as Error).message));
  }

  const empresa = await dadosDaEmpresa(integ);
  integ.config = { ...integ.config, empresa };
  await clientePrivilegiado().from("integracoes").update({ config: integ.config }).eq("id", integ.id);

  try {
    const r = await sincronizarBling(integ, diaSP(-DIAS_INICIAIS), diaSP(0));
    const pend = Object.keys(r.pendentes).length;
    return sair(
      "Bling conectado",
      `${empresa.nome ? `<b>${esc(empresa.nome)}</b>${empresa.cnpj ? ` (${esc(empresa.cnpj)})` : ""}. ` : ""}` +
        `${r.pedidos} pedidos dos últimos ${DIAS_INICIAIS} dias gravados.` +
        (r.pulados ? ` ${r.pulados} ficaram de fora por já entrarem pela API do próprio canal.` : "") +
        (pend
          ? `<br><br><b>${pend} loja(s) do Bling ainda sem canal.</b> Os pedidos delas só entram depois que você disser de qual canal é cada uma, na aba <a href="/integracoes/canais?aba=erp" style="color:#7dd3fc">ERP</a>.`
          : ""),
      true
    );
  } catch (e) {
    return sair("Conectado, mas a primeira leitura falhou", esc((e as Error).message));
  }
}
