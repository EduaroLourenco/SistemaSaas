import "server-only";
import type { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import type { SituacaoDisputa } from "./disputa-catalogo";

/**
 * Catálogo, semana contra semana.
 *
 * ── Por que isto existe ──
 *
 * A conta de São Paulo ganhava 63 das 124 disputas em 06/10 e passou a
 * ganhar 1 a partir de 13/10, derrubada pela métrica de envios. A queda de
 * receita apareceu em todas as telas; a CAUSA não aparecia em nenhuma,
 * porque a disputa de catálogo só vivia na sua própria aba, sempre no
 * presente. Quem abria o termômetro via a semana cair e não tinha como
 * saber que a vitrine tinha sumido.
 *
 * ── A régua: estado, não fluxo ──
 *
 * Ganhar catálogo é um ESTADO do anúncio, não uma soma de dias. Somar
 * "dias ganhando" da semana contaria duas vezes o mesmo anúncio e faria a
 * quarta-feira parecer pior que o domingo. Então cada semana é lida no seu
 * ÚLTIMO DIA MEDIDO, e são esses dois retratos que se comparam.
 *
 * ── O que não inventa ──
 *
 * A coleta começou em 30/09/2026. Semana sem leitura devolve `medido:
 * false` e a tela mostra vazio — não zero, que significaria "disputou e
 * perdeu tudo".
 */

type Sb = Awaited<ReturnType<typeof clienteServidor>>;

/** As situações em que o anúncio está na vitrine do catálogo. */
const GANHANDO = new Set(["winning", "sharing_first_place"]);

const TRADUZ: Record<string, SituacaoDisputa> = {
  winning: "ganhando",
  sharing_first_place: "dividindo",
  competing: "competindo",
  listed: "listado",
  not_listed: "fora",
};

export type ContaCatalogo = {
  contaId: string;
  nome: string;
  /** O retrato do último dia medido de cada semana. */
  dia: string | null;
  ganhando: number;
  disputando: number;
  diaAnterior: string | null;
  ganhandoAnterior: number | null;
  disputandoAnterior: number | null;
};

export type AnuncioPerdido = {
  mlb: string;
  sku: string;
  titulo: string;
  conta: string;
  /** Em que situação ficou depois de perder a vitrine. */
  situacao: SituacaoDisputa;
  /** O último dia em que este anúncio apareceu ganhando. */
  ultimoDiaGanhando: string;
};

export type CatalogoSemana = {
  medido: boolean;
  /** Primeira leitura que existe no banco, para a tela dizer desde quando. */
  desde: string | null;
  contas: ContaCatalogo[];
  /** Ganhava na semana anterior e não ganha mais. */
  perdidos: AnuncioPerdido[];
  /** Não ganhava e passou a ganhar. */
  ganhos: AnuncioPerdido[];
  totais: {
    ganhando: number;
    disputando: number;
    ganhandoAnterior: number | null;
    disputandoAnterior: number | null;
  };
};

type LinhaDia = { anuncio_id: string; data: string; situacao: string };

export type EstadoCatalogo = {
  situacao: SituacaoDisputa;
  ganhando: boolean;
  /** Último dia em que ganhou, quando não ganha mais. Null se ainda ganha. */
  perdeuDepoisDe: string | null;
};

/**
 * O estado de catálogo de cada anúncio, com a mudança recente.
 *
 * Diferente de `situacaoDeCatalogo`, que só devolve a foto de hoje: aqui
 * vem também a data em que o anúncio deixou de ganhar. É a diferença entre
 * "está competindo" — que não diz nada — e "ganhava até 12/10", que é a
 * explicação da queda do produto.
 */
export async function estadoDeCatalogo(sb: Sb, desde: string): Promise<Map<string, EstadoCatalogo>> {
  const linhas = (await paginar(() =>
    sb.from("anuncio_catalogo_diario").select("anuncio_id,data,situacao").gte("data", desde).order("data")
  )) as unknown as LinhaDia[];

  const ultima = new Map<string, { data: string; situacao: string }>();
  const ultimoGanhando = new Map<string, string>();
  for (const l of linhas) {
    const d = String(l.data).slice(0, 10);
    const atual = ultima.get(l.anuncio_id);
    if (!atual || d >= atual.data) ultima.set(l.anuncio_id, { data: d, situacao: l.situacao });
    if (GANHANDO.has(l.situacao)) {
      const g = ultimoGanhando.get(l.anuncio_id);
      if (!g || d > g) ultimoGanhando.set(l.anuncio_id, d);
    }
  }
  const saida = new Map<string, EstadoCatalogo>();
  for (const [id, u] of ultima) {
    const ganhando = GANHANDO.has(u.situacao);
    const antes = ultimoGanhando.get(id) ?? null;
    saida.set(id, {
      situacao: TRADUZ[u.situacao] ?? "fora",
      ganhando,
      perdeuDepoisDe: ganhando ? null : antes,
    });
  }
  return saida;
}

export async function carregarCatalogoSemana(
  sb: Sb,
  entrada: {
    contas: { id: string; nome: string }[];
    anuncios: { id: string; codigo_externo: string; sku_canal: string | null; titulo: string; conta_canal_id: string | null }[];
    /** Fatia da semana corrente: segunda até o último dia completo. */
    inicio: string;
    ate: string;
    /** A mesma fatia da semana anterior. */
    inicioAnterior: string;
    ateAnterior: string;
  }
): Promise<CatalogoSemana> {
  const { contas, anuncios, inicio, ate, inicioAnterior, ateAnterior } = entrada;
  const anunPorId = new Map(anuncios.map((a) => [a.id, a]));
  const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));

  const linhas = (await paginar(() =>
    sb.from("anuncio_catalogo_diario").select("anuncio_id,data,situacao").gte("data", inicioAnterior).order("data")
  )) as unknown as LinhaDia[];

  const minhas = linhas.filter((l) => anunPorId.has(l.anuncio_id) && String(l.data).slice(0, 10) <= ate);
  if (!minhas.length) {
    return {
      medido: false,
      desde: null,
      contas: contas.map((c) => ({ contaId: c.id, nome: c.nome, dia: null, ganhando: 0, disputando: 0, diaAnterior: null, ganhandoAnterior: null, disputandoAnterior: null })),
      perdidos: [],
      ganhos: [],
      totais: { ganhando: 0, disputando: 0, ganhandoAnterior: null, disputandoAnterior: null },
    };
  }

  const diasDe = (de: string, até: string) =>
    [...new Set(minhas.map((l) => String(l.data).slice(0, 10)).filter((d) => d >= de && d <= até))].sort();
  const ultimoAtual = diasDe(inicio, ate).at(-1) ?? null;
  const ultimoAnterior = diasDe(inicioAnterior, ateAnterior).at(-1) ?? null;

  /* O retrato de um dia: situação por anúncio. */
  const retrato = (d: string | null) => {
    const m = new Map<string, string>();
    if (!d) return m;
    for (const l of minhas) if (String(l.data).slice(0, 10) === d) m.set(l.anuncio_id, l.situacao);
    return m;
  };
  const agora = retrato(ultimoAtual);
  const antes = retrato(ultimoAnterior);

  const conta = (m: Map<string, string>, contaId?: string) => {
    let ganhando = 0;
    let disputando = 0;
    for (const [id, s] of m) {
      const a = anunPorId.get(id);
      if (!a || (contaId && a.conta_canal_id !== contaId)) continue;
      disputando++;
      if (GANHANDO.has(s)) ganhando++;
    }
    return { ganhando, disputando };
  };

  const porConta: ContaCatalogo[] = contas.map((c) => {
    const a = conta(agora, c.id);
    const b = ultimoAnterior ? conta(antes, c.id) : null;
    return {
      contaId: c.id,
      nome: c.nome,
      dia: ultimoAtual,
      ganhando: a.ganhando,
      disputando: a.disputando,
      diaAnterior: ultimoAnterior,
      ganhandoAnterior: b ? b.ganhando : null,
      disputandoAnterior: b ? b.disputando : null,
    };
  });

  /* ── Quem trocou de lado ──
     Só entra anúncio medido nos DOIS retratos: anúncio que entrou ou saiu
     da disputa no meio não perdeu vitrine, mudou de situação cadastral. */
  const ultimoGanhando = new Map<string, string>();
  for (const l of minhas) {
    if (!GANHANDO.has(l.situacao)) continue;
    const d = String(l.data).slice(0, 10);
    const atual = ultimoGanhando.get(l.anuncio_id);
    if (!atual || d > atual) ultimoGanhando.set(l.anuncio_id, d);
  }
  const descrever = (id: string, situacao: string): AnuncioPerdido | null => {
    const a = anunPorId.get(id);
    if (!a) return null;
    return {
      mlb: a.codigo_externo,
      sku: (a.sku_canal ?? "").toUpperCase(),
      titulo: a.titulo,
      conta: nomeConta.get(a.conta_canal_id ?? "") ?? "—",
      situacao: TRADUZ[situacao] ?? "fora",
      ultimoDiaGanhando: ultimoGanhando.get(id) ?? "—",
    };
  };
  const perdidos: AnuncioPerdido[] = [];
  const ganhos: AnuncioPerdido[] = [];
  if (ultimoAnterior) {
    for (const [id, s] of agora) {
      const antiga = antes.get(id);
      if (antiga == null) continue;
      if (GANHANDO.has(antiga) && !GANHANDO.has(s)) {
        const x = descrever(id, s);
        if (x) perdidos.push(x);
      }
      if (!GANHANDO.has(antiga) && GANHANDO.has(s)) {
        const x = descrever(id, s);
        if (x) ganhos.push(x);
      }
    }
  }
  const porSku = (a: AnuncioPerdido, b: AnuncioPerdido) => a.sku.localeCompare(b.sku, "pt-BR");
  perdidos.sort(porSku);
  ganhos.sort(porSku);

  const totalAgora = conta(agora);
  const totalAntes = ultimoAnterior ? conta(antes) : null;

  return {
    medido: true,
    desde: [...minhas].map((l) => String(l.data).slice(0, 10)).sort()[0] ?? null,
    contas: porConta,
    perdidos,
    ganhos,
    totais: {
      ganhando: totalAgora.ganhando,
      disputando: totalAgora.disputando,
      ganhandoAnterior: totalAntes ? totalAntes.ganhando : null,
      disputandoAnterior: totalAntes ? totalAntes.disputando : null,
    },
  };
}
