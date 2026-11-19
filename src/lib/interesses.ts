import "server-only";
import { createHmac } from "node:crypto";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";

export const BUCKET_INTERESSES = "gerizo-interesses";
export type Interesse = { nome: string; telefone: string; empresa?: string; modulos?: string[]; criadoEm: string; origem: "site-comercial" };

/** Contatos ficam em um bucket privado separado, sem empresa ou pedido fictício. */
export async function prepararCaptacao() {
  const sb = clientePrivilegiado();
  const existente = await sb.storage.getBucket(BUCKET_INTERESSES);
  if (existente.data) {
    if (existente.data.public) throw new Error("A captação exige armazenamento privado.");
    return sb;
  }
  if (existente.error && !["404", "400"].includes(String(existente.error.status))) throw existente.error;
  const criacao = await sb.storage.createBucket(BUCKET_INTERESSES, { public: false, fileSizeLimit: 16384, allowedMimeTypes: ["application/json"] });
  if (criacao.error && !["409", "400"].includes(String(criacao.error.status))) throw criacao.error;
  const verificado = await sb.storage.getBucket(BUCKET_INTERESSES);
  if (!verificado.data || verificado.data.public) throw new Error("Não foi possível preparar a captação privada.");
  return sb;
}

export async function registrarInteresse(nome: string, telefone: string, extra: { empresa?: string; modulos?: string[] } = {}) {
  const sb = await prepararCaptacao();
  const chave = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`gerizo-interesse:${telefone}`).digest("hex");
  const contato: Interesse = { nome, telefone, ...extra, criadoEm: new Date().toISOString(), origem: "site-comercial" };
  const { error } = await sb.storage.from(BUCKET_INTERESSES).upload(`${chave}.json`, Buffer.from(JSON.stringify(contato)), { contentType: "application/json", upsert: Boolean(extra.modulos?.length) });
  // Reenviar o mesmo telefone não cria uma lista duplicada de contatos.
  if (error && !["409", "400"].includes(String(error.statusCode))) throw error;
  if (error && String(error.statusCode) === "400" && !/already exists|duplicate/i.test(error.message)) throw error;
}

/** Somente chamar depois de verificar eh_admin_plataforma no contexto da sessão. */
export async function listarInteresses(): Promise<Interesse[]> {
  const sb = await prepararCaptacao();
  const { data, error } = await sb.storage.from(BUCKET_INTERESSES).list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw error;
  const contatos = await Promise.all((data ?? []).filter(f => /^[a-f0-9]{64}\.json$/.test(f.name)).map(async f => {
    const { data: arquivo, error } = await sb.storage.from(BUCKET_INTERESSES).download(f.name);
    if (error || !arquivo) throw error ?? new Error("Contato indisponível.");
    const item = JSON.parse(await arquivo.text()) as Interesse;
    return { nome: item.nome, telefone: item.telefone, empresa: item.empresa, modulos: item.modulos, criadoEm: item.criadoEm, origem: "site-comercial" as const };
  }));
  return contatos.sort((a,b) => b.criadoEm.localeCompare(a.criadoEm));
}
