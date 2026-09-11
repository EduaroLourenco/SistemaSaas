import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";

/**
 * Leitura dos cadastros do financeiro.
 *
 * Quatro telas, uma consulta cada, mas o mesmo shape — e a lista de
 * categorias vai junto em todas, porque toda tela precisa dela no
 * formulário. Buscá-la de novo em cada componente seria a forma mais
 * rápida de duas telas discordarem sobre quais categorias existem.
 *
 * Erro de coluna ausente não derruba a página: enquanto a migração
 * `17_financeiro.sql` não roda, a tela abre e diz o que fazer. Uma tela
 * que estoura em branco não ensina nada a ninguém.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

export type Categoria = {
  id: string;
  nome: string;
  tipo: "entrada" | "saida";
  grupo: string | null;
  variavel: boolean;
  ordem: number;
  descricao: string | null;
  ativa: boolean;
  corSerie: number | null;
};

export type Fornecedor = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  categoriaId: string | null;
  contatoNome: string | null;
  contatoEmail: string | null;
  contatoTelefone: string | null;
  condicaoPagamento: string | null;
  diaVencimento: number | null;
  observacao: string | null;
  ativo: boolean;
  /** Quanto já foi lançado para este fornecedor. */
  totalLancado: number;
  contasAbertas: number;
};

export type Funcionario = {
  id: string;
  nome: string;
  cargo: string | null;
  setor: string | null;
  admissao: string | null;
  demissao: string | null;
  salarioBase: number;
  salarioLiquido: number | null;
  beneficios: number;
  encargos: number;
  diaPagamento: number | null;
  periodicidade: string;
  categoriaId: string | null;
  observacao: string | null;
  ativo: boolean;
  /** salário + benefícios + encargos: o que a pessoa custa por mês. */
  custoMensal: number;
};

export type Conta = {
  id: string;
  tipo: "entrada" | "saida";
  categoriaId: string | null;
  fornecedorId: string | null;
  funcionarioId: string | null;
  canalId: string | null;
  descricao: string;
  documento: string | null;
  valor: number;
  competencia: string;
  vencimento: string | null;
  pagamento: string | null;
  status: string;
  formaPagamento: string | null;
  periodicidade: string;
  recorrenciaFim: string | null;
  origemRecorrenciaId: string | null;
  observacao: string | null;
};

export type FolhaLinha = {
  id: string;
  funcionarioId: string;
  competencia: string;
  salarioBase: number;
  salarioLiquido: number | null;
  beneficios: number;
  encargos: number;
  descontos: number;
  custoTotal: number;
  vencimento: string | null;
  pagamento: string | null;
  status: string;
  observacao: string | null;
};

/** Quando a migração ainda não rodou, a tela precisa dizer isso. */
export type Base<T> = {
  linhas: T[];
  categorias: Categoria[];
  /** Mensagem de migração pendente, quando for o caso. */
  faltaMigracao: string | null;
};

const MIGRACAO =
  "Algumas colunas ainda não existem no banco. Rode db/17_financeiro.sql no " +
  "Supabase (SQL Editor) para liberar recorrência, salário líquido e datas de " +
  "pagamento.";

/** 42703 = coluna inexistente. É o sintoma de migração não aplicada. */
function ehColunaAusente(e: { code?: string } | null) {
  return e?.code === "42703";
}

export async function carregarCategorias(): Promise<Categoria[]> {
  const sb = await clienteServidor();
  const completo =
    "id,nome,tipo,grupo,variavel,ordem,descricao,ativa,cor_serie";
  let { data, error } = await sb
    .from("categorias_financeiras")
    .select(completo)
    .order("ordem")
    .order("nome");

  // Sem a migração, `variavel`, `ordem` e `descricao` não existem. Lê o
  // que dá, para a tela abrir e explicar.
  if (ehColunaAusente(error)) {
    const r = await sb
      .from("categorias_financeiras")
      .select("id,nome,tipo,grupo,ativa,cor_serie")
      .order("nome");
    data = r.data as never;
    error = r.error;
  }
  if (error) return [];

  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    tipo: (c.tipo as "entrada" | "saida") ?? "saida",
    grupo: (c.grupo as string) ?? null,
    variavel: Boolean(c.variavel),
    ordem: Number(c.ordem ?? 100),
    descricao: (c.descricao as string) ?? null,
    ativa: c.ativa !== false,
    corSerie: c.cor_serie == null ? null : Number(c.cor_serie),
  }));
}

export async function carregarFornecedores(): Promise<Base<Fornecedor>> {
  const sb = await clienteServidor();
  const [categorias, res, contas] = await Promise.all([
    carregarCategorias(),
    sb
      .from("fornecedores")
      .select(
        "id,razao_social,nome_fantasia,cnpj,categoria_id,contato_nome," +
          "contato_email,contato_telefone,condicao_pagamento,dia_vencimento," +
          "observacao,ativo"
      )
      .order("razao_social"),
    sb
      .from("lancamentos_financeiros")
      .select("fornecedor_id,valor,status")
      .not("fornecedor_id", "is", null),
  ]);

  if (res.error) {
    if (ehColunaAusente(res.error)) {
      const basico = await sb
        .from("fornecedores")
        .select(
          "id,razao_social,nome_fantasia,cnpj,contato_nome,contato_email," +
            "contato_telefone,condicao_pagamento,ativo"
        )
        .order("razao_social");
      return {
        linhas: montarFornecedores(basico.data ?? [], contas.data ?? []),
        categorias,
        faltaMigracao: MIGRACAO,
      };
    }
    return { linhas: [], categorias, faltaMigracao: null };
  }

  return {
    linhas: montarFornecedores(res.data ?? [], contas.data ?? []),
    categorias,
    faltaMigracao: null,
  };
}

function montarFornecedores(
  linhas: unknown[],
  contas: unknown[]
): Fornecedor[] {
  const total = new Map<string, { soma: number; abertas: number }>();
  for (const c of contas as Record<string, unknown>[]) {
    const id = c.fornecedor_id as string;
    const g = total.get(id) ?? { soma: 0, abertas: 0 };
    g.soma += n(c.valor);
    if (c.status !== "pago" && c.status !== "cancelado") g.abertas += 1;
    total.set(id, g);
  }

  return (linhas as Record<string, unknown>[]).map((f) => {
    const g = total.get(f.id as string);
    return {
      id: f.id as string,
      razaoSocial: f.razao_social as string,
      nomeFantasia: (f.nome_fantasia as string) ?? null,
      cnpj: (f.cnpj as string) ?? null,
      categoriaId: (f.categoria_id as string) ?? null,
      contatoNome: (f.contato_nome as string) ?? null,
      contatoEmail: (f.contato_email as string) ?? null,
      contatoTelefone: (f.contato_telefone as string) ?? null,
      condicaoPagamento: (f.condicao_pagamento as string) ?? null,
      diaVencimento: f.dia_vencimento == null ? null : Number(f.dia_vencimento),
      observacao: (f.observacao as string) ?? null,
      ativo: f.ativo !== false,
      totalLancado: g?.soma ?? 0,
      contasAbertas: g?.abertas ?? 0,
    };
  });
}

export async function carregarFuncionarios(): Promise<
  Base<Funcionario> & { folha: FolhaLinha[] }
> {
  const sb = await clienteServidor();
  const categorias = await carregarCategorias();

  const res = await sb
    .from("funcionarios")
    .select(
      "id,nome,cargo,setor,admissao,demissao,salario_base,salario_liquido," +
        "beneficios_padrao,encargos_padrao,dia_pagamento,periodicidade," +
        "categoria_id,observacao,ativo"
    )
    .order("nome");

  if (res.error) {
    if (!ehColunaAusente(res.error)) {
      return { linhas: [], categorias, folha: [], faltaMigracao: null };
    }
    const basico = await sb
      .from("funcionarios")
      .select("id,nome,cargo,setor,admissao,demissao,salario_base,ativo")
      .order("nome");
    return {
      linhas: montarFuncionarios(basico.data ?? []),
      categorias,
      folha: [],
      faltaMigracao: MIGRACAO,
    };
  }

  const folhaRes = await sb
    .from("folha_pagamento")
    .select(
      "id,funcionario_id,competencia,salario_base,salario_liquido,beneficios," +
        "encargos,descontos,custo_total,vencimento,pagamento,status,observacao"
    )
    .order("competencia", { ascending: false });

  const folha: FolhaLinha[] = folhaRes.error
    ? []
    : ((folhaRes.data ?? []) as unknown as Record<string, unknown>[]).map((f) => ({
        id: f.id as string,
        funcionarioId: f.funcionario_id as string,
        competencia: String(f.competencia).slice(0, 10),
        salarioBase: n(f.salario_base),
        salarioLiquido: f.salario_liquido == null ? null : n(f.salario_liquido),
        beneficios: n(f.beneficios),
        encargos: n(f.encargos),
        descontos: n(f.descontos),
        custoTotal: n(f.custo_total),
        vencimento: (f.vencimento as string) ?? null,
        pagamento: (f.pagamento as string) ?? null,
        status: (f.status as string) ?? "em_aberto",
        observacao: (f.observacao as string) ?? null,
      }));

  return {
    linhas: montarFuncionarios(res.data ?? []),
    categorias,
    folha,
    faltaMigracao: null,
  };
}

function montarFuncionarios(linhas: unknown[]): Funcionario[] {
  return (linhas as Record<string, unknown>[]).map((f) => {
    const base = n(f.salario_base);
    const ben = n(f.beneficios_padrao);
    const enc = n(f.encargos_padrao);
    return {
      id: f.id as string,
      nome: f.nome as string,
      cargo: (f.cargo as string) ?? null,
      setor: (f.setor as string) ?? null,
      admissao: (f.admissao as string) ?? null,
      demissao: (f.demissao as string) ?? null,
      salarioBase: base,
      salarioLiquido: f.salario_liquido == null ? null : n(f.salario_liquido),
      beneficios: ben,
      encargos: enc,
      diaPagamento: f.dia_pagamento == null ? null : Number(f.dia_pagamento),
      periodicidade: (f.periodicidade as string) ?? "mensal",
      categoriaId: (f.categoria_id as string) ?? null,
      observacao: (f.observacao as string) ?? null,
      ativo: f.ativo !== false,
      custoMensal: base + ben + enc,
    };
  });
}

export async function carregarContas(): Promise<
  Base<Conta> & {
    fornecedores: { id: string; nome: string }[];
    funcionarios: { id: string; nome: string }[];
    canais: { id: string; nome: string }[];
  }
> {
  const sb = await clienteServidor();

  const [categorias, fornecedoresRes, funcionariosRes, canaisRes] =
    await Promise.all([
      carregarCategorias(),
      sb.from("fornecedores").select("id,razao_social").order("razao_social"),
      sb.from("funcionarios").select("id,nome").order("nome"),
      sb.from("canais").select("id,nome").eq("ativo", true).order("nome"),
    ]);

  const completo =
    "id,tipo,categoria_id,fornecedor_id,funcionario_id,canal_id,descricao," +
    "documento,valor,competencia,vencimento,pagamento,status,forma_pagamento," +
    "periodicidade,recorrencia_fim,origem_recorrencia_id,observacao";

  let faltaMigracao: string | null = null;
  let dados: Record<string, unknown>[] = [];

  const res = await paginar(() =>
    sb.from("lancamentos_financeiros").select(completo).order("vencimento")
  ).catch(() => null);

  if (res) {
    dados = res as unknown as Record<string, unknown>[];
  } else {
    const basico = await sb
      .from("lancamentos_financeiros")
      .select(
        "id,tipo,categoria_id,fornecedor_id,funcionario_id,canal_id,descricao," +
          "documento,valor,competencia,vencimento,pagamento,status," +
          "forma_pagamento,recorrente,observacao"
      )
      .order("competencia");
    dados = (basico.data ?? []) as unknown as Record<string, unknown>[];
    faltaMigracao = MIGRACAO;
  }

  const linhas: Conta[] = dados.map((c) => ({
    id: c.id as string,
    tipo: (c.tipo as "entrada" | "saida") ?? "saida",
    categoriaId: (c.categoria_id as string) ?? null,
    fornecedorId: (c.fornecedor_id as string) ?? null,
    funcionarioId: (c.funcionario_id as string) ?? null,
    canalId: (c.canal_id as string) ?? null,
    descricao: (c.descricao as string) ?? "",
    documento: (c.documento as string) ?? null,
    valor: n(c.valor),
    competencia: String(c.competencia ?? "").slice(0, 10),
    vencimento: (c.vencimento as string) ?? null,
    pagamento: (c.pagamento as string) ?? null,
    status: (c.status as string) ?? "em_aberto",
    formaPagamento: (c.forma_pagamento as string) ?? null,
    periodicidade:
      (c.periodicidade as string) ?? (c.recorrente ? "mensal" : "unica"),
    recorrenciaFim: (c.recorrencia_fim as string) ?? null,
    origemRecorrenciaId: (c.origem_recorrencia_id as string) ?? null,
    observacao: (c.observacao as string) ?? null,
  }));

  return {
    linhas,
    categorias,
    faltaMigracao,
    fornecedores: ((fornecedoresRes.data ?? []) as Record<string, unknown>[]).map(
      (f) => ({ id: f.id as string, nome: f.razao_social as string })
    ),
    funcionarios: ((funcionariosRes.data ?? []) as Record<string, unknown>[]).map(
      (f) => ({ id: f.id as string, nome: f.nome as string })
    ),
    canais: ((canaisRes.data ?? []) as Record<string, unknown>[]).map((c) => ({
      id: c.id as string,
      nome: c.nome as string,
    })),
  };
}

/* ── Comissões por canal ─────────────────────────────────────── */

export type ComissaoCanal = {
  id: string;
  canalId: string;
  canalNome: string;
  /** Nulo = alíquota única do canal. */
  tipo: string | null;
  comissao: number;
  vigenciaInicio: string;
  observacao: string | null;
  /** É a que vale hoje para este par (canal, tipo). */
  vigente: boolean;
};

/**
 * O que cada canal cobra, e desde quando.
 *
 * Guarda histórico: tarifa muda, e margem de julho calculada com a tarifa
 * de setembro não é margem de julho. `vigente` marca a linha que vale
 * hoje — a mais recente cuja vigência já começou.
 */
export async function carregarComissoesCanal(): Promise<{
  linhas: ComissaoCanal[];
  canais: { id: string; nome: string }[];
}> {
  const sb = await clienteServidor();
  const [res, canaisRes] = await Promise.all([
    sb
      .from("comissoes_canal")
      .select("id,canal_id,tipo,comissao,vigencia_inicio,observacao")
      .order("vigencia_inicio", { ascending: false }),
    sb.from("canais").select("id,nome").eq("ativo", true).order("nome"),
  ]);

  const canais = ((canaisRes.data ?? []) as { id: string; nome: string }[]).map(
    (c) => ({ id: c.id, nome: c.nome })
  );
  if (res.error) return { linhas: [], canais };

  const nome = new Map(canais.map((c) => [c.id, c.nome]));
  const hoje = new Date().toISOString().slice(0, 10);

  const brutas = ((res.data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: c.id as string,
    canalId: c.canal_id as string,
    canalNome: nome.get(c.canal_id as string) ?? "—",
    tipo: (c.tipo as string) ?? null,
    comissao: n(c.comissao),
    vigenciaInicio: String(c.vigencia_inicio).slice(0, 10),
    observacao: (c.observacao as string) ?? null,
    vigente: false,
  }));

  // A vigente de cada par é a primeira já iniciada, na ordem decrescente.
  const jaMarcado = new Set<string>();
  for (const l of brutas) {
    const chave = `${l.canalId}|${l.tipo ?? "geral"}`;
    if (jaMarcado.has(chave) || l.vigenciaInicio > hoje) continue;
    l.vigente = true;
    jaMarcado.add(chave);
  }

  return { linhas: brutas, canais };
}
