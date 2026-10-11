"use client";

import * as React from "react";
import { Panel, Badge, PanelHeader } from "@/components/ui/primitives";
import { Disclosure } from "@/components/ui/disclosure";
import type { ContaCanal } from "@/lib/dados/canais";

/**
 * Google Analytics, em aba própria.
 *
 * ── Por que saiu de dentro do canal ──
 *
 * O botão de conectar o GA4 só aparecia na linha de canal do tipo
 * `loja_propria`, e só a VTEX tem esse tipo. Numa empresa que vende em
 * marketplace e tem site fora da VTEX — a Bom de Compras é assim, com
 * "Venda direta" no canal `outros` — o Google simplesmente não existia na
 * tela. Não havia erro: a opção não era desenhada.
 *
 * O GA4 mede um SITE, e um site pode estar amarrado a qualquer conta da
 * empresa. Quem decide é quem conhece a operação, não o tipo do canal.
 * Então a aba lista TODAS as contas e deixa escolher qual recebe as
 * sessões.
 *
 * ── Por que por conta, e não por empresa ──
 *
 * Uma empresa pode ter mais de um site, e o faturamento de cada um
 * precisa cair no lugar certo para a receita por canal fechar. A
 * integração guarda `conta_canal_id`, e é essa conta que aparece nas
 * telas de vendas.
 */
export function GooglePainel({ contas }: { contas: ContaCanal[] }) {
  const quando = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso))
      : null;

  const ligadas = contas.filter((c) => c.ga4);

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader
          title="Google Analytics"
          hint="Sessões e receita do site, por API. Acesso somente leitura: nada é alterado na sua conta do Google."
        />
        <div className="p-4">
          {ligadas.length === 0 && (
            <p className="mb-3 text-[13px] text-ink-2">
              Nenhuma conta recebendo dados do Google ainda. Escolha abaixo em qual delas as sessões
              do site devem entrar.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-ink-3">
                <tr>
                  <th className="px-5 py-2 font-semibold">Conta</th>
                  <th className="px-3 py-2 font-semibold">Canal</th>
                  <th className="px-3 py-2 font-semibold">Situação</th>
                  <th className="px-3 py-2 font-semibold">Propriedade do GA4</th>
                  <th className="px-5 py-2 font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => {
                  const g = c.ga4;
                  return (
                    <tr key={c.id} className="border-t border-line">
                      <td className="px-5 py-2.5 font-medium text-ink">{c.nome}</td>
                      <td className="px-3 py-2.5 text-ink-2">{c.canalNome}</td>
                      <td className="px-3 py-2.5">
                        <Badge
                          tone={
                            g?.erro ? "down" : g?.conectada && g.propriedade ? "up" : g?.conectada ? "warn" : "neutral"
                          }
                        >
                          {g?.erro
                            ? "Com erro"
                            : !g?.conectada
                              ? "Não conectado"
                              : g.propriedade
                                ? "Recebendo"
                                : "Falta a propriedade"}
                        </Badge>
                        {g?.erro && <p className="mt-1 text-[12px] text-down">{g.erro}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">
                        {g?.propriedade ?? "—"}
                        {quando(g?.sincronizadaEm ?? null) && (
                          <span className="num block text-[12px] text-ink-3">
                            sync {quando(g?.sincronizadaEm ?? null)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2.5">
                        {/* <a> e não <Link>: pré-carregar uma rota de OAuth a
                            dispararia sem ninguém clicar. */}
                        <a
                          href={`/api/ga4/conectar?conta=${c.id}`}
                          className="text-[13px] font-medium text-brand hover:underline"
                        >
                          {g?.conectada ? "Reconectar" : "Conectar"}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      <Disclosure title="Como funciona a conexão">
        <p>
          Ao conectar, o Google pede sua autorização para a plataforma <strong>ler</strong> os
          relatórios do Analytics. É só leitura: nada é escrito na sua conta, e nenhum outro serviço
          do Google (Gmail, Drive, Agenda) é acessado.
        </p>
        <p className="mt-2">
          Vai aparecer uma tela cinza dizendo que o app não foi verificado pelo Google. Clique em{" "}
          <strong>Avançado</strong> e depois em <strong>Acessar gerizo</strong>. A verificação é um
          processo à parte, que tira esse aviso, e não muda o que o app faz.
        </p>
        <p className="mt-2">
          Depois de autorizar, você volta para cá e escolhe <strong>a propriedade</strong> do GA4 —
          uma conta do Google pode ter várias, e é ela que diz de qual site vêm os números. Enquanto
          a propriedade não for escolhida, a situação fica em &ldquo;Falta a propriedade&rdquo; e nada
          é lido.
        </p>
        <p className="mt-2">
          Para revogar, use{" "}
          <a
            className="text-brand hover:underline"
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
          >
            Conta Google → Apps com acesso
          </a>
          . A plataforma para de ler na hora.
        </p>
      </Disclosure>
    </div>
  );
}
