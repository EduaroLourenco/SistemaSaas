import { NextRequest, NextResponse } from "next/server";
import { carregarCanais } from "@/lib/dados/canais";
import { gerarFila, decidirNaFila } from "@/lib/dados/fila-aprovacao";

export const dynamic = "force-dynamic";

/**
 * A fila de aprovação: gerar e decidir. Nenhuma das duas envia nada.
 *
 * `gerar` lê uma promoção do canal e grava o que as regras decidiram.
 * Uma por chamada, de propósito: as 36 numa requisição só estouram a
 * cota e o tempo da função.
 *
 * `decidir` só muda o estado da linha no nosso banco. O envio continua
 * sendo `/api/automacoes/enviar`, que pede `confirmar: true` e a
 * aplicação de escrita conectada na conta.
 */
export async function POST(req: NextRequest) {
  let corpo: {
    acao?: string;
    conta?: string;
    promocao?: string;
    tipo?: string;
    nome?: string | null;
    prazo?: string | null;
    ids?: string[];
    estado?: "aprovada" | "descartada";
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  if (corpo.acao === "decidir") {
    if (!Array.isArray(corpo.ids) || !corpo.ids.length) {
      return NextResponse.json({ erro: "faltou o que decidir" }, { status: 400 });
    }
    if (corpo.estado !== "aprovada" && corpo.estado !== "descartada") {
      return NextResponse.json({ erro: "estado inválido" }, { status: 400 });
    }
    const r = await decidirNaFila(corpo.ids, corpo.estado);
    return "erro" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  }

  const { conta, promocao, tipo } = corpo;
  if (!conta || !promocao || !tipo) {
    return NextResponse.json({ erro: "faltou conta, promocao ou tipo" }, { status: 400 });
  }

  /* A conta vem do cliente: é conferida contra as da operação de quem
     pede, como nas outras rotas. Sem isso, trocar o id leria a promoção
     de outra empresa. */
  const { contas } = await carregarCanais();
  const minha = contas.find((c) => c.id === conta && c.canalCodigo === "mercado_livre");
  if (!minha) return NextResponse.json({ erro: "conta não encontrada" }, { status: 404 });

  try {
    const r = await gerarFila(conta, promocao, tipo, corpo.nome ?? null, corpo.prazo ?? null);
    return "erro" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "o canal não respondeu" },
      { status: 502 }
    );
  }
}
