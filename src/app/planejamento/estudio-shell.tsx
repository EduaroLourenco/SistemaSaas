"use client";
import { useState, type ReactNode, type CSSProperties } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Compass,
  FolderOpen,
  LayoutGrid,
  Layers,
  Network,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  X,
  Undo2,
  Trash2,
} from "lucide-react";
import { type Dados, type Item, formatarData } from "@/lib/planejamento/modelo";
import type { Oportunidade } from "@/lib/planejamento/sazonal";
import Hoje from "./hoje";

/** Quanto falta da campanha, em palavras. */
function restante(c: Item, hoje: string) {
  const d = (a: string, b: string) =>
    Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
  if (c.fim < hoje) return `encerrada há ${d(c.fim, hoje)} dias`;
  if (c.inicio > hoje) return `começa em ${d(hoje, c.inicio)} dias`;
  const resta = d(hoje, c.fim);
  return resta === 0 ? "último dia" : `faltam ${resta} dia${resta > 1 ? "s" : ""}`;
}

/* A confirmação vive no topo da campanha: excluir leva junto as ações dela. */
export default function EstudioShell({
  dados,
  selecionada,
  selecionar,
  aba,
  mudarAba,
  criarCampanha,
  criarAcao,
  datas,
  grupos,
  tipos,
  busca,
  buscar,
  filtros,
  filtrar,
  aviso,
  erro,
  dispensar,
  desfazer,
  ocupado,
  editar,
  excluir,
  proximas,
  planejar,
  hoje,
  abrirItem,
  children,
}: {
  dados: Dados;
  selecionada: string;
  selecionar: (id: string) => void;
  aba: string;
  mudarAba: (s: string) => void;
  criarCampanha: () => void;
  criarAcao: () => void;
  datas: () => void;
  grupos: () => void;
  tipos: () => void;
  busca: string;
  buscar: (s: string) => void;
  filtros: number;
  filtrar: () => void;
  aviso: string;
  erro: string;
  dispensar: () => void;
  desfazer: (() => void) | null;
  ocupado: boolean;
  editar: (i: Item) => void;
  excluir: (i: Item) => Promise<void>;
  proximas: Oportunidade[];
  planejar: (o: Oportunidade) => void;
  hoje: string;
  abrirItem: (i: Item) => void;
  children: ReactNode;
}) {
  const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);
  const campanhas = dados.itens.filter((i) => i.natureza === "campanha");
  const campanha = campanhas.find((i) => i.id === selecionada);
  const acoes = dados.itens.filter(
    (i) =>
      i.natureza === "acao" &&
      (!selecionada ||
        (selecionada === "soltas"
          ? !i.campanha_id
          : i.campanha_id === selecionada)),
  );
  const feitas = acoes.filter((i) => i.status === "Concluída").length;
  const tabs = [
    { nome: "Quadro", icon: LayoutGrid },
    { nome: "Mapa", icon: Network },
    { nome: "Calendário", icon: CalendarDays },
    { nome: "Onde focar agora", titulo: "Prioridades", icon: Compass },
  ];
  return (
    <>
      <header className="st-topbar">
        {/* "MARKETING & OPERAÇÃO / Estúdio de campanhas" saiu: sobrescrito
            com um nome que o menu não usa, e duas linhas de chapéu antes
            do primeiro dado. */}
        <h1>Planejamento</h1>
        <div className="st-top-actions">
          <span className="st-company">{dados.empresa}</span>
          <button className="st-secondary" onClick={datas}>
            <Sparkles size={15} />
            Datas
          </button>
          <button
            className="st-primary"
            onClick={criarCampanha}
            disabled={ocupado}
          >
            <Plus size={16} />
            Nova campanha
          </button>
        </div>
      </header>
      <div className="st-layout">
        <aside className="st-sidebar">
          <button
            className={`st-project-nav ${!selecionada ? "selected" : ""}`}
            onClick={() => selecionar("")}
          >
            <LayoutGrid size={16} />
            <span>Todas as campanhas</span>
            <small>{campanhas.length}</small>
          </button>
          <button
            className={`st-project-nav ${selecionada === "soltas" ? "selected" : ""}`}
            onClick={() => selecionar("soltas")}
          >
            <FolderOpen size={16} />
            <span>Ações soltas</span>
            <small>
              {dados.itens.filter((i) => i.natureza === "acao" && !i.campanha_id).length}
            </small>
          </button>
          <div className="st-sidebar-label">CAMPANHAS</div>
          <div className="st-project-list">
            {campanhas.map((c) => (
              <button
                key={c.id}
                className={`st-project-nav ${selecionada === c.id ? "selected" : ""}`}
                onClick={() => selecionar(c.id)}
              >
                <span
                  className="st-project-mark"
                  style={{ background: c.cor }}
                />
                <span>{c.titulo}</span>
                {c.inicio <= hoje &&
                  c.fim >= hoje &&
                  c.status !== "Concluída" &&
                  c.status !== "Cancelada" && <em className="st-no-ar">no ar</em>}
                <small>
                  {dados.itens.filter((i) => i.campanha_id === c.id).length}
                </small>
              </button>
            ))}
          </div>
          {!campanhas.length && (
            <p className="st-sidebar-empty">Nenhuma campanha ainda.</p>
          )}
          <button
            className="st-sidebar-add"
            onClick={criarCampanha}
            disabled={ocupado}
          >
            <Plus size={14} />
            Adicionar campanha
          </button>
          <button
            className={`st-project-nav ${aba === "Grupos de produtos" ? "selected" : ""}`}
            onClick={grupos}
          >
            <Layers size={16} />
            <span>Grupos de produtos</span>
          </button>
          <button className="st-project-nav" onClick={tipos}>
            <Settings2 size={16} />
            <span>Tipos de ação</span>
          </button>
          {proximas[0] && (
            <button
              className="st-season-note"
              onClick={() => planejar(proximas[0])}
            >
              <small>{formatarData(proximas[0].data)}</small>
              <strong>{proximas[0].nome}</strong>
              <ArrowUpRight size={14} />
            </button>
          )}
        </aside>
        <section className="st-workspace" aria-label="Área de planejamento">
          {dados.avisos.map((a) => (
            <div className="pl-warning" role="alert" key={a}>
              {a}
            </div>
          ))}
          <div
            className="st-project-header"
            style={
              { "--project-color": campanha?.cor ?? "#9381ba" } as CSSProperties
            }
          >
            {campanha && (
              <div className="st-project-eyebrow">
                <span className="st-project-status">{campanha.status}</span>
              </div>
            )}
            {campanha && confirmarExclusao === campanha.id && (
              <div className="pl-delete-confirm" role="alert" style={{ position: "static", borderRadius: 12, marginBottom: 12 }}>
                <p>
                  Excluir a campanha “{campanha.titulo}”?
                  {(() => {
                    const n = dados.itens.filter((x) => x.campanha_id === campanha.id).length;
                    return n ? ` As ${n} ações dela também serão excluídas.` : "";
                  })()}{" "}
                  Não dá para desfazer.
                </p>
                <button
                  type="button"
                  className="pl-btn danger"
                  style={{ background: "var(--down)", color: "var(--panel)", borderColor: "var(--down)" }}
                  disabled={ocupado}
                  onClick={async () => {
                    await excluir(campanha);
                    setConfirmarExclusao(null);
                  }}
                >
                  Sim, excluir
                </button>
                <button type="button" className="pl-btn" onClick={() => setConfirmarExclusao(null)}>
                  Manter
                </button>
              </div>
            )}
            <div className="st-project-title">
              <div>
                <h2>
                  {aba === "Grupos de produtos"
                    ? "Grupos de produtos"
                    : (campanha?.titulo ??
                      (selecionada === "soltas"
                        ? "Ações soltas"
                        : "Planejamento"))}
                </h2>
                {campanha?.detalhes.objetivo && (
                  <p>{campanha.detalhes.objetivo}</p>
                )}
              </div>
              {campanha ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    className="st-secondary"
                    onClick={() => editar(campanha)}
                  >
                    Briefing da campanha <ArrowUpRight size={14} />
                  </button>
                  {/* Excluir à vista: antes só existia dentro do briefing, num
                      ícone de lixeira sem nome. */}
                  <button
                    className="st-secondary danger"
                    style={{ borderColor: "var(--down)" }}
                    disabled={ocupado}
                    onClick={() => setConfirmarExclusao(campanha.id)}
                  >
                    <Trash2 size={14} /> Excluir campanha
                  </button>
                </div>
              ) : null}
            </div>
            {campanha && (
              <div className="st-project-details">
                <CalendarDays size={13} />
                <span>
                  {formatarData(campanha.inicio)} — {formatarData(campanha.fim)}
                </span>
                <span>·</span>
                <span>{restante(campanha, hoje)}</span>
                <span>·</span>
                <span>
                  {acoes.length} ações
                  {feitas ? `, ${feitas} concluídas` : ""}
                </span>
                {campanha.detalhes.responsavel && (
                  <>
                    <span>·</span>
                    <span>{campanha.detalhes.responsavel}</span>
                  </>
                )}
              </div>
            )}
          </div>
          {!campanha && selecionada !== "soltas" && aba !== "Grupos de produtos" && (
            <Hoje dados={dados} hoje={hoje} abrir={abrirItem} />
          )}
          <div className="st-toolbar">
            <nav aria-label="Visualizações do planejamento">
              {tabs.map(({ nome, titulo, icon: Icon }) => (
                <button
                  className={aba === nome ? "active" : ""}
                  key={nome}
                  onClick={() => mudarAba(nome)}
                >
                  <Icon size={15} />
                  {titulo ?? nome}
                </button>
              ))}
            </nav>
            <div className="st-toolbar-actions">
              <div className="st-search">
                <Search size={15} />
                <input
                  aria-label="Buscar planejamento"
                  placeholder="Buscar no plano…"
                  value={busca}
                  onChange={(e) => buscar(e.target.value)}
                />
              </div>
              <button
                className={`st-filter-button ${filtros ? "active" : ""}`}
                onClick={filtrar}
              >
                <SlidersHorizontal size={14} />
                Filtros{filtros > 0 && <small>{filtros}</small>}
              </button>
              <button
                className="st-primary st-small"
                onClick={criarAcao}
                disabled={ocupado}
              >
                <Plus size={15} />
                Ação
              </button>
            </div>
          </div>
          <div className="st-view-body">{children}</div>
        </section>
      </div>
      {(aviso || erro) && (
        <div
          className={`st-toast ${erro ? "error" : ""}`}
          role={erro ? "alert" : "status"}
        >
          {!erro && <Check size={16} />}
          <span>{erro || aviso}</span>
          {desfazer && !erro && (
            <button onClick={desfazer} disabled={ocupado}>
              <Undo2 size={14} />
              Desfazer
            </button>
          )}
          <button aria-label="Fechar aviso" onClick={dispensar}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
