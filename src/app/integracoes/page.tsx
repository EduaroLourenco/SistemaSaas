import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/controls";
import { FontesDados } from "@/components/painel/fontes-dados";
import { carregarFontes } from "@/lib/dados/fontes";
import { situacaoContas } from "@/lib/meli/cliente";
import { clienteServidor } from "@/lib/supabase/servidor";
import { Info } from "lucide-react";

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
  const sb = await clienteServidor();
  const [fontes, integracoes] = await Promise.all([
    carregarFontes(),
    sb
      .from("integracoes")
      .select("status,ultima_sincronizacao,ultimo_erro,config")
      .eq("provedor", "mercado_livre"),
  ]);

  type Linha = {
    status: string;
    ultima_sincronizacao: string | null;
    ultimo_erro: string | null;
    config: { conta?: string } | null;
  };
  // Sem a migração 19 a coluna `config.conta` não é preenchida; a tela só
  // perde a data da última sincronização, e continua dizendo o resto.
  const porConta = new Map(
    ((integracoes.data ?? []) as Linha[]).map((l) => [l.config?.conta ?? "", l])
  );

  const quando = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  return (
    <>
      <PageHeader
        title="Integrações"
        description="De onde vem cada número do sistema"
      />

      <PageBody>
        <div className="space-y-3">
          <SectionTitle
            title="Mercado Livre · API"
            hint="Sincroniza sozinho às 13h e à 01h (horário de Brasília)"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {situacaoContas().map((c) => {
              const reg = porConta.get(c.slug);
              const comErro = reg?.status === "erro" || reg?.status === "expirada";
              return (
                <Panel key={c.slug} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink truncate">{c.nome}</p>
                      <p className="text-[12px] text-ink-3 mt-0.5">
                        Pedidos, visitas, catálogo, estoque, comissão e frete
                      </p>
                    </div>
                    <Badge tone={!c.conectada ? "neutral" : comErro ? "down" : "up"}>
                      {!c.conectada ? "Não conectada" : comErro ? "Com erro" : "Conectada"}
                    </Badge>
                  </div>
                  <p className="num text-[11.5px] text-ink-2 mt-3 pt-3 border-t border-line">
                    {reg?.ultima_sincronizacao
                      ? `Última sincronização: ${quando(reg.ultima_sincronizacao)}`
                      : c.conectada
                        ? "Ainda sem sincronização registrada"
                        : "Enquanto não conectada, os números desta conta entram por planilha"}
                  </p>
                  {comErro && reg?.ultimo_erro && (
                    <p className="text-[11.5px] text-down mt-1.5">{reg.ultimo_erro}</p>
                  )}
                </Panel>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <SectionTitle title="Planilhas" hint="Fontes que entram pela tela de Importar" />
          <FontesDados dados={fontes} />
          <Panel className="px-4 py-3 flex gap-2.5">
            <Info className="w-4 h-4 text-ink-3 shrink-0 mt-px" strokeWidth={1.75} />
            <p className="text-[12px] text-ink-2">
              Canais sem API entram por arquivo na tela{" "}
              <Link href="/importar" className="font-medium text-brand hover:underline">
                Importar
              </Link>
              . A sincronização da API não apaga o que já foi importado: ela
              preenche os dias seguintes da conta conectada.
            </p>
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
