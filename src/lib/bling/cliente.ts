import "server-only";
import { gravarSegredo, lerSegredo, type Integracao } from "@/lib/integracoes/cofre";

/**
 * Bling (API v3): autorização e chamada.
 *
 * Uma aplicação só — a do Eduardo, conta de integrador — serve todas as
 * empresas. Cada uma autoriza o próprio Bling, e o par de tokens vai para o
 * cofre preso à OPERAÇÃO (o ERP não é conta de canal).
 *
 * Endereço e formato conferidos em 07/10/2026 contra o próprio Bling, com
 * um código de autorização propositalmente inválido: `api.bling.com.br`
 * respondeu `invalid_grant` (credencial aceita, código recusado), e com
 * credencial errada responde `invalid_client`.
 *
 * O refresh token vale 30 dias e é TROCADO a cada renovação — por isso o
 * novo é regravado no cofre toda vez. Uma empresa que passe 30 dias sem
 * nenhuma sincronização precisa conectar de novo; o agendamento diário
 * impede isso.
 */

export const PROVEDOR = "bling";
export const BASE = "https://api.bling.com.br/Api/v3";
export const AUTORIZAR = "https://www.bling.com.br/Api/v3/oauth/authorize";

type Segredo = { access_token: string; refresh_token: string; expira_em: string };

export function appConfigurado() {
  return Boolean(process.env.BLING_CLIENT_ID && process.env.BLING_CLIENT_SECRET);
}

function basico() {
  const id = process.env.BLING_CLIENT_ID;
  const segredo = process.env.BLING_CLIENT_SECRET;
  if (!id || !segredo) throw new Error("Defina BLING_CLIENT_ID e BLING_CLIENT_SECRET na Vercel.");
  return "Basic " + Buffer.from(`${id}:${segredo}`).toString("base64");
}

async function token(corpo: Record<string, string>): Promise<Segredo> {
  const r = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basico(),
      "content-type": "application/x-www-form-urlencoded",
      accept: "1.0",
    },
    body: new URLSearchParams(corpo),
  });
  const j = (await r.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: { description?: string; message?: string };
  };
  if (!r.ok || !j.access_token || !j.refresh_token) {
    throw new Error(`Bling recusou o token (${r.status}): ${j.error?.description ?? j.error?.message ?? "sem detalhe"}`);
  }
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expira_em: new Date(Date.now() + (j.expires_in ?? 21600) * 1000).toISOString(),
  };
}

export const trocarCodigo = (codigo: string) => token({ grant_type: "authorization_code", code: codigo });

/** Guarda o par no cofre. Lança: perder o refresh novo é perder a conexão. */
export async function guardar(integ: Integracao, s: Segredo) {
  const erro = await gravarSegredo(integ, s, s.expira_em);
  if (erro) throw new Error(`Não consegui guardar a autorização do Bling: ${erro.message}`);
}

/** Access token válido, renovando (e regravando o refresh) quando falta pouco. */
async function acesso(integ: Integracao): Promise<string> {
  const s = await lerSegredo<Segredo>(integ);
  if (!s?.refresh_token) throw new Error("Sem autorização do Bling guardada — conecte de novo.");
  if (new Date(s.expira_em).getTime() - Date.now() > 5 * 60_000) return s.access_token;
  const novo = await token({ grant_type: "refresh_token", refresh_token: s.refresh_token });
  await guardar(integ, novo);
  return novo.access_token;
}

/*
 * O Bling aceita 3 requisições por segundo por aplicação. 350ms entre uma
 * e outra deixa folga; 429 espera e tenta de novo, até três vezes.
 */
let ultima = 0;
async function freio() {
  const espera = ultima + 350 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultima = Date.now();
}

export async function bling<T>(
  integ: Integracao,
  caminho: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const url = new URL(BASE + caminho);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const tok = await acesso(integ);
  for (let tentativa = 0; ; tentativa++) {
    await freio();
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}`, accept: "application/json" } });
    if (r.status === 429 && tentativa < 3) {
      await new Promise((x) => setTimeout(x, 1000 * (tentativa + 1)));
      continue;
    }
    const j = (await r.json().catch(() => ({}))) as T & { error?: { description?: string; message?: string } };
    if (!r.ok) {
      throw new Error(`Bling respondeu ${r.status} em ${caminho}: ${j.error?.description ?? j.error?.message ?? "sem detalhe"}`);
    }
    return j;
  }
}

/** Nome e CNPJ da empresa que autorizou. Opcional: falha não derruba a conexão. */
export async function dadosDaEmpresa(integ: Integracao) {
  try {
    const j = await bling<{ data?: { nome?: string; cnpj?: string } }>(integ, "/empresas/me/dados-basicos");
    return { nome: j.data?.nome ?? null, cnpj: j.data?.cnpj ?? null };
  } catch {
    return { nome: null, cnpj: null };
  }
}
