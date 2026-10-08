import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { carregarVendasPlanejamento, RegistrosDemais } from "@/lib/dados/planejamento-vendas";
import { detalhesVazios, type Item } from "@/lib/planejamento/modelo";
import {
  periodosDoResultado,
  resumirVendas,
  temRecorte,
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
    const { vendas, exclusoes } = await carregarVendasPlanejamento(op.id, periodo.anteriorInicio, periodo.fim);
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
    if (e instanceof RegistrosDemais)
      return resposta(
        { erro: "O período tem registros demais para esta consulta. Use uma ação com período menor." },
        422,
      );
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
