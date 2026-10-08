import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/controls";
import { FontesDados } from "@/components/painel/fontes-dados";
import { carregarFontes } from "@/lib/dados/fontes";
import { contasMeli } from "@/lib/meli/rota";
import { lojasVtex, vtexConectada } from "@/lib/vtex/cliente";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { Disclosure } from "@/components/ui/disclosure";
import { SaudeDados } from "@/components/painel/saude-dados";
import { carregarSaude } from "@/lib/dados/saude";

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
  const [fontes, contas, integracoes, vtex, saude, bling] = await Promise.all([
    carregarFontes(),
    contasMeli(),
    sb
      .from("integracoes")
      .select("status,ultima_sincronizacao,ultimo_erro,conta_canal_id")
      .eq("provedor", "mercado_livre"),
    lojasVtex(),
    carregarSaude(),
    sb.from("integracoes").select("status,ultima_sincronizacao,ultimo_erro,config").eq("provedor", "bling").maybeSingle(),
  ]);

  // A VTEX não tem apelido nem token rotativo; "conectada" é ter credencial.
  /* lojasVtex() lê com o cliente privilegiado (serve à rotina noturna, que
     passa por todas as empresas). Aqui, só as desta empresa. */
  const op = await operacaoPadrao();
  const lojas = await Promise.all(
    vtex.filter((l) => l.operacaoId === op?.id).map(async (l) => ({ ...l, conectada: await vtexConectada(l.id) }))
  );

  type Linha = {
    status: string;
    ultima_sincronizacao: string | null;
    ultimo_erro: string | null;
    conta_canal_id: string | null;
  };
  // Indexado pela conta de canal: é o que amarra integração e conta desde
  // que o apelido global deixou de identificar nada.
  const porConta = new Map(
    ((integracoes.data ?? []) as Linha[]).map((l) => [l.conta_canal_id ?? "", l])
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
        title="Fontes de dados"
        description="De onde vem cada número, até quando vai, e se dá para confiar"
      />

      <PageBody>
        <SaudeDados verificacoes={saude} />

        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <SectionTitle
              title="Mercado Livre · API"
              hint="Sincroniza sozinho às 13h e à 01h (horário de Brasília)"
            />
            <Link
              href="/integracoes/canais"
              className="text-[12px] font-medium text-brand hover:underline shrink-0 pb-0.5"
            >
              Cadastrar canais e contas
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {contas.map((c) => {
              const reg = porConta.get(c.id);
              const comErro = reg?.status === "erro" || reg?.status === "expirada";
              // Conectada é ter com o que renovar: a autorização guardada no
              // cofre vale tanto quanto a variável de ambiente — e dura mais.
              const conectada = c.conectada || reg?.status === "conectada";
              return (
                <Panel key={c.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink truncate">{c.nome}</p>
                      <p className="text-[12px] text-ink-3 mt-0.5">
                        Pedidos, visitas, catálogo, estoque, comissão e frete
                      </p>
                    </div>
                    <Badge tone={!conectada ? "neutral" : comErro ? "down" : "up"}>
                      {!conectada ? "Não conectada" : comErro ? "Com erro" : "Conectada"}
                    </Badge>
                  </div>
                  <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-3">
                    <p className="num text-[12px] text-ink-2">
                      {reg?.ultima_sincronizacao
                        ? `Última sincronização: ${quando(reg.ultima_sincronizacao)}`
                        : conectada
                          ? "Ainda sem sincronização registrada"
                          : "Enquanto não conectada, os números desta conta entram por planilha"}
                    </p>
                    <Link
                      href={`/api/meli/conectar?conta=${c.id}`}
                      className="text-[12px] font-medium text-brand hover:underline shrink-0"
                    >
                      {conectada ? "Reconectar" : "Conectar"}
                    </Link>
                  </div>
                  {comErro && reg?.ultimo_erro && (
                    <p className="text-[12px] text-down mt-1.5">{reg.ultimo_erro}</p>
                  )}
                </Panel>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <SectionTitle
            title="Loja própria · VTEX"
            hint="Sincroniza sozinha à 01h30 (horário de Brasília)"
          />
          {lojas.length === 0 ? (
            <Panel className="px-4 py-3.5">
              <p className="text-[12px] text-ink-3">Nenhuma loja VTEX cadastrada.</p>
            </Panel>
          ) : (
            lojas.map((l) => (
              <Panel key={l.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink truncate">{l.nome}</p>
                    <p className="text-[12px] text-ink-3 mt-0.5">Pedidos, itens e frete</p>
                  </div>
                  <Badge tone={l.conectada ? "up" : "neutral"}>
                    {l.conectada ? "Conectada" : "Não conectada"}
                  </Badge>
                </div>
              </Panel>
            ))
          )}
        </div>

        <div className="space-y-3">
          <SectionTitle title="ERP · Bling" hint="Pedidos dos canais sem API própria (Shopee, Amazon, Magalu…), lidos às 02h30" />
          <Panel className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">Bling</p>
                <p className="num text-[12px] text-ink-2 mt-0.5">
                  {bling.data?.ultima_sincronizacao
                    ? `Última leitura: ${quando(bling.data.ultima_sincronizacao)}`
                    : bling.data
                      ? "Conectado, ainda sem leitura"
                      : "Não conectado nesta empresa"}
                </p>
              </div>
              <Badge tone={!bling.data ? "neutral" : bling.data.ultimo_erro ? "down" : "up"}>
                {!bling.data ? "Não conectado" : bling.data.ultimo_erro ? "Com erro" : "Conectado"}
              </Badge>
            </div>
            {bling.data?.ultimo_erro && <p className="text-[12px] text-down mt-1.5">{bling.data.ultimo_erro}</p>}
            <Link href="/integracoes/canais" className="mt-2 inline-block text-[12px] font-medium text-brand hover:underline">
              {bling.data ? "Lojas e canais do Bling" : "Conectar o Bling"}
            </Link>
          </Panel>
        </div>

        <div className="space-y-3">
          <SectionTitle title="Planilhas" hint="Fontes que entram pela tela de Importar" />
          <FontesDados dados={fontes} />
          <Disclosure title="Como as fontes convivem">
            <p>
              Canais sem API entram por arquivo na tela <Link href="/importar" className="font-medium text-brand hover:underline">Importar</Link>.
              A sincronização da API não apaga o que foi importado: preenche os dias seguintes da conta conectada.
            </p>
            <p className="mt-2">
              Pedido da VTEX criado e nunca pago não entra: a VTEX abre o pedido antes de o cartão responder, e contá-lo
              punha a loja com quase metade de cancelamento que nunca foi venda.
            </p>
            <p className="mt-2">
              Toda fonte grava pedido a pedido e, a partir deles, os totais do dia. A Visão geral e Vendas leem os totais;
              Cancelamentos, SKU, Por que caiu e Custos leem os pedidos. A verificação "os totais batem" acima confere as duas.
            </p>
          </Disclosure>
        </div>
      </PageBody>
    </>
  );
}
