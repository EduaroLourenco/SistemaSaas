"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, LineChart, Pencil, RefreshCw, Settings2, Upload } from "lucide-react";
import { gerizoFetch } from "@/lib/demo/runtime";
import { Badge, Button, EmptyState, Panel, Skeleton } from "@/components/ui/primitives";
import { Checkbox, Field, Input, Select, Sheet, Toggle } from "@/components/ui/controls";
import { FotoAnuncio } from "@/components/ui/foto-anuncio";
import { count, money } from "@/lib/format";
import type { DadosSugestoes, SugestoesDaConta } from "@/lib/dados/sugestoes";
import {
  REGRAS_DO_ROBO,
  cobertura,
  desempenhoPorPreco,
  estadoDaRegra,
  margemNoPreco,
  sugerirTodos,
  type Ajuste,
  type DiaDoAnuncio,
  type Grupo,
  type ItemBruto,
  type Opcao,
  type Parametros,
  type Sugestao,
} from "@/lib/planilhas/sugestoes-promocao";
import type { PedidoDeAceite } from "@/lib/planilhas/corpo-promocao";
import "./sugeridas.css";

/**
 * Promoções sugeridas: a linha em destaque no topo da lista e o painel.
 *
 * O servidor só junta o dado bruto (`/api/automacoes/sugestoes`, uma conta
 * por vez — a conta a prazo da Probel leva minutos). A DECISÃO roda aqui,
 * com `sugerirTodos`: o lápis troca tolerância, mínimo ou preço e a lista
 * se recalcula na hora, sem voltar ao servidor.
 *
 * Nada sai para o Mercado Livre sem a revisão, e a rota de envio relê
 * cada item no canal antes de mandar (`conferir: true`).
 *
 * Spec: .scratch/promocoes-sugeridas/spec.md
 */

type Contexto = Omit<DadosSugestoes, "itens" | "falhas" | "lidoEm">;
type EstadoConta = { estado: "lendo" } | { estado: "ok"; dados: SugestoesDaConta } | { estado: "erro"; erro: string };

const ABAS: { k: Grupo; rotulo: string }[] = [
  { k: "aceitar", rotulo: "Para aceitar" },
  { k: "baixar", rotulo: "Baixar preço" },
  { k: "alerta", rotulo: "Alertas" },
  { k: "no_alvo", rotulo: "No alvo" },
  { k: "fora", rotulo: "Fora" },
];

const ACAO: Record<Opcao["acao"], string> = { aceitar: "Aceitar", entrar: "Entrar", baixar: "Baixar" };
const FONTE: Record<string, string> = { tabela: "tabela", formula_base: "Fórmula base", custo: "custo" };
const dataCurta = (iso: string | null) =>
  iso ? new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
const contaCurta = (nome: string) => nome.split("—")[0].trim();

/* ══ A linha em destaque ══════════════════════════════════════ */

export function LinhaSugeridas({ aberta, onAbrir }: { aberta: boolean; onAbrir: () => void }) {
  return (
    <button type="button" className="sug-linha" aria-expanded={aberta} onClick={onAbrir}>
      <span className="sug-linha-marca" aria-hidden="true">★</span>
      <span className="sug-linha-id">
        <span className="nm">Promoções sugeridas</span>
        <span className="sub">tabela de preço, convites e giro de estoque, numa lista só</span>
      </span>
      <span className="sug-linha-acao">{aberta ? "Fechar" : "Abrir"}</span>
    </button>
  );
}

/* ══ O painel ═════════════════════════════════════════════════ */

export function PainelSugeridas({ contaFiltro }: { contaFiltro: string }) {
  const [ctx, setCtx] = React.useState<Contexto | null>(null);
  const [erroCtx, setErroCtx] = React.useState<string | null>(null);
  const [contas, setContas] = React.useState<Map<string, EstadoConta>>(new Map());
  const [params, setParams] = React.useState<Parametros | null>(null);
  const [ajustes, setAjustes] = React.useState<Map<string, Ajuste>>(new Map());
  const [escolha, setEscolha] = React.useState<Map<string, string>>(new Map());
  const [marcacao, setMarcacao] = React.useState<Map<string, boolean>>(new Map());
  const [aba, setAba] = React.useState<Grupo>("aceitar");
  const [lapis, setLapis] = React.useState<Sugestao[] | null>(null);
  const [simular, setSimular] = React.useState<Sugestao | null>(null);
  const [regras, setRegras] = React.useState(false);
  const [revisar, setRevisar] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);

  const carregar = React.useCallback(async (forcar = false) => {
    setErroCtx(null);
    try {
      const r = await gerizoFetch("/api/automacoes/sugestoes");
      const c = await r.json();
      if (!r.ok) throw new Error(c.erro ?? "não consegui abrir as sugestões");
      setCtx(c);
      setParams((p) => p ?? c.parametros);
      /* Uma conta por vez: a cota do canal é uma só, e a primeira conta
         aparece enquanto a próxima ainda lê. */
      for (const conta of c.contas as Contexto["contas"]) {
        setContas((m) => new Map(m).set(conta.id, { estado: "lendo" }));
        try {
          const q = new URLSearchParams({ conta: conta.id, ...(forcar ? { forcar: "1" } : {}) });
          const rc = await gerizoFetch(`/api/automacoes/sugestoes?${q}`);
          const d = await rc.json();
          setContas((m) => new Map(m).set(conta.id, rc.ok ? { estado: "ok", dados: d } : { estado: "erro", erro: d.erro ?? "falhou" }));
        } catch (e) {
          setContas((m) => new Map(m).set(conta.id, { estado: "erro", erro: String(e) }));
        }
      }
    } catch (e) {
      setErroCtx(e instanceof Error ? e.message : String(e));
    }
  }, []);
  React.useEffect(() => { void carregar(); }, [carregar]);

  const itens = React.useMemo(() => {
    const todos: ItemBruto[] = [];
    for (const [id, e] of contas) if (e.estado === "ok" && (!contaFiltro || id === contaFiltro)) todos.push(...e.dados.itens);
    return todos;
  }, [contas, contaFiltro]);

  const sugestoes = React.useMemo(
    () => (params ? sugerirTodos(itens, params, ajustes) : []),
    [itens, params, ajustes]
  );
  const porGrupo = React.useMemo(() => {
    const m = new Map<Grupo, Sugestao[]>();
    for (const s of sugestoes) m.set(s.grupo, [...(m.get(s.grupo) ?? []), s]);
    return m;
  }, [sugestoes]);

  const opcaoDe = React.useCallback(
    (s: Sugestao) => s.opcoes.find((o) => o.id === escolha.get(s.chave)) ?? s.recomendada,
    [escolha]
  );
  const marcada = React.useCallback((s: Sugestao) => Boolean(s.recomendada) && (marcacao.get(s.chave) ?? s.marcada), [marcacao]);
  const selecionadas = sugestoes.filter((s) => (s.grupo === "aceitar" || s.grupo === "baixar") && marcada(s));

  const lendo = [...contas.values()].some((e) => e.estado === "lendo");
  const nomeLendo = ctx?.contas.find((c) => contas.get(c.id)?.estado === "lendo")?.nome;
  const visiveis = porGrupo.get(aba) ?? [];
  const acionaveis = visiveis.filter((s) => s.recomendada);
  const todasMarcadas = acionaveis.length > 0 && acionaveis.every(marcada);

  const marcarTodas = (v: boolean) =>
    setMarcacao((m) => {
      const n = new Map(m);
      for (const s of acionaveis) n.set(s.chave, v);
      return n;
    });

  if (erroCtx) return <EmptyState title="Não consegui montar as sugestões" description={erroCtx} />;
  if (!ctx || !params) return <Skeleton className="mt-4 h-48 w-full" />;
  if (!ctx.contas.length) return <EmptyState title="Nenhuma conta do Mercado Livre conectada" />;

  const desconto = selecionadas.reduce((soma, s) => {
    const o = opcaoDe(s);
    return soma + (o && s.vitrine ? Math.max(0, s.vitrine - o.comprador) : 0);
  }, 0);

  return (
    <section className="sug-painel" aria-label="Promoções sugeridas">
      <div className="sug-topo">
        <div className="sug-heroi">
          <span className="big">{count(selecionadas.length)}</span>
          <span className="leg">
            selecionadas para enviar
            {desconto > 0 && <> · <b>{money(desconto)}</b> a menos para o comprador, somado</>}
          </span>
        </div>
        <div className="sug-acoes">
          <Button variant="ghost" onClick={() => setRegras(true)}><Settings2 size={15} /> Regras do robô</Button>
          <Button variant="ghost" onClick={() => void carregar(true)} disabled={lendo}>
            <RefreshCw size={15} className={lendo ? "animate-spin" : undefined} /> {lendo ? "Lendo…" : "Atualizar"}
          </Button>
        </div>
      </div>

      <FonteDoMinimo ctx={ctx} onImportado={(m) => { setAviso(m); void carregar(true); }} />

      {ctx.faltaMigracao && (
        <p className="sug-aviso"><AlertTriangle size={14} /> {ctx.faltaMigracao}</p>
      )}
      {aviso && <p className="sug-aviso ok">{aviso}</p>}
      {lendo && <p className="sug-lendo">Lendo convites de {nomeLendo ?? "…"} no Mercado Livre</p>}
      {[...contas].filter(([, e]) => e.estado === "erro").map(([id, e]) => (
        <p key={id} className="sug-aviso"><AlertTriangle size={14} /> {ctx.contas.find((c) => c.id === id)?.nome}: {(e as { erro: string }).erro}</p>
      ))}

      <div className="sug-abas" role="tablist">
        {ABAS.map((a) => (
          <button key={a.k} type="button" role="tab" aria-selected={aba === a.k} onClick={() => setAba(a.k)}>
            {a.rotulo} <span>{count(porGrupo.get(a.k)?.length ?? 0)}</span>
          </button>
        ))}
      </div>

      {acionaveis.length > 0 && (
        <div className="sug-barra">
          <Checkbox checked={todasMarcadas} onChange={marcarTodas} label={todasMarcadas ? "Desmarcar todas" : "Marcar todas"} />
          <Button
            variant="ghost"
            disabled={!acionaveis.some(marcada)}
            onClick={() => setLapis(acionaveis.filter(marcada))}
          >
            <Pencil size={14} /> Ajustar marcadas
          </Button>
        </div>
      )}

      {aba === "alerta" ? (
        <Alertas lista={visiveis} onLapis={(s) => setLapis([s])} />
      ) : !visiveis.length ? (
        <EmptyState title={lendo ? "Ainda lendo" : "Nada aqui"} />
      ) : (
        <ul className="sug-lista">
          {visiveis.map((s) => (
            <Linha
              key={s.chave}
              s={s}
              opcao={opcaoDe(s)}
              marcada={marcada(s)}
              onMarcar={(v) => setMarcacao((m) => new Map(m).set(s.chave, v))}
              onEscolher={(id) => setEscolha((m) => new Map(m).set(s.chave, id))}
              onLapis={() => setLapis([s])}
              onSimular={() => setSimular(s)}
            />
          ))}
        </ul>
      )}

      {selecionadas.length > 0 && (
        <div className="sug-rodape">
          <span>{count(selecionadas.length)} marcadas</span>
          <Button variant="primary" onClick={() => setRevisar(true)}>Revisar e enviar</Button>
        </div>
      )}

      {lapis && (
        <Lapis
          alvo={lapis}
          params={params}
          ajustes={ajustes}
          onAplicar={(novos) => {
            setAjustes((m) => {
              const n = new Map(m);
              for (const [k, a] of novos) {
                if (a == null) n.delete(k);
                else n.set(k, a);
              }
              return n;
            });
            setLapis(null);
          }}
          onFechar={() => setLapis(null)}
        />
      )}
      {regras && (
        <Regras
          params={params}
          itens={itens}
          onSalvar={(p, msg) => { setParams(p); setAviso(msg); setRegras(false); }}
          onFechar={() => setRegras(false)}
        />
      )}
      {simular && <Simulacao s={simular} onFechar={() => setSimular(null)} />}
      {revisar && (
        <Revisao
          itens={selecionadas.map((s) => ({ s, o: opcaoDe(s)! })).filter((x) => x.o)}
          contas={ctx.contas}
          onFechar={(enviou) => { setRevisar(false); if (enviou) void carregar(true); }}
        />
      )}
    </section>
  );
}

/* ══ De onde vem o mínimo, e o botão de importar ══════════════ */

function FonteDoMinimo({ ctx, onImportado }: { ctx: Contexto; onImportado: (msg: string) => void }) {
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const f = ctx.fonteMinimo;

  async function importar(arquivo: File) {
    setEnviando(true);
    setErro(null);
    try {
      const form = new FormData();
      form.set("arquivo", arquivo);
      const r = await gerizoFetch("/api/automacoes/preco-minimo", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "não consegui importar");
      onImportado(
        `Tabela importada: ${count(j.skus)} SKUs da aba ${j.aba}` +
          (j.destaques ? `, com ${count(j.destaques.precos)} preços amarelos de ${j.destaques.aba}` : "") + "."
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="sug-fonte">
      <span>
        Preço mínimo:{" "}
        {f.tabela ? <b>tabela de {dataCurta(f.tabela)}</b> : f.formulaBase ? <b>Fórmula base de {dataCurta(f.formulaBase)}</b> : <b>sem tabela</b>}
      </span>
      <input
        ref={input}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => { const a = e.target.files?.[0]; if (a) void importar(a); }}
      />
      <Button variant="ghost" onClick={() => input.current?.click()} disabled={enviando}>
        <Upload size={14} /> {enviando ? "Importando…" : "Importar tabela"}
      </Button>
      {erro && <span className="sug-erro">{erro}</span>}
    </div>
  );
}

/* ══ Uma linha ════════════════════════════════════════════════ */

function Linha({ s, opcao, marcada, onMarcar, onEscolher, onLapis, onSimular }: {
  s: Sugestao;
  opcao: Opcao | null;
  marcada: boolean;
  onMarcar: (v: boolean) => void;
  onEscolher: (id: string) => void;
  onLapis: () => void;
  onSimular: () => void;
}) {
  const i = s.item;
  return (
    <li className={`sug-item${marcada ? " on" : ""}`}>
      <div className="sug-check">
        {opcao ? <Checkbox checked={marcada} onChange={onMarcar} aria-label={`Selecionar ${i.titulo ?? i.mlb}`} /> : <span />}
      </div>
      <FotoAnuncio src={i.foto} mlb={i.mlb} alt="" tamanho={44} className="sug-foto" />
      <div className="sug-corpo">
        <p className="sug-titulo">{i.titulo ?? i.mlb}</p>
        <p className="sug-id">
          {i.sku ?? "sem SKU"} · {i.mlb} · {i.tipoAnuncio === "premium" ? "Premium" : "Clássico"} · {contaCurta(i.contaNome)}
          {i.estoque != null && i.estoque < 40000 ? ` · estoque ${count(i.estoque)}` : ""}
        </p>

        {opcao ? (
          <div className="sug-acao">
            <span className={`sug-verbo ${opcao.acao}`}>{ACAO[opcao.acao]}</span>
            <span className="sug-promo">{opcao.nome}</span>
            {opcao.acao === "baixar" ? (
              <span className="sug-preco"><s>{money(opcao.precoAtual!)}</s> → <b>{money(opcao.comprador)}</b></span>
            ) : (
              <span className="sug-preco">
                <b>{money(opcao.comprador)}</b>
                {opcao.recebe > opcao.comprador + 0.005 && <> · você recebe <b>{money(opcao.recebe)}</b></>}
                {opcao.unidades != null && <> · {count(opcao.unidades)} un.</>}
              </span>
            )}
            {opcao.prazo && <span className="sug-prazo">aceitar até {dataCurta(opcao.prazo)}</span>}
          </div>
        ) : (
          <p className="sug-motivo">{s.motivo}</p>
        )}

        <p className="sug-numeros">
          {s.vitrine != null && <>hoje {money(s.vitrine)}</>}
          {s.minimo != null && <> · mínimo {money(s.minimo)} <i>({s.minimo !== i.minimo?.valor ? "ajustado" : FONTE[i.minimo?.fonte ?? "custo"]})</i></>}
          {opcao?.margemPct != null && <> · margem {String(opcao.margemPct).replace(".", ",")}%</>}
          {i.vendas && <> · {count(i.vendas.u30)} vendas em 30 dias</>}
        </p>

        {s.tags.length > 0 && (
          <div className="sug-tags">
            {s.tags.map((t) => <Badge key={t.texto} tone={t.tom}>{t.texto}</Badge>)}
          </div>
        )}

        {s.opcoes.length > 1 && opcao && (
          <div className="sug-outras">
            <Select value={opcao.id} onChange={(e) => onEscolher(e.target.value)} aria-label="Escolher outra promoção">
              {s.opcoes.map((o) => (
                <option key={o.id} value={o.id}>
                  {ACAO[o.acao]} · {o.nome} · {money(o.comprador)}{o.recebe > o.comprador + 0.005 ? ` (recebe ${money(o.recebe)})` : ""}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <div className="sug-ferramentas">
        <button type="button" onClick={onLapis} aria-label="Ajustar este item" title="Ajustar mínimo, tolerância ou preço"><Pencil size={16} /></button>
        <button type="button" onClick={onSimular} aria-label="Simular preço" title="Simular preço e desempenho"><LineChart size={16} /></button>
      </div>
    </li>
  );
}

/* ══ Alertas: abaixo do mínimo primeiro, sem mínimo resumido ══ */

function Alertas({ lista, onLapis }: { lista: Sugestao[]; onLapis: (s: Sugestao) => void }) {
  const [abrirSem, setAbrirSem] = React.useState(false);
  const abaixo = lista.filter((s) => s.motivo !== "sem preço mínimo");
  const sem = lista.filter((s) => s.motivo === "sem preço mínimo");
  return (
    <div className="sug-alertas">
      {abaixo.length > 0 && (
        <ul className="sug-lista">
          {abaixo.map((s) => (
            <li key={s.chave} className="sug-item alerta">
              <div className="sug-check" />
              <FotoAnuncio src={s.item.foto} mlb={s.item.mlb} alt="" tamanho={44} className="sug-foto" />
              <div className="sug-corpo">
                <p className="sug-titulo">{s.item.titulo ?? s.item.mlb}</p>
                <p className="sug-id">{s.item.sku ?? "sem SKU"} · {s.item.mlb} · {s.item.tipoAnuncio === "premium" ? "Premium" : "Clássico"} · {contaCurta(s.item.contaNome)}</p>
                <p className="sug-alerta-txt"><AlertTriangle size={14} /> {s.alertas[0] ?? s.motivo}</p>
                {s.tags.length > 0 && <div className="sug-tags">{s.tags.map((t) => <Badge key={t.texto} tone={t.tom}>{t.texto}</Badge>)}</div>}
              </div>
              <div className="sug-ferramentas">
                <button type="button" onClick={() => onLapis(s)} aria-label="Ajustar o mínimo deste item"><Pencil size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {sem.length > 0 && (
        <div className="sug-sem">
          <button type="button" onClick={() => setAbrirSem(!abrirSem)} aria-expanded={abrirSem}>
            <ChevronDown size={15} className={abrirSem ? "rotate-180" : undefined} />
            {count(sem.length)} anúncios sem preço mínimo — importe a tabela ou cadastre o custo
          </button>
          {abrirSem && (
            <ul>
              {sem.map((s) => (
                <li key={s.chave}>
                  <span>{s.item.titulo ?? s.item.mlb}</span>
                  <span className="sug-id">{s.item.sku ?? "sem SKU"} · {s.item.mlb}</span>
                  <button type="button" onClick={() => onLapis(s)} aria-label="Definir o mínimo"><Pencil size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!lista.length && <EmptyState title="Nenhum alerta" />}
    </div>
  );
}

/* ══ O lápis ══════════════════════════════════════════════════ */

function Lapis({ alvo, params, ajustes, onAplicar, onFechar }: {
  alvo: Sugestao[];
  params: Parametros;
  ajustes: Map<string, Ajuste>;
  onAplicar: (novos: [string, Ajuste | null][]) => void;
  onFechar: () => void;
}) {
  const um = alvo.length === 1 ? alvo[0] : null;
  const atual = um ? ajustes.get(um.chave) ?? {} : {};
  const [tol, setTol] = React.useState(String(atual.toleranciaPct ?? params.toleranciaPct));
  const [minimo, setMinimo] = React.useState(atual.minimo != null ? String(atual.minimo) : "");
  const [preco, setPreco] = React.useState(atual.preco != null ? String(atual.preco) : "");
  const n = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));

  return (
    <Sheet
      title={um ? "Ajustar este item" : `Ajustar ${count(alvo.length)} itens`}
      subtitle={um ? um.item.titulo ?? um.item.mlb : "Vale para os itens marcados nesta aba"}
      onClose={onFechar}
      width="440px"
      footer={
        <>
          {um && ajustes.has(um.chave) && <Button variant="ghost" onClick={() => onAplicar([[um.chave, null]])}>Voltar ao padrão</Button>}
          <Button
            variant="primary"
            className="ml-auto"
            onClick={() =>
              onAplicar(alvo.map((s) => {
                const a: Ajuste = { ...(ajustes.get(s.chave) ?? {}) };
                const t = n(tol);
                if (t != null && Number.isFinite(t)) a.toleranciaPct = t;
                if (um) {
                  const m = n(minimo);
                  const p = n(preco);
                  if (m != null && m > 0) a.minimo = m; else delete a.minimo;
                  if (p != null && p > 0) a.preco = p; else delete a.preco;
                }
                return [s.chave, a];
              }))
            }
          >
            Recalcular
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-6">
        <Field label="Tolerância abaixo do mínimo (%)" hint={`Padrão da empresa: ${params.toleranciaPct}%. Parado ou com estoque sobrando soma +${params.toleranciaParadoPct}%.`}>
          <Input inputMode="decimal" value={tol} onChange={(e) => setTol(e.target.value)} />
        </Field>
        {um && (
          <>
            <Field label="Preço mínimo (R$)" hint={um.item.minimo ? `Da ${FONTE[um.item.minimo.fonte]}: ${money(um.item.minimo.valor)}` : "Este item não tem mínimo cadastrado"}>
              <Input inputMode="decimal" value={minimo} placeholder={um.item.minimo ? String(um.item.minimo.valor) : ""} onChange={(e) => setMinimo(e.target.value)} />
            </Field>
            <Field label="Preço da oferta (R$)" hint="Só onde o preço é nosso: entrar na campanha ou baixar o preço dela">
              <Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ══ Regras do robô ═══════════════════════════════════════════ */

const ROTULO_PARAM: Partial<Record<keyof Parametros, string>> = {
  toleranciaPct: "Tolerância abaixo do mínimo (%)",
  diferencaMinimaPct: "Diferença mínima para sugerir (%)",
  diasParado: "Parado depois de (dias sem venda)",
  coberturaAltaDias: "Estoque sobrando acima de (dias)",
  toleranciaParadoPct: "Tolerância extra no parado (%)",
  coberturaBaixaDias: "Estoque acabando abaixo de (dias)",
  margemMinimaPct: "Margem mínima (%)",
  unidadesRelampagoPct: "Estoque no relâmpago (%)",
  listaFora: "SKUs fora (separados por vírgula)",
};

function Regras({ params, itens, onSalvar, onFechar }: {
  params: Parametros;
  itens: ItemBruto[];
  onSalvar: (p: Parametros, msg: string) => void;
  onFechar: () => void;
}) {
  const [p, setP] = React.useState<Parametros>(params);
  const [salvando, setSalvando] = React.useState(false);
  const cob = React.useMemo(() => cobertura(itens), [itens]);
  const campo = (k: keyof Parametros) => {
    const v = p[k];
    if (k === "listaFora") {
      return <Input value={(v as string[]).join(", ")} onChange={(e) => setP({ ...p, listaFora: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />;
    }
    return (
      <Input
        inputMode="decimal"
        value={v == null ? "" : String(v)}
        placeholder={k === "margemMinimaPct" ? "sem margem" : ""}
        onChange={(e) => {
          const t = e.target.value.replace(",", ".");
          setP({ ...p, [k]: t === "" && k === "margemMinimaPct" ? null : Number(t) });
        }}
      />
    );
  };

  async function salvar() {
    setSalvando(true);
    try {
      const r = await gerizoFetch("/api/automacoes/robo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      const j = await r.json();
      /* Sem a migração, vale nesta tela até recarregar — e o aviso diz isso. */
      onSalvar(r.ok ? j.parametros : p, r.ok ? "Regras guardadas para a empresa." : `Aplicado só nesta tela: ${j.erro}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Sheet
      title="Regras do robô"
      subtitle="Valem para todas as contas desta empresa. Regra sem o dado de que precisa desliga sozinha."
      onClose={onFechar}
      width="560px"
      footer={<Button variant="primary" className="ml-auto" onClick={salvar} disabled={salvando}>{salvando ? "Guardando…" : "Guardar"}</Button>}
    >
      <div className="sug-regras">
        <p className="sug-cob">
          Dos {count(cob.minimo.total)} anúncios com promoção: {count(cob.minimo.tem)} com preço mínimo ·{" "}
          {count(cob.custo.tem)} com custo · {count(cob.vendas.tem)} com vendas · {count(cob.catalogo.tem)} no catálogo
        </p>
        {REGRAS_DO_ROBO.map((r) => {
          const est = estadoDaRegra(r, p, cob);
          const desligada = p.regrasDesligadas.includes(r.codigo);
          return (
            <div key={r.codigo} className={`sug-regra${est.ligada ? "" : " off"}`}>
              <div className="sug-regra-cab">
                <div>
                  <p className="nm">{r.nome}</p>
                  <p className="faz">{r.faz}</p>
                  {!est.ligada && est.motivo !== "desligada" && <p className="por">{est.motivo}</p>}
                </div>
                <Toggle
                  checked={!desligada}
                  onChange={(v) =>
                    setP({
                      ...p,
                      regrasDesligadas: v ? p.regrasDesligadas.filter((c) => c !== r.codigo) : [...p.regrasDesligadas, r.codigo],
                    })
                  }
                />
              </div>
              {r.parametros.length > 0 && (
                <div className="sug-regra-params">
                  {r.parametros.map((k) => <Field key={k} label={ROTULO_PARAM[k] ?? k}>{campo(k)}</Field>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/* ══ Simulação ════════════════════════════════════════════════ */

function Simulacao({ s, onFechar }: { s: Sugestao; onFechar: () => void }) {
  const [dias, setDias] = React.useState<DiaDoAnuncio[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [preco, setPreco] = React.useState(String(s.recomendada?.recebe ?? s.minimo ?? s.vitrine ?? ""));
  const i = s.item;

  React.useEffect(() => {
    let vivo = true;
    gerizoFetch(`/api/automacoes/simulacao?${new URLSearchParams({ conta: i.contaId, mlb: i.mlb })}`)
      .then(async (r) => {
        const j = await r.json();
        if (!vivo) return;
        if (r.ok) setDias(j.dias);
        else setErro(j.erro ?? "falhou");
      })
      .catch((e) => vivo && setErro(String(e)));
    return () => { vivo = false; };
  }, [i.contaId, i.mlb]);

  const d = React.useMemo(() => (dias ? desempenhoPorPreco(dias) : null), [dias]);
  const p = Number(preco.replace(",", "."));
  const margem = p > 0 ? margemNoPreco(i, p) : null;
  const venc = i.catalogo?.vencedorPreco ?? null;

  /* O que falta: do melhor preço (ou do concorrente) até o mínimo. */
  const alvo = d?.melhor ? (d.melhor.de + d.melhor.ate) / 2 : venc;
  const falta = alvo != null && s.minimo != null ? s.minimo - alvo : null;

  return (
    <Sheet title="Simular preço" subtitle={i.titulo ?? i.mlb} onClose={onFechar} width="560px">
      <div className="sug-sim">
        <div className="sug-sim-calc">
          <Field label="Valor que você recebe (R$)"><Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} /></Field>
          <div>
            <span className="label">Margem nesse valor</span>
            <p className="num">{margem == null ? <span className="text-ink-3 text-[14px]">sem custo cadastrado</span> : `${String(margem).replace(".", ",")}%`}</p>
          </div>
          <div>
            <span className="label">Mínimo</span>
            <p className="num">{s.minimo == null ? <span className="text-ink-3 text-[14px]">sem mínimo</span> : money(s.minimo)}</p>
          </div>
        </div>

        <h3>Venda por dia em cada preço · 90 dias</h3>
        {erro && <p className="sug-erro">{erro}</p>}
        {!d && !erro && <Skeleton className="h-28 w-full" />}
        {d && !d.faixas.length && <p className="text-ink-3 text-[14px]">Sem leitura diária de preço neste período.</p>}
        {d && d.faixas.length > 0 && (
          <table className="sug-faixas">
            <thead><tr><th>Preço</th><th>Dias</th><th>Un./dia</th><th>Conversão</th></tr></thead>
            <tbody>
              {d.faixas.map((f) => (
                <tr key={f.de} className={f === d.melhor ? "melhor" : undefined}>
                  <td>{f.de === f.ate ? money(f.de) : `${money(f.de)} a ${money(f.ate)}`}</td>
                  <td>{count(f.dias)}</td>
                  <td><b>{String(f.porDia).replace(".", ",")}</b></td>
                  <td>{f.conversao == null ? "" : `${String(f.conversao).replace(".", ",")}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3>O que falta</h3>
        <ul className="sug-falta">
          {venc != null && <li>Vencedor do catálogo: <b>{money(venc)}</b></li>}
          {d?.melhor && <li>Melhor desempenho: <b>{money(d.melhor.de)}</b>{d.melhor.ate !== d.melhor.de ? ` a ${money(d.melhor.ate)}` : ""}, {String(d.melhor.porDia).replace(".", ",")} un./dia</li>}
          {falta != null && falta > 0.005 && <li>O mínimo está <b>{money(falta)}</b> acima desse preço. Uma co-participada em que o Meli paga a diferença fecha a conta sem mexer no mínimo.</li>}
          {falta != null && falta <= 0.005 && <li>O mínimo já cabe abaixo desse preço.</li>}
          {s.opcoes.filter((o) => o.regra === "meli_paga").map((o) => (
            <li key={o.id}>{o.nome}: comprador <b>{money(o.comprador)}</b>, você recebe <b>{money(o.recebe)}</b></li>
          ))}
          {!i.custo && <li>Sem custo cadastrado: margem e piso por custo ficam de fora.</li>}
        </ul>
      </div>
    </Sheet>
  );
}

/* ══ Revisão e envio ══════════════════════════════════════════ */

type Resultado = { mlb: string; ok: boolean; erro?: string; preco?: number | null };

function Revisao({ itens, contas, onFechar }: {
  itens: { s: Sugestao; o: Opcao }[];
  contas: Contexto["contas"];
  onFechar: (enviou: boolean) => void;
}) {
  const [enviando, setEnviando] = React.useState(false);
  const [resultados, setResultados] = React.useState<Resultado[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const porConta = React.useMemo(() => {
    const m = new Map<string, { s: Sugestao; o: Opcao }[]>();
    for (const x of itens) m.set(x.s.item.contaId, [...(m.get(x.s.item.contaId) ?? []), x]);
    return m;
  }, [itens]);
  const semEscrita = [...porConta.keys()].filter((id) => !contas.find((c) => c.id === id)?.escrita);
  const baixas = itens.filter((x) => x.o.acao === "baixar").length;
  const relampagos = itens.filter((x) => x.o.unidades != null).length;
  const titulo = new Map(itens.map((x) => [x.s.item.mlb, x.s.item.titulo ?? x.s.item.mlb]));

  async function enviar() {
    setEnviando(true);
    setErro(null);
    const todos: Resultado[] = [];
    try {
      for (const [conta, lista] of porConta) {
        if (semEscrita.includes(conta)) continue;
        const pedidos: PedidoDeAceite[] = lista.map((x) => x.o.pedido);
        for (let k = 0; k < pedidos.length; k += 300) {
          const r = await gerizoFetch("/api/automacoes/enviar", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ conta, itens: pedidos.slice(k, k + 300), confirmar: true, conferir: true }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.erro ?? "o envio falhou");
          todos.push(...(j.resultados as Resultado[]));
        }
      }
      setResultados(todos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      if (todos.length) setResultados(todos);
    } finally {
      setEnviando(false);
    }
  }

  if (resultados) {
    const ok = resultados.filter((r) => r.ok);
    const nao = resultados.filter((r) => !r.ok);
    return (
      <Sheet title="Resultado" onClose={() => onFechar(true)} width="600px" footer={<Button variant="primary" className="ml-auto" onClick={() => onFechar(true)}>Fechar</Button>}>
        <div className="sug-resultado">
          <p className="big">{count(ok.length)} <span>de {count(resultados.length)} entraram</span></p>
          {erro && <p className="sug-erro">{erro}</p>}
          {nao.length > 0 && (
            <ul className="sug-recusas">
              {nao.map((r, k) => <li key={r.mlb + k}><b>{titulo.get(r.mlb) ?? r.mlb}</b><span>{r.erro}</span></li>)}
            </ul>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={`Revisar ${count(itens.length)} itens`}
      subtitle="Antes de enviar, o sistema relê cada item no Mercado Livre e deixa de fora o que mudou."
      onClose={() => onFechar(false)}
      width="640px"
      footer={
        <>
          <span className="text-[12px] text-ink-3">Nada foi enviado ainda.</span>
          <Button variant="primary" className="ml-auto" onClick={enviar} disabled={enviando || semEscrita.length === porConta.size}>
            {enviando ? "Enviando…" : `Enviar ${count(itens.filter((x) => !semEscrita.includes(x.s.item.contaId)).length)} ao Mercado Livre`}
          </Button>
        </>
      }
    >
      <div className="sug-revisao">
        {erro && <p className="sug-erro">{erro}</p>}
        {baixas > 0 && (
          <Panel className="border-warn/40 bg-warn-wash/40 p-3 text-[14px]">
            {count(baixas)} {baixas === 1 ? "baixa" : "baixas"} de preço em campanha já ativa: o Meli só deixa o preço descer.
            Para voltar ao preço de antes, só tirando o item da campanha.
          </Panel>
        )}
        {relampagos > 0 && (
          <Panel className="border-warn/40 bg-warn-wash/40 p-3 text-[14px]">
            {count(relampagos)} {relampagos === 1 ? "relâmpago" : "relâmpagos"}: o Meli marca o horário depois do aceite, e depois de começar não dá para tirar.
          </Panel>
        )}
        {semEscrita.map((id) => (
          <Panel key={id} className="border-down/40 bg-down-wash/40 p-3 text-[14px]">
            {contas.find((c) => c.id === id)?.nome}: a conta não autorizou o sistema a alterar promoções (Canais e contas › Permitir alterações). Os itens dela ficam de fora.
          </Panel>
        ))}
        {[...porConta].map(([conta, lista]) => (
          <div key={conta}>
            <h3>{contas.find((c) => c.id === conta)?.nome ?? conta} · {count(lista.length)}</h3>
            <ul>
              {lista.map(({ s, o }) => (
                <li key={s.chave}>
                  <span className="t">{s.item.titulo ?? s.item.mlb}</span>
                  <span className="a">
                    {ACAO[o.acao]} {o.nome} ·{" "}
                    {o.acao === "baixar" ? <>{money(o.precoAtual!)} → <b>{money(o.comprador)}</b></> : <b>{money(o.comprador)}</b>}
                    {o.unidades != null && ` · ${count(o.unidades)} un.`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
