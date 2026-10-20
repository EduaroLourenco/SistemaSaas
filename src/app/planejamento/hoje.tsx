"use client";
import { type Item, type Dados } from "@/lib/planejamento/modelo";

/**
 * O que está no ar hoje, e o que ficou para trás.
 *
 * Antes, abrir /planejamento sem campanha selecionada dava três frases —
 * "VISÃO DO SEU PLANEJAMENTO", "Seu próximo movimento", "Um espaço para
 * conectar ideias, produtos e canais" — e nenhum número. A pergunta que o
 * Eduardo faz ao abrir isso no telefone, andando pela operação, é outra: o
 * que roda hoje, e o que eu deixei passar.
 *
 * ── Por que a janela, e não o status ──
 *
 * Nada no sistema promove "Planejada" para "Em andamento" quando o dia
 * chega. As doze ações da Oferta Relâmpago estão todas gravadas como
 * Planejada, inclusive a de hoje. Filtrar por status esconderia justamente
 * as que importam, então o critério é a janela de datas cobrir hoje — e
 * "Concluída"/"Cancelada" saem porque essas duas são decisão de alguém.
 */

const fechada = (i: Item) => i.status === "Concluída" || i.status === "Cancelada";
const dia = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const dias = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** O prazo em palavras: "até 21/10" não diz se é hoje. */
function prazo(i: Item, hoje: string) {
  if (i.fim < hoje) return { txt: `atrasada desde ${dia(i.fim)}`, tom: "down" };
  const resta = dias(hoje, i.fim);
  if (resta === 0) return { txt: "termina hoje", tom: "warn" };
  if (resta === 1) return { txt: "termina amanhã", tom: "warn" };
  return { txt: `até ${dia(i.fim)}`, tom: "" };
}

export default function Hoje({
  dados,
  hoje,
  abrir,
}: {
  dados: Dados;
  hoje: string;
  abrir: (i: Item) => void;
}) {
  const itens = dados.itens;
  const acoes = itens.filter((i) => i.natureza === "acao");
  const noAr = acoes.filter((i) => i.inicio <= hoje && i.fim >= hoje && !fechada(i));
  const atrasadas = itens.filter((i) => i.fim < hoje && !fechada(i));
  const correndo = itens.filter(
    (i) => i.natureza === "campanha" && i.inicio <= hoje && i.fim >= hoje && !fechada(i),
  );
  const chegando = acoes.filter((i) => i.inicio > hoje && dias(hoje, i.inicio) <= 7);

  const linha = (i: Item) => {
    const p = prazo(i, hoje);
    const c = itens.find((x) => x.id === i.campanha_id);
    const n = i.skus.length;
    return (
      <li key={i.id}>
        <button type="button" onClick={() => abrir(i)}>
          <i style={{ background: c?.cor ?? "var(--line-2)" }} />
          <b>{i.titulo}</b>
          <span className="hj-meta">{c?.titulo ?? "solta"}</span>
          <span className="hj-num">{n ? `${n} SKU${n > 1 ? "s" : ""}` : "sem SKU"}</span>
          <span className={`hj-prazo ${p.tom}`}>{p.txt}</span>
        </button>
      </li>
    );
  };

  return (
    <section className="hj">
      <div className="hj-cab">
        <div className="hj-big">
          <b>{noAr.length}</b>
          <span>no ar hoje</span>
        </div>
        <div className="hj-pills">
          <span className="hj-pill">
            <b>{correndo.length}</b> campanhas correndo
          </span>
          {atrasadas.length > 0 && (
            <span className="hj-pill ruim">
              <b>{atrasadas.length}</b> atrasadas
            </span>
          )}
          <span className="hj-pill">
            <b>{chegando.length}</b> em 7 dias
          </span>
        </div>
      </div>
      {atrasadas.length > 0 && (
        <>
          <div className="hj-secao ruim">ATRASADAS</div>
          <ul className="hj-lista">{atrasadas.map(linha)}</ul>
        </>
      )}
      <div className="hj-secao">HOJE, {dia(hoje)}</div>
      {noAr.length ? (
        <ul className="hj-lista">{noAr.map(linha)}</ul>
      ) : (
        <p className="hj-vazio">
          {acoes.length ? "nenhuma ação hoje" : "nenhuma ação cadastrada"}
        </p>
      )}
    </section>
  );
}
