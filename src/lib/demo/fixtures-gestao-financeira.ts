import type { Categoria, Conta, FolhaLinha, Fornecedor, Funcionario } from "@/lib/dados/financeiro";
import type { DespesaCanal } from "@/lib/dados/custos";
import { canaisDemo } from "./fixtures-base";
import { getDemoState, type DemoState } from "./store";

export type RecursoGestaoFinanceiraDemo = "categorias" | "fornecedores" | "funcionarios" | "contas" | "folha";
export type RegistroGestaoFinanceiraDemo = Record<string, unknown> & { id: string };
type EstadoGestao = DemoState & { cadastros?: Record<string, unknown[]> };

const CAT_ESTRUTURA = "d7100000-0000-4000-8000-000000000001";
const CAT_PESSOAL = "d7100000-0000-4000-8000-000000000002";
const CAT_COMERCIAL = "d7100000-0000-4000-8000-000000000003";
const CAT_RECEITA = "d7100000-0000-4000-8000-000000000004";
const FORN_ESPACO = "d7200000-0000-4000-8000-000000000001";
const FORN_APOIO = "d7200000-0000-4000-8000-000000000002";
const FORN_CAMPANHA = "d7200000-0000-4000-8000-000000000003";
const PESSOA = "d7300000-0000-4000-8000-000000000001";

const categorias: Categoria[] = [
  { id: CAT_ESTRUTURA, nome: "Estrutura", tipo: "saida", grupo: "Operação", variavel: false, ordem: 30, descricao: "Custos de estrutura do cenário fictício.", ativa: true, corSerie: 1 },
  { id: CAT_PESSOAL, nome: "Equipe", tipo: "saida", grupo: "Pessoal", variavel: false, ordem: 40, descricao: "Remuneração e custos da equipe do exemplo.", ativa: true, corSerie: 2 },
  { id: CAT_COMERCIAL, nome: "Ações comerciais", tipo: "saida", grupo: "Comercial", variavel: false, ordem: 50, descricao: "Compromissos administrativos da campanha.", ativa: true, corSerie: 3 },
  { id: CAT_RECEITA, nome: "Outras entradas", tipo: "entrada", grupo: "Receitas", variavel: false, ordem: 10, descricao: "Entradas cadastradas manualmente no exemplo.", ativa: true, corSerie: 4 },
];
const fornecedores: Fornecedor[] = [
  { id: FORN_ESPACO, razaoSocial: "Espaço da operação (exemplo)", nomeFantasia: "Espaço da operação", cnpj: null, categoriaId: CAT_ESTRUTURA, contatoNome: null, contatoEmail: null, contatoTelefone: null, condicaoPagamento: "Mensal", diaVencimento: 20, observacao: "Fornecedor fictício da demonstração.", ativo: true, totalLancado: 2400, contasAbertas: 1 },
  { id: FORN_APOIO, razaoSocial: "Apoio comercial (exemplo)", nomeFantasia: "Apoio comercial", cnpj: null, categoriaId: CAT_COMERCIAL, contatoNome: null, contatoEmail: null, contatoTelefone: null, condicaoPagamento: "Mensal", diaVencimento: 15, observacao: "Serviço fictício para demonstrar classificação e vencimento.", ativo: true, totalLancado: 650, contasAbertas: 1 },
  { id: FORN_CAMPANHA, razaoSocial: "Estúdio da campanha (exemplo)", nomeFantasia: "Estúdio da campanha", cnpj: null, categoriaId: CAT_COMERCIAL, contatoNome: null, contatoEmail: null, contatoTelefone: null, condicaoPagamento: "Após entrega", diaVencimento: 25, observacao: "Produção fictícia da campanha de novembro.", ativo: true, totalLancado: 900, contasAbertas: 1 },
];
const funcionarios: Funcionario[] = [
  { id: PESSOA, nome: "Pessoa da equipe (exemplo)", cargo: "Operação", setor: "Expedição", admissao: "2026-10-05", demissao: null, salarioBase: 1800, salarioLiquido: 1700, beneficios: 300, encargos: 300, diaPagamento: 5, periodicidade: "mensal", categoriaId: CAT_PESSOAL, observacao: "Valores fictícios; o cadastro não representa processamento bancário ou legal de folha.", ativo: true, custoMensal: 2400 },
];
const contaBase = { tipo: "saida" as const, documento: null, formaPagamento: null, recorrenciaFim: null, origemRecorrenciaId: null, observacao: "Lançamento fictício da demonstração.", competencia: "2026-11-01", pagamento: null, funcionarioId: null, canalId: null };
const contas: Conta[] = [
  { ...contaBase, id: "d7400000-0000-4000-8000-000000000001", categoriaId: CAT_ESTRUTURA, fornecedorId: FORN_ESPACO, descricao: "Infraestrutura da operação", valor: 2400, vencimento: "2026-11-20", status: "em_aberto", periodicidade: "mensal" },
  { ...contaBase, id: "d7400000-0000-4000-8000-000000000002", categoriaId: CAT_PESSOAL, fornecedorId: null, funcionarioId: PESSOA, descricao: "Equipe — novembro", valor: 2400, vencimento: "2026-11-05", pagamento: "2026-11-05", status: "pago", formaPagamento: "Exemplo", periodicidade: "mensal" },
  { ...contaBase, id: "d7400000-0000-4000-8000-000000000003", categoriaId: CAT_COMERCIAL, fornecedorId: FORN_APOIO, canalId: canaisDemo[0].id, descricao: "Apoio à operação comercial", valor: 650, vencimento: "2026-11-15", status: "atrasado", periodicidade: "mensal" },
  { ...contaBase, id: "d7400000-0000-4000-8000-000000000004", categoriaId: CAT_COMERCIAL, fornecedorId: FORN_CAMPANHA, descricao: "Produção da campanha de novembro", valor: 900, vencimento: "2026-11-25", status: "em_aberto", periodicidade: "unica" },
];
const folha: FolhaLinha[] = ["2026-10-01", "2026-11-01"].map((competencia, i) => ({ id: `d7500000-0000-4000-8000-00000000000${i + 1}`, funcionarioId: PESSOA, competencia, salarioBase: 1800, salarioLiquido: 1700, beneficios: 300, encargos: 300, descontos: 100, custoTotal: 2400, vencimento: competencia.slice(0, 8) + "05", pagamento: competencia.slice(0, 8) + "05", status: "pago", observacao: "Competência fictícia já lançada no cenário." }));

const BASE: Record<RecursoGestaoFinanceiraDemo, readonly { id: string }[]> = { categorias, fornecedores, funcionarios, contas, folha };

export function registrosGestaoFinanceiraDemo(recurso: RecursoGestaoFinanceiraDemo, estado: EstadoGestao = getDemoState()): RegistroGestaoFinanceiraDemo[] {
  const linhas = estado.cadastros?.[recurso] ?? BASE[recurso];
  return structuredClone(linhas) as RegistroGestaoFinanceiraDemo[];
}

export function contextoGestaoFinanceiraDemo(estado: EstadoGestao = getDemoState()) {
  const contasAtuais = registrosGestaoFinanceiraDemo("contas", estado) as unknown as Conta[];
  const categoriasAtuais = (registrosGestaoFinanceiraDemo("categorias", estado) as unknown as Categoria[]).sort((a,b)=>a.ordem-b.ordem || a.nome.localeCompare(b.nome,"pt-BR"));
  const fornecedoresAtuais = (registrosGestaoFinanceiraDemo("fornecedores", estado) as unknown as Fornecedor[]).map(f=>{
    const vinculadas=contasAtuais.filter(c=>c.fornecedorId===f.id);
    return {...f,totalLancado:vinculadas.reduce((s,c)=>s+c.valor,0),contasAbertas:vinculadas.filter(c=>["em_aberto","atrasado"].includes(c.status)).length};
  }).sort((a,b)=>a.razaoSocial.localeCompare(b.razaoSocial,"pt-BR"));
  const funcionariosAtuais = (registrosGestaoFinanceiraDemo("funcionarios", estado) as unknown as Funcionario[]).map(f=>({...f,custoMensal:f.salarioBase+f.beneficios+f.encargos})).sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  return { categorias:categoriasAtuais, fornecedores:fornecedoresAtuais, funcionarios:funcionariosAtuais, contas:contasAtuais, folha:registrosGestaoFinanceiraDemo("folha",estado) as unknown as FolhaLinha[] };
}

export const ROTAS_GESTAO_FINANCEIRA_DEMO = ["/financeiro/categorias", "/financeiro/fornecedores", "/financeiro/folha", "/financeiro/contas"] as const;

export function getGestaoFinanceiraFixture(pathname: string, estado: EstadoGestao = getDemoState()): Record<string, unknown> | null {
  const c = contextoGestaoFinanceiraDemo(estado);
  switch(pathname) {
    case "/financeiro/categorias": return { linhas:c.categorias };
    case "/financeiro/fornecedores": return { linhas:c.fornecedores,categorias:c.categorias,faltaMigracao:null };
    case "/financeiro/folha": return { linhas:c.funcionarios,categorias:c.categorias,folha:c.folha,faltaMigracao:null };
    case "/financeiro/contas": return { linhas:c.contas,categorias:c.categorias,fornecedores:c.fornecedores.map(f=>({id:f.id,nome:f.razaoSocial})),funcionarios:c.funcionarios.map(f=>({id:f.id,nome:f.nome})),canais:canaisDemo.map(c=>({id:c.id,nome:c.nome})),faltaMigracao:null };
    default: return null;
  }
}

/** Opcional para a fábrica da DRE: substitui os compromissos iniciais, sem somar duas vezes. */
export function despesasGestaoFinanceiraDemo(estado: EstadoGestao = getDemoState()): DespesaCanal[] {
  const c=contextoGestaoFinanceiraDemo(estado);
  return c.contas.filter(l=>l.tipo==="saida" && ["pago","em_aberto","atrasado"].includes(l.status)).map(l=>({id:l.id,canalId:l.canalId,canalNome:canaisDemo.find(c=>c.id===l.canalId)?.nome??null,natureza:l.periodicidade==="unica"?"variavel_avulsa":l.categoriaId===CAT_COMERCIAL?"variavel_recorrente":"fixa_recorrente",descricao:l.descricao,valor:l.valor,competencia:l.competencia}));
}
