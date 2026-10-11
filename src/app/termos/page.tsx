import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Termos de uso" };

/**
 * Termos de uso públicos.
 *
 * Exigidos pelo Google para publicar o aplicativo OAuth, junto da política
 * de privacidade. Abre sem login (PUBLICAS) e sem a moldura do sistema
 * (SEM_MOLDURA) — a tela de consentimento manda gente que ainda não tem
 * conta para cá.
 */
export default function Termos() {
  return (
    <main className="min-h-screen bg-ground text-ink">
      <article className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12 text-[15px] leading-relaxed">
        <header className="flex flex-col gap-2">
          <span className="label">gerizo</span>
          <h1 className="text-[26px] font-semibold">Termos de uso</h1>
          <p className="text-ink-2">Atualizados em 11 de outubro de 2026.</p>
        </header>

        <Secao titulo="O que a plataforma faz">
          <p>
            A gerizo lê, nas contas que você conecta, os dados da sua operação de venda e os
            apresenta em análises: vendas por canal, margem, cancelamentos, preço, promoções e
            desempenho de anúncios. É uma ferramenta de leitura e análise.
          </p>
        </Secao>

        <Secao titulo="Sua conta">
          <p>
            Você é responsável por manter o acesso à sua conta em segurança e por quem você convida
            para a sua empresa dentro da plataforma. Avise se suspeitar de uso indevido.
          </p>
        </Secao>

        <Secao titulo="As contas que você conecta">
          <p>
            Ao conectar um marketplace, um ERP ou o Google Analytics, você autoriza a plataforma a ler
            os dados daquela conta para produzir as análises. Você pode revogar a autorização quando
            quiser, em Canais e contas. A plataforma não altera preço, anúncio ou pedido por conta
            própria: toda escrita parte de uma ação sua.
          </p>
        </Secao>

        <Secao titulo="O que você não deve fazer">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>Conectar contas que não são suas nem da empresa que você representa.</li>
            <li>Tentar acessar dados de outra empresa dentro da plataforma.</li>
            <li>Revender ou redistribuir o acesso sem combinar antes.</li>
          </ul>
        </Secao>

        <Secao titulo="Disponibilidade e limites">
          <p>
            A plataforma depende das APIs dos canais. Quando um canal fica fora do ar, muda uma regra
            ou altera um relatório, os dados daquele canal podem atrasar ou faltar. Mostramos na tela{" "}
            <strong>Fontes de dados</strong> até que dia cada fonte foi lida, para que você nunca
            decida com um número velho achando que é de hoje.
          </p>
          <p className="mt-2">
            As análises são apoio à decisão, não garantia de resultado. Confira os números antes de
            decisões relevantes — a tela de Fontes de dados existe para isso.
          </p>
        </Secao>

        <Secao titulo="Encerramento">
          <p>
            Você pode encerrar o uso quando quiser. Ao encerrar, os dados da sua empresa são apagados,
            inclusive as autorizações guardadas. O pedido pode ser feito pelo e-mail abaixo.
          </p>
        </Secao>

        <Secao titulo="Contato">
          <p>
            <a className="text-brand hover:underline" href="mailto:dudu43.elo@gmail.com">
              dudu43.elo@gmail.com
            </a>
          </p>
        </Secao>

        <footer className="border-t border-line pt-6 text-[13px] text-ink-3">
          <Link className="text-brand hover:underline" href="/privacidade">
            Política de privacidade
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
