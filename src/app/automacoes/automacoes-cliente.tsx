"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { BarraFiltros, Filtro } from "@/components/layout/barra-filtros";
import { Badge, Button, EmptyState, Panel, Skeleton } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FotoAnuncio } from "@/components/ui/foto-anuncio";
import { Select, Sheet } from "@/components/ui/controls";
import { money, count, pct } from "@/lib/format";
import type { DadosTrafegoPago, LinhaAnuncioAds } from "@/lib/dados/trafego-pago";
import type { DadosAutomacoes, PromocaoAberta, ItemAutomacao, ItensDaPromocao } from "@/lib/dados/automacoes";
import { FOLGA_PADRAO, TIPO_PADRAO, type Folgas } from "@/lib/folga";
import { avaliarItem, type Regra, type Resultado } from "@/lib/planilhas/avaliar-regras";
import { paraRegra, type ItemDaTela } from "@/lib/planilhas/item-para-regra";
import { pisoDoItem, faixaDoPreco, precoComFolga } from "@/lib/planilhas/piso-promocao";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Automações: o que o canal está oferecendo, e o que a gente faz com isso.
 *
 * ── O estado desta tela ──
 *
 * Ela LÊ. Os botões de aceite montam a seleção e mostram o que seria
 * enviado, mas nada sai daqui para o Mercado Livre ainda: a escrita entra
 * depois do teste manual, com o Eduardo junto, num item só. Até lá o
 * rodapé diz isso com todas as letras, em vez de um botão que parece
 * funcionar e não funciona.
 *
 * ── A coluna que decide ──
 *
 * Não é "acima ou abaixo do piso": é a FAIXA de comissão em que o preço
 * ainda fecha. Quando o canal entra com rebate, a comissão efetiva cai e
 * o preço certo é o de uma faixa mais barata — comparar com o piso cheio
 * pintava o pré-acordo inteiro de vermelho, 96 linhas, todas erradas.
 */

const ROTULO: Record<string, string> = {
  DEAL: "Tradicional", SMART: "Automática", SMART_LIGHTNING: "Relâmpago auto",
  LIGHTNING: "Relâmpago", DOD: "Oferta do dia", PRE_NEGOTIATED: "Pré-acordo",
  UNHEALTHY_STOCK: "Liquidar Full", SELLER_CAMPAIGN: "Nossa campanha",
  SELLER_COUPON_CAMPAIGN: "Cupom", MARKETPLACE_CAMPAIGN: "Cofinanciada",
  PRICE_MATCHING: "Preço competitivo", PRICE_MATCHING_MELI_ALL: "100% Meli",
  PRICE_DISCOUNT: "Desconto avulso", VOLUME: "Leve mais",
};
const TOM: Record<string, "neutral" | "info" | "up" | "down" | "warn"> = {
  DEAL: "info", SELLER_CAMPAIGN: "info", SMART: "neutral", MARKETPLACE_CAMPAIGN: "neutral",
  LIGHTNING: "down", SMART_LIGHTNING: "down", DOD: "down",
  PRE_NEGOTIATED: "up", UNHEALTHY_STOCK: "up", SELLER_COUPON_CAMPAIGN: "warn",
};

/* Onde NÓS definimos o preço, a folga reescreve. Onde o canal define, ela
   só decide se aceita a proposta dele. */
const NOSSO_PRECO = new Set(["DEAL", "SELLER_CAMPAIGN", "PRICE_DISCOUNT"]);

type Situacao = "dentro" | "agendado" | "cabe" | "nao";

const diasAte = (iso: string | null) =>
  iso == null ? null : Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
const dia = (iso: string | null) =>
  iso == null ? "—" : new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export default function Automacoes({ dados, ads, regras, folgas }: {
  dados: DadosAutomacoes;
  ads: DadosTrafegoPago;
  regras: Regra[];
  folgas: Folgas;
}) {
  const [tema, setTema] = React.useState<"promocoes" | "ads">("promocoes");
  const [conta, setConta] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [prazo, setPrazo] = React.useState("");
  /*
   * A folga, lembrada por tipo de campanha.
   *
   * Era um `useState(5)` que voltava a 5% a cada visita. A régua não é a
   * mesma para todo tipo — 5% nas automáticas e 0% no pré-acordo, onde o
   * preço foi negociado a dedo —, então o que se guarda é uma folga por
   * tipo, mais um padrão para quem ainda não tem a sua.
   *
   * O campo edita a folga do tipo EM FOCO: o da promoção aberta, ou o do
   * filtro, ou o padrão. Assim quem está mexendo numa promoção mexe na
   * régua dela, e não numa configuração global que ele não viu.
   */
  const [porTipo, setPorTipo] = React.useState<Record<string, number>>(folgas.porTipo);
  const [erroFolga, setErroFolga] = React.useState<string | null>(null);
  const folgaDe = React.useCallback(
    (t: string) => porTipo[t] ?? porTipo[TIPO_PADRAO] ?? FOLGA_PADRAO,
    [porTipo]
  );
  const [aberta, setAberta] = React.useState<PromocaoAberta | null>(null);
  /* O que cabe no piso só se sabe depois de carregar os itens, então o
     cartão fica sem esses dois números até alguém abrir a promoção. O
     resultado sobe para cá para o cartão não perder a conta ao fechar. */
  const [cabem, setCabem] = React.useState<Map<string, Cabem>>(new Map());
  const anotarCabem = React.useCallback((chave: string, c: Cabem) => {
    setCabem((antes) => new Map(antes).set(chave, c));
  }, []);

  /*
   * Os contadores do canal, buscados em fila de quatro.
   *
   * São três chamadas por promoção. Pedir as 36 de uma vez estoura a
   * cota e nenhuma volta; pedir uma a uma demora. Quatro por vez enche a
   * tela em ordem de prazo, que é a que importa.
   */
  const [contagens, setContagens] = React.useState<Map<string, Contagem>>(new Map());
  const [atualizando, iniciarAtualizacao] = React.useTransition();
  const router = useRouter();

  /*
   * Puxar de novo do canal.
   *
   * A página é force-dynamic, então router.refresh() refaz a leitura no
   * servidor — promoção nova aparece, promoção encerrada some. As
   * contagens são zeradas junto: elas vêm de um efeito que depende da
   * lista, e manter as velhas misturaria número de promoção que saiu.
   */
  const atualizar = () => {
    setContagens(new Map());
    setCabem(new Map());
    iniciarAtualizacao(() => router.refresh());
  };
  React.useEffect(() => {
    let vivo = true;
    const fila = [...dados.promocoes];
    const proximo = async (): Promise<void> => {
      const p = fila.shift();
      if (!p || !vivo) return;
      const q = new URLSearchParams({ conta: p.contaId, promocao: p.codigo, tipo: p.tipo });
      try {
        const r = await fetch(`/api/automacoes/contagem?${q}`);
        const j = await r.json();
        if (vivo && r.ok) setContagens((a) => new Map(a).set(p.contaId + p.codigo, j));
      } catch {
        /* Cartão sem contagem continua clicável — abrir carrega tudo. */
      }
      return proximo();
    };
    void Promise.all(Array.from({ length: 4 }, proximo));
    return () => { vivo = false; };
  }, [dados.promocoes]);

  const promocoes = React.useMemo(
    () =>
      dados.promocoes.filter((p) => {
        if (conta && p.contaId !== conta) return false;
        if (tipo && p.tipo !== tipo) return false;
        if (prazo) {
          const n = diasAte(p.prazo ?? p.fim);
          if (n == null) return false;
          if (prazo === "7" && !(n >= 0 && n <= 7)) return false;
          if (prazo === "30" && !(n >= 0 && n <= 30)) return false;
          if (prazo === "venceu" && n >= 0) return false;
        }
        return true;
      }),
    [dados.promocoes, conta, tipo, prazo]
  );

  const tipos = React.useMemo(() => [...new Set(dados.promocoes.map((p) => p.tipo))], [dados.promocoes]);

  /* O tipo que o campo de folga edita: a promoção aberta manda, depois o
     filtro, e por último o padrão. */
  const tipoEmFoco = aberta?.tipo || tipo || TIPO_PADRAO;

  /*
   * Guardar espera a digitação parar. Sem isso, digitar "12" grava 1 e
   * depois 12 — duas escritas e uma corrida para ver qual chega por
   * último.
   */
  const timerFolga = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mudarFolga = React.useCallback((t: string, v: number) => {
    setPorTipo((antes) => ({ ...antes, [t]: v }));
    setErroFolga(null);
    if (timerFolga.current) clearTimeout(timerFolga.current);
    timerFolga.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/automacoes/folga", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tipo: t, folga: v }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setErroFolga(j.erro ?? "Não consegui guardar a folga.");
        }
      } catch {
        setErroFolga("Não consegui guardar a folga.");
      }
    }, 700);
  }, []);
  React.useEffect(() => () => { if (timerFolga.current) clearTimeout(timerFolga.current); }, []);
  const soma = (campo: keyof Contagem) =>
    promocoes.reduce((t, p) => t + (contagens.get(p.contaId + p.codigo)?.[campo] ?? 0), 0);
  const participando = soma("participando");
  const pendentes = soma("pendentes");
  const urgentes = promocoes.filter((p) => { const n = diasAte(p.prazo ?? p.fim); return n != null && n >= 0 && n <= 7; }).length;
  const vencendo = promocoes.filter((p) => {
    const n = diasAte(p.prazo ?? p.fim);
    return n != null && n >= 0 && n <= 14;
  }).length;

  if (dados.semConexao) {
    return (
      <>
        <PageHeader title="Automações" />
        <PageBody>
          <EmptyState
            title="Nenhuma conta do Mercado Livre conectada"
            description="Conecte uma conta em Canais e contas para ver as promoções abertas."
          />
      </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Automações"
        badge={<Badge tone="warn">envio com confirmação</Badge>}
        inlineFilters
        actions={
          <div className="flex items-center gap-2">
          <Button onClick={atualizar} disabled={atualizando} title="Puxar as promoções do canal de novo">
            <RefreshCw size={15} className={atualizando ? "animate-spin" : undefined} />
            {atualizando ? "Puxando…" : "Atualizar"}
          </Button>
          <div className="flex gap-1 rounded-r1 bg-panel-3 p-[3px]">
            {([["promocoes", "Promoções"], ["ads", "Tráfego pago"]] as const).map(([k, r]) => (
              <button
                key={k} onClick={() => setTema(k)} aria-selected={tema === k}
                className={[
                  "rounded-[7px] px-3.5 py-[7px] text-[13px] font-semibold transition",
                  tema === k ? "bg-panel text-ink shadow-1" : "text-ink-2 hover:text-ink",
                ].join(" ")}
              >
                {r}
              </button>
            ))}
          </div>
          </div>
        }
        filters={
          tema === "ads" ? undefined : (
          <BarraFiltros>
            <Filtro rotulo="Conta">
              <Select value={conta} onChange={(e) => setConta(e.target.value)} className="min-w-[180px]">
                <option value="">Todas</option>
                {dados.contas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </Select>
            </Filtro>
            <Filtro rotulo="Tipo">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="min-w-[150px]">
                <option value="">Todos</option>
                {tipos.map((t) => (
                  <option key={t} value={t}>{ROTULO[t] ?? t}</option>
                ))}
              </Select>
            </Filtro>
            <Filtro rotulo="Prazo">
              <Select value={prazo} onChange={(e) => setPrazo(e.target.value)} className="min-w-[150px]">
                <option value="">Qualquer</option>
                <option value="7">Vence em 7 dias</option>
                <option value="30">Em 30 dias</option>
                <option value="venceu">Já venceu</option>
              </Select>
            </Filtro>
            <Filtro
              rotulo={`Folga abaixo do piso · ${tipoEmFoco === TIPO_PADRAO ? "padrão" : ROTULO[tipoEmFoco] ?? tipoEmFoco}`}
            >
              <input
                type="number" min={0} max={30} step={0.5} value={folgaDe(tipoEmFoco)}
                onChange={(e) => {
                  const bruto = e.target.value;
                  /* Campo vazio é meio da digitação, não 0%: salvar aqui
                     gravaria zero toda vez que alguém apaga para trocar o
                     número — e 0% é uma régua de verdade, a do pré-acordo. */
                  if (bruto === "") return;
                  mudarFolga(tipoEmFoco, Math.min(30, Math.max(0, Number(bruto) || 0)));
                }}
                className="h-10 w-[86px] rounded-r1 border border-line bg-panel px-2 text-right font-mono text-[13px] text-ink focus:border-brand"
              />
            </Filtro>
          </BarraFiltros>
          )
        }
      />
      <PageBody>
        {tema === "ads" && <Ads dados={ads} />}
        {tema === "promocoes" && (<>
        {/* Um número manda, o resto é contexto. Quatro cartões do mesmo
            tamanho não dizem para onde olhar. */}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-line pb-4">
          <div>
            <p className="font-mono text-[46px] font-extrabold leading-[0.95] tracking-[-0.045em] text-ink">
              <Sobe valor={pendentes} />
            </p>
            <p className="mt-1 text-[13px] text-ink-2">
              itens esperando a sua resposta
              {urgentes > 0 && (
                <span className="ml-2 rounded-r1 bg-down-wash px-2 py-0.5 text-[12px] font-semibold text-down">
                  {count(urgentes)} vencem em até 7 dias
                </span>
              )}
            </p>
          </div>
          <dl className="flex gap-7 pb-1">
            <div>
              <dd className="font-mono text-[19px] font-bold text-up"><Sobe valor={participando} /></dd>
              <dt className="text-[11.5px] text-ink-3">já no ar</dt>
            </div>
            <div>
              <dd className="font-mono text-[19px] font-bold text-ink"><Sobe valor={promocoes.length} /></dd>
              <dt className="text-[11.5px] text-ink-3">promoções abertas</dt>
            </div>
            <div>
              <dd className="font-mono text-[19px] font-bold text-ink">{count(dados.contas.length)}</dd>
              <dt className="text-[11.5px] text-ink-3">contas</dt>
            </div>
          </dl>
        </div>

        {dados.falhas.length > 0 && (
          <Panel className="mt-4 border-down/40 bg-down-wash/40">
            <div className="flex items-start gap-2 p-4 text-[13px]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-down" />
              <div>
                {dados.falhas.map((f) => (
                  <p key={f.conta}><b>{f.conta}</b> não respondeu: {f.erro}</p>
                ))}
              </div>
            </div>
          </Panel>
        )}

        {(folgas.faltaMigracao || erroFolga) && (
          <Panel className="mt-4 border-warn/40 bg-warn-wash/40">
            <div className="flex items-start gap-2 p-4 text-[13px]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
              <p>{erroFolga ?? folgas.faltaMigracao}</p>
            </div>
          </Panel>
        )}

        <Carrossel
          promocoes={promocoes}
          aberta={aberta}
          cabem={cabem}
          contagens={contagens}
          onAbrir={(p) => setAberta(aberta?.codigo === p.codigo && aberta.contaId === p.contaId ? null : p)}
        />

        {aberta && (
          <Detalhe
            key={aberta.contaId + aberta.codigo}
            promocao={aberta}
            folga={folgaDe(aberta.tipo)}
            regras={regras}
            onContar={anotarCabem}
          />
        )}
        </>)}
      </PageBody>
    </>
  );
}

/* ══ O carrossel ══════════════════════════════════════════════ */

/**
 * O número subindo até o valor, em vez de pular.
 *
 * Os contadores chegam em fila, então a tela ficaria piscando número
 * novo a cada resposta do canal. Subir conta a história: está carregando,
 * e está crescendo.
 */
function Sobe({ valor }: { valor: number }) {
  const [v, setV] = React.useState(valor);
  const anterior = React.useRef(valor);
  React.useEffect(() => {
    const de = anterior.current;
    anterior.current = valor;
    if (de === valor) return;
    const inicio = performance.now();
    let vivo = true;
    const passo = (agora: number) => {
      if (!vivo) return;
      const t = Math.min(1, (agora - inicio) / 420);
      /* Desacelera no fim: o número assenta em vez de parar seco. */
      setV(Math.round(de + (valor - de) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    return () => { vivo = false; };
  }, [valor]);
  return <>{count(v)}</>;
}

/** Um número do cartão: grande, com o rótulo pequeno embaixo. */
function Conta({ rotulo, valor, cor, carregando }: {
  rotulo: string; valor: number | null; cor: string; carregando?: boolean;
}) {
  return (
    <div>
      <dd className={`font-mono text-[22px] font-extrabold leading-none tracking-[-0.03em] ${cor}`}>
        {valor == null
          ? <span className={`inline-block h-[16px] w-8 rounded bg-panel-3 ${carregando ? "animate-pulse" : ""}`} />
          : count(valor)}
      </dd>
      <dt className="mt-1 text-[11px] text-ink-3">{rotulo}</dt>
    </div>
  );
}

/** A proporção da promoção: no ar, esperando resposta, e o que não cabe. */
function Barra({ c, cabe }: { c: Contagem | null; cabe: Cabem | null }) {
  const dentro = c?.participando ?? 0;
  const agendado = c?.agendados ?? 0;
  const pend = c?.pendentes ?? 0;
  const total = dentro + agendado + pend;
  if (!total) return <div className="mt-3 h-[6px] rounded bg-panel-3" />;
  /* Dentro dos pendentes, separa o que cabe do que não cabe — mas só
     depois de a promoção ter sido aberta, que é quando isso se sabe. */
  const cabem = cabe?.cabem ?? 0, nao = cabe?.nao ?? 0;
  const semConta = cabe ? Math.max(0, pend - cabem - nao) : pend;
  const faixas: [number, string][] = [
    [dentro, "bg-up"], [agendado, "bg-info"],
    [cabem, "bg-brand"], [nao, "bg-down"], [semConta, "bg-line-2"],
  ];
  return (
    <div className="mt-3 flex h-[6px] gap-[2px] overflow-hidden rounded bg-panel-3">
      {faixas.map(([v, cor], k) =>
        v > 0 ? <i key={k} className={cor} style={{ width: `${(v / total) * 100}%` }} /> : null
      )}
    </div>
  );
}

type Cabem = { cabem: number; nao: number };
type Contagem = { participando: number | null; agendados: number | null; pendentes: number | null };

/** O que a revisão manda para a rota — o mesmo formato do envio. */
type PedidoRevisao = {
  mlb: string; promocao: string; tipo: string;
  preco: number | null; oferta: string | null; estoque: number | null; tetoDoCanal: number | null;
};
type LinhaRevisao = {
  mlb: string; vai: boolean; motivo?: string;
  metodo?: string; caminho?: string; corpo?: Record<string, unknown>;
};
type RespostaEnvio = {
  conta: string; entraram: number; recusados: number;
  resultados: { mlb: string; ok: boolean; preco?: number | null; erro?: string }[];
};
type RespostaRevisao = {
  conta: string; escritaConectada: boolean; vao: number; ficam: number; linhas: LinhaRevisao[];
};

function Carrossel({
  promocoes, aberta, onAbrir, cabem, contagens,
}: {
  promocoes: PromocaoAberta[];
  aberta: PromocaoAberta | null;
  onAbrir: (p: PromocaoAberta) => void;
  cabem: Map<string, Cabem>;
  contagens: Map<string, Contagem>;
}) {
  if (!promocoes.length) {
    return <div className="mt-4"><EmptyState title="Nenhuma promoção com esses filtros" /></div>;
  }
  /* Em grupos por urgência: uma fila de 27 cartões iguais não diz o
     que olhar primeiro, e o prazo é justamente o que decide a ordem. */
  const grupos: { titulo: string; itens: PromocaoAberta[] }[] = [
    { titulo: "Esta semana", itens: [] },
    { titulo: "Este mês", itens: [] },
    { titulo: "Sem pressa", itens: [] },
  ];
  for (const p of promocoes) {
    const n = diasAte(p.prazo ?? p.fim);
    grupos[n == null ? 2 : n <= 7 ? 0 : n <= 30 ? 1 : 2].itens.push(p);
  }

  return (
    <div className="mt-4 space-y-5">
      {grupos.filter((g) => g.itens.length).map((g) => (
        <section key={g.titulo}>
          <h2 className="mb-2 flex items-baseline gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            {g.titulo}
            <span className="font-mono text-[11px] font-normal normal-case tracking-normal">
              {count(g.itens.length)}
            </span>
          </h2>
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
          {g.itens.map((p) => {
        const n = diasAte(p.prazo ?? p.fim);
        const chave = p.contaId + p.codigo;
        const estaAberta = aberta?.codigo === p.codigo && aberta.contaId === p.contaId;
        const cabe = cabem.get(chave) ?? null;
        const c = contagens.get(chave) ?? null;
        return (
          <button
            key={chave}
            onClick={() => onAbrir(p)}
            aria-expanded={estaAberta}
            className={[
              "w-[270px] shrink-0 snap-start rounded-r3 border bg-panel p-4 text-left transition",
              "hover:-translate-y-0.5 hover:shadow-2",
              estaAberta ? "border-brand shadow-2 ring-2 ring-brand-wash" : "border-line shadow-1",
            ].join(" ")}
          >
            <div className="mb-2 flex items-center gap-2">
              <Badge tone={TOM[p.tipo] ?? "neutral"}>{ROTULO[p.tipo] ?? p.tipo}</Badge>
              <span className="ml-auto truncate text-[11px] text-ink-3">{p.contaNome}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={[
                "font-mono text-[32px] font-extrabold leading-none tracking-[-0.04em]",
                n != null && n <= 7 ? "text-down" : "text-ink",
              ].join(" ")}>
                {n == null ? "—" : n < 0 ? "venceu" : n}
              </span>
              <span className="text-[12px] font-semibold text-ink-2">
                {n == null ? "sem prazo de aceite" : n < 0 ? "" : n === 1 ? "dia para aceitar" : "dias para aceitar"}
              </span>
            </div>
            <p className="mt-2 min-h-[34px] text-[13.5px] font-semibold leading-snug text-ink">
              {p.nome ?? "Sem nome"}
            </p>
            <p className="font-mono text-[11.5px] text-ink-3">{dia(p.inicio)} → {dia(p.fim)}</p>

            {/* A barra conta a história antes dos números: quanto da
                promoção já está no ar e quanto espera resposta. */}
            <Barra c={c} cabe={cabe} />

            {/* Dois números, não cinco. Cabem e não cabem só existem
                depois de abrir, e até lá ocupavam metade do cartão
                repetindo "ao abrir" com peso de número. */}
            <dl className="mt-3 grid grid-cols-2 gap-x-3">
              <Conta rotulo="no ar" valor={c?.participando ?? null} cor="text-up" carregando={!c} />
              {cabe
                ? <Conta rotulo="cabem no piso" valor={cabe.cabem} cor="text-brand-2" />
                : <Conta rotulo="esperando resposta" valor={c?.pendentes ?? null} cor="text-ink" carregando={!c} />}
            </dl>

            <p className="mt-2.5 flex items-center gap-2 border-t border-line pt-2 text-[11px] text-ink-3">
              {cabe
                ? <>{count(cabe.nao)} não cabem{(c?.agendados ?? 0) > 0 && ` · ${count(c!.agendados!)} agendados`}</>
                : (c?.agendados ?? 0) > 0
                  ? <>{count(c!.agendados!)} agendados</>
                  : <>&nbsp;</>}
              {p.meliPct != null && (
                <span className="ml-auto whitespace-nowrap">
                  Meli <b className="text-up">{pct(p.meliPct, 1)}</b>
                </span>
              )}
            </p>
          </button>
        );
      })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ══ O detalhe ════════════════════════════════════════════════ */

type Aba = "cabem" | "nao" | "dentro" | "todos";

function Detalhe({ promocao, folga, regras, onContar }: {
  promocao: PromocaoAberta;
  folga: number;
  regras: Regra[];
  onContar: (chave: string, c: Cabem) => void;
}) {
  const [dados, setDados] = React.useState<ItensDaPromocao | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aba, setAba] = React.useState<Aba>("cabem");
  const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
  const ultimaContagem = React.useRef<Cabem | null>(null);
  const [revisao, setRevisao] = React.useState<PedidoRevisao[] | null>(null);
  /* O que as regras decidiram, por MLB. Vazio = ninguém aplicou ainda. */
  const [porRegra, setPorRegra] = React.useState<Map<string, Resultado>>(new Map());
  /* Preço que a pessoa digitou, por MLB. Vazio = vale o que a folga propôs. */
  const [precos, setPrecos] = React.useState<Map<string, number>>(new Map());

  React.useEffect(() => {
    let vivo = true;
    setDados(null); setErro(null);
    const q = new URLSearchParams({ conta: promocao.contaId, promocao: promocao.codigo, tipo: promocao.tipo });
    fetch(`/api/automacoes/itens?${q}`)
      .then(async (r) => {
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) setErro(j.erro ?? "o canal não respondeu");
        else setDados(j as ItensDaPromocao);
      })
      .catch((e) => vivo && setErro(String(e)));
    return () => { vivo = false; };
  }, [promocao.contaId, promocao.codigo, promocao.tipo]);

  const nossoPreco = NOSSO_PRECO.has(promocao.tipo);

  /*
   * Piso e faixa saíram para `lib/planilhas/piso-promocao.ts`: a fila de
   * aprovação decide no servidor, e a conta do piso tem de ser a MESMA
   * dos dois lados. Aqui ficam só os embrulhos que carregam as bandas.
   */
  const pisoDe = React.useCallback(
    (i: ItemAutomacao) => (dados ? pisoDoItem(i, dados.bandas) : i.piso),
    [dados]
  );

  const faixaDe = React.useCallback(
    (i: ItemAutomacao, preco: number | null) =>
      dados ? faixaDoPreco(i, dados.bandas, preco) : null,
    [dados]
  );

  const precoDecide = (i: ItemAutomacao) => i.precoCanal ?? i.sugerido ?? null;

  /** Onde somos nós que definimos, a oferta é o piso com a folga — e
      nunca acima do teto do canal, que devolve recusado. */
  const nossaOferta = React.useCallback(
    (i: ItemAutomacao) => {
      if (!nossoPreco || i.status !== "candidate") return null;
      const ps = pisoDe(i);
      if (ps == null) return null;
      let v = ps * (1 - folga / 100);
      if (i.minimoCanal != null) v = Math.max(v, i.minimoCanal);
      const teto = Math.min(i.maximoCanal ?? Infinity, i.precoCanal ?? Infinity);
      if (v > teto + 0.01) return { bloqueado: true as const };
      return { valor: Math.round(v * 100) / 100 };
    },
    [nossoPreco, pisoDe, folga]
  );

  const situacaoDe = React.useCallback(
    (i: ItemAutomacao): Situacao => {
      if (i.status === "started") return "dentro";
      if (i.status === "pending") return "agendado";
      if (nossoPreco) return nossaOferta(i)?.valor != null ? "cabe" : "nao";
      const p = precoDecide(i), ps = pisoDe(i);
      if (p == null || ps == null) return "cabe";
      return p >= ps * (1 - folga / 100) - 0.01 ? "cabe" : "nao";
    },
    [nossoPreco, nossaOferta, pisoDe, folga]
  );

  if (erro) {
    return (
      <Panel className="mt-4">
        <EmptyState
          title="Não consegui ler os itens desta promoção"
          description={erro}
          action={<Button onClick={() => location.reload()}><RefreshCw size={15} />Tentar de novo</Button>}
        />
      </Panel>
    );
  }
  if (!dados) {
    return (
      <Panel className="mt-4 p-4">
        <Skeleton className="h-6 w-56" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 6 }, (_, k) => <Skeleton key={k} className="h-9 w-full" />)}
        </div>
      </Panel>
    );
  }

  const contagem = { dentro: 0, agendado: 0, cabe: 0, nao: 0, fora: 0 };
  for (const i of dados.itens) {
    contagem[situacaoDe(i)]++;
    const p = nossaOferta(i)?.valor ?? precoDecide(i);
    if (i.precos.length && p != null && faixaDe(i, p) == null) contagem.fora++;
  }

  const lista = dados.itens.filter((i) => {
    const s = situacaoDe(i);
    return aba === "todos" || (aba === "cabem" && s === "cabe") || (aba === "nao" && s === "nao")
      || (aba === "dentro" && (s === "dentro" || s === "agendado"));
  });

  /* Sobe a conta para o cartão: ele não tem como saber o que cabe sem os
     itens, e sem isto perderia o número ao fechar. */
  if (contagem.cabe !== ultimaContagem.current?.cabem || contagem.nao !== ultimaContagem.current?.nao) {
    ultimaContagem.current = { cabem: contagem.cabe, nao: contagem.nao };
    queueMicrotask(() => onContar(promocao.contaId + promocao.codigo, { cabem: contagem.cabe, nao: contagem.nao }));
  }

  /** O que vai para o canal: o digitado ganha do proposto pela folga. */
  const precoFinal = (i: ItemAutomacao) => precos.get(i.mlb) ?? nossaOferta(i)?.valor ?? null;

  const marcar = (mlb: string) =>
    setMarcados((a) => { const n = new Set(a); n.has(mlb) ? n.delete(mlb) : n.add(mlb); return n; });

  const colunas: Column<ItemAutomacao>[] = [
    {
      key: "sel", header: "", sticky: true, width: "44px", mobile: "hidden",
      cell: (i) => (
        <input
          type="checkbox" className="h-[17px] w-[17px] accent-brand"
          checked={marcados.has(i.mlb)}
          onChange={() => marcar(i.mlb)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Marcar ${i.titulo ?? i.mlb}`}
        />
      ),
    },
    {
      key: "produto", header: "Produto", sticky: true, mobile: "title", width: "300px",
      sortValue: (i) => i.titulo ?? i.mlb,
      cell: (i) => (
        <div className="flex items-center gap-2.5">
          <FotoAnuncio src={i.foto} alt="" className="h-9 w-9 shrink-0 rounded-r1" />
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-medium text-ink">{i.titulo ?? i.mlb}</p>
            <p className="font-mono text-[10.5px] text-ink-3">{i.sku ?? "sem SKU"} · {i.mlb}</p>
          </div>
        </div>
      ),
    },
    { key: "cheio", header: "Preço cheio", align: "right", mobile: "hidden",
      sortValue: (i) => i.precoCheio ?? 0, cell: (i) => (i.precoCheio == null ? vazio() : money(i.precoCheio)) },
    { key: "pede", header: "O Meli pede", align: "right", mobile: "metric",
      sortValue: (i) => precoDecide(i) ?? 0,
      cell: (i) => (precoDecide(i) == null ? vazio(i.status === "candidate" ? "ele não propôs" : undefined) : money(precoDecide(i)!)) },
    { key: "faixa", header: "Faixa que sobra", align: "right", mobile: "metric",
      sortValue: (i) => faixaDe(i, nossaOferta(i)?.valor ?? precoDecide(i)) ?? -1,
      cell: (i) => {
        if (!i.precos.length) return vazio("sem tabela");
        const p = nossaOferta(i)?.valor ?? precoDecide(i);
        if (p == null) return vazio();
        const f = faixaDe(i, p);
        if (f == null) return <Badge tone="down">fora da tabela</Badge>;
        const perdeu = (i.comissaoCheia ?? 0.115) - f;
        return <Badge tone={perdeu <= 0.01 ? "up" : perdeu <= 0.04 ? "warn" : "down"}>{pct(f * 100, 1)}</Badge>;
      } },
    { key: "piso", header: "Nosso piso", align: "right", mobile: "hidden",
      sortValue: (i) => pisoDe(i) ?? 0, cell: (i) => (pisoDe(i) == null ? vazio() : money(pisoDe(i)!)) },
    /* Editável, que é o que a planilha dava: a folga propõe o preço e a
       pessoa ajusta a linha que quiser antes de mandar. */
    { key: "oferta", header: "Nossa oferta", align: "right", mobile: "hidden",
      sortValue: (i) => precoFinal(i) ?? 0,
      cell: (i) => {
        if (!nossoPreco) return vazio("ele define");
        const o = nossaOferta(i);
        if (o?.bloqueado) return <Badge tone="down">não dá para subir</Badge>;
        if (o?.valor == null) return vazio();
        const teto = Math.min(i.maximoCanal ?? Infinity, i.precoCanal ?? Infinity);
        const v = precoFinal(i)!;
        const acimaDoTeto = Number.isFinite(teto) && v > teto + 0.01;
        return (
          <input
            type="number" step="0.01" min={0} value={v}
            onChange={(e) => {
              const n = Number(e.target.value);
              setPrecos((a) => { const m = new Map(a); Number.isFinite(n) && n > 0 ? m.set(i.mlb, n) : m.delete(i.mlb); return m; });
            }}
            onClick={(e) => e.stopPropagation()}
            className={[
              "w-[104px] rounded-r1 border bg-panel px-2 py-1 text-right font-mono text-[12.5px]",
              acimaDoTeto ? "border-down text-down" : "border-line-2 text-brand-2 font-bold",
            ].join(" ")}
            title={acimaDoTeto ? `O canal propôs ${money(teto)} — acima disso ele recusa` : undefined}
          />
        );
      } },
    { key: "meli", header: "Meli põe", align: "right", mobile: "hidden",
      sortValue: (i) => i.meliPct ?? 0, cell: (i) => (i.meliPct == null ? vazio() : pct(i.meliPct, 1)) },
    { key: "estoque", header: "Estoque", align: "right", mobile: "hidden",
      sortValue: (i) => i.estoque ?? 0,
      cell: (i) => (i.estoque == null ? vazio() : i.estoque >= 40_000 ? "sob enc." : count(i.estoque)) },
    { key: "regra", header: "Regra", align: "right", mobile: "hidden",
      sortValue: (i) => porRegra.get(i.mlb)?.regraNome ?? "",
      cell: (i) => {
        const d = porRegra.get(i.mlb);
        if (!d) return vazio();
        if (d.decisao === "sem_regra") return vazio("nenhuma bateu");
        const tom = { aceitar: "up", reescrever: "info", nao_entrar: "down", conferir: "warn" } as const;
        return (
          <span className="inline-flex flex-col items-end gap-0.5">
            <Badge tone={tom[d.decisao as keyof typeof tom] ?? "neutral"}>{d.regraNome}</Badge>
            <span className="text-[10.5px] text-ink-3">{d.motivo}</span>
          </span>
        );
      } },
    { key: "situacao", header: "Situação", align: "right", mobile: "subtitle",
      sortValue: (i) => situacaoDe(i),
      cell: (i) => {
        const s = situacaoDe(i);
        const r = { dentro: ["Já dentro", "up"], agendado: ["Agendado", "info"], cabe: ["Cabe", "neutral"], nao: ["Não cabe", "down"] } as const;
        return <Badge tone={r[s][1]}>{r[s][0]}</Badge>;
      } },
  ];

  const podeMarcar = lista.filter((i) => situacaoDe(i) === "cabe");

  return (
    <Panel className="mt-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <Badge tone={TOM[promocao.tipo] ?? "neutral"}>{ROTULO[promocao.tipo] ?? promocao.tipo}</Badge>
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-bold tracking-[-0.015em] text-ink">{promocao.nome ?? "Sem nome"}</h2>
          <p className="font-mono text-[12px] text-ink-3">
            {promocao.contaNome} · {promocao.codigo} · {dia(promocao.inicio)} → {dia(promocao.fim)}
          </p>
        </div>
        {dados.truncado && <Badge tone="warn">lista cortada em 2.000 itens</Badge>}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
        {([
          ["cabem", "Cabem", contagem.cabe],
          ["nao", "Não cabem", contagem.nao],
          ["dentro", "Já dentro", contagem.dentro + contagem.agendado],
          ["todos", "Todos", dados.itens.length],
        ] as const).map(([k, r, n]) => (
          <button
            key={k} onClick={() => setAba(k)} aria-selected={aba === k}
            className={[
              "min-h-[42px] whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold transition",
              aba === k ? "border-brand text-brand-2" : "border-transparent text-ink-2 hover:text-ink",
            ].join(" ")}
          >
            {r} <span className="font-mono opacity-80">{count(n)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-4 py-2.5 text-[12.5px]">
        <Badge tone={nossoPreco ? "info" : "neutral"}>
          {nossoPreco ? "preço nosso" : "preço do canal"}
        </Badge>
        {contagem.fora > 0 && (
          <Badge tone="down">{count(contagem.fora)} fora da tabela</Badge>
        )}
        <Button
          className="ml-auto"
          disabled={!regras.length}
          title={regras.length ? undefined : "Crie regras em Automações › Regras de promoção"}
          onClick={() => {
            /* A regra decide; quem marca é a decisão dela. O envio
               continua passando por revisar. */
            const decidido = new Map<string, Resultado>();
            const marcar = new Set<string>();
            for (const i of dados.itens) {
              if (i.status !== "candidate") continue;
              const d = avaliarItem(paraRegra(paraItemDaTela(i, promocao)), regras);
              decidido.set(i.mlb, d);
              if (d.decisao === "aceitar" || d.decisao === "reescrever") marcar.add(i.mlb);
              if (d.decisao === "reescrever" && d.acao?.tipo === "reescrever" && d.acao.folgaPct != null) {
                /* Fora da closure: dentro dela o TypeScript perde o
                   estreitamento e `folgaPct` volta a poder não existir. */
                const folgaDaRegra = d.acao.folgaPct;
                const ps = pisoDe(i);
                if (ps != null) {
                  setPrecos((a) => new Map(a).set(i.mlb, precoComFolga(ps, folgaDaRegra)));
                }
              }
            }
            setPorRegra(decidido);
            setMarcados(marcar);
          }}
        >
          Aplicar regras
        </Button>
        <Button
          disabled={!podeMarcar.length}
          onClick={() => setMarcados(new Set(podeMarcar.map((i) => i.mlb)))}
        >
          Marcar os {count(podeMarcar.length)} que cabem
        </Button>
      </div>

      <DataTable
        columns={colunas}
        rows={lista}
        rowKey={(i) => i.mlb}
        defaultSort={{ key: "pede", dir: "desc" }}
        empty={aba === "nao" ? "nenhum item fora do piso" : aba === "dentro" ? "nenhum item dentro ainda" : "nenhum item"}
      />

      {marcados.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-panel-2 px-4 py-3">
          <span className="font-mono text-[18px] font-extrabold text-ink">{count(marcados.size)}</span>
          <span className="text-[12.5px] text-ink-2">marcados</span>
          <Button className="ml-auto" onClick={() => setMarcados(new Set())}>Limpar</Button>
          <Button
            onClick={() =>
              setRevisao(
                dados.itens
                  .filter((i) => marcados.has(i.mlb))
                  .map((i) => ({
                    mlb: i.mlb,
                    promocao: promocao.codigo,
                    tipo: promocao.tipo,
                    preco: nossoPreco ? precoFinal(i) : null,
                    oferta: i.oferta,
                    estoque: i.estoqueMin ?? null,
                    tetoDoCanal: i.precoCanal ?? i.maximoCanal ?? null,
                  }))
              )
            }
          >
            Revisar envio
          </Button>
        </div>
      )}

      {revisao && (
        <Revisao
          conta={promocao.contaId}
          itens={revisao}
          porMlb={new Map(dados.itens.map((i) => [i.mlb, i]))}
          aoFechar={() => setRevisao(null)}
        />
      )}
    </Panel>
  );
}

/* ══ A revisão antes de enviar ════════════════════════════════
   Mostra o corpo exato que iria para o canal, item a item, montado
   pelas mesmas regras do envio de verdade. Nenhuma chamada sai daqui. */
function Revisao({ conta, itens, porMlb, aoFechar }: {
  conta: string;
  itens: PedidoRevisao[];
  porMlb: Map<string, ItemAutomacao>;
  aoFechar: () => void;
}) {
  const [r, setR] = React.useState<RespostaRevisao | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [envio, setEnvio] = React.useState<RespostaEnvio | null>(null);

  /* Só vai o que a revisão disse que vai: item recusado aqui nem sai. */
  async function enviar() {
    setEnviando(true);
    try {
      const vao = itens.filter((i) => r?.linhas.find((l) => l.mlb === i.mlb)?.vai);
      const res = await fetch("/api/automacoes/enviar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conta, itens: vao, confirmar: true }),
      });
      const j = await res.json();
      if (res.ok) setEnvio(j);
      else setErro(j.erro ?? "o envio falhou");
    } catch (e) {
      setErro(String(e));
    } finally {
      setEnviando(false);
    }
  }

  React.useEffect(() => {
    let vivo = true;
    fetch("/api/automacoes/revisar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conta, itens }),
    })
      .then(async (res) => {
        const j = await res.json();
        if (!vivo) return;
        res.ok ? setR(j) : setErro(j.erro ?? "não consegui montar a revisão");
      })
      .catch((e) => vivo && setErro(String(e)));
    return () => { vivo = false; };
  }, [conta, itens]);

  return (
    <Sheet onClose={aoFechar} title={`Revisar envio · ${count(itens.length)} itens`} width="640px">
      {erro && <EmptyState title="Não consegui montar a revisão" description={erro} />}
      {!erro && !r && <Skeleton className="h-40 w-full" />}
      {r && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <Badge tone="up">{count(r.vao)} vão</Badge>
            {r.ficam > 0 && <Badge tone="down">{count(r.ficam)} ficam de fora</Badge>}
            <span className="text-ink-2">conta {r.conta}</span>
          </div>

          {!r.escritaConectada && (
            <Panel className="border-warn/40 bg-warn-wash/40 p-3 text-[12.5px]">
              Esta conta não autorizou o sistema a alterar promoções. Em Canais e contas,
              clique em “Permitir alterações” — sem isso o envio nem começa.
            </Panel>
          )}

          <div className="max-h-[52vh] space-y-2 overflow-y-auto">
            {r.linhas.map((l) => {
              const i = porMlb.get(l.mlb);
              return (
                <div key={l.mlb} className="rounded-r1 border border-line p-3">
                  <div className="flex items-start gap-2">
                    <Badge tone={l.vai ? "up" : "down"}>{l.vai ? "vai" : "fica"}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{i?.titulo ?? l.mlb}</p>
                      <p className="font-mono text-[11px] text-ink-3">{i?.sku ?? "sem SKU"} · {l.mlb}</p>
                    </div>
                  </div>
                  {l.vai ? (
                    <pre className="mt-2 overflow-x-auto rounded bg-panel-2 p-2 font-mono text-[11px] text-ink-2">
{l.metodo} {l.caminho}
{JSON.stringify(l.corpo, null, 2)}
                    </pre>
                  ) : (
                    <p className="mt-2 text-[12px] text-down">{l.motivo}</p>
                  )}
                </div>
              );
            })}
          </div>

          {envio ? (
            <div className="rounded-r1 border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="up">{count(envio.entraram)} entraram</Badge>
                {envio.recusados > 0 && <Badge tone="down">{count(envio.recusados)} recusados</Badge>}
              </div>
              {/* O canal recusa linha por linha, com motivo próprio.
                  Mostrar só o total esconderia qual produto ficou fora. */}
              <ul className="mt-2 space-y-1">
                {envio.resultados.filter((x) => !x.ok).map((x) => (
                  <li key={x.mlb} className="text-[12px] text-down">
                    <span className="font-mono">{x.mlb}</span> — {x.erro}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] text-ink-3">Nada foi enviado ainda.</p>
              <Button
                className="ml-auto"
                disabled={!r.escritaConectada || !r.vao || enviando}
                onClick={enviar}
              >
                {enviando ? "Enviando…" : "Enviar " + count(r.vao) + " ao Mercado Livre"}
              </Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

const vazio = (motivo?: string) => <span className="text-ink-3">{motivo ?? "—"}</span>;

/* ══ Tráfego pago ═════════════════════════════════════════════
   Por ora só a leitura do que já existe em /anuncios/trafego-pago,
   recortada no que é DECISÃO: mídia no ar sem retorno. A seleção em
   massa e o envio entram junto com a escrita de promoção. */
function Ads({ dados }: { dados: DadosTrafegoPago }) {
  const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
  const chave = (l: LinhaAnuncioAds) => l.mlb + l.conta;
  if (dados.vazio) {
    return <EmptyState title="Sem relatório de mídia no período" />;
  }
  const acao = (l: LinhaAnuncioAds) =>
    l.midia !== "ativa" ? { r: "Mídia já parada", t: "neutral" as const }
    : l.situacao === "familia_vende" ? { r: "Manter — quem vende é o irmão", t: "info" as const }
    : l.situacao === "prejuizo" ? { r: "Desligar — a mídia come a margem", t: "down" as const }
    : l.situacao === "sem_retorno" ? { r: "Desligar — gasto sem venda", t: "down" as const }
    : { r: "Manter", t: "up" as const };

  const decidir = dados.linhas.filter((l) => l.midia === "ativa" && (l.situacao === "prejuizo" || l.situacao === "sem_retorno"));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Investimento" value={money(dados.totais.investimento)} />
        <StatTile label="Receita atribuída" value={money(dados.totais.receitaAtribuida)} />
        <StatTile label="Anúncios com mídia" value={count(dados.linhas.length)} />
        <StatTile label="Para desligar" value={count(decidir.length)} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          disabled={!decidir.length}
          onClick={() => setMarcados(new Set(decidir.map(chave)))}
        >
          Marcar os {count(decidir.length)} para desligar
        </Button>
        {marcados.size > 0 && (
          <>
            <span className="text-[12.5px] text-ink-2">
              <b className="font-mono text-ink">{count(marcados.size)}</b> marcados
            </span>
            <Button onClick={() => setMarcados(new Set())}>Limpar</Button>
            <Button disabled title="O envio para o Mercado Livre ainda não está ligado">
              Sincronizar
            </Button>
          </>
        )}
      </div>
      <Panel className="mt-4">
        <DataTable
          columns={[
            { key: "sel", header: "", sticky: true, width: "44px", mobile: "hidden",
              cell: (l: LinhaAnuncioAds) => (
                <input type="checkbox" className="h-[17px] w-[17px] accent-brand"
                  checked={marcados.has(chave(l))}
                  onChange={() => setMarcados((a) => { const n = new Set(a); n.has(chave(l)) ? n.delete(chave(l)) : n.add(chave(l)); return n; })}
                  aria-label={"Marcar " + l.titulo} />
              ) },
            { key: "mlb", header: "Anúncio", sticky: true, mobile: "title", width: "280px",
              sortValue: (l: LinhaAnuncioAds) => l.titulo,
              cell: (l: LinhaAnuncioAds) => (
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-ink">{l.titulo}</p>
                  <p className="font-mono text-[10.5px] text-ink-3">{l.sku} · {l.mlb} · {l.conta}</p>
                </div>
              ) },
            { key: "inv", header: "Investimento", align: "right", mobile: "metric",
              sortValue: (l: LinhaAnuncioAds) => l.investimento, cell: (l: LinhaAnuncioAds) => money(l.investimento) },
            { key: "rec", header: "Receita atribuída", align: "right", mobile: "hidden",
              sortValue: (l: LinhaAnuncioAds) => l.receitaAtribuida, cell: (l: LinhaAnuncioAds) => money(l.receitaAtribuida) },
            { key: "acos", header: "ACOS", align: "right", mobile: "hidden",
              sortValue: (l: LinhaAnuncioAds) => l.acos ?? 0,
              cell: (l: LinhaAnuncioAds) => (l.acos == null ? vazio() : pct(l.acos, 1)) },
            { key: "acao", header: "Recomendação", align: "right", mobile: "subtitle",
              sortValue: (l: LinhaAnuncioAds) => acao(l).r,
              cell: (l: LinhaAnuncioAds) => <Badge tone={acao(l).t}>{acao(l).r}</Badge> },
          ]}
          rows={dados.linhas}
          rowKey={(l: LinhaAnuncioAds) => l.mlb + l.conta}
          defaultSort={{ key: "inv", dir: "desc" }}
          empty="nenhum anúncio com mídia"
        />
      </Panel>
    </>
  );
}

/**
 * O item da tela no formato que a regra espera.
 *
 * A faixa vai em PONTOS (11,5 e não 0,115): é como a pessoa escreve a
 * condição, e misturar as duas escalas aqui seria o mesmo erro do pct
 * que mostrava 0,1% em tudo.
 */
function paraItemDaTela(i: ItemAutomacao, p: PromocaoAberta): ItemDaTela {
  return {
    mlb: i.mlb,
    contaCanalId: p.contaId,
    tipoCampanha: p.tipo,
    nomeCampanha: p.nome,
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
  };
}
