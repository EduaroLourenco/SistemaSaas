"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Hand, Play } from "lucide-react";
import { FUNCIONALIDADES, type CategoriaFuncionalidade } from "@/lib/comercial/funcionalidades";
import { TelaAnotada, type Marca } from "./anotacao";
import { FeatureVideoFeed } from "./feature-video-feed";
import { fontesSite } from "./fontes";
import { MontadorModulos } from "./montador-modulos";
import { SiteRodape, SiteTopo } from "./site-comum";
import "./site.css";

export const COR_CATEGORIA: Record<CategoriaFuncionalidade, string> = {
  Vendas: "var(--gz-c1)", "Mercado Livre": "var(--gz-c2)", Promoções: "var(--gz-c5)", Operação: "var(--gz-c4)", Dinheiro: "var(--gz-c7)",
};

const PERGUNTAS: { id: string; titulo: string; texto: string; tela: string; alt: string; nota: string; rota: string; marcas: Marca[] }[] = [
  { id: "v03", titulo: "Caiu? A pista já vem pronta.", texto: "O Gerizo separa a queda por produto e mostra se foi estoque, preço, visitas ou conversão.",
    tela: "/site/queda.webp", alt: "Tela Por que caiu, com a queda da receita e o motivo de cada produto", nota: "sem estoque, não é falta de cliente", rota: "/demonstracao/sistema/vendas/queda",
    marcas: [{ tipo: "marca-texto", x: 17.6, y: 22.5, w: 22.4, h: 6 }, { tipo: "circulo", x: 88.6, y: 70.8, w: 9.8, h: 6.6 }] },
  { id: "v07", titulo: "Essa promoção cabe no seu preço?", texto: "Veja o que o Mercado Livre pede ao lado do seu preço mínimo e aceite só o que faz sentido, com revisão antes.",
    tela: "/site/promocoes.webp", alt: "Tela de promoções abertas comparando o preço pedido pelo Mercado Livre com o piso de cada produto", nota: "pede R$ 367, o piso é R$ 471", rota: "/demonstracao/sistema/automacoes",
    marcas: [{ tipo: "circulo", x: 58.6, y: 84.6, w: 6.6, h: 6 }, { tipo: "circulo", x: 78.2, y: 84.6, w: 6.6, h: 6 }] },
  { id: "v04", titulo: "O que sai hoje, sem correria.", texto: "O Separador junta os pedidos do dia. Você pega tudo numa volta só e monta os pacotes em sequência.",
    tela: "/site/separador.webp", alt: "Separador de envios com a lista de produtos para pegar no dia", nota: "uma volta pelo estoque e pronto", rota: "/demonstracao/sistema/mercado-livre/envios?aba=separador",
    marcas: [{ tipo: "marca-texto", x: 17.8, y: 42, w: 8.4, h: 5.6 }, { tipo: "check", x: 18.6, y: 61.6, w: 2.8, h: 4.6 }] },
  { id: "v08", titulo: "Faturou. E quanto ficou?", texto: "Frete, comissão e Ads entram sozinhos na conta. Você vê o resultado e onde ele foi parar.",
    tela: "/site/financeiro.webp", alt: "Demonstrativo financeiro com receita, custos da venda, custos da operação e resultado", nota: "isso é o que sobrou", rota: "/demonstracao/sistema/financeiro",
    marcas: [{ tipo: "marca-texto", x: 19.6, y: 31.4, w: 21.6, h: 6.2 }, { tipo: "circulo", x: 33.4, y: 73.2, w: 8.4, h: 6.4 }] },
];

/** O sistema de exemplo dentro de um celular. Só carrega quando aparece na tela. */
function CelularAoVivo() {
  const caixa = useRef<HTMLDivElement>(null);
  const [carregar, setCarregar] = useState(false);
  const [mexer, setMexer] = useState(false);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setCarregar(true); obs.disconnect(); } }, { rootMargin: "300px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div className="gz-celular" ref={caixa}>
      <div className="gz-celular-tela">
        {carregar && <iframe src="/demonstracao/sistema/vendas/dia" title="Sistema Gerizo de exemplo" loading="lazy" tabIndex={mexer ? 0 : -1} />}
        {!mexer && <button type="button" className="gz-celular-toque" onClick={() => setMexer(true)}><span><Hand size={17} aria-hidden />Tocar para mexer</span></button>}
      </div>
    </div>
  );
}

export function MarketingPage() {
  const [video, setVideo] = useState<string | null>(null);
  const montador = useRef<HTMLElement>(null);
  const pedir = () => montador.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

  return (
    <main className={`gz ${fontesSite}`} id="inicio">
      <a className="gz-skip" href="#conteudo">Ir para o conteúdo</a>
      <SiteTopo aoPedir={pedir} />

      <section className="gz-abre gz-wrap" id="conteudo">
        <h1>Você vende. O Gerizo mostra o que aconteceu.</h1>
        <div className="gz-abre-linha">
          <p>Vendas, anúncios do Mercado Livre, promoções, envios e custos lidos juntos, com o próximo passo à vista.</p>
          <div className="gz-abre-acoes">
            <button type="button" className="gz-btn gz-btn-primary" onClick={() => setVideo(FUNCIONALIDADES[0].id)}><Play size={18} fill="currentColor" aria-hidden />Ver funcionalidades</button>
            <button type="button" className="gz-link" onClick={pedir}>Pedir demonstração</button>
          </div>
        </div>
        <div className="gz-abre-tela">
          <TelaAnotada prioridade src="/site/hoje.webp" alt="Tela Hoje do Gerizo com a receita do dia, a meta e os últimos dias" nota="caiu 39% hoje. por quê?"
            marcas={[{ tipo: "circulo", x: 86.4, y: 39.6, w: 11.2, h: 6.4 }, { tipo: "circulo", x: 52.6, y: 26.6, w: 6.8, h: 5.4 }]} />
        </div>
      </section>

      <section className="gz-perguntas gz-wrap" aria-labelledby="perguntas">
        <h2 className="gz-titulo-secao" id="perguntas">As perguntas da semana, respondidas na tela.</h2>
        {PERGUNTAS.map((p) => (
          <article className="gz-pergunta" key={p.id}>
            <div className="gz-pergunta-texto">
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
              <div className="gz-pergunta-acoes">
                <button type="button" className="gz-btn gz-btn-line gz-btn-small" onClick={() => setVideo(p.id)}><Play size={15} fill="currentColor" aria-hidden />Assistir</button>
                <Link className="gz-link" href={p.rota}>Abrir no sistema de exemplo</Link>
              </div>
            </div>
            <TelaAnotada src={p.tela} alt={p.alt} nota={p.nota} marcas={p.marcas} />
          </article>
        ))}
      </section>

      <section className="gz-vivo" aria-labelledby="vivo">
        <div className="gz-wrap">
          <div>
            <h2 className="gz-titulo-secao" id="vivo">Ainda na dúvida? Mexa você mesmo.</h2>
            <p>Uma loja de exemplo, com as mesmas telas que nossos clientes usam. Nada da sua conta, nada é enviado.</p>
            <Link href="/demonstracao/sistema/vendas/dia?tour=1" className="gz-btn gz-btn-primary">Abrir o sistema de exemplo</Link>
          </div>
          <CelularAoVivo />
        </div>
      </section>

      <section className="gz-monte gz-wrap" id="monte" ref={montador} aria-labelledby="monte-titulo" tabIndex={-1}>
        <div className="gz-monte-cab">
          <h2 className="gz-titulo-secao" id="monte-titulo">Monte seu pacote.</h2>
          <p>Marque o que faz sentido para sua loja. A gente mostra funcionando e passa o preço na conversa.</p>
        </div>
        <MontadorModulos />
      </section>

      <SiteRodape />
      {video && <FeatureVideoFeed items={FUNCIONALIDADES} initialId={video} onClose={() => setVideo(null)} />}
    </main>
  );
}

export default MarketingPage;
