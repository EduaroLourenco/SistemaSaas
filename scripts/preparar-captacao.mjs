// Configura somente o armazenamento privado da nova captação comercial.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
for (const linha of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.startsWith("#") && !process.env[linha.slice(0,i)]) process.env[linha.slice(0,i)] = linha.slice(i+1).trim().replace(/^(["'])(.*)\1$/, "$2");
}
const id = "gerizo-interesses";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let { data, error } = await sb.storage.getBucket(id);
if (!data) {
  const criado = await sb.storage.createBucket(id, { public: false, fileSizeLimit: 16384, allowedMimeTypes: ["application/json"] });
  if (criado.error && !/already exists|duplicate/i.test(criado.error.message)) throw new Error("Não foi possível preparar o armazenamento privado.");
  ({ data, error } = await sb.storage.getBucket(id));
}
if (error || !data || data.public) throw new Error("A captação exige armazenamento privado.");
console.log(JSON.stringify({ captacao: "pronta", bucket: id, publico: data.public }));
if (process.argv.includes("--verificar-isolamento")) {
  const caminho = `qa/probe-${randomUUID()}.json`;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  try {
    const gravado = await sb.storage.from(id).upload(caminho, Buffer.from('{"verificacao":true}'), { contentType: "application/json", upsert: false });
    if (gravado.error) throw new Error("Falha ao verificar gravação privada.");
    const leituraAdmin = await sb.storage.from(id).download(caminho);
    if (leituraAdmin.error || !leituraAdmin.data) throw new Error("Falha na leitura administrativa.");
    const leituraAnonima = await anon.storage.from(id).download(caminho);
    if (leituraAnonima.data || !leituraAnonima.error) throw new Error("Armazenamento acessível sem autorização.");
    const listaAnonima = await anon.storage.from(id).list("qa");
    if (listaAnonima.data?.some(f => f.name === caminho.slice(3))) throw new Error("Arquivo exposto na listagem pública.");
    console.log(JSON.stringify({ gravacaoPrivada: true, leituraPublica: false, listagemPublica: false, dadosPessoaisUsados: false }));
  } finally {
    const removido = await sb.storage.from(id).remove([caminho]);
    if (removido.error) throw new Error("A verificação não conseguiu remover seu próprio arquivo temporário.");
  }
}
