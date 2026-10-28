import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import { carregarItensDaPromocao, type ItemAutomacao } from "./automacoes";
import { carregarRegras } from "./regras-promocao";
import { carregarFolgas } from "./folga-campanha";
import { FOLGA_PADRAO, TIPO_PADRAO } from "@/lib/folga";
import { avaliarItem } from "@/lib/planilhas/avaliar-regras";
import { paraRegra } from "@/lib/planilhas/item-para-regra";
import { pisoDoItem, faixaDoPreco, precoProposto } from "@/lib/planilhas/piso-promocao";

/**
 * A fila de aprovação: a regra decide, o envio espera o aceite.
 *
 * ── O que ela resolve ──
 *
 * Hoje ele abre promoção por promoção para descobrir o que cabe. A fila
 * inverte: chega pronta, agrupada por promoção, e ele só tira o que não
 * quer. O ganho está em `gerar`, não na tela.
 *
 * ── O que ela NÃO faz ──
 *
 * Não envia nada. Gerar escreve decisão no nosso banco; aprovar só muda
 * o estado dela. O envio continua sendo `/api/automacoes/enviar`, com
 * `confirmar: true` e a aplicação de escrita conectada na conta — e é lá
 * que a primeira escrita de verdade vai acontecer, com o Eduardo junto.
 *
 * ── Uma promoção por vez, de propósito ──
 *
 * Varrer as 36 promoções numa requisição só estoura a cota do canal e o
 * tempo da função. Quem chama repete por promoção, em fila de quatro,
 * como a tela já faz com os contadores. Quando o agendamento noturno
 * existir, ele chama a mesma função neste mesmo grão.
 *
 * A migração 46 pode não ter rodado. Como nas outras tabelas novas, nada
 * aqui explode: a fila devolve vazio com um aviso que a tela mostra.
 */

const SEM_TABELA = new Set(["42P01", "PGRST205", "42703"]);
const AVISO =
  "A fila precisa da migração db/46_fila_de_aprovacao.sql. " +
  "Enquanto ela não rodar, as decisões não têm onde ser guardadas.";

/** Campanhas em que o preço é NOSSO: a oferta sai do piso com a folga. */
const NOSSO_PRECO = new Set(["DEAL", "SELLER_CAMPAIGN", "PRICE_DISCOUNT"]);

export type LinhaFila = {
  id: string;
  contaCanalId: string;
  promocao: string;
  tipoPromocao: string;
  mlb: string;
  titulo: string | null;
  sku: string | null;
  decisao: string;
  precoProposto: number | null;
  precoCanal: number | null;
  pisoNaHora: number | null;
  folgaUsada: number | null;
  faixaResultante: number | null;
  motivo: string | null;
  regraNome: string | null;
  prazo: string | null;
  criadaEm: string;
};

export type Fila = {
  linhas: LinhaFila[];
  faltaMigracao: string | null;
};

type Linha = {
  id: string;
  conta_canal_id: string;
  promocao: string;
  tipo_promocao: string;
  mlb: string;
  titulo: string | null;
  sku: string | null;
  decisao: string;
  preco_proposto: string | number | null;
  preco_canal: string | number | null;
  piso_na_hora: string | number | null;
  folga_usada: string | number | null;
  faixa_resultante: string | number | null;
  motivo: string | null;
  regra_nome: string | null;
  prazo: string | null;
  criada_em: string;
};

const n = (v: unknown) => (v == null ? null : Number(v));

const montar = (l: Linha): LinhaFila => ({
  id: l.id,
  contaCanalId: l.conta_canal_id,
  promocao: l.promocao,
  tipoPromocao: l.tipo_promocao,
  mlb: l.mlb,
  titulo: l.titulo,
  sku: l.sku,
  decisao: l.decisao,
  precoProposto: n(l.preco_proposto),
  precoCanal: n(l.preco_canal),
  pisoNaHora: n(l.piso_na_hora),
  folgaUsada: n(l.folga_usada),
  faixaResultante: n(l.faixa_resultante),
  motivo: l.motivo,
  regraNome: l.regra_nome,
  prazo: l.prazo,
  criadaEm: l.criada_em,
});

const COLUNAS =
  "id,conta_canal_id,promocao,tipo_promocao,mlb,titulo,sku,decisao,preco_proposto," +
  "preco_canal,piso_na_hora,folga_usada,faixa_resultante,motivo,regra_nome,prazo,criada_em";

/** O que está esperando aceite, mais recente primeiro. */
export async function carregarFila(): Promise<Fila> {
  const op = await operacaoPadrao();
  if (!op) return { linhas: [], faltaMigracao: null };
  const sb = await clienteServidor();

  const { data, error } = await sb
    .from("decisoes_promocao")
    .select(COLUNAS)
    .eq("operacao_id", op.id)
    .eq("estado", "pendente")
    .order("criada_em", { ascending: false })
    .limit(2000);

  if (error) {
    if (SEM_TABELA.has(error.code)) return { linhas: [], faltaMigracao: AVISO };
    console.error("[fila-aprovacao]", error);
    return { linhas: [], faltaMigracao: null };
  }
  return { linhas: (data ?? []).map((l) => montar(l as unknown as Linha)), faltaMigracao: null };
}

export type ResumoGeracao = {
  lidos: number;
  decididos: number;
  /** Por decisão: aceitar, reescrever, nao_entrar, conferir, sem_regra. */
  porDecisao: Record<string, number>;
};

/**
 * Roda as regras numa promoção e escreve o que elas decidiram.
 *
 * Só entra na fila o que a regra mandou ACEITAR ou REESCREVER — é disso
 * que a fila trata. "Não entrar" e "conferir" não viram linha para
 * aprovar: a primeira é uma decisão de não fazer nada, e a segunda é o
 * caso em que a regra não soube, que continua sendo trabalho de olhar a
 * promoção aberta.
 */
export async function gerarFila(
  contaCanalId: string,
  promocao: string,
  tipoPromocao: string,
  nomePromocao: string | null,
  prazo: string | null
): Promise<ResumoGeracao | { erro: string }> {
  const op = await operacaoPadrao();
  if (!op) return { erro: "Sem operação." };
  const sb = await clienteServidor();

  const [{ regras }, folgas, dados] = await Promise.all([
    carregarRegras(),
    carregarFolgas(),
    carregarItensDaPromocao(contaCanalId, promocao, tipoPromocao),
  ]);

  if (!regras.length) return { erro: "Sem regras: crie uma em Automações › Regras de promoção." };

  const folga = folgas.porTipo[tipoPromocao] ?? folgas.porTipo[TIPO_PADRAO] ?? FOLGA_PADRAO;
  const nosso = NOSSO_PRECO.has(tipoPromocao);
  const porDecisao: Record<string, number> = {};
  const linhas: Record<string, unknown>[] = [];

  for (const i of dados.itens) {
    /* Só o que o canal convidou: o que já está dentro não se aceita de novo. */
    if (i.status !== "candidate") continue;

    const d = avaliarItem(
      paraRegra({
        mlb: i.mlb,
        contaCanalId,
        tipoCampanha: tipoPromocao,
        nomeCampanha: nomePromocao,
        tipoAnuncio: i.tipoAnuncio,
        statusAnuncio: i.statusAnuncio,
        estoque: i.estoque,
        sku: i.sku,
        familia: null,
        catalogo: null,
        unidades30: null,
        unidades90: null,
        visitas30: null,
        precoCanal: i.precoCanal,
        precoCheio: i.precoCheio,
        faixaQueSobra: null,
        meliPct: i.meliPct,
        acos: null,
        investimento30: null,
        margemPct: null,
      }),
      regras
    );
    porDecisao[d.decisao] = (porDecisao[d.decisao] ?? 0) + 1;
    if (d.decisao !== "aceitar" && d.decisao !== "reescrever") continue;

    const piso = pisoDoItem(i, dados.bandas);
    const folgaDaLinha =
      d.decisao === "reescrever" && d.acao?.tipo === "reescrever" && d.acao.folgaPct != null
        ? d.acao.folgaPct
        : folga;
    const proposto = precoProposto(i, piso, folgaDaLinha, nosso);

    /*
     * Sem preço não há linha para aprovar. Acontece quando falta o piso
     * (item fora da Fórmula base) ou quando o preço que sairia passa do
     * teto do canal — e escrever acima do teto é recusa na certa.
     */
    if (proposto == null) {
      porDecisao.sem_preco = (porDecisao.sem_preco ?? 0) + 1;
      continue;
    }

    linhas.push({
      operacao_id: op.id,
      conta_canal_id: contaCanalId,
      promocao,
      tipo_promocao: tipoPromocao,
      mlb: i.mlb,
      titulo: i.titulo,
      sku: i.sku,
      regra_id: d.regraId,
      regra_nome: d.regraNome,
      decisao: d.decisao,
      preco_proposto: proposto,
      preco_canal: i.precoCanal,
      /* O piso e a folga DO MOMENTO: a Fórmula base muda de vigência, e
         sem congelá-los ninguém explica em dezembro uma linha de hoje. */
      piso_na_hora: piso,
      folga_usada: folgaDaLinha,
      faixa_resultante: faixaDoPreco(i, dados.bandas, proposto),
      motivo: d.motivo,
      prazo,
      estado: "pendente",
    });
  }

  if (linhas.length) {
    /* Gerar de novo substitui o pendente do mesmo item: o preço do canal
       e o piso podem ter mudado desde a geração anterior. */
    const { error } = await sb.from("decisoes_promocao").upsert(linhas, {
      onConflict: "operacao_id,conta_canal_id,promocao,mlb",
      ignoreDuplicates: false,
    });
    if (error) {
      if (SEM_TABELA.has(error.code)) return { erro: AVISO };
      if (error.code === "42501") return { erro: "Seu papel não permite gerar a fila." };
      console.error("[fila-aprovacao]", error);
      return { erro: "Não consegui guardar a fila agora." };
    }
  }

  return {
    lidos: dados.itens.filter((i) => i.status === "candidate").length,
    decididos: linhas.length,
    porDecisao,
  };
}

/** Aprovar ou descartar linhas da fila. Não envia nada ao canal. */
export async function decidirNaFila(
  ids: string[],
  estado: "aprovada" | "descartada"
): Promise<{ ok: true; mudadas: number } | { erro: string }> {
  if (!ids.length) return { erro: "Nenhuma linha." };
  if (ids.length > 2000) return { erro: "Lote grande demais." };

  const op = await operacaoPadrao();
  if (!op) return { erro: "Sem operação." };
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();

  const { data, error } = await sb
    .from("decisoes_promocao")
    .update({
      estado,
      aprovada_por: sessao.user?.id ?? null,
      aprovada_em: new Date().toISOString(),
    })
    .eq("operacao_id", op.id)
    .eq("estado", "pendente")
    .in("id", ids)
    .select("id");

  if (error) {
    if (SEM_TABELA.has(error.code)) return { erro: AVISO };
    if (error.code === "42501") return { erro: "Seu papel não permite decidir aqui." };
    console.error("[fila-aprovacao]", error);
    return { erro: "Não consegui gravar a decisão agora." };
  }
  return { ok: true, mudadas: (data ?? []).length };
}
