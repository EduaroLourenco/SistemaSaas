import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * As empresas da plataforma, para a tela do admin.
 *
 * Quem não é admin vê só as suas — a função no banco já decide isso, e a
 * tela existe para os dois: o admin administra várias, o lojista vê a dele
 * e nada quebra se ele abrir o endereço.
 *
 * A contagem de "conectadas" é o que responde a pergunta que importa ao
 * abrir a lista: aquela loja já tem API ligada, ou ainda vive de planilha?
 * Sem a API não há anúncio, estoque, preço de vitrine nem visita, e metade
 * das telas fica vazia por motivo legítimo.
 */

export type Empresa = {
  id: string;
  nome: string;
  slug: string;
  criadoEm: string;
  operacoes: number;
  membros: number;
  convites: number;
  canais: number;
  contas: number;
  conectadas: number;
};

export type DadosEmpresas = {
  empresas: Empresa[];
  souAdmin: boolean;
  /** Quando a migração 26 ainda não rodou, a tela avisa em vez de estourar. */
  faltaMigracao: string | null;
};

/** PGRST202: a função não existe no cache do PostgREST. */
const SEM_MIGRACAO = new Set(["PGRST202", "42883"]);

export async function carregarEmpresas(): Promise<DadosEmpresas> {
  const sb = await clienteServidor({ todasOperacoes: true });

  const [lista, admin] = await Promise.all([
    sb.rpc("empresas_da_plataforma"),
    sb.rpc("eh_admin_plataforma"),
  ]);

  if (lista.error) {
    if (SEM_MIGRACAO.has(lista.error.code ?? "")) {
      return {
        empresas: [],
        souAdmin: false,
        faltaMigracao: "db/26_admin_cria_empresa.sql",
      };
    }
    throw new Error(`Não consegui listar as empresas: ${lista.error.message}`);
  }

  type Linha = {
    organizacao_id: string;
    nome: string;
    slug: string;
    criado_em: string;
    operacoes: number;
    membros: number;
    convites: number;
    canais: number;
    contas: number;
    conectadas: number;
  };

  return {
    empresas: ((lista.data ?? []) as Linha[]).map((e) => ({
      id: e.organizacao_id,
      nome: e.nome,
      slug: e.slug,
      criadoEm: e.criado_em,
      operacoes: Number(e.operacoes),
      membros: Number(e.membros),
      convites: Number(e.convites),
      canais: Number(e.canais),
      contas: Number(e.contas),
      conectadas: Number(e.conectadas),
    })),
    souAdmin: admin.data === true,
    faltaMigracao: null,
  };
}
