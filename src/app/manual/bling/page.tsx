import type { Metadata } from "next";

export const metadata: Metadata = { title: "Manual da integração com o Bling" };

/**
 * Manual público da integração com o Bling.
 *
 * O cadastro do aplicativo no Bling exige um link de manual, e a
 * homologação confere se ele explica instalação, permissões e suporte. Por
 * isso abre sem login (está em PUBLICAS no proxy) e sem a moldura do
 * sistema (SEM_MOLDURA): quem lê ainda não é cliente.
 */
export default function ManualBling() {
  return (
    <main className="min-h-screen bg-ground text-ink">
      <article className="mx-auto max-w-2xl px-4 py-12 flex flex-col gap-8 text-[15px] leading-relaxed">
        <header className="flex flex-col gap-2">
          <span className="label">Manual</span>
          <h1 className="text-[26px] font-semibold">Integração com o Bling</h1>
          <p className="text-ink-2">
            A plataforma lê seus pedidos, produtos e estoque do Bling e mostra, num lugar só, como cada canal de venda
            está indo: receita, pedidos, cancelamentos, metas e margem.
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <h2 className="text-[18px] font-semibold">O que a integração faz</h2>
          <ul className="list-disc pl-5 flex flex-col gap-1 text-ink-2">
            <li>Traz os pedidos de venda do Bling todos os dias, sozinha.</li>
            <li>Separa cada pedido pelo canal de origem (Mercado Livre, Magalu, site e outros).</li>
            <li>Consulta o estoque por depósito, com o nome cadastrado no Bling, quando a permissão está autorizada.</li>
            <li>Monta as telas de vendas por dia, semana, mês e ano, metas, cancelamentos e análise de SKU.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[18px] font-semibold">Permissões pedidas</h2>
          <p className="text-ink-2">
            Somente leitura. A plataforma <b>não cria, não altera e não exclui</b> nada no seu Bling.
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1 text-ink-2">
            <li>Pedidos de venda: visualizar</li>
            <li>Produtos e categorias de produtos: visualizar</li>
            <li>Depósitos: leitura</li>
            <li>Controle de estoque: visualizar</li>
            <li>Dados básicos da empresa: visualizar (para confirmar qual empresa conectou)</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[18px] font-semibold">Como instalar</h2>
          <ol className="list-decimal pl-5 flex flex-col gap-1 text-ink-2">
            <li>Entre na plataforma, selecione a empresa e abra <b>Canais e contas → ERP</b>.</li>
            <li>
              Clique em <b>Conectar Bling</b>. Você vai para o Bling: entre com um usuário administrador da conta e
              autorize.
            </li>
            <li>Ao voltar, os pedidos dos últimos 15 dias já são lidos.</li>
          </ol>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[18px] font-semibold">Como configurar</h2>
          <p className="text-ink-2">
            Cada loja virtual cadastrada no seu Bling aparece na aba ERP. Escolha a qual canal da plataforma ela
            corresponde. Enquanto uma loja não tiver canal, os pedidos dela ficam parados, para não serem contados no
            canal errado. Ao ligar, os últimos 30 dias dela entram na hora.
          </p>
          <p className="text-ink-2">
            Canal que já está conectado à plataforma pela API própria (Mercado Livre, VTEX) é ignorado no Bling, para o
            mesmo pedido não ser contado duas vezes.
          </p>
        </section>

        <section id="permissoes-estoque" className="flex flex-col gap-2 scroll-mt-6">
          <h2 className="text-[18px] font-semibold">Estoque sem permissão (erro 403)</h2>
          <p className="text-ink-2">
            A conexão não recebeu permissão para ler o recurso indicado no erro. Confira a autorização de
            depósitos, estoques e produtos antes de reconectar.
          </p>
          <ol className="list-decimal pl-5 flex flex-col gap-1 text-ink-2">
            <li>
              Na conta que cadastrou o aplicativo no Bling, abra <b>Central de Extensões → Área do Integrador</b>,
              selecione o aplicativo e revise os <b>Escopos</b> (permissões).
            </li>
            <li>
              Habilite a leitura de depósitos, estoques e produtos que estiver faltando e salve.
              Mantenha as permissões de pedidos já utilizadas.
            </li>
            <li>
              No Gerizo, selecione a empresa correta e abra <b>Canais e contas → ERP → Reconectar</b>.
              Autorize usando um administrador dessa empresa no Bling.
            </li>
            <li>Ao voltar, clique em <b>Atualizar agora</b> e confira o resultado da etapa de estoque.</li>
          </ol>
          <p className="text-ink-2">
            Ao salvar mudanças nas permissões, o Bling revoga as autorizações existentes:
            <b> todas as empresas que usam esse mesmo aplicativo precisam reconectar</b>.
            Os dados já importados continuam no Gerizo. Se as permissões já estavam corretas, reconecte a empresa afetada.
          </p>
          <a href="https://developer.bling.com.br/aplicativos" className="self-start font-medium text-brand hover:underline">
            Documentação do Bling sobre permissões
          </a>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[18px] font-semibold">Como desinstalar</h2>
          <p className="text-ink-2">
            No Bling, remova a autorização do aplicativo na Central de Extensões. A partir daí a plataforma deixa de ler
            seus dados; o que já foi lido continua disponível nas telas até você pedir a exclusão.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[18px] font-semibold">Suporte</h2>
          <p className="text-ink-2">
            Fale com o desenvolvedor pelo e-mail de contato informado na página do aplicativo na Central de Extensões do
            Bling.
          </p>
        </section>
      </article>
    </main>
  );
}
