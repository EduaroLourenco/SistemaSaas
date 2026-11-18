import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { Panel, Badge } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/controls";
import { FontesDados } from "@/components/painel/fontes-dados";
import { SaudeDados } from "@/components/painel/saude-dados";
import { BotaoAtualizar } from "@/components/painel/botao-atualizar";
import { Disclosure } from "@/components/ui/disclosure";
import type { DadosFontes } from "@/lib/dados/fontes";
import type { Verificacao } from "@/lib/dados/saude";
export type LinhaIntegracao = {status:string;ultima_sincronizacao:string|null;ultimo_erro:string|null;conta_canal_id:string|null;provedor:string;credencial_ref:string|null};
export function FontesConteudo({fontes,contas,todas,lojas,saude,bling,escritaDisponivel,mapa}:{fontes:DadosFontes;contas:{id:string;nome:string;conectada:boolean}[];todas:LinhaIntegracao[];lojas:{id:string;nome:string;conectada:boolean}[];saude:Verificacao[];bling:{ultima_sincronizacao:string|null;ultimo_erro:string|null}|null;escritaDisponivel:boolean;mapa?:ReactNode}) {
 const porConta = new Map(todas.filter(l=>l.provedor==="mercado_livre").map(l=>[l.conta_canal_id??"",l]));
 const escritaPorConta = new Map(todas.filter(l=>l.provedor==="mercado_livre_escrita").map(l=>[l.conta_canal_id??"",Boolean(l.credencial_ref)]));
 const quando=(iso:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(iso));
  return (
    <>
      <PageHeader
        title="Fontes de dados"
        help="Origem, cobertura e estado das conexões."
        actions={<BotaoAtualizar />}
      />

      <PageBody className="management-workspace"><WorkspaceNav />
        <div className="flex flex-wrap gap-4 text-xs text-brand"><Link href="/integracoes/estoques">Estoques por origem →</Link><Link href="/guia">Como usar cada aba →</Link></div>
        {mapa}
        <SaudeDados verificacoes={saude} />

        <div className="management-section">
          <div className="flex flex-wrap items-end justify-between gap-3">
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
                      <p className="text-[13px] font-semibold text-ink break-words">{c.nome}</p>
                      <p className="text-[12px] text-ink-3 mt-0.5">
                        Pedidos, visitas, catálogo, estoque, comissão e frete
                      </p>
                    </div>
                    <Badge tone={!conectada ? "neutral" : comErro ? "down" : "up"}>
                      {!conectada ? "Não conectada" : comErro ? "Com erro" : "Conectada"}
                    </Badge>
                  </div>
                  <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-3">
                    <p className="num text-[12px] text-ink-2">
                      {reg?.ultima_sincronizacao
                        ? `Última sincronização: ${quando(reg.ultima_sincronizacao)}`
                        : conectada
                          ? "Ainda sem sincronização registrada"
                          : "Enquanto não conectada, os números desta conta entram por planilha"}
                    </p>
                    <span className="flex items-center gap-3 shrink-0">
                      <a
                        href={`/api/meli/conectar?conta=${c.id}`}
                        /* <a> e não <Link>: o Link pré-carrega o endereço, e pré-carregar uma
                           rota de conexão OAuth dispara a rota sem ninguém clicar. */
                        className="text-[12px] font-medium text-brand hover:underline"
                      >
                        {conectada ? "Reconectar" : "Conectar"}
                      </a>
                      {escritaDisponivel && (
                        <a
                          href={`/api/meli/conectar?conta=${c.id}&app=escrita`}
                          className="text-[12px] text-ink-3 hover:text-ink hover:underline"
                          title={
                            escritaPorConta.get(c.id)
                              ? "O sistema pode alterar promoções e campanhas de publicidade desta conta, quando você mandar."
                              : "Autoriza o sistema a alterar promoções e campanhas de publicidade. Todos os painéis funcionam sem isto."
                          }
                        >
                          {escritaPorConta.get(c.id)
                            ? "Alterações liberadas"
                            : "Permitir alterações"}
                        </a>
                      )}
                    </span>
                  </div>
                  {comErro && reg?.ultimo_erro && (
                    <p className="text-[12px] text-down mt-1.5 break-words">{reg.ultimo_erro}</p>
                  )}
                </Panel>
              );
            })}
          </div>
        </div>

        <div className="management-section">
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

        <div className="management-section">
          <SectionTitle title="ERP · Bling" hint="Pedidos dos canais sem API própria (Shopee, Amazon, Magalu…), lidos às 02h30" />
          <Panel className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">Bling</p>
                <p className="num text-[12px] text-ink-2 mt-0.5">
                  {bling?.ultima_sincronizacao
                    ? `Última leitura: ${quando(bling.ultima_sincronizacao)}`
                    : bling
                      ? "Conectado, ainda sem leitura"
                      : "Não conectado nesta empresa"}
                </p>
              </div>
              <Badge tone={!bling ? "neutral" : bling.ultimo_erro ? "down" : "up"}>
                {!bling ? "Não conectado" : bling.ultimo_erro ? "Com erro" : "Conectado"}
              </Badge>
            </div>
            {bling?.ultimo_erro && <p className="text-[12px] text-down mt-1.5">{bling.ultimo_erro}</p>}
            <Link href="/integracoes/canais" className="mt-2 inline-block text-[12px] font-medium text-brand hover:underline">
              {bling ? "Lojas e canais do Bling" : "Conectar o Bling"}
            </Link>
          </Panel>
        </div>

        <div className="management-section">
          <SectionTitle title="Histórico das fontes" />
          <FontesDados dados={fontes} />
          <Disclosure title="Como as fontes convivem">
            <p>
              Canais sem API entram por arquivo na tela <Link href="/importar" className="font-medium text-brand hover:underline">Importar</Link>.
              Nos períodos relidos, a API atualiza os registros correspondentes. O histórico fora da cobertura da API continua preservado.
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
