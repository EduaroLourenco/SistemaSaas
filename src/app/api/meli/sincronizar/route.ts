import { NextRequest, NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { sincronizarMeli } from "@/lib/meli/sincronizar";
import { MeliNaoConfigurado, MeliBloqueado, CONTAS } from "@/lib/meli/cliente";

export const runtime = "nodejs";
/**
 * A sincronização completa passa de um minuto: o catálogo hidrata em
 * lotes de 20 e as visitas vão um anúncio por chamada. O teto do plano é
 * o limite real; aqui declara-se o máximo permitido.
 */
export const maxDuration = 300;

/**
 * Puxa do Mercado Livre e grava no banco.
 *
 * POST /api/meli/sincronizar
 *   { conta?: "principal"|"segunda", de?, ate?, diasVisitas?, etapas? }
 *
 * É POST porque escreve. GET seria pré-carregado por navegador e
 * acelerador de link, e uma sincronização disparada por engano gasta cota
 * de uma aplicação compartilhada com os agentes.
 */
export async function POST(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) {
    return NextResponse.json(
      { erro: "Não autenticado", codigo: "sem_sessao" },
      { status: 401 }
    );
  }

  let corpo: {
    conta?: string;
    de?: string;
    ate?: string;
    diasVisitas?: number;
    etapas?: Record<string, boolean>;
  } = {};
  try {
    corpo = await req.json();
  } catch {
    // Corpo vazio é uso legítimo: sincroniza a conta principal com o padrão.
  }

  const conta = corpo.conta === "segunda" ? "segunda" : "principal";
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  if ((corpo.de && !ISO.test(corpo.de)) || (corpo.ate && !ISO.test(corpo.ate))) {
    return NextResponse.json(
      { erro: "Use datas no formato AAAA-MM-DD." },
      { status: 400 }
    );
  }
  if (corpo.de && corpo.ate && corpo.de > corpo.ate) {
    return NextResponse.json(
      { erro: "`de` não pode ser depois de `ate`." },
      { status: 400 }
    );
  }

  const comecou = Date.now();
  try {
    const r = await sincronizarMeli({
      conta,
      de: corpo.de,
      ate: corpo.ate,
      diasVisitas: corpo.diasVisitas,
      etapas: corpo.etapas,
      registro: { origem: "manual" },
    });
    return NextResponse.json({
      ...r,
      segundos: Math.round((Date.now() - comecou) / 1000),
    });
  } catch (e) {
    if (e instanceof MeliNaoConfigurado) {
      return NextResponse.json(
        {
          erro: e.message,
          codigo: "nao_configurado",
          contas: CONTAS.map((c) => ({ slug: c.slug, nome: c.nome, variavel: c.variavel })),
        },
        { status: 409 }
      );
    }
    if (e instanceof MeliBloqueado) {
      return NextResponse.json(
        { erro: e.message, codigo: "bloqueado" },
        { status: 403 }
      );
    }
    const msg = e instanceof Error ? e.message : "Falha desconhecida";
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
