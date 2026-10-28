import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import { TIPO_PADRAO, type Folgas } from "@/lib/folga";

/**
 * A folga abaixo do piso, lembrada por tipo de campanha.
 *
 * O campo no topo de Automações voltava a 5% a cada visita, e a régua
 * não é a mesma para todo tipo: 5% nas automáticas e 0% no pré-acordo,
 * que é como a Probel já trabalha na planilha.
 *
 * A migração 45 pode não ter rodado ainda. Como em `regras-promocao.ts`,
 * nada aqui explode por isso: sem a tabela, a tela segue com o padrão de
 * 5% e sem memória — que é exatamente o comportamento de antes.
 */

const SEM_TABELA = new Set(["42P01", "PGRST205"]);

export { FOLGA_PADRAO, TIPO_PADRAO, type Folgas } from "@/lib/folga";

const AVISO =
  "A memória da folga precisa da migração db/45_folga_por_campanha.sql. " +
  "Enquanto ela não rodar, a folga volta a 5% a cada visita.";

export async function carregarFolgas(): Promise<Folgas> {
  const op = await operacaoPadrao();
  if (!op) return { porTipo: {}, faltaMigracao: null };
  const sb = await clienteServidor();

  const { data, error } = await sb
    .from("folgas_campanha")
    .select("tipo_campanha,folga_pct")
    .eq("operacao_id", op.id);

  if (error) {
    if (SEM_TABELA.has(error.code)) return { porTipo: {}, faltaMigracao: AVISO };
    console.error("[folga-campanha]", error);
    return { porTipo: {}, faltaMigracao: null };
  }

  const porTipo: Record<string, number> = {};
  for (const l of data ?? []) porTipo[String(l.tipo_campanha)] = Number(l.folga_pct);
  return { porTipo, faltaMigracao: null };
}

export async function gravarFolga(
  tipoCampanha: string,
  folgaPct: number
): Promise<{ ok: true } | { erro: string }> {
  const tipo = tipoCampanha.trim() || TIPO_PADRAO;
  /*
   * A faixa é checada aqui E no banco. O `check` do banco é a trava que
   * vale; esta devolve a recusa com uma frase em vez de um código.
   */
  if (!Number.isFinite(folgaPct) || folgaPct < 0 || folgaPct > 30) {
    return { erro: "A folga tem de ficar entre 0% e 30%." };
  }

  const op = await operacaoPadrao();
  if (!op) return { erro: "Sem operação." };
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();

  const { error } = await sb.from("folgas_campanha").upsert(
    {
      operacao_id: op.id,
      tipo_campanha: tipo,
      folga_pct: Number(folgaPct.toFixed(2)),
      atualizada_por: sessao.user?.id ?? null,
      atualizada_em: new Date().toISOString(),
    },
    { onConflict: "operacao_id,tipo_campanha" }
  );

  if (error) {
    if (SEM_TABELA.has(error.code)) return { erro: AVISO };
    /* O RLS recusa quem é `leitor`: a mensagem diz isso, não "erro 42501". */
    if (error.code === "42501") return { erro: "Seu papel não permite mudar a folga." };
    console.error("[folga-campanha]", error);
    return { erro: "Não consegui guardar a folga agora." };
  }
  return { ok: true };
}
