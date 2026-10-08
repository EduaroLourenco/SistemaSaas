"use client";
import { useState } from "react";
import { ArrowUpRight, Check, Plus, Save, Trash2 } from "lucide-react";
import {
  type Item,
  type Dados,
  STATUS,
  TIPOS,
  ETAPAS,
  CORES,
  validarItem,
} from "@/lib/planejamento/modelo";
import { MODELOS, type ModeloCampanha } from "@/lib/planejamento/estudio";
import { Campo, Painel, nomeCanais } from "./componentes";

export default function Ficha({
  inicial,
  dados,
  salvar,
  fechar,
  detalhar,
  excluir,
  ocupado,
  erro,
}: {
  inicial: Item;
  dados: Dados;
  salvar: (i: Item) => Promise<boolean>;
  fechar: () => void;
  detalhar: (i: Item) => void;
  /** Ausente em ação ainda não salva: não há o que excluir. */
  excluir?: (i: Item) => Promise<void>;
  ocupado: boolean;
  erro: string;
}) {
  const [item, setItem] = useState(() => structuredClone(inicial)),
    [tarefa, setTarefa] = useState(""),
    [erroLocal, setErroLocal] = useState(""),
    [confirmar, setConfirmar] = useState(false);
  const filhos = dados.itens.filter((x) => x.campanha_id === inicial.id);
  const sujo = JSON.stringify(inicial) !== JSON.stringify(item);
  const atualizar = (p: Partial<Item>) => setItem((i) => ({ ...i, ...p }));
  function sair() {
    if (
      !ocupado &&
      (!sujo || window.confirm("Descartar alterações ainda não salvas?"))
    )
      fechar();
  }
  function adicionar() {
    if (tarefa.trim()) {
      atualizar({
        detalhes: {
          ...item.detalhes,
          checklist: [
            ...item.detalhes.checklist,
            { texto: tarefa.trim(), feito: false },
          ].slice(0, 100),
        },
      });
      setTarefa("");
    }
  }
  return (
    <Painel
      titulo={
        item.natureza === "campanha"
          ? "Sua campanha"
          : item.id
            ? "Sua ação"
            : "Uma nova ideia"
      }
      fechar={sair}
    >
      <form
        className="st-sheet"
        onSubmit={async (ev) => {
          ev.preventDefault();
          const e = validarItem(item);
          setErroLocal(e ?? "");
          if (!e) await salvar(item);
        }}
      >
        <div className="pl-drawer-body pl-stack">
          <input
            className="st-title-input"
            aria-label="Título do planejamento"
            required
            autoFocus
            maxLength={160}
            value={item.titulo}
            onChange={(e) => atualizar({ titulo: e.target.value })}
            placeholder="Dê um nome à sua ideia…"
          />
          <div className="st-sheet-row">
            <Campo nome="Andamento">
              <select
                value={item.status}
                onChange={(e) =>
                  atualizar({ status: e.target.value as Item["status"] })
                }
              >
                {STATUS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Campo>
            <Campo nome="Tipo">
              <select
                value={item.tipo}
                onChange={(e) => atualizar({ tipo: e.target.value })}
              >
                {[
                  ...new Set([
                    item.tipo,
                    ...TIPOS,
                    ...dados.tipos.map((t) => t.nome),
                  ]),
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="st-sheet-row">
            <Campo nome="Começa">
              <input
                type="date"
                required
                value={item.inicio}
                onChange={(e) =>
                  atualizar({
                    inicio: e.target.value,
                    fim: item.fim < e.target.value ? e.target.value : item.fim,
                  })
                }
              />
            </Campo>
            <Campo nome="Termina">
              <input
                type="date"
                required
                min={item.inicio}
                value={item.fim}
                onChange={(e) => atualizar({ fim: e.target.value })}
              />
            </Campo>
          </div>
          <Campo nome="A ideia, em poucas palavras">
            <textarea
              rows={3}
              maxLength={10000}
              value={item.detalhes.briefing}
              onChange={(e) =>
                atualizar({
                  detalhes: { ...item.detalhes, briefing: e.target.value },
                })
              }
              placeholder="Mensagem, oferta, referência… o que você não quer esquecer?"
            />
          </Campo>
          <div className="st-sheet-row">
            <Campo nome="Responsável">
              <input
                value={item.detalhes.responsavel}
                maxLength={1000}
                onChange={(e) =>
                  atualizar({
                    detalhes: { ...item.detalhes, responsavel: e.target.value },
                  })
                }
                placeholder="Quem cuida?"
              />
            </Campo>
            <Campo nome="Etapa">
              <input
                list="st-ficha-etapas"
                maxLength={80}
                value={item.etapa}
                onChange={(e) => atualizar({ etapa: e.target.value })}
              />
              <datalist id="st-ficha-etapas">
                {ETAPAS.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </datalist>
            </Campo>
          </div>
          <div className="st-sheet-context">
            <span>{nomeCanais(item, dados)}</span>
            <span>
              {item.skus.length
                ? `${item.skus.length} produto(s) no mix`
                : "Produtos opcionais"}
            </span>
          </div>
          <section className="st-sheet-tasks">
            <h3>Pequenos passos</h3>
            {item.detalhes.checklist.map((t, idx) => (
              <div className="pl-task" key={idx}>
                <label>
                  <input
                    type="checkbox"
                    checked={t.feito}
                    onChange={(e) =>
                      atualizar({
                        detalhes: {
                          ...item.detalhes,
                          checklist: item.detalhes.checklist.map((x, n) =>
                            n === idx ? { ...x, feito: e.target.checked } : x,
                          ),
                        },
                      })
                    }
                  />
                  <span className={t.feito ? "done" : ""}>{t.texto}</span>
                </label>
                <button
                  type="button"
                  className="st-icon"
                  aria-label={`Remover tarefa ${t.texto}`}
                  onClick={() =>
                    atualizar({
                      detalhes: {
                        ...item.detalhes,
                        checklist: item.detalhes.checklist.filter(
                          (_, n) => n !== idx,
                        ),
                      },
                    })
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <div className="st-task-add">
              <input
                value={tarefa}
                maxLength={500}
                onChange={(e) => setTarefa(e.target.value)}
                placeholder="Adicionar um preparativo…"
                aria-label="Novo preparativo"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionar();
                  }
                }}
              />
              <button
                type="button"
                className="st-icon"
                onClick={adicionar}
                disabled={!tarefa.trim()}
                aria-label="Adicionar preparativo"
              >
                <Plus size={17} />
              </button>
            </div>
          </section>
          <button
            type="button"
            className="st-detail-link"
            onClick={() => detalhar(item)}
          >
            Produtos, canais, estratégia e resultados <ArrowUpRight size={16} />
          </button>
          <div className="st-color-picker">
            {CORES.map((c) => (
              <button
                type="button"
                key={c}
                style={{ background: c }}
                aria-label={`Cor ${c}`}
                aria-pressed={item.cor === c}
                onClick={() => atualizar({ cor: c })}
              >
                {item.cor === c && <Check size={12} />}
              </button>
            ))}
          </div>
          {(erro || erroLocal) && (
            <p className="pl-error" role="alert">
              {erroLocal || erro}
            </p>
          )}
        </div>
        <footer className="pl-drawer-foot">
          <button
            type="button"
            className="st-secondary"
            onClick={sair}
            disabled={ocupado}
          >
            Fechar
          </button>
          {/* Excluir à vista, no rodapé: antes só existia no editor completo,
              atrás de um ícone de lixeira, e ninguém achava. */}
          {excluir && (
            <button
              type="button"
              className="st-secondary danger"
              style={{ marginLeft: "auto", marginRight: 8, borderColor: "var(--down)" }}
              onClick={() => setConfirmar(true)}
              disabled={ocupado}
            >
              <Trash2 size={15} /> Excluir
            </button>
          )}
          <button className="st-primary" disabled={ocupado || !dados.pronto}>
            <Save size={15} />
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
        </footer>
        {confirmar && excluir && (
          <div className="pl-delete-confirm" role="alert">
            <p>
              Excluir “{inicial.titulo}”?
              {filhos.length > 0 ? ` As ${filhos.length} ações desta campanha também serão excluídas.` : ""} Não dá para desfazer.
            </p>
            <button type="button" className="pl-btn danger" style={{ background: "var(--down)", color: "var(--panel)", borderColor: "var(--down)" }} disabled={ocupado} onClick={() => excluir(inicial)}>
              Sim, excluir
            </button>
            <button type="button" className="pl-btn" onClick={() => setConfirmar(false)}>
              Manter
            </button>
          </div>
        )}
      </form>
    </Painel>
  );
}

export function NovaCampanha({
  hoje,
  salvar,
  fechar,
  ocupado,
  erro,
  pronto,
}: {
  hoje: string;
  salvar: (
    titulo: string,
    inicio: string,
    modelo: ModeloCampanha,
  ) => Promise<void>;
  fechar: () => void;
  ocupado: boolean;
  erro: string;
  pronto: boolean;
}) {
  const [nome, setNome] = useState(""),
    [inicio, setInicio] = useState(hoje),
    [modelo, setModelo] = useState(MODELOS[0]);
  return (
    <Painel
      titulo="O que vamos colocar em movimento?"
      subtitulo="Comece do zero ou use um roteiro. Tudo continua editável."
      fechar={() => {
        if (!ocupado) fechar();
      }}
    >
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          await salvar(nome, inicio, modelo);
        }}
      >
        <div className="pl-drawer-body pl-stack">
          <Campo nome="Nome da campanha">
            <input
              required
              maxLength={160}
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Black Friday · Casa renovada"
            />
          </Campo>
          <Campo nome="Começar a preparar em">
            <input
              required
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              min="2000-01-01"
              max="2100-12-01"
            />
          </Campo>
          <div className="st-models">
            {MODELOS.map((m) => (
              <button
                className={`st-model ${modelo.id === m.id ? "selected" : ""}`}
                type="button"
                key={m.id}
                aria-pressed={modelo.id === m.id}
                onClick={() => setModelo(m)}
              >
                <span style={{ background: m.cor }} />
                <div>
                  <strong>{m.nome}</strong>
                  <p>{m.descricao}</p>
                  <small>
                    {m.acoes.length
                      ? `${m.acoes.length} ações para você adaptar`
                      : "Você escolhe os próximos passos"}
                  </small>
                </div>
                {modelo.id === m.id && <Check size={18} />}
              </button>
            ))}
          </div>
          {modelo.acoes.length > 0 && (
            <div className="st-model-preview">
              {modelo.acoes.map((a) => (
                <span key={a.titulo}>
                  <Check size={13} />
                  {a.titulo}
                </span>
              ))}
            </div>
          )}
          {erro && (
            <p className="pl-error" role="alert">
              {erro}
            </p>
          )}
        </div>
        <footer className="pl-drawer-foot">
          <button
            type="button"
            className="st-secondary"
            disabled={ocupado}
            onClick={fechar}
          >
            Voltar
          </button>
          <button className="st-primary" disabled={ocupado || !pronto}>
            {ocupado
              ? "Montando sua campanha…"
              : modelo.acoes.length
                ? `Criar com ${modelo.acoes.length} ações`
                : "Criar campanha"}
            <ArrowUpRight size={15} />
          </button>
        </footer>
      </form>
    </Painel>
  );
}
