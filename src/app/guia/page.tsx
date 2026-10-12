import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { Panel } from "@/components/ui/primitives";
import { Disclosure } from "@/components/ui/disclosure";

const grupos = [
  { nome: "Comece por aqui", telas: [
    ["Visão geral", "/", "Ver como a operação está no período.", "Receita, pedidos, cancelamentos e diferença contra o período anterior. Confira empresa e datas antes de comparar."],
    ["Tráfego pago", "/anuncios/trafego-pago", "Entender quanto a publicidade consome das vendas.", "Escolha a conta. O gráfico usa as datas do filtro; anúncios e campanhas usam o relatório selecionado. Veja TACoS, ACoS e gasto sem venda atribuída. Receita atribuída pode incluir outro produto; margem depende de custos cadastrados."],
    ["Por que caiu", "/vendas/queda", "Encontrar produtos e anúncios que merecem investigação.", "Comece pelo impacto em receita. Abra o SKU, depois Canais e anúncios. Queda de visitas e de conversão são pistas; preço e disponibilidade precisam de evidência no mesmo período."],
    ["Estoques e origens", "/integracoes/estoques", "Conferir onde cada saldo foi informado.", "Busque o SKU. Compare Full, depósito do vendedor e ERP com nome e data da leitura. Zero é saldo informado; traço é ausência de informação. Canal e ERP podem espelhar as mesmas unidades."],
  ] },
  { nome: "Planejamento e rotina", telas: [
    ["Calendário e campanhas", "/planejamento", "Organizar ações por data, produto e canal.", "Defina responsável, objetivo, prazo e produtos. Banner, CRM, cupom e promoção podem ser planejados juntos. Planejar aqui não publica a ação no canal."],
    ["Resultados", "/planejamento/resultados", "Acompanhar vendas durante as ações planejadas.", "Compare produtos da ação, canal e período. Uma melhora durante a campanha não prova que ela causou o resultado."],
    ["Conversar", "/conversa", "Investigar os dados com ajuda da IA.", "Informe canal, conta, datas e a pergunta. Confira os números citados e a cobertura das fontes antes de decidir."],
    ["Alertas", "/alertas", "Priorizar mudanças que pedem atenção.", "Abra o contexto de cada alerta. Ausência de dado pode parecer queda; confira a atualização da fonte."],
    ["Importar", "/importar", "Completar histórico ou fontes ainda sem conexão.", "Confira canal e período na prévia. Para dados já medidos por API, use Atualizar. Custos e fontes não conectadas ainda podem precisar de arquivos."],
  ] },
  { nome: "Vendas", telas: [
    ["Por canal", "/vendas/canais", "Comparar a participação de cada canal.", "Veja quem ganhou ou perdeu receita e pedidos. Abra a conta quando um canal tiver mais de uma loja."],
    ["Anual", "/vendas/anual", "Encontrar tendência e sazonalidade.", "Compare meses completos. Mês em andamento não é diretamente comparável a um mês fechado."],
    ["Dia", "/vendas/dia", "Acompanhar a operação diária.", "Confira receita, pedidos e visitas. O dia de hoje está incompleto e depende da última coleta."],
    ["Mês até aqui", "/vendas/mtd", "Medir o andamento do mês.", "Compare a mesma quantidade de dias e veja a distância para a meta."],
    ["Semanal", "/vendas/semanal", "Identificar mudanças de ritmo.", "Compare semanas e canais. Visitas, pedidos e conversão ajudam a separar demanda de oferta."],
    ["Comparar período", "/vendas/diario", "Comparar dois intervalos escolhidos.", "Use períodos de duração semelhante. Campanhas, feriados e dias da semana mudam a leitura."],
    ["Comparativos", "/vendas/comparativos", "Comparar o desempenho entre recortes.", "Comece pelo canal e pela variação de receita; depois confira pedidos e ticket médio."],
    ["Análise de SKU", "/vendas/skus", "Encontrar os produtos que sustentam o resultado.", "Veja receita, quantidade e concentração. Um SKU pode ter vários anúncios e contas."],
    ["Cancelamentos", "/vendas/cancelamentos", "Medir vendas que não se concretizaram.", "Veja valor e taxa por canal. A VTEX distingue tentativa sem pagamento de venda autorizada cancelada."],
    ["Metas", "/vendas/metas", "Acompanhar objetivo e ritmo necessário.", "Mantenha as metas atualizadas por canal. Meta é decisão da empresa, não um número recebido pela API."],
    ["Lançamentos", "/vendas/lancamentos", "Preencher métricas sem fonte automática.", "Campos automáticos ficam protegidos. Atualize a conexão para corrigir dados de API; digite apenas o que não tem integração."],
  ] },
  { nome: "Mercado Livre", telas: [
    ["Análise de anúncios", "/anuncios/analise", "Comparar a performance dos anúncios.", "Visitas, vendas e conversão mostram onde investigar. Compare anúncios da mesma conta e intervalo."],
    ["Catálogo", "/anuncios/catalogo", "Consultar a carteira de anúncios.", "Busque SKU ou MLB e confira status, preço e vínculo. Para disponibilidade por depósito, abra Estoques e origens."],
    ["Clássico vs Premium", "/anuncios/tipo", "Comparar os formatos de anúncio.", "Considere tarifa, receita e conversão. Mix de produtos diferente pode explicar a diferença entre formatos."],
    ["Lógica de promoção", "/anuncios/preco-ideal", "Conferir preço, desconto e limite de margem.", "Valide custo, tarifa e frete antes de usar uma sugestão. Dados ausentes impedem afirmar rentabilidade."],
    ["Campanhas", "/promocoes/campanhas", "Consultar promoções e produtos participantes.", "Veja conta, vigência, preço e condição de cada oferta. Este cadastro é diferente do calendário de ações planejadas."],
    ["Processar planilha", "/promocoes/processar", "Preparar arquivos de promoções.", "Revise conta, produtos e preços antes de usar o arquivo no canal."],
    ["Histórico", "/promocoes/historico", "Consultar processamentos anteriores de promoções.", "Confira data, arquivo e regras usadas para entender de onde veio uma proposta."],
  ] },
  { nome: "Financeiro", telas: [
    ["Painel", "/financeiro", "Acompanhar os componentes financeiros da operação.", "Confira cobertura de custos, tarifas, fretes e despesas. Margem de contribuição não equivale a lucro contábil."],
    ["Custos", "/financeiro/custos", "Manter o custo dos produtos.", "Priorize SKUs com venda e sem custo. Custo incompleto limita a análise de mídia e promoções."],
    ["Categorias", "/financeiro/categorias", "Organizar receitas e despesas.", "Use categorias consistentes para comparar meses sem mudar o significado dos totais."],
    ["Folha de pagamento", "/financeiro/folha", "Registrar gastos com a equipe.", "Confira competência e valores. Este cadastro não é abastecido pelas APIs de marketplace."],
    ["Fornecedores", "/financeiro/fornecedores", "Organizar fornecedores e seus vínculos.", "Mantenha identificação e cadastros sem duplicidade."],
    ["Contas a pagar", "/financeiro/contas", "Acompanhar compromissos financeiros.", "Confira vencimento, situação e categoria. Não confunda pedido vendido com dinheiro recebido."],
  ] },
  { nome: "Dados e administração", telas: [
    ["Exportações", "/relatorios/exportacoes", "Levar os dados para análise ou apresentação.", "Confira empresa, filtro e período antes de exportar."],
    ["Empresas", "/empresas", "Escolher e organizar as operações.", "Confira a empresa ativa antes de analisar ou atualizar dados."],
    ["Canais e contas", "/integracoes/canais", "Conectar as fontes de cada empresa.", "Autorize a conta correta. No Bling, confira o vínculo das lojas com os canais. Uma conexão de pedidos não significa conexão de visitas ou publicidade."],
    ["Fontes de dados", "/integracoes", "Conferir origem, cobertura e atualização.", "Use o mapa por conta para distinguir vendas, visitas, mídia e estoque. Histórico importado permanece identificado; fonte conectada não garante que toda coleta terminou."],
    ["Equipe", "/equipe", "Administrar acessos à operação.", "Confira empresa e papel de cada pessoa antes de convidar."],
    ["Glossário", "/glossario", "Consultar o significado das métricas.", "Use ao comparar receita, margem, conversão, ACoS, TACoS e ROAS."],
    ["Configurações", "/configuracoes", "Ajustar as preferências disponíveis.", "Revise os padrões usados pela empresa e pelo seu acesso."],
  ] },
];

export default function Guia() {
  return <>
    <PageHeader title="Guia das telas" description="O que olhar, onde investigar e como decidir." />
    <PageBody>
      <Panel className="p-5">
        <h2 className="text-sm font-semibold text-ink">Uma rotina de cinco minutos</h2>
        <ol className="mt-3 grid gap-3 text-sm text-ink-2 md:grid-cols-3">
          <li><strong className="text-brand">1. Resultado.</strong> Abra Visão geral e Por canal. Onde mudou?</li>
          <li><strong className="text-brand">2. Motivo.</strong> Abra Por que caiu e o SKU. Compare seus anúncios, mídia e disponibilidade.</li>
          <li><strong className="text-brand">3. Ação.</strong> Registre o que fará no Planejamento e volte em Resultados para acompanhar.</li>
        </ol>
        <p className="mt-4 text-xs text-ink-3">Se um número parecer estranho, confira primeiro empresa, conta, período e Fontes de dados.</p>
      </Panel>
      {grupos.map((g) => <section key={g.nome} className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">{g.nome}</h2>
        <div className="grid gap-3 lg:grid-cols-2">{g.telas.map(([nome, href, uso, olhar]) => <Panel key={href} className="p-4">
          <Link href={href} className="flex items-center justify-between gap-3 text-sm font-semibold text-ink hover:text-brand">{nome}<ArrowUpRight size={16} className="shrink-0 text-brand" /></Link>
          <p className="mt-2 text-sm text-ink-2">{uso}</p>
          <Disclosure title="O que olhar"><p>{olhar}</p></Disclosure>
        </Panel>)}</div>
      </section>)}
      <Disclosure title="O que ainda vale evoluir">
        <p>Prioridade: completar custos dos SKUs, conectar visitas da loja e mídia dos canais ainda sem API, e acompanhar a cobertura de cada fonte. Depois, comparar ações semelhantes no Planejamento e guardar o aprendizado.</p>
        <p className="mt-2">Telas com funções próximas podem ser reunidas depois da sua avaliação: Dia e Comparar período; Semanal e Comparativos. Nenhuma foi removida nesta revisão.</p>
      </Disclosure>
    </PageBody>
  </>;
}
