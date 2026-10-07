"use client";
import { useState, type FormEvent } from "react";
import { Plus, Trash2, Copy, Save, Check, ExternalLink } from "lucide-react";
import {
  CORES,
  STATUS,
  TIPOS,
  ETAPAS,
  validarItem,
  novoItem,
  type Dados,
  type Item,
  type Detalhes,
  sobrepoe,
} from "@/lib/planejamento/modelo";
import { estrategiaDe, estrategiaVazia } from "@/lib/planejamento/estrategia";
import { mesmoDestino, mesmosProdutos } from "@/lib/planejamento/prioridades";
import {
  AnunciosEditor,
  EstrategiaEditor,
  ExecucaoEditor,
  preparativosSugeridos,
} from "./estrategia-editor";
import { Campo, Painel, Produtos, ContextoPromocoes } from "./componentes";

export default function Editor({
  inicial,
  dados,
  ocupado,
  erro,
  salvar,
  excluir,
  fechar,
  abrir,
}: {
  inicial: Item;
  dados: Dados;
  ocupado: boolean;
  erro: string;
  salvar: (i: Item) => Promise<void>;
  excluir: (i: Item) => Promise<void>;
  fechar: () => void;
  abrir: (i: Item) => void;
}) {
  const [item, setItem] = useState<Item>(() => structuredClone(inicial));
  const [aba, setAba] = useState("Essencial");
  const [erroLocal, setErroLocal] = useState("");
  const [tarefa, setTarefa] = useState("");
  const [skuIndividual, setSkuIndividual] = useState("");
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const salvo =
    dados.itens.find((i) => i.id === inicial.id) ??
    novoItem(inicial.inicio, inicial.natureza);
  const sujo = JSON.stringify(item) !== JSON.stringify(salvo);
  const campanha = item.natureza === "campanha";
  const filhos = dados.itens.filter(
    (i) => i.campanha_id === item.id && item.id,
  );
  const tipos = [
    ...new Set([...TIPOS, ...dados.tipos.map((t) => t.nome), item.tipo]),
  ];
  function atualizar(p: Partial<Item>) {
    setItem((i) => ({ ...i, ...p }));
  }
  function detalhe(p: Partial<Detalhes>) {
    setItem((i) => ({ ...i, detalhes: { ...i.detalhes, ...p } }));
  }
  function fecharSeguro() {
    if (
      !ocupado &&
      (!sujo ||
        window.confirm("Descartar as alterações que ainda não foram salvas?"))
    )
      fechar();
  }
  function selecionarSkus(skus: string[]) {
    atualizar({
      skus,
      detalhes: {
        ...item.detalhes,
        porProduto: Object.fromEntries(
          Object.entries(item.detalhes.porProduto).filter(([s]) =>
            skus.includes(s),
          ),
        ),
      },
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalido = validarItem(item);
    if (invalido) {
      setErroLocal(invalido);
      return;
    }
    setErroLocal("");
    await salvar(item);
  }
  function novaAcao(tipo: string) {
    if (
      sujo &&
      !window.confirm("Abrir uma ação sem salvar as alterações atuais?")
    )
      return;
    const acao = novoItem(item.inicio);
    abrir({
      ...acao,
      campanha_id: item.id,
      fim: item.fim,
      tipo,
      cor: item.cor,
      canais: [...item.canais],
      contas: [...item.contas],
      skus: [...item.skus],
      detalhes: {
        ...acao.detalhes,
        grupos: [...item.detalhes.grupos],
        estrategia: {
          ...estrategiaVazia(),
          anuncios: [...estrategiaDe(item).anuncios],
        },
      },
    });
  }
  const conflitos = dados.itens.filter(
    (i) =>
      i.id !== item.id &&
      i.natureza === "acao" &&
      i.status !== "Cancelada" &&
      item.natureza === "acao" &&
      sobrepoe(i.inicio, i.fim, item.inicio, item.fim) &&
      mesmosProdutos(i, item) &&
      mesmoDestino(i, item, dados.contas),
  );
  return (
    <Painel
      titulo={
        item.id
          ? campanha
            ? "Editar campanha"
            : "Editar ação"
          : campanha
            ? "Nova campanha"
            : "Nova ação"
      }
      subtitulo={
        campanha
          ? "Um objetivo, várias ações conectadas."
          : "Defina o que fazer. Os detalhes podem vir depois."
      }
      fechar={fecharSeguro}
    >
      <form onSubmit={submit} className="pl-editor">
        <nav className="pl-editor-tabs" aria-label="Detalhes do planejamento">
          {[
            "Essencial",
            "Estratégia",
            "Produtos",
            "Conteúdo e tarefas",
            "Execução e aprendizado",
            "Contexto",
          ].map((a) => (
            <button
              type="button"
              key={a}
              className={aba === a ? "active" : ""}
              onClick={(ev) => {
                setAba(a);
                ev.currentTarget.scrollIntoView({
                  block: "nearest",
                  inline: "center",
                });
              }}
            >
              {a}
            </button>
          ))}
        </nav>
        <div className="pl-drawer-body">
          {aba === "Essencial" && (
            <div className="pl-stack">
              <Campo
                nome={
                  campanha ? "Nome da campanha *" : "O que você quer fazer? *"
                }
              >
                <input
                  required
                  maxLength={160}
                  value={item.titulo}
                  onChange={(e) => atualizar({ titulo: e.target.value })}
                  placeholder={
                    campanha
                      ? "Ex.: Black Friday · Casa renovada"
                      : "Ex.: Banner de lançamento na loja"
                  }
                />
              </Campo>
              <div className="pl-two">
                <Campo nome="Começa em *">
                  <input
                    type="date"
                    required
                    value={item.inicio}
                    onChange={(e) =>
                      atualizar({
                        inicio: e.target.value,
                        fim:
                          e.target.value > item.fim ? e.target.value : item.fim,
                      })
                    }
                  />
                </Campo>
                <Campo nome="Termina em *">
                  <input
                    type="date"
                    required
                    min={item.inicio}
                    value={item.fim}
                    onChange={(e) => atualizar({ fim: e.target.value })}
                  />
                </Campo>
              </div>
              <div className="pl-two">
                {!campanha && (
                  <Campo nome="Tipo de ação">
                    <select
                      value={item.tipo}
                      onChange={(e) => {
                        const t = dados.tipos.find(
                          (t) => t.nome === e.target.value,
                        );
                        atualizar({
                          tipo: e.target.value,
                          ...(t ? { cor: t.cor } : {}),
                        });
                      }}
                    >
                      {tipos.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Campo>
                )}
                <Campo nome="Situação">
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
              </div>
              {!campanha && (
                <div className="pl-two">
                  <Campo nome="Dentro de qual campanha?">
                    <select
                      value={item.campanha_id ?? ""}
                      onChange={(e) =>
                        atualizar({ campanha_id: e.target.value || null })
                      }
                    >
                      <option value="">Ação avulsa</option>
                      {dados.itens
                        .filter((i) => i.natureza === "campanha")
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.titulo}
                          </option>
                        ))}
                    </select>
                  </Campo>
                  <Campo nome="Etapa">
                    <input
                      list="pl-etapas"
                      value={item.etapa}
                      maxLength={80}
                      onChange={(e) => atualizar({ etapa: e.target.value })}
                    />
                    <datalist id="pl-etapas">
                      {ETAPAS.map((e) => (
                        <option key={e} value={e} />
                      ))}
                    </datalist>
                  </Campo>
                </div>
              )}
              <Campo nome="Objetivo">
                <input
                  value={item.detalhes.objetivo}
                  onChange={(e) => detalhe({ objetivo: e.target.value })}
                  placeholder="Ex.: Reativar clientes e aumentar as vendas da seleção"
                />
              </Campo>
              <section>
                <h3>Onde acontece?</h3>
                <p className="pl-muted">
                  Selecione canais inteiros ou contas específicas. Deixe vazio
                  para ações institucionais. Um canal inteiro inclui todas as
                  suas contas; selecione só as contas para um recorte menor.
                </p>
                <div className="pl-chips">
                  {dados.canais.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className={`pl-chip ${item.canais.includes(c.id) ? "selected" : ""}`}
                      onClick={() =>
                        atualizar({
                          canais: item.canais.includes(c.id)
                            ? item.canais.filter((x) => x !== c.id)
                            : [...item.canais, c.id],
                        })
                      }
                    >
                      {item.canais.includes(c.id) && <Check size={13} />}
                      {c.nome}
                    </button>
                  ))}
                </div>
                <details>
                  <summary>Escolher contas específicas</summary>
                  <div className="pl-chips">
                    {dados.contas.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className={`pl-chip ${item.contas.includes(c.id) ? "selected" : ""}`}
                        onClick={() =>
                          atualizar({
                            contas: item.contas.includes(c.id)
                              ? item.contas.filter((x) => x !== c.id)
                              : [...item.contas, c.id],
                          })
                        }
                      >
                        {c.nome}
                      </button>
                    ))}
                  </div>
                </details>
              </section>
              <div className="pl-two">
                <Campo nome="Responsável">
                  <input
                    value={item.detalhes.responsavel}
                    onChange={(e) => detalhe({ responsavel: e.target.value })}
                    placeholder="Quem vai cuidar?"
                  />
                </Campo>
                <Campo nome="Cor no calendário">
                  <div className="pl-colors">
                    {CORES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Cor ${c}`}
                        aria-pressed={item.cor === c}
                        style={{ background: c }}
                        onClick={() => atualizar({ cor: c })}
                      >
                        {item.cor === c && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </Campo>
              </div>
              <details>
                <summary>Meta e orçamento opcionais</summary>
                <div className="pl-two">
                  <Campo nome="Meta da campanha">
                    <input
                      value={item.detalhes.meta}
                      onChange={(e) => detalhe({ meta: e.target.value })}
                      placeholder="Ex.: 50 pedidos ou 100 clientes reativados"
                    />
                  </Campo>
                  <Campo nome="Orçamento planejado (R$)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.detalhes.orcamento ?? ""}
                      onChange={(e) =>
                        detalhe({
                          orcamento:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </Campo>
                </div>
              </details>
              {campanha && item.id && (
                <section className="pl-context">
                  <h3>Ações desta campanha · {filhos.length}</h3>
                  {filhos.map((f) => (
                    <button
                      type="button"
                      className="pl-related"
                      key={f.id}
                      onClick={() => {
                        if (
                          !sujo ||
                          window.confirm(
                            "Descartar alterações antes de abrir a ação?",
                          )
                        )
                          abrir(f);
                      }}
                    >
                      <span>
                        {f.titulo}
                        <small>
                          {f.etapa} · {f.tipo}
                        </small>
                      </span>
                      <span className="pl-badge">{f.status}</span>
                    </button>
                  ))}
                  <div className="pl-chips">
                    {[
                      "Revisão de anúncio",
                      "Product Ads",
                      "Promoção",
                      "Banner",
                      "CRM",
                    ].map((t) => (
                      <button
                        type="button"
                        className="pl-btn"
                        key={t}
                        onClick={() => novaAcao(t)}
                      >
                        <Plus size={14} />
                        {t}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {campanha && !item.id && (
                <p className="pl-note">
                  Salve a campanha para adicionar ações e organizar suas etapas.
                </p>
              )}
            </div>
          )}
          {aba === "Estratégia" && (
            <EstrategiaEditor
              item={item}
              dados={dados}
              mudar={(estrategia) => detalhe({ estrategia })}
            />
          )}
          {aba === "Execução e aprendizado" && (
            <ExecucaoEditor
              item={item}
              dados={dados}
              alterado={sujo}
              mudar={(estrategia) => detalhe({ estrategia })}
            />
          )}
          {aba === "Produtos" && (
            <div className="pl-stack">
              <div>
                <h3>Produtos opcionais</h3>
                <p className="pl-muted">
                  A ação também pode ser institucional. Um grupo copia a seleção
                  atual; alterações futuras no grupo não mudam esta ação.
                </p>
              </div>
              {dados.grupos.length > 0 && (
                <div className="pl-chips">
                  {dados.grupos.map((g) => (
                    <button
                      type="button"
                      className="pl-chip"
                      key={g.id}
                      onClick={() => {
                        atualizar({
                          skus: [...new Set([...item.skus, ...g.skus])],
                          detalhes: {
                            ...item.detalhes,
                            grupos: [
                              ...new Set([...item.detalhes.grupos, g.nome]),
                            ],
                          },
                        });
                      }}
                    >
                      <Plus size={13} />
                      {g.nome} · {g.skus.length}
                    </button>
                  ))}
                </div>
              )}
              <Produtos
                catalogo={dados.produtos}
                selecionados={item.skus}
                mudar={selecionarSkus}
              />
              <AnunciosEditor item={item} dados={dados} mudarItem={atualizar} />
              {item.skus.length > 0 && (
                <section className="pl-context">
                  <h3>Uma orientação diferente por produto?</h3>
                  <Campo nome="Escolha o SKU">
                    <select
                      value={skuIndividual}
                      onChange={(e) => setSkuIndividual(e.target.value)}
                    >
                      <option value="">Selecionar produto</option>
                      {item.skus.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Campo>
                  {item.skus.includes(skuIndividual) && (
                    <Campo nome={`Ação específica · ${skuIndividual}`}>
                      <textarea
                        value={item.detalhes.porProduto[skuIndividual] ?? ""}
                        maxLength={2000}
                        onChange={(e) =>
                          detalhe({
                            porProduto: {
                              ...item.detalhes.porProduto,
                              [skuIndividual]: e.target.value,
                            },
                          })
                        }
                        placeholder="Ex.: Destacar no banner principal; trabalhar cupom exclusivo."
                      />
                    </Campo>
                  )}
                </section>
              )}
            </div>
          )}
          {aba === "Conteúdo e tarefas" && (
            <div className="pl-stack">
              <div className="pl-two">
                <Campo nome="Meio de divulgação">
                  <input
                    list="pl-divulgacao"
                    value={item.detalhes.divulgacao}
                    onChange={(e) => detalhe({ divulgacao: e.target.value })}
                    placeholder="Onde vamos comunicar?"
                  />
                  <datalist id="pl-divulgacao">
                    {[
                      "Loja / vitrine",
                      "WhatsApp",
                      "E-mail",
                      "Instagram",
                      "Google Ads",
                      "Meta Ads",
                      "Marketplace",
                      "Mercado Livre · Product Ads",
                      "Mercado Livre · Minha Página",
                    ].map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </Campo>
                <Campo
                  nome={
                    item.tipo === "CRM"
                      ? "Público / segmento de clientes"
                      : "Público"
                  }
                >
                  <input
                    value={item.detalhes.publico}
                    onChange={(e) => detalhe({ publico: e.target.value })}
                    placeholder="Ex.: Clientes sem compra há 90 dias"
                  />
                </Campo>
              </div>
              <Campo
                nome={
                  item.tipo === "Banner"
                    ? "Briefing do banner: mensagem, formato e posição"
                    : item.tipo === "CRM"
                      ? "Mensagem e chamada para ação"
                      : "Como vamos fazer?"
                }
              >
                <textarea
                  rows={5}
                  value={item.detalhes.briefing}
                  onChange={(e) => detalhe({ briefing: e.target.value })}
                  placeholder="Descreva a ação, oferta, texto e orientações para executar."
                />
              </Campo>
              <Campo nome="Link da arte, documento ou referência">
                <input
                  type="url"
                  value={item.detalhes.link}
                  onChange={(e) => detalhe({ link: e.target.value })}
                  placeholder="https://…"
                />
              </Campo>
              {/^https?:\/\//i.test(item.detalhes.link) && (
                <a
                  className="pl-link"
                  href={item.detalhes.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir referência <ExternalLink size={13} />
                </a>
              )}
              <section>
                <h3>Preparativos</h3>
                <button
                  type="button"
                  className="pl-btn small"
                  onClick={() =>
                    detalhe({
                      checklist: [
                        ...item.detalhes.checklist,
                        ...preparativosSugeridos(item.tipo)
                          .filter(
                            (texto) =>
                              !item.detalhes.checklist.some(
                                (c) => c.texto === texto,
                              ),
                          )
                          .map((texto) => ({ texto, feito: false })),
                      ].slice(0, 100),
                    })
                  }
                >
                  <Plus size={14} /> Adicionar roteiro para{" "}
                  {item.tipo.toLowerCase()}
                </button>
                {item.detalhes.checklist.map((c, idx) => (
                  <div className="pl-task" key={idx}>
                    <label>
                      <input
                        type="checkbox"
                        checked={c.feito}
                        onChange={(e) =>
                          detalhe({
                            checklist: item.detalhes.checklist.map((t, n) =>
                              n === idx ? { ...t, feito: e.target.checked } : t,
                            ),
                          })
                        }
                      />
                      <span className={c.feito ? "done" : ""}>{c.texto}</span>
                    </label>
                    <button
                      className="pl-icon"
                      type="button"
                      aria-label={`Remover tarefa ${c.texto}`}
                      onClick={() =>
                        detalhe({
                          checklist: item.detalhes.checklist.filter(
                            (_, n) => n !== idx,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <div className="pl-inline">
                  <input
                    aria-label="Nova tarefa"
                    value={tarefa}
                    maxLength={500}
                    onChange={(e) => setTarefa(e.target.value)}
                    placeholder="O que precisa ficar pronto?"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (tarefa.trim()) {
                          detalhe({
                            checklist: [
                              ...item.detalhes.checklist,
                              { texto: tarefa.trim(), feito: false },
                            ],
                          });
                          setTarefa("");
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="pl-btn"
                    disabled={!tarefa.trim()}
                    onClick={() => {
                      detalhe({
                        checklist: [
                          ...item.detalhes.checklist,
                          { texto: tarefa.trim(), feito: false },
                        ],
                      });
                      setTarefa("");
                    }}
                  >
                    <Plus size={16} />
                    Adicionar
                  </button>
                </div>
              </section>
            </div>
          )}
          {aba === "Contexto" && (
            <div className="pl-stack">
              <ContextoPromocoes item={item} dados={dados} />
              {conflitos.length > 0 && (
                <section className="pl-context">
                  <h3>Produtos em outras ações neste período</h3>
                  <p>
                    Sobreposição pode ser intencional. Confira se as mensagens e
                    ofertas combinam.
                  </p>
                  {conflitos.map((c) => (
                    <p key={c.id}>
                      <strong>{c.titulo}</strong> · {c.tipo} · {c.status}
                    </p>
                  ))}
                </section>
              )}
            </div>
          )}
          {(erro || erroLocal) && (
            <p role="alert" className="pl-error">
              {erroLocal || erro}
            </p>
          )}
        </div>
        <footer className="pl-drawer-foot">
          <div className="pl-inline">
            {item.id && (
              <>
                <button
                  type="button"
                  className="pl-icon"
                  aria-label={
                    campanha
                      ? "Duplicar campanha sem suas ações vinculadas"
                      : "Duplicar ação"
                  }
                  title={
                    campanha
                      ? "Copia os dados da campanha; as ações vinculadas não são copiadas."
                      : "Criar uma cópia desta ação"
                  }
                  disabled={ocupado}
                  onClick={() =>
                    abrir({
                      ...structuredClone(item),
                      id: "",
                      revisao: 0,
                      titulo: item.titulo + " (cópia)",
                      status: "Rascunho",
                      detalhes: {
                        ...structuredClone(item.detalhes),
                        visual: undefined,
                        ordem: undefined,
                        checklist: item.detalhes.checklist.map((c) => ({
                          ...c,
                          feito: false,
                        })),
                        estrategia: {
                          ...estrategiaDe(item),
                          execucoes: [],
                          fechamento: estrategiaVazia().fechamento,
                          medicao: estrategiaVazia().medicao,
                        },
                      },
                    })
                  }
                >
                  <Copy size={17} />
                </button>
                <button
                  type="button"
                  className="pl-icon danger"
                  aria-label="Excluir planejamento"
                  disabled={ocupado}
                  onClick={() => setConfirmarExclusao(true)}
                >
                  <Trash2 size={17} />
                </button>
              </>
            )}
            <button
              type="button"
              className="pl-btn"
              disabled={ocupado}
              onClick={fecharSeguro}
            >
              Cancelar
            </button>
          </div>
          <button
            className="pl-btn primary"
            type="submit"
            disabled={ocupado || !dados.pronto}
          >
            <Save size={16} />
            {ocupado ? "Salvando…" : "Salvar planejamento"}
          </button>
        </footer>
        {confirmarExclusao && (
          <div className="pl-delete-confirm" role="alert">
            <p>
              Excluir “{item.titulo}”?
              {filhos.length > 0
                ? ` As ${filhos.length} ações da campanha também serão excluídas.`
                : ""}
            </p>
            <button
              type="button"
              className="pl-btn danger"
              disabled={ocupado}
              onClick={() => excluir(item)}
            >
              Sim, excluir
            </button>
            <button
              type="button"
              className="pl-btn"
              onClick={() => setConfirmarExclusao(false)}
            >
              Manter
            </button>
          </div>
        )}
      </form>
    </Painel>
  );
}
