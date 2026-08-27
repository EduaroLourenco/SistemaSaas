import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import type { LinhaProcessada } from "@/lib/planilhas/processar";

/**
 * Grava o resultado de um processamento de promoções.
 *
 * Sem isto, a Central de Promoções decidia e esquecia: o arquivo saía, a
 * tela mostrava a conferência, e nada ficava. Campanhas e Histórico
 * apareciam vazios porque literalmente não havia o que mostrar.
 *
 * O que fica gravado é a DECISÃO com os números que a sustentaram — preço
 * ofertado pelo canal, tabela, piso e o com desconto extra. Guardar os
 * quatro em vez de recalcular depois é o que permite responder "por que
 * recusamos este item em julho" mesmo que a regra do piso mude.
 */

export type ResumoGravacao = {
  processamentoId: string;
  campanhas: number;
  /** Linhas analisadas, com repetições — o registro completo. */
  itens: number;
  /** Decisões vigentes, uma por anúncio por campanha. */
  decisoes: number;
  semAnuncio: number;
};

const OPERACAO = "00000000-0000-0000-0000-000000000101";

/**
 * O supabase-js lança objeto simples, não Error. Sem esta conversão a
 * mensagem se perde em qualquer `instanceof Error` acima e vira "erro
 * desconhecido" — que não diz onde olhar.
 */
function erroDeVerdade(bruto: unknown, onde: string): Error {
  const e = bruto as { message?: string; code?: string; details?: string; hint?: string };
  const partes = [e?.message ?? "falha no banco"];
  if (e?.code) partes.push(`(código ${e.code})`);
  if (e?.details) partes.push(e.details);
  if (e?.hint) partes.push(e.hint);
  return new Error(`${onde}: ${partes.join(" ")}`);
}

export async function gravarProcessamento({
  linhas,
  arquivos,
  descontoExtra,
  importacaoId,
  usuarioId,
}: {
  linhas: LinhaProcessada[];
  arquivos: string[];
  descontoExtra: number;
  importacaoId?: string;
  usuarioId?: string;
}): Promise<ResumoGravacao> {
  /*
   * Usa o cliente privilegiado porque isto roda a partir de uma rota que
   * já checou a sessão, e a gravação cria linhas em quatro tabelas ligadas
   * entre si. Uma recusa de RLS no meio deixaria metade escrita.
   */
  const sb = clientePrivilegiado();

  const aprovados = linhas.filter((l) => l.aprovado).length;

  const { data: proc, error: erroProc } = await sb
    .from("processamentos_promocao")
    .insert({
      operacao_id: OPERACAO,
      importacao_id: importacaoId ?? null,
      itens_lidos: linhas.length,
      itens_aprovados: aprovados,
      itens_reprovados: linhas.length - aprovados,
      desconto_extra: descontoExtra,
      arquivos,
      executado_por: usuarioId ?? null,
      status: "concluida",
    })
    .select("id")
    .single();

  if (erroProc) throw erroDeVerdade(erroProc, "ao registrar o processamento");
  const processamentoId = proc.id as string;

  /* ── Campanhas ─────────────────────────────────────────────
   *
   * O nome da campanha vem da planilha e é a única identidade que temos —
   * o canal não exporta um id estável. Duas rodadas da mesma campanha
   * reaproveitam a linha em vez de criar uma nova.
   */
  const { data: canal } = await sb
    .from("canais")
    .select("id")
    .eq("nome", "Mercado Livre")
    .single();

  const nomes = [...new Set(linhas.map((l) => l.campanha).filter(Boolean))];
  const porNome = new Map<string, string>();

  for (const nome of nomes) {
    const daCampanha = linhas.filter((l) => l.campanha === nome);
    const comReducao = daCampanha.some((l) => l.tipoCampanha === "Com Redução");

    const { data: existente } = await sb
      .from("campanhas")
      .select("id")
      .eq("operacao_id", OPERACAO)
      .eq("nome", nome)
      .maybeSingle();

    if (existente) {
      porNome.set(nome, existente.id as string);
      continue;
    }

    const { data: nova, error } = await sb
      .from("campanhas")
      .insert({
        operacao_id: OPERACAO,
        canal_id: canal?.id,
        nome,
        tem_reducao_tarifa: comReducao,
        ativa: true,
      })
      .select("id")
      .single();
    if (error) throw erroDeVerdade(error, `ao criar a campanha "${nome}"`);
    porNome.set(nome, nova.id as string);
  }

  /* ── Itens e histórico ─────────────────────────────────── */

  const codigos = [...new Set(linhas.map((l) => l.mlb.toUpperCase()))];
  const anunciosPorCodigo = new Map<string, string>();

  /*
   * Em lotes porque uma cláusula `in` com centenas de códigos estoura o
   * tamanho da URL — e em PARALELO porque a aplicação roda nos Estados
   * Unidos e o banco em São Paulo. Cada ida e volta custa mais de cem
   * milissegundos, e em série isso se acumula até a função estourar o
   * tempo limite.
   */
  const lotes = await Promise.all(
    Array.from({ length: Math.ceil(codigos.length / 200) }, (_, i) =>
      sb
        .from("anuncios")
        .select("id,codigo_externo")
        .in("codigo_externo", codigos.slice(i * 200, (i + 1) * 200))
    )
  );
  for (const { data } of lotes) {
    for (const a of data ?? []) {
      anunciosPorCodigo.set(String(a.codigo_externo).toUpperCase(), a.id as string);
    }
  }

  let semAnuncio = 0;
  const historico: Record<string, unknown>[] = [];
  const itens: Record<string, unknown>[] = [];
  /** Uma decisão por (campanha, anúncio) — ver a escolha logo abaixo. */
  const escolhidos = new Map<string, LinhaProcessada>();

  for (const l of linhas) {
    const anuncioId = anunciosPorCodigo.get(l.mlb.toUpperCase()) ?? null;
    if (!anuncioId) semAnuncio++;

    historico.push({
      operacao_id: OPERACAO,
      processamento_id: processamentoId,
      anuncio_id: anuncioId,
      mlb: l.mlb,
      sku: l.sku || null,
      campanha: l.campanha || "—",
      tipo_anuncio: /premium/i.test(l.tipoAnuncio) ? "premium" : "classico",
      tipo_campanha: l.tipoCampanha,
      preco_tabela: l.precoTabela || null,
      preco_oferta: l.precoOferta,
      preco_piso: l.precoPiso || null,
      preco_com_extra: l.precoComExtra,
      reducao_tarifa: l.reducaoTarifa,
      status_aprovacao: l.aprovado ? "aprovado" : "reprovado",
      motivo: l.motivo || null,
      tags: l.tags,
    });

    // `campanha_itens` exige anúncio cadastrado; o histórico aceita nulo.
    // Item de anúncio que ainda não está no catálogo fica só no histórico.
    const campanhaId = porNome.get(l.campanha);
    if (!anuncioId || !campanhaId) continue;

    /*
     * Um anúncio pode aparecer VÁRIAS vezes na mesma campanha: a planilha
     * de redução de tarifa traz uma linha por faixa de desconto oferecida
     * pelo canal — 549 linhas para 266 anúncios no arquivo de agosto.
     *
     * O histórico guarda todas, porque é o registro do que foi analisado.
     * `campanha_itens` guarda a decisão vigente, uma por anúncio, e é isso
     * que a chave única (campanha, anúncio) exige. Sem escolher aqui, a
     * gravação inteira falhava com violação de chave — e o arquivo já
     * gerado não chegava a ser mostrado.
     *
     * Entre ofertas repetidas fica a de MAIOR preço: das faixas que o canal
     * propõe, é a que menos corta a margem. Aprovada ganha de reprovada
     * independente do preço — participar de uma faixa é o resultado que
     * importa.
     */
    const chave = `${campanhaId}|${anuncioId}`;
    const jaEscolhida = escolhidos.get(chave);
    if (jaEscolhida) {
      const melhoraDecisao = l.aprovado && !jaEscolhida.aprovado;
      const mesmaDecisao = l.aprovado === jaEscolhida.aprovado;
      // Sem preço ofertado conta como zero: qualquer oferta com número
      // é preferível a uma que o canal deixou em branco.
      const maisAlta = (l.precoOferta ?? 0) > (jaEscolhida.precoOferta ?? 0);
      if (!melhoraDecisao && !(mesmaDecisao && maisAlta)) {
        continue;
      }
    }
    escolhidos.set(chave, l);
  }

  for (const [chave, l] of escolhidos) {
    const [campanhaId, anuncioId] = chave.split("|");
    itens.push({
      operacao_id: OPERACAO,
      campanha_id: campanhaId,
      anuncio_id: anuncioId,
      preco_tabela: l.precoTabela || null,
      preco_oferta: l.precoOferta,
      preco_sugerido: l.precoPropostoML,
      decisao: l.aprovado ? "participar" : "nao_participar",
      decidido_em: new Date().toISOString(),
      motivo: l.motivo || null,
    });
  }

  // As duas tabelas não dependem uma da outra: gravar em paralelo corta o
  // tempo pela metade sem risco de ordem.
  const gravacoes = [
    ...Array.from({ length: Math.ceil(historico.length / 400) }, (_, i) =>
      sb.from("historico_promocoes").insert(historico.slice(i * 400, (i + 1) * 400))
    ),
    /*
     * `upsert` e não `insert`: a mesma campanha é reprocessada quando o
     * canal republica a planilha, e a decisão nova tem que substituir a
     * antiga em vez de colidir com ela.
     */
    ...Array.from({ length: Math.ceil(itens.length / 400) }, (_, i) =>
      sb
        .from("campanha_itens")
        .upsert(itens.slice(i * 400, (i + 1) * 400), {
          onConflict: "campanha_id,anuncio_id",
        })
    ),
  ];
  for (const { error } of await Promise.all(gravacoes)) {
    if (error) throw erroDeVerdade(error, "ao gravar histórico e itens");
  }

  return {
    processamentoId,
    campanhas: nomes.length,
    itens: historico.length,
    decisoes: itens.length,
    semAnuncio,
  };
}
