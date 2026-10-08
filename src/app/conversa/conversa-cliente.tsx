"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button } from "@/components/ui/primitives";
import { ErroComSaida } from "@/components/ui/leitura";
import { cn } from "@/lib/utils";
import { Send, Loader2, Database, Sparkles, RotateCcw, TrendingUp, Ban, Package, MousePointerClick, ChevronRight } from "lucide-react";

/**
 * Conversa sobre a operação.
 *
 * As consultas aparecem enquanto acontecem, em vez de a tela ficar em
 * branco esperando. Duas razões: uma pergunta boa gasta várias consultas e
 * vinte segundos de silêncio parecem travamento; e ver QUAIS dados foram
 * lidos é o que permite julgar a resposta em vez de aceitá-la.
 */

type Papel = "user" | "assistant";
type Consulta = { nome: string; entrada: Record<string, unknown> };
type Mensagem = { papel: Papel; texto: string; consultas?: Consulta[] };

const SUGESTOES = [
  "O que aconteceu na última semana?",
  "Quais canais mais cancelam, e quanto isso custou?",
  "Quais SKUs concentram a receita?",
  "A conversão do Mercado Livre caiu? Em quais anúncios?",
];

const NOME_CONSULTA: Record<string, string> = {
  contexto_operacao: "Olhando o panorama da operação",
  vendas_por_periodo: "Consultando vendas",
  produtos_vendidos: "Consultando produtos",
  desempenho_anuncios: "Consultando desempenho dos anúncios",
  cancelamentos: "Consultando cancelamentos",
};

export default function Conversa() {
  const [mensagens, setMensagens] = React.useState<Mensagem[]>([]);
  const [entrada, setEntrada] = React.useState("");
  const [pensando, setPensando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aguardando, setAguardando] = React.useState<string | null>(null);
  const fim = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, pensando]);

  async function perguntar(pergunta: string) {
    const limpa = pergunta.trim();
    if (!limpa || pensando) return;

    setErro(null);
    setAguardando(null);
    setEntrada("");

    const historico: Mensagem[] = [
      ...mensagens,
      { papel: "user", texto: limpa },
    ];
    setMensagens([...historico, { papel: "assistant", texto: "", consultas: [] }]);
    setPensando(true);

    try {
      const res = await fetch("/api/conversa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mensagens: historico.map((m) => ({
            role: m.papel,
            content: m.texto,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        setErro(json?.erro ?? `O servidor respondeu ${res.status}.`);
        setMensagens(historico);
        return;
      }

      const leitor = res.body.getReader();
      const decodificador = new TextDecoder();
      let restante = "";

      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;

        restante += decodificador.decode(value, { stream: true });
        // Um pacote pode cortar um evento ao meio: guarda o pedaço final
        // e só processa o que estiver completo.
        const partes = restante.split("\n\n");
        restante = partes.pop() ?? "";

        for (const parte of partes) {
          if (!parte.startsWith("data: ")) continue;
          let evento: {
            tipo: string;
            texto?: string;
            nome?: string;
            entrada?: Record<string, unknown>;
            mensagem?: string;
          };
          try {
            evento = JSON.parse(parte.slice(6));
          } catch {
            continue;
          }

          if (evento.tipo === "texto" && evento.texto) {
            setMensagens((ms) => {
              const copia = [...ms];
              const ultima = copia[copia.length - 1];
              copia[copia.length - 1] = {
                ...ultima,
                texto: ultima.texto + evento.texto,
              };
              return copia;
            });
          } else if (evento.tipo === "consulta" && evento.nome) {
            setMensagens((ms) => {
              const copia = [...ms];
              const ultima = copia[copia.length - 1];
              copia[copia.length - 1] = {
                ...ultima,
                consultas: [
                  ...(ultima.consultas ?? []),
                  { nome: evento.nome!, entrada: evento.entrada ?? {} },
                ],
              };
              return copia;
            });
          } else if (evento.tipo === "aguardando") {
            setAguardando(evento.mensagem ?? null);
          } else if (evento.tipo === "texto" || evento.tipo === "fim") {
            setAguardando(null);
          }
          if (evento.tipo === "erro") {
            setErro(evento.mensagem ?? "Falha na conversa.");
          }
        }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha de rede.");
    } finally {
      setPensando(false);
      setAguardando(null);
    }
  }

  const vazio = mensagens.length === 0;

  /*
   * Layout da referência aprovada de Conversar, com o que o sistema tem:
   * o chat num painel com a pergunta fixa embaixo, e ao lado as sugestões
   * e como a resposta é feita. A coluna de histórico de conversas e o
   * painel de filtro de contexto da referência ficam de fora — não há
   * conversa salva nem filtro de contexto na IA, e o pacote do redesenho
   * proíbe inventar funcionalidade.
   */
  return (
    <>
      <PageHeader
        title="Conversar"
        breadcrumb="Operação"
        description="Converse sobre vendas, produtos e anúncios"
      />

      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
          <Panel className="lg:col-span-2 flex flex-col overflow-hidden min-w-0 h-[calc(100dvh-var(--topbar)-220px)] min-h-[400px] lg:h-[calc(100dvh-var(--topbar)-170px)] lg:min-h-[520px]">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-wash text-brand">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">
                  {vazio ? "Nova conversa" : "Conversa sobre a operação"}
                </span>
                <span className="block text-[12px] text-ink-3">
                  {vazio ? "Escolha uma sugestão ou escreva abaixo" : `${mensagens.filter((m) => m.papel === "user").length} pergunta(s)`}
                </span>
              </span>
              {!vazio && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setMensagens([]);
                    setErro(null);
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.25} />
                  Nova conversa
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
              {vazio && (
                <div className="m-auto flex max-w-md flex-col items-center gap-2 py-8 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-wash text-brand">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <p className="text-[15px] font-semibold text-ink">Pergunte sobre a operação</p>
                  <p className="text-[13px] text-ink-2 leading-relaxed">
                    Compare resultados, encontre quedas e tire dúvidas.
                    As fontes consultadas acompanham cada resposta.
                  </p>
                </div>
              )}

              {mensagens.map((m, i) => (
                <Bolha key={i} mensagem={m} pensando={pensando && i === mensagens.length - 1} />
              ))}

              {aguardando && (
                <span className="inline-flex items-center gap-2 text-[12.5px] text-warn">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {aguardando}
                </span>
              )}

              {erro && (
                <ErroComSaida
                  titulo="A conversa não completou"
                  causa={erro}
                  passo={
                    erro.toLowerCase().includes("chave")
                      ? "A própria mensagem acima diz onde pegar a chave e em qual variável colocá-la. Depois de salvar, reinicie o servidor."
                      : erro.toLowerCase().includes("limite")
                      ? "Espere um minuto e pergunte de novo. Se acontecer sempre, vale trocar de provedor em IA_PROVEDOR."
                      : erro.toLowerCase().includes("sobrecarregado")
                      ? "Não é a sua pergunta. Espere um minuto e mande de novo — o servidor já tentou algumas vezes sozinho."
                      : "Tente de novo. Se persistir, me diga o que apareceu."
                  }
                />
              )}

              <div ref={fim} />
            </div>

            <div className="border-t border-line px-4 py-3 flex flex-col gap-2.5">
              {!vazio && !pensando && (
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => perguntar(s)}
                      className="shrink-0 rounded-full border border-line-2 bg-panel px-3 py-1.5 text-[12.5px] text-ink-2 hover:text-ink hover:bg-panel-3"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  perguntar(entrada);
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter envia, Shift+Enter quebra linha: é a convenção que
                    // as pessoas já têm no dedo.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      perguntar(entrada);
                    }
                  }}
                  rows={1}
                  aria-label="Sua pergunta"
                  placeholder="Pergunte sobre vendas, produtos, anúncios…"
                  disabled={pensando}
                  className="flex-1 min-w-0 resize-none px-3 py-2.5 rounded-r1 bg-panel-2 border border-line-2 text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-wash disabled:opacity-60 max-h-[140px]"
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!entrada.trim() || pensando}
                  aria-label="Enviar pergunta"
                  className="h-[44px] px-3.5 shrink-0"
                >
                  {pensando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={2.25} />}
                </Button>
              </form>
            </div>
          </Panel>

          <div className="flex flex-col gap-3 min-w-0">
            <Panel className="overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[15px] font-semibold text-ink">Sugestões</p>
                <p className="text-[12px] text-ink-3">Comece com uma pergunta</p>
              </div>
              <div className="flex flex-col gap-2 px-3 pb-3">
                {SUGESTOES.map((s, i) => {
                  const Icone = [TrendingUp, Ban, Package, MousePointerClick][i] ?? Sparkles;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => perguntar(s)}
                      disabled={pensando}
                      className="flex items-center gap-3 rounded-r2 border border-line bg-panel px-3 py-2.5 text-left hover:bg-panel-3 disabled:opacity-60"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${["bg-up-wash text-up", "bg-warn-wash text-warn", "bg-info-wash text-info", "bg-brand-wash text-brand"][i] ?? "bg-brand-wash text-brand"}`}>
                        <Icone className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-[13px] text-ink">{s}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel className="p-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                <Database className="h-4 w-4 text-ink-3" />
                Como a resposta é feita
              </p>
              <p className="mt-1.5 text-[12.5px] text-ink-2 leading-relaxed">
                A conversa usa os dados atuais da empresa selecionada.
                Você pode conferir as consultas junto de cada resposta.
              </p>
            </Panel>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Bolha({
  mensagem,
  pensando,
}: {
  mensagem: Mensagem;
  pensando: boolean;
}) {
  if (mensagem.papel === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-r2 bg-info-wash text-ink text-[14px] leading-relaxed whitespace-pre-wrap break-words">
          {mensagem.texto}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-wash text-brand">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-2">
        {/* As consultas como blocos: o que foi lido para responder. */}
        {(mensagem.consultas?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {mensagem.consultas!.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-r1 border border-line bg-panel-2 px-2 py-1 text-[12px] text-ink-2"
              >
                <Database className="w-3.5 h-3.5 shrink-0 text-ink-3" strokeWidth={2} />
                {NOME_CONSULTA[c.nome] ?? c.nome}
                {resumoEntrada(c.entrada) && <span className="num text-ink-3">· {resumoEntrada(c.entrada)}</span>}
              </span>
            ))}
          </div>
        )}

        {mensagem.texto ? (
          <div className="rounded-r2 border border-line bg-panel px-3.5 py-2.5 text-[14px] text-ink leading-relaxed break-words flex flex-col gap-2">
            <Formatado texto={mensagem.texto} />
          </div>
        ) : (
          pensando && (
            <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Consultando os dados…
            </span>
          )
        )}
      </div>
    </div>
  );
}

/*
 * O Markdown que a IA escreve, e só ele: negrito, listas com "*"/"-",
 * listas numeradas, títulos com "#" e tabela com "|". Saía cru —
 * "**Mercado Livre**", "| Canal | Pedidos |" —, o que tornava a resposta
 * difícil de ler. Monta elementos do React em vez de HTML, então texto da
 * resposta nunca vira marcação.
 * ponytail: subconjunto à mão; se a IA passar a usar link ou código,
 * trocar por uma biblioteca de Markdown.
 */
function negrito(linha: string): React.ReactNode[] {
  return linha.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") && parte.length > 4 ? (
      <strong key={i} className="font-semibold">
        {parte.slice(2, -2)}
      </strong>
    ) : (
      parte
    )
  );
}

function Formatado({ texto }: { texto: string }) {
  const blocos: React.ReactNode[] = [];
  let lista: { ordenada: boolean; itens: string[] } | null = null;
  const fecharLista = () => {
    if (!lista) return;
    const Tag = lista.ordenada ? "ol" : "ul";
    blocos.push(
      <Tag key={blocos.length} className={cn("pl-5 flex flex-col gap-1", lista.ordenada ? "list-decimal" : "list-disc")}>
        {lista.itens.map((it, i) => (
          <li key={i}>{negrito(it)}</li>
        ))}
      </Tag>
    );
    lista = null;
  };

  let tabela: string[][] | null = null;
  const fecharTabela = () => {
    if (!tabela) return;
    const [cab, ...corpo] = tabela;
    blocos.push(
      <div key={blocos.length} className="overflow-x-auto rounded-r1 border border-line bg-panel">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[12px] font-semibold text-ink-2">
              {cab.map((c, i) => (
                <th key={i} className="px-3 py-1.5 whitespace-nowrap">
                  {negrito(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {corpo.map((l, i) => (
              <tr key={i} className="border-t border-line">
                {l.map((c, j) => (
                  <td key={j} className={cn("px-3 py-1.5", /^[\sR$\d.,%+\-–kmi]+$/.test(c) && "num text-right whitespace-nowrap")}>
                    {negrito(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tabela = null;
  };

  for (const bruta of texto.split("\n")) {
    const linha = bruta.trim();
    // Tabela: linhas com "|". A linha "|---|---|" só separa o cabeçalho.
    if (linha.startsWith("|") && linha.endsWith("|")) {
      fecharLista();
      if (/^\|[\s:|-]+\|$/.test(linha)) continue;
      (tabela ??= []).push(linha.slice(1, -1).split("|").map((c) => c.trim()));
      continue;
    }
    fecharTabela();
    const marcador = linha.match(/^[*-]\s+(.*)$/);
    const numero = linha.match(/^\d+[.)]\s+(.*)$/);
    if (marcador || numero) {
      const ordenada = Boolean(numero);
      if (lista && lista.ordenada !== ordenada) fecharLista();
      lista ??= { ordenada, itens: [] };
      lista.itens.push((marcador ?? numero)![1]);
      continue;
    }
    fecharLista();
    if (!linha) continue;
    const titulo = linha.match(/^#{1,4}\s+(.*)$/);
    blocos.push(
      titulo ? (
        <p key={blocos.length} className="font-semibold text-ink">
          {negrito(titulo[1])}
        </p>
      ) : (
        <p key={blocos.length}>{negrito(linha)}</p>
      )
    );
  }
  fecharLista();
  fecharTabela();
  return <>{blocos}</>;
}

/** "de 2026-08-01 a 2026-08-29 · por canal" — só o que ajuda a julgar. */
function resumoEntrada(e: Record<string, unknown>): string {
  const partes: string[] = [];
  if (e.de && e.ate) partes.push(`${e.de} a ${e.ate}`);
  if (e.agrupar) partes.push(`por ${e.agrupar}`);
  if (e.por) partes.push(`por ${e.por}`);
  if (e.canal) partes.push(String(e.canal));
  if (e.sku) partes.push(String(e.sku));
  if (e.mlb) partes.push(String(e.mlb));
  if (e.tipo) partes.push(String(e.tipo));
  if (e.semanas) partes.push(`${e.semanas} semanas`);
  return partes.join(" · ");
}
