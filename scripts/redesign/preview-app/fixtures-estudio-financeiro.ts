import type { ComponentProps } from "react";
import type Financeiro from "@/app/financeiro/financeiro-cliente";
import type Custos from "@/app/financeiro/custos/custos-cliente";
import type { Categoria, Fornecedor, Funcionario, Conta } from "@/lib/dados/financeiro";
import type { Resultado, LinhaMargem } from "@/lib/dados/margem";
import type { DadosResultados } from "@/lib/dados/planejamento-resultados";
import { novoItem, type Dados, type Item } from "@/lib/planejamento/modelo";

// Todas as empresas, pessoas, produtos e valores desta fonte são sintéticos.
export const HOJE_ESTUDIO = "2026-11-17";
const tituloProduto = "Colchão de demonstração casal com molas ensacadas e camada de conforto 138 × 188 × 30 cm";
const item = (id: string, titulo: string, inicio: string, fim: string, natureza: Item["natureza"], status: Item["status"] = "Planejada", pai: string | null = null): Item => ({
  ...novoItem(inicio, natureza), id, titulo, inicio, fim, natureza, status, campanha_id: pai, operacao_id: "fixture-demo", atualizado_em: "2026-11-17T12:00:00Z", revisao: 1,
  cor: "#7045d1", canais: ["fixture-meli"], skus: natureza === "acao" ? ["DEMO-138"] : [],
  detalhes: { ...novoItem(inicio).detalhes, objetivo: "Organizar a execução e conferir o resultado registrado.", responsavel: "Equipe demonstração", checklist: [{ texto: "Conferir preços e estoque", feito: true }, { texto: "Revisar criativos", feito: false }] },
});
export const PLANEJAMENTO_FIXTURE: Dados = {
  operacao: "fixture-demo", empresa: "Loja demonstração · fixture", pronto: true, avisos: [],
  itens: [
    item("campanha-black", "Novembro · Casa em foco", "2026-11-10", "2026-11-30", "campanha", "Em andamento"),
    item("campanha-dez", "Dezembro · Renovação do quarto", "2026-12-01", "2026-12-20", "campanha"),
    item("acao-hoje", "Revisar anúncios e campanha de mídia", "2026-11-16", "2026-11-18", "acao", "Em andamento", "campanha-black"),
    item("acao-preparar", "Preparar a vitrine de produtos da campanha", "2026-11-18", "2026-11-20", "acao", "Planejada", "campanha-black"),
    item("acao-atrasada", "Conferir a cobertura dos custos antes da oferta", "2026-11-12", "2026-11-15", "acao", "Planejada", "campanha-black"),
    item("acao-feita", "Validar os produtos e o estoque disponível", "2026-11-10", "2026-11-13", "acao", "Concluída", "campanha-black"),
    item("acao-solta", "Revisar os resultados da semana", "2026-11-17", "2026-11-17", "acao"),
  ],
  grupos: [{ id: "grupo-casa", operacao_id: "fixture-demo", nome: "Produtos da campanha", skus: ["DEMO-138", "DEMO-158"], revisao: 1 }],
  tipos: [{ id: "tipo-banner", operacao_id: "fixture-demo", nome: "Banner", cor: "#7045d1", revisao: 1 }],
  produtos: [{ sku: "DEMO-138", titulo: tituloProduto, origem: "produto", curva: "A", receita90: 78200, unidades90: 86, preco: 1249, precoOrigem: "anuncio", estoque: 42, temCusto: true }, { sku: "DEMO-158", titulo: "Colchão queen de demonstração com espuma de conforto 158 × 198 cm", origem: "produto", curva: "B", receita90: 38600, unidades90: 24, preco: 1799, estoque: 18, temCusto: false }],
  anuncios: [{ id: "anuncio-demo", codigo: "MLBDEMO138", titulo: tituloProduto, sku: "DEMO-138", canal: "Mercado Livre", conta: "Conta demonstração", tipo: "Clássico" }],
  canais: [{ id: "fixture-meli", nome: "Mercado Livre" }, { id: "fixture-shopee", nome: "Shopee" }],
  contas: [{ id: "fixture-conta", nome: "Conta demonstração", canal_id: "fixture-meli" }], promocoes: [],
};

export const RESULTADO_FINANCEIRO: Resultado = {
  inicio: "2026-09-01", fim: "2026-11-17", receitaBruta: 125000, cancelamentos: 5000, receitaLiquida: 120000,
  comissao: 12000, frete: 6000, juros: 0, impostos: 7200, embalagem: 2000, mercadoria: 48000,
  margemContribuicao: 44800, margemPct: 37.3333, ads: 9000, fixaRecorrente: 12000, variavelRecorrente: 1500, variavelAvulsa: 700,
  resultado: 21600, resultadoPct: 18, cobertura: 100, receitaSemCusto: 0,
  cadaCoberturaDe: { comissaoPraticada: 86, fretePraticado: 86, jurosInformado: 86, pedidos: 86 },
};
const margem = (chave: string, rotulo: string, fator: number): LinhaMargem => ({ chave, rotulo, ordem: chave, unidades: Math.round(86 * fator), receita: 120000 * fator, receitaApurada: 120000 * fator, comissao: 12000 * fator, frete: 6000 * fator, juros: 0, impostos: 7200 * fator, embalagem: 2000 * fator, mercadoria: 48000 * fator, margem: 44800 * fator, margemPct: 37.3333, cobertura: 100, receitaMedida: 120000 * fator });
const financeiroMes = (inicio: string, fim: string, fator: number): Resultado => ({ ...RESULTADO_FINANCEIRO, inicio, fim, ...Object.fromEntries((["receitaBruta", "cancelamentos", "receitaLiquida", "comissao", "frete", "juros", "impostos", "embalagem", "mercadoria", "margemContribuicao", "ads", "fixaRecorrente", "variavelRecorrente", "variavelAvulsa", "resultado"] as const).map(campo => [campo, (RESULTADO_FINANCEIRO[campo] ?? 0) * fator])) });
export const FINANCEIRO_PROPS = {
  resultado: RESULTADO_FINANCEIRO, mensal: [
    financeiroMes("2026-09-01", "2026-09-30", .3),
    financeiroMes("2026-10-01", "2026-10-31", .4),
    financeiroMes("2026-11-01", "2026-11-17", .3),
  ],
  visoes: { mes: [margem("2026-09", "Setembro de 2026", .3), margem("2026-10", "Outubro de 2026", .4), margem("2026-11", "Novembro de 2026", .3)], semana: [margem("2026-11-09", "09/11 a 15/11", 1)], canal: [margem("fixture-meli", "Mercado Livre", .7), margem("fixture-shopee", "Shopee", .3)], conta: [margem("fixture-conta", "Conta demonstração", 1)], sku: [margem("DEMO-138", tituloProduto, .7), margem("DEMO-158", "Colchão queen de demonstração", .3)], anuncio: [margem("MLBDEMO138", tituloProduto, 1)] },
  opcoes: [{ opcoes: [{ valor: "", rotulo: "Todos os canais" }] }, { rotulo: "Canais", opcoes: [{ valor: "fixture-meli", rotulo: "Mercado Livre" }, { valor: "fixture-shopee", rotulo: "Shopee" }] }],
  inicio: "2026-09-01", fim: "2026-11-17", canalId: "",
} satisfies ComponentProps<typeof Financeiro>;

const custo = { tabela: 12, praticado: 10, origem: "praticado" as const, valor: 10 };
export const CUSTOS_PROPS = {
  linhas: [
    { produtoId: "produto-demo-138", sku: "DEMO-138", titulo: tituloProduto, anuncios: 2, unidades: 86, receita: 78200, precoMedio: 909.3, comissao: custo, comissaoCanal: 12, frete: { ...custo, tabela: 49, praticado: 46, valor: 46 }, jurosUnidade: 0, custoMercadoria: 420, embalagem: 12, aliquotaImpostos: 6, pesoKg: 26, margemMinimaPct: 18, ads: null, margemUnidade: 285.82, margemPct: 31.43, faltando: [] },
    { produtoId: "produto-demo-158", sku: "DEMO-158", titulo: "Colchão queen de demonstração com espuma de conforto 158 × 198 cm", anuncios: 1, unidades: 24, receita: 38600, precoMedio: 1608.33, comissao: custo, comissaoCanal: 12, frete: { ...custo, tabela: 72, praticado: 68, valor: 68 }, jurosUnidade: 0, custoMercadoria: null, embalagem: 18, aliquotaImpostos: 6, pesoKg: 34, margemMinimaPct: null, ads: null, margemUnidade: null, margemPct: null, faltando: ["mercadoria"] },
  ], faixas: [{ id: "faixa-demo", canalId: null, canalNome: null, pesoMin: 0, pesoMax: 30, valor: 49, vigenciaInicio: "2026-09-01" }], completos: 1,
  despesas: [{ id: "despesa-demo", canalId: "fixture-meli", canalNome: "Mercado Livre", natureza: "fixa_recorrente" as const, descricao: "Mensalidade de demonstração", valor: 299, competencia: "2026-11-01" }],
  canais: [{ id: "fixture-meli", nome: "Mercado Livre" }, { id: "fixture-shopee", nome: "Shopee" }], opcoes: FINANCEIRO_PROPS.opcoes, adsPorMes: [{ competencia: "2026-11-01", canalNome: "Mercado Livre", valor: 9000 }], inicio: "2026-09-01", fim: "2026-11-17", canalId: "", margemConfiguravel: true,
} satisfies ComponentProps<typeof Custos>;

export const CATEGORIAS_FIXTURE: Categoria[] = [
  { id: "cat-mercadoria", nome: "Mercadoria", tipo: "saida", grupo: "Custos da venda", variavel: true, ordem: 10, descricao: "Custo de aquisição dos produtos", ativa: true, corSerie: 1 },
  { id: "cat-estrutura", nome: "Estrutura e serviços", tipo: "saida", grupo: "Custos da operação", variavel: false, ordem: 20, descricao: "Despesas fixas da operação", ativa: true, corSerie: 2 },
  { id: "cat-pessoal", nome: "Pessoal", tipo: "saida", grupo: "Equipe", variavel: false, ordem: 30, descricao: "Remuneração da equipe", ativa: true, corSerie: 3 },
];
export const FORNECEDORES_FIXTURE: Fornecedor[] = [{ id: "fornecedor-demo", razaoSocial: "Fornecedor de demonstração Ltda.", nomeFantasia: "Fornecedor demonstração", cnpj: "12345678000199", categoriaId: "cat-estrutura", contatoNome: "Contato demonstração", contatoEmail: "contato@example.test", contatoTelefone: "(11) 0000-0000", condicaoPagamento: "30 dias", diaVencimento: 20, observacao: "Registro sintético para verificar os campos do formulário.", ativo: true, totalLancado: 2400, contasAbertas: 2 }];
export const FUNCIONARIOS_FIXTURE: Funcionario[] = [{ id: "pessoa-demo", nome: "Pessoa de demonstração", cargo: "Operação", setor: "Comercial", admissao: "2026-02-01", demissao: null, salarioBase: 3800, salarioLiquido: 3400, beneficios: 600, encargos: 1100, diaPagamento: 5, periodicidade: "mensal", categoriaId: "cat-pessoal", observacao: "Registro sintético, sem dados pessoais reais.", ativo: true, custoMensal: 5500 }];
export const CONTAS_FIXTURE: Conta[] = [{ id: "conta-demo", tipo: "saida", categoriaId: "cat-estrutura", fornecedorId: "fornecedor-demo", funcionarioId: null, canalId: "fixture-meli", descricao: "Serviços e estrutura da operação · demonstração", documento: "DEMO-001", valor: 1200, competencia: "2026-11-01", vencimento: "2026-11-20", pagamento: null, status: "em_aberto", formaPagamento: "Boleto", periodicidade: "mensal", recorrenciaFim: "2027-01-01", origemRecorrenciaId: null, observacao: "Lançamento sintético para revisão visual." }];

const resumo = (inicio: string, fim: string, receita: number) => ({ inicio, fim, receita, pedidos: 24, unidades: 28, cancelados: 0, excluidos: 0, encontrados: 24, ultimoRegistro: fim });
export const RESULTADOS_FIXTURE: DadosResultados = {
  aviso: null,
  linhas: [{ id: "resultado-demo", titulo: "Novembro · Produtos em foco", natureza: "acao", inicio: "2026-11-01", fim: "2026-11-14", anteriorInicio: "2026-10-18", anteriorFim: "2026-10-31", skus: 1, parcial: false,
    feito: { tipo: "Vitrine / Minha Página", status: "Concluída", etapa: "Pós-campanha", ideia: "Organizar a seleção de produtos.", foco: "Produtos da campanha", hipotese: "Conferir a variação da receita contra o período anterior e o restante do canal.", canais: ["Mercado Livre"], responsavel: "Equipe demonstração", orcamento: 1200, meta: "Acompanhar receita e unidades", checklist: [{ texto: "Conferir estoque", feito: true }], fechamento: { funcionou: "Execução concluída no prazo.", problemas: "Nenhum registro de demonstração.", proximoPasso: "Revisar a próxima campanha." } },
    atual: resumo("2026-11-01", "2026-11-14", 24000), anterior: resumo("2026-10-18", "2026-10-31", 18000), restoAtual: 82000, restoAnterior: 80000, crescimento: 33.333, crescimentoResto: 2.5, efeito: 30.833, veredito: "deu certo", leitura: "A receita cresceu mais que a do restante do canal nesta comparação sintética.", produtosSaoDoCanal: false,
    produtos: [{ chave: "DEMO-138", titulo: tituloProduto, sku: "DEMO-138", antes: { receita: 18000, unidades: 20, preco: 900, visitas: 800, conversao: 2.5 }, agora: { receita: 24000, unidades: 28, preco: 857.14, visitas: 1000, conversao: 2.8 } }],
    serie: Array.from({ length: 28 }, (_, i) => ({ data: new Date(Date.UTC(2026, 9, 18 + i)).toISOString().slice(0, 10), acao: 700 + i * 20, resto: 3100 + i * 15 })),
  }],
  promocoes: [{ id: "promo-demo", nome: "Campanha de demonstração", processadaEm: "2026-11-01T12:00:00Z", comReducao: true, dias: 14, participam: 12, fora: 4, controle: "fora da campanha", receitaParticipantes: { antes: 18000, agora: 24000 }, receitaFora: { antes: 8000, agora: 8200 }, crescimento: 33.333, crescimentoFora: 2.5, efeito: 30.833, veredito: "deu certo", leitura: "Comparação sintética entre participantes e itens fora da mesma campanha.", anuncios: [{ codigo: "MLBDEMO138", titulo: tituloProduto, precoOferta: 857.14, precoTabela: 900, antes: 18000, agora: 24000, unidadesAgora: 28 }] }],
};
