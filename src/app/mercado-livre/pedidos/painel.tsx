"use client";
import * as React from "react";
import { gerizoFetch } from "@/lib/demo/runtime";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { DadosEnvios, EnvioMeli } from "@/lib/dados/envios-meli";
import {
  CORES, STATUS_MANUAL, atrasado, cor, corAtual, folga, limites, prever, taxa,
  type Cor, type ReputacaoMeli, type StatusManual, type Variavel,
} from "@/lib/envios/reputacao";

type Mapa = NonNullable<DadosEnvios["status"]>;
const NOME_COR: Record<Cor, string> = { verde: "Verde", amarelo: "Amarelo", laranja: "Laranja", vermelho: "Vermelho" };
const NIVEL: Record<string, string> = { "5_green": "Verde", "4_light_green": "Verde-claro", "3_yellow": "Amarelo", "2_orange": "Laranja", "1_red": "Vermelho", green: "Verde", light_green: "Verde-claro", yellow: "Amarelo", orange: "Laranja", red: "Vermelho" };
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaBr = (iso: string) => `${DIAS[new Date(iso.slice(0, 10) + "T12:00:00").getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const proprio = (e: EnvioMeli) => e.logistica === "me1" || (e.logistica == null && e.origem === "prazo");

/** Posição 0–1 na régua de quatro faixas; a última vai até o dobro do teto do laranja. */
function posicao(v: Variavel, valor: number, periodo: 60 | 365) {
  const [g, y, o] = limites(v, periodo);
  const bordas = [0, g, y, o, o * 2];
  const i = CORES.indexOf(cor(v, valor, periodo));
  const frac = Math.min(1, (valor - bordas[i]) / (bordas[i + 1] - bordas[i]));
  return (i + Math.max(0, frac)) / 4;
}

/** A variável que puxa a cor da conta para baixo. */
function piorVariavel(m: Record<Variavel, { valor: number; base: number }>, periodo: 60 | 365): Variavel {
  const vs: Variavel[] = ["reclamacoes", "cancelamentos", "atrasos"];
  return vs.reduce((a, b) => (posicao(b, taxa(m[b]), periodo) > posicao(a, taxa(m[a]), periodo) ? b : a));
}

function Regua({ hoje, previsto, rotulo }: { hoje: number; previsto: number; rotulo: string }) {
  const mexeu = Math.abs(previsto - hoje) > 0.002;
  return (
    <div className="termo-regua" role="img" aria-label={rotulo}>
      {CORES.map((c) => <span key={c} className={`termo-faixa termo-${c}`} />)}
      <i className="termo-marca" style={{ left: `${hoje * 100}%` }} />
      {mexeu && <i className="termo-marca termo-prevista" style={{ left: `${previsto * 100}%` }} />}
    </div>
  );
}

function Termometros({ conta, rep, envios, status }: { conta: string; rep: ReputacaoMeli | null; envios: EnvioMeli[]; status: Mapa }) {
  if (!rep) return (
    <section className="termo-conta"><h3>{conta}</h3><p className="text-[14px] text-ink-3">sem reputação nesta leitura · atualize os envios</p></section>
  );
  /* O que já saiu está na conta do Meli; a previsão olha só o que falta sair. */
  const abertos = envios.filter((e) => !e.saiu && status[e.pedido]?.s !== "entregue");
  const conta1 = (lista: EnvioMeli[]) => ({ abertos: lista.length, atrasados: lista.filter((e) => atrasado(e, status[e.pedido]?.s)).length });
  const me = conta1(abertos.filter((e) => !proprio(e)));
  const pr = conta1(abertos.filter(proprio));
  const p = prever(rep, { abertosME: me.abertos, atrasadosME: me.atrasados, abertosProprio: pr.abertos, atrasadosProprio: pr.atrasados });
  const hojeCor = corAtual(rep);
  const vHoje = piorVariavel(rep, rep.periodo);
  const vPrev = piorVariavel(p, rep.periodo);
  const medeDespacho = me.abertos > 0 || rep.atrasos.valor > 0;
  const atrasoHoje = taxa(rep.atrasos), atrasoPrev = taxa(p.atrasos);
  const folgaAtrasos = folga("atrasos", p.atrasos, rep.periodo);
  const folgaRecl = folga("reclamacoes", p.reclamacoes, rep.periodo);
  const real = rep.nivelReal ? NIVEL[rep.nivelReal] ?? rep.nivelReal : null;

  return (
    <section className="termo-conta" aria-label={`Reputação de ${conta}`}>
      <div className="termo-cabeca">
        <h3>{conta}</h3>
        <span>{rep.periodo} dias · {rep.vendas.toLocaleString("pt-BR")} vendas</span>
        {rep.protegidaAte && <span className="termo-protegida">protegida até {rep.protegidaAte.slice(8, 10)}/{rep.protegidaAte.slice(5, 7)}{real ? ` · real ${real.toLowerCase()}` : ""}</span>}
      </div>
      <div className="termo-par">
        <div className="termo">
          <p className="termo-rotulo">Reputação</p>
          <p className="termo-valor">
            <span className={`termo-txt-${hojeCor}`}>{NOME_COR[hojeCor]}</span>
            {p.corGeral !== hojeCor && <span className="termo-seta">→ <span className={`termo-txt-${p.corGeral}`}>{NOME_COR[p.corGeral]}</span></span>}
          </p>
          <Regua hoje={posicao(vHoje, taxa(rep[vHoje]), rep.periodo)} previsto={posicao(vPrev, taxa(p[vPrev]), rep.periodo)} rotulo={`Reputação ${NOME_COR[hojeCor]}, previsão ${NOME_COR[p.corGeral]}`} />
          <dl className="termo-numeros">
            <div><dt>Reclamações</dt><dd>{rep.reclamacoes.valor} · {pct(taxa(rep.reclamacoes))}{p.reclamacoes.valor !== rep.reclamacoes.valor && <b> → {pct(taxa(p.reclamacoes))}</b>}</dd></div>
            <div><dt>Canceladas</dt><dd>{rep.cancelamentos.valor} · {pct(taxa(rep.cancelamentos))}</dd></div>
            {pr.abertos > 0 && <div><dt>Cabem</dt><dd>{folgaRecl == null ? "—" : `${folgaRecl} no ${NOME_COR[cor("reclamacoes", taxa(p.reclamacoes), rep.periodo)].toLowerCase()}`}</dd></div>}
          </dl>
        </div>
        <div className="termo">
          <p className="termo-rotulo">Envios</p>
          {medeDespacho ? <>
            <p className="termo-valor">
              <span className={`termo-txt-${cor("atrasos", atrasoHoje, rep.periodo)}`}>{pct(atrasoHoje)}</span>
              {Math.abs(atrasoPrev - atrasoHoje) > 0.005 && <span className="termo-seta">→ <span className={`termo-txt-${p.corEnvios}`}>{pct(atrasoPrev)}</span></span>}
            </p>
            <Regua hoje={posicao("atrasos", atrasoHoje, rep.periodo)} previsto={posicao("atrasos", atrasoPrev, rep.periodo)} rotulo={`Atraso no despacho ${pct(atrasoHoje)}, previsão ${pct(atrasoPrev)}`} />
            <dl className="termo-numeros">
              <div><dt>Atrasos</dt><dd>{rep.atrasos.valor}{me.atrasados > 0 && <b> + {me.atrasados}</b>}</dd></div>
              <div><dt>Cabem</dt><dd>{folgaAtrasos == null ? "—" : `${folgaAtrasos} no ${NOME_COR[p.corEnvios].toLowerCase()}`}</dd></div>
            </dl>
          </> : <p className="mt-2 text-[14px] text-ink-3">não medido · envio próprio</p>}
        </div>
      </div>
    </section>
  );
}

type Chave = "dias" | "entrega" | "cliente" | "produto" | "meli" | "status";
const FILTROS = ["Em aberto", "Atrasados", "Sem status", ...Object.values(STATUS_MANUAL), "Todos"] as const;
/** A API manda com -04:00; a tela fala em horário de Brasília. */
const brasilia = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString();
const dataHora = (iso: string) => `${diaBr(brasilia(iso))} · ${brasilia(iso).slice(11, 16)}`;
/** Saído é o Meli quem diz: despachado (com data) ou entregue. */
const automatico = (e: EnvioMeli): StatusManual | undefined => e.meli?.status ?? (e.saiu ? "despachado" : undefined);

const SEM_STATUS: Mapa = {};

export function Painel({ envios, reputacao, status: inicial = SEM_STATUS, contas }: { envios: EnvioMeli[]; reputacao: NonNullable<DadosEnvios["reputacao"]>; status?: Mapa; contas: string[] }) {
  const [status, setStatus] = React.useState<Mapa>(inicial);
  const [salvando, setSalvando] = React.useState<number | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [filtro, setFiltro] = React.useState<(typeof FILTROS)[number]>("Em aberto");
  const [ordem, setOrdem] = React.useState<{ chave: Chave; asc: boolean }>({ chave: "dias", asc: true });
  React.useEffect(() => setStatus(inicial), [inicial]);

  async function mudar(e: EnvioMeli, s: StatusManual | "") {
    const antes = status;
    const novo = { ...status };
    if (s) novo[e.pedido] = { s, em: new Date().toISOString(), por: null };
    else delete novo[e.pedido];
    setStatus(novo);
    setSalvando(e.pedido);
    setErro(null);
    try {
      const r = await gerizoFetch("/api/pedidos/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pedido: e.pedido, status: s || null }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro ?? "não salvou");
    } catch (x) {
      setStatus(antes);
      setErro(`Pedido ${e.venda ?? e.pedido}: ${x instanceof Error ? x.message : "não salvou"}`);
    } finally {
      setSalvando(null);
    }
  }

  const s = (e: EnvioMeli) => status[e.pedido]?.s;
  const ef = (e: EnvioMeli) => automatico(e) ?? s(e);
  const passa = (e: EnvioMeli, f: (typeof FILTROS)[number]) =>
    f === "Todos" ? true : f === "Em aberto" ? !e.saiu : f === "Atrasados" ? atrasado(e, s(e)) : f === "Sem status" ? !ef(e) : Boolean(ef(e) && STATUS_MANUAL[ef(e)!] === f);
  const contagem = (f: (typeof FILTROS)[number]) => envios.filter((e) => passa(e, f)).length;
  const val = (e: EnvioMeli): string | number =>
    ordem.chave === "dias" ? (e.limite ?? "9999") : ordem.chave === "entrega" ? (e.entrega ?? "9999") : ordem.chave === "cliente" ? (e.cliente ?? e.comprador ?? "") : ordem.chave === "produto" ? e.itens.map((i) => i.titulo).join(" ") : ordem.chave === "meli" ? e.situacao : (ef(e) ? STATUS_MANUAL[ef(e)!] : "~");
  const lista = envios
    .filter((e) => passa(e, filtro))
    .sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * (ordem.asc ? 1 : -1); });
  const colunas: { chave: Chave; rotulo: string; w: string }[] = [
    { chave: "dias", rotulo: "Expedir até", w: "w-[130px]" },
    { chave: "cliente", rotulo: "Pedido", w: "w-[200px]" },
    { chave: "produto", rotulo: "Produto", w: "min-w-[240px]" },
    { chave: "entrega", rotulo: "Entrega", w: "w-[110px]" },
    { chave: "meli", rotulo: "No Meli", w: "w-[150px]" },
    { chave: "status", rotulo: "Status", w: "w-[200px]" },
  ];

  const seletor = (e: EnvioMeli) => automatico(e) ? (
    <p className={cn("painel-auto", `painel-s-${automatico(e)}`)}>
      {STATUS_MANUAL[automatico(e)!]}
      <span>{e.meli?.entregueEm ? dataHora(e.meli.entregueEm) : e.meli?.despachadoEm ? dataHora(e.meli.despachadoEm) : e.situacao} · Meli</span>
    </p>
  ) : (
    <select
      aria-label={`Status do pedido ${e.venda ?? e.pedido}`}
      value={s(e) ?? ""}
      disabled={salvando === e.pedido}
      onChange={(x) => void mudar(e, x.target.value as StatusManual | "")}
      className={cn("painel-status", s(e) && `painel-s-${s(e)}`)}
    >
      <option value="">Sem status</option>
      {Object.entries(STATUS_MANUAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
  const prazo = (e: EnvioMeli) => {
    if (e.saiu) return (
      <div>
        <p className="text-[15px] font-semibold leading-5 text-up">{e.meli?.despachadoEm ? diaBr(brasilia(e.meli.despachadoEm)) : "Saiu"}</p>
        <p className="mt-0.5 text-[12px] text-ink-3">{e.meli?.despachadoEm ? `enviado às ${brasilia(e.meli.despachadoEm).slice(11, 16)}` : e.situacao.toLowerCase()}</p>
      </div>
    );
    const late = atrasado(e, s(e));
    return (
      <div>
        <p className={cn("text-[15px] font-semibold leading-5", late ? "text-down" : e.dias === 0 ? "text-warn" : "text-ink")}>{e.limite ? diaBr(e.limite) : "Sem prazo"}{e.limite && e.origem === "canal" && <span className="font-normal text-ink-3"> · {e.limite.slice(11, 13)}h</span>}</p>
        <p className={cn("mt-0.5 text-[12px]", late ? "text-down" : "text-ink-3")}>{e.saiu ? "saiu" : e.dias == null ? "" : e.dias < 0 ? `${-e.dias} ${e.dias === -1 ? "dia" : "dias"} atrasado` : e.dias === 0 ? "hoje" : `em ${e.dias} ${e.dias === 1 ? "dia" : "dias"}`}</p>
      </div>
    );
  };
  const cliente = (e: EnvioMeli) => (
    <div className="min-w-0">
      <p className="text-[14px] font-medium leading-5 text-ink [overflow-wrap:anywhere]">{e.cliente ?? e.comprador ?? "—"}</p>
      <p className="num mt-0.5 text-[12px] text-ink-3 [overflow-wrap:anywhere]">{e.venda ?? e.pedido}{contas.length > 1 && ` · ${/prazo/i.test(e.conta) ? "A prazo" : /são paulo/i.test(e.conta) ? "São Paulo" : e.conta}`}</p>
    </div>
  );
  const produto = (e: EnvioMeli) => (
    <div className="flex min-w-0 flex-col gap-1">
      {e.itens.map((i, k) => <p key={k} className="text-[14px] leading-5 text-ink [overflow-wrap:anywhere]"><span className="num font-semibold">{i.quantidade}×</span> {i.titulo}</p>)}
    </div>
  );

  return (
    <div className="painel">
      <div className="termo-lista">
        {reputacao.length ? reputacao.map((r) => (
          <Termometros key={r.contaId} conta={r.conta} rep={r.rep} envios={envios.filter((e) => e.contaId === r.contaId)} status={status} />
        )) : <p className="text-[14px] text-ink-3">sem reputação nesta leitura · atualize os envios</p>}
      </div>

      {erro && <p role="alert" className="text-[14px] text-down">{erro}</p>}

      <div className="painel-filtros" role="group" aria-label="Filtrar por status">
        {FILTROS.map((f) => {
          const n = contagem(f);
          return (
            <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)} className={cn(f === "Atrasados" && n > 0 && "is-alerta")}>
              {f} <span className="num">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="painel-tabela hidden md:block" role="region" aria-label="Pedidos" tabIndex={0}>
        <table className="w-full min-w-[980px] table-fixed text-left text-[14px]">
          <thead><tr>{colunas.map((c) => (
            <th key={c.chave} scope="col" className={c.w} aria-sort={ordem.chave === c.chave ? (ordem.asc ? "ascending" : "descending") : "none"}>
              <button type="button" onClick={() => setOrdem((o) => ({ chave: c.chave, asc: o.chave === c.chave ? !o.asc : true }))}>
                {c.rotulo}{ordem.chave === c.chave && (ordem.asc ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />)}
              </button>
            </th>
          ))}</tr></thead>
          <tbody>{lista.map((e) => (
            <tr key={`${e.conta}-${e.pedido}`} className={cn(atrasado(e, s(e)) && "is-atrasado")}>
              <td>{prazo(e)}</td>
              <td>{cliente(e)}</td>
              <td>{produto(e)}</td>
              <td className="text-ink-2">{e.entrega ? diaBr(e.entrega) : <span className="text-ink-3">—</span>}</td>
              <td className="text-[13px] leading-5 text-ink-2">{e.situacao}</td>
              <td>{seletor(e)}</td>
            </tr>
          ))}</tbody>
        </table>
        {!lista.length && <p className="p-5 text-[14px] text-ink-3">Nada neste filtro.</p>}
      </div>

      <div className="painel-cartoes md:hidden">
        {lista.map((e) => (
          <article key={`${e.conta}-${e.pedido}`} className={cn(atrasado(e, s(e)) && "is-atrasado")}>
            <div className="flex items-start justify-between gap-3">{prazo(e)}<div className="text-right"><p className="text-[12px] text-ink-3">Entrega</p><p className="text-[14px] text-ink-2">{e.entrega ? diaBr(e.entrega) : "—"}</p></div></div>
            {cliente(e)}
            {produto(e)}
            <p className="text-[12px] text-ink-3">No Meli: {e.situacao}</p>
            {seletor(e)}
          </article>
        ))}
        {!lista.length && <p className="p-5 text-[14px] text-ink-3">Nada neste filtro.</p>}
      </div>
    </div>
  );
}
