import { NextRequest, NextResponse } from "next/server";
import { aceitarComHistorico } from "@/lib/dados/aceites-promocao";
import { carregarCanais } from "@/lib/dados/canais";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { aceitarEmLote } from "@/lib/meli/promocoes-escrita";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { PedidoDeAceite } from "@/lib/planilhas/corpo-promocao";
import { conferirPedido, type PromoAoVivo } from "@/lib/planilhas/conferir-pedido";
import { meliGet } from "@/lib/meli/cliente";

export const dynamic = "force-dynamic";

/**
 * Manda os aceites para o Mercado Livre. É o único caminho que escreve.
 *
 * ── O que protege ──
 *
 * `confirmar: true` no corpo. Não é cerimônia: a rota aceita POST, e um
 * POST acontece por engano — recarregar uma página, um clique duplo, um
 * teste batendo na URL. Sem a confirmação explícita, nada sai.
 *
 * Teto de 300 itens por chamada. A cota é por aplicação e dividida com
 * os agentes dele; um lote maior derruba todo mundo no 429 e deixa
 * metade enviada, que é o pior estado possível.
 *
 * A conta é conferida contra as da operação de quem pede, e a aplicação
 * de escrita precisa estar conectada NELA — conectar numa conta não
 * autoriza a outra.
 *
 * ── O que devolve ──
 *
 * Uma linha por item, com o que o canal respondeu. O canal recusa linha
 * por linha, com motivo próprio, e é assim que a tela precisa mostrar:
 * "8 entraram, 2 recusados e por quê", nunca "deu certo".
 */
export async function POST(req: NextRequest) {
  let corpo: { conta?: string; itens?: PedidoDeAceite[]; confirmar?: boolean; conferir?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const { conta, confirmar, conferir } = corpo;
  let itens = corpo.itens;
  if (confirmar !== true) {
    return NextResponse.json({ erro: "falta a confirmação explícita" }, { status: 400 });
  }
  if (!conta || !Array.isArray(itens) || !itens.length) {
    return NextResponse.json({ erro: "faltou conta ou itens" }, { status: 400 });
  }
  if (itens.length > 300) {
    return NextResponse.json(
      { erro: `${itens.length} itens de uma vez estoura a cota do canal — mande em lotes de até 300` },
      { status: 400 }
    );
  }

  const [sb, op] = await Promise.all([clienteServidor(), operacaoPadrao()]);
  if (!op) return NextResponse.json({ erro: "Sem operação." }, { status: 403 });
  const [{ data: sessao }, { data: podeEditar, error: erroPermissao }] = await Promise.all([
    sb.auth.getUser(),
    sb.rpc("pode_editar_operacao", { op: op.id }),
  ]);
  if (erroPermissao || podeEditar !== true || !sessao.user) {
    return NextResponse.json({ erro: "Seu perfil não pode aceitar promoções." }, { status: 403 });
  }

  const { contas } = await carregarCanais();
  const minha = contas.find((c) => c.id === conta && c.canalCodigo === "mercado_livre");
  if (!minha) return NextResponse.json({ erro: "conta não encontrada" }, { status: 404 });
  if (!minha.escrita?.conectada) {
    return NextResponse.json(
      { erro: `A conta ${minha.nome} não autorizou o sistema a alterar promoções. Em Canais e contas, clique em "Permitir alterações".` },
      { status: 409 }
    );
  }

  /*
   * Conferência ao vivo, quando a tela pede (as Sugeridas pedem sempre).
   * Cada item é relido no canal, 4 por vez, e o que mudou desde o cálculo
   * fica de fora com o motivo — volta para a pessoa decidir de novo.
   */
  const mudaram: { mlb: string; ok: false; erro: string }[] = [];
  if (conferir === true) {
    const conferidos: PedidoDeAceite[] = [];
    const fila = [...itens];
    const cache = new Map<string, Promise<PromoAoVivo[]>>();
    const ler = (mlb: string) => {
      if (!cache.has(mlb)) {
        cache.set(mlb, meliGet<PromoAoVivo[]>(`/seller-promotions/items/${mlb}?app_version=v2`, conta).then((r) => (Array.isArray(r) ? r : [])));
      }
      return cache.get(mlb)!;
    };
    const trabalhar = async (): Promise<void> => {
      const p = fila.shift();
      if (!p) return;
      try {
        const c = conferirPedido(p, await ler(p.mlb));
        if (c.vai) conferidos.push(c.pedido);
        else mudaram.push({ mlb: p.mlb, ok: false, erro: `não enviado: ${c.motivo}` });
      } catch (e) {
        const detalhe = e instanceof Error ? e.message.slice(0, 120) : "erro";
        mudaram.push({ mlb: p.mlb, ok: false, erro: `não enviado: não consegui reler o item (${detalhe})` });
      }
      return trabalhar();
    };
    await Promise.all(Array.from({ length: Math.min(4, itens.length) }, trabalhar));
    itens = conferidos;
    if (!itens.length) {
      return NextResponse.json({ conta: minha.nome, entraram: 0, recusados: mudaram.length, resultados: mudaram, historicoIncompleto: false });
    }
  }

  const envio = await aceitarComHistorico({
    sb,
    operacaoId: op.id,
    contaId: conta,
    usuarioId: sessao.user.id,
    itens,
    enviar: (pedidos) => aceitarEmLote(conta, pedidos),
  });
  if ("erro" in envio) return NextResponse.json(envio, { status: 503 });

  const { historicoIncompleto } = envio;
  const resultados = [...envio.resultados, ...mudaram];
  const entraram = resultados.filter((r) => r.ok).length;
  return NextResponse.json({
    conta: minha.nome,
    entraram,
    recusados: resultados.length - entraram,
    resultados,
    historicoIncompleto,
  });
}
