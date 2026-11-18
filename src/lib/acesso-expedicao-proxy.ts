import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_EXPEDICAO, TELA_EXPEDICAO, rotaDaExpedicao } from "./acesso-expedicao";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALIDADE_MS = 30_000;
const memoria = new Map<string, { sim: boolean; ate: number }>();

type ComRpc = {
  rpc: (
    nome: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function soExpedicao(sb: ComRpc, usuario: string, operacao: string | undefined) {
  const op = operacao && UUID.test(operacao) ? operacao : null;
  const chave = `${usuario}|${op ?? ""}`;
  const guardado = memoria.get(chave);
  if (guardado && guardado.ate > Date.now()) return guardado.sim;

  const { data, error } = await sb.rpc("acesso_so_expedicao", { p_operacao: op });
  if (error) {
    /* Migração 48 ainda não aplicada: ninguém tem esse perfil. */
    if (error.code === "PGRST202" || error.code === "42883") return false;
    if (guardado) return guardado.sim;
    throw new Error(error.message);
  }
  if (memoria.size > 5_000) memoria.clear();
  memoria.set(chave, { sim: data === true, ate: Date.now() + VALIDADE_MS });
  return data === true;
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
  let restrito: boolean;
  try {
    restrito = await soExpedicao(sb, usuario, req.cookies.get("operacao")?.value);
  } catch {
    /* Sem saber o perfil, não entrega tela nem dado. */
    return ehApi
      ? NextResponse.json({ erro: "Não foi possível conferir seu acesso." }, { status: 503 })
      : new NextResponse("Não foi possível conferir seu acesso. Tente de novo.", { status: 503 });
  }

  const marcado = req.cookies.get(COOKIE_EXPEDICAO)?.value === "1";
  const marcar = (r: NextResponse) => {
    if (restrito && !marcado) {
      r.cookies.set(COOKIE_EXPEDICAO, "1", { path: "/", sameSite: "lax", secure: req.nextUrl.protocol === "https:" });
    }
    if (!restrito && marcado) r.cookies.delete(COOKIE_EXPEDICAO);
    return r;
  };
  if (!restrito || rotaDaExpedicao(caminho)) {
    marcar(resposta);
    return null;
  }

  const bloqueio = ehApi
    ? NextResponse.json({ erro: "Seu acesso é somente à tela de Envios.", codigo: "modulo_bloqueado" }, { status: 403 })
    : NextResponse.redirect(new URL(TELA_EXPEDICAO, req.url));
  /* Leva junto a sessão renovada nesta mesma requisição. */
  resposta.cookies.getAll().forEach((c) => bloqueio.cookies.set(c));
  return marcar(bloqueio);
}
