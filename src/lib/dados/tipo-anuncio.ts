import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";

/**
 * Clássico contra Premium — o que a tarifa a mais comprou.
 *
 * O Premium existe para comprar visibilidade: paga alguns pontos a mais de
 * tarifa e, em troca, deveria receber mais visitas e converter melhor. É
 * uma promessa verificável, e nada no sistema a verificava.
 *
 * A conta é direta: quanto de tarifa o Premium custou a mais sobre a
 * receita que ele gerou, contra quanto de visita e conversão ele trouxe a
 * mais. Se o custo extra não vira venda extra, o anúncio está pagando por
 * um serviço que não recebeu.
 *
 * ── Uma ressalva que precisa acompanhar o número ──
 *
 * Clássico e Premium não anunciam os mesmos produtos. Comparar as médias
 * dos dois grupos compara também o mix, e mix explica diferença sem que
 * nada esteja errado com o tipo de anúncio.
 *
 * Por isso existe a comparação POR SKU: quando o mesmo SKU aparece nos
 * dois tipos, a diferença é do tipo, não do produto. Essa é a única
 * comparação que decide algo — as médias servem para levantar a pergunta.
 */

export type ResumoTipo = {
  tipo: "classico" | "premium" | "outro";
  anuncios: number;
  visitas: number;
  vendas: number;
  receita: number;
  conversao: number;
  tarifaMedia: number;
  /** Tarifa em reais sobre a receita observada. */
  custoTarifa: number;
  visitasPorAnuncio: number;
};

export type ParSku = {
  sku: string;
  titulo: string;
  classico: { visitas: number; vendas: number; receita: number; conversao: number; tarifa: number };
  premium: { visitas: number; vendas: number; receita: number; conversao: number; tarifa: number };
  /** Quanto o Premium custou a mais em tarifa, nas vendas que teve. */
  custoExtra: number;
  /** Diferença de conversão, em pontos percentuais. */
  ganhoConversao: number;
  /** Razão entre visitas do Premium e do Clássico. */
  razaoVisitas: number;
};

export type DadosTipo = {
  resumo: ResumoTipo[];
  pares: ParSku[];
  semanas: number;
  vazio: boolean;
};

type LinhaDesempenho = {
  anuncio_id: string;
  visitas: number;
  vendas: number;
  receita: string | number;
  ano_iso: number;
  semana_iso: number;
};

type LinhaAnuncio = {
  id: string;
  tipo: "classico" | "premium" | "outro";
  sku_canal: string | null;
  titulo: string;
  comissao_atual: string | number | null;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

export async function carregarTipoAnuncio(): Promise<DadosTipo> {
  const sb = await clienteServidor();

  const [desempenho, anuncios] = await Promise.all([
    paginar(() =>
      sb
        .from("anuncio_desempenho_semanal")
        .select("anuncio_id,visitas,vendas,receita,ano_iso,semana_iso")
        .order("ano_iso", { ascending: true })
    ),
    paginar(() =>
      sb
        .from("anuncios")
        .select("id,tipo,sku_canal,titulo,comissao_atual")
        .order("id")
    ),
  ]);

  const linhas = desempenho as unknown as LinhaDesempenho[];
  const cadastro = anuncios as unknown as LinhaAnuncio[];

  if (!linhas.length || !cadastro.length) {
    return { resumo: [], pares: [], semanas: 0, vazio: true };
  }

  const porId = new Map(cadastro.map((a) => [a.id, a]));

  /* ── Resumo por tipo ── */
  type Acc = ResumoTipo & { anunciosSet: Set<string>; somaTarifa: number; comTarifa: number };
  const tipos = new Map<string, Acc>();

  for (const d of linhas) {
    const a = porId.get(d.anuncio_id);
    if (!a) continue;

    const at =
      tipos.get(a.tipo) ??
      ({
        tipo: a.tipo,
        anuncios: 0,
        visitas: 0,
        vendas: 0,
        receita: 0,
        conversao: 0,
        tarifaMedia: 0,
        custoTarifa: 0,
        visitasPorAnuncio: 0,
        anunciosSet: new Set<string>(),
        somaTarifa: 0,
        comTarifa: 0,
      } as Acc);

    at.anunciosSet.add(d.anuncio_id);
    at.visitas += d.visitas ?? 0;
    at.vendas += d.vendas ?? 0;
    at.receita += n(d.receita);
    tipos.set(a.tipo, at);
  }

  // A tarifa é do anúncio, não da semana: somá-la por linha de desempenho
  // pesaria mais os anúncios com mais semanas importadas.
  for (const a of cadastro) {
    const at = tipos.get(a.tipo);
    if (!at || !at.anunciosSet.has(a.id)) continue;
    if (a.comissao_atual != null) {
      at.somaTarifa += n(a.comissao_atual);
      at.comTarifa += 1;
    }
  }

  const resumo: ResumoTipo[] = [...tipos.values()]
    .map((t) => {
      const tarifaMedia = t.comTarifa ? t.somaTarifa / t.comTarifa : 0;
      return {
        tipo: t.tipo,
        anuncios: t.anunciosSet.size,
        visitas: t.visitas,
        vendas: t.vendas,
        receita: t.receita,
        conversao: t.visitas ? (t.vendas * 100) / t.visitas : 0,
        tarifaMedia,
        custoTarifa: (t.receita * tarifaMedia) / 100,
        visitasPorAnuncio: t.anunciosSet.size ? t.visitas / t.anunciosSet.size : 0,
      };
    })
    .sort((a, b) => b.receita - a.receita);

  /* ── Pares: o mesmo SKU nos dois tipos ──
   *
   * É a comparação que decide. Nas médias, mix e tipo estão misturados;
   * aqui o produto é o mesmo dos dois lados, então o que sobra é o tipo.
   */
  type LadoAcc = { visitas: number; vendas: number; receita: number; tarifa: number };
  const porSku = new Map<
    string,
    { titulo: string; classico: LadoAcc; premium: LadoAcc }
  >();

  const zero = (): LadoAcc => ({ visitas: 0, vendas: 0, receita: 0, tarifa: 0 });

  for (const d of linhas) {
    const a = porId.get(d.anuncio_id);
    if (!a?.sku_canal) continue;
    if (a.tipo !== "classico" && a.tipo !== "premium") continue;

    const at =
      porSku.get(a.sku_canal) ??
      { titulo: a.titulo, classico: zero(), premium: zero() };

    const lado = a.tipo === "classico" ? at.classico : at.premium;
    lado.visitas += d.visitas ?? 0;
    lado.vendas += d.vendas ?? 0;
    lado.receita += n(d.receita);
    if (a.comissao_atual != null) lado.tarifa = n(a.comissao_atual);

    porSku.set(a.sku_canal, at);
  }

  const pares: ParSku[] = [];
  for (const [sku, v] of porSku) {
    // Só entra quem existe nos DOIS tipos e teve visita nos dois. Sem
    // visita de um lado não há comparação, há ausência.
    if (!v.classico.visitas || !v.premium.visitas) continue;

    const convC = (v.classico.vendas * 100) / v.classico.visitas;
    const convP = (v.premium.vendas * 100) / v.premium.visitas;

    pares.push({
      sku,
      titulo: v.titulo,
      classico: { ...v.classico, conversao: convC },
      premium: { ...v.premium, conversao: convP },
      custoExtra:
        (v.premium.receita * (v.premium.tarifa - v.classico.tarifa)) / 100,
      ganhoConversao: convP - convC,
      razaoVisitas: v.premium.visitas / v.classico.visitas,
    });
  }

  pares.sort((a, b) => b.custoExtra - a.custoExtra);

  const semanas = new Set(linhas.map((d) => `${d.ano_iso}-${d.semana_iso}`)).size;

  return { resumo, pares, semanas, vazio: false };
}
