"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { RefreshCw, X } from "lucide-react";
import { TourReal } from "@/components/comercial/tour-real/tour-real";
import { getDemoFixture } from "@/lib/demo/fixtures";
import { getDemoState, resetDemoState, EVENTO_DEMO } from "@/lib/demo/store";
import { caminhoLogico, useDemoLocation, navegarDemo, EVENTO_REFRESH, avisarDemo, DEMO_PREFIX, gerizoFetch } from "@/lib/demo/runtime";
import { BlocoOperacao } from "@/app/vendas/dia/operacao-hoje-blocos";
import { ANUNCIOS_EXTRA_DEMO, AnunciosExtraDemo } from "./anuncios-extra";
import { ROTAS_GESTAO_FINANCEIRA_DEMO } from "@/lib/demo/fixtures-gestao-financeira";
import "./demo-real.css";

const esperando = () => <div className="gerizo-demo-loading" role="status">Preparando a tela do Gerizo…</div>;
const carregar = (loader: () => Promise<unknown>) => dynamic<Record<string, unknown>>(() => loader().then(m => (m as { default: React.ComponentType<Record<string, unknown>> }).default), { ssr: false, loading: esperando });
const GestaoFinanceiraDemo = dynamic(() => import("./gestao-financeira"), { ssr: false, loading: esperando });

// Estes são os componentes do produto. Não há cópia reduzida de suas interfaces.
const TELAS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  "/vendas/dia": carregar(() => import("@/app/vendas/dia/dia-cliente")),
  "/vendas/semanal": carregar(() => import("@/app/vendas/semanal/semanal-cliente")),
  "/vendas/skus": carregar(() => import("@/app/vendas/skus/analise-sku-cliente")),
  "/vendas/queda": carregar(() => import("@/app/vendas/queda/queda-cliente")),
  "/vendas/mtd": carregar(() => import("@/app/vendas/mtd/mtd-cliente")),
  "/vendas/anual": carregar(() => import("@/app/vendas/anual/anual-cliente")),
  "/vendas/canais": carregar(() => import("@/app/vendas/canais/canais-cliente")),
  "/vendas/cancelamentos": carregar(() => import("@/app/vendas/cancelamentos/cancelamentos-cliente")),
  "/vendas/comparativos": carregar(() => import("@/app/vendas/comparativos/comparativos-cliente")),
  "/vendas/diario": carregar(() => import("@/app/vendas/diario/diario-cliente")),
  "/vendas/lancamentos": carregar(() => import("@/app/vendas/lancamentos/lancamentos-cliente")),
  "/vendas/metas": carregar(() => import("@/app/vendas/metas/metas-cliente")),
  "/vendas/periodo": carregar(() => import("@/app/painel-cliente")),
  "/anuncios/analise": carregar(() => import("@/components/analise/central-anuncios")),
  "/anuncios/trafego-pago": carregar(() => import("@/app/anuncios/trafego-pago/trafego-pago-cliente")),
  "/mercado-livre": carregar(() => import("@/app/mercado-livre/termometro-cliente")),
  "/mercado-livre/envios": carregar(() => import("@/app/mercado-livre/envios/envios-cliente")),
  "/automacoes": carregar(() => import("@/app/automacoes/automacoes-cliente")),
  "/automacoes/regras": carregar(() => import("@/app/automacoes/regras/regras-cliente")),
  "/promocoes/processar": carregar(() => import("@/app/promocoes/processar/page")),
  "/promocoes/campanhas": carregar(() => import("@/app/promocoes/campanhas/campanhas-cliente")),
  "/promocoes/historico": carregar(() => import("@/app/promocoes/historico/historico-cliente")),
  "/promocoes/comparar": carregar(() => import("@/app/promocoes/comparar/comparar-cliente")),
  "/anuncios/preco-ideal": carregar(() => import("@/app/anuncios/preco-ideal/preco-ideal-cliente")),
  "/financeiro": carregar(() => import("@/app/financeiro/financeiro-cliente")),
  "/financeiro/custos": carregar(() => import("@/app/financeiro/custos/custos-cliente")),
  "/produtos": carregar(() => import("@/app/produtos/produtos-cliente")),
  "/produtos/precificacao": carregar(() => import("@/app/produtos/precificacao/precificacao-cliente")),
  "/planejamento": carregar(() => import("@/app/planejamento/planejamento-cliente")),
  "/planejamento/resultados": carregar(() => import("@/app/planejamento/resultados/resultados-cliente")),
  "/conversa": carregar(() => import("@/app/conversa/conversa-cliente")),
};

class TelaSegura extends React.Component<{ children: React.ReactNode }, { falhou: boolean }> {
  state = { falhou: false };
  static getDerivedStateFromError() { return { falhou: true }; }
  componentDidCatch(error: Error) { console.error("Gerizo: erro na tela de demonstração", error); }
  render() { return this.state.falhou ? <div className="gerizo-demo-loading" role="alert">Não foi possível abrir esta tela do exemplo. Use Reiniciar demonstração para tentar novamente.</div> : this.props.children; }
}

export function DemoRealRenderer({ iniciarTour = false }: { iniciarTour?: boolean }) {
  const url = useDemoLocation();
  const pathname = caminhoLogico(url.split("?")[0]);
  const apresentacao = new URLSearchParams(url.split("?")[1] ?? "").get("apresentacao") === "1";
  React.useEffect(() => {
    const anterior=document.documentElement.getAttribute("data-theme");
    let tema="light";try{tema=sessionStorage.getItem("tema:demo")??"light";}catch{}
    document.documentElement.setAttribute("data-theme",apresentacao?"light":tema);
    return()=>{let salvo:string|null=null;try{salvo=localStorage.getItem("tema");}catch{}if(salvo??anterior)document.documentElement.setAttribute("data-theme",(salvo??anterior)!);else document.documentElement.removeAttribute("data-theme");};
  }, [apresentacao]);
  const [versao, setVersao] = React.useState(0);
  const [reinicio, setReinicio] = React.useState(0);
  const [aviso, setAviso] = React.useState("");
  React.useEffect(() => {
    const atualizar = () => setVersao(v => v + 1);
    const mostrar = (event: Event) => setAviso(String((event as CustomEvent).detail ?? ""));
    window.addEventListener(EVENTO_REFRESH, atualizar); window.addEventListener(EVENTO_DEMO, atualizar); window.addEventListener("gerizo:demo-aviso", mostrar);
    return () => { window.removeEventListener(EVENTO_REFRESH, atualizar); window.removeEventListener(EVENTO_DEMO, atualizar); window.removeEventListener("gerizo:demo-aviso", mostrar); };
  }, []);
  React.useEffect(() => setAviso(""), [pathname]);
  const props = React.useMemo(() => {
    const query = new URLSearchParams(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "");
    const estado = getDemoState();
    const dados = getDemoFixture(pathname, query, estado);
    if (pathname === "/vendas/dia" && !query.has("data") && !query.has("mes")) {
      const termometro = getDemoFixture("/mercado-livre", query, estado).dados as React.ComponentProps<typeof BlocoOperacao>["termometro"];
      const envios = getDemoFixture("/mercado-livre/envios", query, estado).dados as React.ComponentProps<typeof BlocoOperacao>["envios"];
      dados.operacao = <BlocoOperacao termometro={termometro} envios={envios} />;
    }
    return dados;
  }, [pathname, url, versao]);
  const Tela = TELAS[pathname];
  const anunciosExtra = Object.hasOwn(ANUNCIOS_EXTRA_DEMO, pathname);
  const gestaoFinanceira = (ROTAS_GESTAO_FINANCEIRA_DEMO as readonly string[]).includes(pathname);
  async function baixarExemplo() {
    const resposta = await gerizoFetch(pathname === "/promocoes/processar" ? "/api/demo/planilha-promocoes" : "/api/custos/planilha");
    if (!resposta.ok) { setAviso("Não foi possível preparar a planilha do exemplo."); return; }
    const endereco = URL.createObjectURL(await resposta.blob()); const link=document.createElement("a"); link.href=endereco; link.download=pathname === "/promocoes/processar"?"promocoes-atlas-casa.xlsx":"custos-atlas-casa.xlsx"; link.click(); setTimeout(()=>URL.revokeObjectURL(endereco),1000);
  }
  function reiniciar() {
    resetDemoState(); setReinicio(v => v + 1);
    try { sessionStorage.removeItem("gerizo:demo:tour-real:v1"); sessionStorage.removeItem("conversa-atual:demo"); localStorage.removeItem("anotacoes-anuncio:demo"); localStorage.removeItem("recomendacoes-resolvidas:demo"); } catch {}
    navegarDemo("/vendas/dia", true); setAviso("O cenário fictício foi restaurado.");
  }
  function protegerLink(event: React.MouseEvent) {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!anchor || anchor.hasAttribute("data-demo-exit")) return;
    const href = anchor.getAttribute("href") ?? "";
    if (!href || href.startsWith("#") || href.startsWith("blob:") || event.defaultPrevented) return;
    // Protege também âncoras de componentes legados e de portais React.
    if (!href.startsWith(DEMO_PREFIX)) {
      event.preventDefault();
      if (href.startsWith("/api/")) avisarDemo("Use a exportação desta tela para baixar o arquivo do exemplo.");
      else navegarDemo(href);
    }
  }
  return <div className="gerizo-demo-real" onClickCapture={protegerLink}>
    {!apresentacao && <div className="gerizo-demo-ribbon"><span><strong>Loja de exemplo</strong><span>Dados fictícios</span></span><div>{["/promocoes/processar","/financeiro/custos"].includes(pathname)&&<button type="button" onClick={baixarExemplo}>Planilha de exemplo</button>}<button type="button" onClick={reiniciar}><RefreshCw size={14} aria-hidden />Reiniciar</button><a href="/funcionalidades" data-demo-exit>Ver vídeos</a><a href="/conheca?demonstracao=1" data-demo-exit>Pedir acesso</a></div></div>}
    {!apresentacao && <TourReal key={reinicio} pathname={pathname} navegar={navegarDemo} iniciar={iniciarTour || reinicio > 0} />}
    {aviso && <div className="gerizo-demo-notice" role="status"><p>{aviso}</p><button type="button" onClick={() => setAviso("")} aria-label="Fechar aviso"><X size={17} /></button></div>}
    <TelaSegura key={pathname + ":" + versao}>{anunciosExtra ? <AnunciosExtraDemo pathname={pathname} query={new URLSearchParams(url.split("?")[1] ?? "")} estado={getDemoState()} /> : gestaoFinanceira ? <GestaoFinanceiraDemo pathname={pathname} /> : Tela ? <Tela {...props} /> : <div className="gerizo-demo-loading"><h1>Fora deste tour</h1><p>Use o menu para explorar as principais áreas do Gerizo.</p></div>}</TelaSegura>
  </div>;
}

export default DemoRealRenderer;
