"use client";
import type { ReactNode, CSSProperties } from "react";
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
} from "lucide-react";
import { type Dados, type Item, formatarData } from "@/lib/planejamento/modelo";
import type { Oportunidade } from "@/lib/planejamento/sazonal";

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
  proximas,
  planejar,
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
  proximas: Oportunidade[];
  planejar: (o: Oportunidade) => void;
  children: ReactNode;
}) {
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
        <div className="st-brand-icon">
          <Layers size={20} />
        </div>
        <div>
          <span>MARKETING & OPERAÇÃO</span>
          <h1>Estúdio de campanhas</h1>
        </div>
        <div className="st-top-actions">
          <span className="st-company">{dados.empresa}</span>
          <button className="st-secondary" onClick={datas}>
            <Sparkles size={15} />
            Explorar datas
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
          <div className="st-sidebar-label">
            SEU ESPAÇO{" "}
            <button
              className="st-icon"
              onClick={criarCampanha}
              aria-label="Criar campanha"
              disabled={ocupado}
            >
              <Plus size={16} />
            </button>
          </div>
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
            <span>Ideias avulsas</span>
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
                <small>
                  {dados.itens.filter((i) => i.campanha_id === c.id).length}
                </small>
              </button>
            ))}
          </div>
          {!campanhas.length && (
            <p className="st-sidebar-empty">
              Sua próxima campanha
              <br />
              começa por aqui.
            </p>
          )}
          <button
            className="st-sidebar-add"
            onClick={criarCampanha}
            disabled={ocupado}
          >
            <Plus size={14} />
            Adicionar campanha
          </button>
          <div className="st-sidebar-label">BIBLIOTECA</div>
          <button
            className={`st-project-nav ${aba === "Grupos de produtos" ? "selected" : ""}`}
            onClick={grupos}
          >
            <Layers size={16} />
            <span>Mixes de produtos</span>
          </button>
          <button className="st-project-nav" onClick={tipos}>
            <Settings2 size={16} />
            <span>Seus tipos de ação</span>
          </button>
          {proximas[0] && (
            <div className="st-season-note">
              <span>
                <Sparkles size={14} />
                NO HORIZONTE
              </span>
              <small>{formatarData(proximas[0].data)}</small>
              <strong>{proximas[0].nome}</strong>
              <p>Uma oportunidade para a sua próxima campanha.</p>
              <button onClick={() => planejar(proximas[0])}>
                Desenvolver ideia <ArrowUpRight size={14} />
              </button>
            </div>
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
            <div className="st-project-eyebrow">
              <span className="st-project-orbit">
                <Layers size={20} />
              </span>
              <span>{campanha ? "CAMPANHA" : "VISÃO DO SEU PLANEJAMENTO"}</span>
              {campanha && (
                <span className="st-project-status">{campanha.status}</span>
              )}
            </div>
            <div className="st-project-title">
              <div>
                <h2>
                  {aba === "Grupos de produtos"
                    ? "Mixes que combinam"
                    : (campanha?.titulo ??
                      (selecionada === "soltas"
                        ? "Ideias para colocar no mundo"
                        : "Seu próximo movimento"))}
                </h2>
                <p>
                  {campanha?.detalhes.objetivo ||
                    (selecionada === "soltas"
                      ? "Nem toda boa ideia precisa nascer dentro de uma campanha."
                      : "Um espaço para conectar ideias, produtos e canais.")}
                </p>
              </div>
              {campanha ? (
                <button
                  className="st-secondary"
                  onClick={() => editar(campanha)}
                >
                  Briefing da campanha <ArrowUpRight size={14} />
                </button>
              ) : (
                <div className="st-mini-progress">
                  <div>
                    <span>{acoes.length} ações</span>
                    <span>{feitas} concluídas</span>
                  </div>
                  <i>
                    <b
                      style={{
                        width: `${acoes.length ? (feitas / acoes.length) * 100 : 0}%`,
                      }}
                    />
                  </i>
                </div>
              )}
            </div>
            {campanha && (
              <div className="st-project-details">
                <CalendarDays size={13} />
                <span>
                  {formatarData(campanha.inicio)} — {formatarData(campanha.fim)}
                </span>
                <span>·</span>
                <span>{acoes.length} ações conectadas</span>
                {campanha.detalhes.responsavel && (
                  <>
                    <span>·</span>
                    <span>{campanha.detalhes.responsavel}</span>
                  </>
                )}
              </div>
            )}
          </div>
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
