/**
 * As regras de promoção, aplicadas a um item.
 *
 * Regra pura: recebe o item e as regras, devolve a decisão e QUAL regra
 * decidiu. Não fala com banco nem com canal — por isso tem teste, e por
 * isso o erro caro mora aqui e não na tela.
 *
 * ── Três respostas, não duas ──
 *
 * Toda condição pode responder sim, não, ou **não deu para saber**. É o
 * ponto que a primeira versão do desenho errava: numa operação sem custo
 * cadastrado, "margem acima de 20%" responderia "não" para o catálogo
 * inteiro e pareceria uma decisão tomada. A regra diz o que fazer com o
 * desconhecido, e a tela mostra a cobertura antes de salvar.
 *
 * ── Primeira que bate decide ──
 *
 * As regras são ordenadas. A exceção vai em cima, o geral embaixo. Sem
 * ordem, duas regras que batem no mesmo item deixam o resultado
 * dependendo de qual veio primeiro do banco.
 */

export type CampoRegra =
  | "campanha.tipo" | "campanha.nome" | "conta"
  | "anuncio.tipo" | "anuncio.status" | "anuncio.estoque" | "anuncio.temControleEstoque"
  | "anuncio.sku" | "anuncio.familia" | "anuncio.catalogo"
  | "venda.unidades30" | "venda.unidades90" | "visita.visitas30" | "venda.conversao30"
  | "preco.descontoProposto" | "preco.faixaQueSobra" | "preco.meliPonto"
  | "ads.acos" | "ads.investimento30"
  | "margem.pct";

export type Operador =
  | "igual" | "diferente" | "em" | "nao_em" | "contem"
  | "maior" | "maior_ou_igual" | "menor" | "menor_ou_igual";

export type Condicao = { campo: CampoRegra; operador: Operador; valor: string | number | string[] };

export type Acao =
  | { tipo: "aceitar" }
  | { tipo: "reescrever"; folgaPct?: number; faixaMinima?: number }
  | { tipo: "nao_entrar" }
  | { tipo: "conferir" };

export type Regra = {
  id: string;
  nome: string;
  ativa: boolean;
  ordem: number;
  contaCanalId: string | null;
  condicoes: Condicao[];
  acao: Acao;
  quandoNaoSei: "pular" | "nao_entrar" | "conferir";
};

/**
 * O item como a regra o enxerga. Campo ausente é `null` — e `null` NÃO
 * é zero: é "não deu para saber", e segue o `quandoNaoSei` da regra.
 */
export type ItemParaRegra = Partial<Record<CampoRegra, string | number | boolean | null>> & {
  mlb: string;
  contaCanalId: string;
};

export type Resultado = {
  mlb: string;
  decisao: "aceitar" | "reescrever" | "nao_entrar" | "conferir" | "sem_regra";
  acao: Acao | null;
  regraId: string | null;
  regraNome: string | null;
  /** Por que esta regra, em uma linha. */
  motivo: string;
  /** Campos que a regra precisou e o item não tinha. */
  faltou: CampoRegra[];
};

const texto = (v: unknown) => String(v ?? "").trim().toLowerCase();
const lista = (v: Condicao["valor"]) =>
  (Array.isArray(v) ? v : String(v).split(",")).map((x) => texto(x)).filter(Boolean);

/** sim | nao | nao_sei — o terceiro é o que torna a regra honesta. */
type Veredito = "sim" | "nao" | "nao_sei";

export function avaliarCondicao(c: Condicao, item: ItemParaRegra): Veredito {
  const bruto = item[c.campo];
  if (bruto === null || bruto === undefined || bruto === "") return "nao_sei";

  switch (c.operador) {
    case "em": return lista(c.valor).includes(texto(bruto)) ? "sim" : "nao";
    case "nao_em": return lista(c.valor).includes(texto(bruto)) ? "nao" : "sim";
    case "contem": return texto(bruto).includes(texto(c.valor)) ? "sim" : "nao";
    case "igual": return texto(bruto) === texto(c.valor) ? "sim" : "nao";
    case "diferente": return texto(bruto) !== texto(c.valor) ? "sim" : "nao";
    default: break;
  }

  /* Daqui para baixo é comparação numérica: texto que não é número
     volta "não sei" em vez de virar NaN e reprovar calado. */
  const a = Number(bruto);
  const b = Number(c.valor);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "nao_sei";
  switch (c.operador) {
    case "maior": return a > b ? "sim" : "nao";
    case "maior_ou_igual": return a >= b ? "sim" : "nao";
    case "menor": return a < b ? "sim" : "nao";
    case "menor_ou_igual": return a <= b ? "sim" : "nao";
    default: return "nao_sei";
  }
}

const ROTULO: Partial<Record<CampoRegra, string>> = {
  "campanha.tipo": "tipo da campanha", "campanha.nome": "nome da campanha", conta: "conta",
  "anuncio.tipo": "tipo do anúncio", "anuncio.status": "situação do anúncio",
  "anuncio.estoque": "estoque", "anuncio.temControleEstoque": "controle de estoque",
  "anuncio.sku": "SKU", "anuncio.familia": "família", "anuncio.catalogo": "catálogo",
  "venda.unidades30": "vendas em 30 dias", "venda.unidades90": "vendas em 90 dias",
  "visita.visitas30": "visitas em 30 dias", "venda.conversao30": "conversão em 30 dias",
  "preco.descontoProposto": "desconto proposto", "preco.faixaQueSobra": "faixa que sobra",
  "preco.meliPonto": "quanto o Meli põe",
  "ads.acos": "ACOS", "ads.investimento30": "investimento em Ads",
  "margem.pct": "margem",
};
export const rotuloDoCampo = (c: CampoRegra) => ROTULO[c] ?? c;

/** A primeira regra que bate decide. Devolve também o que faltou. */
export function avaliarItem(item: ItemParaRegra, regras: Regra[]): Resultado {
  const emOrdem = regras
    .filter((r) => r.ativa)
    .filter((r) => r.contaCanalId == null || r.contaCanalId === item.contaCanalId)
    .sort((a, b) => a.ordem - b.ordem);

  for (const r of emOrdem) {
    const faltou: CampoRegra[] = [];
    let bateu = true;
    for (const c of r.condicoes) {
      const v = avaliarCondicao(c, item);
      if (v === "nao_sei") faltou.push(c.campo);
      if (v !== "sim") { bateu = false; }
    }

    /* Faltou dado numa condição que, de resto, não reprovou: é aqui que
       `quandoNaoSei` manda — e `pular` segue para a próxima regra. */
    if (!bateu && faltou.length) {
      const reprovouDeVerdade = r.condicoes.some(
        (c) => avaliarCondicao(c, item) === "nao"
      );
      if (!reprovouDeVerdade) {
        if (r.quandoNaoSei === "pular") continue;
        return {
          mlb: item.mlb,
          decisao: r.quandoNaoSei === "conferir" ? "conferir" : "nao_entrar",
          acao: { tipo: r.quandoNaoSei === "conferir" ? "conferir" : "nao_entrar" },
          regraId: r.id,
          regraNome: r.nome,
          motivo: `faltou ${faltou.map(rotuloDoCampo).join(", ")}`,
          faltou,
        };
      }
      continue;
    }
    if (!bateu) continue;

    return {
      mlb: item.mlb,
      decisao: r.acao.tipo,
      acao: r.acao,
      regraId: r.id,
      regraNome: r.nome,
      motivo: descrever(r),
      faltou: [],
    };
  }

  return {
    mlb: item.mlb, decisao: "sem_regra", acao: null,
    regraId: null, regraNome: null, motivo: "nenhuma regra bateu", faltou: [],
  };
}

/** A regra em português, para a tela dizer por que decidiu assim. */
export function descrever(r: Regra): string {
  const partes = r.condicoes.map((c) => {
    const op = {
      igual: "é", diferente: "não é", em: "está em", nao_em: "não está em",
      contem: "contém", maior: ">", maior_ou_igual: "≥", menor: "<", menor_ou_igual: "≤",
    }[c.operador];
    const v = Array.isArray(c.valor) ? c.valor.join(", ") : c.valor;
    return `${rotuloDoCampo(c.campo)} ${op} ${v}`;
  });
  const acao = {
    aceitar: "aceitar",
    reescrever: `reescrever${r.acao.tipo === "reescrever" && r.acao.folgaPct != null ? ` com ${r.acao.folgaPct}% de folga` : ""}`,
    nao_entrar: "não entrar",
    conferir: "mandar para conferência",
  }[r.acao.tipo];
  return partes.length ? `${partes.join(" e ")} → ${acao}` : acao;
}
