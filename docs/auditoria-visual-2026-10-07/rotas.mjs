/**
 * As rotas da auditoria, agrupadas por módulo — o agrupamento vira pasta.
 *
 * Lista única, importada pelas duas passadas de captura (página inteira e
 * dobra), para que não divirjam. As duas rotas com segmento dinâmico
 * (`/relatorio/[chave]` e `/convite/[token]`) estão em
 * `capturar-dinamicas.mjs`, porque precisam de chave real.
 */
export const MODULOS = {
  geral: [
    { rota: "/", nome: "visao-geral" },
    { rota: "/alertas", nome: "alertas" },
    { rota: "/conversa", nome: "conversar" },
    { rota: "/importar", nome: "importar" },
    { rota: "/glossario", nome: "glossario" },
  ],
  planejamento: [{ rota: "/planejamento", nome: "planejamento" }],
  vendas: [
    { rota: "/vendas/canais", nome: "por-canal" },
    { rota: "/vendas/anual", nome: "anual" },
    { rota: "/vendas/dia", nome: "dia" },
    { rota: "/vendas/mtd", nome: "mes-ate-aqui" },
    { rota: "/vendas/semanal", nome: "semanal" },
    { rota: "/vendas/diario", nome: "comparar-periodo" },
    { rota: "/vendas/comparativos", nome: "comparativos" },
    { rota: "/vendas/skus", nome: "analise-de-sku" },
    { rota: "/vendas/cancelamentos", nome: "cancelamentos" },
    { rota: "/vendas/metas", nome: "metas" },
    { rota: "/vendas/lancamentos", nome: "lancamentos" },
  ],
  "mercado-livre": [
    { rota: "/anuncios/analise", nome: "analise-de-anuncios" },
    { rota: "/anuncios/catalogo", nome: "catalogo" },
    { rota: "/anuncios/tipo", nome: "classico-vs-premium" },
    { rota: "/anuncios/preco-ideal", nome: "logica-de-promocao" },
    { rota: "/promocoes/campanhas", nome: "campanhas" },
    { rota: "/promocoes/processar", nome: "processar-planilha" },
    { rota: "/promocoes/historico", nome: "historico" },
  ],
  financeiro: [
    { rota: "/financeiro", nome: "painel" },
    { rota: "/financeiro/custos", nome: "custos" },
    { rota: "/financeiro/categorias", nome: "categorias" },
    { rota: "/financeiro/folha", nome: "folha-de-pagamento" },
    { rota: "/financeiro/fornecedores", nome: "fornecedores" },
    { rota: "/financeiro/contas", nome: "contas-a-pagar" },
  ],
  gestao: [
    { rota: "/empresas", nome: "empresas" },
    { rota: "/integracoes/canais", nome: "canais-e-contas" },
    { rota: "/integracoes", nome: "integracoes" },
    { rota: "/equipe", nome: "equipe" },
    { rota: "/configuracoes", nome: "configuracoes" },
    { rota: "/relatorios/exportacoes", nome: "exportacoes" },
  ],
  "fora-do-menu": [
    { rota: "/anuncios/preco-performance", nome: "performance-de-preco" },
    { rota: "/anuncios/preco-alvo", nome: "preco-alvo" },
    { rota: "/anuncios/trafego-pago", nome: "trafego-pago" },
    { rota: "/promocoes/comparar", nome: "comparar-ofertas" },
    { rota: "/monitoramento/precos", nome: "monitoramento-precos" },
    { rota: "/monitoramento/fretes", nome: "monitoramento-fretes" },
    { rota: "/relatorios/apresentacao", nome: "apresentacao" },
  ],
  entrada: [
    { rota: "/entrar", nome: "entrar", semSessao: true },
    { rota: "/cadastro", nome: "cadastro", semSessao: true },
    { rota: "/comecar", nome: "comecar", semSessao: true },
  ],
};
