import { diasEntre, sobrepoe, type Dados, type Item } from "./modelo";
import { estrategiaDe } from "./estrategia";

export type Prioridade = {
  id: string;
  item: Item;
  titulo: string;
  motivo: string;
  passo: string;
  peso: number;
  grupo: "Preparar" | "Executar" | "Aprender" | "Coordenar";
};
/** Canal inteiro inclui suas contas; duas contas diferentes não se confundem. */
export function mesmoDestino(
  a: Item,
  b: Item,
  contas: Dados["contas"],
): boolean {
  if (
    !(a.canais.length + a.contas.length) ||
    !(b.canais.length + b.contas.length)
  )
    return true;
  return (
    a.canais.some((id) => b.canais.includes(id)) ||
    a.contas.some((id) => b.contas.includes(id)) ||
    contas.some(
      (c) =>
        (a.canais.includes(c.canal_id) && b.contas.includes(c.id)) ||
        (b.canais.includes(c.canal_id) && a.contas.includes(c.id)),
    )
  );
}
export function mesmosProdutos(a: Item, b: Item): boolean {
  const skus = new Set(a.skus.map((s) => s.toUpperCase()));
  return (
    b.skus.some((s) => skus.has(s.toUpperCase())) ||
    estrategiaDe(a).anuncios.some((id) => estrategiaDe(b).anuncios.includes(id))
  );
}
export function destinosDoItem(
  item: Item,
  dados: Pick<Dados, "canais" | "contas">,
): { id: string; nome: string }[] {
  // Cada canal selecionado é um destino. Contas explícitas do mesmo canal ficam
  // em registros próprios para permitir registrar execuções em datas diferentes.
  const destinos = [
    ...item.canais.map((id) => ({
      id: `canal:${id}`,
      nome: dados.canais.find((c) => c.id === id)?.nome ?? "Canal indisponível",
    })),
    ...item.contas.map((id) => ({
      id: `conta:${id}`,
      nome: dados.contas.find((c) => c.id === id)?.nome ?? "Conta indisponível",
    })),
  ];
  return destinos.length ? destinos : [{ id: "geral", nome: "Ação geral" }];
}
export function prioridades(dados: Dados, hoje: string): Prioridade[] {
  const saida: Prioridade[] = [];
  const ativos = dados.itens.filter(
    (i) => !["Concluída", "Cancelada"].includes(i.status),
  );
  function incluir(
    item: Item,
    regra: string,
    grupo: Prioridade["grupo"],
    peso: number,
    titulo: string,
    motivo: string,
    passo: string,
  ) {
    saida.push({
      id: `${item.id}:${regra}`,
      item,
      grupo,
      peso,
      titulo,
      motivo,
      passo,
    });
  }
  for (const i of dados.itens.filter((i) => i.status !== "Cancelada")) {
    const e = estrategiaDe(i),
      ateInicio = diasEntre(hoje, i.inicio),
      encerrado = i.fim < hoje || i.status === "Concluída";
    if (encerrado) {
      if (!e.fechamento.decisao || !e.fechamento.proximoPasso.trim())
        incluir(
          i,
          "fechamento",
          "Aprender",
          65,
          "Guardar o aprendizado",
          `O período de “${i.titulo}” terminou ou foi marcado como concluído, mas falta decidir o próximo passo.`,
          "Abra Execução e aprendizado e registre o que vale repetir ou mudar.",
        );
    }
    if (i.status === "Concluída") continue;
    if (ateInicio <= 7 && i.fim >= hoje) {
      const abertas = i.detalhes.checklist.filter((t) => !t.feito).length;
      if (abertas || !i.detalhes.checklist.length)
        incluir(
          i,
          "tarefas",
          "Preparar",
          90,
          abertas
            ? `${abertas} preparativo(s) pendente(s)`
            : "Definir os preparativos",
          `“${i.titulo}” ${ateInicio > 0 ? `começa em ${ateInicio} dia(s)` : "já está no período planejado"}. ${abertas ? "O checklist ainda tem tarefas abertas." : "Ainda não há um checklist."}`,
          "Confira arte, oferta, anúncio e responsável antes de executar.",
        );
      if (!e.indicador || e.alvo === null)
        incluir(
          i,
          "meta",
          "Preparar",
          55,
          "Combinar o que será um bom resultado",
          `“${i.titulo}” ainda não tem indicador e meta numérica definidos.`,
          "Na Estratégia, escolha uma medida de sucesso e explique por que esta ação faz sentido.",
        );
    }
    if (
      i.natureza === "campanha" &&
      ateInicio <= 30 &&
      i.fim >= hoje &&
      !dados.itens.some(
        (a) => a.campanha_id === i.id && a.status !== "Cancelada",
      )
    )
      incluir(
        i,
        "acoes",
        "Preparar",
        80,
        "Transformar a campanha em ações",
        `“${i.titulo}” ainda não tem ações vinculadas.`,
        "Desdobre em revisão de anúncio, Product Ads, promoção, banner ou CRM, conforme o canal.",
      );
    if (i.natureza === "acao" && i.inicio <= hoje) {
      const destinos = destinosDoItem(i, dados);
      const pendentes = destinos.filter(
        (d) =>
          !e.execucoes.some(
            (x) =>
              x.destino === d.id &&
              (encerrado
                ? ["Executada", "Não realizada"].includes(x.situacao)
                : x.situacao !== "Não iniciada"),
          ),
      );
      if (pendentes.length)
        incluir(
          i,
          "execucao",
          "Executar",
          encerrado ? 95 : 85,
          "Conferir o que aconteceu",
          `${pendentes.map((d) => d.nome).join(", ")}: falta registrar ${encerrado ? "como a ação terminou" : "se a ação começou"}. A data do calendário não confirma execução.`,
          "Registre a situação e as datas reais em Execução e aprendizado.",
        );
    }
  }
  const acoes = ativos.filter(
    (i) =>
      i.natureza === "acao" && i.fim >= hoje && diasEntre(hoje, i.inicio) <= 30,
  );
  for (let a = 0; a < acoes.length; a++)
    for (let b = a + 1; b < acoes.length; b++) {
      const i = acoes[a],
        outro = acoes[b];
      if (
        sobrepoe(i.inicio, i.fim, outro.inicio, outro.fim) &&
        mesmoDestino(i, outro, dados.contas) &&
        mesmosProdutos(i, outro)
      )
        incluir(
          i,
          `sobreposicao:${outro.id}`,
          "Coordenar",
          70,
          "Alinhar ações do mesmo produto",
          `“${i.titulo}” e “${outro.titulo}” compartilham produtos e período em destinos que podem coincidir.`,
          "Confira se oferta, preço e comunicação se complementam. Isso pode ser intencional.",
        );
    }
  return saida.sort(
    (a, b) =>
      b.peso - a.peso ||
      a.item.inicio.localeCompare(b.item.inicio) ||
      a.id.localeCompare(b.id),
  );
}
export function aprendizadosPara(item: Item, dados: Dados): Item[] {
  return dados.itens
    .filter(
      (i) =>
        i.id !== item.id &&
        i.status !== "Cancelada" &&
        i.fim < item.inicio &&
        estrategiaDe(i).fechamento.proximoPasso.trim() &&
        mesmoDestino(i, item, dados.contas) &&
        mesmosProdutos(i, item),
    )
    .sort((a, b) => b.fim.localeCompare(a.fim))
    .slice(0, 3);
}
