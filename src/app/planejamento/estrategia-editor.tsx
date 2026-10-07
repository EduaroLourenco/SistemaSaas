"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Target, BookOpen, BarChart3, Plus } from "lucide-react";
import { type Dados, type Item, formatarData } from "@/lib/planejamento/modelo";
import {
  DECISOES,
  EXECUCOES,
  FOCOS,
  INDICADORES,
  estrategiaDe,
  execucaoVazia,
  type Estrategia,
  type Execucao,
} from "@/lib/planejamento/estrategia";
import {
  aprendizadosPara,
  destinosDoItem,
} from "@/lib/planejamento/prioridades";
import {
  temRecorte,
  type ResultadoPlanejamento,
} from "@/lib/planejamento/resultados";
import { Campo } from "./componentes";

type Props = { item: Item; dados: Dados; mudar: (e: Estrategia) => void };
export function EstrategiaEditor({ item, dados, mudar }: Props) {
  const e = estrategiaDe(item),
    anteriores = aprendizadosPara(item, dados);
  const atualizar = (p: Partial<Estrategia>) => mudar({ ...e, ...p });
  return (
    <div className="pl-stack">
      <div className="pl-strategy-intro">
        <Target size={21} />
        <div>
          <h3>Qual resultado queremos buscar?</h3>
          <p>
            Um objetivo claro ajuda a escolher a ação e avaliar o que aconteceu.
          </p>
        </div>
      </div>
      <Campo nome="Foco principal">
        <select
          value={e.foco}
          onChange={(ev) => atualizar({ foco: ev.target.value })}
        >
          <option value="">Escolher depois</option>
          {FOCOS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Campo>
      <Campo nome="Por que esta ação faz sentido?">
        <textarea
          rows={3}
          maxLength={10000}
          value={e.hipotese}
          onChange={(ev) => atualizar({ hipotese: ev.target.value })}
          placeholder="Ex.: A procura por este produto aumentou. Vamos melhorar o anúncio e testar Product Ads nesta conta."
        />
      </Campo>
      <div className="pl-two">
        <Campo nome="Como vamos medir?">
          <select
            value={e.indicador}
            onChange={(ev) =>
              atualizar({
                indicador: ev.target.value as Estrategia["indicador"],
                alvo: null,
                medicao: { valor: null, fonte: "", data: "" },
              })
            }
          >
            <option value="">Sem indicador definido</option>
            {Object.entries(INDICADORES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="Meta numérica">
          <input
            type="number"
            step="any"
            min={e.indicador === "margem" ? undefined : 0}
            value={e.alvo ?? ""}
            disabled={!e.indicador}
            onChange={(ev) =>
              atualizar({
                alvo: ev.target.value === "" ? null : Number(ev.target.value),
              })
            }
            placeholder="Ex.: 50"
          />
        </Campo>
      </div>
      {e.indicador === "personalizado" && (
        <Campo nome="Nome do indicador">
          <input
            maxLength={120}
            value={e.indicadorPersonalizado}
            onChange={(ev) =>
              atualizar({ indicadorPersonalizado: ev.target.value })
            }
            placeholder="Ex.: Cliques no banner"
          />
        </Campo>
      )}
      <p className="pl-note">
        Vendas, pedidos e unidades podem ser consultados no banco. ROAS,
        conversão, margem e demais indicadores são informados por você, com
        fonte e data. A meta não altera preços, ofertas ou anúncios.
      </p>
      {anteriores.length > 0 && (
        <section className="pl-context">
          <h3>
            <BookOpen size={16} /> O que já aprendemos com estes produtos
          </h3>
          {anteriores.map((a) => (
            <div key={a.id} className="pl-learning">
              <strong>{a.titulo}</strong>
              <small>
                {formatarData(a.fim)} ·{" "}
                {estrategiaDe(a).fechamento.decisao || "Aprendizado registrado"}
              </small>
              <p>{estrategiaDe(a).fechamento.proximoPasso}</p>
            </div>
          ))}
          <p className="pl-muted">
            Registros anteriores com produtos em comum e destinos compatíveis.
            Use como referência; o contexto pode ter mudado.
          </p>
        </section>
      )}
    </div>
  );
}

export function AnunciosEditor({
  item,
  dados,
  mudarItem,
}: {
  item: Item;
  dados: Dados;
  mudarItem: (p: Partial<Item>) => void;
}) {
  const [busca, setBusca] = useState(""),
    [limite, setLimite] = useState(30);
  const e = estrategiaDe(item),
    anuncios = dados.anuncios ?? [];
  const lista = anuncios.filter(
    (a) =>
      ((!item.canais.length && !item.contas.length) ||
        item.canais.includes(a.canal) ||
        item.contas.includes(a.conta)) &&
      (!item.skus.length ||
        item.skus.some((s) => s.toUpperCase() === a.sku.toUpperCase())) &&
      `${a.codigo} ${a.sku} ${a.titulo}`
        .toLowerCase()
        .includes(busca.toLowerCase()),
  );
  function selecionar(id: string) {
    const a = anuncios.find((a) => a.id === id),
      selecionado = e.anuncios.includes(id);
    mudarItem({
      ...(a && !selecionado
        ? {
            skus: [...new Set([...item.skus, ...(a.sku ? [a.sku] : [])])],
            contas: item.canais.includes(a.canal)
              ? item.contas
              : [...new Set([...item.contas, a.conta])],
          }
        : {}),
      detalhes: {
        ...item.detalhes,
        estrategia: {
          ...e,
          anuncios: selecionado
            ? e.anuncios.filter((x) => x !== id)
            : [...e.anuncios, id],
        },
      },
    });
  }
  return (
    <section className="pl-context pl-stack">
      <h3>Anúncios específicos · opcional</h3>
      <p className="pl-muted">
        Útil para diferenciar anúncios do mesmo SKU e contas do Mercado Livre.
        Com anúncios selecionados, a consulta de vendas considera somente esses
        anúncios, dentro dos canais escolhidos. Sem seleção, considera os SKUs.
      </p>
      {e.anuncios.length > 0 && (
        <div className="pl-chips">
          {e.anuncios.map((id) => (
            <button
              className="pl-chip selected"
              type="button"
              key={id}
              onClick={() => selecionar(id)}
              aria-label={`Remover anúncio ${anuncios.find((a) => a.id === id)?.codigo ?? id}`}
            >
              {anuncios.find((a) => a.id === id)?.codigo ??
                "Anúncio indisponível"}{" "}
              ×
            </button>
          ))}
        </div>
      )}
      <input
        aria-label="Buscar anúncio"
        value={busca}
        onChange={(ev) => {
          setBusca(ev.target.value);
          setLimite(30);
        }}
        placeholder="Código MLB, título ou SKU"
      />
      <div className="pl-ad-list">
        {lista.slice(0, limite).map((a) => (
          <button
            className={`pl-ad ${e.anuncios.includes(a.id) ? "selected" : ""}`}
            type="button"
            key={a.id}
            onClick={() => selecionar(a.id)}
            aria-pressed={e.anuncios.includes(a.id)}
          >
            <span>
              <strong>
                {a.codigo} · {a.tipo || "Anúncio"}
              </strong>
              <span>{a.titulo}</span>
              <small>
                {a.sku || "Sem SKU"} ·{" "}
                {dados.contas.find((c) => c.id === a.conta)?.nome ??
                  "Conta indisponível"}
              </small>
            </span>
            {e.anuncios.includes(a.id) ? (
              <Check size={17} />
            ) : (
              <Plus size={17} />
            )}
          </button>
        ))}
      </div>
      {!lista.length && (
        <p className="pl-muted">
          Nenhum anúncio encontrado neste recorte. Confira os produtos e canais
          selecionados.
        </p>
      )}
      {lista.length > limite && (
        <button
          className="pl-btn"
          type="button"
          onClick={() => setLimite((l) => l + 30)}
        >
          Mostrar mais anúncios ({lista.length})
        </button>
      )}
    </section>
  );
}

export function ExecucaoEditor({
  item,
  dados,
  mudar,
  alterado,
}: Props & { alterado: boolean }) {
  const e = estrategiaDe(item),
    destinos = destinosDoItem(item, dados);
  // Preserva histórico se o usuário mudar o recorte depois de executar.
  const extras = e.execucoes.filter(
    (x) => !destinos.some((d) => d.id === x.destino),
  );
  for (const x of extras) {
    const [tipo, id] = x.destino.split(":");
    destinos.push({
      id: x.destino,
      nome: `${tipo === "conta" ? (dados.contas.find((c) => c.id === id)?.nome ?? "Conta anterior") : tipo === "canal" ? (dados.canais.find((c) => c.id === id)?.nome ?? "Canal anterior") : "Ação geral"} · fora do recorte atual`,
    });
  }
  function execucao(destino: string, p: Partial<Execucao>) {
    const atual =
      e.execucoes.find((x) => x.destino === destino) ?? execucaoVazia(destino);
    mudar({
      ...e,
      execucoes: [
        ...e.execucoes.filter((x) => x.destino !== destino),
        { ...atual, ...p },
      ],
    });
  }
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  return (
    <div className="pl-stack">
      <div className="pl-strategy-intro">
        <Check size={21} />
        <div>
          <h3>O que aconteceu de verdade?</h3>
          <p>
            Registro manual. Planejado: {formatarData(item.inicio)} a{" "}
            {formatarData(item.fim)}. Nenhuma ação é publicada por esta tela.
          </p>
        </div>
      </div>
      {destinos.map((d) => {
        const x =
          e.execucoes.find((x) => x.destino === d.id) ?? execucaoVazia(d.id);
        return (
          <section className="pl-context pl-stack" key={d.id}>
            <h3>{d.nome}</h3>
            <Campo nome={`Execução · ${d.nome}`}>
              <select
                value={x.situacao}
                onChange={(ev) =>
                  execucao(d.id, {
                    situacao: ev.target.value as Execucao["situacao"],
                  })
                }
              >
                {EXECUCOES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Campo>
            <div className="pl-two">
              <Campo nome="Início real">
                <input
                  type="date"
                  max={hoje}
                  value={x.inicio}
                  onChange={(ev) => execucao(d.id, { inicio: ev.target.value })}
                />
              </Campo>
              <Campo nome="Fim real">
                <input
                  type="date"
                  min={x.inicio || undefined}
                  max={hoje}
                  value={x.fim}
                  onChange={(ev) => execucao(d.id, { fim: ev.target.value })}
                />
              </Campo>
            </div>
            <Campo nome="O que mudou ou impediu a execução?">
              <textarea
                rows={2}
                maxLength={10000}
                value={x.mudancas}
                onChange={(ev) => execucao(d.id, { mudancas: ev.target.value })}
                placeholder="Ex.: Promoção não ficou elegível; usamos outra seleção de anúncios."
              />
            </Campo>
            <Campo nome="Link de comprovação ou referência">
              <input
                type="url"
                maxLength={2000}
                value={x.evidencia}
                onChange={(ev) =>
                  execucao(d.id, { evidencia: ev.target.value })
                }
                placeholder="https://…"
              />
            </Campo>
            {extras.some((ex) => ex.destino === d.id) && (
              <button
                type="button"
                className="pl-link"
                onClick={() => {
                  if (
                    window.confirm(
                      "Remover este registro de execução do planejamento?",
                    )
                  )
                    mudar({
                      ...e,
                      execucoes: e.execucoes.filter(
                        (ex) => ex.destino !== d.id,
                      ),
                    });
                }}
              >
                Remover registro deste destino antigo
              </button>
            )}
          </section>
        );
      })}
      <Resultados item={item} operacao={dados.operacao} alterado={alterado} />
      <section className="pl-context pl-stack">
        <h3>Resultado informado por você</h3>
        <p className="pl-muted">
          Use o painel do canal ou outra fonte para ROAS, conversão, margem, CRM
          e indicadores próprios. Este valor fica separado da consulta de
          vendas.
        </p>
        {!e.indicador ? (
          <p>Escolha primeiro um indicador na aba Estratégia.</p>
        ) : (
          <>
            <Campo
              nome={`Resultado · ${e.indicador === "personalizado" ? e.indicadorPersonalizado : INDICADORES[e.indicador]}`}
            >
              <input
                type="number"
                step="any"
                min={e.indicador === "margem" ? undefined : 0}
                value={e.medicao.valor ?? ""}
                onChange={(ev) =>
                  mudar({
                    ...e,
                    medicao: {
                      ...e.medicao,
                      valor:
                        ev.target.value === "" ? null : Number(ev.target.value),
                    },
                  })
                }
              />
            </Campo>
            <div className="pl-two">
              <Campo nome="Fonte do resultado">
                <input
                  maxLength={2000}
                  value={e.medicao.fonte}
                  onChange={(ev) =>
                    mudar({
                      ...e,
                      medicao: { ...e.medicao, fonte: ev.target.value },
                    })
                  }
                  placeholder="Ex.: Product Ads · conta principal · período"
                />
              </Campo>
              <Campo nome="Data da consulta">
                <input
                  type="date"
                  max={hoje}
                  value={e.medicao.data}
                  onChange={(ev) =>
                    mudar({
                      ...e,
                      medicao: { ...e.medicao, data: ev.target.value },
                    })
                  }
                />
              </Campo>
            </div>
            {e.medicao.valor !== null && e.alvo !== null && (
              <p className="pl-note">
                Meta: {e.alvo.toLocaleString("pt-BR")} · Informado:{" "}
                {e.medicao.valor.toLocaleString("pt-BR")}. Compare usando a
                mesma fonte e o mesmo período.
              </p>
            )}
          </>
        )}
      </section>
      <section className="pl-context pl-stack">
        <h3>Um minuto para aprender</h3>
        <Campo nome="O que funcionou?">
          <textarea
            rows={2}
            maxLength={10000}
            value={e.fechamento.funcionou}
            onChange={(ev) =>
              mudar({
                ...e,
                fechamento: { ...e.fechamento, funcionou: ev.target.value },
              })
            }
          />
        </Campo>
        <Campo nome="O que atrapalhou?">
          <textarea
            rows={2}
            maxLength={10000}
            value={e.fechamento.problemas}
            onChange={(ev) =>
              mudar({
                ...e,
                fechamento: { ...e.fechamento, problemas: ev.target.value },
              })
            }
          />
        </Campo>
        <Campo nome="O que faria na próxima vez?">
          <textarea
            rows={2}
            maxLength={10000}
            value={e.fechamento.proximoPasso}
            onChange={(ev) =>
              mudar({
                ...e,
                fechamento: { ...e.fechamento, proximoPasso: ev.target.value },
              })
            }
            placeholder="Ex.: Preparar as imagens uma semana antes e separar os anúncios por conta."
          />
        </Campo>
        <Campo nome="Decisão para a próxima campanha">
          <select
            value={e.fechamento.decisao}
            onChange={(ev) =>
              mudar({
                ...e,
                fechamento: { ...e.fechamento, decisao: ev.target.value },
              })
            }
          >
            <option value="">Ainda não decidimos</option>
            {DECISOES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Campo>
      </section>
    </div>
  );
}

function Resultados({
  item,
  operacao,
  alterado,
}: {
  item: Item;
  operacao: string;
  alterado: boolean;
}) {
  const [resultado, setResultado] = useState<ResultadoPlanejamento | null>(
      null,
    ),
    [erro, setErro] = useState(""),
    [carregando, setCarregando] = useState(false);
  const controlador = useRef<AbortController | null>(null);
  useEffect(() => () => controlador.current?.abort(), []);
  async function consultar() {
    controlador.current?.abort();
    const ctrl = new AbortController();
    controlador.current = ctrl;
    setCarregando(true);
    setErro("");
    setResultado(null);
    try {
      const r = await fetch(
        `/api/planejamento/resultados?${new URLSearchParams({ id: item.id, operacao, revisao: String(item.revisao) })}`,
        { signal: ctrl.signal, cache: "no-store" },
      );
      const json = await r.json();
      if (!r.ok) throw new Error(json.erro || "Não foi possível consultar.");
      setResultado(json);
    } catch (err) {
      if (!ctrl.signal.aborted)
        setErro(err instanceof Error ? err.message : "Falha ao consultar.");
    } finally {
      if (!ctrl.signal.aborted) setCarregando(false);
    }
  }
  const e = estrategiaDe(item);
  const formatar = (n: number, moeda: boolean) =>
    moeda
      ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : n.toLocaleString("pt-BR");
  return (
    <section className="pl-context pl-stack">
      <h3>
        <BarChart3 size={16} /> Vendas no período planejado
      </h3>
      <p className="pl-muted">
        Consulta dos produtos nos canais selecionados. Não comprova vendas
        causadas pela campanha, nem calcula retorno de publicidade. Campanhas
        usam o próprio recorte; as seleções das ações filhas não são somadas
        automaticamente.
      </p>
      {(!item.id || alterado) && (
        <p className="pl-note">
          Salve e reabra este planejamento para consultar o recorte salvo.
        </p>
      )}
      {!temRecorte(item) && (
        <p className="pl-note">
          Escolha ao menos um canal, conta, SKU ou anúncio.
        </p>
      )}
      <button
        className="pl-btn"
        type="button"
        onClick={consultar}
        disabled={!item.id || alterado || !temRecorte(item) || carregando}
      >
        {carregando ? "Consultando…" : "Consultar vendas registradas"}
      </button>
      {erro && (
        <p role="alert" className="pl-error">
          {erro}
        </p>
      )}
      {resultado && !alterado && (
        <>
          <p>
            <strong>
              {formatarData(resultado.atual.inicio)} a{" "}
              {formatarData(resultado.atual.fim)}
            </strong>
            {resultado.parcial
              ? " · período parcial, inclui o dia de hoje"
              : ""}
          </p>
          <div className="pl-metrics">
            {(
              [
                ["receita", "Vendas de produtos"],
                ["pedidos", "Pedidos"],
                ["unidades", "Unidades"],
              ] as const
            ).map(([chave, titulo]) => (
              <div key={chave}>
                <small>{titulo}</small>
                <strong>
                  {resultado.atual.encontrados
                    ? formatar(resultado.atual[chave], chave === "receita")
                    : "Sem registros"}
                </strong>
                <span>
                  Anterior:{" "}
                  {resultado.anterior.encontrados
                    ? formatar(resultado.anterior[chave], chave === "receita")
                    : "sem registros"}
                </span>
                {e.indicador === chave && e.alvo !== null && (
                  <span>
                    Meta do período completo:{" "}
                    {formatar(e.alvo, chave === "receita")}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="pl-muted">
            Anterior: {formatarData(resultado.anterior.inicio)} a{" "}
            {formatarData(resultado.anterior.fim)}, com a mesma quantidade de
            dias e o mesmo recorte. Diferenças de calendário e outras ações
            podem influenciar a comparação.
          </p>
          <p className="pl-muted">
            Cancelados fora dos totais: {resultado.atual.cancelados} no período
            e {resultado.anterior.cancelados} no anterior. Pedidos retirados
            pelas exclusões de análise: {resultado.atual.excluidos} e{" "}
            {resultado.anterior.excluidos}, respectivamente. Vendas de produtos
            não descontam custos, taxas ou frete.
          </p>
          <p className="pl-note">
            Consultado em{" "}
            {new Date(resultado.consultadoEm).toLocaleString("pt-BR")}.{" "}
            {resultado.atual.ultimoRegistro
              ? `Última atualização entre os pedidos encontrados: ${new Date(resultado.atual.ultimoRegistro).toLocaleString("pt-BR")}. `
              : ""}
            A consulta não confirma que todas as vendas foram importadas.
            Ausência de registros não significa ausência de vendas.
          </p>
        </>
      )}
    </section>
  );
}

export function preparativosSugeridos(tipo: string): string[] {
  if (tipo === "Product Ads")
    return [
      "Escolher conta e anúncios para a campanha",
      "Definir orçamento e indicador no painel de publicidade",
      "Revisar anúncio e oferta antes de ativar a mídia",
      "Registrar resultado e período consultado no Product Ads",
    ];
  if (tipo === "Revisão de anúncio")
    return [
      "Conferir título, fotos, atributos e ficha do anúncio",
      "Revisar preço, condições e prazo apresentados",
      "Registrar as alterações e a data em que foram feitas",
    ];
  if (tipo === "Vitrine / Minha Página" || tipo === "Banner")
    return [
      "Definir mensagem, produtos e posição na vitrine",
      "Preparar e revisar as artes no formato do canal",
      "Conferir os links de destino",
      "Registrar quando a arte foi colocada no ar",
    ];
  if (["Promoção", "Preço", "Cupom"].includes(tipo))
    return [
      "Selecionar produtos, contas e anúncios",
      "Conferir elegibilidade e condições na Central de Promoções do canal",
      "Revisar preço e rentabilidade na área financeira",
      "Confirmar a execução no canal e registrar as datas",
    ];
  if (tipo === "CRM")
    return [
      "Definir segmento e canal de relacionamento",
      "Preparar mensagem, chamada e destino",
      "Revisar o conteúdo antes do envio no canal escolhido",
      "Registrar resultado e aprendizados",
    ];
  return [
    "Definir responsável e entregas",
    "Revisar os materiais e condições da ação",
    "Conferir a execução no canal",
    "Registrar resultado e próximo passo",
  ];
}
