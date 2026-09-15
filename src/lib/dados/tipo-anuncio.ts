import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarTarifasCobradas, chaveSemana, type TarifasPorSemana } from "./tarifa-cobrada";
import { carregarContasRecorte } from "./contas-recorte";
import {
  lerRecorte,
  noRecorte,
  opcoesRecorte,
  nomeRecorte,
  type GrupoRecorte,
} from "@/lib/recorte";

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
 *
 * ── Tarifa de tabela e tarifa praticada ──
 *
 * `anuncios.comissao_atual` é a alíquota de TABELA: 11,5% no clássico,
 * 16,5% no premium. Quase nenhum anúncio paga isso — a maioria tem
 * redução negociada, e a média realmente cobrada nos pedidos fica bem
 * abaixo. Uma tela que compara o CUSTO dos dois tipos usando a tabela
 * compara um custo que ninguém pagou.
 *
 * Então as duas aparecem, lado a lado: a de tabela porque é a régua do
 * canal, e a praticada — vinda dos pedidos, via `tarifa-cobrada.ts` —
 * porque é o dinheiro. Quando a praticada não existe (semana sem pedido
 * com comissão informada), ela fica nula e a tela mostra traço; nunca
 * cai de volta para a tabela disfarçada de praticada.
 */

export type ResumoTipo = {
  tipo: "classico" | "premium" | "outro";
  anuncios: number;
  visitas: number;
  vendas: number;
  receita: number;
  conversao: number;
  tarifaMedia: number;
  /** Tarifa realmente cobrada nos pedidos, ponderada por receita. Nula sem cobertura. */
  tarifaPraticada: number | null;
  /** Fatia da receita que tem tarifa praticada conhecida, em %. */
  coberturaTarifa: number;
  /** Tarifa em reais sobre a receita observada, pela alíquota de tabela. */
  custoTarifa: number;
  /** O mesmo, pela tarifa praticada. Nulo quando ela não existe. */
  custoTarifaPraticada: number | null;
  visitasPorAnuncio: number;
};

type Lado = {
  visitas: number;
  vendas: number;
  receita: number;
  conversao: number;
  tarifa: number;
  tarifaPraticada: number | null;
};

export type ParSku = {
  sku: string;
  titulo: string;
  classico: Lado;
  premium: Lado;
  /** Quanto o Premium custou a mais em tarifa, nas vendas que teve. */
  custoExtra: number;
  /** O mesmo, pela tarifa praticada dos dois lados. Nulo se faltar um lado. */
  custoExtraPraticado: number | null;
  /** Diferença de conversão, em pontos percentuais. */
  ganhoConversao: number;
  /** Razão entre visitas do Premium e do Clássico. */
  razaoVisitas: number;
};

export type Periodo = { inicio: string; fim: string; semanas: number };

export type DadosTipo = {
  resumo: ResumoTipo[];
  pares: ParSku[];
  semanas: number;
  periodo: Periodo | null;
  /** Mesmo cálculo na janela imediatamente anterior, quando pedido. */
  anterior: { resumo: ResumoTipo[]; periodo: Periodo } | null;
  dias: number;
  opcoes: GrupoRecorte[];
  canalId: string;
  rotuloRecorte: string;
  vazio: boolean;
};

type LinhaDesempenho = {
  anuncio_id: string;
  visitas: number;
  vendas: number;
  receita: string | number;
  ano_iso: number;
  semana_iso: number;
  inicio: string;
};

type LinhaAnuncio = {
  id: string;
  tipo: "classico" | "premium" | "outro";
  sku_canal: string | null;
  titulo: string;
  codigo_externo: string;
  comissao_atual: string | number | null;
  canal_id: string;
  conta_canal_id: string;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

/** Soma ponderada de tarifa praticada — guardada crua para poder dividir no fim. */
type PesoTarifa = { soma: number; receita: number };

function media(p: PesoTarifa): number | null {
  return p.receita > 0 ? Number((p.soma / p.receita).toFixed(2)) : null;
}

function diaMenos(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * O agregado de uma janela.
 *
 * Separado da carga porque roda duas vezes quando se compara períodos —
 * e porque assim a comparação é garantidamente a MESMA conta nos dois
 * lados, não duas contas parecidas.
 */
function agregar(
  linhas: LinhaDesempenho[],
  porId: Map<string, LinhaAnuncio>,
  tarifas: TarifasPorSemana
): { resumo: ResumoTipo[]; pares: ParSku[]; semanas: number } {
  type Acc = {
    tipo: ResumoTipo["tipo"];
    visitas: number;
    vendas: number;
    receita: number;
    anunciosSet: Set<string>;
    somaTarifa: number;
    comTarifa: number;
    praticada: PesoTarifa;
  };
  const tipos = new Map<string, Acc>();

  for (const d of linhas) {
    const a = porId.get(d.anuncio_id);
    if (!a) continue;

    const at =
      tipos.get(a.tipo) ??
      ({
        tipo: a.tipo,
        visitas: 0,
        vendas: 0,
        receita: 0,
        anunciosSet: new Set<string>(),
        somaTarifa: 0,
        comTarifa: 0,
        praticada: { soma: 0, receita: 0 },
      } as Acc);

    at.anunciosSet.add(d.anuncio_id);
    at.visitas += d.visitas ?? 0;
    at.vendas += d.vendas ?? 0;
    const receita = n(d.receita);
    at.receita += receita;

    const praticada = tarifas.get(chaveSemana(a.codigo_externo, d.inicio));
    if (praticada != null && receita > 0) {
      at.praticada.soma += praticada * receita;
      at.praticada.receita += receita;
    }

    tipos.set(a.tipo, at);
  }

  // A tarifa de tabela é do anúncio, não da semana: somá-la por linha de
  // desempenho pesaria mais os anúncios com mais semanas importadas.
  for (const a of porId.values()) {
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
      const tarifaPraticada = media(t.praticada);
      return {
        tipo: t.tipo,
        anuncios: t.anunciosSet.size,
        visitas: t.visitas,
        vendas: t.vendas,
        receita: t.receita,
        conversao: t.visitas ? (t.vendas * 100) / t.visitas : 0,
        tarifaMedia,
        tarifaPraticada,
        coberturaTarifa: t.receita > 0 ? (t.praticada.receita * 100) / t.receita : 0,
        custoTarifa: (t.receita * tarifaMedia) / 100,
        custoTarifaPraticada:
          tarifaPraticada == null ? null : (t.receita * tarifaPraticada) / 100,
        visitasPorAnuncio: t.anunciosSet.size ? t.visitas / t.anunciosSet.size : 0,
      };
    })
    .sort((a, b) => b.receita - a.receita);

  /* ── Pares: o mesmo SKU nos dois tipos ──
   *
   * É a comparação que decide. Nas médias, mix e tipo estão misturados;
   * aqui o produto é o mesmo dos dois lados, então o que sobra é o tipo.
   */
  type LadoAcc = {
    visitas: number;
    vendas: number;
    receita: number;
    tarifa: number;
    praticada: PesoTarifa;
  };
  const porSku = new Map<string, { titulo: string; classico: LadoAcc; premium: LadoAcc }>();

  const zero = (): LadoAcc => ({
    visitas: 0,
    vendas: 0,
    receita: 0,
    tarifa: 0,
    praticada: { soma: 0, receita: 0 },
  });

  for (const d of linhas) {
    const a = porId.get(d.anuncio_id);
    if (!a?.sku_canal) continue;
    if (a.tipo !== "classico" && a.tipo !== "premium") continue;

    const at = porSku.get(a.sku_canal) ?? {
      titulo: a.titulo,
      classico: zero(),
      premium: zero(),
    };

    const lado = a.tipo === "classico" ? at.classico : at.premium;
    lado.visitas += d.visitas ?? 0;
    lado.vendas += d.vendas ?? 0;
    const receita = n(d.receita);
    lado.receita += receita;
    if (a.comissao_atual != null) lado.tarifa = n(a.comissao_atual);

    const praticada = tarifas.get(chaveSemana(a.codigo_externo, d.inicio));
    if (praticada != null && receita > 0) {
      lado.praticada.soma += praticada * receita;
      lado.praticada.receita += receita;
    }

    porSku.set(a.sku_canal, at);
  }

  const pares: ParSku[] = [];
  for (const [sku, v] of porSku) {
    // Só entra quem existe nos DOIS tipos e teve visita nos dois. Sem
    // visita de um lado não há comparação, há ausência.
    if (!v.classico.visitas || !v.premium.visitas) continue;

    const convC = (v.classico.vendas * 100) / v.classico.visitas;
    const convP = (v.premium.vendas * 100) / v.premium.visitas;
    const pratC = media(v.classico.praticada);
    const pratP = media(v.premium.praticada);

    pares.push({
      sku,
      titulo: v.titulo,
      classico: { ...v.classico, conversao: convC, tarifaPraticada: pratC },
      premium: { ...v.premium, conversao: convP, tarifaPraticada: pratP },
      custoExtra: (v.premium.receita * (v.premium.tarifa - v.classico.tarifa)) / 100,
      // Só existe quando os DOIS lados têm tarifa praticada: com um lado
      // na tabela e outro no praticado, a diferença seria de régua, não
      // de tipo de anúncio.
      custoExtraPraticado:
        pratC == null || pratP == null ? null : (v.premium.receita * (pratP - pratC)) / 100,
      ganhoConversao: convP - convC,
      razaoVisitas: v.premium.visitas / v.classico.visitas,
    });
  }

  pares.sort((a, b) => b.custoExtra - a.custoExtra);

  const semanas = new Set(linhas.map((d) => `${d.ano_iso}-${d.semana_iso}`)).size;
  return { resumo, pares, semanas };
}

export async function carregarTipoAnuncio(opcoes?: {
  /** Recorte por canal ou conta, no formato de `lerRecorte`. */
  canal?: string;
  /** Tamanho da janela em dias. 0 significa "todo o histórico". */
  dias?: number;
  /** Também calcular a janela imediatamente anterior, do mesmo tamanho. */
  comparar?: boolean;
}): Promise<DadosTipo> {
  const sb = await clienteServidor();
  const recorte = lerRecorte(opcoes?.canal);
  const dias = opcoes?.dias ?? 0;

  const [desempenho, anuncios, tarifas, contas] = await Promise.all([
    paginar(() =>
      sb
        .from("anuncio_desempenho_semanal")
        .select("anuncio_id,visitas,vendas,receita,ano_iso,semana_iso,inicio")
        .order("inicio", { ascending: true })
    ),
    paginar(() =>
      sb
        .from("anuncios")
        .select(
          "id,tipo,sku_canal,titulo,codigo_externo,comissao_atual,canal_id,conta_canal_id"
        )
        .order("id")
    ),
    carregarTarifasCobradas(sb),
    carregarContasRecorte(),
  ]);

  const grupos = opcoesRecorte(contas);
  const rotuloRecorte = nomeRecorte(recorte, contas);
  const canalId = opcoes?.canal ?? "";

  const todasLinhas = desempenho as unknown as LinhaDesempenho[];
  const cadastro = anuncios as unknown as LinhaAnuncio[];

  const vazio = (): DadosTipo => ({
    resumo: [],
    pares: [],
    semanas: 0,
    periodo: null,
    anterior: null,
    dias,
    opcoes: grupos,
    canalId,
    rotuloRecorte,
    vazio: true,
  });

  if (!todasLinhas.length || !cadastro.length) return vazio();

  // O recorte entra pelo ANÚNCIO: é ele que pertence a uma conta. Filtrar
  // o cadastro antes do join descarta as linhas de desempenho das outras
  // contas de graça, sem varrer duas vezes.
  const porId = new Map(
    cadastro
      .filter((a) =>
        noRecorte(recorte, { canalId: a.canal_id, contaCanalId: a.conta_canal_id })
      )
      .map((a) => [a.id, a])
  );
  if (!porId.size) return vazio();

  const noCadastro = todasLinhas.filter((d) => porId.has(d.anuncio_id));
  if (!noCadastro.length) return vazio();

  /*
   * A janela é ancorada na semana mais recente que EXISTE no dado, não em
   * hoje. O relatório de desempenho chega por importação manual e costuma
   * estar uma ou duas semanas atrás; ancorar em hoje faria "últimos 30
   * dias" devolver duas semanas e parecer queda.
   */
  const ultima = noCadastro[noCadastro.length - 1].inicio.slice(0, 10);
  const primeira = noCadastro[0].inicio.slice(0, 10);

  const corte = dias > 0 ? diaMenos(ultima, dias - 1) : primeira;
  const janela = noCadastro.filter((d) => d.inicio.slice(0, 10) >= corte);
  if (!janela.length) return vazio();

  const atual = agregar(janela, porId, tarifas);
  const periodo: Periodo = {
    inicio: janela[0].inicio.slice(0, 10),
    fim: ultima,
    semanas: atual.semanas,
  };

  let anterior: DadosTipo["anterior"] = null;
  if (opcoes?.comparar && dias > 0) {
    const fimAnt = diaMenos(corte, 1);
    const inicioAnt = diaMenos(fimAnt, dias - 1);
    const linhasAnt = noCadastro.filter((d) => {
      const i = d.inicio.slice(0, 10);
      return i >= inicioAnt && i <= fimAnt;
    });
    if (linhasAnt.length) {
      const calc = agregar(linhasAnt, porId, tarifas);
      anterior = {
        resumo: calc.resumo,
        periodo: {
          inicio: linhasAnt[0].inicio.slice(0, 10),
          fim: linhasAnt[linhasAnt.length - 1].inicio.slice(0, 10),
          semanas: calc.semanas,
        },
      };
    }
  }

  return {
    resumo: atual.resumo,
    pares: atual.pares,
    semanas: atual.semanas,
    periodo,
    anterior,
    dias,
    opcoes: grupos,
    canalId,
    rotuloRecorte,
    vazio: false,
  };
}
