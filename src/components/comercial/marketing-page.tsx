import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, ChartNoAxesCombined, Check, CirclePlay, Coins, FileText, Layers3, MessagesSquare, Package, Truck } from "lucide-react";
import { Brand } from "@/components/ui/brand";
import { InterestForm } from "./interest-form";
import "./commercial.css";

const recursos = [
  { nome: "Dia, histórico e metas", detalhe: "Entenda o ritmo da operação.", tela: "hoje", icon: CalendarDays },
  { nome: "Produtos e anúncios", detalhe: "Chegue ao detalhe de cada SKU.", tela: "produtos", icon: Package },
  { nome: "Tráfego pago", detalhe: "Dê contexto ao investimento.", tela: "midia", icon: ChartNoAxesCombined },
  { nome: "Promoções", detalhe: "Confira as condições antes de aprovar.", tela: "promocoes", icon: Layers3 },
  { nome: "Planejamento", detalhe: "Organize ações e responsáveis.", tela: "planejamento", icon: CalendarDays },
  { nome: "Financeiro", detalhe: "Acompanhe custos e contribuição.", tela: "financeiro", icon: Coins },
  { nome: "Envios", detalhe: "Priorize prazos e prepare documentos.", tela: "envios", icon: Truck },
  { nome: "Conversar com os dados", detalhe: "Explore as perguntas do negócio.", tela: "conversar", icon: MessagesSquare },
];

function ProductPreview() {
  return <div className="commercial-preview" aria-label="Prévia ilustrativa do Gerizo com dados fictícios">
    <div className="commercial-preview-top"><span className="commercial-preview-mark">g.</span><span>Loja Horizonte <small>Demonstração</small></span><span className="commercial-preview-date">18 nov</span></div>
    <div className="commercial-preview-body"><div className="commercial-preview-title"><span>Seu dia</span><span>Mercado Livre + Loja própria</span></div><div className="commercial-preview-reading"><div><span>Receita do dia</span><strong>R$ 499<small>,40</small></strong></div><span className="commercial-preview-meta">Meta <b>R$ 600</b></span></div>
      <div className="commercial-preview-chart" aria-hidden="true"><svg viewBox="0 0 440 145" preserveAspectRatio="none"><path className="commercial-chart-grid" d="M0 30H440M0 75H440M0 120H440"/><path className="commercial-chart-context" d="M0 114L65 100L130 86L195 70L260 52L325 35L390 18L440 10"/><path className="commercial-chart-line" d="M0 128L55 120L110 91L165 100L220 68L275 78L330 39L385 46L440 19"/></svg><div><span>08h</span><span>12h</span><span>16h</span><span>20h</span></div></div>
      <div className="commercial-preview-bottom"><span><i />Realizado</span><span><i />Referência</span><span>Dados fictícios</span></div>
      <div className="commercial-preview-task"><span className="commercial-task-icon"><Truck size={18} /></span><div><strong>Pedidos para separar</strong><span>Produtos, prazo e documentos juntos.</span></div><ArrowUpRight size={18}/></div>
    </div>
    <Link href="/demonstracao?tour=1" className="commercial-preview-invitation">Explore essa operação de exemplo <ArrowRight size={17}/></Link>
  </div>;
}

export function MarketingPage() {
  return <main className="commercial-page" id="inicio">
    <a className="commercial-skip" href="#conteudo-comercial">Ir para o conteúdo</a>
    <header className="commercial-header"><Link href="/conheca" aria-label="Gerizo — início"><Brand /></Link><nav aria-label="Navegação do site"><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#videos">Vídeos</a></nav><Link href="/entrar" className="commercial-login">Já uso o Gerizo <ArrowUpRight size={16}/></Link></header>
    <section className="commercial-hero commercial-container" id="conteudo-comercial">
      <div className="commercial-hero-copy"><p className="commercial-eyebrow">Inteligência de mercado para e-commerce</p><h1>Clareza para decidir.<br/><span>Ritmo para operar.</span></h1><p className="commercial-hero-description">Vendas, anúncios, margem e rotina comercial em uma leitura que vai do negócio ao detalhe do produto.</p><div className="commercial-hero-actions"><Link href="/demonstracao?tour=1" className="commercial-button commercial-button-primary">Conhecer por dentro <ArrowRight size={18}/></Link><a href="#como-funciona" className="commercial-button commercial-button-quiet">Veja como funciona <ArrowDown size={16}/></a></div><p className="commercial-demo-note">Tour sem cadastro, com dados fictícios. Explore no seu ritmo.</p></div>
      <ProductPreview />
    </section>
    <section className="commercial-intro commercial-container" id="como-funciona"><div><p className="commercial-eyebrow">Uma rotina conectada</p><h2>Do que aconteceu<br/>ao que fazer agora.</h2></div><p>Comece pelo resultado do dia. Abra o produto que pede atenção. Confira custos, mídia e condições de promoção. Leve a decisão para a rotina do time.</p></section>
    <section className="commercial-workflow commercial-container" aria-label="Como o Gerizo ajuda a operação">
      <article><span className="commercial-step">01</span><div><h3>Encontre o ponto de atenção.</h3><p>Dia, histórico, metas e análise por produto ajudam a localizar onde o resultado mudou.</p><Link href="/demonstracao/hoje">Explorar a leitura do dia <ArrowUpRight size={16}/></Link></div><div className="commercial-mini-days" aria-hidden="true">{[44,67,51,89,72,98,60].map((n,i)=><span key={i}><i style={{height:`${n}%`}}/><small>{["S","T","Q","Q","S","S","D"][i]}</small></span>)}</div></article>
      <article><span className="commercial-step">02</span><div><h3>Dê contexto à decisão.</h3><p>Preço, custo, comissão, frete e mídia entram na conversa. As condições ficam à vista antes de uma aprovação.</p><Link href="/demonstracao/promocoes">Experimentar uma promoção <ArrowUpRight size={16}/></Link></div><div className="commercial-mini-decision" aria-hidden="true"><span>Proposta <b>R$ 229,90</b></span><span>Piso <b>R$ 219,90</b></span><strong><Check size={15}/>Conferir e revisar</strong></div></article>
      <article><span className="commercial-step">03</span><div><h3>Faça a operação avançar.</h3><p>Organize ações, acompanhe prazos e prepare a separação dos pedidos. O time trabalha com o mesmo contexto.</p><Link href="/demonstracao/envios">Conhecer os envios <ArrowUpRight size={16}/></Link></div><div className="commercial-mini-order" aria-hidden="true"><FileText size={25}/><div><b>Pedido D-1007</b><span>1 item · para hoje</span></div><span className="commercial-mini-check"><Check size={16}/></span></div></article>
    </section>
    <section className="commercial-resource-section" id="recursos"><div className="commercial-container"><div className="commercial-section-heading"><div><p className="commercial-eyebrow">Conheça o produto</p><h2>Ferramentas para<br/>as perguntas do negócio.</h2></div><Link href="/demonstracao" className="commercial-text-link">Abrir demonstração livre <ArrowUpRight size={18}/></Link></div><div className="commercial-resources">{recursos.map(r=><Link key={r.tela} href={`/demonstracao/${r.tela}`}><r.icon size={21} aria-hidden="true"/><div><h3>{r.nome}</h3><p>{r.detalhe}</p></div><ArrowUpRight size={17} aria-hidden="true"/></Link>)}</div><p className="commercial-resource-note">Conexões e importações reúnem diferentes origens. A cobertura dos dados acompanha a leitura da operação.</p></div></section>
    <section className="commercial-videos commercial-container" id="videos"><div className="commercial-section-heading"><div><p className="commercial-eyebrow">Aprenda por etapas</p><h2>Vídeos para conhecer<br/>e colocar em prática.</h2></div><p>A biblioteca está em preparação. Enquanto isso, o tour já está disponível.</p></div><div className="commercial-video-list">{[{n:"01",titulo:"Comece pela leitura do dia",texto:"Datas, metas e o contexto do resultado."},{n:"02",titulo:"Preço, mídia e margem",texto:"O que observar antes de decidir."},{n:"03",titulo:"Da promoção à expedição",texto:"Revisão, pedidos e organização da rotina."}].map(v=><article key={v.n}><div className="commercial-video-cover" aria-hidden="true"><span>{v.n}</span><CirclePlay size={38} strokeWidth={1}/></div><span className="commercial-video-state">Em preparação</span><h3>{v.titulo}</h3><p>{v.texto}</p></article>)}</div></section>
    <section className="commercial-interest commercial-container" id="interesse"><div><p className="commercial-eyebrow">Vamos conversar</p><h2>Quer levar essa visão<br/>para a sua operação?</h2><p>Deixe seu nome e telefone para conhecer o acesso ao Gerizo. Você também pode explorar a demonstração agora.</p><Link href="/demonstracao?tour=1" className="commercial-text-link">Prefiro começar pelo tour <ArrowUpRight size={18}/></Link></div><InterestForm /></section>
    <section className="commercial-faq commercial-container" aria-label="Perguntas frequentes"><h2>Antes de começar.</h2><div><details><summary>Preciso cadastrar uma empresa para fazer o tour?</summary><p>Não. A demonstração usa uma operação fictícia e pode ser explorada sem cadastro.</p></details><details><summary>A demonstração acessa dados de alguma loja?</summary><p>Os produtos, pedidos, contas e valores são exemplos. As ações do tour alteram apenas o cenário demonstrativo.</p></details><details><summary>Como entram os dados da minha operação?</summary><p>O produto trabalha com conexões e importações. As fontes disponíveis dependem dos canais, das permissões e da configuração de cada operação.</p></details><details><summary>Como posso saber mais sobre o acesso?</summary><p>Registre seu nome e telefone no formulário acima. O contato será usado para conversar sobre o produto.</p></details></div></section>
    <footer className="commercial-footer commercial-container"><Brand /><span>Inteligência e operação para e-commerce.</span><div><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/entrar">Entrar no sistema</Link></div></footer>
  </main>;
}

export default MarketingPage;
