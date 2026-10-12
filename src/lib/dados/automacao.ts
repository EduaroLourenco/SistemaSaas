import "server-only";
import { carregarCanais } from "./canais";

export type CamposAutomaticos = { vendas: string | null; visitas: string | null; ads: string | null };
/** Capacidade da conexão, por conta e métrica. Não confunde ERP com API nativa. */
export async function carregarAutomacao() {
  const d = await carregarCanais();
  const lojasErp = new Set(d.erp?.conectado ? Object.values(d.erp.lojas) : []);
  const porConta: Record<string, CamposAutomaticos> = {};
  for (const c of d.contas) {
    const meli = c.canalCodigo === "mercado_livre" && c.conectada;
    const vtex = c.canalCodigo === "vtex" && c.conectada;
    porConta[c.id] = {
      vendas: meli ? "Mercado Livre" : vtex ? "VTEX" : lojasErp.has(c.id) ? "Bling" : null,
      visitas: meli ? "Mercado Livre" : c.ga4?.conectada && c.ga4.propriedade ? "GA4" : null,
      // GA4 só confirma mídia quando o banco recebeu essa métrica; estar
      // conectado ao Analytics não prova que o Google Ads esteja vinculado.
      ads: meli ? "Mercado Ads" : null,
    };
  }
  return porConta;
}
