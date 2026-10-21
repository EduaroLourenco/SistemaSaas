import "server-only";

/**
 * A família de um anúncio: o grupo que o Mercado Livre trata como um
 * produto só.
 *
 * ── Por que importa ──
 *
 * O canal agrupa os TAMANHOS do mesmo colchão numa página: solteiro,
 * viúva, casal, queen e king do Turim ficam juntos, e o cliente troca
 * de tamanho ali dentro sem sair. O patrocínio é do grupo, a disputa
 * de catálogo é do grupo, e a venda que uma oferta gera pode sair em
 * qualquer um deles.
 *
 * Decidir por MLB o que o canal decide por família produziu três erros
 * reais, todos observados na Probel em 21/10/2026:
 *
 *   · tráfego pago mandou desligar o MLB5382536864, que não vendeu,
 *     sem ver que os irmãos dele vendem — e desligar derruba o grupo;
 *   · catálogo listou como "disputando" o anúncio premium que perde
 *     para o clássico da própria casa, sugerindo baixar preço contra
 *     si mesmo;
 *   · a análise de oferta relâmpago deu +R$ 2.350 onde o número certo
 *     era quase o triplo, porque a venda saiu num tamanho irmão.
 *
 * ── As duas fontes, nesta ordem ──
 *
 * 1. `familia_id` do canal (`parent_id` do produto de catálogo). É
 *    exato. Cobre 261 dos 1.036 anúncios ativos da Probel.
 *
 * 2. Opcional, DESLIGADO por padrão: para os que não estão em
 *    catálogo, o modelo tirado do título, usado só para encaixar o
 *    anúncio numa família que o canal já declarou.
 *
 * A segunda é opcional porque não é certeza. Medido contra o canal, o
 * modelo do título acerta 39 das 48 famílias — erra 9, e erra junto:
 * "Siena" aponta para três famílias diferentes, "Boa Forma" para
 * quatro. Um palpite que une duas famílias é pior que anúncio
 * sozinho, porque soma venda de produto que não tem relação.
 *
 * E ele rende pouco: na Probel, encaixou 69 anúncios a mais e mexeu
 * menos de R$ 1.000 na leitura das ofertas de 19 e 20/10. Pouco ganho
 * para o risco de juntar o que não é o mesmo produto — por isso quem
 * quiser, liga.
 *
 * O que não se encaixa fica sozinho, e isso é dito em vez de
 * adivinhado.
 */

/** Palavras que descrevem o tamanho, não o modelo. */
const TAMANHOS =
  /\b(solteiro|viúva|viuva|casal|queen|king|super\s*king|berço|berco|baby|bicama|pet|m[ée]dio|grande|pequeno)\b/gi;
const MEDIDAS = /\(?\s*\d{2,3}\s*[x×]\s*\d{2,3}(\s*[x×]\s*\d{2,3})?\s*(cm)?\s*\)?/gi;
const CORES = /\b(branco|branca|cinza|preto|preta|bege|azul|marrom)\b/gi;
const RUIDO =
  /\b(colch[ãa]o|conjunto|box|mola|molas|ensacada|espuma|d\d{2}|a\s*v[áa]cuo|embalado|com|de|e|à|a|o)\b/gi;

/**
 * O modelo, tirado do título.
 *
 * O título segue "Colchão <tamanho> <tipo> Probel <MODELO> <medidas>
 * <cor>". Duas palavras bastam para separar "Cairo Ultra Gel" de
 * "Cairo"; mais que isso começa a separar o mesmo modelo por causa de
 * um adjetivo solto no título de um dos tamanhos.
 */
export function modeloDoTitulo(titulo: string | null | undefined): string {
  if (!titulo) return "";
  let t = String(titulo);

  /* O que vem depois da marca é o modelo, quando a marca aparece no
     meio. Em "Próintense Probel 88x188" ela está no fim: aí não corta
     nada e o ruído é limpo adiante. */
  const i = t.search(/\b(probel|boa\s*forma|pelmex|prodormir)\b/i);
  if (i >= 0) {
    const depois = t.slice(i).replace(/^\S+\s*/, "");
    if (depois.replace(MEDIDAS, "").trim().length >= 3) t = depois;
  }

  const limpo = t
    .replace(MEDIDAS, " ")
    .replace(TAMANHOS, " ")
    .replace(CORES, " ")
    .replace(RUIDO, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return limpo.split(" ").filter((p) => p.length > 1).slice(0, 2).join(" ");
}

export type AnuncioParaFamilia = {
  codigoExterno: string;
  sku: string | null;
  titulo: string;
  familiaId?: string | null;
  familiaNome?: string | null;
};

export type Familias = {
  /** A família de cada anúncio, pelo código externo em maiúsculas. */
  porAnuncio: Map<string, string>;
  /** A família de cada SKU. */
  porSku: Map<string, string>;
  /** O nome legível de cada família. */
  nome: Map<string, string>;
  /** Veio do canal, ou foi encaixado pelo título. */
  origem: Map<string, "canal" | "titulo">;
};

/**
 * Resolve a família de cada anúncio.
 *
 * Duas passadas: primeiro o que o canal declarou, depois o encaixe dos
 * que sobraram — e o encaixe só vale quando o modelo do título aponta
 * para exatamente UMA família conhecida. Modelo ambíguo fica de fora:
 * um palpite que une duas famílias é pior que anúncio sozinho, porque
 * soma venda de produto que não tem relação.
 */
export function resolverFamilias(
  anuncios: AnuncioParaFamilia[],
  opcoes: {
    /**
     * Encaixar anúncio sem catálogo na família de quem tem o mesmo
     * modelo no título. Desligado por padrão: ver o comentário do
     * módulo sobre por que isto não é certeza.
     */
    agruparPorModelo?: boolean;
  } = {},
): Familias {
  const porAnuncio = new Map<string, string>();
  const porSku = new Map<string, string>();
  const nome = new Map<string, string>();
  const origem = new Map<string, "canal" | "titulo">();

  /* ── 1. O que o canal declarou ── */
  const modelosDaFamilia = new Map<string, Set<string>>();
  for (const a of anuncios) {
    if (!a.familiaId) continue;
    const chave = a.codigoExterno.toUpperCase();
    porAnuncio.set(chave, a.familiaId);
    origem.set(chave, "canal");
    if (a.familiaNome) nome.set(a.familiaId, a.familiaNome);
    const sku = (a.sku ?? "").trim();
    if (sku && !porSku.has(sku)) porSku.set(sku, a.familiaId);

    const m = modeloDoTitulo(a.titulo);
    if (m) {
      const s = modelosDaFamilia.get(m) ?? new Set<string>();
      s.add(a.familiaId);
      modelosDaFamilia.set(m, s);
    }
  }

  /* Modelo que aponta para mais de uma família não serve de ponte. */
  const ponte = new Map<string, string>();
  for (const [m, familias] of modelosDaFamilia) {
    if (familias.size === 1) ponte.set(m, [...familias][0]);
  }

  /* ── 2. Os que o canal não declarou ── */
  for (const a of anuncios) {
    const chave = a.codigoExterno.toUpperCase();
    if (porAnuncio.has(chave)) continue;

    /* Um SKU pode ter um anúncio em catálogo e outro fora: se o SKU já
       tem família, o anúncio herda — é o mesmo produto. */
    const sku = (a.sku ?? "").trim();
    const doSku = sku ? porSku.get(sku) : undefined;
    if (doSku) {
      porAnuncio.set(chave, doSku);
      origem.set(chave, "canal");
      continue;
    }

    if (!opcoes.agruparPorModelo) continue;
    const alvo = ponte.get(modeloDoTitulo(a.titulo));
    if (!alvo) continue;
    porAnuncio.set(chave, alvo);
    origem.set(chave, "titulo");
    if (sku && !porSku.has(sku)) porSku.set(sku, alvo);
  }

  return { porAnuncio, porSku, nome, origem };
}
