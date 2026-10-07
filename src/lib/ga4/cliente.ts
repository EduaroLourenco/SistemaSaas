import "server-only";
import { lerSegredo, type Integracao } from "@/lib/integracoes/cofre";

/**
 * Google Analytics 4: autorização e as três chamadas que o sistema usa.
 *
 * Uma aplicação só (GOOGLE_CLIENT_ID/SECRET) serve todas as empresas, como
 * no Mercado Livre: cada uma autoriza o próprio GA4, e o refresh token vai
 * para o cofre amarrado à conta de canal da loja própria.
 *
 * Diferente do Meli, o refresh token do Google NÃO roda a cada uso — vale
 * até ser revogado. Então não há regravação a cada renovação; só a troca
 * pelo access token, que dura uma hora.
 *
 * Duas pegadinhas do Google que custam caro se esquecidas:
 *
 * - `prompt=consent` é obrigatório. Sem ele, quem já autorizou uma vez
 *   volta sem refresh token, e a integração morre em uma hora.
 * - App em modo "Teste" no Google Cloud tem refresh token que expira em
 *   SETE DIAS. O app precisa estar "Em produção" (mesmo não verificado)
 *   para a conexão durar.
 */

export const ESCOPO = "https://www.googleapis.com/auth/analytics.readonly";
export const PROVEDOR = "ga4";

type Segredo = { refresh_token: string };

function credenciais() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const segredo = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !segredo) {
    throw new Error("Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET na Vercel.");
  }
  return { id, segredo };
}

export function appConfigurado() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

async function token(corpo: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corpo),
  });
  const j = (await r.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!r.ok || !j.access_token) {
    throw new Error(`Google recusou o token (${r.status}): ${j.error_description ?? j.error ?? "sem detalhe"}`);
  }
  return j;
}

/** O código da volta da autorização vira o par de tokens. */
export async function trocarCodigo(codigo: string, redirectUri: string) {
  const { id, segredo } = credenciais();
  return token({
    grant_type: "authorization_code",
    code: codigo,
    client_id: id,
    client_secret: segredo,
    redirect_uri: redirectUri,
  });
}

/** Access token válido por uma hora, a partir do refresh guardado no cofre. */
export async function tokenDeAcesso(integ: Integracao): Promise<string> {
  const s = await lerSegredo<Segredo>(integ);
  if (!s?.refresh_token) throw new Error("Sem autorização do Google guardada — conecte de novo.");
  const { id, segredo } = credenciais();
  const t = await token({
    grant_type: "refresh_token",
    refresh_token: s.refresh_token,
    client_id: id,
    client_secret: segredo,
  });
  return t.access_token!;
}

async function google<T>(url: string, acesso: string, corpo?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: corpo ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${acesso}`,
      ...(corpo ? { "content-type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) {
    /*
     * 403 aqui quase sempre é API não ativada no projeto do Google Cloud —
     * a mensagem do Google diz qual. Repassar inteira poupa uma investigação.
     */
    throw new Error(`Google respondeu ${r.status}: ${j.error?.message ?? "sem detalhe"}`);
  }
  return j;
}

export type Propriedade = { id: string; nome: string; conta: string };

/**
 * As propriedades GA4 que a conta Google autorizada enxerga.
 *
 * Usa a Admin API (precisa estar ativada no projeto, além da Data API).
 * `id` sai no formato "properties/123456", que é o que a Data API pede.
 */
export async function listarPropriedades(acesso: string): Promise<Propriedade[]> {
  const saida: Propriedade[] = [];
  let pagina = "";
  do {
    const url = new URL("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
    url.searchParams.set("pageSize", "200");
    if (pagina) url.searchParams.set("pageToken", pagina);
    const j = await google<{
      accountSummaries?: {
        displayName: string;
        propertySummaries?: { property: string; displayName: string }[];
      }[];
      nextPageToken?: string;
    }>(url.toString(), acesso);
    for (const c of j.accountSummaries ?? []) {
      for (const p of c.propertySummaries ?? []) {
        saida.push({ id: p.property, nome: p.displayName, conta: c.displayName });
      }
    }
    pagina = j.nextPageToken ?? "";
  } while (pagina);
  return saida;
}

/** Os nomes de métrica e dimensão que ESTA propriedade aceita. */
export async function nomesAceitos(acesso: string, propriedade: string) {
  const j = await google<{
    dimensions?: { apiName: string }[];
    metrics?: { apiName: string }[];
  }>(`https://analyticsdata.googleapis.com/v1beta/${propriedade}/metadata`, acesso);
  return new Set([
    ...(j.dimensions ?? []).map((d) => d.apiName),
    ...(j.metrics ?? []).map((m) => m.apiName),
  ]);
}

export type Linha = { dimensoes: string[]; metricas: number[] };

/** `runReport` da Data API, achatado em linhas simples. */
export async function relatorio(
  acesso: string,
  propriedade: string,
  corpo: Record<string, unknown>
): Promise<Linha[]> {
  const j = await google<{
    rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  }>(`https://analyticsdata.googleapis.com/v1beta/${propriedade}:runReport`, acesso, {
    limit: 100000,
    ...corpo,
  });
  return (j.rows ?? []).map((r) => ({
    dimensoes: r.dimensionValues.map((d) => d.value),
    metricas: r.metricValues.map((m) => Number(m.value) || 0),
  }));
}
