import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import { paginar } from "./paginar";

/**
 * Saúde dos dados: as perguntas que dizem se dá para confiar nas telas.
 *
 * Cada verificação é uma pergunta de quem usa ("até quando tem venda?",
 * "os totais batem?"), com a resposta em uma linha e um estado. Elas
 * existem porque as fontes mudam — planilha vira API, uma API para — e a
 * tela que lê o dado não percebe sozinha: mostra menos, sem erro.
 *
 * Nasceram de uma auditoria de 08/10/2026: a API da VTEX trouxe 26 pedidos
 * em setembro (contra ~550/mês), uma planilha gravou 116 pedidos num só dia,
 * e o Bling tinha 6 lojas paradas sem canal. Nenhuma tela avisava.
 */

export type Estado = "ok" | "atencao" | "problema";

export type Verificacao = {
  id: string;
  pergunta: string;
  estado: Estado;
  resposta: string;
  /** Linhas de detalhe, uma por conta ou item. */
  detalhes: { nome: string; valor: string; estado: Estado }[];
  link?: { href: string; rotulo: string };
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const diaSP = (desloc = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + desloc * 86_400_000));
const diasAtras = (iso: string, hoje: string) =>
  Math.round((Date.parse(hoje + "T12:00:00Z") - Date.parse(iso + "T12:00:00Z")) / 86_400_000);
const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const pior = (l: Estado[]): Estado => (l.includes("problema") ? "problema" : l.includes("atencao") ? "atencao" : "ok");

export async function carregarSaude(): Promise<Verificacao[]> {
  const op = await operacaoPadrao();
  if (!op) return [];
  const sb = await clienteServidor();
  const hoje = diaSP(0);
  const desde60 = diaSP(-60);

  type Conta = { id: string; nome: string; canais: { nome: string } | null };
  const [contasR, integR] = await Promise.all([
    sb.from("contas_canal").select("id,nome,canais(nome)").eq("operacao_id", op.id).eq("ativa", true),
    sb.from("integracoes").select("provedor,conta_canal_id,status,config,ultima_sincronizacao").eq("operacao_id", op.id),
  ]);
  const contas = (contasR.data ?? []) as unknown as Conta[];
  const nome = (c: Conta) => (c.nome && c.nome !== "Conta principal" && c.nome !== c.canais?.nome ? `${c.canais?.nome} · ${c.nome}` : c.canais?.nome ?? c.nome);
  const integ = (integR.data ?? []) as { provedor: string; conta_canal_id: string | null; status: string; config: Record<string, unknown>; ultima_sincronizacao: string | null }[];
  const viaApi = new Set(integ.filter((i) => i.conta_canal_id).map((i) => i.conta_canal_id!));

  // Último dia com venda e último dia no consolidado, por conta.
  const ultimos = await Promise.all(
    contas.map(async (c) => {
      const [p, v] = await Promise.all([
        sb.from("pedidos").select("data,origem").eq("conta_canal_id", c.id).order("data", { ascending: false }).limit(1),
        sb.from("vendas_diarias").select("data").eq("conta_canal_id", c.id).order("data", { ascending: false }).limit(1),
      ]);
      return { c, pedido: p.data?.[0] as { data: string; origem: string } | undefined, diaria: v.data?.[0]?.data as string | undefined };
    })
  );

  const verificacoes: Verificacao[] = [];

  /* 1. Até quando tem venda, por conta */
  {
    const linhas = ultimos
      .map(({ c, pedido, diaria }) => {
        const ultimo = [pedido?.data, diaria].filter(Boolean).sort().at(-1);
        if (!ultimo) return null;
        const ultimaVenda = `última venda ${dataBr(ultimo)}`;
        /*
         * Conta de API se mede pela última LEITURA da integração, não pela
         * última venda: Amazon com uma venda por semana não está atrasada,
         * só vende pouco. Conta sem API (planilha) se mede pelo último dia.
         */
        const leitura =
          integ.find((i) => i.conta_canal_id === c.id)?.ultima_sincronizacao ??
          (pedido?.origem === "api" ? integ.find((i) => i.provedor === "bling")?.ultima_sincronizacao : null) ??
          null;
        if (leitura) {
          const atraso = diasAtras(leitura.slice(0, 10), hoje);
          const fonte = integ.some((i) => i.conta_canal_id === c.id) ? "API do canal" : "Bling";
          const estado: Estado = atraso <= 2 ? "ok" : atraso <= 6 ? "atencao" : "problema";
          return { nome: nome(c), valor: `${fonte} lida ${atraso === 0 ? "hoje" : atraso === 1 ? "ontem" : `há ${atraso} dias`} · ${ultimaVenda}`, estado, atraso };
        }
        const atraso = diasAtras(ultimo, hoje);
        // Mais de 45 dias sem nada: canal parado, ou planilha que ninguém sobe mais.
        if (atraso > 45)
          return { nome: nome(c), valor: `sem dado desde ${dataBr(ultimo)}: canal parado, ou planilha não importada`, estado: "atencao" as Estado, atraso };
        const estado: Estado = atraso <= 7 ? "ok" : atraso <= 21 ? "atencao" : "problema";
        return { nome: nome(c), valor: `planilha ou lançamento · até ${dataBr(ultimo)} (${atraso === 0 ? "hoje" : atraso === 1 ? "ontem" : `há ${atraso} dias`})`, estado, atraso };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.atraso - a.atraso);
    const atrasadas = linhas.filter((l) => l.estado !== "ok");
    verificacoes.push({
      id: "atualizacao",
      pergunta: "Até quando cada conta tem venda registrada?",
      estado: pior(linhas.filter((l) => l.atraso <= 45).map((l) => l.estado)),
      resposta: atrasadas.length
        ? `${atrasadas.filter((l) => l.atraso <= 45).length} de ${linhas.length} contas atrasadas${atrasadas.some((l) => l.atraso > 45) ? `, ${atrasadas.filter((l) => l.atraso > 45).length} paradas há mais de 45 dias` : ""}. Os totais dessas contas nas telas param na data ao lado.`
        : `Todas as ${linhas.length} contas estão em dia.`,
      detalhes: linhas.map(({ nome, valor, estado }) => ({ nome, valor, estado })),
      link: { href: "/importar", rotulo: "Importar planilha" },
    });
  }

  /* 2. Pedidos × totais diários, últimos 60 dias */
  {
    const [peds, diarias] = await Promise.all([
      paginar(() => sb.from("pedidos").select("conta_canal_id,total").eq("operacao_id", op.id).gte("data", desde60).order("id")),
      paginar(() => sb.from("vendas_diarias").select("conta_canal_id,receita").eq("operacao_id", op.id).gte("data", desde60).order("id")),
    ]);
    const soma = new Map<string, { p: number; d: number }>();
    for (const x of peds as { conta_canal_id: string; total: unknown }[]) {
      const s = soma.get(x.conta_canal_id) ?? { p: 0, d: 0 };
      s.p += n(x.total);
      soma.set(x.conta_canal_id, s);
    }
    for (const x of diarias as { conta_canal_id: string; receita: unknown }[]) {
      const s = soma.get(x.conta_canal_id) ?? { p: 0, d: 0 };
      s.d += n(x.receita);
      soma.set(x.conta_canal_id, s);
    }
    const linhas = contas
      .map((c) => {
        const s = soma.get(c.id);
        if (!s || (s.p === 0 && s.d === 0)) return null;
        if (s.p === 0)
          return { nome: nome(c), valor: "só lançamento diário, sem pedido a pedido (não aparece em Cancelamentos, SKU e Por que caiu)", estado: "atencao" as Estado };
        const dif = ((s.d - s.p) / s.p) * 100;
        const estado: Estado = Math.abs(dif) <= 3 ? "ok" : Math.abs(dif) <= 10 ? "atencao" : "problema";
        return { nome: nome(c), valor: Math.abs(dif) < 0.1 ? "batem" : `diferença de ${dif.toFixed(1).replace(".", ",")}%`, estado };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    const ruins = linhas.filter((l) => l.estado !== "ok");
    verificacoes.push({
      id: "consistencia",
      pergunta: "Os totais diários batem com a soma dos pedidos?",
      estado: pior(linhas.map((l) => l.estado)),
      resposta: ruins.length
        ? `${ruins.length} conta(s) com diferença nos últimos 60 dias. A Visão geral e Vendas usam os totais diários; Cancelamentos, SKU e Por que caiu usam os pedidos. Onde não batem, as telas mostram números diferentes.`
        : "Batem em todas as contas nos últimos 60 dias: as telas de totais e as de pedido mostram o mesmo número.",
      detalhes: linhas,
    });
  }

  /* 2b. Cancelamento fora do padrão, conta a conta, mês a mês */
  {
    /*
     * Pega a troca de fonte que muda o número sem ninguém mexer na operação.
     * Em ago/set de 2026 a planilha da VTEX trouxe pedido nunca pago como
     * "Cancelado": 99% e 49% de cancelamento, contra 5–13% nos outros meses.
     * O "Valor cancelado" e a taxa da loja subiram só por causa da fonte.
     */
    const desde = diaSP(-200);
    const linhas = (await paginar(() =>
      sb.from("vendas_diarias").select("conta_canal_id,data,pedidos,pedidos_cancelados").eq("operacao_id", op.id).gte("data", desde).order("id")
    )) as { conta_canal_id: string; data: string; pedidos: number; pedidos_cancelados: number }[];
    const porContaMes = new Map<string, Map<string, { p: number; c: number }>>();
    for (const l of linhas) {
      const m = porContaMes.get(l.conta_canal_id) ?? new Map();
      const k = l.data.slice(0, 7);
      const x = m.get(k) ?? { p: 0, c: 0 };
      x.p += n(l.pedidos);
      x.c += n(l.pedidos_cancelados);
      m.set(k, x);
      porContaMes.set(l.conta_canal_id, m);
    }
    const detalhes: Verificacao["detalhes"] = [];
    for (const c of contas) {
      const meses = [...(porContaMes.get(c.id) ?? new Map()).entries()].filter(([, x]) => x.p >= 20);
      if (meses.length < 3) continue;
      const taxas = meses.map(([, x]) => x.c / x.p).sort((a, b) => a - b);
      const mediana = taxas[Math.floor(taxas.length / 2)];
      for (const [mes, x] of meses) {
        const t = x.c / x.p;
        if (t >= 0.25 && t >= mediana * 2.5)
          detalhes.push({
            nome: `${nome(c)} · ${mes.split("-").reverse().join("/")}`,
            valor: `${Math.round(t * 100)}% cancelado (normal da conta: ${Math.round(mediana * 100)}%)`,
            estado: "atencao",
          });
      }
    }
    verificacoes.push({
      id: "cancelamento-anomalo",
      pergunta: "Algum mês tem cancelamento fora do padrão da conta?",
      estado: detalhes.length ? "atencao" : "ok",
      resposta: detalhes.length
        ? `${detalhes.length} mês(es) muito acima do normal. Costuma ser troca de fonte (planilha que conta pedido nunca pago como cancelado) e não cancelamento de verdade: o Valor cancelado e a taxa de cancelamento desses meses ficam inflados.`
        : "Nenhum mês destoa do padrão de cancelamento da própria conta.",
      detalhes,
    });
  }

  /* 3. Preço de venda de hoje (Mercado Livre) */
  {
    const [ativos, comPreco] = await Promise.all([
      sb.from("anuncios").select("id", { count: "exact", head: true }).eq("operacao_id", op.id).eq("status", "ativo").ilike("codigo_externo", "MLB%"),
      sb.from("anuncio_estoque_diario").select("id", { count: "exact", head: true }).eq("operacao_id", op.id).eq("data", hoje).not("preco", "is", null),
    ]);
    const total = ativos.count ?? 0;
    // Pode passar do total: anúncio que pausou depois da captura ainda tem o retrato do dia.
    const feitos = Math.min(comPreco.count ?? 0, ativos.count ?? 0);
    if (total) {
      const cobertura = feitos / total;
      verificacoes.push({
        id: "preco",
        pergunta: "O preço que o comprador paga hoje foi registrado?",
        estado: cobertura >= 0.9 ? "ok" : cobertura > 0 ? "atencao" : new Date().getUTCHours() < 10 ? "atencao" : "problema",
        resposta:
          feitos === 0
            ? "Ainda não hoje. A rotina roda às 06h30 e às 07h00; sem ela, Por que caiu usa o preço vendido."
            : `${feitos} de ${total} anúncios ativos do Mercado Livre com o preço de hoje.`,
        detalhes: [],
      });
    }
  }

  /* 4. Bling: lojas sem canal */
  for (const i of integ.filter((x) => x.provedor === "bling")) {
    const pend = (i.config?.lojasPendentes ?? {}) as Record<string, { pedidos: number; exemplo: string }>;
    const lojas = Object.entries(pend).filter(([loja]) => loja !== "0");
    const pedidos = lojas.reduce((s, [, p]) => s + p.pedidos, 0);
    verificacoes.push({
      id: "bling",
      pergunta: "Todas as lojas do Bling têm canal?",
      estado: lojas.length ? "problema" : "ok",
      resposta: lojas.length
        ? `${lojas.length} loja(s) sem canal, com ${pedidos} pedido(s) parados. Eles não entram em nenhuma tela até a loja ser ligada.`
        : `Sim. Última leitura: ${i.ultima_sincronizacao ? dataBr(i.ultima_sincronizacao.slice(0, 10)) : "—"}.`,
      detalhes: lojas.map(([loja, p]) => ({ nome: `Loja ${loja}`, valor: `${p.pedidos} pedido(s), ex.: ${p.exemplo}`, estado: "problema" as Estado })),
      link: lojas.length ? { href: "/integracoes/canais", rotulo: "Ligar lojas" } : undefined,
    });
  }

  /* 5. Custos e produtos */
  {
    const [prods, semCusto, semProduto] = await Promise.all([
      sb.from("produtos").select("id", { count: "exact", head: true }).eq("operacao_id", op.id),
      sb.from("produtos").select("id", { count: "exact", head: true }).eq("operacao_id", op.id).is("custo_unitario", null),
      sb.from("anuncios").select("id", { count: "exact", head: true }).eq("operacao_id", op.id).eq("status", "ativo").is("produto_id", null),
    ]);
    const total = prods.count ?? 0;
    const sem = semCusto.count ?? 0;
    const orfaos = semProduto.count ?? 0;
    verificacoes.push({
      id: "custos",
      pergunta: "Os produtos têm custo para calcular margem?",
      estado: total === 0 ? "problema" : sem / total > 0.5 ? "problema" : sem > 0 ? "atencao" : "ok",
      resposta:
        total === 0
          ? "Nenhum produto cadastrado. Em Custos, use Trazer produtos."
          : sem === 0
            ? `Todos os ${total} produtos têm custo.`
            : `${sem} de ${total} produtos sem custo da mercadoria. A margem desses fica vazia no Financeiro, em Custos e nas promoções por margem.`,
      detalhes: orfaos ? [{ nome: "Anúncios ativos sem produto ligado", valor: `${orfaos} (sem SKU no anúncio, ou SKU diferente do cadastro)`, estado: "atencao" }] : [],
      link: { href: "/financeiro/custos", rotulo: "Preencher custos" },
    });
  }

  return verificacoes;
}
