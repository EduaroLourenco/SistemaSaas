import { Suspense, cloneElement, isValidElement, type ReactElement } from "react";
import { notFound } from "next/navigation";
import { ROTAS_DECISAO } from "../../rotas-decisao";
import { ROTAS_OPERACAO } from "../../rotas-operacao";
import { ROTAS_ESTUDIO_FINANCEIRO } from "../../rotas-estudio-financeiro";
import { ROTAS_GESTAO } from "../../rotas-gestao";

const rotas = { ...ROTAS_DECISAO, ...ROTAS_OPERACAO, ...ROTAS_ESTUDIO_FINANCEIRO, ...ROTAS_GESTAO };
export default async function Preview({ params, searchParams }: { params: Promise<{ rota: string[] }>; searchParams: Promise<{ sku?: string }> }) {
  const { rota } = await params;
  const caminho = "/" + rota.join("/");
  const conteudo = rotas[caminho] ?? (caminho.startsWith("/convite/") ? rotas["/convite/demonstracao"] : caminho.startsWith("/relatorio/") ? rotas["/relatorio/demonstracao"] : undefined);
  if (!conteudo) notFound();
  const { sku } = await searchParams;
  const tela = caminho === "/promocoes/comparar" && isValidElement(conteudo)
    ? cloneElement(conteudo as ReactElement<{ buscaInicial?: string }>, { buscaInicial: sku ?? "" })
    : conteudo;
  return <Suspense fallback={<div className="p-6 text-ink-2">Carregando prévia…</div>}>{tela}</Suspense>;
}
