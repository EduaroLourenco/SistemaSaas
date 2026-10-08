import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarPrecoAlvo } from "./preco-alvo";
import type { BaseMLBEntry, CustoSku, FormulaBaseData } from "@/lib/planilhas/motor-promocoes";

/**
 * O que a regra de margem das promoções precisa: o custo de cada SKU.
 *
 * Sai do preço-alvo, de propósito — o frete por unidade (praticado quando
 * houve venda, faixa de peso quando não) é o mesmo que aquela tela usa, e
 * duas telas chegando a pisos diferentes para o mesmo SKU seria pior que
 * nenhuma. Só entra SKU com tudo preenchido: custo pela metade daria um
 * piso baixo demais, que é exatamente o prejuízo que a regra existe para
 * impedir.
 */
export async function carregarCustosPromocao(): Promise<{ custos: Map<string, CustoSku>; incompletos: number }> {
  const { linhas } = await carregarPrecoAlvo();
  const custos = new Map<string, CustoSku>();
  let incompletos = 0;
  for (const l of linhas) {
    if (l.mercadoria == null || l.embalagem == null || l.impostoPct == null || l.frete == null) {
      incompletos++;
      continue;
    }
    custos.set(l.sku.trim().toUpperCase(), {
      mercadoria: l.mercadoria,
      embalagem: l.embalagem,
      frete: l.frete,
      impostoPct: l.impostoPct,
    });
  }
  return { custos, incompletos };
}

/**
 * Uma "Fórmula base" vazia, só com o tipo e a alíquota de cada anúncio,
 * lidos da sincronização. É o que deixa uma empresa sem Fórmula base usar
 * a regra de margem: o motor precisa saber se o anúncio é clássico ou
 * premium para achar a comissão, e isso o Meli já informou.
 */
export async function baseDosAnuncios(): Promise<FormulaBaseData> {
  const sb = await clienteServidor();
  const anuncios = (await paginar(() =>
    sb.from("anuncios").select("codigo_externo,tipo,comissao_atual").order("id")
  )) as unknown as { codigo_externo: string; tipo: string | null; comissao_atual: number | string | null }[];
  const baseMlb = new Map<string, BaseMLBEntry>();
  for (const a of anuncios) {
    baseMlb.set(String(a.codigo_externo).toUpperCase(), {
      tipo: a.tipo ?? "",
      // O anúncio guarda em pontos (11,5); o motor trabalha em fração (0,115).
      padrao: a.comissao_atual != null ? Number(a.comissao_atual) / 100 : 0,
    });
  }
  return { baseMlb, precosSKU: new Map(), precosMLB: new Map() };
}
