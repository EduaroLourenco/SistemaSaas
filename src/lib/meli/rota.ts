import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { MeliNaoConfigurado, appConfigurado, type Conta } from "./cliente";

/**
 * Quem pode falar com qual conta do Mercado Livre.
 *
 * A conta vem de `?conta=<id de contas_canal>`, e a validação é uma
 * consulta com o cliente da SESSÃO, não o privilegiado: `contas_canal` tem
 * RLS por `pode_ver_operacao`, então uma conta de outra empresa
 * simplesmente não volta. A autorização é o próprio banco — não há
 * checagem de permissão duplicada aqui para alguém esquecer de fazer.
 */

export type ContaMeli = {
  id: string;
  nome: string;
  padrao: boolean;
  conectada: boolean;
};

const CANAL = "mercado_livre";

/** Contas de Mercado Livre que o usuário logado pode ver. */
export async function contasMeli(): Promise<ContaMeli[]> {
  const sb = await clienteServidor();

  const { data: canais } = await sb.from("canais").select("id").eq("codigo", CANAL);
  const ids = (canais ?? []).map((c) => c.id as string);
  if (ids.length === 0) return [];

  const { data: contas } = await sb
    .from("contas_canal")
    .select("id,nome,padrao")
    .in("canal_id", ids)
    .eq("ativa", true)
    .order("padrao", { ascending: false })
    .order("nome");
  if (!contas?.length) return [];

  /*
   * `conectada` olha o cofre, não a coluna `status`: status é o que a
   * última execução ACHOU, e fica "conectada" mesmo depois de o token
   * morrer. Ter `credencial_ref` é o que de fato permite renovar.
   *
   * A semente do ambiente não entra na conta aqui — ela é transitória e
   * esta lista é o que a tela mostra para a empresa.
   */
  const { data: integs } = await sb
    .from("integracoes")
    .select("conta_canal_id,credencial_ref")
    .eq("provedor", CANAL);
  const comCofre = new Set(
    (integs ?? [])
      .filter((i) => i.credencial_ref)
      .map((i) => i.conta_canal_id as string)
  );

  return contas.map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    padrao: Boolean(c.padrao),
    conectada: comCofre.has(c.id as string),
  }));
}

export type ContaCanal = {
  id: string;
  operacaoId: string;
  canalId: string;
  nome: string;
  identificador: string | null;
};

/**
 * A conta de canal, se quem está logado pode ESCREVER nela.
 *
 * Conectar uma integração e disparar uma sincronização são escritas. Ver a
 * conta não basta: um leitor não liga a empresa a um canal nem gasta cota
 * de API. Quem resolve as duas perguntas é o banco — o RLS de
 * `contas_canal` para "é da minha empresa", e `pode_editar_operacao` para
 * "meu papel permite".
 *
 * `motivo` distingue os dois casos sem contar a quem não tem direito se a
 * conta existe.
 */
export async function contaEditavel(
  id: string
): Promise<{ conta: ContaCanal | null; motivo: "nao_encontrada" | "sem_permissao" | null }> {
  const sb = await clienteServidor();

  const { data } = await sb
    .from("contas_canal")
    .select("id,operacao_id,canal_id,nome,identificador")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { conta: null, motivo: "nao_encontrada" };

  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", {
    op: data.operacao_id,
  });
  if (!podeEditar) return { conta: null, motivo: "sem_permissao" };

  return {
    conta: {
      id: data.id as string,
      operacaoId: data.operacao_id as string,
      canalId: data.canal_id as string,
      nome: data.nome as string,
      identificador: (data.identificador as string | null) ?? null,
    },
    motivo: null,
  };
}

/**
 * Casca comum das rotas que falam com o Mercado Livre.
 *
 * Resolve a conta, recusa quem não pode vê-la e responde sempre da mesma
 * forma quando o canal não está ligado: 503 com `configurado: false` e uma
 * mensagem que diz o que fazer. A tela consegue distinguir "não conectado
 * ainda" de "deu erro de verdade" — são situações diferentes e merecem
 * aviso diferente.
 */
export async function comMeli<T>(
  url: URL,
  acao: (conta: Conta) => Promise<T>
): Promise<NextResponse> {
  const contas = await contasMeli();
  const pedida = url.searchParams.get("conta");

  if (contas.length === 0) {
    return NextResponse.json(
      {
        configurado: false,
        contas,
        erro: "Nenhuma conta de Mercado Livre cadastrada nesta operação.",
      },
      { status: 503 }
    );
  }

  const conta = pedida
    ? contas.find((c) => c.id === pedida)
    : (contas.find((c) => c.padrao) ?? contas[0]);

  // Pedida e não encontrada: ou não existe, ou é de outra empresa e o RLS
  // não a devolveu. Nos dois casos a resposta é a mesma — dizer qual é não
  // ajudaria quem tem direito e ajudaria quem não tem.
  if (!conta) {
    return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  }

  if (!appConfigurado()) {
    return NextResponse.json(
      {
        configurado: false,
        conta: conta.id,
        contas,
        erro:
          "O aplicativo do Mercado Livre não está configurado neste servidor. " +
          "Defina MELI_APP_ID e MELI_CLIENT_SECRET.",
      },
      { status: 503 }
    );
  }

  try {
    const dados = await acao(conta.id);
    return NextResponse.json({
      configurado: true,
      conta: conta.id,
      contas,
      consultadoEm: new Date().toISOString(),
      ...dados,
    });
  } catch (e: unknown) {
    if (e instanceof MeliNaoConfigurado) {
      return NextResponse.json(
        { configurado: false, conta: conta.id, contas, erro: e.message },
        { status: 503 }
      );
    }
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    // Log no servidor, mensagem enxuta para o cliente: a resposta do canal
    // pode trazer pedaço de credencial no corpo.
    console.error("Falha na consulta ao Mercado Livre:", msg);
    return NextResponse.json({ configurado: true, erro: msg }, { status: 502 });
  }
}

/** Valida um intervalo de datas vindo da query. */
export function intervalo(url: URL): { de: string; ate: string } | null {
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!de || !ate || !iso.test(de) || !iso.test(ate)) return null;
  if (de > ate) return null;
  return { de, ate };
}
