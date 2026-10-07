"use client";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Layers,
  ArrowUpRight,
  Package,
  Check,
  Trash2,
} from "lucide-react";
import {
  type Dados,
  type Item,
  type Grupo,
  type Tipo,
  CORES,
  STATUS,
  TIPOS,
  novoItem,
  dataUTC,
  dataISO,
  somarDias,
  segunda,
  sobrepoe,
  formatarData,
} from "@/lib/planejamento/modelo";
import { oportunidades, type Oportunidade } from "@/lib/planejamento/sazonal";
import { Campo, Painel, Produtos, ResumoPromocao } from "./componentes";
import Calendario from "./calendario";
const Editor = dynamic(() => import("./editor"));
const Mapa = dynamic(() => import("./mapa"));
import Quadro from "./quadro";
import Ficha, { NovaCampanha } from "./ficha";
import EstudioShell from "./estudio-shell";
import {
  type ModeloCampanha,
  reagendar,
  acaoDaCampanha,
} from "@/lib/planejamento/estudio";
import Foco from "./foco";
import "./planejamento.css";
import "./estudio.css";

export default function Planejamento({
  dados: iniciais,
  hoje,
}: {
  dados: Dados;
  hoje: string;
}) {
  const [dados, setDados] = useState(iniciais),
    [referencia, setReferencia] = useState(hoje),
    [visao, setVisao] = useState("Mês"),
    [aba, setAba] = useState("Quadro");
  const [selecionada, setSelecionada] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [ficha, setFicha] = useState<Item | null>(null);
  const [projetoNovo, setProjetoNovo] = useState(false);
  const [emLote, setEmLote] = useState(false);
  const gravando = useRef(false);
  const [desfazer, setDesfazer] = useState<{
    anterior: Item;
    atual: Item;
  } | null>(null);
  const campanhaAtual =
    dados.itens.find(
      (i) => i.id === selecionada && i.natureza === "campanha",
    ) ?? null;
  const [canal, setCanal] = useState(""),
    [status, setStatus] = useState(""),
    [tipo, setTipo] = useState(""),
    [busca, setBusca] = useState(""),
    [sku, setSku] = useState("");
  const [sazonais, setSazonais] = useState(true),
    [promos, setPromos] = useState(false),
    [editor, setEditor] = useState<Item | null>(null),
    [editorKey, setEditorKey] = useState(0);
  const [painel, setPainel] = useState<
      "datas" | "grupo" | "tipos" | "promo" | null
    >(null),
    [grupo, setGrupo] = useState<Grupo>({
      id: "",
      operacao_id: dados.operacao,
      nome: "",
      skus: [],
      revisao: 0,
    });
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const [categoria, setCategoria] = useState("Relevantes"),
    [anoTodo, setAnoTodo] = useState(false),
    [buscaDatas, setBuscaDatas] = useState("");
  const [tipoNome, setTipoNome] = useState(""),
    [tipoCor, setTipoCor] = useState(CORES[2]),
    [promoId, setPromoId] = useState("");
  const ano = Number(referencia.slice(0, 4)),
    mes = referencia.slice(0, 7);
  const biblioteca = oportunidades(ano);
  const datasVisiveis = biblioteca.filter((o) =>
    categoria === "Todas" || categoria === "Relevantes"
      ? ["Comércio", "Casa"].includes(o.categoria) || categoria === "Todas"
      : o.categoria === categoria,
  );
  const itens = dados.itens.filter(
    (i) =>
      (!selecionada ||
        (selecionada === "soltas"
          ? i.natureza === "acao" && !i.campanha_id
          : i.id === selecionada || i.campanha_id === selecionada)) &&
      (!status || i.status === status) &&
      (!tipo || i.tipo === tipo) &&
      (!canal ||
        i.canais.includes(canal) ||
        i.contas.includes(canal) ||
        dados.contas.some(
          (c) => c.id === canal && i.canais.includes(c.canal_id),
        ) ||
        dados.contas.some(
          (c) => c.canal_id === canal && i.contas.includes(c.id),
        )) &&
      (!sku ||
        i.skus.some((s) => s.toLowerCase().includes(sku.toLowerCase()))) &&
      (!busca ||
        `${i.titulo} ${i.detalhes.objetivo} ${i.detalhes.responsavel} ${i.tipo}`
          .toLowerCase()
          .includes(busca.toLowerCase())),
  );
  const inicio = visao === "Mês" ? `${mes}-01` : segunda(referencia),
    fim =
      visao === "Mês"
        ? dataISO(new Date(Date.UTC(ano, Number(mes.slice(5)), 0, 12)))
        : somarDias(inicio, 6);
  const noPeriodo = itens.filter((i) => sobrepoe(i.inicio, i.fim, inicio, fim));
  const proximas = datasVisiveis
    .filter((o) => o.data >= referencia)
    .slice(0, 3);
  function abrir(i: Item) {
    setFicha(null);
    setPainel(null);
    setErro("");
    setEditor(structuredClone(i));
    setEditorKey((k) => k + 1);
  }
  function novo(data = referencia, natureza: Item["natureza"] = "acao") {
    if (natureza === "campanha") {
      setProjetoNovo(true);
      setErro("");
      return;
    }
    abrirFicha(acaoDaCampanha(data, campanhaAtual));
  }
  function abrirFicha(i: Item) {
    setEditor(null);
    setPainel(null);
    setErro("");
    setFicha(structuredClone(i));
  }
  function selecionar(id: string) {
    setSelecionada(id);
    if (!["Quadro", "Mapa", "Calendário", "Onde focar agora"].includes(aba))
      setAba("Quadro");
  }
  function mudarPeriodo(delta: number) {
    if (visao !== "Mês") setReferencia(somarDias(referencia, delta * 7));
    else {
      const d = dataUTC(referencia);
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + delta);
      if (d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100)
        setReferencia(dataISO(d));
    }
  }
  async function persistir(
    entidade: "item" | "grupo" | "tipo",
    registro: Item | Grupo | Tipo,
    excluir = false,
  ) {
    if (gravando.current) return null;
    gravando.current = true;
    setOcupado(true);
    setErro("");
    try {
      const resposta = await fetch("/api/planejamento", {
        method: excluir ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entidade, registro, operacao: dados.operacao }),
      });
      const r = await resposta.json();
      if (!resposta.ok) throw new Error(r.erro || "Não foi possível salvar.");
      setDados((d) => {
        if (entidade === "item")
          return {
            ...d,
            itens: excluir
              ? d.itens.filter(
                  (i) => i.id !== registro.id && i.campanha_id !== registro.id,
                )
              : [...d.itens.filter((i) => i.id !== r.registro.id), r.registro],
          };
        if (entidade === "grupo")
          return {
            ...d,
            grupos: excluir
              ? d.grupos.filter((i) => i.id !== registro.id)
              : [...d.grupos.filter((i) => i.id !== r.registro.id), r.registro],
          };
        return {
          ...d,
          tipos: excluir
            ? d.tipos.filter((i) => i.id !== registro.id)
            : [...d.tipos.filter((i) => i.id !== r.registro.id), r.registro],
        };
      });
      setAviso(excluir ? "Registro excluído." : "Planejamento salvo.");
      setDesfazer(null);
      if (entidade === "item" && excluir && selecionada === registro.id)
        setSelecionada("");
      return r;
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : "Não foi possível salvar. Tente novamente.",
      );
      return null;
    } finally {
      gravando.current = false;
      setOcupado(false);
    }
  }
  async function criarAcao(i: Item): Promise<boolean> {
    const r = await persistir("item", i);
    if (!r) return false;
    setDesfazer(null);
    if (i.natureza === "campanha" && !i.id) selecionar(r.registro.id);
    return true;
  }
  async function atualizarRapido(i: Item): Promise<boolean> {
    if (gravando.current || emLote || !dados.pronto) return false;
    const anterior = dados.itens.find((a) => a.id === i.id);
    if (!anterior) return false;
    setDados((d) => ({
      ...d,
      itens: d.itens.map((a) => (a.id === i.id ? i : a)),
    }));
    const r = await persistir("item", i);
    if (!r) {
      setDados((d) => ({
        ...d,
        itens: d.itens.map((a) => (a.id === i.id ? anterior : a)),
      }));
      return false;
    }
    setDesfazer({ anterior, atual: r.registro });
    setAviso("Alteração salva");
    return true;
  }
  async function desfazerMudanca() {
    if (!desfazer || ocupado) return;
    const r = await persistir("item", {
      ...desfazer.anterior,
      revisao: desfazer.atual.revisao,
    });
    if (r) {
      setDesfazer(null);
      setAviso("Alteração desfeita");
    }
  }
  async function criarProjeto(
    titulo: string,
    inicio: string,
    modelo: ModeloCampanha,
  ) {
    if (emLote || ocupado) return;
    setEmLote(true);
    setDesfazer(null);
    try {
      const base = novoItem(inicio, "campanha");
      const r = await persistir("item", {
        ...base,
        titulo,
        fim: somarDias(inicio, modelo.dias - 1),
        cor: modelo.cor,
        detalhes: { ...base.detalhes, objetivo: modelo.objetivo },
      });
      if (!r) return;
      let criadas = 0;
      for (const acao of modelo.acoes) {
        const i = novoItem(somarDias(inicio, acao.dia));
        const salva = await persistir("item", {
          ...i,
          campanha_id: r.registro.id,
          titulo: acao.titulo,
          tipo: acao.tipo,
          etapa: acao.etapa,
          fim: somarDias(i.inicio, acao.dias - 1),
          cor: modelo.cor,
          detalhes: { ...i.detalhes, ordem: Date.now() },
        });
        if (!salva) break;
        criadas++;
      }
      setSelecionada(r.registro.id);
      setAba("Quadro");
      setProjetoNovo(false);
      if (criadas < modelo.acoes.length) {
        setAviso("");
        setErro(
          `Campanha salva com ${criadas} de ${modelo.acoes.length} ações. Não foi possível criar as demais; você pode adicioná-las pelo quadro.`,
        );
      } else
        setAviso(
          modelo.acoes.length
            ? "Sua campanha está pronta para ganhar forma"
            : "Campanha criada",
        );
    } finally {
      setEmLote(false);
    }
  }
  function planejar(o: Oportunidade) {
    const i = novoItem(somarDias(o.data, -14), "campanha");
    abrirFicha({
      ...i,
      titulo: o.nome,
      fim: somarDias(o.data, 2),
      detalhes: {
        ...i.detalhes,
        objetivo: `Planejar as ações de ${o.nome}`,
        briefing: `Data principal: ${formatarData(o.data)}.\n${o.ideia}\n\nReferência: ${o.fonte}`,
        checklist: [
          "Definir objetivo e público",
          "Selecionar produtos, se necessário",
          "Preparar banner e conteúdos",
          "Revisar mensagem e condições",
          "Conferir execução na data",
          "Registrar aprendizados após a campanha",
        ].map((texto) => ({ texto, feito: false })),
      },
    });
  }
  function novoGrupo() {
    setErro("");
    setGrupo({
      id: "",
      operacao_id: dados.operacao,
      nome: "",
      skus: [],
      revisao: 0,
    });
    setPainel("grupo");
  }
  function limpar() {
    setBusca("");
    setSku("");
    setCanal("");
    setStatus("");
    setTipo("");
  }
  const quantidadeFiltros = [canal, status, tipo, busca, sku].filter(
    Boolean,
  ).length;
  return (
    <div className="pl-root st-studio">
      <EstudioShell
        dados={dados}
        selecionada={selecionada}
        selecionar={selecionar}
        aba={aba}
        mudarAba={setAba}
        criarCampanha={() => {
          setProjetoNovo(true);
          setErro("");
        }}
        criarAcao={() => novo()}
        datas={() => setPainel("datas")}
        grupos={() => setAba("Grupos de produtos")}
        tipos={() => setPainel("tipos")}
        busca={busca}
        buscar={setBusca}
        filtros={quantidadeFiltros}
        filtrar={() => setMostrarFiltros((v) => !v)}
        aviso={aviso}
        erro={!ficha && !editor && !painel && !projetoNovo ? erro : ""}
        dispensar={() => {
          setAviso("");
          setErro("");
        }}
        desfazer={desfazer ? () => void desfazerMudanca() : null}
        ocupado={ocupado || emLote}
        editar={abrir}
        proximas={proximas}
        planejar={planejar}
      >
        {mostrarFiltros && aba !== "Grupos de produtos" && (
          <div className="pl-filters">
            <div className="pl-search">
              <Search size={16} />
              <input
                aria-label="Buscar nos filtros"
                placeholder="Buscar ação, campanha, responsável…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <select
              aria-label="Filtrar canal ou conta"
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
            >
              <option value="">Todos os canais</option>
              <optgroup label="Canais">
                {dados.canais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Contas">
                {dados.contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </optgroup>
            </select>
            <select
              aria-label="Filtrar situação"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todas as situações</option>
              {STATUS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filtrar tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="">Todos os tipos</option>
              <option>Campanha</option>
              {[...new Set([...TIPOS, ...dados.tipos.map((t) => t.nome)])].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
            <input
              className="pl-sku-filter"
              aria-label="Filtrar por SKU"
              list="pl-skus"
              placeholder="Filtrar SKU…"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
            <datalist id="pl-skus">
              {dados.produtos.map((p) => (
                <option value={p.sku} key={p.sku}>
                  {p.titulo}
                </option>
              ))}
            </datalist>
            {quantidadeFiltros > 0 && (
              <button className="pl-link" onClick={limpar}>
                Limpar ({quantidadeFiltros})
              </button>
            )}
          </div>
        )}
        {aba === "Quadro" && (
          <Quadro
            key={selecionada || "geral"}
            itens={itens}
            dados={dados}
            campanha={campanhaAtual}
            hoje={hoje}
            abrir={abrirFicha}
            criar={criarAcao}
            atualizar={atualizarRapido}
            ocupado={ocupado || emLote || !dados.pronto}
            novaCampanha={() => setProjetoNovo(true)}
          />
        )}
        {aba === "Mapa" && (
          <Mapa
            key={selecionada || "geral"}
            itens={
              !selecionada
                ? dados.itens.filter((i) =>
                    itens.some(
                      (visivel) =>
                        visivel.id === i.id || visivel.campanha_id === i.id,
                    ),
                  )
                : itens
            }
            dados={dados}
            campanha={campanhaAtual}
            abrir={abrirFicha}
            selecionar={selecionar}
            atualizar={atualizarRapido}
            ocupado={ocupado || emLote || !dados.pronto}
            avulsas={selecionada === "soltas"}
            novo={() =>
              campanhaAtual || selecionada === "soltas"
                ? novo()
                : setProjetoNovo(true)
            }
          />
        )}
        {aba === "Calendário" && (
          <section className="pl-calendar-panel">
            <div className="pl-calendar-toolbar">
              <div className="pl-inline">
                <button
                  className="pl-icon"
                  aria-label="Período anterior"
                  onClick={() => mudarPeriodo(-1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <h3>
                  {dataUTC(referencia).toLocaleDateString("pt-BR", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </h3>
                <button
                  className="pl-icon"
                  aria-label="Próximo período"
                  onClick={() => mudarPeriodo(1)}
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  className="pl-btn small"
                  onClick={() => setReferencia(hoje)}
                >
                  Hoje
                </button>
                <input
                  type="date"
                  aria-label="Ir para uma data"
                  min="2000-01-01"
                  max="2100-12-31"
                  value={referencia}
                  onChange={(e) => {
                    if (e.target.value) setReferencia(e.target.value);
                  }}
                />
              </div>
              <div className="pl-segment" aria-label="Visão do calendário">
                {["Mês", "Semana", "Por canal"].map((v) => (
                  <button
                    key={v}
                    className={visao === v ? "active" : ""}
                    onClick={() => setVisao(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="pl-calendar-options">
              <div className="pl-inline">
                <label>
                  <input
                    type="checkbox"
                    checked={sazonais}
                    onChange={(e) => setSazonais(e.target.checked)}
                  />
                  Datas sazonais
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={promos}
                    onChange={(e) => setPromos(e.target.checked)}
                  />
                  Promoções registradas
                </label>
              </div>
              <span>
                {visao !== "Mês"
                  ? `${formatarData(inicio)} — ${formatarData(fim)} · `
                  : ""}
                {noPeriodo.length} planejamentos no período
              </span>
            </div>
            <Calendario
              referencia={referencia}
              visao={visao}
              hoje={hoje}
              itens={itens}
              oportunidades={sazonais ? datasVisiveis : []}
              dados={dados}
              mostrarPromos={promos}
              abrir={abrirFicha}
              mover={async (item, data) => {
                const proximo = reagendar(item, data);
                if (proximo) await atualizarRapido(proximo);
              }}
              ocupado={ocupado || emLote || !dados.pronto}
              criar={(d) => novo(d)}
              oportunidade={planejar}
              promocao={(id) => {
                setPromoId(id);
                setPainel("promo");
              }}
              filtrarCanal={canal}
              sku={sku}
            />
            {promos &&
              dados.promocoes.some((p) => p.ativa && (!p.inicio || !p.fim)) && (
                <p className="pl-note">
                  Há promoções sem início ou fim informado. Consulte a Central
                  de Promoções; elas não são posicionadas no calendário.
                </p>
              )}
          </section>
        )}
        {aba === "Onde focar agora" && (
          <Foco
            dados={dados}
            itens={itens}
            hoje={hoje}
            abrir={abrir}
            planejar={planejar}
          />
        )}
        {aba === "Grupos de produtos" && (
          <section>
            <div className="pl-section-title">
              <div>
                <h3>Seleções que você pode reutilizar</h3>
                <p>Monte o mix uma vez e leve para quantas campanhas quiser.</p>
              </div>
              <button className="pl-btn primary" onClick={novoGrupo}>
                <Plus size={15} />
                Novo grupo
              </button>
            </div>
            <div className="pl-campaigns">
              {dados.grupos.map((g) => (
                <button
                  className="pl-campaign"
                  key={g.id}
                  onClick={() => {
                    setGrupo(structuredClone(g));
                    setErro("");
                    setPainel("grupo");
                  }}
                >
                  <Layers size={22} />
                  <h3>{g.nome}</h3>
                  <p>{g.skus.length} produtos</p>
                  <div className="pl-chips">
                    {g.skus.slice(0, 5).map((s) => (
                      <span className="pl-chip" key={s}>
                        {s}
                      </span>
                    ))}
                    {g.skus.length > 5 && <span>+{g.skus.length - 5}</span>}
                  </div>
                </button>
              ))}
            </div>
            {!dados.grupos.length && (
              <div className="pl-empty">
                <Package size={32} />
                <h3>Qual é o seu próximo mix?</h3>
                <p>
                  “Favoritos da loja”, “Seleção para o Dia das Mães” ou o nome
                  que fizer sentido para você.
                </p>
                <button className="pl-btn" onClick={novoGrupo}>
                  Criar primeiro grupo
                </button>
              </div>
            )}
          </section>
        )}
      </EstudioShell>
      {projetoNovo && (
        <NovaCampanha
          hoje={referencia}
          salvar={criarProjeto}
          fechar={() => setProjetoNovo(false)}
          ocupado={ocupado || emLote}
          erro={erro}
          pronto={dados.pronto}
        />
      )}
      {ficha && (
        <Ficha
          key={ficha.id || "nova"}
          inicial={ficha}
          dados={dados}
          salvar={async (i) => {
            if (await criarAcao(i)) {
              setFicha(null);
              return true;
            }
            return false;
          }}
          fechar={() => setFicha(null)}
          detalhar={abrir}
          ocupado={ocupado || emLote}
          erro={erro}
        />
      )}
      {editor && (
        <Editor
          key={editorKey}
          inicial={editor}
          dados={dados}
          ocupado={ocupado}
          erro={erro}
          salvar={async (i) => {
            if (await persistir("item", i)) setEditor(null);
          }}
          excluir={async (i) => {
            if (await persistir("item", i, true)) setEditor(null);
          }}
          fechar={() => setEditor(null)}
          abrir={abrir}
        />
      )}
      {painel === "datas" && (
        <Painel
          titulo="Biblioteca de oportunidades"
          subtitulo="Datas como ponto de partida. O planejamento é seu."
          fechar={() => setPainel(null)}
        >
          <div className="pl-drawer-body pl-stack">
            <div className="pl-two">
              <Campo nome="Ano">
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={ano}
                  onChange={(e) => {
                    const a = Number(e.target.value);
                    if (a >= 2000 && a <= 2100) setReferencia(`${a}-01-01`);
                  }}
                />
              </Campo>
              <Campo nome="Temas">
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                >
                  {[
                    "Relevantes",
                    "Todas",
                    "Comércio",
                    "Casa",
                    "Conteúdo",
                    "Nicho",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Campo>
            </div>
            <input
              aria-label="Buscar data comemorativa"
              placeholder="Buscar uma data…"
              value={buscaDatas}
              onChange={(e) => setBuscaDatas(e.target.value)}
            />
            <label className="pl-inline">
              <input
                type="checkbox"
                checked={anoTodo}
                onChange={(e) => setAnoTodo(e.target.checked)}
              />
              Mostrar o ano inteiro
            </label>
            <p className="pl-muted">
              Base: Sebrae, com conferência das datas móveis na Nuvemshop. Datas
              anuais são recorrentes; eventos de marketplaces só devem ser
              adicionados após confirmação do canal.
            </p>
            {datasVisiveis
              .filter(
                (o) =>
                  (anoTodo || o.data.slice(0, 7) === mes) &&
                  o.nome.toLowerCase().includes(buscaDatas.toLowerCase()),
              )
              .map((o) => (
                <article className="pl-season" key={o.id}>
                  <div className="pl-between">
                    <span className="pl-badge">{formatarData(o.data)}</span>
                    <small>{o.categoria}</small>
                  </div>
                  <h3>{o.nome}</h3>
                  <p>{o.ideia}</p>
                  <small>{o.regra} · Referência consultada em 05/10/2026</small>
                  <div className="pl-between">
                    <a
                      href={o.fonte}
                      target="_blank"
                      rel="noreferrer"
                      className="pl-link"
                    >
                      Consultar fonte <ArrowUpRight size={13} />
                    </a>
                    <button className="pl-btn" onClick={() => planejar(o)}>
                      Planejar esta data
                    </button>
                  </div>
                </article>
              ))}
            <p className="pl-note">
              Esquenta e pós-campanha são períodos editáveis da sua estratégia.
              Você também pode criar datas e campanhas próprias pelo botão “Nova
              campanha”.
            </p>
          </div>
        </Painel>
      )}
      {painel === "grupo" && (
        <Painel
          titulo={grupo.id ? "Editar grupo" : "Novo grupo de produtos"}
          subtitulo="Uma seleção reutilizável, com produtos do seu catálogo."
          fechar={() => {
            if (
              !ocupado &&
              window.confirm(
                "Fechar o grupo? Alterações não salvas serão descartadas.",
              )
            )
              setPainel(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await persistir("grupo", grupo)) setPainel(null);
            }}
          >
            <div className="pl-drawer-body pl-stack">
              <Campo nome="Nome do grupo *">
                <input
                  required
                  maxLength={100}
                  value={grupo.nome}
                  onChange={(e) =>
                    setGrupo((g) => ({ ...g, nome: e.target.value }))
                  }
                  placeholder="Ex.: Colchões de casal · destaque"
                />
              </Campo>
              <Produtos
                catalogo={dados.produtos}
                selecionados={grupo.skus}
                mudar={(skus) => setGrupo((g) => ({ ...g, skus }))}
              />
              <p className="pl-note">
                Editar este grupo não altera produtos de campanhas já salvas.
              </p>
              {erro && (
                <p className="pl-error" role="alert">
                  {erro}
                </p>
              )}
            </div>
            <footer className="pl-drawer-foot">
              {grupo.id ? (
                <button
                  type="button"
                  disabled={ocupado}
                  className="pl-btn danger"
                  onClick={async () => {
                    if (
                      window.confirm(
                        "Excluir este grupo? As campanhas já salvas serão preservadas.",
                      ) &&
                      (await persistir("grupo", grupo, true))
                    )
                      setPainel(null);
                  }}
                >
                  <Trash2 size={15} />
                  Excluir grupo
                </button>
              ) : (
                <span />
              )}
              <button
                className="pl-btn primary"
                disabled={ocupado || !dados.pronto}
              >
                Salvar grupo
              </button>
            </footer>
          </form>
        </Painel>
      )}
      {painel === "tipos" && (
        <Painel
          titulo="Seu jeito de fazer marketing"
          subtitulo="Além dos tipos prontos, crie ações com o nome que você usa."
          fechar={() => setPainel(null)}
        >
          <div className="pl-drawer-body pl-stack">
            <div className="pl-chips">
              {TIPOS.map((t) => (
                <span key={t} className="pl-chip">
                  {t}
                </span>
              ))}
            </div>
            <h3>Tipos personalizados</h3>
            {dados.tipos.map((t) => (
              <div className="pl-between" key={t.id}>
                <span>
                  <span className="pl-dot" style={{ background: t.cor }} />{" "}
                  {t.nome}
                </span>
                <button
                  disabled={ocupado}
                  className="pl-icon danger"
                  aria-label={`Excluir tipo ${t.nome}`}
                  onClick={async () => {
                    if (
                      window.confirm(
                        "Remover este tipo da lista? As ações existentes serão preservadas.",
                      )
                    )
                      await persistir("tipo", t, true);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <form
              className="pl-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await persistir("tipo", {
                    id: "",
                    operacao_id: dados.operacao,
                    nome: tipoNome,
                    cor: tipoCor,
                    revisao: 0,
                  })
                )
                  setTipoNome("");
              }}
            >
              <Campo nome="Nome do novo tipo">
                <input
                  required
                  maxLength={60}
                  value={tipoNome}
                  onChange={(e) => setTipoNome(e.target.value)}
                  placeholder="Ex.: Parceria com influenciador"
                />
              </Campo>
              <div className="pl-colors">
                {CORES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    aria-label={`Cor ${c}`}
                    aria-pressed={c === tipoCor}
                    style={{ background: c }}
                    onClick={() => setTipoCor(c)}
                  >
                    {c === tipoCor && <Check size={16} />}
                  </button>
                ))}
              </div>
              <button
                className="pl-btn primary"
                disabled={ocupado || !dados.pronto}
              >
                <Plus size={15} />
                Criar tipo de ação
              </button>
            </form>
            {erro && (
              <p className="pl-error" role="alert">
                {erro}
              </p>
            )}
          </div>
        </Painel>
      )}
      {painel === "promo" && (
        <Painel
          titulo="Promoção registrada"
          subtitulo="Informação de contexto. O planejamento não modifica esta oferta."
          fechar={() => setPainel(null)}
        >
          <div className="pl-drawer-body">
            {dados.promocoes
              .filter((p) => p.id === promoId)
              .map((p) => (
                <ResumoPromocao key={p.id} promocao={p} dados={dados} />
              ))}
            <a className="pl-link" href="/promocoes/campanhas">
              Abrir Central de Promoções <ArrowUpRight size={14} />
            </a>
          </div>
        </Painel>
      )}
      {!dados.pronto && (
        <div className="pl-setup">
          <p>
            Você pode explorar o calendário. Para salvar, conclua a configuração
            do planejamento no banco.
          </p>
          <button
            className="pl-btn"
            onClick={() => {
              window.location.reload();
            }}
          >
            Verificar novamente
          </button>
        </div>
      )}
    </div>
  );
}
