import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_EXPEDICAO, TELA_DO_PERFIL, rotaDoPerfil, type PerfilRestrito } from "./acesso-expedicao";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALIDADE_MS = 30_000;
const memoria = new Map<string, { perfil: PerfilRestrito | null; ate: number }>();

type ComRpc = {
  rpc: (
    nome: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function perfilRestrito(sb: ComRpc, usuario: string, operacao: string | undefined): Promise<PerfilRestrito | null> {
  const op = operacao && UUID.test(operacao) ? operacao : null;
  const chave = `${usuario}|${op ?? ""}`;
  const guardado = memoria.get(chave);
  if (guardado && guardado.ate > Date.now()) return guardado.perfil;

  const ausente = (c?: string) => c === "PGRST202" || c === "42883";
  let perfil: PerfilRestrito | null;
  const r = await sb.rpc("perfil_restrito", { p_operacao: op });
  if (!r.error) perfil = r.data === "expedicao" || r.data === "acompanhamento" ? r.data : null;
  else if (ausente(r.error.code)) {
    /* Migração 51 ainda não aplicada: só a Expedição existe. */
    const { data, error } = await sb.rpc("acesso_so_expedicao", { p_operacao: op });
    if (error && !ausente(error.code)) {
      if (guardado) return guardado.perfil;
      throw new Error(error.message);
    }
    perfil = data === true ? "expedicao" : null;
  } else {
    if (guardado) return guardado.perfil;
    throw new Error(r.error.message);
  }
  if (memoria.size > 5_000) memoria.clear();
  memoria.set(chave, { perfil, ate: Date.now() + VALIDADE_MS });
  return perfil;
}

/** Devolve a resposta de bloqueio, ou null quando a requisição pode seguir. */
export async function barrarForaDaExpedicao(
  req: NextRequest,
  sb: ComRpc,
  usuario: string,
  resposta: NextResponse,
): Promise<NextResponse | null> {
  const caminho = req.nextUrl.pathname;
  const ehApi = caminho.startsWith("/api/");
  let perfil: PerfilRestrito | null;
  try {
    perfil = await perfilRestrito(sb, usuario, req.cookies.get("operacao")?.value);
  } catch {
    /* Sem saber o perfil, não entrega tela nem dado. */
    return ehApi
      ? NextResponse.json({ erro: "Não foi possível conferir seu acesso." }, { status: 503 })
      : new NextResponse("Não foi possível conferir seu acesso. Tente de novo.", { status: 503 });
  }

  const restrito = perfil !== null;
  const marcado = req.cookies.get(COOKIE_EXPEDICAO)?.value === "1";
  const marcar = (r: NextResponse) => {
    if (restrito && !marcado) {
      r.cookies.set(COOKIE_EXPEDICAO, "1", { path: "/", sameSite: "lax", secure: req.nextUrl.protocol === "https:" });
    }
    if (!restrito && marcado) r.cookies.delete(COOKIE_EXPEDICAO);
    return r;
  };
  if (!perfil || rotaDoPerfil(perfil, caminho)) {
    marcar(resposta);
    return null;
  }

  const bloqueio = ehApi
    ? NextResponse.json({ erro: perfil === "expedicao" ? "Seu acesso é somente à tela de Envios." : "Seu acesso é somente à tela de Pedidos.", codigo: "modulo_bloqueado" }, { status: 403 })
    : NextResponse.redirect(new URL(TELA_DO_PERFIL[perfil], req.url));
  /* Leva junto a sessão renovada nesta mesma requisição. */
  resposta.cookies.getAll().forEach((c) => bloqueio.cookies.set(c));
  return marcar(bloqueio);
}
