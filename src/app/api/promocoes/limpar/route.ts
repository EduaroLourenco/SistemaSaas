import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * Apaga tudo que uma campanha gerou.
 *
 * Existe porque reprocessar uma planilha não era possível sem sujeira: o
 * histórico acumulava as linhas antigas junto das novas, e a conferência
 * passava a somar duas análises da mesma campanha. Quem quisesse refazer
 * uma análise não tinha como voltar ao ponto de partida.
 *
 * Apaga a CAMPANHA inteira: as ofertas caem por cascata, o histórico sai
 * por nome — `historico_promocoes.campanha` é texto, não chave — e a
 * rodada de processamento só sai se não sobrar nada dela.
 *
 * Usa o cliente de SESSÃO, não o privilegiado. Numa rota que APAGA, quem
 * decide tem que ser o RLS: `leitor` recebe recusa do banco. Uma checagem
 * escrita aqui é uma checagem que alguém pode esquecer de escrever na
 * próxima rota.
 */

export async function POST(req: Request) {
  const sb = await clienteServidor();

  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) {
    return NextResponse.json(
      { erro: "Não autenticado", codigo: "sem_sessao" },
      { status: 401 }
    );
  }

  let corpo: { campanhaId?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  const campanhaId = corpo.campanhaId?.trim();
  if (!campanhaId) {
    return NextResponse.json({ erro: "Informe a campanha." }, { status: 400 });
  }

  const { data: campanha, error: erroBusca } = await sb
    .from("campanhas")
    .select("id,nome,operacao_id")
    .eq("id", campanhaId)
    .maybeSingle();

  if (erroBusca) {
    return NextResponse.json({ erro: mensagem(erroBusca) }, { status: 500 });
  }
  if (!campanha) {
    return NextResponse.json(
      { erro: "Campanha não encontrada." },
      { status: 404 }
    );
  }

  /*
   * As rodadas que tocaram esta campanha, guardadas ANTES de apagar.
   * Depois não há como descobrir quais eram: o vínculo some junto.
   */
  const { data: ofertas } = await sb
    .from("campanha_itens")
    .select("processamento_id")
    .eq("campanha_id", campanha.id);

  const rodadas = [
    ...new Set(
      (ofertas ?? [])
        .map((o) => o.processamento_id as string | null)
        .filter((v): v is string => !!v)
    ),
  ];

  /* ── Histórico ─────────────────────────────────────────────
   *
   * Por nome, porque `historico_promocoes` guarda o nome da campanha como
   * texto — não há chave estrangeira para cascatear.
   */
  const { data: apagadoHistorico, error: erroHistorico } = await sb
    .from("historico_promocoes")
    .delete()
    .eq("operacao_id", campanha.operacao_id)
    .eq("campanha", campanha.nome)
    .select("id");

  if (erroHistorico) {
    return NextResponse.json({ erro: mensagem(erroHistorico) }, { status: 403 });
  }

  /* ── Campanha e ofertas ────────────────────────────────────
   *
   * `campanha_itens.campanha_id` é `on delete cascade`: apagar a campanha
   * leva as ofertas junto.
   */
  const { data: apagadoOfertas } = await sb
    .from("campanha_itens")
    .select("id")
    .eq("campanha_id", campanha.id);

  const { error: erroCampanha } = await sb
    .from("campanhas")
    .delete()
    .eq("id", campanha.id);

  if (erroCampanha) {
    return NextResponse.json({ erro: mensagem(erroCampanha) }, { status: 403 });
  }

  /* ── Rodadas que ficaram vazias ────────────────────────────
   *
   * Uma rodada cobre várias campanhas — dois arquivos numa vez só. Apagar
   * a rodada enquanto outra campanha ainda depende dela seria pior que
   * deixá-la: `campanha_itens.processamento_id` é `on delete set null`, e
   * as ofertas da OUTRA campanha perderiam a origem sem ninguém notar.
   *
   * Então só sai a rodada que não tem mais nada apontando para ela.
   */
  let rodadasRemovidas = 0;
  for (const id of rodadas) {
    const [{ count: comHistorico }, { count: comOfertas }] = await Promise.all([
      sb
        .from("historico_promocoes")
        .select("id", { count: "exact", head: true })
        .eq("processamento_id", id),
      sb
        .from("campanha_itens")
        .select("id", { count: "exact", head: true })
        .eq("processamento_id", id),
    ]);

    if ((comHistorico ?? 0) === 0 && (comOfertas ?? 0) === 0) {
      const { error } = await sb
        .from("processamentos_promocao")
        .delete()
        .eq("id", id);
      if (!error) rodadasRemovidas++;
    }
  }

  return NextResponse.json({
    campanha: campanha.nome,
    historico: apagadoHistorico?.length ?? 0,
    ofertas: apagadoOfertas?.length ?? 0,
    rodadasRemovidas,
  });
}

/** O supabase-js devolve objeto simples, não Error — sem isto vira "{}". */
function mensagem(bruto: unknown): string {
  const e = bruto as { message?: string; code?: string; hint?: string };
  if (e?.code === "42501" || /permission|policy/i.test(e?.message ?? "")) {
    return "Seu perfil não permite apagar. É preciso ser editor ou mais.";
  }
  return [e?.message ?? "falha no banco", e?.code && `(código ${e.code})`, e?.hint]
    .filter(Boolean)
    .join(" ");
}
