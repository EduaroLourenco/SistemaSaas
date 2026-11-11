import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { planejarAtualizacao, type Origem } from "@/lib/atualizacao";
import { BLOCOS, type Bloco } from "@/lib/atualizacao-blocos";

/**
 * A fila da atualização: quem pede não precisa ficar esperando.
 *
 * Antes era o NAVEGADOR que andava de etapa em etapa — fechar a aba ou
 * bloquear o celular parava tudo no meio. Agora o pedido vira uma linha no
 * banco e o servidor anda sozinho: cada chamada de `/api/cron/fila` roda
 * UMA etapa (o servidor corta em 300s, e uma conta grande leva ~4 min só
 * de visitas) e chama a si mesma para a próxima.
 *
 * Mora em `agendamentos` com tipo "atualizacao", que já existia e estava
 * sem uso — evita uma migração. A coluna `atualizado_em`, que o banco
 * renova a cada gravação, serve de trava otimista: só grava quem leu a
 * versão atual.
 *
 * Um corredor só: se alguma etapa está rodando, ninguém começa outra. É o
 * que impede duas chamadas paralelas de dobrar a rajada na cota do Meli,
 * que é dividida com os agentes.
 */
// ponytail: trava otimista por pedido, não global — duas chamadas no mesmo instante em pedidos diferentes podem rodar juntas; raro, e o freio de 4/s segura

const TIPO = "atualizacao";
/** Etapa "rodando" há mais que isto morreu no corte de 300s do servidor. */
const MORTA_MS = 330_000;

export type EstadoEtapa = "aguardando" | "atualizando" | "concluida" | "falhou";
export type EtapaFila = {
  id: string;
  bloco: Bloco;
  fonte: string;
  estado: EstadoEtapa;
  pagina: number;
  detalhe?: string;
  avisos?: string[];
  inicio?: string;
  fim?: string;
};
export type Pedido = {
  id: string;
  operacaoId: string;
  origem: Origem;
  blocos: Bloco[];
  etapas: EtapaFila[];
  criadoEm: string;
  ativo: boolean;
};
type Linha = {
  id: string;
  operacao_id: string;
  ativo: boolean;
  ultimo_disparo: string;
  atualizado_em: string;
  config: { origem: Origem; blocos: Bloco[]; etapas: EtapaFila[] };
};

const COLUNAS = "id,operacao_id,ativo,ultimo_disparo,atualizado_em,config";
const sb = () => clientePrivilegiado();

function paraPedido(l: Linha): Pedido {
  return {
    id: l.id,
    operacaoId: l.operacao_id,
    origem: l.config.origem,
    blocos: l.config.blocos,
    etapas: l.config.etapas,
    criadoEm: l.ultimo_disparo,
    ativo: l.ativo,
  };
}

/** Grava só se ninguém mexeu desde a leitura. Devolve a linha nova, ou null. */
async function gravar(l: Linha, config: Linha["config"], ativo: boolean): Promise<Linha | null> {
  const { data, error } = await sb()
    .from("agendamentos")
    .update({ config, ativo })
    .eq("id", l.id)
    .eq("atualizado_em", l.atualizado_em)
    .select(COLUNAS);
  if (error) throw new Error(`Fila de atualização: ${error.message}`);
  return (data?.[0] as Linha | undefined) ?? null;
}

/** Relê e aplica a mudança até a trava aceitar. */
async function mudar(id: string, f: (c: Linha["config"]) => void) {
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const { data } = await sb().from("agendamentos").select(COLUNAS).eq("id", id).maybeSingle();
    const l = data as Linha | null;
    if (!l) return;
    const config = structuredClone(l.config);
    f(config);
    const ativo = config.etapas.some((e) => e.estado === "aguardando" || e.estado === "atualizando");
    if (await gravar(l, config, ativo)) return;
  }
}

export async function pedirAtualizacao(operacaoId: string, blocos: Bloco[], origem: Origem): Promise<Pedido | { erro: string }> {
  /* Pedido igual ainda na fila: devolve o mesmo, não enfileira de novo. O
     agendado de hora em hora não empilha quando uma hora atrasa. */
  const { data: abertos } = await sb()
    .from("agendamentos").select(COLUNAS)
    .eq("tipo", TIPO).eq("operacao_id", operacaoId).eq("ativo", true);
  const igual = ((abertos ?? []) as Linha[]).find((l) =>
    l.config.origem === origem && blocos.every((b) => l.config.blocos.includes(b)));
  if (igual) return paraPedido(igual);

  const plano = await planejarAtualizacao(operacaoId, blocos);
  if (!plano.length) return { erro: "Nada conectado nesta empresa para o que foi escolhido." };

  // Faxina: uma semana de histórico basta para saber "quando foi a última".
  await sb().from("agendamentos").delete().eq("tipo", TIPO).eq("ativo", false)
    .lt("ultimo_disparo", new Date(Date.now() - 7 * 86_400_000).toISOString());

  const config: Linha["config"] = {
    origem,
    blocos,
    etapas: plano.map((e) => ({ id: e.id, bloco: e.bloco, fonte: e.fonte, estado: "aguardando", pagina: 0 })),
  };
  const { data, error } = await sb().from("agendamentos").insert({
    operacao_id: operacaoId,
    tipo: TIPO,
    cron: origem,
    descricao: blocos.join(", "),
    ativo: true,
    config,
    ultimo_disparo: new Date().toISOString(),
  }).select(COLUNAS).single();
  if (error) return { erro: `Não foi possível registrar o pedido: ${error.message}` };
  return paraPedido(data as Linha);
}

/**
 * Roda a próxima etapa da fila.
 *
 * "continuar" = rodou algo e pode haver mais; "ocupado" = outra chamada
 * está rodando e vai encadear a próxima; "vazio" = nada a fazer.
 */
export async function rodarProxima(): Promise<"continuar" | "ocupado" | "vazio"> {
  const { data } = await sb().from("agendamentos").select(COLUNAS).eq("tipo", TIPO).eq("ativo", true);
  const ativos = (data ?? []) as Linha[];
  const agora = Date.now();

  // Etapa que ficou "rodando" depois do corte do servidor vira falha.
  for (const l of ativos) {
    const mortas = l.config.etapas.filter((e) => e.estado === "atualizando" && agora - Date.parse(e.inicio ?? "") > MORTA_MS);
    if (mortas.length) {
      await mudar(l.id, (c) => c.etapas.forEach((e) => {
        if (mortas.some((m) => m.id === e.id) && e.estado === "atualizando") {
          Object.assign(e, { estado: "falhou", detalhe: "Parou no limite de tempo do servidor.", fim: new Date().toISOString() });
        }
      }));
      return "continuar";
    }
  }
  if (ativos.some((l) => l.config.etapas.some((e) => e.estado === "atualizando"))) return "ocupado";

  // Quem pediu na mão passa na frente do agendado.
  const fila = ativos.sort((a, b) =>
    Number(b.config.origem === "manual") - Number(a.config.origem === "manual") ||
    a.ultimo_disparo.localeCompare(b.ultimo_disparo));
  for (const l of fila) {
    const proxima = l.config.etapas.find((e) => e.estado === "aguardando");
    if (!proxima) {
      await gravar(l, l.config, false);
      continue;
    }
    const config = structuredClone(l.config);
    Object.assign(config.etapas.find((e) => e.id === proxima.id)!, { estado: "atualizando", inicio: new Date().toISOString() });
    if (!(await gravar(l, config, true))) return "continuar"; // outra chamada pegou; tenta de novo

    let fim: Partial<EtapaFila>;
    try {
      const etapa = (await planejarAtualizacao(l.operacao_id, [proxima.bloco])).find((e) => e.id === proxima.id);
      if (!etapa) throw new Error("Esta fonte não está mais conectada.");
      const r = await etapa.executar(proxima.pagina, l.config.origem);
      const continua = Number.isInteger(r.continuacao) && r.continuacao! > proxima.pagina;
      fim = continua
        ? { estado: "aguardando", pagina: r.continuacao, detalhe: `${r.detalhe} · continuando`, avisos: r.avisos }
        : { estado: "concluida", detalhe: r.detalhe, avisos: r.avisos?.length ? r.avisos : undefined };
    } catch (e) {
      fim = { estado: "falhou", detalhe: e instanceof Error ? e.message.slice(0, 400) : "Falha nesta fonte." };
    }
    await mudar(l.id, (c) => {
      const e = c.etapas.find((x) => x.id === proxima.id);
      if (e) Object.assign(e, fim, { fim: new Date().toISOString() });
    });
    return "continuar";
  }
  return "vazio";
}

/**
 * Acorda a fila numa chamada nova do servidor, que ganha os próprios 300s.
 * A rota responde na hora e trabalha depois, então isto não espera a etapa.
 */
export async function acordarFila(origem: string) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return;
  await fetch(`${origem}/api/cron/fila`, {
    method: "POST",
    headers: { authorization: `Bearer ${segredo}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {});
}

/** O que a tela mostra: último pedido manual e a última vez de cada bloco. */
export async function estadoDaEmpresa(operacaoId: string) {
  const { data } = await sb().from("agendamentos").select(COLUNAS)
    .eq("tipo", TIPO).eq("operacao_id", operacaoId)
    .order("ultimo_disparo", { ascending: false }).limit(200);
  const linhas = (data ?? []) as Linha[];
  const ultima: Partial<Record<Bloco, { em: string; falhou: boolean }>> = {};
  for (const l of linhas) {
    for (const b of BLOCOS.map((x) => x.id)) {
      if (ultima[b]) continue;
      const doBloco = l.config.etapas.filter((e) => e.bloco === b);
      if (!doBloco.length || doBloco.some((e) => e.estado === "aguardando" || e.estado === "atualizando")) continue;
      const em = doBloco.map((e) => e.fim ?? "").sort().at(-1)!;
      ultima[b] = { em, falhou: doBloco.some((e) => e.estado === "falhou") };
    }
  }
  const manual = linhas.find((l) => l.config.origem === "manual");
  // Na fila e ninguém rodando (ou rodando além do corte): a tela acorda a fila.
  const travado = linhas.some((l) => l.ativo && !l.config.etapas.some((e) =>
    e.estado === "atualizando" && Date.now() - Date.parse(e.inicio ?? "") < MORTA_MS));
  return { ultima, pedido: manual ? paraPedido(manual) : null, travado };
}
