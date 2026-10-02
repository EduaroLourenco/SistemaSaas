/**
 * Traz a publicidade do Mercado Livre das duas contas.
 *
 * Roda daqui porque a sincronização agendada ainda não está ligada. O
 * token de acesso vem do CLI dono de cada pasta, já renovado, e entra só
 * no cache em memória — o refresh não é tocado.
 */
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "file:///C:/Users/dudu4/OneDrive/Desktop/plataforma/node_modules/jiti/lib/jiti.mjs";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}

const token = (p) => {
  const t = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  const criado = Date.parse(t.createdAt ?? t.created_at ?? 0);
  return { valor: t.access_token, expiraEm: criado + (t.expires_in ?? 21600) * 1000 };
};
/* Semeado por conta de canal mais abaixo, quando os ids chegarem do banco. */
const ARQUIVOS = {
  principal: "C:/Users/dudu4/OneDrive/Desktop/Meli+/.meli/token.json",
  segunda: "C:/Users/dudu4/OneDrive/Desktop/apis/Mercado Livre Principal/.meli/token.json",
};
globalThis.__meliToken = {};

fs.writeFileSync(path.join(process.cwd(), "vazio.cjs"), "");
const jiti = createJiti(RAIZ + "/", {
  alias: { "@": RAIZ + "/src", "server-only": path.join(process.cwd(), "vazio.cjs") },
});
const { sincronizarAds } = await jiti.import(RAIZ + "/src/lib/meli/ads.ts");

/* A conta de canal de cada slug, para amarrar o gasto ao anúncio certo. */
const SB = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const contasCanal = await (
  await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/contas_canal?select=id,nome,operacao_id", { headers: SB })
).json();
const achar = (parte) => contasCanal.find((c) => c.nome.toLowerCase().includes(parte));

const CONTAS = [
  { slug: "principal", conta: achar("são paulo") },
  { slug: "segunda", conta: achar("prazo") },
];

/* O cache do cliente é indexado pela conta de canal, como o resto agora. */
for (const { slug, conta } of CONTAS) {
  if (conta) globalThis.__meliToken[conta.id] = token(ARQUIVOS[slug]);
}

/* Janela: o canal guarda 90 dias de métrica. Padrão, os últimos 60. */
const hoje = new Date().toISOString().slice(0, 10);
const de = process.argv[2] ?? new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
const ate = process.argv[3] ?? hoje;

for (const { slug, conta } of CONTAS) {
  if (!conta) { console.log(`✗ ${slug}: conta de canal não encontrada`); continue; }
  try {
    const r = await sincronizarAds(conta.id, { de, ate, operacaoId: conta.operacao_id, contaCanalId: conta.id });
    if (!r) { console.log(`— ${slug}: conta sem publicidade`); continue; }
    console.log(`✓ ${r.conta}: ${r.campanhas} campanhas, ${r.anuncios} anúncios, ${r.gravados} com movimento`);
    console.log(`   ${de} a ${ate} · investimento R$ ${r.investimento.toLocaleString("pt-BR")} · receita atribuída R$ ${r.receita.toLocaleString("pt-BR")} · ACOS ${r.acos ? (r.acos * 100).toFixed(1) + "%" : "—"}`);
  } catch (e) {
    console.log(`✗ ${slug}:`, e?.message ?? e);
  }
}
