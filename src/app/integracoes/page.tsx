import { FontesConteudo, type LinhaIntegracao } from "./fontes-conteudo";
import { carregarFontes } from "@/lib/dados/fontes";
import { contasMeli } from "@/lib/meli/rota";
import { lojasVtex, vtexConectada } from "@/lib/vtex/cliente";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { carregarSaude } from "@/lib/dados/saude";
import { escritaConfigurada } from "@/lib/meli/apps";
import { MapaFontes } from "@/components/painel/mapa-fontes";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";

export const dynamic = "force-dynamic";

/**
 * De onde vem cada número do sistema.
 *
 * A versão anterior desta tela era uma vitrine de conectores fictícios —
 * VTEX "sincronizado há 5 min", botão "Sincronizar tudo" que não fazia
 * nada. Para quem decide com base no painel, isso é pior que tela vazia:
 * afirma que um dado está atualizado quando ele nem existe.
 *
 * Agora mostra só o que é verdade: as contas do Mercado Livre ligadas por
 * API, com a última sincronização registrada, e as fontes que entram por
 * planilha, com até que dia cada uma vai.
 */
export default async function Integracoes() {
  const op = await operacaoPadrao();
  if (!op) return null;
  const [fontes, contas, integracoes, vtex, saude, bling] = await Promise.all([
    carregarFontes(),
    contasMeli(op.id),
    clientePrivilegiado()
      .from("integracoes")
      .select("status,ultima_sincronizacao,ultimo_erro,conta_canal_id")
      /* As duas aplicações do Meli: a de leitura, de sempre, e a de
         escrita, que o vendedor conecta à parte para o sistema poder
         alterar promoção e publicidade. */
      .in("provedor", ["mercado_livre", "mercado_livre_escrita"]).eq("operacao_id", op.id),
    lojasVtex(op.id),
    carregarSaude(),
    clientePrivilegiado().from("integracoes").select("status,ultima_sincronizacao,ultimo_erro,config").eq("provedor", "bling").eq("operacao_id", op.id).maybeSingle(),
  ]);

  // A VTEX não tem apelido nem token rotativo; "conectada" é ter credencial.
  /* lojasVtex() lê com o cliente privilegiado (serve à rotina noturna, que
     passa por todas as empresas). Aqui, só as desta empresa. */
  const lojas = await Promise.all(
    vtex.filter((l) => l.operacaoId === op?.id).map(async (l) => ({ ...l, conectada: await vtexConectada(l.id) }))
  );

  return <FontesConteudo fontes={fontes} contas={contas} todas={(integracoes.data ?? []) as LinhaIntegracao[]} lojas={lojas} saude={saude} bling={bling.data} escritaDisponivel={escritaConfigurada()} mapa={<MapaFontes />} />;
}
