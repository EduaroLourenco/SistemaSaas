import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar } from "./exclusoes";

/**
 * O pacote completo da operação, pronto para análise externa.
 *
 * ── Por que o formato é diferente do resto do sistema ──
 *
 * As exportações de cada tela usam ponto e vírgula e vírgula decimal,
 * porque o destino é o Excel em português. Este pacote tem outro destino:
 * ser lido por máquina — pandas, R, ou uma IA.
 *
 * Então aqui vale a convenção de máquina: separador vírgula, decimal com
 * PONTO, data em aaaa-mm-dd. Sem isso, "1.234,56" vira texto e toda soma
 * do outro lado dá zero sem avisar.
 *
 * Quem quiser abrir no Excel deve usar os botões de exportar das telas,
 * que são feitos para isso.
 *
 * ── O que sai daqui é o mesmo que está na tela ──
 *
 * As exclusões de análise são aplicadas. Se o pacote trouxesse o lote de
 * 27/08 que o painel descarta, a análise externa chegaria a conclusões
 * que a tela contradiz — e não haveria como saber qual das duas está
 * certa.
 */

export type Arquivo = { nome: string; conteudo: string };

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

/**
 * CSV para máquina: vírgula separa campos, ponto separa decimal.
 *
 * Números saem crus, sem formatação: quem lê do outro lado é que decide
 * como exibir. Formatar aqui obrigaria a desformatar lá.
 */
function csv(cabecalho: string[], linhas: (string | number | null)[][]): string {
  const campo = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cabecalho.join(","), ...linhas.map((l) => l.map(campo).join(","))].join("\n");
}

const dia = (v: unknown) => (v ? String(v).slice(0, 10) : "");

export async function montarPacote(): Promise<Arquivo[]> {
  const sb = await clienteServidor();

  const [pedidosBrutos, { data: contasRaw }, exclusoes, anunciosRaw, desempenhoRaw, diariasRaw] =
    await Promise.all([
      paginar(() =>
        sb
          .from("pedidos")
          .select("id,codigo_externo,data,fechado_em,status,cancelado,total,frete,comissao,conta_canal_id")
          .order("data", { ascending: true })
      ),
      sb.from("contas_canal").select("id,nome,canal_id,canais(nome,codigo)").limit(200),
      carregarExclusoes(),
      paginar(() =>
        sb
          .from("anuncios")
          .select("id,codigo_externo,titulo,sku_canal,tipo,status,preco_atual,comissao_atual,conta_canal_id")
          .order("codigo_externo")
      ),
      paginar(() =>
        sb
          .from("anuncio_desempenho_semanal")
          .select("anuncio_id,ano_iso,semana_iso,inicio,fim,visitas,vendas,receita")
          .order("inicio", { ascending: true })
      ),
      paginar(() =>
        sb
          .from("vendas_diarias")
          .select("data,canal_id,conta_canal_id,visitas,pedidos,receita,investimento_ads,valor_cancelado,pedidos_cancelados,origem")
          .order("data", { ascending: true })
      ),
    ]);

  type Conta = {
    id: string;
    nome: string;
    canal_id: string;
    canais: { nome: string; codigo: string } | null;
  };
  const contas = (contasRaw ?? []) as unknown as Conta[];
  const porConta = new Map(contas.map((c) => [c.id, c]));
  const nomeCanal = (id: string) => porConta.get(id)?.canais?.nome ?? "Outros";
  const nomeConta = (id: string) => porConta.get(id)?.nome ?? "";

  /* ── Pedidos ── */
  type Ped = {
    id: string;
    codigo_externo: string;
    data: string;
    fechado_em: string | null;
    status: string;
    cancelado: boolean;
    total: string | number;
    frete: string | number;
    comissao: string | number | null;
    conta_canal_id: string;
  };

  const anotados = (pedidosBrutos as unknown as Ped[]).map((p) => ({
    ...p,
    canalId: porConta.get(p.conta_canal_id)?.canal_id ?? null,
    contaCanalId: p.conta_canal_id,
  }));
  const { mantidas: pedidos, removidas } = aplicar(anotados, exclusoes);

  const arquivos: Arquivo[] = [];

  arquivos.push({
    nome: "pedidos.csv",
    conteudo: csv(
      ["pedido_id", "codigo_externo", "data", "canal", "conta", "status", "cancelado", "total", "frete", "comissao"],
      pedidos.map((p) => [
        p.id,
        p.codigo_externo,
        dia(p.data),
        nomeCanal(p.conta_canal_id),
        nomeConta(p.conta_canal_id),
        p.status,
        p.cancelado ? 1 : 0,
        n(p.total),
        n(p.frete),
        p.comissao == null ? null : n(p.comissao),
      ])
    ),
  });

  /* ── Itens de pedido ── */
  const idsValidos = new Set(pedidos.map((p) => p.id));
  const contexto = new Map(
    pedidos.map((p) => [
      p.id,
      { data: dia(p.data), canal: nomeCanal(p.conta_canal_id), conta: nomeConta(p.conta_canal_id), cancelado: p.cancelado },
    ])
  );

  const itens = await paginar(() =>
    sb
      .from("pedido_itens")
      .select("pedido_id,codigo_externo,sku,titulo,quantidade,preco_unitario,total,frete,desconto,comissao")
      .order("pedido_id")
  );

  type Item = {
    pedido_id: string;
    codigo_externo: string;
    sku: string | null;
    titulo: string | null;
    quantidade: number;
    preco_unitario: string | number;
    total: string | number;
    frete: string | number | null;
    desconto: string | number | null;
    comissao: string | number | null;
  };

  arquivos.push({
    nome: "itens_pedido.csv",
    conteudo: csv(
      ["pedido_id", "data", "canal", "conta", "cancelado", "sku", "titulo", "quantidade", "preco_unitario", "total", "frete", "desconto"],
      (itens as unknown as Item[])
        .filter((i) => idsValidos.has(i.pedido_id))
        .map((i) => {
          const c = contexto.get(i.pedido_id)!;
          return [
            i.pedido_id,
            c.data,
            c.canal,
            c.conta,
            c.cancelado ? 1 : 0,
            i.sku ?? "",
            i.titulo ?? "",
            i.quantidade,
            n(i.preco_unitario),
            n(i.total),
            i.frete == null ? null : n(i.frete),
            i.desconto == null ? null : n(i.desconto),
          ];
        })
    ),
  });

  /* ── Anúncios ── */
  type Anuncio = {
    id: string;
    codigo_externo: string;
    titulo: string;
    sku_canal: string | null;
    tipo: string;
    status: string;
    preco_atual: string | number | null;
    comissao_atual: string | number | null;
    conta_canal_id: string;
  };
  const anuncios = anunciosRaw as unknown as Anuncio[];
  const porAnuncioId = new Map(anuncios.map((a) => [a.id, a]));

  arquivos.push({
    nome: "anuncios.csv",
    conteudo: csv(
      ["mlb", "sku", "titulo", "tipo", "status", "canal", "conta", "preco_vitrine", "tarifa_percentual"],
      anuncios.map((a) => [
        a.codigo_externo,
        a.sku_canal ?? "",
        a.titulo,
        a.tipo,
        a.status,
        nomeCanal(a.conta_canal_id),
        nomeConta(a.conta_canal_id),
        a.preco_atual == null ? null : n(a.preco_atual),
        a.comissao_atual == null ? null : n(a.comissao_atual),
      ])
    ),
  });

  /* ── Desempenho semanal ── */
  type Des = {
    anuncio_id: string;
    ano_iso: number;
    semana_iso: number;
    inicio: string;
    fim: string;
    visitas: number;
    vendas: number;
    receita: string | number;
  };

  arquivos.push({
    nome: "desempenho_anuncios_semanal.csv",
    conteudo: csv(
      ["mlb", "sku", "tipo", "ano_iso", "semana_iso", "inicio", "fim", "visitas", "vendas", "receita", "conversao_percentual"],
      (desempenhoRaw as unknown as Des[]).map((d) => {
        const a = porAnuncioId.get(d.anuncio_id);
        return [
          a?.codigo_externo ?? "",
          a?.sku_canal ?? "",
          a?.tipo ?? "",
          d.ano_iso,
          d.semana_iso,
          dia(d.inicio),
          dia(d.fim),
          d.visitas ?? 0,
          d.vendas ?? 0,
          n(d.receita),
          // Calculada aqui para quem lê não ter que refazer — e para não
          // arriscar divisão por zero do outro lado.
          d.visitas ? Number(((d.vendas * 100) / d.visitas).toFixed(4)) : null,
        ];
      })
    ),
  });

  /* ── KPIs diários ── */
  type Diaria = {
    data: string;
    canal_id: string;
    conta_canal_id: string;
    visitas: number;
    pedidos: number;
    receita: string | number;
    investimento_ads: string | number;
    valor_cancelado: string | number;
    pedidos_cancelados: number;
    origem: string;
  };

  const diariasAnotadas = (diariasRaw as unknown as Diaria[]).map((d) => ({
    ...d,
    canalId: d.canal_id,
    contaCanalId: d.conta_canal_id,
  }));
  const { mantidas: diarias } = aplicar(diariasAnotadas, exclusoes);

  arquivos.push({
    nome: "kpis_diarios.csv",
    conteudo: csv(
      ["data", "canal", "conta", "pedidos", "receita", "visitas", "investimento_ads", "pedidos_cancelados", "valor_cancelado", "origem"],
      diarias.map((d) => [
        dia(d.data),
        nomeCanal(d.conta_canal_id),
        nomeConta(d.conta_canal_id),
        d.pedidos ?? 0,
        n(d.receita),
        // Zero em visitas significa "não medido" fora do Mercado Livre.
        // Sai vazio de propósito: zero viraria conversão infinita.
        d.visitas ? d.visitas : null,
        n(d.investimento_ads),
        d.pedidos_cancelados ?? 0,
        n(d.valor_cancelado),
        d.origem,
      ])
    ),
  });

  /* ── Canais ── */
  arquivos.push({
    nome: "canais_e_contas.csv",
    conteudo: csv(
      ["canal", "codigo_canal", "conta"],
      contas.map((c) => [c.canais?.nome ?? "Outros", c.canais?.codigo ?? "", c.nome])
    ),
  });

  /* ── O manifesto ──
   *
   * É o arquivo mais importante do pacote. Sem ele, quem analisar vai
   * inventar margem a partir de receita menos comissão, e tratar visita
   * ausente como visita zero. Os dois erros são invisíveis no resultado.
   */
  arquivos.push({
    nome: "LEIA-ME.md",
    conteudo: manifesto({
      pedidos: pedidos.length,
      itens: (itens as unknown[]).length,
      anuncios: anuncios.length,
      semanas: (desempenhoRaw as unknown[]).length,
      diarias: diarias.length,
      removidas,
      exclusoes: exclusoes.map(
        (e) =>
          `${e.dataInicio}${e.dataFim !== e.dataInicio ? ` a ${e.dataFim}` : ""} · ${
            e.canal ?? "todos os canais"
          } · ${e.motivo}`
      ),
      periodo: pedidos.length
        ? `${dia(pedidos[0].data)} a ${dia(pedidos[pedidos.length - 1].data)}`
        : "sem dados",
    }),
  });

  return arquivos;
}

function manifesto(x: {
  pedidos: number;
  itens: number;
  anuncios: number;
  semanas: number;
  diarias: number;
  removidas: number;
  exclusoes: string[];
  periodo: string;
}): string {
  return `# Pacote de análise da operação

Gerado em ${new Date().toISOString().slice(0, 16).replace("T", " ")}.
Período coberto: ${x.periodo}.

## Formato

CSV com **separador vírgula**, **decimal com ponto** e **data em aaaa-mm-dd**.
É a convenção de máquina, escolhida porque o destino aqui é análise
programática. Para abrir no Excel em português, use os botões de exportar
das telas do sistema — aqueles saem em ponto e vírgula com vírgula decimal.

Campo vazio significa **ausente**, não zero. A distinção importa e está
explicada abaixo.

## Arquivos

| Arquivo | Linhas | O que é |
|---|---|---|
| \`pedidos.csv\` | ${x.pedidos} | Um pedido por linha, com canal, conta, total, frete e comissão |
| \`itens_pedido.csv\` | ${x.itens} | Um item por linha, com SKU, quantidade e preço unitário |
| \`anuncios.csv\` | ${x.anuncios} | Catálogo: preço de vitrine, tarifa, tipo e status |
| \`desempenho_anuncios_semanal.csv\` | ${x.semanas} | Visitas, vendas e conversão por anúncio e semana |
| \`kpis_diarios.csv\` | ${x.diarias} | Receita, pedidos, visitas e mídia por canal e dia |
| \`canais_e_contas.csv\` | — | De/para dos canais e contas de vendedor |

## O que estes dados NÃO permitem

Leia antes de analisar. Ignorar isto produz números que parecem certos.

**MARGEM E LUCRO NÃO SÃO CALCULÁVEIS.** O custo do produto não está
cadastrado. \`receita - comissão\` não é margem: falta custo da mercadoria,
frete real, impostos e devolução. Qualquer "margem" derivada daqui é
ficção.

**VISITAS SÓ EXISTEM PARA O MERCADO LIVRE.** Nenhum outro canal exporta
esse dado. Em \`kpis_diarios.csv\` a coluna sai **vazia** quando não foi
medida — tratar como zero produz conversão infinita ou 0%, e as duas
mentem. Conversão de Magalu, VTEX e demais é **desconhecida**, não baixa.

**COMISSÃO É PARCIAL.** Vem preenchida onde o canal informou. Vazio
significa "não informado", não "sem comissão". Para o Mercado Livre, a
alíquota exata por anúncio está em \`anuncios.csv\` (\`tarifa_percentual\`).

**FRETE POR ITEM NEM SEMPRE EXISTE.** Onde o canal informa, está lá.
Vazio significa que só existe no nível do pedido.

**CANCELADO ENTRA NA RECEITA.** \`pedidos.csv\` traz o total do pedido e uma
coluna \`cancelado\`. Receita líquida é você quem calcula, filtrando —
assim a decisão de incluir ou não fica sua.

## Períodos fora da análise

${
  x.exclusoes.length
    ? `Este pacote **exclui** ${x.removidas} registros, por decisão registrada no sistema:

${x.exclusoes.map((e) => `- ${e}`).join("\n")}

Foram removidos para que este pacote e as telas contem a mesma coisa. Os
dados continuam no banco.`
    : "Nenhum período foi excluído. O pacote traz tudo."
}

## Como cruzar os arquivos

- \`itens_pedido.csv\` liga a \`pedidos.csv\` por \`pedido_id\`
- \`desempenho_anuncios_semanal.csv\` liga a \`anuncios.csv\` por \`mlb\`
- \`itens_pedido.csv\` liga a \`anuncios.csv\` por \`sku\` — com uma ressalva:
  o mesmo SKU costuma ter vários anúncios (Clássico e Premium, contas
  diferentes), então a junção é de um para muitos
`;
}
