import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarTarifasCobradas } from "./tarifa-cobrada";
import { carregarFormulaBase } from "./formula-base";
import { carregarVitrineSemanal } from "./vitrine-semanal";
import type { Anuncio } from "@/lib/analise";
import type { DiaMovimento } from "@/lib/periodo-anuncios";

/**
 * Anúncios lidos do banco, com o histórico por dia.
 *
 * O período é escolhido na tela, que soma estes dias: trocar de período não
 * volta ao servidor nem perde os filtros.
 */

export type DadosAnalise = {
  anuncios: Anuncio[];
  /** Hoje em São Paulo: num servidor em UTC, depois das 21h a data já virou. */
  hoje: string;
  /** O dia mais antigo com movimento. Antes dele não há o que comparar. */
  primeiraData: string | null;
};

type LinhaCadastro = {
  codigo_externo: string;
  titulo: string;
  sku_canal: string | null;
  tipo: string;
  status: string;
  estoque: number | null;
  preco_atual: string | number | null;
  sincronizado_em: string | null;
  contas_canal: { nome: string } | null;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

/**
 * Categoria a partir do título.
 *
 * A planilha do canal não traz categoria, e o banco só a terá quando os
 * produtos forem cadastrados. Derivar da primeira palavra do título é
 * aproximação honesta: agrupa colchão com colchão, travesseiro com
 * travesseiro, e erra de forma visível em vez de silenciosa.
 */
function categoriaDe(titulo: string): string {
  const limpo = titulo.trim();
  if (!limpo) return "Sem categoria";
  const primeira = limpo.split(/\s+/)[0];
  return primeira.charAt(0).toUpperCase() + primeira.slice(1).toLowerCase();
}

/**
 * O preço de tabela de um anúncio, na comissão padrão dele.
 *
 * Procura por SKU e cai para MLB — a Fórmula base tem as duas chaves, o
 * SKU cobre quase tudo, e o MLB existe para o caso de o mesmo SKU ter
 * preço diferente por anúncio. Devolve 0 quando o anúncio não está na
 * tabela, que é o que a tela já trata como "sem tabela": são 135 dos
 * 1.004 anúncios da Probel, e inventar um preço para eles faria a tela
 * acusar desvio de um número que ninguém definiu.
 */
function precoDeTabela(
  base: Awaited<ReturnType<typeof carregarFormulaBase>>,
  mlb: string,
  sku: string | null,
): number {
  if (!base) return 0;
  const item = base.dados.baseMlb.get(mlb);
  if (!item) return 0;
  const comissao = Math.round(item.padrao * 1000) / 1000;
  const porMlb = base.dados.precosMLB.get(mlb);
  const porSku = sku ? base.dados.precosSKU.get(sku) : undefined;
  /* O MLB ganha do SKU: ele só existe quando alguém quis um preço
     diferente para aquele anúncio. */
  const achado = porMlb?.[comissao] ?? porSku?.[comissao];
  return achado ?? 0;
}

export async function carregarAnalise(): Promise<DadosAnalise> {
  const sb = await clienteServidor();

  const [visitas, itens, tarifas, base, vitrine, cadastro] = await Promise.all([
    paginar(() =>
      sb
        .from("anuncio_desempenho_diario")
        .select("data,visitas,anuncios!inner(codigo_externo)")
        .ilike("anuncios.codigo_externo", "MLB%")
    ),
    /*
     * Venda vem dos pedidos: a diária só tem visita. E a semanal não serve de
     * fonte: até junho de 2026 ela ficou sem as contas da Probel, e janeiro
     * mostrava R$ 37 mil por semana onde os pedidos têm R$ 215 mil.
     */
    paginar(() =>
      sb
        .from("pedido_itens")
        .select("codigo_externo,quantidade,preco_unitario,pedidos!inner(data,cancelado)")
        .eq("pedidos.cancelado", false)
        .ilike("codigo_externo", "MLB%")
    ),
    carregarTarifasCobradas(sb),
    carregarFormulaBase(),
    carregarVitrineSemanal(sb),
    paginar(() => sb.from("anuncios").select("codigo_externo,titulo,sku_canal,tipo,status,estoque,preco_atual,sincronizado_em,contas_canal(nome)").ilike("codigo_externo", "MLB%").order("codigo_externo")),
  ]);

  /* Hoje no fuso de São Paulo, não no do servidor. */
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  const dias = new Map<string, Map<string, DiaMovimento>>();
  const diaDe = (mlb: string, data: string) => {
    const doAnuncio = dias.get(mlb) ?? new Map<string, DiaMovimento>();
    dias.set(mlb, doAnuncio);
    const dia = doAnuncio.get(data) ?? ([data, null, 0, 0] as DiaMovimento);
    doAnuncio.set(data, dia);
    return dia;
  };

  for (const v of visitas as unknown as { data: string; visitas: number; anuncios: { codigo_externo: string } | null }[]) {
    if (v.anuncios) diaDe(v.anuncios.codigo_externo.toUpperCase(), v.data.slice(0, 10))[1] = v.visitas;
  }
  for (const it of itens as unknown as { codigo_externo: string; quantidade: number; preco_unitario: number; pedidos: { data: string } | null }[]) {
    if (!it.pedidos?.data) continue;
    const dia = diaDe(it.codigo_externo.toUpperCase(), it.pedidos.data.slice(0, 10));
    const unidades = Number(it.quantidade) || 0;
    dia[2] += unidades;
    dia[3] = Math.round((dia[3] + unidades * (Number(it.preco_unitario) || 0)) * 100) / 100;
  }

  /* As duas fontes vêm com chave `MLB|segunda`; na tela elas ficam no anúncio. */
  const porAnuncio = (mapa: Map<string, number>) => {
    const saida = new Map<string, Record<string, number>>();
    for (const [chave, valor] of mapa) {
      const [mlb, segunda] = chave.split("|");
      const doAnuncio = saida.get(mlb) ?? {};
      doAnuncio[segunda] = valor;
      saida.set(mlb, doAnuncio);
    }
    return saida;
  };
  const vitrines = porAnuncio(vitrine);
  const cobradas = porAnuncio(tarifas);

  // Falta de histórico não torna um anúncio invisível: o cadastro manda.
  const anuncios: Anuncio[] = (cadastro as unknown as LinhaCadastro[]).map((a) => {
    const mlb = a.codigo_externo;
    return {
      mlb,
      sku: a.sku_canal ?? "",
      titulo: a.titulo,
      tipo: a.tipo === "premium" ? "Premium" : "Clássico",
      status: a.status === "pausado" ? "pausado" : a.status === "finalizado" ? "finalizado" : "ativo",
      conta: a.contas_canal?.nome ?? "Conta principal",
      categoria: categoriaDe(a.titulo),
      estoque: a.estoque,
      precoAtual: a.preco_atual == null ? null : n(a.preco_atual),
      sincronizadoEm: a.sincronizado_em,
      precoReferencia: precoDeTabela(base, mlb, a.sku_canal) || null,
      semanas: [],
      movimento: [...(dias.get(mlb.toUpperCase())?.values() ?? [])].sort((x, y) => x[0].localeCompare(y[0])),
      vitrine: vitrines.get(mlb),
      tarifas: cobradas.get(mlb),
    };
  });

  const primeiraData = anuncios.reduce<string | null>((menor, a) => {
    const d = a.movimento?.[0]?.[0];
    return d && (!menor || d < menor) ? d : menor;
  }, null);

  return { anuncios, hoje, primeiraData };
}
