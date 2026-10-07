/**
 * Descobre a chave de relatório da operação do usuário de teste.
 *
 * `/relatorio/[chave]` é a maior tela do sistema (1.675 linhas) e a única
 * desenhada como peça para diretoria. Sem a chave ela fica fora da
 * auditoria, e seria a omissão mais cara do pacote.
 *
 * Lê, não escreve: se a operação ainda não tem chave, diz isso e para —
 * girar chave de produção para tirar foto não vale.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
for (const linha of fs.readFileSync(RAIZ + "/.env.local", "utf8").split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

const cred = JSON.parse(fs.readFileSync(RAIZ + "/docs/auditoria-visual-2026-10-07/.credencial-teste.json", "utf8"));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await sb
  .from("operacoes")
  .select("id,nome,relatorio_chave,organizacao_id")
  .eq("organizacao_id", cred.organizacaoId);

if (error) {
  console.error("erro:", error.message);
  process.exit(1);
}
if (!data?.length) {
  console.log("A organização de teste não tem operação. Nada a capturar.");
  process.exit(2);
}

for (const o of data) {
  console.log(`${o.nome}  chave=${o.relatorio_chave ? o.relatorio_chave.slice(0, 8) + "… (" + o.relatorio_chave.length + " car.)" : "SEM CHAVE"}`);
}

const comChave = data.find((o) => o.relatorio_chave);
if (!comChave) {
  console.log("\nNenhuma operação tem chave de relatório gerada. A tela fica como PENDENTE no pacote.");
  process.exit(3);
}

fs.writeFileSync(
  RAIZ + "/docs/auditoria-visual-2026-10-07/.chave-relatorio.txt",
  comChave.relatorio_chave
);
console.log("\nchave gravada em .chave-relatorio.txt (fora do git)");
