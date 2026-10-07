import { NextRequest } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { integracaoDaConta } from "@/lib/integracoes/cofre";
import { PROVEDOR, listarPropriedades, tokenDeAcesso } from "@/lib/ga4/cliente";
import { fixarPropriedade } from "@/lib/ga4/sincronizar";
import { esc, pagina } from "@/lib/ga4/pagina";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Escolha da propriedade GA4, quando a conta Google enxerga mais de uma.
 *
 * POST /api/ga4/propriedade  (formulário da página de volta do Google)
 *
 * A propriedade enviada é conferida contra a lista que a PRÓPRIA
 * autorização guardada enxerga — o valor do formulário sozinho não basta,
 * senão qualquer id digitado amarraria o GA4 de outro site à empresa.
 */
export async function POST(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) return pagina("Entre no sistema primeiro", "A conexão precisa de alguém logado.", false);

  const form = await req.formData();
  const contaId = String(form.get("conta") ?? "");
  const escolhida = String(form.get("propriedade") ?? "");

  const { data: conta } = await sb
    .from("contas_canal")
    .select("id,operacao_id,nome")
    .eq("id", contaId)
    .maybeSingle();
  if (!conta) return pagina("Conta não encontrada", "Ela não existe ou não é da sua empresa.", false);
  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", { op: conta.operacao_id });
  if (!podeEditar) return pagina("Sem permissão", "Seu acesso é de leitura. Peça a um administrador.", false);

  const integ = await integracaoDaConta(PROVEDOR, conta.id);
  if (!integ) return pagina("Conecte primeiro", "Esta conta ainda não tem o Google conectado.", false);

  try {
    const props = await listarPropriedades(await tokenDeAcesso(integ));
    const prop = props.find((p) => p.id === escolhida);
    if (!prop) return pagina("Propriedade não reconhecida", "Ela não está entre as que esta conta Google enxerga.", false);
    const r = await fixarPropriedade(integ, prop);
    return pagina(
      "Google Analytics conectado",
      `<b>${esc(prop.nome)}</b> está ligada a "${esc(conta.nome)}". ${r.dias} dias de visitas trazidos.` +
        (r.avisos.length ? `<br><br>${r.avisos.map(esc).join("<br>")}` : ""),
      true
    );
  } catch (e) {
    return pagina("A primeira leitura falhou", esc((e as Error).message), false);
  }
}
