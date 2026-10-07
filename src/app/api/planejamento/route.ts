import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { validarItem, type Item } from "@/lib/planejamento/modelo";
import { estrategiaDe } from "@/lib/planejamento/estrategia";
const tabelas = {
  item: "planejamento_itens",
  grupo: "planejamento_grupos",
  tipo: "planejamento_tipos",
} as const;
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
const erro = (mensagem: string, status = 400) =>
  Response.json({ erro: mensagem }, { status });
export async function POST(req: Request) {
  return gravar(req, false);
}
export async function DELETE(req: Request) {
  return gravar(req, true);
}
async function gravar(req: Request, excluir: boolean) {
  const origem = req.headers.get("origin");
  if (origem && origem !== new URL(req.url).origin)
    return erro("Origem não permitida.", 403);
  const sb = await clienteServidor();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return erro("Entre na sua conta para planejar.", 401);
  let body;
  try {
    const texto = await req.text();
    if (texto.length > 200000)
      return erro("O conteúdo ultrapassou o limite.", 413);
    body = JSON.parse(texto);
  } catch {
    return erro("Conteúdo inválido.");
  }
  if (
    !body ||
    typeof body !== "object" ||
    !Object.prototype.hasOwnProperty.call(tabelas, body.entidade)
  )
    return erro("Registro inválido.");
  const op = await operacaoPadrao();
  if (!op) return erro("Nenhuma operação acessível.", 403);
  if (body.operacao !== op.id)
    return erro("A operação mudou. Atualize a página antes de salvar.", 409);
  const tabela = tabelas[body.entidade as keyof typeof tabelas],
    v = body.registro;
  if (!v || typeof v !== "object") return erro("Registro inválido.");
  if (v.id && (!uuid(v.id) || !Number.isInteger(v.revisao) || v.revisao < 1))
    return erro("Identificação inválida.");
  if (excluir) {
    if (!uuid(v.id)) return erro("Registro inválido.");
    const { data, error } = await sb
      .from(tabela)
      .delete()
      .eq("operacao_id", op.id)
      .eq("id", v.id)
      .eq("revisao", v.revisao)
      .select("id");
    if (error)
      return erro("Não foi possível excluir. Tente atualizar a página.", 500);
    if (!data?.length)
      return erro(
        "Este registro mudou ou foi excluído. Atualize a página.",
        409,
      );
    return Response.json({ ok: true });
  }
  let registro: Record<string, unknown>;
  if (body.entidade === "item") {
    const invalido = validarItem(v);
    if (invalido) return erro(invalido);
    const i = v as Item;
    if (
      i.campanha_id &&
      (!uuid(i.campanha_id) || i.natureza !== "acao" || i.id === i.campanha_id)
    )
      return erro("Campanha inválida.");
    if (i.campanha_id) {
      const { data } = await sb
        .from("planejamento_itens")
        .select("id")
        .eq("operacao_id", op.id)
        .eq("natureza", "campanha")
        .eq("id", i.campanha_id)
        .maybeSingle();
      if (!data) return erro("A campanha não pertence a esta operação.");
    }
    for (const [campo, tabelaRef] of [
      ["canais", "canais"],
      ["contas", "contas_canal"],
    ] as const) {
      if (i[campo].some((x) => !uuid(x)))
        return erro("Canal ou conta inválida.");
      if (i[campo].length) {
        const { data, error } = await sb
          .from(tabelaRef)
          .select("id")
          .eq("operacao_id", op.id)
          .in("id", i[campo]);
        if (error || data?.length !== new Set(i[campo]).size)
          return erro("Há um canal ou conta fora desta operação.");
      }
    }
    const estrategia = estrategiaDe(i);
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    if (
      estrategia.execucoes.some((x) => x.inicio > hoje || x.fim > hoje) ||
      estrategia.medicao.data > hoje
    )
      return erro(
        "As datas de execução e medição devem ser de hoje ou anteriores.",
      );
    for (const [prefixo, tabelaRef] of [
      ["canal", "canais"],
      ["conta", "contas_canal"],
    ] as const) {
      const ids = [
        ...new Set(
          estrategia.execucoes
            .filter((x) => x.destino.startsWith(prefixo + ":"))
            .map((x) => x.destino.split(":")[1]),
        ),
      ];
      if (ids.some((id) => !uuid(id)))
        return erro("Destino de execução inválido.");
      if (ids.length) {
        const { data, error } = await sb
          .from(tabelaRef)
          .select("id")
          .eq("operacao_id", op.id)
          .in("id", ids);
        if (error || data?.length !== ids.length)
          return erro("Há um destino de execução fora desta operação.");
      }
    }
    const idsAnuncios = [...new Set(estrategia.anuncios)];
    for (let de = 0; de < idsAnuncios.length; de += 100) {
      const lote = idsAnuncios.slice(de, de + 100);
      const { data, error } = await sb
        .from("anuncios")
        .select("id,canal_id,conta_canal_id")
        .eq("operacao_id", op.id)
        .in("id", lote);
      if (error || data?.length !== lote.length)
        return erro("Há um anúncio indisponível nesta operação.");
      if (
        data.some(
          (a) =>
            i.canais.length + i.contas.length > 0 &&
            !i.canais.includes(a.canal_id) &&
            !i.contas.includes(a.conta_canal_id),
        )
      )
        return erro(
          "Um anúncio selecionado está fora dos canais e contas escolhidos. Confira Produtos.",
        );
    }
    registro = {
      natureza: i.natureza,
      campanha_id: i.campanha_id || null,
      titulo: i.titulo.trim(),
      inicio: i.inicio,
      fim: i.fim,
      status: i.status,
      tipo: i.tipo.trim(),
      etapa: i.etapa,
      cor: i.cor,
      skus: [...new Set(i.skus)],
      canais: [...new Set(i.canais)],
      contas: [...new Set(i.contas)],
      detalhes: { ...i.detalhes, estrategia },
    };
  } else {
    const max = body.entidade === "grupo" ? 100 : 60;
    if (typeof v.nome !== "string" || !v.nome.trim() || v.nome.length > max)
      return erro(`Informe um nome de até ${max} caracteres.`);
    if (body.entidade === "grupo") {
      if (
        !Array.isArray(v.skus) ||
        v.skus.length > 2000 ||
        v.skus.some((s: unknown) => typeof s !== "string" || s.length > 150)
      )
        return erro("Produtos inválidos.");
      registro = { nome: v.nome.trim(), skus: [...new Set(v.skus)] };
    } else {
      if (typeof v.cor !== "string" || !/^#[\da-fA-F]{6}$/.test(v.cor))
        return erro("Cor inválida.");
      registro = { nome: v.nome.trim(), cor: v.cor };
    }
  }
  const query = v.id
    ? sb
        .from(tabela)
        .update(registro)
        .eq("operacao_id", op.id)
        .eq("id", v.id)
        .eq("revisao", v.revisao)
    : sb.from(tabela).insert({ ...registro, operacao_id: op.id });
  const { data, error } = await query.select().maybeSingle();
  if (error) {
    console.error("[planejamento/gravar]", error.code, error.message);
    return erro(
      error.code === "23505"
        ? "Já existe um registro com esse nome."
        : "Não foi possível salvar. Confira a conexão e a configuração do planejamento.",
      error.code === "23505" ? 409 : 500,
    );
  }
  if (!data)
    return erro(
      "Este registro foi alterado em outra sessão. Atualize a página antes de editar.",
      409,
    );
  return Response.json({ registro: data });
}
