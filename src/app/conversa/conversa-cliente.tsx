"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import { ErroComSaida } from "@/components/ui/leitura";
import { cn } from "@/lib/utils";
import { Send, Loader2, Database, Sparkles, RotateCcw } from "lucide-react";

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

  return (
    <>
      <PageHeader
        title="Conversar sobre a operação"
        breadcrumb="Operação"
        description="Pergunte em português — as respostas saem de consulta ao banco, não de resumo"
        actions={
          mensagens.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMensagens([]);
                setErro(null);
              }}
            >
              <RotateCcw className="w-3 h-3" strokeWidth={2.25} />
              Recomeçar
            </Button>
          ) : undefined
        }
      />

      <PageBody>
        <div className="flex flex-col gap-3 max-w-[780px] pb-2">
          {vazio && (
            <Panel className="p-5">
              <span className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-brand" strokeWidth={2} />
                <p className="text-[14px] font-semibold text-ink">
                  Pergunte sobre a operação
                </p>
              </span>
              <p className="text-[12.5px] text-ink-2 leading-relaxed mb-4">
                As respostas vêm de consulta ao banco no momento da pergunta —
                pedidos, anúncios, cancelamentos. Nada é resumido de antemão, e
                cada consulta feita aparece na tela para você julgar a resposta
                em vez de aceitá-la.
              </p>
              <div className="flex flex-col gap-1.5">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    onClick={() => perguntar(s)}
                    className="text-left text-[13px] text-ink-2 hover:text-ink px-3 py-2 rounded-r1 border border-line hover:border-line-2 bg-panel-2 hover:bg-panel-3 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Panel>
          )}

          {mensagens.map((m, i) => (
            <Bolha
              key={i}
              mensagem={m}
              pensando={pensando && i === mensagens.length - 1}
            />
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              perguntar(entrada);
            }}
            className="flex items-end gap-2 sticky bottom-0 bg-ground pt-2"
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
              placeholder="O que você quer entender?"
              disabled={pensando}
              className="flex-1 min-w-0 resize-none px-3 py-2.5 rounded-r1 bg-panel border border-line text-[13.5px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-wash disabled:opacity-60 max-h-[140px]"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={!entrada.trim() || pensando}
              className="h-[42px] px-3.5 shrink-0"
            >
              {pensando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" strokeWidth={2.25} />
              )}
            </Button>
          </form>
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
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-r2 bg-brand text-brand-ink text-[13.5px] leading-relaxed whitespace-pre-wrap">
          {mensagem.texto}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {(mensagem.consultas?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1">
          {mensagem.consultas!.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-3"
            >
              <Database className="w-3 h-3 shrink-0" strokeWidth={2} />
              {NOME_CONSULTA[c.nome] ?? c.nome}
              {resumoEntrada(c.entrada) && (
                <span className="num text-ink-3/80">
                  · {resumoEntrada(c.entrada)}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {mensagem.texto ? (
        <div className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap">
          {mensagem.texto}
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
  );
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
