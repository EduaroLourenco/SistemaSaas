import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Política de privacidade" };

/**
 * Política de privacidade pública.
 *
 * O Google exige o link para publicar o aplicativo OAuth, e a tela de
 * consentimento o mostra a quem for conectar. Por isso abre sem login
 * (PUBLICAS no proxy) e sem a moldura do sistema (SEM_MOLDURA): quem lê
 * costuma ainda não ter conta.
 *
 * O que ela precisa dizer, para a política do Google de dados de usuário:
 * quais dados são lidos, para quê, com quem são compartilhados, por quanto
 * tempo ficam e como se revoga o acesso. Cada seção abaixo responde uma
 * dessas perguntas, e nenhuma promete o que o sistema não faz.
 */
export default function Privacidade() {
  return (
    <main className="min-h-screen bg-ground text-ink">
      <article className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12 text-[15px] leading-relaxed">
        <header className="flex flex-col gap-2">
          <span className="label">gerizo</span>
          <h1 className="text-[26px] font-semibold">Política de privacidade</h1>
          <p className="text-ink-2">
            Como a plataforma trata os dados das contas que você conecta a ela. Atualizada em 11 de
            outubro de 2026.
          </p>
        </header>

        <Secao titulo="Quem somos">
          <p>
            A gerizo é uma plataforma de análise de vendas para quem vende em marketplaces. Ela reúne
            num lugar só os números que hoje estão espalhados entre os painéis de cada canal.
          </p>
          <p className="mt-2">
            Contato: <a className="text-brand hover:underline" href="mailto:dudu43.elo@gmail.com">dudu43.elo@gmail.com</a>.
          </p>
        </Secao>

        <Secao titulo="Que dados a plataforma lê">
          <p>Somente os da sua operação comercial, nas contas que você mesmo conecta:</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-ink-2">
            <li>
              <strong className="text-ink">Marketplaces</strong> (Mercado Livre e outros): pedidos,
              itens, preços, comissões, fretes, anúncios, estoque, visitas e publicidade.
            </li>
            <li>
              <strong className="text-ink">ERP</strong> (Bling): pedidos e produtos dos canais que não
              têm integração direta.
            </li>
            <li>
              <strong className="text-ink">Google Analytics</strong>: métricas agregadas de tráfego e
              receita do site, pelo escopo <code className="text-[13px]">analytics.readonly</code>, que
              é apenas de leitura. A plataforma não escreve nada na sua conta do Google e não acessa
              Gmail, Drive, Agenda, contatos ou qualquer outro serviço.
            </li>
          </ul>
          <p className="mt-2 text-ink-2">
            Dados pessoais de compradores que vêm junto do pedido (nome e endereço de entrega) são
            guardados porque o canal os envia dentro do próprio pedido, e usados só para montar o
            pedido na tela. Não são usados para marketing nem enriquecidos com outras fontes.
          </p>
        </Secao>

        <Secao titulo="Para que servem">
          <p>
            Exclusivamente para gerar as análises que você vê quando entra na plataforma: vendas por
            canal, margem, cancelamentos, preço, promoções e desempenho de anúncios.
          </p>
          <p className="mt-2">
            <strong>Não vendemos seus dados.</strong> Não os cedemos a terceiros, não os usamos para
            publicidade e não os usamos para treinar modelos de inteligência artificial.
          </p>
        </Secao>

        <Secao titulo="Com quem são compartilhados">
          <p>Só com os serviços necessários para a plataforma funcionar:</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-ink-2">
            <li><strong className="text-ink">Supabase</strong> — banco de dados e autenticação.</li>
            <li><strong className="text-ink">Vercel</strong> — hospedagem da aplicação.</li>
          </ul>
          <p className="mt-2 text-ink-2">
            Nenhum dos dois usa os seus dados para finalidade própria. Fora isso, só por obrigação
            legal.
          </p>
        </Secao>

        <Secao titulo="Separação entre empresas">
          <p>
            Cada empresa só enxerga os próprios dados, e isso é garantido no banco, não na tela: toda
            consulta passa por uma regra de acesso por linha, amarrada à empresa de quem está logado.
            Uma empresa não consegue ler o dado de outra nem trocando identificadores na URL.
          </p>
        </Secao>

        <Secao titulo="Onde ficam as credenciais">
          <p>
            As autorizações das contas que você conecta ficam em um cofre criptografado, separado das
            tabelas comuns. Elas não aparecem em nenhuma tela e não são acessíveis por quem tem acesso
            de leitura à empresa.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo">
          <p>
            Enquanto a sua conta existir. Ao encerrá-la, os dados da empresa são apagados, incluindo as
            autorizações guardadas no cofre. Você pode pedir o apagamento a qualquer momento pelo
            e-mail acima.
          </p>
        </Secao>

        <Secao titulo="Como revogar o acesso">
          <p>
            Dentro da plataforma, em <strong>Canais e contas</strong>, desconectando a integração. No
            caso do Google, você também pode revogar direto em{" "}
            <a
              className="text-brand hover:underline"
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
            >
              Conta Google → Apps com acesso à sua conta
            </a>
            . Revogado o acesso, a plataforma para de ler novos dados na hora.
          </p>
        </Secao>

        <Secao titulo="Uso de dados do Google">
          <p>
            O uso que a gerizo faz das informações recebidas das APIs do Google obedece à{" "}
            <a
              className="text-brand hover:underline"
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
            >
              Política de Dados do Usuário dos Serviços de API do Google
            </a>
            , inclusive aos requisitos de uso limitado.
          </p>
        </Secao>

        <footer className="border-t border-line pt-6 text-[13px] text-ink-3">
          <Link className="text-brand hover:underline" href="/termos">
            Termos de uso
          </Link>
        </footer>
      </article>
    </main>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-[18px] font-semibold">{titulo}</h2>
      <div className="text-ink-2">{children}</div>
    </section>
  );
}
