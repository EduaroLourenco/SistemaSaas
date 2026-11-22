"use client";
import { gerizoFetch, useDemoMode } from "@/lib/demo/runtime";


import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button } from "@/components/ui/primitives";
import { ErroComSaida } from "@/components/ui/leitura";
import { cn } from "@/lib/utils";
import { Send, Loader2, Database, RotateCcw, ChevronRight } from "lucide-react";

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
  "O que mudou nas vendas de ontem?",
  "Quais envios estão atrasados?",
  "Quais promoções terminam esta semana?",
  "Quais anúncios têm visita e não vendem?",
];

const NOME_CONSULTA: Record<string, string> = {
  contexto_operacao: "Olhando o panorama da operação",
  vendas_por_periodo: "Consultando vendas",
  produtos_vendidos: "Consultando produtos",
  desempenho_anuncios: "Consultando desempenho dos anúncios",
  cancelamentos: "Consultando cancelamentos",
  envios_pendentes: "Consultando envios",
  promocoes_no_ar: "Consultando promoções",
};

const CHAVE_CONVERSA = "conversa-atual";

export default function Conversa() {
  const demo = useDemoMode();
  const chaveConversa = demo ? CHAVE_CONVERSA + ":demo" : CHAVE_CONVERSA;
  const sugestoes = demo ? ["Qual produto está perdendo vendas?", "Onde os Ads consomem margem?", "Que pedidos preciso despachar hoje?"] : SUGESTOES;
  const [mensagens, setMensagens] = React.useState<Mensagem[]>([]);
  const [entrada, setEntrada] = React.useState("");
  // Pergunta pronta vinda de outra tela (ex.: a apresentação): preenche, não envia — a pessoa revisa.
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("pergunta");
    if (p) setEntrada(p.slice(0, 1000));
  }, []);
  const [pensando, setPensando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aguardando, setAguardando] = React.useState<string | null>(null);
  const fim = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, pensando]);

  /* Sair para olhar outra tela não apaga a conversa. Trocar de empresa, sim. */
  React.useEffect(() => {
    try {
      const salva = sessionStorage.getItem(chaveConversa);
      if (salva) setMensagens(JSON.parse(salva));
    } catch {}
    const limpar = () => {
      try { sessionStorage.removeItem(chaveConversa); } catch {}
      setMensagens([]);
      setErro(null);
    };
    window.addEventListener("gerizo:operacao-trocada", limpar);
    return () => window.removeEventListener("gerizo:operacao-trocada", limpar);
  }, [chaveConversa]);
  React.useEffect(() => {
    if (pensando) return;
    try {
      if (mensagens.length) sessionStorage.setItem(chaveConversa, JSON.stringify(mensagens));
      else sessionStorage.removeItem(chaveConversa);
    } catch {}
  }, [mensagens, pensando, chaveConversa]);

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
      const res = await gerizoFetch("/api/conversa", {
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
      />

      <PageBody className="op-workspace op-conversa op-chat">
        <div className="mx-auto w-full max-w-[840px]">
          <Panel className="op-conversation flex flex-col overflow-hidden min-w-0">
            {!vazio && (
              <div className="flex justify-end border-b border-line px-4 py-2">
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
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-6 md:px-6" aria-live="polite" aria-busy={pensando}>
              {vazio && (
                <div data-gerizo-tour="perguntas-conversa" className="m-auto w-full max-w-xl py-6">
                  <h2 className="mb-5 text-[24px] font-semibold leading-8 tracking-tight text-ink">O que você quer saber?</h2>
                  <div className="grid gap-3 sm:grid-cols-2">{sugestoes.map((sugestao) => <button key={sugestao} type="button" onClick={() => perguntar(sugestao)} disabled={pensando} className="flex min-h-[76px] items-start justify-between gap-4 rounded-r2 border border-line bg-panel p-4 text-left text-[14px] leading-5 text-ink-2 hover:border-brand-edge hover:bg-brand-wash hover:text-brand disabled:opacity-60"><span>{sugestao}</span><ChevronRight size={16} className="mt-0.5 shrink-0" aria-hidden="true"/></button>)}</div>
                </div>
              )}

              {mensagens.map((m, i) => (
                <Bolha key={i} mensagem={m} pensando={pensando && i === mensagens.length - 1} />
              ))}

              {aguardando && (
                <span className="inline-flex items-center gap-2 text-[14px] text-warn">
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

            <div className="border-t border-line px-4 py-4 flex flex-col gap-3 md:px-6">
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
                  placeholder="Escreva sua pergunta"
                  disabled={pensando}
                  className="flex-1 min-w-0 resize-none px-3 py-2.5 rounded-r1 bg-panel-2 border border-line-2 text-[16px] md:text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-wash disabled:opacity-60 max-h-[140px]"
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
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-r2 bg-brand-wash text-ink text-[14px] leading-relaxed whitespace-pre-wrap break-words">
          {mensagem.texto}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
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
          <div className="px-0 py-1 text-[16px] text-ink leading-7 break-words flex flex-col gap-2">
            <Formatado texto={mensagem.texto} />
          </div>
        ) : (
          pensando && (
            <span className="inline-flex items-center gap-2 text-[14px] text-ink-3">
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
        <table className="w-full text-[14px]">
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
