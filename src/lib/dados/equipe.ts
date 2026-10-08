import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { ORDEM_PAPEL, type Papel } from "./papeis";
import { operacaoPadrao } from "./operacao";

/*
 * Só o TIPO é reexportado. `PAPEIS` fica em `papeis.ts` e a tela importa de
 * lá: reexportar o valor aqui faria um componente de cliente arrastar este
 * módulo `server-only` — e `next/headers` com ele — para o navegador.
 */
export type { Papel };

/**
 * Quem tem acesso à empresa.
 *
 * Lido com o cliente da SESSÃO. `membros`, `usuarios` e `convites` têm RLS
 * por organização, então quem não é da empresa não vê a lista — e o token
 * do convite só é exposto a quem já é membro, que é quem precisa reenviar
 * o link.
 */

export type Membro = {
  /** Id da linha de `membros` — é o que as funções recebem. */
  id: string;
  usuarioId: string;
  nome: string | null;
  email: string;
  papel: Papel;
  desde: string;
  /** É a própria pessoa que está vendo a tela. */
  euMesmo: boolean;
};

export type Convite = {
  id: string;
  email: string;
  papel: Papel;
  token: string;
  criadoEm: string;
  expiraEm: string;
  vencido: boolean;
};

export type Equipe = {
  organizacaoId: string | null;
  organizacaoNome: string | null;
  /** O papel de quem está vendo. Decide o que a tela deixa fazer. */
  meuPapel: Papel | null;
  membros: Membro[];
  convites: Convite[];
  faltaMigracao: string | null;
};

const VAZIA: Equipe = {
  organizacaoId: null,
  organizacaoNome: null,
  meuPapel: null,
  membros: [],
  convites: [],
  faltaMigracao: null,
};

function faltando(code?: string) {
  return code === "42P01" || code === "42703" || code === "PGRST205" || code === "42883";
}

export async function carregarEquipe(): Promise<Equipe> {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  const eu = sessao?.user?.id ?? null;
  if (!eu) return VAZIA;

  /*
   * A empresa é a ATIVA no seletor, não a primeira do vínculo. Antes era a
   * primeira: o admin da plataforma (membro só da Probel) entrava na Bom de
   * Compras, via a equipe da Probel, e o convite feito ali caía na Probel.
   * `operacaoPadrao()` só aceita operação que a sessão enxerga (RLS), então
   * o cookie não abre empresa alheia.
   */
  const ativa = await operacaoPadrao();
  if (!ativa) return VAZIA;
  const organizacaoId = ativa.organizacaoId;
  const organizacaoNome = ativa.empresa || null;

  // O papel vem do banco: o do vínculo, ou proprietário para o admin da
  // plataforma na empresa em que entrou (db/32). Sem a 32, o admin só lê.
  const { data: papelBanco, error: ePapel } = await sb.rpc("papel_na_organizacao", {
    p_organizacao: organizacaoId,
  });
  if (ePapel && !faltando(ePapel.code) && ePapel.code !== "PGRST202") {
    throw new Error(`Não consegui ler seu papel: ${ePapel.message}`);
  }
  const meuPapel = (papelBanco as Papel | null) ?? null;

  const [{ data: membros }, { data: convites, error: eConvites }] = await Promise.all([
    sb
      .from("membros")
      .select("id,usuario_id,papel,criado_em")
      .eq("organizacao_id", organizacaoId)
      .order("criado_em"),
    sb
      .from("convites")
      .select("id,email,papel,token,criado_em,expira_em,aceito_em")
      .eq("organizacao_id", organizacaoId)
      .is("aceito_em", null)
      .order("criado_em", { ascending: false }),
  ]);

  const ids = (membros ?? []).map((m) => m.usuario_id as string);
  const { data: usuarios } = ids.length
    ? await sb.from("usuarios").select("id,nome,email").in("id", ids)
    : { data: [] };
  const porUsuario = new Map(
    ((usuarios ?? []) as { id: string; nome: string | null; email: string }[]).map((u) => [u.id, u])
  );

  const lista: Membro[] = (membros ?? []).map((m) => {
    const u = porUsuario.get(m.usuario_id as string);
    return {
      id: m.id as string,
      usuarioId: m.usuario_id as string,
      nome: u?.nome ?? null,
      // Sem o espelho de `usuarios` o e-mail não aparece; dizer isso é
      // melhor que mostrar uma linha em branco sem explicação.
      email: u?.email ?? "(e-mail não espelhado)",
      papel: m.papel as Papel,
      desde: m.criado_em as string,
      euMesmo: m.usuario_id === eu,
    };
  });
  lista.sort(
    (a, b) =>
      ORDEM_PAPEL.indexOf(a.papel) - ORDEM_PAPEL.indexOf(b.papel) ||
      (a.nome ?? a.email).localeCompare(b.nome ?? b.email, "pt-BR")
  );

  const agora = Date.now();
  const pendentes: Convite[] = eConvites
    ? []
    : ((convites ?? []) as Record<string, unknown>[]).map((c) => ({
        id: c.id as string,
        email: c.email as string,
        papel: c.papel as Papel,
        token: c.token as string,
        criadoEm: c.criado_em as string,
        expiraEm: c.expira_em as string,
        vencido: new Date(c.expira_em as string).getTime() < agora,
      }));

  return {
    organizacaoId,
    organizacaoNome,
    meuPapel,
    membros: lista,
    convites: pendentes,
    faltaMigracao: eConvites && faltando(eConvites.code) ? "db/20_cadastro_e_convites.sql" : null,
  };
}
