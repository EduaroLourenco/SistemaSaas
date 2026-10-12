import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { integracoesDoProvedor, integracoesDeOperacao } from "@/lib/integracoes/cofre";
import { appConfigurado as meliConfigurado } from "@/lib/meli/cliente";
import { appConfigurado as blingConfigurado } from "@/lib/bling/cliente";
import { estoqueMeli } from "@/lib/meli/estoque";
import { estoqueBling } from "@/lib/bling/estoque";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return NextResponse.json({ erro: "Rotina não configurada." }, { status: 503 });
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const inicio = Date.now();
  const fontes = [
    ...(meliConfigurado() ? await integracoesDoProvedor("mercado_livre") : []).map((i) => ({ i, coletar: estoqueMeli })),
    ...(blingConfigurado() ? await integracoesDeOperacao("bling") : []).map((i) => ({ i, coletar: estoqueBling })),
  ].filter(({ i }) => i.ref);
  if (!fontes.length) return NextResponse.json({ fontes: [] });
  const { data, error } = await clientePrivilegiado().from("estoque_fontes").select("integracao_id,proxima_pagina,atualizada_em").in("integracao_id", fontes.map(({ i }) => i.id));
  if (error) return NextResponse.json({ erro: "Instale a migração 37 de estoques." }, { status: 503 });
  const anteriores = new Map((data ?? []).map((s) => [s.integracao_id, s]));
  fontes.sort((a, b) => (anteriores.get(a.i.id)?.atualizada_em ?? "").localeCompare(anteriores.get(b.i.id)?.atualizada_em ?? ""));
  const resultados = [];
  // Um lote por fonte, começando pelas mais antigas. Cada execução retoma a
  // página salva: catálogos grandes não fazem a próxima empresa ficar sem coleta.
  for (const { i, coletar } of fontes) {
    if (Date.now() - inicio > 150_000) break;
    try {
      const r = await coletar(i, anteriores.get(i.id)?.proxima_pagina ?? 0);
      resultados.push({ fonte: i.id, ...r });
    } catch (e) {
      // A tentativa também entra na ordenação, para uma autorização quebrada
      // não bloquear as demais empresas indefinidamente.
      await clientePrivilegiado().from("estoque_fontes").update({ atualizada_em: new Date().toISOString() }).eq("integracao_id", i.id);
      resultados.push({ fonte: i.id, erro: e instanceof Error ? e.message : "Falha na leitura" });
    }
  }
  return NextResponse.json({ fontes: resultados });
}
