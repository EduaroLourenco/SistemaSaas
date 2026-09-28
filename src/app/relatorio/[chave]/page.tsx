import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { montarRelatorio } from "@/lib/dados/relatorio";
import { usuarioAtual } from "@/lib/supabase/servidor";
import { RelatorioCliente } from "./relatorio-cliente";

export const dynamic = "force-dynamic";
/** A montagem lê o ano inteiro de pedidos; 60s não sobra, 120 sobra. */
export const maxDuration = 120;

export const metadata = {
  title: "Raio-X da operação",
  robots: { index: false, follow: false },
};

/**
 * O relatório, aberto por link com chave.
 *
 * Fica fora do menu de propósito: o Eduardo manda o endereço para gestor e
 * diretoria, e ninguém precisa de conta para ler. A chave vive em
 * `RELATORIO_CHAVE`, no ambiente — não no código, e não no banco.
 *
 * Sem a variável definida, a página só abre para quem está logado. É o
 * comportamento seguro: melhor a página não abrir do que abrir o
 * faturamento da operação para qualquer endereço adivinhado.
 */
function chaveCerta(recebida: string) {
  const esperada = process.env.RELATORIO_CHAVE;
  if (!esperada) return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function Relatorio({
  params,
  searchParams,
}: {
  params: Promise<{ chave: string }>;
  searchParams: Promise<{ dias?: string; canal?: string }>;
}) {
  const { chave } = await params;
  const { dias, canal } = await searchParams;

  if (!chaveCerta(chave)) {
    const usuario = await usuarioAtual();
    if (!usuario) notFound();
  }

  const janela = Math.min(90, Math.max(1, Number(dias) || 7));
  const dados = await montarRelatorio({ dias: janela, canal: canal ?? null });

  return <RelatorioCliente dados={dados} chave={chave} />;
}
