import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { operacaoPadrao } from "./operacao";
import type { FormulaBaseData } from "@/lib/planilhas/motor-promocoes";

/**
 * Reconstrói a Fórmula base a partir do banco.
 *
 * A base muda poucas vezes por ano; a planilha de promoção chega toda
 * semana. Exigir o reenvio da base a cada processamento era pedir o mesmo
 * arquivo de novo — e abria espaço para alguém mandar uma versão velha
 * sem perceber, o que mudaria silenciosamente todo preço calculado.
 *
 * Devolve a versão VIGENTE: a de `vigente_de` mais recente que não seja
 * futura. Isso é o que permite reprocessar uma campanha antiga com a base
 * que valia na época, quando essa necessidade aparecer.
 */

export type BaseDoBanco = {
  dados: FormulaBaseData;
  vigenteDe: string;
  itens: number;
  /** Tipos completados pelo catálogo, por não estarem na base. */
  doCatalogo: number;
  precos: number;
};

/**
 * A operação da sessão, ou null fora de uma requisição.
 *
 * `operacaoPadrao()` lê cookie, e cookie não existe em script. Ali quem
 * chama passa a operação na mão — o `catch` existe para isso, não para
 * esconder erro.
 */
async function operacaoDaSessao(): Promise<string | null> {
  try {
    return (await operacaoPadrao())?.id ?? null;
  } catch {
    return null;
  }
}

export async function carregarFormulaBase(
  emQue?: string,
  /** A operação dona da base. Obrigatória fora de uma requisição. */
  operacaoId?: string
): Promise<BaseDoBanco | null> {
  const sb = await clienteServidor();
  const corte = emQue ?? new Date().toISOString().slice(0, 10);

  /*
   * A operação filtra TODAS as consultas daqui.
   *
   * Sem isso, `vigente_de` mais recente era o de qualquer empresa: em
   * 28/10/2026 a Probel (base de 30/09, 1.379 itens) recebia a vigência
   * de 22/10 de outra empresa, com 82 itens. No app o RLS salvava — a
   * sessão só enxerga a própria —, mas com a chave de serviço (os
   * scripts locais) não havia nada segurando.
   *
   * O efeito medido era base VAZIA, que o sistema trata como "sem
   * tabela" e portanto como "não sei" — nenhum preço errado saiu daqui.
   * Mesmo assim: toda leitura filtra a operação, que é a regra escrita
   * em `relatorio.ts` e vale para esta também.
   */
  const operacao = operacaoId ?? (await operacaoDaSessao());
  if (!operacao) return null;

  const { data: versoes } = await sb
    .from("formula_base_itens")
    .select("vigente_de")
    .eq("operacao_id", operacao)
    .lte("vigente_de", corte)
    .order("vigente_de", { ascending: false })
    .limit(1);

  const vigenteDe = versoes?.[0]?.vigente_de as string | undefined;
  if (!vigenteDe) return null;

  const [itens, precos] = await Promise.all([
    paginar(() =>
      sb
        .from("formula_base_itens")
        .select("mlb,tipo_anuncio,comissao_padrao")
        .eq("operacao_id", operacao)
        .eq("vigente_de", vigenteDe)
    ),
    paginar(() =>
      sb
        .from("formula_base_precos")
        .select("chave_tipo,chave,comissao,preco")
        .eq("operacao_id", operacao)
        .eq("vigente_de", vigenteDe)
    ),
  ]);

  const baseMlb = new Map<string, { tipo: string; padrao: number }>();
  for (const i of itens) {
    baseMlb.set(String(i.mlb), {
      tipo: i.tipo_anuncio === "premium" ? "Premium" : "Clássico",
      padrao: Number(i.comissao_padrao),
    });
  }

  /*
   * O motor busca com `row[k]`, onde `k` é a comissão arredondada a três
   * casas — então cada linha é um OBJETO simples, não um Map. Trocar por
   * Map aqui não daria erro nenhum: o motor apenas não acharia preço e
   * recusaria todos os itens, silenciosamente.
   */
  const precosSKU = new Map<string, Record<number, number>>();
  const precosMLB = new Map<string, Record<number, number>>();
  for (const p of precos) {
    const alvo = p.chave_tipo === "mlb" ? precosMLB : precosSKU;
    const chave = String(p.chave);
    const linha = alvo.get(chave) ?? {};
    linha[Math.round(Number(p.comissao) * 1000) / 1000] = Number(p.preco);
    alvo.set(chave, linha);
  }

  /*
   * O tipo que falta na base vem do catálogo, não de pendência.
   *
   * O motor recusa com "anúncio sem tipo cadastrado" quando o MLB não está
   * em `formula_base_itens` — e o Meli cobra tarifa diferente de clássico
   * e premium, então sem o tipo ele realmente não sabe qual alíquota usar.
   *
   * Só que o tipo está em `anuncios`, lido da API na sincronização, para
   * TODO anúncio. Exigi-lo duplicado dentro da base é exigir que alguém
   * recadastre à mão o que o canal já informou: na Bom de Compras isso
   * recusava 90 dos 108 itens de uma campanha cujo tipo o banco conhecia
   * inteiro (66 premium, 42 clássico).
   *
   * Então a base manda, e o catálogo completa o que ela não diz. A ordem
   * importa: quem cadastrou a base cadastrou por um motivo, e um tipo
   * trocado no canal não deve reescrever a decisão de quem a montou.
   *
   * `comissao_atual` entra quando existe — é a tarifa real daquele
   * anúncio, melhor que a alíquota padrão do tipo. Está em pontos
   * percentuais na coluna (16.5 = 16,5%), e o motor compara em fração.
   */
  const faltantes = await paginar(() =>
    sb
      .from("anuncios")
      .select("codigo_externo,tipo,comissao_atual")
      .eq("operacao_id", operacao)
      .order("id")
  );
  let completados = 0;
  for (const a of faltantes) {
    const mlb = String(a.codigo_externo);
    if (!a.tipo || baseMlb.has(mlb)) continue;
    const pct = Number(a.comissao_atual);
    baseMlb.set(mlb, {
      tipo: a.tipo === "premium" ? "Premium" : "Clássico",
      padrao: pct > 0 && pct < 100 ? pct / 100 : 0,
    });
    completados++;
  }

  return {
    dados: { baseMlb, precosSKU, precosMLB },
    vigenteDe,
    itens: itens.length,
    /** Quantos tipos vieram do catálogo por não estarem na base. */
    doCatalogo: completados,
    precos: precos.length,
  };
}
