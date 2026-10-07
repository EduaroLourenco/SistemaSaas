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
            <li>Controle de estoque: visualizar</li>
            <li>Dados básicos da empresa: visualizar (para confirmar qual empresa conectou)</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[18px] font-semibold">Como instalar</h2>
          <ol className="list-decimal pl-5 flex flex-col gap-1 text-ink-2">
            <li>Entre na plataforma e abra <b>Integrações → Canais e contas → ERP</b>.</li>
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
