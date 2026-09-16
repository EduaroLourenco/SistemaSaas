import { carregarAnaliseSku } from "@/lib/dados/analise-sku";
import AnaliseSkuCliente from "./analise-sku-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { SemFonte } from "@/components/ui/sem-fonte";

export const dynamic = "force-dynamic";

/**
 * Análise de SKU.
 *
 * O período e o canal vêm da URL, não do estado do cliente: o recorte
 * muda o que o servidor agrega, e um link para "PA85351 em agosto no
 * Meli" precisa poder ser colado no chat de alguém.
 *
 * Os períodos de comparação seguem a mesma regra, em `cmp`: pares
 * `inicio~fim` separados por vírgula. Feio de ler, e o preço de manter a
 * comparação inteira dentro de um link que se cola no chat.
 */

/** `2026-01-01~2026-03-31,2025-01-01~2025-03-31` → dois períodos. */
function lerComparacoes(bruto?: string) {
  if (!bruto) return undefined;
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const pares = bruto
    .split(",")
    .map((p) => p.split("~"))
    .filter(
      (p): p is [string, string] =>
        p.length === 2 && ISO.test(p[0]) && ISO.test(p[1]) && p[0] <= p[1]
    )
    .slice(0, 2)
    .map(([inicio, fim]) => ({ inicio, fim }));
  return pares.length ? pares : undefined;
}

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{
    de?: string;
    ate?: string;
    canal?: string;
    cmp?: string;
  }>;
}) {
  const { de, ate, canal, cmp } = await searchParams;
  const dados = await carregarAnaliseSku({
    inicio: de,
    fim: ate,
    canalId: canal || undefined,
    comparar: lerComparacoes(cmp),
  });

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Análise de SKU" breadcrumb="Vendas" />
        <PageBody>
          <SemFonte
            titulo="Nenhuma venda no recorte"
            origem="Os dados vêm da listagem de pedidos. Importe-a na tela de Importar, ou amplie o período escolhido."
          />
        </PageBody>
      </>
    );
  }

  return <AnaliseSkuCliente dados={dados} />;
}
