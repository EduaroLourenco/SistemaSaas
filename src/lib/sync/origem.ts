import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";

const colunasNovas = new Set(["origem_vendas", "origem_visitas", "origem_ads", "vendas_atualizadas_em", "visitas_atualizadas_em", "ads_atualizados_em"]);
/** Permite instalar código e migração em etapas sem interromper a coleta existente. */
export async function gravarDiariasComOrigem(linhas: Record<string, unknown>[]) {
  if (!linhas.length) return;
  const grupos = new Map<string, Record<string, unknown>[]>();
  for (const linha of linhas) {
    const chave = Object.keys(linha).sort().join(",");
    const grupo = grupos.get(chave) ?? [];
    grupo.push(linha);
    grupos.set(chave, grupo);
  }
  // PostgREST preenche campos ausentes com null em um lote heterogêneo.
  // Lotes com as mesmas colunas preservam métricas que este provedor não mediu.
  for (const grupo of grupos.values()) await gravarGrupo(grupo);
}
async function gravarGrupo(linhas: Record<string, unknown>[]) {
  const sb = clientePrivilegiado();
  let { error } = await sb.from("vendas_diarias").upsert(linhas, { onConflict: "conta_canal_id,data" });
  if (error && ["42703", "PGRST204"].includes(error.code) && [...colunasNovas].some((c) => error!.message.includes(c))) {
    console.warn("[origens] Instale db/37_estoques_e_origem_dados.sql para registrar a origem por métrica.");
    ({ error } = await sb.from("vendas_diarias").upsert(linhas.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => !colunasNovas.has(k)))), { onConflict: "conta_canal_id,data" }));
  }
  if (error) throw new Error(`Falha ao gravar dados diários: ${error.message}`);
}
