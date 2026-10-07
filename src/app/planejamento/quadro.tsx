"use client";
import { useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  GripVertical,
  Plus,
  X,
} from "lucide-react";
import {
  type Item,
  type Dados,
  type Status,
  ETAPAS,
  formatarData,
} from "@/lib/planejamento/modelo";
import { COLUNAS, corDoTipo, acaoDaCampanha } from "@/lib/planejamento/estudio";
import { nomeCanais } from "./componentes";

export function Cartao({
  item,
  dados,
  abrir,
  mover,
  opcoes,
  ocupado,
  arrastavel = true,
}: {
  item: Item;
  dados: Dados;
  abrir: (i: Item) => void;
  mover?: (valor: string) => void;
  opcoes?: { id: string; nome: string }[];
  ocupado: boolean;
  arrastavel?: boolean;
}) {
  const cor = corDoTipo(item.tipo),
    feitas = item.detalhes.checklist.filter((c) => c.feito).length;
  const pai = dados.itens.find((i) => i.id === item.campanha_id);
  return (
    <article
      className={`st-card ${item.status === "Concluída" ? "is-done" : ""}`}
      style={{ "--card-accent": cor } as CSSProperties}
      draggable={arrastavel && !ocupado}
      onDragStart={(ev) => {
        ev.dataTransfer.setData("application/x-planejamento", item.id);
        ev.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="st-card-top">
        <span className="st-type">
          <span />
          {item.natureza === "campanha" ? "Campanha" : item.tipo}
        </span>
        {arrastavel && (
          <GripVertical size={15} className="st-grip" aria-hidden="true" />
        )}
      </div>
      <button className="st-card-open" onClick={() => abrir(item)}>
        <h3>{item.titulo}</h3>
        {pai && <span className="st-parent">{pai.titulo}</span>}
        {item.detalhes.objetivo && <p>{item.detalhes.objetivo}</p>}
      </button>
      {item.skus.length > 0 && (
        <div className="st-product-chips">
          {item.skus.slice(0, 2).map((s) => (
            <span key={s}>{s}</span>
          ))}
          {item.skus.length > 2 && <span>+{item.skus.length - 2}</span>}
        </div>
      )}
      {(item.canais.length > 0 || item.contas.length > 0) && (
        <div className="st-card-channel">{nomeCanais(item, dados)}</div>
      )}
      <div className="st-card-bottom">
        <span className="st-date">
          <CalendarDays size={12} />
          {formatarData(item.inicio)}
          {item.fim !== item.inicio ? ` — ${formatarData(item.fim)}` : ""}
        </span>
        <div className="st-card-meta">
          {item.detalhes.checklist.length > 0 && (
            <span title="Preparativos concluídos">
              <CheckCheck size={13} />
              {feitas}/{item.detalhes.checklist.length}
            </span>
          )}
          {item.detalhes.responsavel && (
            <span className="st-avatar" title={item.detalhes.responsavel}>
              {item.detalhes.responsavel
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((n) => n[0])
                .join("")
                .toUpperCase()}
            </span>
          )}
        </div>
      </div>
      {mover && opcoes && (
        <label className="st-move-select">
          <span>Mover para</span>
          <select
            aria-label={`Mover ${item.titulo} para`}
            value=""
            disabled={ocupado}
            onChange={(ev) => {
              if (ev.target.value) mover(ev.target.value);
            }}
          >
            <option value="">Escolher coluna…</option>
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
}

export default function Quadro({
  itens,
  dados,
  campanha,
  hoje,
  abrir,
  criar,
  atualizar,
  ocupado,
  novaCampanha,
}: {
  itens: Item[];
  dados: Dados;
  campanha: Item | null;
  hoje: string;
  abrir: (i: Item) => void;
  criar: (i: Item) => Promise<boolean>;
  atualizar: (i: Item) => Promise<boolean>;
  ocupado: boolean;
  novaCampanha: () => void;
}) {
  const [agrupar, setAgrupar] = useState("andamento"),
    [formulario, setFormulario] = useState<string | null>(null),
    [titulo, setTitulo] = useState(""),
    [sobre, setSobre] = useState<string | null>(null),
    [dragId, setDragId] = useState<string | null>(null);
  const acoes = itens.filter((i) => i.natureza === "acao");
  const colunas =
    agrupar === "andamento"
      ? [
          ...COLUNAS,
          ...(acoes.some((i) => i.status === "Cancelada")
            ? [
                {
                  id: "Cancelada",
                  nome: "Canceladas",
                  cor: "#9295a1",
                  dica: "Planos que mudaram",
                },
              ]
            : []),
        ]
      : [
          ...ETAPAS,
          ...new Set(
            acoes
              .map((i) => i.etapa || "Sem etapa")
              .filter((e) => !ETAPAS.includes(e)),
          ),
        ].map((e, n) => ({
          id: e,
          nome: e,
          cor: COLUNAS[n % COLUNAS.length].cor,
          dica: "",
        }));
  const colunaDe = (i: Item) =>
    agrupar === "andamento" ? i.status : i.etapa || "Sem etapa";
  const base = [...acoes].sort(
    (a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id),
  );
  const ordemDe = (i: Item) =>
    i.detalhes.ordem ?? base.findIndex((a) => a.id === i.id) * 1024;
  const ordenados = [...acoes].sort(
    (a, b) => ordemDe(a) - ordemDe(b) || a.id.localeCompare(b.id),
  );
  async function mover(id: string, coluna: string) {
    setSobre(null);
    setDragId(null);
    const i = dados.itens.find((i) => i.id === id);
    if (!i || ocupado || colunaDe(i) === coluna) return;
    const ordem = Math.max(Date.now(), ...acoes.map(ordemDe)) + 1;
    await atualizar({
      ...i,
      ...(agrupar === "andamento"
        ? { status: coluna as Status }
        : { etapa: coluna === "Sem etapa" ? "" : coluna }),
      detalhes: { ...i.detalhes, ordem },
    });
  }
  async function adicionar(coluna: string) {
    if (!titulo.trim() || ocupado) return;
    const i = acaoDaCampanha(campanha?.inicio ?? hoje, campanha);
    const sucesso = await criar({
      ...i,
      titulo: titulo.trim(),
      ...(agrupar === "andamento"
        ? { status: coluna as Status }
        : { etapa: coluna === "Sem etapa" ? "" : coluna }),
      tipo: "Personalizada",
      detalhes: { ...i.detalhes, ordem: Date.now() },
    });
    if (sucesso) {
      setTitulo("");
      setFormulario(null);
    }
  }
  return (
    <section className="st-board-section">
      <div className="st-view-caption">
        <p>
          <span className="st-live-dot" />
          {acoes.length
            ? "Arraste uma ação para mudar de coluna. Clique para desenvolver a ideia."
            : "Comece com uma frase. O resto do plano pode vir depois."}
        </p>
        <label>
          Organizar por{" "}
          <select
            value={agrupar}
            onChange={(e) => setAgrupar(e.target.value)}
            aria-label="Organizar quadro"
          >
            <option value="andamento">Andamento</option>
            <option value="etapa">Etapa da campanha</option>
          </select>
        </label>
      </div>
      {!dados.itens.length && (
        <div className="st-welcome">
          <div className="st-welcome-art" aria-hidden="true">
            <div>
              <span>Uma boa ideia</span>
              <i />
              <i />
            </div>
            <div>
              <span>Um próximo passo</span>
              <i />
              <b>Pronta para crescer ↗</b>
            </div>
          </div>
          <div>
            <span className="st-kicker">SEU ESPAÇO DE CRIAÇÃO</span>
            <h2>
              Campanhas que começam
              <br />
              com uma ideia.
            </h2>
            <p>
              Escolha um roteiro para sua primeira campanha ou solte uma ideia
              no quadro abaixo.
            </p>
            <button className="st-primary" onClick={novaCampanha}>
              Criar minha primeira campanha <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
      )}
      <div
        className="st-board"
        onDragStart={(e) => {
          const id = e.dataTransfer.getData("application/x-planejamento");
          if (id) setDragId(id);
        }}
        onDragEnd={() => {
          setSobre(null);
          setDragId(null);
        }}
      >
        {colunas.map((c) => (
          <section
            key={c.id}
            className={`st-column ${sobre === c.id ? "is-over" : ""}`}
            style={{ "--lane-color": c.cor } as CSSProperties}
            onDragOver={(ev) => {
              if (
                !ocupado &&
                ev.dataTransfer.types.includes("application/x-planejamento")
              ) {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = "move";
                setSobre(c.id);
              }
            }}
            onDrop={(ev) => {
              ev.preventDefault();
              void mover(
                ev.dataTransfer.getData("application/x-planejamento"),
                c.id,
              );
            }}
          >
            <header>
              <div>
                <span className="st-column-dot" />
                <h3>{c.nome}</h3>
                <span className="st-column-count">
                  {acoes.filter((i) => colunaDe(i) === c.id).length}
                </span>
              </div>
              <button
                className="st-icon"
                aria-label={`Adicionar ação em ${c.nome}`}
                onClick={() => {
                  setFormulario(c.id);
                  setTitulo("");
                }}
                disabled={ocupado}
              >
                <Plus size={17} />
              </button>
            </header>
            <div className="st-column-cards">
              {ordenados
                .filter((i) => colunaDe(i) === c.id)
                .map((i) => (
                  <div
                    key={i.id}
                    className={dragId === i.id ? "st-dragging" : ""}
                  >
                    <Cartao
                      item={i}
                      dados={dados}
                      abrir={abrir}
                      ocupado={ocupado}
                      opcoes={colunas}
                      mover={(valor) => void mover(i.id, valor)}
                    />
                  </div>
                ))}
              {formulario === c.id ? (
                <form
                  className="st-quick-add"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    void adicionar(c.id);
                  }}
                >
                  <textarea
                    autoFocus
                    rows={2}
                    maxLength={160}
                    placeholder="O que vamos fazer?"
                    aria-label={`Nova ação em ${c.nome}`}
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void adicionar(c.id);
                      }
                      if (e.key === "Escape") setFormulario(null);
                    }}
                  />
                  <div>
                    <button
                      className="st-primary"
                      disabled={ocupado || !titulo.trim()}
                    >
                      Adicionar
                    </button>
                    <button
                      type="button"
                      className="st-icon"
                      aria-label="Cancelar nova ação"
                      onClick={() => setFormulario(null)}
                    >
                      <X size={17} />
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  className="st-add-card"
                  disabled={ocupado}
                  onClick={() => {
                    setFormulario(c.id);
                    setTitulo("");
                  }}
                >
                  <Plus size={14} /> Adicionar ideia
                </button>
              )}
              {!acoes.some((i) => colunaDe(i) === c.id) &&
                formulario !== c.id && (
                  <p className="st-column-hint">
                    {c.dica || "Arraste uma ação para esta etapa"}
                  </p>
                )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
