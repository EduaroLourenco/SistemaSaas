import { NextResponse } from "next/server";
import {
  meliConfigurado,
  situacaoContas,
  MeliNaoConfigurado,
  type Conta,
} from "./cliente";

/**
 * Lê `?conta=` da query. Sem parâmetro, é a conta principal — a de São
 * Paulo, pronta entrega. `segunda` é a que vende a prazo.
 */
export function contaDaQuery(url: URL): Conta {
  return url.searchParams.get("conta") === "segunda" ? "segunda" : "principal";
}

/**
 * Casca comum das rotas que falam com o Mercado Livre.
 *
 * Toda rota responde a mesma forma quando o canal não está conectado: 503
 * com `configurado: false` e uma mensagem que diz o que fazer. Assim a tela
 * consegue distinguir "não configurado ainda" de "deu erro de verdade" —
 * são situações diferentes e merecem aviso diferente.
 */
export async function comMeli<T>(
  acao: () => Promise<T>,
  conta: Conta = "principal"
): Promise<NextResponse> {
  const contas = situacaoContas();

  if (!meliConfigurado(conta)) {
    const alvo = contas.find((c) => c.slug === conta)!;
    return NextResponse.json(
      {
        configurado: false,
        conta,
        contas,
        erro: `Conta "${alvo.nome}" não conectada. Defina MELI_APP_ID, MELI_CLIENT_SECRET e ${alvo.variavel} no .env.local.`,
      },
      { status: 503 }
    );
  }

  try {
    const dados = await acao();
    return NextResponse.json({
      configurado: true,
      conta,
      contas,
      consultadoEm: new Date().toISOString(),
      ...dados,
    });
  } catch (e: unknown) {
    if (e instanceof MeliNaoConfigurado) {
      return NextResponse.json(
        { configurado: false, conta, contas, erro: e.message },
        { status: 503 }
      );
    }
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    // Log no servidor, mensagem enxuta para o cliente: a resposta do canal
    // pode trazer pedaço de credencial no corpo.
    console.error("Falha na consulta ao Mercado Livre:", msg);
    return NextResponse.json({ configurado: true, erro: msg }, { status: 502 });
  }
}

/** Valida um intervalo de datas vindo da query. */
export function intervalo(url: URL): { de: string; ate: string } | null {
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!de || !ate || !iso.test(de) || !iso.test(ate)) return null;
  if (de > ate) return null;
  return { de, ate };
}
