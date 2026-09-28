"use client";

import * as React from "react";
import type { Relatorio, Variacao, Metricas, LinhaProduto } from "@/lib/dados/relatorio";

/**
 * A página do relatório.
 *
 * Toda conta vem pronta do servidor: aqui só se mostra, abre e fecha. E
 * todo texto de interpretação é editável — o Eduardo apresenta isto para a
 * diretoria, então a última palavra sobre a leitura é dele, não minha.
 */

/* ══════════════════════════════════════════════════════════════
   Formatação
   ══════════════════════════════════════════════════════════════ */

const reais = (v: number | null | undefined, casas = 0) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
const numero = (v: number | null | undefined, casas = 0) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (v: number | null | undefined, casas = 1) =>
  v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const sinal = (v: number | null | undefined, casas = 0) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(casas)}%`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/* ══════════════════════════════════════════════════════════════
   Peças
   ══════════════════════════════════════════════════════════════ */

function Delta({ valor, invertido = false, miudo = false }: { valor: number | null; invertido?: boolean; miudo?: boolean }) {
  if (valor == null) return <span className="text-ink-3 text-[11px]">sem base</span>;
  const bom = invertido ? valor < 0 : valor > 0;
  const neutro = Math.abs(valor) < 0.005;
  const cor = neutro ? "text-ink-3" : bom ? "text-up" : "text-down";
  return (
    <span className={`num ${miudo ? "text-[11px]" : "text-[12px]"} font-semibold ${cor}`}>
      {neutro ? "estável" : sinal(valor, Math.abs(valor) < 0.1 ? 1 : 0)}
    </span>
  );
}

/** Explicação que aparece ao passar o mouse ou tocar. */
function Dica({ texto, children }: { texto: string; children: React.ReactNode }) {
  const [aberto, setAberto] = React.useState(false);
  return (
    <span className="relative inline-flex items-center gap-1">
      {children}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        aria-label="O que é isto"
        className="w-3.5 h-3.5 rounded-full border border-line text-[9px] leading-none text-ink-3 hover:border-brand hover:text-brand shrink-0"
      >
        ?
      </button>
      {aberto && (
        <span
          role="tooltip"
          className="absolute left-0 top-full mt-1.5 z-30 w-[260px] panel panel-2 px-3 py-2 text-[11.5px] leading-relaxed text-ink-2 normal-case font-normal tracking-normal"
        >
          {texto}
        </span>
      )}
    </span>
  );
}

/** Texto que o Eduardo pode reescrever. Some do banco e volta ao padrão. */
function Interpretacao({
  id,
  padrao,
  salvo,
  chave,
  grande = false,
}: {
  id: string;
  padrao: string;
  salvo?: string;
  chave: string;
  grande?: boolean;
}) {
  const [texto, setTexto] = React.useState(salvo ?? "");
  const [editando, setEditando] = React.useState(false);
  const [rascunho, setRascunho] = React.useState(salvo ?? padrao);
  const [salvando, setSalvando] = React.useState(false);
  const mostrar = texto || padrao;

  async function salvar(valor: string) {
    setSalvando(true);
    try {
      await fetch("/api/relatorio/anotacao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chave, id, texto: valor }),
      });
      setTexto(valor);
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <div className="mt-2">
        <textarea
          autoFocus
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          rows={grande ? 10 : 4}
          className="w-full rounded-r1 border border-brand-edge bg-panel px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus:ring-2 focus:ring-brand-wash"
        />
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={() => salvar(rascunho)}
            disabled={salvando}
            className="h-7 px-3 rounded-r1 bg-brand text-brand-ink text-[12px] font-medium disabled:opacity-60"
          >
            {salvando ? "Salvando" : "Salvar"}
          </button>
          <button onClick={() => { setRascunho(texto || padrao); setEditando(false); }} className="h-7 px-2 text-[12px] text-ink-2 hover:text-ink">
            Cancelar
          </button>
          {texto && (
            <button onClick={() => { setRascunho(padrao); salvar(""); }} className="h-7 px-2 text-[12px] text-ink-3 hover:text-down ml-auto">
              Voltar ao texto original
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`group relative mt-2 ${grande ? "min-h-[120px]" : ""}`}>
      <p className={`${grande ? "text-[13.5px]" : "text-[13px]"} leading-relaxed text-ink-2 whitespace-pre-wrap pr-7`}>
        {mostrar || "Clique no lápis para escrever."}
      </p>
      <button
        onClick={() => { setRascunho(texto || padrao); setEditando(true); }}
        aria-label="Editar este texto"
        className="absolute right-0 top-0 w-6 h-6 rounded-r1 border border-line text-ink-3 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:border-brand hover:text-brand flex items-center justify-center"
      >
        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {texto && <span className="absolute -left-3 top-1.5 w-1 h-4 rounded bg-brand-edge" title="texto editado por você" />}
    </div>
  );
}

function Secao({
  id,
  titulo,
  chamada,
  children,
  acao,
}: {
  id: string;
  titulo: string;
  chamada?: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16">
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2 mb-4">
        <div>
          <h2 className="text-[17px] font-semibold text-ink tracking-tight">{titulo}</h2>
          {chamada && <p className="text-[12.5px] text-ink-3 mt-0.5">{chamada}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Barra horizontal. Comprimento o olho compara; ângulo não. */
function Barras({
  itens,
  formato = reais,
}: {
  itens: { rotulo: string; valor: number; nota?: string; destaque?: boolean }[];
  formato?: (v: number) => string;
}) {
  const max = Math.max(...itens.map((i) => Math.abs(i.valor)), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {itens.map((i) => (
        <div key={i.rotulo} className="grid grid-cols-[minmax(110px,1.4fr)_3fr_auto] items-center gap-3">
          <span className="text-[12.5px] text-ink-2 truncate" title={i.rotulo}>{i.rotulo}</span>
          <span className="h-4 bg-grid rounded-r1 overflow-hidden">
            <span
              className={`block h-full rounded-r1 ${i.destaque ? "bg-brand" : "bg-brand-edge"}`}
              style={{ width: `${Math.max(2, (Math.abs(i.valor) / max) * 100)}%` }}
            />
          </span>
          <span className="num text-[12.5px] text-ink text-right tabular-nums">
            {formato(i.valor)}
            {i.nota && <span className="text-ink-3 ml-1.5 text-[11px]">{i.nota}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Série diária: coluna por dia, com o dia de hoje marcado. */
function Colunas({ serie, hoje }: { serie: { dia: string; receita: number; pedidos: number }[]; hoje: string }) {
  const max = Math.max(...serie.map((s) => s.receita), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {serie.map((s) => {
        const parcial = s.dia === hoje;
        return (
          <div key={s.dia} className="flex-1 flex flex-col items-center gap-1 group/col">
            <span className="w-full flex items-end justify-center h-20">
              <span
                className={`w-full rounded-t-[3px] ${parcial ? "bg-brand-edge" : "bg-brand"}`}
                style={{ height: `${Math.max(2, (s.receita / max) * 100)}%` }}
                title={`${dm(s.dia)}: ${reais(s.receita)} · ${s.pedidos} pedidos${parcial ? " (dia em andamento)" : ""}`}
              />
            </span>
            <span className="text-[10px] text-ink-3 num">{dm(s.dia).slice(0, 2)}</span>
          </div>
        );
      })}
    </div>
  );
}

const EXPLICACAO: Record<string, string> = {
  receita: "Soma do valor dos pedidos não cancelados no período. Frete incluído, do jeito que o canal cobra do cliente.",
  pedidos: "Pedidos não cancelados. Um pedido com três itens conta como um.",
  unidades: "Peças vendidas. É o número que responde giro, e não confunde com pedido grande.",
  ticket: "Receita dividida por pedido. Sobe quando o mix migra para produto caro ou quando o cliente leva mais itens.",
  cancelamento: "Pedidos cancelados sobre o total criado. Na Loja própria, pedido que nunca foi pago fica fora da conta: só entra cancelamento de venda que existiu.",
  visitas: "Visitas informadas pelo Mercado Livre nas duas contas. Os outros canais não medem visita, então este número é só do Mercado Livre.",
  conversao: "Unidades vendidas dividido por visitas, no Mercado Livre. Comparar com a média do mercado engana; comparar com a sua melhor semana do ano, não.",
};

function Kpi({
  nome,
  chave,
  v,
  formato,
  invertido = false,
  janelas,
}: {
  nome: string;
  chave: keyof typeof EXPLICACAO;
  v: Variacao | null;
  formato: (n: number | null) => string;
  invertido?: boolean;
  janelas: Relatorio["janelas"];
}) {
  const [aberto, setAberto] = React.useState(false);
  if (!v) {
    return (
      <div className="panel px-3.5 py-3">
        <span className="label">{nome}</span>
        <p className="text-[19px] font-semibold text-ink-3 mt-1">sem medição</p>
        <p className="text-[11.5px] text-ink-3 mt-1">Este canal não informa {nome.toLowerCase()}.</p>
      </div>
    );
  }
  return (
    <div className="panel px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <span className="label">
          <Dica texto={EXPLICACAO[chave]}>{nome}</Dica>
        </span>
        <button
          onClick={() => setAberto((x) => !x)}
          className="text-[11px] text-ink-3 hover:text-brand shrink-0"
          aria-expanded={aberto}
        >
          {aberto ? "fechar" : "comparar"}
        </button>
      </div>
      <p className="num text-[22px] font-semibold text-ink mt-1 leading-none">{formato(v.atual)}</p>
      <div className="flex items-center gap-2 mt-2">
        <Delta valor={v.contraAnterior} invertido={invertido} />
        <span className="text-[11px] text-ink-3">contra as {janelas.anterior.de.slice(8)}–{janelas.anterior.ate.slice(8)}/{janelas.anterior.ate.slice(5, 7)}</span>
      </div>
      {aberto && (
        <dl className="mt-3 pt-3 border-t border-line grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 text-[12px]">
          <dt className="text-ink-2">Janela anterior</dt>
          <dd className="num text-ink text-right">{formato(v.anterior)}</dd>
          <dd className="text-right"><Delta valor={v.contraAnterior} invertido={invertido} miudo /></dd>

          <dt className="text-ink-2">Média das 4 anteriores</dt>
          <dd className="num text-ink text-right">{formato(v.media4)}</dd>
          <dd className="text-right"><Delta valor={v.contraMedia4} invertido={invertido} miudo /></dd>

          <dt className="text-ink-2">
            {invertido ? "Melhor (mais baixa) do ano" : "Melhor do ano"}
            {v.melhorQuando && <span className="text-ink-3"> · {v.melhorQuando}</span>}
          </dt>
          <dd className="num text-ink text-right">{formato(v.melhor)}</dd>
          <dd className="text-right"><Delta valor={v.contraMelhor} invertido={invertido} miudo /></dd>
        </dl>
      )}
    </div>
  );
}

function GradeKpi({ m, janelas }: { m: Metricas; janelas: Relatorio["janelas"] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      <Kpi nome="Receita" chave="receita" v={m.receita} formato={(n) => reais(n)} janelas={janelas} />
      <Kpi nome="Pedidos" chave="pedidos" v={m.pedidos} formato={(n) => numero(n)} janelas={janelas} />
      <Kpi nome="Ticket médio" chave="ticket" v={m.ticket} formato={(n) => reais(n)} janelas={janelas} />
      <Kpi nome="Unidades" chave="unidades" v={m.unidades} formato={(n) => numero(n)} janelas={janelas} />
      <Kpi nome="Visitas" chave="visitas" v={m.visitas} formato={(n) => numero(n)} janelas={janelas} />
      <Kpi nome="Conversão" chave="conversao" v={m.conversao} formato={(n) => pct(n, 2)} janelas={janelas} />
      <Kpi nome="Cancelamento" chave="cancelamento" v={m.cancelamento} formato={(n) => pct(n, 1)} invertido janelas={janelas} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   A página
   ══════════════════════════════════════════════════════════════ */

const SECOES = [
  { id: "prioridades", nome: "Prioridades" },
  { id: "operacao", nome: "Operação" },
  { id: "lojas", nome: "Por loja" },
  { id: "produtos", nome: "Produtos" },
  { id: "catalogo", nome: "Catálogo" },
  { id: "estoque", nome: "Estoque" },
  { id: "multicanal", nome: "Multicanal" },
  { id: "trafego", nome: "Tráfego pago" },
  { id: "financeiro", nome: "Financeiro" },
  { id: "estrategia", nome: "Estratégia" },
  { id: "dados", nome: "Dados e pendências" },
];

export function RelatorioCliente({ dados, chave }: { dados: Relatorio; chave: string }) {
  /*
   * O relatório abre claro, mesmo para quem usa o sistema no escuro.
   *
   * Ele é impresso, projetado em reunião e aberto no celular de gente que
   * nunca entrou no sistema — e nesses três lugares o fundo escuro atrapalha
   * mais do que ajuda. Quem preferir escuro tem o botão ao lado da data, e a
   * escolha original volta ao sair da página.
   */
  const [tema, setTema] = React.useState<"claro" | "escuro">("claro");
  React.useEffect(() => {
    const raiz = document.documentElement;
    const anterior = raiz.getAttribute("data-theme");
    raiz.setAttribute("data-theme", tema === "claro" ? "light" : "dark");
    return () => {
      if (anterior) raiz.setAttribute("data-theme", anterior);
      else raiz.removeAttribute("data-theme");
    };
  }, [tema]);

  const [abaPrioridade, setAbaPrioridade] = React.useState<"semana" | "longo">("semana");
  const [filtro, setFiltro] = React.useState<string>("ab");
  const [busca, setBusca] = React.useState("");
  const [ordem, setOrdem] = React.useState<"receita90" | "janela" | "cobertura" | "distancia">("receita90");
  const [abertoProduto, setAbertoProduto] = React.useState<string | null>(null);
  const [canalAberto, setCanalAberto] = React.useState<string | null>(null);
  const [verPendencias, setVerPendencias] = React.useState(false);

  const p = dados.periodo;
  const anot = (id: string) => dados.anotacoes[id];

  const produtosFiltrados = React.useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = dados.produtos.filter((l) => {
      if (t && !(`${l.sku ?? ""} ${l.mlb} ${l.titulo}`.toLowerCase().includes(t))) return false;
      switch (filtro) {
        case "ab": return l.curva !== "C";
        case "a": return l.curva === "A";
        case "sem-estoque": return l.estoque === 0 || l.situacao === "paused";
        case "abaixo": return l.precoMinimo != null && l.precoVisivel != null && l.precoVisivel < l.precoMinimo * 0.99;
        case "caro": return l.melhorPreco != null && l.precoVisivel != null && l.precoVisivel > l.melhorPreco * 1.1 && !l.melhorAmostraFraca;
        case "catalogo": return l.catalogo != null || l.elegivelForaCatalogo;
        default: return true;
      }
    });
    const distancia = (l: LinhaProduto) =>
      l.precoMinimo != null && l.precoVisivel != null ? (l.precoVisivel - l.precoMinimo) / l.precoMinimo : Infinity;
    return [...lista].sort((a, b) => {
      if (ordem === "janela") return b.receitaPeriodo - a.receitaPeriodo || b.receita90 - a.receita90;
      // Cobertura: quem está mais perto de acabar primeiro; sem medição por último.
      if (ordem === "cobertura") return (a.coberturaDias ?? Infinity) - (b.coberturaDias ?? Infinity);
      if (ordem === "distancia") return distancia(a) - distancia(b);
      return b.receita90 - a.receita90;
    });
  }, [dados.produtos, filtro, busca, ordem]);

  const prioridades = dados.prioridades.filter((x) => x.prazo === abaPrioridade);

  return (
    <div className="min-h-screen bg-ground">
      {/* ── Cabeçalho ── */}
      <header className="border-b border-line bg-panel">
        <div className="max-w-[1180px] mx-auto px-5 py-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label">Probel · e-commerce</p>
              <h1 className="text-[26px] font-semibold text-ink tracking-tight mt-1 leading-none">
                Raio-X da operação
              </h1>
              <p className="text-[13px] text-ink-2 mt-2">
                {dm(p.de)} a {dm(p.ate)} de {p.ate.slice(0, 4)} · {p.dias} dias
                <span className="text-ink-3"> · {dm(p.ate)} ainda está em andamento</span>
              </p>
            </div>
            <div className="text-right">
              <p className="num text-[12px] text-ink-2">Gerado em {hora(dados.geradoEm)}</p>
              <p className="num text-[11.5px] text-ink-3">Estoque e catálogo de {hora(dados.instantaneoEm)}</p>
              <div className="flex items-center gap-1.5 justify-end mt-2">
                <button
                  onClick={() => setTema(tema === "claro" ? "escuro" : "claro")}
                  className="h-7 px-3 rounded-r1 border border-line text-[12px] text-ink-2 hover:border-brand hover:text-brand"
                >
                  {tema === "claro" ? "Escuro" : "Claro"}
                </button>
                <button
                  onClick={() => window.print()}
                  className="h-7 px-3 rounded-r1 border border-line text-[12px] text-ink-2 hover:border-brand hover:text-brand"
                >
                  Imprimir
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Índice fixo ── */}
      <nav className="sticky top-0 z-20 border-b border-line bg-panel/95 backdrop-blur">
        <div className="max-w-[1180px] mx-auto px-5 flex gap-1 overflow-x-auto py-1.5">
          {SECOES.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="px-2.5 py-1 rounded-r1 text-[12.5px] text-ink-2 hover:bg-brand-wash hover:text-brand whitespace-nowrap"
            >
              {s.nome}
            </a>
          ))}
        </div>
      </nav>

      <main className="max-w-[1180px] mx-auto px-5 py-6 flex flex-col gap-10">
        {/* ══ Estado dos dados ══ */}
        <div className="flex flex-wrap gap-2">
          {dados.estadoDados.map((f) => {
            const cor =
              f.situacao === "ok" ? "border-up/40 bg-up-wash text-up"
              : f.situacao === "atencao" ? "border-warn/40 bg-warn-wash text-warn"
              : f.situacao === "parado" ? "border-down/40 bg-down-wash text-down"
              : "border-line bg-ground text-ink-3";
            return (
              <span key={f.fonte} className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-[11.5px] ${cor}`} title={f.detalhe}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {f.fonte}
                <span className="num opacity-80">
                  {f.ate ? (f.atrasoDias === 0 ? "hoje" : f.atrasoDias === 1 ? "ontem" : `${f.atrasoDias} dias atrás`) : "sem dado"}
                </span>
              </span>
            );
          })}
        </div>

        {/* ══ Prioridades ══ */}
        <Secao
          id="prioridades"
          titulo="O que atacar"
          chamada="Cada item traz o número que o justifica. Nada aqui é sugestão de causa — é o que os dados mostram."
          acao={
            <div className="flex gap-1 p-0.5 rounded-r1 bg-ground border border-line">
              {([["semana", "Resolve nesta semana"], ["longo", "Prioridade que leva tempo"]] as const).map(([v, r]) => (
                <button
                  key={v}
                  onClick={() => setAbaPrioridade(v)}
                  className={`px-2.5 h-7 rounded-[5px] text-[12px] font-medium ${abaPrioridade === v ? "bg-panel text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
                >
                  {r}
                  <span className="ml-1.5 text-ink-3">{dados.prioridades.filter((x) => x.prazo === v).length}</span>
                </button>
              ))}
            </div>
          }
        >
          {prioridades.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {prioridades.map((x, i) => (
                <div key={x.titulo} className="panel px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="num text-[13px] font-semibold text-brand mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-ink">{x.titulo}</p>
                      <p className="num text-[12.5px] text-ink-2 mt-0.5">{x.numero}</p>
                      <p className="text-[12px] text-ink-3 mt-1.5 leading-relaxed">{x.detalhe}</p>
                      <a href={`#${x.onde === "Estoque" ? "estoque" : x.onde === "Catálogo" ? "catalogo" : x.onde === "Financeiro" ? "financeiro" : "produtos"}`} className="text-[11.5px] text-brand hover:underline mt-1.5 inline-block">
                        ver em {x.onde}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">Nenhum item nesta aba na janela atual.</p>
          )}
          <Interpretacao
            id="prioridades"
            chave={chave}
            salvo={anot("prioridades")}
            padrao={`Foram ${dados.prioridades.length} pontos identificados nesta leitura: ${dados.prioridades.filter((x) => x.prazo === "semana").length} com solução na própria semana e ${dados.prioridades.filter((x) => x.prazo === "longo").length} que dependem de decisão ou de terceiros.`}
          />
        </Secao>

        {/* ══ Operação ══ */}
        <Secao
          id="operacao"
          titulo="A operação toda"
          chamada={`Todos os canais somados. Comparações: janela anterior, média das 4 anteriores e ${dados.janelas.melhor}.`}
        >
          <GradeKpi m={dados.operacao} janelas={dados.janelas} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div className="panel px-4 py-3.5">
              <p className="label mb-3">Receita por dia</p>
              <Colunas serie={dados.canais.flatMap((c) => c.serie).reduce<{ dia: string; receita: number; pedidos: number }[]>((acc, s) => {
                const achou = acc.find((x) => x.dia === s.dia);
                if (achou) { achou.receita += s.receita; achou.pedidos += s.pedidos; }
                else acc.push({ dia: s.dia, receita: s.receita, pedidos: s.pedidos });
                return acc;
              }, []).sort((a, b) => a.dia.localeCompare(b.dia))} hoje={p.hoje} />
            </div>
            <div className="panel px-4 py-3.5">
              <p className="label mb-3">Participação na receita</p>
              <Barras
                itens={dados.canais.slice(0, 8).map((c) => ({
                  rotulo: c.nome,
                  valor: c.metricas.receita.atual,
                  nota: pct(c.participacao, 0),
                  destaque: c.temVisita,
                }))}
              />
            </div>
          </div>
          <Interpretacao
            id="operacao"
            chave={chave}
            salvo={anot("operacao")}
            padrao={`A operação fez ${reais(dados.operacao.receita.atual)} em ${p.dias} dias, ${dados.operacao.receita.contraAnterior == null ? "sem base de comparação" : `${sinal(dados.operacao.receita.contraAnterior)} contra a janela anterior`}. O ticket médio ficou em ${reais(dados.operacao.ticket.atual)} e o cancelamento em ${pct(dados.operacao.cancelamento.atual)}. A melhor janela do ano foi ${reais(dados.operacao.receita.melhor)}${dados.operacao.receita.melhorQuando ? `, de ${dados.operacao.receita.melhorQuando}` : ""}.`}
          />
        </Secao>

        {/* ══ Por loja ══ */}
        <Secao id="lojas" titulo="Loja por loja" chamada="Clique na linha para abrir a série do canal.">
          <div className="panel overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="text-left font-medium px-3.5 py-2">Canal</th>
                  <th className="text-right font-medium px-3 py-2">Receita</th>
                  <th className="text-right font-medium px-3 py-2">vs anterior</th>
                  <th className="text-right font-medium px-3 py-2">Pedidos</th>
                  <th className="text-right font-medium px-3 py-2">Ticket</th>
                  <th className="text-right font-medium px-3 py-2">Cancel.</th>
                  <th className="text-right font-medium px-3 py-2">Conversão</th>
                  <th className="text-right font-medium px-3 py-2">Parte</th>
                </tr>
              </thead>
              <tbody>
                {dados.canais.map((c) => (
                  <React.Fragment key={c.id}>
                    <tr
                      onClick={() => setCanalAberto(canalAberto === c.id ? null : c.id)}
                      className="border-b border-line last:border-0 hover:bg-brand-wash/40 cursor-pointer"
                    >
                      <td className="px-3.5 py-2 text-ink font-medium">{c.nome}</td>
                      <td className="px-3 py-2 text-right num text-ink">{reais(c.metricas.receita.atual)}</td>
                      <td className="px-3 py-2 text-right"><Delta valor={c.metricas.receita.contraAnterior} /></td>
                      <td className="px-3 py-2 text-right num text-ink-2">{numero(c.metricas.pedidos.atual)}</td>
                      <td className="px-3 py-2 text-right num text-ink-2">{reais(c.metricas.ticket.atual)}</td>
                      <td className="px-3 py-2 text-right num text-ink-2">{pct(c.metricas.cancelamento.atual)}</td>
                      <td className="px-3 py-2 text-right num text-ink-2">
                        {c.temVisita ? pct(c.metricas.conversao?.atual, 2) : <span className="text-ink-3 text-[11px]">sem medição</span>}
                      </td>
                      <td className="px-3 py-2 text-right num text-ink-2">{pct(c.participacao, 0)}</td>
                    </tr>
                    {canalAberto === c.id && (
                      <tr className="bg-ground/60">
                        <td colSpan={8} className="px-3.5 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5">
                            <div>
                              <p className="label mb-2">Receita por dia · {c.nome}</p>
                              <Colunas serie={c.serie} hoje={p.hoje} />
                            </div>
                            <GradeKpiCompacta m={c.metricas} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Interpretacao
            id="lojas"
            chave={chave}
            salvo={anot("lojas")}
            padrao={`${dados.canais[0]?.nome ?? "O primeiro canal"} concentra ${pct(dados.canais[0]?.participacao ?? 0, 0)} da receita da janela. Visita e conversão existem só nas contas do Mercado Livre; nos outros canais a linha traz receita e pedido, e a conversão fica em branco porque não há medição de visita.`}
          />
        </Secao>

        {/* ══ Produtos ══ */}
        <Secao
          id="produtos"
          titulo="Produtos"
          chamada={`${dados.produtos.length} anúncios com venda no ano. Curva por receita de 90 dias: A até 80% do faturamento, B até 95%.`}
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {([["ab", "Curva A e B"], ["a", "Só curva A"], ["sem-estoque", "Sem estoque"], ["abaixo", "Abaixo do mínimo"], ["caro", "Acima do melhor preço"], ["catalogo", "Catálogo"], ["todos", "Todos"]] as const).map(([v, r]) => (
              <button
                key={v}
                onClick={() => setFiltro(v)}
                className={`h-7 px-2.5 rounded-r1 border text-[12px] ${filtro === v ? "border-brand bg-brand-wash text-brand font-medium" : "border-line text-ink-2 hover:border-brand-edge"}`}
              >
                {r}
              </button>
            ))}
            <select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as typeof ordem)}
              className="h-7 px-2 rounded-r1 border border-line bg-panel text-[12px] text-ink-2 outline-none focus:border-brand ml-auto"
            >
              <option value="receita90">Ordenar: receita de 90 dias</option>
              <option value="janela">Ordenar: receita da janela</option>
              <option value="cobertura">Ordenar: cobertura de estoque</option>
              <option value="distancia">Ordenar: distância do preço mínimo</option>
            </select>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar SKU, MLB ou nome"
              className="h-7 px-2.5 rounded-r1 border border-line bg-panel text-[12px] text-ink outline-none focus:border-brand w-[200px]"
            />
          </div>

          <div className="panel overflow-x-auto">
            <table className="w-full text-[12px] min-w-[900px]">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="text-left font-medium px-3 py-2">Curva</th>
                  <th className="text-left font-medium px-3 py-2">SKU</th>
                  <th className="text-left font-medium px-3 py-2">Produto</th>
                  <th className="text-right font-medium px-2 py-2">Estoque</th>
                  <th className="text-right font-medium px-2 py-2">Cobertura</th>
                  <th className="text-right font-medium px-2 py-2">Cliente vê</th>
                  <th className="text-right font-medium px-2 py-2">Melhor preço</th>
                  <th className="text-right font-medium px-2 py-2">Mínimo</th>
                  <th className="text-right font-medium px-2 py-2">Un. janela</th>
                  <th className="text-right font-medium px-2 py-2">Conversão</th>
                  <th className="text-right font-medium px-2 py-2">90 dias</th>
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.slice(0, 200).map((l) => {
                  const abaixo = l.precoMinimo != null && l.precoVisivel != null && l.precoVisivel < l.precoMinimo * 0.99;
                  const caro = l.melhorPreco != null && l.precoVisivel != null && l.precoVisivel > l.melhorPreco * 1.1;
                  const semEstoque = l.estoque === 0 || l.situacao === "paused" || l.situacao === "encerrado";
                  return (
                    <React.Fragment key={l.mlb}>
                      <tr
                        onClick={() => setAbertoProduto(abertoProduto === l.mlb ? null : l.mlb)}
                        className="border-b border-line last:border-0 hover:bg-brand-wash/40 cursor-pointer"
                      >
                        <td className="px-3 py-1.5">
                          <span className={`inline-block w-5 text-center rounded-[4px] text-[11px] font-semibold ${l.curva === "A" ? "bg-brand-wash text-brand" : l.curva === "B" ? "bg-ground text-ink-2" : "text-ink-3"}`}>{l.curva}</span>
                        </td>
                        <td className="px-3 py-1.5 num text-ink">{l.sku ?? "—"}</td>
                        <td className="px-3 py-1.5 text-ink-2 max-w-[260px] truncate" title={l.titulo}>{l.titulo}</td>
                        <td className={`px-2 py-1.5 text-right num ${semEstoque ? "text-down font-semibold" : "text-ink-2"}`}>
                          {l.situacao === "paused" ? "pausado" : l.situacao === "encerrado" ? "encerrado" : numero(l.estoque)}
                        </td>
                        <td className="px-2 py-1.5 text-right num text-ink-2">
                          {l.coberturaDias == null ? "—" : l.coberturaDias <= 14 ? <span className="text-down font-semibold">{l.coberturaDias} d</span> : `${l.coberturaDias} d`}
                        </td>
                        <td className={`px-2 py-1.5 text-right num ${l.emCampanha ? "text-warn font-medium" : "text-ink"}`}>{reais(l.precoVisivel, 2)}</td>
                        <td className={`px-2 py-1.5 text-right num ${caro ? "text-warn" : "text-ink-2"}`}>{reais(l.melhorPreco, 2)}</td>
                        <td className={`px-2 py-1.5 text-right num ${abaixo ? "text-down font-semibold" : "text-ink-2"}`}>{reais(l.precoMinimo, 2)}</td>
                        <td className="px-2 py-1.5 text-right num text-ink-2">{numero(l.unidadesPeriodo)}</td>
                        <td className="px-2 py-1.5 text-right num text-ink-2">{l.conversao == null ? "—" : pct(l.conversao, 2)}</td>
                        <td className="px-2 py-1.5 text-right num text-ink-2">{reais(l.receita90)}</td>
                      </tr>
                      {abertoProduto === l.mlb && (
                        <tr className="bg-ground/60">
                          <td colSpan={11} className="px-4 py-4">
                            <DetalheProduto l={l} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {produtosFiltrados.length > 200 && (
            <p className="text-[11.5px] text-ink-3 mt-2">Mostrando 200 de {produtosFiltrados.length}. Use a busca para chegar no que falta.</p>
          )}
          <Interpretacao
            id="produtos"
            chave={chave}
            salvo={anot("produtos")}
            padrao={`Dos ${dados.produtos.filter((l) => l.curva !== "C").length} anúncios de curva A e B, ${dados.produtos.filter((l) => l.curva !== "C" && (l.estoque === 0 || l.situacao === "paused")).length} estão sem estoque ou pausados e ${dados.produtos.filter((l) => l.curva !== "C" && l.precoMinimo != null && l.precoVisivel != null && l.precoVisivel < l.precoMinimo * 0.99).length} estão abaixo do preço mínimo da Fórmula base. O melhor preço de cada linha é o preço em que o anúncio mais vendeu por dia, e não o menor preço já praticado.`}
          />
        </Secao>

        {/* ══ Catálogo ══ */}
        <Secao
          id="catalogo"
          titulo="Catálogo do Mercado Livre"
          chamada="Quem ganha a página de produto recebe quase toda a visita. Consultado anúncio por anúncio na API."
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            {[
              { r: "Ganhando", v: dados.catalogo.ganhando, cor: "text-up" },
              { r: "Dividindo 1º lugar", v: dados.catalogo.dividindo, cor: "text-warn" },
              { r: "Perdendo", v: dados.catalogo.perdendo, cor: "text-down" },
              { r: "Fora do catálogo", v: dados.catalogo.fora, cor: "text-ink-2" },
              { r: "Elegíveis e fora", v: dados.catalogo.elegiveisFora, cor: "text-brand" },
            ].map((x) => (
              <div key={x.r} className="panel px-3.5 py-3">
                <p className="label">{x.r}</p>
                <p className={`num text-[22px] font-semibold mt-1 leading-none ${x.cor}`}>{numero(x.v)}</p>
              </div>
            ))}
          </div>

          {dados.catalogo.alavancas.length > 0 && (
            <div className="panel px-4 py-3.5 mt-4">
              <p className="label mb-3">
                <Dica texto="O Mercado Livre lista o que pesa na disputa além do preço. 'Em aberto' quer dizer que este anúncio não tem aquela alavanca ativada — dá para ganhar posição sem baixar preço.">
                  Alavancas em aberto, sem mexer em preço
                </Dica>
              </p>
              <Barras itens={dados.catalogo.alavancas.map((a) => ({ rotulo: a.rotulo, valor: a.abertas }))} formato={(v) => `${numero(v)} anúncios`} />
            </div>
          )}

          {dados.catalogo.perdendoLista.length > 0 && (
            <div className="panel overflow-hidden mt-4">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-line text-ink-3">
                    <th className="text-left font-medium px-3 py-2">SKU</th>
                    <th className="text-left font-medium px-3 py-2">Conta</th>
                    <th className="text-right font-medium px-3 py-2">Preço atual</th>
                    <th className="text-right font-medium px-3 py-2">Preço para ganhar</th>
                    <th className="text-right font-medium px-3 py-2">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.catalogo.perdendoLista.map((x) => (
                    <tr key={x.mlb} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5 num text-ink">{x.sku ?? x.mlb}</td>
                      <td className="px-3 py-1.5 text-ink-2">{x.conta}</td>
                      <td className="px-3 py-1.5 text-right num text-ink-2">{reais(x.precoAtual, 2)}</td>
                      <td className="px-3 py-1.5 text-right num text-ink">{reais(x.precoParaGanhar, 2)}</td>
                      <td className="px-3 py-1.5 text-right num text-down">
                        {x.precoAtual != null && x.precoParaGanhar != null ? reais(x.precoAtual - x.precoParaGanhar, 2) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Interpretacao
            id="catalogo"
            chave={chave}
            salvo={anot("catalogo")}
            padrao={`De ${dados.catalogo.consultados} anúncios consultados, ${dados.catalogo.ganhando} estão ganhando a página de produto e ${dados.catalogo.perdendo + dados.catalogo.dividindo} não. Há ${dados.catalogo.elegiveisFora} anúncios elegíveis que não estão inscritos no catálogo — visita disponível sem custo de mídia.`}
          />
        </Secao>

        {/* ══ Estoque ══ */}
        <Secao id="estoque" titulo="Estoque" chamada="Cobertura é estoque dividido pela venda por dia da janela. Abaixo de 14 dias, é reposição urgente.">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <ListaProdutos
              titulo="Ruptura na curva A"
              nota="sem estoque ou pausado"
              linhas={dados.estoque.rupturaCurvaA}
              destaque="down"
              extra={(l) => `${reais(l.receita90)} em 90 dias`}
            />
            <ListaProdutos
              titulo="Encerrados que faturavam"
              nota="curva A, anúncio não existe mais no canal"
              linhas={dados.estoque.encerradosCurvaA}
              destaque="warn"
              extra={(l) => `${reais(l.receita90)} em 90 dias`}
            />
            <ListaProdutos
              titulo="Cobertura crítica"
              nota="14 dias ou menos"
              linhas={dados.estoque.criticos}
              destaque="warn"
              extra={(l) => `${l.coberturaDias} dias · ${numero(l.estoque)} em estoque`}
            />
            <ListaProdutos
              titulo="Parados com estoque"
              nota="curva A e B, 14 dias sem vender"
              linhas={dados.estoque.parados}
              destaque="info"
              extra={(l) => `${l.diasSemVenda} dias sem venda · ${numero(l.estoque)} peças`}
            />
          </div>
          <div className="panel px-4 py-3 mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
            <span className="text-ink-2">Anúncios pausados:</span>
            {dados.estoque.pausados.map((x) => (
              <span key={x.conta} className="num text-ink">
                {x.conta}: <strong className="font-semibold">{x.quantidade}</strong>
              </span>
            ))}
          </div>
          <Interpretacao
            id="estoque"
            chave={chave}
            salvo={anot("estoque")}
            padrao={`${dados.estoque.rupturaCurvaA.length} anúncios de curva A estão sem estoque ou pausados, e somam ${reais(dados.estoque.rupturaCurvaA.reduce((s, l) => s + l.receita90, 0))} de receita nos últimos 90 dias. Outros ${dados.estoque.criticos.length} têm cobertura de 14 dias ou menos no ritmo de venda da janela.`}
          />
        </Secao>

        {/* ══ Multicanal ══ */}
        <Secao
          id="multicanal"
          titulo="Multicanal"
          chamada="Mesmo SKU, canais diferentes. Diferença de preço é o gatilho de migração de venda entre canais."
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="panel px-4 py-3.5">
              <p className="label mb-3">Maior diferença de preço entre canais</p>
              {dados.multicanal.dispersao.length ? (
                <div className="flex flex-col gap-2">
                  {dados.multicanal.dispersao.slice(0, 10).map((d) => (
                    <div key={d.sku} className="border-b border-line last:border-0 pb-2 last:pb-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="num text-[12.5px] text-ink font-medium">{d.sku}</span>
                        <span className="num text-[12px] text-down font-semibold">{pct(d.diferencaPct, 0)}</span>
                      </div>
                      <p className="text-[11.5px] text-ink-3 truncate">{d.titulo}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                        {d.precos.map((x) => (
                          <span key={x.canal} className="num text-[11.5px] text-ink-2">
                            {x.canal}: {reais(x.preco, 2)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-3">Nenhum SKU com preço medido em mais de um canal na janela.</p>
              )}
            </div>
            <div className="panel px-4 py-3.5">
              <p className="label mb-3">
                <Dica texto="Um canal sobe e o outro cai no mesmo SKU. Quando a soma fica perto de zero, a venda migrou de canal em vez de crescer. Quando a soma sobe, houve venda nova.">
                  Migração de venda entre canais
                </Dica>
              </p>
              {dados.multicanal.migracao.length ? (
                <div className="flex flex-col gap-2">
                  {dados.multicanal.migracao.slice(0, 10).map((m) => (
                    <div key={m.sku} className="border-b border-line last:border-0 pb-2 last:pb-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="num text-[12.5px] text-ink font-medium">{m.sku}</span>
                        <span className={`num text-[12px] font-semibold ${m.somaMudou > 0 ? "text-up" : m.somaMudou < 0 ? "text-down" : "text-ink-3"}`}>
                          soma {m.somaMudou > 0 ? "+" : ""}{m.somaMudou}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-ink-2 mt-0.5">
                        <span className="text-up">{m.subiu.canal} +{m.subiu.delta}</span>
                        <span className="text-ink-3"> · </span>
                        <span className="text-down">{m.caiu.canal} {m.caiu.delta}</span>
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-3">Nenhum SKU subiu num canal e caiu em outro nesta janela.</p>
              )}
            </div>
          </div>
          <Interpretacao
            id="multicanal"
            chave={chave}
            salvo={anot("multicanal")}
            padrao={`${dados.multicanal.dispersao.length} SKUs aparecem com preço diferente entre canais na janela. ${dados.multicanal.migracao.length} tiveram alta num canal e queda em outro — a coluna da soma diz se o total cresceu ou se a venda só trocou de lugar.`}
          />
        </Secao>

        {/* ══ Tráfego pago ══ */}
        <Secao
          id="trafego"
          titulo="Tráfego pago"
          chamada="Product Ads do Mercado Livre. Entra por planilha, então o período é o da última importação — não o da janela deste relatório."
        >
          {dados.trafegoPago.temDado ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                <div className="panel px-3.5 py-3">
                  <p className="label">Investimento</p>
                  <p className="num text-[20px] font-semibold text-ink mt-1 leading-none">{reais(dados.trafegoPago.investimento)}</p>
                </div>
                <div className="panel px-3.5 py-3">
                  <p className="label">Receita atribuída</p>
                  <p className="num text-[20px] font-semibold text-ink mt-1 leading-none">{reais(dados.trafegoPago.receitaAtribuida)}</p>
                </div>
                <div className="panel px-3.5 py-3">
                  <p className="label"><Dica texto="Investimento dividido pela receita que o canal atribui ao anúncio patrocinado. Quanto menor, melhor. A receita atribuída é a conta do canal, não a receita real do anúncio.">ACOS</Dica></p>
                  <p className="num text-[20px] font-semibold text-ink mt-1 leading-none">{pct(dados.trafegoPago.acos, 1)}</p>
                </div>
                <div className="panel px-3.5 py-3">
                  <p className="label">Cliques</p>
                  <p className="num text-[20px] font-semibold text-ink mt-1 leading-none">{numero(dados.trafegoPago.cliques)}</p>
                </div>
                <div className="panel px-3.5 py-3">
                  <p className="label">Período do dado</p>
                  <p className="num text-[15px] font-semibold text-ink-2 mt-2 leading-none">até {dados.trafegoPago.ate ? dm(dados.trafegoPago.ate) : "—"}</p>
                </div>
              </div>
              {dados.trafegoPago.anunciosNoVermelho.length > 0 && (
                <div className="panel px-4 py-3.5 mt-4">
                  <p className="label mb-2">Anúncios em que a mídia pesa mais que o retorno</p>
                  <table className="w-full text-[12px]">
                    <tbody>
                      {dados.trafegoPago.anunciosNoVermelho.map((a) => (
                        <tr key={a.mlb} className="border-b border-line last:border-0">
                          <td className="py-1.5 num text-ink">{a.sku ?? a.mlb}</td>
                          <td className="py-1.5 text-right num text-down">{reais(a.investimento)} de mídia</td>
                          <td className="py-1.5 text-right num text-ink-2">{reais(a.receita)} atribuídos</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="text-[13px] text-ink-3">Sem dado de mídia importado. O bloco aparece quando o relatório de Product Ads for importado.</p>
          )}
          <p className="text-[12px] text-warn mt-3">
            O Google Ads do site não entra no sistema: não existe tabela nem tela para ele. Enquanto isso, o tráfego pago aqui é só do Mercado Livre.
          </p>
          <Interpretacao
            id="trafego"
            chave={chave}
            salvo={anot("trafego")}
            padrao={dados.trafegoPago.temDado ? `No último período importado, a mídia consumiu ${reais(dados.trafegoPago.investimento)} para ${reais(dados.trafegoPago.receitaAtribuida)} de receita atribuída pelo canal.` : "Sem dado de mídia no período."}
          />
        </Secao>

        {/* ══ Financeiro ══ */}
        <Secao id="financeiro" titulo="Financeiro" chamada="Margem só entra onde existe custo cadastrado. O que não tem custo fica fora, e a cobertura diz o tamanho do que ficou fora.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="panel px-3.5 py-3">
              <p className="label"><Dica texto="Quanto da receita da janela vem de produto com custo cadastrado. Enquanto estiver baixa, qualquer número de margem fala de uma parte pequena da operação.">Cobertura de custo</Dica></p>
              <p className="num text-[22px] font-semibold text-ink mt-1 leading-none">{pct(dados.financeiro.coberturaCusto, 0)}</p>
              <p className="text-[11.5px] text-ink-3 mt-1">{reais(dados.financeiro.receitaComCusto)} de {reais(dados.financeiro.receitaTotal)}</p>
            </div>
            <div className="panel px-3.5 py-3">
              <p className="label">Margem apurada</p>
              <p className="num text-[22px] font-semibold text-ink mt-1 leading-none">
                {dados.financeiro.margemApurada == null ? "—" : pct(dados.financeiro.margemApurada, 1)}
              </p>
              <p className="text-[11.5px] text-ink-3 mt-1">só da parte com custo, sem despesa fixa</p>
            </div>
            <div className="panel px-3.5 py-3">
              <p className="label">Produtos com custo</p>
              <p className="num text-[22px] font-semibold text-ink mt-1 leading-none">
                {dados.financeiro.produtosComCusto}<span className="text-ink-3 text-[15px]"> de {dados.financeiro.produtosTotal}</span>
              </p>
              <p className="text-[11.5px] text-ink-3 mt-1">embalagem ainda não cadastrada</p>
            </div>
          </div>
          <Interpretacao
            id="financeiro"
            chave={chave}
            salvo={anot("financeiro")}
            padrao={`O custo cadastrado cobre ${pct(dados.financeiro.coberturaCusto, 0)} da receita da janela, com ${dados.financeiro.produtosComCusto} produtos de ${dados.financeiro.produtosTotal}. A margem mostrada é de contribuição — mercadoria e imposto — e não desconta despesa fixa.`}
          />
        </Secao>

        {/* ══ Estratégia ══ */}
        <Secao id="estrategia" titulo="Planejamento estratégico" chamada="Onde está a receita que falta, e de que alavanca ela pode vir. Esta seção é proposta, não medição.">
          {dados.metas ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
              <div className="panel px-4 py-3.5">
                <p className="label mb-2">Meta de {dados.metas.mes}</p>
                <div className="grid grid-cols-2 gap-y-2 text-[12.5px]">
                  <span className="text-ink-2">Meta</span>
                  <span className="num text-ink text-right">{reais(dados.metas.meta)}</span>
                  <span className="text-ink-2">Realizado</span>
                  <span className="num text-ink text-right">{reais(dados.metas.realizado)}</span>
                  <span className="text-ink-2 font-medium">Falta</span>
                  <span className="num text-down text-right font-semibold">{reais(dados.metas.gap)}</span>
                  <span className="text-ink-2">Ritmo de hoje</span>
                  <span className="num text-ink-2 text-right">{reais(dados.metas.ritmoAtual)}/dia</span>
                  <span className="text-ink-2">Ritmo necessário</span>
                  <span className="num text-ink text-right">{reais(dados.metas.ritmoNecessario)}/dia</span>
                </div>
              </div>
              <div className="panel px-4 py-3.5">
                <p className="label mb-3">De onde a receita pode vir</p>
                {dados.metas.decomposicao.length ? (
                  <div className="flex flex-col gap-2.5">
                    {dados.metas.decomposicao.map((d) => (
                      <div key={d.alavanca}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[12.5px] text-ink font-medium">{d.alavanca}</span>
                          <span className="num text-[12.5px] text-up font-semibold">{reais(d.ganho)}/mês</span>
                        </div>
                        <p className="text-[11.5px] text-ink-3 mt-0.5">{d.detalhe}</p>
                      </div>
                    ))}
                    <p className="text-[11px] text-ink-3 border-t border-line pt-2">
                      Cada linha é uma conta aritmética sobre o que já aconteceu, não previsão.
                    </p>
                  </div>
                ) : (
                  <p className="text-[12.5px] text-ink-3">Sem alavanca calculável nesta janela.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">Não há meta cadastrada para o mês corrente.</p>
          )}

          <div className="panel px-4 py-4 mt-4">
            <div className="flex items-baseline justify-between">
              <p className="label">Bloco de notas · seu espaço</p>
              <span className="text-[11px] text-ink-3">fica salvo e aparece na próxima leitura</span>
            </div>
            <Interpretacao
              id="notas-estrategia"
              chave={chave}
              salvo={anot("notas-estrategia")}
              grande
              padrao=""
            />
          </div>
        </Secao>

        {/* ══ Dados e pendências ══ */}
        <Secao id="dados" titulo="Estado dos dados e pendências" chamada="O que sustenta cada número, e o que falta para a leitura ficar completa.">
          <div className="panel overflow-hidden">
            <table className="w-full text-[12.5px]">
              <tbody>
                {dados.estadoDados.map((f) => (
                  <tr key={f.fonte} className="border-b border-line last:border-0">
                    <td className="px-3.5 py-2 text-ink">{f.fonte}</td>
                    <td className="px-3 py-2 num text-ink-2">{f.ate ? dm(f.ate) : "sem dado"}</td>
                    <td className="px-3 py-2 text-ink-3 text-[11.5px]">{f.detalhe}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-[11.5px] font-medium ${f.situacao === "ok" ? "text-up" : f.situacao === "atencao" ? "text-warn" : "text-down"}`}>
                        {f.situacao === "ok" ? "em dia" : f.situacao === "atencao" ? "atrasado" : f.situacao === "parado" ? "parado" : "ausente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setVerPendencias((v) => !v)}
            className="mt-3 w-full panel px-4 py-3 flex items-center justify-between hover:border-brand-edge text-left"
          >
            <span>
              <span className="text-[13.5px] font-semibold text-ink">O que falta para a análise ficar 100%</span>
              <span className="num text-[12px] text-ink-2 ml-2">{dados.pendencias.length} itens</span>
            </span>
            <span className="text-[12px] text-brand">{verPendencias ? "fechar" : "abrir"}</span>
          </button>
          {verPendencias && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2.5">
              {dados.pendencias.map((x) => (
                <div key={x.titulo} className="panel px-4 py-3.5">
                  <p className="text-[13px] font-semibold text-ink">{x.titulo}</p>
                  <p className="text-[12px] text-ink-2 mt-1 leading-relaxed">{x.detalhe}</p>
                  <p className="text-[12px] text-warn mt-1.5 leading-relaxed">{x.impacto}</p>
                </div>
              ))}
            </div>
          )}

          <div className="panel px-4 py-3.5 mt-4">
            <p className="label mb-2">Reputação das contas</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dados.reputacao.map((r) => (
                <div key={r.conta} className="text-[12.5px]">
                  <p className="text-ink font-medium">{r.conta}</p>
                  <p className="num text-ink-2 mt-0.5">
                    {r.nivel ?? "—"} · {r.categoria ?? "—"} · reclamação {pct(r.reclamacoes, 2)} · cancelamento {pct(r.cancelamentos, 2)}
                    {r.perguntas != null && ` · ${r.perguntas} perguntas sem resposta`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Secao>

        <footer className="border-t border-line pt-4 pb-10 text-[11.5px] text-ink-3">
          Relatório gerado pela plataforma em {hora(dados.geradoEm)}. Método em docs/agents/inteligencia-de-mercado.md.
          Onde falta dado, o campo diz que falta — nenhum número aqui é estimado sem aviso.
        </footer>
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Peças auxiliares
   ══════════════════════════════════════════════════════════════ */

function GradeKpiCompacta({ m }: { m: Metricas }) {
  const linhas: [string, string, number | null][] = [
    ["Receita", reais(m.receita.atual), m.receita.contraAnterior],
    ["Pedidos", numero(m.pedidos.atual), m.pedidos.contraAnterior],
    ["Ticket", reais(m.ticket.atual), m.ticket.contraAnterior],
    ["Unidades", numero(m.unidades.atual), m.unidades.contraAnterior],
    ["Cancelamento", pct(m.cancelamento.atual), m.cancelamento.contraAnterior],
  ];
  if (m.visitas) linhas.push(["Visitas", numero(m.visitas.atual), m.visitas.contraAnterior]);
  if (m.conversao) linhas.push(["Conversão", pct(m.conversao.atual, 2), m.conversao.contraAnterior]);
  return (
    <dl className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 text-[12px] self-start">
      {linhas.map(([nome, valor, delta]) => (
        <React.Fragment key={nome}>
          <dt className="text-ink-2">{nome}</dt>
          <dd className="num text-ink text-right">{valor}</dd>
          <dd className="text-right"><Delta valor={delta} invertido={nome === "Cancelamento"} miudo /></dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function ListaProdutos({
  titulo,
  nota,
  linhas,
  destaque,
  extra,
}: {
  titulo: string;
  nota: string;
  linhas: LinhaProduto[];
  destaque: "down" | "warn" | "info";
  extra: (l: LinhaProduto) => string;
}) {
  const cor = destaque === "down" ? "text-down" : destaque === "warn" ? "text-warn" : "text-info";
  return (
    <div className="panel px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink">{titulo}</p>
        <span className={`num text-[15px] font-semibold ${cor}`}>{linhas.length}</span>
      </div>
      <p className="text-[11.5px] text-ink-3 mt-0.5 mb-2">{nota}</p>
      {linhas.length ? (
        <ul className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto">
          {linhas.slice(0, 20).map((l) => (
            <li key={l.mlb} className="border-b border-line last:border-0 pb-1.5 last:pb-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="num text-[12px] text-ink">{l.sku ?? l.mlb}</span>
                <span className="text-[11px] text-ink-3">{l.tipo}</span>
              </div>
              <p className="text-[11.5px] text-ink-2 truncate" title={l.titulo}>{l.titulo}</p>
              <p className="num text-[11px] text-ink-3">{extra(l)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-ink-3">Nenhum item.</p>
      )}
      {linhas.length > 20 && <p className="text-[11px] text-ink-3 mt-1.5">e outros {linhas.length - 20}</p>}
    </div>
  );
}

function DetalheProduto({ l }: { l: LinhaProduto }) {
  const item = (rotulo: string, valor: React.ReactNode) => (
    <div>
      <p className="label">{rotulo}</p>
      <p className="num text-[13px] text-ink mt-0.5">{valor}</p>
    </div>
  );
  const distanciaMinimo =
    l.precoMinimo != null && l.precoVisivel != null ? (l.precoVisivel - l.precoMinimo) / l.precoMinimo : null;
  const distanciaMelhor =
    l.melhorPreco != null && l.precoVisivel != null ? (l.precoVisivel - l.melhorPreco) / l.melhorPreco : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[13.5px] font-semibold text-ink">{l.titulo}</p>
        <p className="num text-[11.5px] text-ink-3 mt-0.5">
          {l.mlb} · {l.conta} · {l.tipo} · curva {l.curva}
          {l.situacao && l.situacao !== "active" && <span className="text-down"> · {l.situacao}</span>}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {item("Vitrine", reais(l.precoVitrine, 2))}
        {item("Cliente vê", <span className={l.emCampanha ? "text-warn" : ""}>{reais(l.precoVisivel, 2)}{l.emCampanha && <span className="text-[11px] text-warn ml-1">em campanha</span>}</span>)}
        {item("Mínimo (4,5%)", reais(l.precoMinimo, 2))}
        {item("Distância do mínimo", distanciaMinimo == null ? "—" : <span className={distanciaMinimo < 0 ? "text-down" : "text-up"}>{sinal(distanciaMinimo, 1)}</span>)}
        {item("Melhor preço", reais(l.melhorPreco, 2))}
        {item("Contra o melhor", distanciaMelhor == null ? "—" : <span className={distanciaMelhor > 0.1 ? "text-warn" : "text-up"}>{sinal(distanciaMelhor, 1)}</span>)}
        {item("Estoque", l.situacao === "paused" ? <span className="text-down">pausado</span> : numero(l.estoque))}
        {item("Cobertura", l.coberturaDias == null ? "—" : `${l.coberturaDias} dias`)}
        {item("Venda por dia", numero(l.vendaDia, 2))}
        {item("Melhor venda/dia", l.melhorPorDia == null ? "—" : `${numero(l.melhorPorDia, 2)}${l.melhorAmostraFraca ? " (1 venda)" : ""}`)}
        {item("Visitas na janela", l.visitas == null ? "sem medição" : numero(l.visitas))}
        {item("Conversão", l.conversao == null ? "sem medição" : pct(l.conversao, 2))}
        {item("Melhor conversão", l.melhorConversao == null ? "sem medição" : pct(l.melhorConversao, 2))}
        {item("Receita 90 dias", reais(l.receita90))}
        {item("Unidades 90 dias", numero(l.unidades90))}
        {item("Custo unitário", l.custoUnitario == null ? "não cadastrado" : reais(l.custoUnitario, 2))}
        {item("Margem por peça", l.margemUnitaria == null ? "sem custo" : <span className={l.margemUnitaria > 0 ? "text-up" : "text-down"}>{reais(l.margemUnitaria, 2)}</span>)}
        {item("Sem vender há", l.diasSemVenda == null ? "—" : `${l.diasSemVenda} dias`)}
      </div>

      {l.melhorPeriodo && (
        <p className="text-[11.5px] text-ink-3">
          O melhor preço vigorou de {l.melhorPeriodo}, com {numero(l.melhorPorDia, 2)} peças por dia.
          {l.melhorAmostraFraca && " Só uma venda naquele preço, então a velocidade não é medida — é indício."}
        </p>
      )}

      {l.catalogo && (
        <div className="border-t border-line pt-3">
          <p className="label mb-1.5">Catálogo</p>
          <p className="text-[12.5px] text-ink-2">
            Situação: <strong className={l.catalogo.situacao === "winning" ? "text-up" : "text-warn"}>{
              l.catalogo.situacao === "winning" ? "ganhando a página"
              : l.catalogo.situacao === "sharing_first_place" ? "dividindo o primeiro lugar"
              : l.catalogo.situacao === "losing" ? "perdendo"
              : l.catalogo.situacao === "not_listed" ? "fora do catálogo"
              : l.catalogo.situacao
            }</strong>
            {l.catalogo.precoParaGanhar != null && <> · preço para ganhar {reais(l.catalogo.precoParaGanhar, 2)}</>}
            {l.catalogo.fatiaVisita && <> · fatia de visita {l.catalogo.fatiaVisita}</>}
          </p>
          {l.catalogo.alavancasAbertas.length > 0 && (
            <p className="text-[12px] text-ink-3 mt-1">
              Alavancas em aberto: {l.catalogo.alavancasAbertas.join(", ")}
            </p>
          )}
        </div>
      )}
      {l.elegivelForaCatalogo && (
        <p className="text-[12.5px] text-brand border-t border-line pt-3">
          Este anúncio é elegível ao catálogo e não está inscrito.
        </p>
      )}
    </div>
  );
}
