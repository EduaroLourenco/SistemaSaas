import "server-only";
import type { Recurso } from "./cadastros-financeiros";

/**
 * Canais e contas de canal como cadastro de tela.
 *
 * Até aqui essas linhas eram inseridas direto no banco — o que servia para
 * uma empresa só, a nossa. Um cliente não tem acesso ao banco, e sem tela
 * ele não consegue dizer "tenho uma conta Magalu": cada cadastro viraria
 * trabalho manual nosso, um por cliente.
 *
 * Aproveita a mesma maquinaria dos cadastros do financeiro: a rota já
 * resolve operação, permissão e validação num lugar só, e um recurso novo
 * só declara seus campos. Escrever uma rota própria é como se esquece a
 * checagem que impede gravar na empresa do vizinho.
 */

const TIPOS_CANAL = ["marketplace", "loja_propria", "atacado", "outro"] as const;

export const RECURSOS_CANAL: Record<string, Recurso> = {
  canais: {
    tabela: "canais",
    nome: "canal",
    selecao: "id,codigo,nome,tipo,cor_serie,ordem,ativo,apelidos",
    ordem: [{ coluna: "ordem" }, { coluna: "nome" }],
    campos: {
      codigo: { coluna: "codigo", tipo: "texto", obrigatorio: true },
      nome: { coluna: "nome", tipo: "texto", obrigatorio: true },
      tipo: { coluna: "tipo", tipo: "enum", valores: TIPOS_CANAL, obrigatorio: true },
      corSerie: { coluna: "cor_serie", tipo: "inteiro", max: 10 },
      ordem: { coluna: "ordem", tipo: "inteiro", max: 999 },
      ativo: { coluna: "ativo", tipo: "booleano" },
      apelidos: { coluna: "apelidos", tipo: "lista" },
    },
  },

  "contas-canal": {
    tabela: "contas_canal",
    nome: "conta de canal",
    selecao:
      "id,canal_id,nome,identificador,fulfillment,reputacao," +
      "reputacao_atualizada_em,padrao,ativa,apelidos",
    ordem: [{ coluna: "nome" }],
    campos: {
      canalId: { coluna: "canal_id", tipo: "uuid", obrigatorio: true },
      nome: { coluna: "nome", tipo: "texto", obrigatorio: true },
      /*
       * O identificador é o id do vendedor no canal, e NÃO se digita à mão
       * para o Mercado Livre: a conexão o grava a partir do `/users/me`, e
       * é ele que impede o catálogo de uma conta cair na outra. Fica
       * editável para os canais que entram por planilha, onde ninguém o
       * descobre sozinho.
       */
      identificador: { coluna: "identificador", tipo: "texto" },
      fulfillment: { coluna: "fulfillment", tipo: "booleano" },
      reputacao: { coluna: "reputacao", tipo: "texto" },
      padrao: { coluna: "padrao", tipo: "booleano" },
      ativa: { coluna: "ativa", tipo: "booleano" },
      apelidos: { coluna: "apelidos", tipo: "lista" },
    },
  },
};
