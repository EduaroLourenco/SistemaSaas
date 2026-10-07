"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Compass,
} from "lucide-react";
import {
  type Dados,
  type Item,
  diasEntre,
  formatarData,
} from "@/lib/planejamento/modelo";
import { prioridades } from "@/lib/planejamento/prioridades";
import { estrategiaDe } from "@/lib/planejamento/estrategia";
import { oportunidades, type Oportunidade } from "@/lib/planejamento/sazonal";

export default function Foco({
  dados,
  itens,
  hoje,
  abrir,
  planejar,
}: {
  dados: Dados;
  itens: Item[];
  hoje: string;
  abrir: (i: Item) => void;
  planejar: (o: Oportunidade) => void;
}) {
  const [grupo, setGrupo] = useState("Tudo"),
    [limite, setLimite] = useState(12);
  const ids = new Set(itens.map((i) => i.id));
  const todas = prioridades(dados, hoje).filter((p) => ids.has(p.item.id));
  const lista = todas.filter((p) => grupo === "Tudo" || p.grupo === grupo);
  const ano = Number(hoje.slice(0, 4));
  const datas = [...oportunidades(ano), ...oportunidades(ano + 1)]
    .filter(
      (o) =>
        o.categoria === "Comércio" &&
        diasEntre(hoje, o.data) >= 0 &&
        diasEntre(hoje, o.data) <= 60,
    )
    .slice(0, 4);
  const aprendizados = itens
    .filter(
      (i) =>
        i.status !== "Cancelada" &&
        estrategiaDe(i).fechamento.proximoPasso.trim(),
    )
    .sort((a, b) => b.fim.localeCompare(a.fim))
    .slice(0, 3);
  return (
    <section className="pl-focus">
      <div className="pl-focus-heading">
        <div>
          <span className="pl-eyebrow">
            <Compass size={15} /> ONDE FOCAR AGORA
          </span>
          <h2>O próximo passo, com um motivo.</h2>
          <p>
            Preparação, execução e aprendizados a partir dos registros da
            operação. Referência: {formatarData(hoje)}. Os filtros acima se
            aplicam aos planejamentos; oportunidades sazonais são gerais.
          </p>
        </div>
        <span className="pl-badge">{todas.length} ponto(s) para revisar</span>
      </div>
      <div className="pl-focus-layout">
        <div>
          <div className="pl-chips pl-focus-filters">
            {["Tudo", "Preparar", "Executar", "Coordenar", "Aprender"].map(
              (g) => (
                <button
                  type="button"
                  key={g}
                  aria-pressed={g === grupo}
                  className={`pl-chip ${g === grupo ? "selected" : ""}`}
                  onClick={() => {
                    setGrupo(g);
                    setLimite(12);
                  }}
                >
                  {g}{" "}
                  <span>
                    {g === "Tudo"
                      ? todas.length
                      : todas.filter((p) => p.grupo === g).length}
                  </span>
                </button>
              ),
            )}
          </div>
          <div className="pl-priorities">
            {lista.slice(0, limite).map((p, idx) => (
              <article className="pl-priority" key={p.id}>
                <div className="pl-priority-number">
                  {String(idx + 1).padStart(2, "0")}
                </div>
                <div>
                  <div className="pl-between">
                    <span className="pl-eyebrow">{p.grupo}</span>
                    <small>
                      {formatarData(p.item.inicio)} — {formatarData(p.item.fim)}
                    </small>
                  </div>
                  <h3>{p.titulo}</h3>
                  <p>{p.motivo}</p>
                  <p className="pl-next-step">{p.passo}</p>
                  <button className="pl-link" onClick={() => abrir(p.item)}>
                    Abrir {p.item.natureza === "acao" ? "ação" : "campanha"}{" "}
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!lista.length && (
            <div className="pl-empty">
              <CheckCircle2 size={30} />
              <h3>Nenhuma pendência identificada neste recorte</h3>
              <p>
                {dados.itens.length
                  ? "Revise os filtros ou continue planejando. A execução depende dos registros feitos pela equipe."
                  : "Crie uma campanha ou use uma oportunidade ao lado. Os próximos passos aparecerão aqui."}
              </p>
            </div>
          )}
          {lista.length > limite && (
            <button className="pl-btn" onClick={() => setLimite((l) => l + 12)}>
              Mostrar mais ({lista.length - limite})
            </button>
          )}
        </div>
        <aside className="pl-focus-aside">
          <section className="pl-context">
            <h3>
              <CalendarDays size={17} /> No horizonte
            </h3>
            <p className="pl-muted">
              Datas comerciais nos próximos 60 dias. A participação em campanhas
              do marketplace depende das condições do canal.
            </p>
            {datas.map((o) => (
              <div className="pl-horizon" key={o.id}>
                <small>
                  {formatarData(o.data)} · em {diasEntre(hoje, o.data)} dia(s)
                </small>
                <strong>{o.nome}</strong>
                <button className="pl-link" onClick={() => planejar(o)}>
                  Preparar campanha <ArrowUpRight size={13} />
                </button>
              </div>
            ))}
            {!datas.length && (
              <p className="pl-muted">
                Explore a biblioteca para encontrar datas de nicho.
              </p>
            )}
          </section>
          <section className="pl-context">
            <h3>
              <BookOpen size={17} /> Para a próxima vez
            </h3>
            {aprendizados.map((i) => (
              <button
                key={i.id}
                className="pl-learning pl-learning-button"
                onClick={() => abrir(i)}
              >
                <small>
                  {estrategiaDe(i).fechamento.decisao || "Aprendizado"}
                </small>
                <strong>{i.titulo}</strong>
                <p>{estrategiaDe(i).fechamento.proximoPasso}</p>
              </button>
            ))}
            {!aprendizados.length && (
              <p className="pl-muted">
                Os aprendizados registrados no fechamento aparecerão aqui e nas
                próximas ações dos mesmos produtos.
              </p>
            )}
          </section>
          <p className="pl-note">
            Sugestões baseadas em datas, tarefas e registros. Não estimam
            estoque, elegibilidade, lucro ou desempenho de anúncios.
          </p>
        </aside>
      </div>
    </section>
  );
}
