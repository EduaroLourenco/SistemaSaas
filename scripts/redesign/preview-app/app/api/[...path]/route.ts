import { NextResponse } from "next/server";
import { itensPromocaoOperacao } from "../../../fixtures-operacao";
import { serieQueda } from "../../../fixtures-decisao";
export async function GET(req: Request) {
  const caminho = new URL(req.url).pathname;
  if (caminho === "/api/queda") return NextResponse.json({dias:serieQueda,anuncios:[]});
  if (caminho === "/api/automacoes/itens") return NextResponse.json(itensPromocaoOperacao);
  if (caminho === "/api/automacoes/contagem") return NextResponse.json({participando:12,agendados:4,pendentes:8,meliPct:null,sellerPct:null});
  if (caminho === "/api/promocoes/piso") return NextResponse.json({usarComoPiso:false,toleranciaPct:5});
  if (caminho.startsWith("/api/empresas/")) return NextResponse.json({operacoes:[{id:"fixture-demo",nome:"Operação de demonstração",slug:"fixture",contas:2,pedidos:842,conectadas:1}]});
  if (new URL(req.url).pathname === "/api/operacao") {
    const op = { id: "fixture-demo", nome: "Operação de demonstração", empresa: "Loja demonstração · fixture", organizacaoId: "fixture-org", canais: 3 };
    return NextResponse.json({ ...op, operacoes: [op] });
  }
  if (new URL(req.url).pathname.includes("atualiz")) return NextResponse.json({ operacao: { nome: "Loja demonstração · fixture" }, pedido: null, ultima: {} });
  return NextResponse.json({ fixture: true, dados: [], erro: "Fonte não incluída nesta fixture isolada." }, {status: 501});
}
const bloqueada = () => NextResponse.json({ erro: "Escrita bloqueada: preview com fixtures isoladas, sem integração real." }, { status: 403 });
export const POST = bloqueada;
export const PUT = bloqueada;
export const PATCH = bloqueada;
export const DELETE = bloqueada;
