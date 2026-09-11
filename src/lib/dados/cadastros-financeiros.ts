import "server-only";

/**
 * O contrato dos cadastros do financeiro, num lugar só.
 *
 * Categorias, fornecedores, funcionários e contas a pagar são quatro
 * telas com a mesma forma: uma lista, um formulário, gravar e apagar. O
 * que muda entre elas é a tabela e o conjunto de campos.
 *
 * Escrever quatro rotas quase iguais garante que a quinta esqueça a
 * checagem de operação — que é justamente a que impede alguém gravar na
 * empresa do vizinho. Aqui a checagem acontece uma vez, e cada recurso
 * só declara seus campos.
 *
 * Nada de `select *` na escrita: só o que está no `campos` do recurso
 * chega ao banco. Um campo a mais no corpo do POST é ignorado, não
 * gravado — é o que impede o navegador de escrever `operacao_id`.
 */

type Tipo = "texto" | "numero" | "inteiro" | "data" | "booleano" | "uuid" | "enum";

type Campo = {
  coluna: string;
  tipo: Tipo;
  /** Recusa gravar sem ele. */
  obrigatorio?: boolean;
  /** Teto de sanidade para números. Não é regra de negócio, é rede. */
  max?: number;
  /** Valores aceitos quando `tipo` é enum. */
  valores?: readonly string[];
};

export type Recurso = {
  tabela: string;
  /** Rótulo para as mensagens de erro. */
  nome: string;
  campos: Record<string, Campo>;
  /** Colunas lidas na listagem. */
  selecao: string;
  ordem: { coluna: string; ascendente?: boolean }[];
};

const STATUS = ["previsto", "em_aberto", "pago", "atrasado", "cancelado"] as const;
const PERIODICIDADE = [
  "unica", "mensal", "bimestral", "trimestral", "semestral", "anual",
] as const;

export const RECURSOS: Record<string, Recurso> = {
  categorias: {
    tabela: "categorias_financeiras",
    nome: "categoria",
    selecao: "id,nome,tipo,grupo,variavel,ordem,descricao,ativa,cor_serie",
    ordem: [{ coluna: "ordem" }, { coluna: "nome" }],
    campos: {
      nome: { coluna: "nome", tipo: "texto", obrigatorio: true },
      tipo: { coluna: "tipo", tipo: "enum", valores: ["entrada", "saida"], obrigatorio: true },
      grupo: { coluna: "grupo", tipo: "texto" },
      variavel: { coluna: "variavel", tipo: "booleano" },
      ordem: { coluna: "ordem", tipo: "inteiro", max: 999 },
      descricao: { coluna: "descricao", tipo: "texto" },
      ativa: { coluna: "ativa", tipo: "booleano" },
      corSerie: { coluna: "cor_serie", tipo: "inteiro", max: 10 },
    },
  },

  fornecedores: {
    tabela: "fornecedores",
    nome: "fornecedor",
    selecao:
      "id,razao_social,nome_fantasia,cnpj,categoria_id,contato_nome,contato_email," +
      "contato_telefone,condicao_pagamento,dia_vencimento,observacao,ativo",
    ordem: [{ coluna: "razao_social" }],
    campos: {
      razaoSocial: { coluna: "razao_social", tipo: "texto", obrigatorio: true },
      nomeFantasia: { coluna: "nome_fantasia", tipo: "texto" },
      cnpj: { coluna: "cnpj", tipo: "texto" },
      categoriaId: { coluna: "categoria_id", tipo: "uuid" },
      contatoNome: { coluna: "contato_nome", tipo: "texto" },
      contatoEmail: { coluna: "contato_email", tipo: "texto" },
      contatoTelefone: { coluna: "contato_telefone", tipo: "texto" },
      condicaoPagamento: { coluna: "condicao_pagamento", tipo: "texto" },
      diaVencimento: { coluna: "dia_vencimento", tipo: "inteiro", max: 31 },
      observacao: { coluna: "observacao", tipo: "texto" },
      ativo: { coluna: "ativo", tipo: "booleano" },
    },
  },

  funcionarios: {
    tabela: "funcionarios",
    nome: "funcionário",
    selecao:
      "id,nome,cargo,setor,admissao,demissao,salario_base,salario_liquido," +
      "beneficios_padrao,encargos_padrao,dia_pagamento,periodicidade," +
      "categoria_id,observacao,ativo",
    ordem: [{ coluna: "nome" }],
    campos: {
      nome: { coluna: "nome", tipo: "texto", obrigatorio: true },
      cargo: { coluna: "cargo", tipo: "texto" },
      setor: { coluna: "setor", tipo: "texto" },
      admissao: { coluna: "admissao", tipo: "data" },
      demissao: { coluna: "demissao", tipo: "data" },
      salarioBase: { coluna: "salario_base", tipo: "numero", max: 1_000_000 },
      salarioLiquido: { coluna: "salario_liquido", tipo: "numero", max: 1_000_000 },
      beneficios: { coluna: "beneficios_padrao", tipo: "numero", max: 1_000_000 },
      encargos: { coluna: "encargos_padrao", tipo: "numero", max: 1_000_000 },
      diaPagamento: { coluna: "dia_pagamento", tipo: "inteiro", max: 31 },
      periodicidade: { coluna: "periodicidade", tipo: "enum", valores: PERIODICIDADE },
      categoriaId: { coluna: "categoria_id", tipo: "uuid" },
      observacao: { coluna: "observacao", tipo: "texto" },
      ativo: { coluna: "ativo", tipo: "booleano" },
    },
  },

  contas: {
    tabela: "lancamentos_financeiros",
    nome: "conta",
    selecao:
      "id,tipo,categoria_id,fornecedor_id,funcionario_id,canal_id,descricao," +
      "documento,valor,competencia,vencimento,pagamento,status,forma_pagamento," +
      "periodicidade,recorrencia_fim,origem_recorrencia_id,observacao",
    ordem: [{ coluna: "vencimento", ascendente: true }],
    campos: {
      tipo: { coluna: "tipo", tipo: "enum", valores: ["entrada", "saida"], obrigatorio: true },
      categoriaId: { coluna: "categoria_id", tipo: "uuid" },
      fornecedorId: { coluna: "fornecedor_id", tipo: "uuid" },
      funcionarioId: { coluna: "funcionario_id", tipo: "uuid" },
      canalId: { coluna: "canal_id", tipo: "uuid" },
      descricao: { coluna: "descricao", tipo: "texto", obrigatorio: true },
      documento: { coluna: "documento", tipo: "texto" },
      valor: { coluna: "valor", tipo: "numero", max: 100_000_000, obrigatorio: true },
      competencia: { coluna: "competencia", tipo: "data", obrigatorio: true },
      vencimento: { coluna: "vencimento", tipo: "data" },
      pagamento: { coluna: "pagamento", tipo: "data" },
      status: { coluna: "status", tipo: "enum", valores: STATUS },
      formaPagamento: { coluna: "forma_pagamento", tipo: "texto" },
      periodicidade: { coluna: "periodicidade", tipo: "enum", valores: PERIODICIDADE },
      recorrenciaFim: { coluna: "recorrencia_fim", tipo: "data" },
      observacao: { coluna: "observacao", tipo: "texto" },
    },
  },

  /*
   * A alíquota de tabela de cada canal.
   *
   * É a peça que torna a lógica de promoção multicanal sem mexer em
   * código: a MATRIZ DE PREÇO por faixa de comissão é a mesma para todos
   * os canais — mercadoria, embalagem e imposto não mudam porque a venda
   * saiu na Shopee em vez do Meli. O que muda é em que faixa o canal cai.
   *
   * Cadastrar a comissão do canal aqui já basta para o motor achar o
   * preço certo na mesma tabela que ele já usa.
   *
   * `tipo` nulo é a alíquota única do canal, que é o caso da maioria. O
   * Mercado Livre é a exceção que justifica a coluna: clássico e premium
   * cobram diferente, e cinco pontos mudam o preço que fecha a margem.
   */
  comissoes: {
    tabela: "comissoes_canal",
    nome: "comissão de canal",
    selecao: "id,canal_id,tipo,comissao,vigencia_inicio,observacao",
    ordem: [{ coluna: "vigencia_inicio", ascendente: false }],
    campos: {
      canalId: { coluna: "canal_id", tipo: "uuid", obrigatorio: true },
      tipo: {
        coluna: "tipo",
        tipo: "enum",
        valores: ["classico", "premium", "outro"],
      },
      comissao: { coluna: "comissao", tipo: "numero", max: 99.99, obrigatorio: true },
      vigenciaInicio: { coluna: "vigencia_inicio", tipo: "data", obrigatorio: true },
      observacao: { coluna: "observacao", tipo: "texto" },
    },
  },

  folha: {
    tabela: "folha_pagamento",
    nome: "folha",
    selecao:
      "id,funcionario_id,competencia,salario_base,salario_liquido,beneficios," +
      "encargos,descontos,custo_total,vencimento,pagamento,status,observacao",
    ordem: [{ coluna: "competencia", ascendente: false }],
    campos: {
      funcionarioId: { coluna: "funcionario_id", tipo: "uuid", obrigatorio: true },
      competencia: { coluna: "competencia", tipo: "data", obrigatorio: true },
      salarioBase: { coluna: "salario_base", tipo: "numero", max: 1_000_000 },
      salarioLiquido: { coluna: "salario_liquido", tipo: "numero", max: 1_000_000 },
      beneficios: { coluna: "beneficios", tipo: "numero", max: 1_000_000 },
      encargos: { coluna: "encargos", tipo: "numero", max: 1_000_000 },
      descontos: { coluna: "descontos", tipo: "numero", max: 1_000_000 },
      vencimento: { coluna: "vencimento", tipo: "data" },
      pagamento: { coluna: "pagamento", tipo: "data" },
      status: { coluna: "status", tipo: "enum", valores: STATUS },
      observacao: { coluna: "observacao", tipo: "texto" },
    },
  },
};

export type NomeRecurso = keyof typeof RECURSOS;

const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Erro = { campo: string; motivo: string };

/**
 * Converte o corpo vindo do navegador nas colunas do banco.
 *
 * Devolve `erros` em vez de lançar: o formulário quer mostrar todos os
 * problemas de uma vez, não o primeiro e mais nada.
 *
 * String vazia vira `null`, e não `""`: um campo que a pessoa apagou está
 * vazio, e vazio é null. Gravar `""` faria "sem CNPJ" e "CNPJ em branco"
 * serem coisas diferentes no banco sem serem diferentes para ninguém.
 */
export function paraColunas(
  recurso: Recurso,
  corpo: Record<string, unknown>,
  { parcial = false }: { parcial?: boolean } = {}
): { linha: Record<string, unknown>; erros: Erro[] } {
  const linha: Record<string, unknown> = {};
  const erros: Erro[] = [];

  for (const [chave, campo] of Object.entries(recurso.campos)) {
    const presente = chave in corpo;
    if (!presente) {
      if (campo.obrigatorio && !parcial) {
        erros.push({ campo: chave, motivo: "obrigatório" });
      }
      continue;
    }

    let v = corpo[chave];
    if (typeof v === "string") v = v.trim();
    if (v === "" || v === undefined) v = null;

    if (v === null) {
      if (campo.obrigatorio) {
        erros.push({ campo: chave, motivo: "não pode ficar vazio" });
        continue;
      }
      linha[campo.coluna] = null;
      continue;
    }

    switch (campo.tipo) {
      case "texto":
        linha[campo.coluna] = String(v);
        break;

      case "numero":
      case "inteiro": {
        const num = typeof v === "number" ? v : Number(String(v).replace(",", "."));
        if (!Number.isFinite(num) || num < 0) {
          erros.push({ campo: chave, motivo: "número inválido" });
          break;
        }
        if (campo.max != null && num > campo.max) {
          erros.push({ campo: chave, motivo: `acima do limite (${campo.max})` });
          break;
        }
        linha[campo.coluna] = campo.tipo === "inteiro" ? Math.round(num) : num;
        break;
      }

      case "data": {
        const s = String(v).slice(0, 10);
        if (!ISO_DATA.test(s)) {
          erros.push({ campo: chave, motivo: "data inválida" });
          break;
        }
        // Uma data que o Postgres recusa (31/09) chega aqui bem formada.
        // Testar antes evita o 22008 estourar como erro de servidor.
        const [a, m, d] = s.split("-").map(Number);
        const teste = new Date(Date.UTC(a, m - 1, d));
        if (
          teste.getUTCFullYear() !== a ||
          teste.getUTCMonth() !== m - 1 ||
          teste.getUTCDate() !== d
        ) {
          erros.push({ campo: chave, motivo: "esse dia não existe no mês" });
          break;
        }
        linha[campo.coluna] = s;
        break;
      }

      case "booleano":
        linha[campo.coluna] = v === true || v === "true" || v === 1;
        break;

      case "uuid":
        if (!UUID.test(String(v))) {
          erros.push({ campo: chave, motivo: "referência inválida" });
          break;
        }
        linha[campo.coluna] = String(v);
        break;

      case "enum":
        if (!campo.valores?.includes(String(v))) {
          erros.push({ campo: chave, motivo: "valor não permitido" });
          break;
        }
        linha[campo.coluna] = String(v);
        break;
    }
  }

  return { linha, erros };
}

/**
 * As ocorrências futuras de uma conta recorrente.
 *
 * Gera linhas REAIS, uma por competência, em vez de calcular na leitura.
 * Uma conta projetada precisa poder ser editada e paga sozinha — a luz de
 * março custa diferente da de fevereiro —, e uma linha virtual não tem
 * onde guardar isso.
 *
 * O limite de 36 ocorrências não é arbitrário: é o horizonte em que uma
 * projeção de conta fixa ainda diz alguma coisa. Além disso, o valor de
 * hoje não descreve mais o mês.
 */
export function ocorrencias(
  competenciaInicial: string,
  vencimentoInicial: string | null,
  periodicidade: string,
  fim: string | null,
  maximo = 36
): { competencia: string; vencimento: string | null }[] {
  const passo: Record<string, number> = {
    mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
  };
  const meses = passo[periodicidade];
  if (!meses) return [];

  // O dia do vencimento é preservado ao longo dos meses; quando o mês não
  // tem esse dia (31 em fevereiro), cai no último dia do mês. É o que o
  // boleto faz.
  const diaVenc = vencimentoInicial ? Number(vencimentoInicial.slice(8, 10)) : null;
  const [a0, m0] = competenciaInicial.split("-").map(Number);

  const out: { competencia: string; vencimento: string | null }[] = [];
  for (let i = 1; i <= maximo; i++) {
    const total = m0 - 1 + meses * i;
    const ano = a0 + Math.floor(total / 12);
    const mes = (total % 12) + 1;
    const competencia = `${ano}-${String(mes).padStart(2, "0")}-01`;
    if (fim && competencia > fim) break;

    let vencimento: string | null = null;
    if (diaVenc) {
      const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
      const dia = Math.min(diaVenc, ultimo);
      vencimento = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    }
    out.push({ competencia, vencimento });
  }
  return out;
}
