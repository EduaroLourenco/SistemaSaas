"use client";
import { type Item, type Dados, somarDias } from "@/lib/planejamento/modelo";
import { ROTULO_GRUPO, type PromoCanal } from "@/lib/planejamento/canal";

/**
 * O que está no ar hoje: primeiro o que o canal confirma, depois o plano.
 *
 * A situação dos itens já chega calculada pela data (ver `situacaoDoItem`).
 * Sobra como pendência só o rascunho vencido, que depende de alguém decidir.
 */

const dia = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

function prazo(fim: string, hoje: string) {
  if (fim === hoje) return { txt: "termina hoje", tom: "warn" };
  if (fim === somarDias(hoje, 1)) return { txt: "termina amanhã", tom: "warn" };
  return { txt: `até ${dia(fim)}`, tom: "" };
}

const qtd = (p: PromoCanal) => (p.anuncios == null ? "ativo" : String(p.anuncios));

export default function Hoje({
  dados,
  hoje,
  abrir,
  abrirPromo,
}: {
  dados: Dados;
  hoje: string;
  abrir: (i: Item) => void;
  abrirPromo: (id: string) => void;
}) {
  const itens = dados.itens;
  const noAr = dados.noCanal.filter((p) => p.situacao === "no-ar");
  const relampagos = noAr.filter((p) => p.grupo === "relampago");
  const automaticas = noAr.filter((p) => p.grupo === "automatica");
  const campanhas = noAr.filter((p) => p.grupo !== "relampago" && p.grupo !== "automatica");
  const limite = somarDias(hoje, 7);
  const proximos = dados.noCanal
    .filter((p) => p.grupo === "relampago" && p.situacao === "agendada" && p.dia <= limite)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const acoes = itens.filter((i) => i.natureza === "acao");
  const doPlano = acoes.filter(
    (i) => i.inicio <= hoje && i.fim >= hoje && i.status !== "Concluída" && i.status !== "Cancelada",
  );
  const chegando = acoes.filter((i) => i.inicio > hoje && i.inicio <= limite && i.status !== "Cancelada");
  const vencidos = itens.filter((i) => i.status === "Rascunho" && i.fim < hoje);
  const leitura = dados.noCanal.map((p) => p.lidoEm).sort().at(-1);

  const cartao = (p: PromoCanal) => {
    const t = prazo(p.diaFim, hoje);
    return (
      <li key={p.id}>
        <button type="button" className={`hj-card ${p.grupo}`} onClick={() => abrirPromo(p.id)}>
          <span className="hj-tag">{ROTULO_GRUPO[p.grupo]}</span>
          <b>{p.nome}</b>
          <span className="hj-card-num">
            <strong>{qtd(p)}</strong>
            {p.anuncios != null && " anúncios"}
          </span>
          <span className={`hj-prazo ${p.grupo === "relampago" ? "warn" : t.tom}`}>
            {p.grupo === "relampago" ? `até ${hora(p.fim)}` : t.txt}
          </span>
        </button>
      </li>
    );
  };

  const linha = (i: Item, txt: string, tom = "") => {
    const c = itens.find((x) => x.id === i.campanha_id);
    const n = i.skus.length;
    return (
      <li key={i.id}>
        <button type="button" onClick={() => abrir(i)}>
          <i style={{ background: c?.cor ?? i.cor }} />
          <b>{i.titulo}</b>
          <span className="hj-meta">{c?.titulo ?? i.status}</span>
          <span className="hj-num">{n ? `${n} SKU${n > 1 ? "s" : ""}` : "sem SKU"}</span>
          <span className={`hj-prazo ${tom}`}>{txt}</span>
        </button>
      </li>
    );
  };

  return (
    <section className="hj">
      <div className="hj-cab">
        <div className="hj-big">
          <b>{relampagos.length + campanhas.length}</b>
          <span>promoções no ar</span>
        </div>
        <div className="hj-pills">
          <span className="hj-pill">
            <b>{relampagos.reduce((s, p) => s + (p.anuncios ?? 0), 0)}</b> anúncios em relâmpago
          </span>
          <span className="hj-pill">
            <b>{automaticas.length}</b> automáticas
          </span>
          <span className="hj-pill">
            <b>{doPlano.length}</b> ações do plano
          </span>
        </div>
      </div>

      {relampagos.length > 0 && (
        <>
          <h3 className="hj-secao">Relâmpago agora</h3>
          <ul className="hj-cards">{relampagos.map(cartao)}</ul>
        </>
      )}

      <h3 className="hj-secao">
        No Mercado Livre
        {leitura && <small>leitura {new Date(leitura).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>}
      </h3>
      {campanhas.length ? (
        <ul className="hj-cards">{campanhas.map(cartao)}</ul>
      ) : (
        <p className="hj-vazio">nenhuma campanha na última leitura</p>
      )}
      {automaticas.length > 0 && (
        <details className="hj-mais">
          <summary>Automáticas do Meli · {automaticas.length}</summary>
          <ul className="hj-cards">{automaticas.map(cartao)}</ul>
        </details>
      )}

      {proximos.length > 0 && (
        <>
          <h3 className="hj-secao">Próximos relâmpagos</h3>
          <ul className="hj-dias">
            {proximos.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => abrirPromo(p.id)}>
                  <b>{dia(p.dia)}</b>
                  <span>{qtd(p)} anúncios</span>
                  <small>{p.nome}</small>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="hj-secao">No plano hoje</h3>
      {doPlano.length ? (
        <ul className="hj-lista">
          {doPlano.map((i) => {
            const p = prazo(i.fim, hoje);
            return linha(i, p.txt, p.tom);
          })}
        </ul>
      ) : (
        <p className="hj-vazio">nenhuma ação hoje</p>
      )}

      {chegando.length > 0 && (
        <>
          <h3 className="hj-secao">Próximos 7 dias</h3>
          <ul className="hj-lista">{chegando.map((i) => linha(i, `começa ${dia(i.inicio)}`))}</ul>
        </>
      )}

      {vencidos.length > 0 && (
        <details className="hj-mais">
          <summary>Rascunhos vencidos · {vencidos.length}</summary>
          <ul className="hj-lista">{vencidos.map((i) => linha(i, `venceu ${dia(i.fim)}`, "down"))}</ul>
        </details>
      )}
    </section>
  );
}
