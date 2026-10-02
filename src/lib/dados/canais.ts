import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * Os canais e as contas de venda da empresa.
 *
 * Tudo lido com o cliente da SESSÃO: `canais` e `contas_canal` têm RLS por
 * `pode_ver_operacao`, então o isolamento entre empresas é do banco. Não há
 * filtro de operação escrito aqui para alguém esquecer de repetir.
 */

export type Canal = {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  corSerie: number;
  ordem: number;
  ativo: boolean;
  apelidos: string[];
};

export type ContaCanal = {
  id: string;
  canalId: string;
  canalNome: string;
  canalCodigo: string;
  nome: string;
  identificador: string | null;
  fulfillment: boolean;
  reputacao: string | null;
  padrao: boolean;
  ativa: boolean;
  apelidos: string[];
  /** Tem credencial de API guardada no cofre. */
  conectada: boolean;
  /** Última sincronização registrada, quando houver integração. */
  sincronizadaEm: string | null;
  ultimoErro: string | null;
};

/** Coluna ou tabela que só existe depois de uma migração pendente. */
function faltando(code?: string) {
  return code === "42P01" || code === "42703" || code === "PGRST205" || code === "PGRST204";
}

export async function carregarCanais(): Promise<{
  canais: Canal[];
  contas: ContaCanal[];
  faltaMigracao: string | null;
}> {
  const sb = await clienteServidor();

  const [{ data: canais, error: eCanais }, { data: contas }, { data: integs }] =
    await Promise.all([
      sb.from("canais").select("id,codigo,nome,tipo,cor_serie,ordem,ativo,apelidos"),
      sb
        .from("contas_canal")
        .select(
          "id,canal_id,nome,identificador,fulfillment,reputacao,padrao,ativa,apelidos"
        ),
      sb
        .from("integracoes")
        .select("conta_canal_id,credencial_ref,ultima_sincronizacao,ultimo_erro"),
    ]);

  if (eCanais && faltando(eCanais.code)) {
    return { canais: [], contas: [], faltaMigracao: "db/01_schema.sql" };
  }
  if (eCanais) throw new Error(`Não consegui ler os canais: ${eCanais.message}`);

  const lista: Canal[] = (canais ?? []).map((c) => ({
    id: c.id as string,
    codigo: c.codigo as string,
    nome: c.nome as string,
    tipo: (c.tipo as string) ?? "marketplace",
    corSerie: (c.cor_serie as number) ?? 1,
    ordem: (c.ordem as number) ?? 0,
    ativo: Boolean(c.ativo),
    apelidos: (c.apelidos as string[]) ?? [],
  }));

  const porCanal = new Map(lista.map((c) => [c.id, c]));
  type Integ = {
    conta_canal_id: string | null;
    credencial_ref: string | null;
    ultima_sincronizacao: string | null;
    ultimo_erro: string | null;
  };
  const porConta = new Map(
    ((integs ?? []) as Integ[])
      .filter((i) => i.conta_canal_id)
      .map((i) => [i.conta_canal_id as string, i])
  );

  const linhas: ContaCanal[] = (contas ?? []).map((c) => {
    const canal = porCanal.get(c.canal_id as string);
    const integ = porConta.get(c.id as string);
    return {
      id: c.id as string,
      canalId: c.canal_id as string,
      canalNome: canal?.nome ?? "—",
      canalCodigo: canal?.codigo ?? "",
      nome: c.nome as string,
      identificador: (c.identificador as string | null) ?? null,
      fulfillment: Boolean(c.fulfillment),
      reputacao: (c.reputacao as string | null) ?? null,
      padrao: Boolean(c.padrao),
      ativa: Boolean(c.ativa),
      apelidos: (c.apelidos as string[]) ?? [],
      // Conectada é ter credencial guardada, não o `status` da linha: o
      // status fica "conectada" mesmo depois de o token morrer.
      conectada: Boolean(integ?.credencial_ref),
      sincronizadaEm: integ?.ultima_sincronizacao ?? null,
      ultimoErro: integ?.ultimo_erro ?? null,
    };
  });

  linhas.sort(
    (a, b) =>
      a.canalNome.localeCompare(b.canalNome, "pt-BR") ||
      Number(b.padrao) - Number(a.padrao) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );

  return { canais: lista, contas: linhas, faltaMigracao: null };
}

/** Canais que a plataforma sabe ler por API. O resto entra por planilha. */
export const CANAIS_COM_API = new Set(["mercado_livre", "vtex"]);
