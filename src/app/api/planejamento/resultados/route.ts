import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { paginar } from "@/lib/dados/paginar";
import { detalhesVazios, type Item } from "@/lib/planejamento/modelo";
import {
  periodosDoResultado,
  resumirVendas,
  temRecorte,
  type LinhaVenda,
} from "@/lib/planejamento/resultados";

const resposta = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(req: Request) {
  const sb = await clienteServidor();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user)
    return resposta({ erro: "Entre na sua conta para consultar." }, 401);
  const op = await operacaoPadrao(),
    params = new URL(req.url).searchParams;
  if (!op || params.get("operacao") !== op.id)
    return resposta({ erro: "A operação mudou. Atualize a página." }, 409);
  const id = params.get("id");
  if (
    !id ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)
  )
    return resposta({ erro: "Planejamento inválido." }, 400);
  const { data, error } = await sb
    .from("planejamento_itens")
    .select("*")
    .eq("operacao_id", op.id)
    .eq("id", id)
    .maybeSingle();
  if (error)
    return resposta({ erro: "Não foi possível carregar o planejamento." }, 503);
  if (!data)
    return resposta({ erro: "Planejamento indisponível nesta operação." }, 404);
  if (params.get("revisao") !== String(data.revisao))
    return resposta(
      { erro: "Este planejamento mudou. Reabra a página antes de consultar." },
      409,
    );
  const item = {
    ...data,
    detalhes: { ...detalhesVazios(), ...data.detalhes },
  } as Item;
  if (!temRecorte(item))
    return resposta(
      {
        erro: "Escolha pelo menos um canal, conta, SKU ou anúncio para delimitar a consulta.",
      },
      400,
    );
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const periodo = periodosDoResultado(item, hoje);
  if (!periodo)
    return resposta({ erro: "O período planejado ainda não começou." }, 400);
  try {
    const [linhas, anuncios, produtos, exclusoes] = await Promise.all([
      paginar(() =>
        sb
          .from("pedido_itens")
          .select(
            "id,anuncio_id,codigo_externo,sku,quantidade,total,pedidos!inner(id,operacao_id,data,canal_id,conta_canal_id,cancelado,atualizado_em)",
          )
          .eq("operacao_id", op.id)
          .eq("pedidos.operacao_id", op.id)
          .gte("pedidos.data", periodo.anteriorInicio)
          .lte("pedidos.data", periodo.fim)
          .order("id"),
      ),
      paginar(() =>
        sb
          .from("anuncios")
          .select("id,produto_id,sku_canal,codigo_externo,conta_canal_id")
          .eq("operacao_id", op.id)
          .order("id"),
      ),
      paginar(() =>
        sb
          .from("produtos")
          .select("id,sku")
          .eq("operacao_id", op.id)
          .order("id"),
      ),
      paginar(() =>
        sb
          .from("exclusoes_analise")
          .select("id,data_inicio,data_fim,canal_id,conta_canal_id")
          .eq("operacao_id", op.id)
          .lte("data_inicio", periodo.fim)
          .gte("data_fim", periodo.anteriorInicio)
          .order("id"),
      ),
    ]);
    if ([linhas, anuncios, produtos, exclusoes].some((a) => a.length >= 200000))
      return resposta(
        {
          erro: "O período tem registros demais para esta consulta. Use uma ação com período menor.",
        },
        422,
      );
    const porId = new Map(anuncios.map((a) => [a.id, a]));
    const porCodigo = new Map(
      anuncios.map((a) => [
        `${a.conta_canal_id}:${String(a.codigo_externo).toUpperCase()}`,
        a,
      ]),
    );
    const skuProduto = new Map(produtos.map((p) => [p.id, p.sku]));
    const vendas: LinhaVenda[] = linhas.map((l) => {
      const p = Array.isArray(l.pedidos) ? l.pedidos[0] : l.pedidos;
      if (!p) throw new Error("Pedido sem vínculo acessível.");
      const a =
        (l.anuncio_id ? porId.get(l.anuncio_id) : null) ??
        porCodigo.get(
          `${p.conta_canal_id}:${String(l.codigo_externo).toUpperCase()}`,
        );
      return {
        pedido: p.id,
        data: p.data,
        canal: p.canal_id,
        conta: p.conta_canal_id,
        cancelado: p.cancelado,
        sku:
          (a?.produto_id ? skuProduto.get(a.produto_id) : null) ??
          a?.sku_canal ??
          l.sku ??
          "",
        anuncio: a?.id ?? "",
        quantidade: Number(l.quantidade),
        receita: Number(l.total),
        atualizado: p.atualizado_em,
      };
    });
    return resposta({
      atual: resumirVendas(
        vendas,
        item,
        periodo.inicio,
        periodo.fim,
        exclusoes,
      ),
      anterior: resumirVendas(
        vendas,
        item,
        periodo.anteriorInicio,
        periodo.anteriorFim,
        exclusoes,
      ),
      consultadoEm: new Date().toISOString(),
      parcial: item.fim >= hoje,
    });
  } catch (e) {
    console.error(
      "[planejamento/resultados]",
      e instanceof Error ? e.message : "Falha de consulta",
    );
    return resposta(
      {
        erro: "Não foi possível consultar vendas e exclusões. Nenhum resultado parcial foi apresentado. Tente novamente.",
      },
      503,
    );
  }
}
